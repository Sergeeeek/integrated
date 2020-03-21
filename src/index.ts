import {array as toposortArray} from 'toposort';

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

interface Sink<T, Return, Config extends any[]> {
  [SinkSymbol]: true,
  accept(value: T): Sink<T, Return, Config>,
  resolve(): Return,
}
type ArraySink<T> = Sink<T, Array<T>, [{after: InputWire<unknown>}?]>

declare function createArraySink<T>(): ArraySink<T>;

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

type GetDeps<T> = T extends (config: infer V) => unknown
  ? RecursiveRef<V>
  : T extends Module<unknown, infer V, unknown>
  ? RecursiveRef<V>
  : never;

interface Module<T, Deps, Injects> {
  deps: Deps;
  create(deps: Deps): T;
  inject?: (instance: T, deps: Deps) => Injects;
}

type GetInjects<T> = T extends Module<unknown, unknown, infer Injects>
  ? {
      [K in keyof Injects]: SinkRef<Injects[K], any[]>;
    }
  : never;

type ConfigurableThing = Module<unknown, unknown, unknown> | ((deps: unknown) => unknown);
type InjectableThing = Module<unknown, unknown, {}>;

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];
type OptionalKeys<T> = {
  [K in keyof T]-?: T[K] extends void ? K : never;
}[keyof T];

type Asdf = RequiredKeys<{ optional?: string }> extends never ? false : true;

type OnlyConfigurableKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends ConfigurableThing ? K : never;
}[keyof Structure];
type RequiredInjectKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends InjectableThing
    ? K
    : never;
}[keyof Structure];

type OnlyConfigurable<T> = Pick<T, OnlyConfigurableKeys<T>>;
type HasRequiredInjects<T> = Pick<T, RequiredInjectKeys<T>>;

type CommonConfig<Structure> = {
  [K in keyof Structure]?: {
    disabled?: boolean,
  }
}

type ConfigurableAndInjectableKeys<Structure> = Extract<OnlyConfigurableKeys<Structure>, RequiredInjectKeys<Structure>> | Extract<RequiredInjectKeys<Structure>, OnlyConfigurableKeys<Structure>>;
type OnlyOnlyConfigurableKeys<Structure> = Exclude<OnlyConfigurableKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type OnlyInjectableKeys<Structure> = Exclude<RequiredInjectKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type NonConfigurableNonInjectableKeys<Structure> = Exclude<keyof Structure, ConfigurableAndInjectableKeys<Structure> | OnlyOnlyConfigurableKeys<Structure> | OnlyInjectableKeys<Structure>>

type SystemConfig<Structure> =
  {
    [K in NonConfigurableNonInjectableKeys<Structure>]?: {
      disabled?: boolean,
    }
  } & {
    [K in OnlyOnlyConfigurableKeys<Structure>]: {
      config: GetDeps<Structure[K]>;
      disabled?: boolean,
    };
  } & {
    [K in OnlyInjectableKeys<Structure>]: {
      inject: GetInjects<Structure[K]>;
      disabled?: boolean,
    }
  } & {
    [K in ConfigurableAndInjectableKeys<Structure>]: {
      config: GetDeps<Structure[K]>;
      inject: GetInjects<Structure[K]>;
      disabled?: boolean,
    }
  };

type ConfiguredSystem<Structure> = {
  readonly config: SystemConfig<Structure>;
  start(): void;
};

type OnlySinkKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<unknown, unknown, any[]>
    ? K
    : never;
}[keyof Structure];

type SinkTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<infer V, infer R, infer Config> ? {value: V, return: R, config: Config} : never
}

type GetSinks<Structure> = SinkTypes<Pick<Structure, OnlySinkKeys<Structure>>>

type TestStructure = {
  asdf: string,
  sink: Sink<number, Array<number>, []>,
  array: ArraySink<string>
  module: Module<void, {dep: string}, {test: string}>
};
type Test = GetSinks<TestStructure>

type VoidableKeys<T> = {
  [K in keyof T]-?: T[K] extends void ? K : never
}[keyof T];

type MapToResultTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<unknown, infer Return, any[]> ? Return : Structure[K]
}

type WireFactory<Structure> = {
  in<Key extends keyof Structure>(key: Key): InputWire<MapToResultTypes<Structure>[Key]>,
  out<Key extends keyof GetSinks<Structure>>(key: Key, ...config: GetSinks<Structure>[Key]['config']): SinkRef<GetSinks<Structure>[Key]['value'], GetSinks<Structure>[Key]['config']>
};

declare var fac: WireFactory<TestStructure>;

type System<Structure> = {
  configure(
    closure: (wire: WireFactory<Structure>) => SystemConfig<Structure>
  ): ConfiguredSystem<Structure>;
};

// declare function createSystem<Structure>(
//   structure: Structure
// ): System<Structure>;

function isPrimitive(v: unknown): v is (string | number | boolean | undefined | null | symbol | Function) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'symbol' || typeof v === 'function' || v === undefined || v === null;
}

function flatten<T>(array: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<T> {
  return array.reduce((acc, next) => acc.concat(next));
}

function getConfigDeps<T>(config: T): ReadonlyArray<InputWire<unknown>> {
  if (config instanceof InputWire) {
    return [config];
  }

  if (Array.isArray(config)) {
    return flatten(config.map(getConfigDeps));
  }

  if (isPrimitive(config)) {
    return [];
  }

  if (config instanceof Object) {
    return flatten(
      Object.getOwnPropertyNames(config)
        .map(prop => getConfigDeps(config[prop]))
    );
  }

  // Don't know how to traverse that
  return [];
}

function createDependencyGraph(definitions: ReadonlyArray<[string, ReadonlyArray<InputWire<unknown>>]>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  definitions.forEach(([moduleName, deps]) => {
    deps.forEach(dep => edges.push([dep.prop, moduleName]));
  });

  return edges;
}

function createSystem<Structure>(structure: Structure): System<Structure> {
  return {
    configure(closure) {
      const wireFactory: WireFactory<Structure> = {
        in(key) {
          return new InputWire(key as string, id => id);
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
            ReadonlyArray<InputWire<unknown>>
          ]> = Object.getOwnPropertyNames(config).map((moduleName): [string, ReadonlyArray<InputWire<unknown>>] => [moduleName, getConfigDeps(config[moduleName].config)]);

          const nodes = Object.getOwnPropertyNames(structure);
          const dependencyGraph = createDependencyGraph(moduleDepsPairs);

          console.log(toposortArray(nodes, dependencyGraph));
        }
      }
    }
  }
}

// declare function createModule<T, Deps, Injects>(): Module<T, Deps, Injects>;
//
// const AuthModule = createModule<
//   void,
//   {
//     db: string
//   },
//   { middleware: (req: any, next: () => void) => void }
// >();

type refTest = RecursiveRef<{
  host: string;
  port: number;
  tuple: [string, Date, number];
  array: string[];
  nested: { config: Date };
}>;

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
