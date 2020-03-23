import {array as toposortArray} from 'toposort';
import {set} from 'shades';

class InputWire<T> {
  constructor(public readonly prop: string, public readonly mapper: Function) {}

  get optional(): InputWire<void | T> {
    return new InputWire<void | T>(this.prop, this.mapper);
  }

  map<U>(mapper: (value: T) => U): InputWire<U> {
    return new InputWire<U>(this.prop, (value: T) => mapper(this.mapper(value)));
  }
}

const SinkSymbol = Symbol();

interface Sink<TAccept, TReturn, TConfig extends any[]> {
  [SinkSymbol]: true;
  accept(value: TAccept): Sink<TAccept, TReturn, TConfig>;
  resolve(): TReturn;
}
type ArraySinkConfig = {after: InputWire<any>}
type ArraySink<T> = Sink<T, Array<T>, [ArraySinkConfig?]>

function createArraySink<T>(entries?: ReadonlyArray<[T, ArraySinkConfig?]>): ArraySink<T> {
  return {
    [SinkSymbol]: true,
    accept(value: T, config?: ArraySinkConfig) {
      return createArraySink([...entries, [value, config]]);
    },
    resolve() {
      return entries.map(([value]) => value);
    }
  };
}

class SinkRef<T, Config extends any[]> {
  readonly config: Config;
  constructor(public readonly prop: string, ...config: Config) {
    this.config = config;
  }
}

type RecursiveRef<Deps> = {
  [K in keyof Deps]:
    | RecursiveRef<Deps[K]>
    | InputWire<Deps[K] | RecursiveRef<Deps[K]>>;
};

type GetDeps<T> = T extends (config: infer V) => any
  ? RecursiveRef<V>
  : T extends Module<any, infer V, any>
  ? RecursiveRef<V>
  : never;

const ModuleSymbol = Symbol();

interface ModuleDefinition<T, Deps, Injects> {
  create(deps: Deps): T;
  inject?: (instance: T, deps: Deps) => Injects;
}

interface Module<T, Deps, Injects> extends ModuleDefinition<T, Deps, Injects> {
  [ModuleSymbol]: true;
}

function createModule<T, Deps, Injects>(definition: ModuleDefinition<T, Deps, Injects>): Module<T, Deps, Injects> {
  return {
    [ModuleSymbol]: true,
    ...definition,
  };
}

function isModule(value: any): value is Module<any, any, any> {
  if (value === undefined || value === null) {
    return false;
  }

  return Boolean(value[ModuleSymbol]);
}

type GetInjects<T> = T extends Module<any, any, infer Injects>
  ? {
      [K in keyof Injects]: SinkRef<Injects[K], any[]>;
    }
  : never;

type ConfigurableThing = ((deps: any) => any) | Module<any, any, any>;
type InjectableThing = Module<any, any, {}>;

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type ConfigurableKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends ConfigurableThing ? K : never;
}[keyof Structure];
type InjectableKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends InjectableThing
    ? K
    : never;
}[keyof Structure];

type ConfigurableAndInjectableKeys<Structure> = Extract<ConfigurableKeys<Structure>, InjectableKeys<Structure>> | Extract<InjectableKeys<Structure>, ConfigurableKeys<Structure>>;
type OnlyConfigurableKeys<Structure> = Exclude<ConfigurableKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type OnlyInjectableKeys<Structure> = Exclude<InjectableKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type NonConfigurableNonInjectableKeys<Structure> = Exclude<keyof Structure, ConfigurableAndInjectableKeys<Structure> | OnlyConfigurableKeys<Structure> | OnlyInjectableKeys<Structure>>

type SystemConfig<Structure> =
  {
    [K in NonConfigurableNonInjectableKeys<Structure>]?: {
      disabled?: boolean;
    }
  } & {
    [K in OnlyConfigurableKeys<Structure>]: {
      config: GetDeps<Structure[K]>;
      disabled?: boolean;
    };
  } & {
    [K in OnlyInjectableKeys<Structure>]: {
      inject: GetInjects<Structure[K]>;
      disabled?: boolean;
    }
  } & {
    [K in ConfigurableAndInjectableKeys<Structure>]: {
      config: GetDeps<Structure[K]>;
      inject: GetInjects<Structure[K]>;
      disabled?: boolean;
    }
  };

type ConfiguredSystem<Structure> = {
  readonly config: SystemConfig<Structure>;
  start(): void;
};

type OnlySinkKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<any, any, any[]>
    ? K
    : never;
}[keyof Structure];

type SinkTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<infer V, infer R, infer Config> ? {value: V; return: R; config: Config} : never
}

type GetSinks<Structure> = SinkTypes<Pick<Structure, OnlySinkKeys<Structure>>>

type TestStructure = {
  asdf: string;
  sink: Sink<number, Array<number>, []>;
  array: ArraySink<string>;
  module: Module<void, {dep: string}, {test: string}>;
};
type Test = GetSinks<TestStructure>

type MapToResultTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<any, infer Return, any[]> ? Return : Structure[K]
}

