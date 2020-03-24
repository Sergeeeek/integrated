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

function isInputWire(value: any): value is InputWire<any> {
  return value instanceof InputWire;
}

const SinkSymbol = Symbol();

interface Sink<TAccept, TReturn, TConfig extends any[]> {
  [SinkSymbol]: true;
  accept(value: TAccept): Sink<TAccept, TReturn, TConfig>;
  resolve(): TReturn;
}

function isSink(value: any): value is Sink<any, any, any> {
  if (value === undefined || value === null) {
    return false;
  }

  return typeof value === 'object' && Boolean(value[SinkSymbol]);
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
    this.prop = prop;
    this.config = config;
  }
}

function isSinkRef(value: any): value is SinkRef<any, any> {
  return value instanceof SinkRef;
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

type FindDeepResult<Search> = ReadonlyArray<{path: (string | number | symbol)[]; value: Search}>;

function findDeep<T, TSearch>(obj: T, predicate: (value: any) => value is TSearch, path: (string | symbol | number)[] = []): FindDeepResult<TSearch> {
  if (predicate(obj)) {
    return [{path: path, value: obj}];
  }

  if (Array.isArray(obj)) {
    return flatten(obj.map((elem, index) => findDeep(elem, predicate, [...path, index])));
  }

  if (isPrimitive(obj)) {
    return [];
  }

  if (obj instanceof Object) {
    return flatten(
      Object.getOwnPropertyNames(obj)
        .map(prop => findDeep((obj as any)[prop], predicate, [...path, prop]))
    );
  }

  // Don't know how to traverse that
  return [];
}

function createDependencyGraph(definitions: ReadonlyArray<readonly [string, {inputs: FindDeepResult<InputWire<any>>, outputs: FindDeepResult<SinkRef<any, any>>}]>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  definitions.forEach(([moduleName, {inputs, outputs}]) => {
    inputs.forEach(dep => edges.push([dep.value.prop, moduleName]));

    outputs.forEach(sinkRef => {
      const sinkProp = sinkRef.value.prop;

      // Sink is going to be initialized at '${sinkProp}_start_RESERVED'.
      // To put a value in a sink module will depend on its start point node.
      // To make sure all sink values are initialized before the sink is used,
      // module will be a dependency of sink "end" graph node. if you depend on sink "end",
      // you can be sure that all things that all SinkRefs for that sink are resolved
      edges.push([`${sinkProp}_start_RESERVED`, moduleName])
      edges.push([moduleName, sinkProp]);
    });
  });

  return edges;
}

function fromPairs<U>(input: ReadonlyArray<readonly [string, U]>): {[key: string]: U} {
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
          const moduleDepsPairs: (readonly [
            string,
            {
              inputs: FindDeepResult<InputWire<any>>,
              outputs: {

              },
            }
          ])[] = Object.getOwnPropertyNames(config).map((moduleName) => [moduleName, {
            inputs: findDeep(config, isInputWire),
            outputs: findDeep(config, isSinkRef),
          }] as const);
          const moduleDepsMap = fromPairs(moduleDepsPairs);

          const nodes = Object.getOwnPropertyNames(structure);
          const dependencyGraph = createDependencyGraph(moduleDepsPairs);
          console.log(moduleDepsMap);

          const sortedModules: string[] = toposortArray(nodes, dependencyGraph);

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

              for (const dep of moduleDepsMap[module as string].inputs) {
                const setAny: any = set;
                deps = setAny(...dep.path)(dep.value.mapper(context[dep.value.prop]))(deps);
              }
            }

            if (typeof currentModule === 'function') {
              context[module] = currentModule(deps);
            } else if (isModule(currentModule)) {
              const instance = currentModule.create(deps);
              context[module] = instance;

              if (currentModule.inject) {
                const injects = currentModule.inject(instance, deps);

                moduleDepsMap[module].outputs.forEach(output => {
                  const maybeSink = context[output.value.prop];

                  if (isSink(maybeSink)) {
                    maybeSink.accept()
                  } else {
                    throw new Error(`Tried to inject a value from "${module}" into "${output.value.prop}, but "${output.value.prop} is not a Sink"`)
                  }
                })
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