type WireFactory<Structure> = {
  in<Key extends keyof Structure>(key: Key): InputWire<MapToResultTypes<Structure>[Key]>;
  out<Key extends keyof GetSinks<Structure>>(key: Key, ...config: GetSinks<Structure>[Key]['config']): SinkRef<GetSinks<Structure>[Key]['value'], GetSinks<Structure>[Key]['config']>;
};

type System<Structure> = {
  configure(
    closure: (wire: WireFactory<Structure>) => SystemConfig<Structure>
  ): ConfiguredSystem<Structure>;
};

// declare function createSystem<Structure>(
//   structure: Structure
// ): System<Structure>;

function isPrimitive(v: any): v is (string | number | boolean | undefined | null | symbol | Function) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'symbol' || typeof v === 'function' || v === undefined || v === null;
}

function flatten<T>(array: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<T> {
  return array.reduce((acc, next) => acc.concat(next), []);
}

type ModuleDepsAndPaths = ReadonlyArray<{path: (string | number | symbol)[]; dep: InputWire<any>}>;

function getConfigDeps<T>(config: T, path: (string | symbol | number)[] = []): ModuleDepsAndPaths {
  if (config instanceof InputWire) {
    return [{path: path, dep: config}];
  }

  if (Array.isArray(config)) {
    return flatten(config.map((elem, index) => getConfigDeps(elem, [...path, index])));
  }

  if (isPrimitive(config)) {
    return [];
  }

  if (config instanceof Object) {
    return flatten(
      Object.getOwnPropertyNames(config)
        .map(prop => getConfigDeps((config as any)[prop], [...path, prop]))
    );
  }

  // Don't know how to traverse that
  return [];
}

function createDependencyGraph(definitions: ReadonlyArray<[string, ModuleDepsAndPaths]>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  definitions.forEach(([moduleName, deps]) => {
    deps.forEach(dep => edges.push([dep.dep.prop, moduleName]));
  });

  return edges;
}

function fromPairs<U>(input: ReadonlyArray<[string, U]>): {[key: string]: U} {
  return input.reduce<{[key: string]: U}>((acc, [key, val]) => {
    return {
      ...acc,
      [key]: val
    }
  }, {});
}

function createSystem<Structure>(structure: Structure): System<Structure> {
  return {
    configure(closure) {
      const wireFactory: WireFactory<Structure> = {
        in(key) {
          return new InputWire(key as string, (id: any) => id);
        },
        out(key, ...config) {
          return new SinkRef(key as string, ...config);
        }
      };

      const config = closure(wireFactory);
      console.log(config);

      return {
        config,
        start() {
          const moduleDepsPairs: ReadonlyArray<[
            string,
            ModuleDepsAndPaths
          ]> = Object.getOwnPropertyNames(config).map((moduleName): [string, ModuleDepsAndPaths] => [moduleName, getConfigDeps((config as any)[moduleName] && (config as any)[moduleName].config)]);
          const moduleDepsMap = fromPairs(moduleDepsPairs);

          const nodes = Object.getOwnPropertyNames(structure);
          const dependencyGraph = createDependencyGraph(moduleDepsPairs);
          console.log(moduleDepsMap);

          const sortedModules: (keyof Structure)[] = toposortArray(nodes, dependencyGraph);

          const context: Partial<MapToResultTypes<Structure>> = {};
          const weakTypeConfig: {
            [K in (string | number | symbol)]?: SystemConfig<Structure>[keyof SystemConfig<Structure>]
          } = config;

          for (const module of sortedModules) {
            const currentModule = structure[module];
            const moduleConfig = weakTypeConfig.hasOwnProperty(module) ? weakTypeConfig[module] : undefined;
            let deps: any;

            if (moduleConfig && moduleConfig.config) {
              deps = moduleConfig.config;

              for (const dep of moduleDepsMap[module as string]) {
                const setAny: any = set;
                deps = setAny(...dep.path)(dep.dep.mapper(context[dep.dep.prop]))(deps);
              }
            }

            if (typeof currentModule === 'function') {
              context[module] = currentModule(deps);
            } else if (isModule(currentModule)) {
              const instance = currentModule.create(deps);
              context[module] = instance;

              if (currentModule.inject) {
                const injects = currentModule.inject(instance, deps);
              }
            } else {
              context[module] = currentModule as any;
            }
          }
        }
      }
    }
  }
}

const testSystem = createSystem({
  constant: "asdf",
  date: new Date(),
  server: (config: {
    host: string;
    port: number;
    tuple: [string, Date, number];
    array: string[];
    nested: { config: Date };
  }) => ({
    start: () => console.log(config)
  }),
});

const configuredSystem = testSystem.configure(wire => ({
  server: {
    config: {
      host: wire.in("constant"),
      port: 123,
      array: [wire.in("constant"), "123"],
      tuple: [wire.in('constant').map(s => s.toUpperCase()), wire.in("date"), wire.in("date").map(d => d.getTime())],
      nested: {
        config: wire.in("date")
      }
    }
  },
}));

configuredSystem.start();
