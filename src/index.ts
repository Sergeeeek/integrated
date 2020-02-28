class InputWire<T> {
  constructor(private prop: string, private mapper: Function) {}

  get optional(): InputWire<void | T> {
    return new InputWire<void | T>(this.prop, this.mapper);
  }

  map<U>(mapper: (value: T) => U): InputWire<U> {
    return new InputWire<U>(this.prop, (value: T) => mapper(this.mapper(value)));
  }
}

const SinkSymbol = Symbol();

interface Sink<T, Config> {
  [SinkSymbol]: true,
}
type ArraySink<T> = Sink<T, {after: InputWire<unknown>} | never>

declare function createArraySink<T>(): ArraySink<T>;

class SinkRef<T> {}

type RecursiveRef<Deps> = {
  [K in keyof Deps]:
    | RecursiveRef<Deps[K]>
    | InputWire<Deps[K] | RecursiveRef<Deps[K]>>;
};

type RecursiveTest = RecursiveRef<{
  value: string;
  tuple: [string, number];
  array: string[];
  nested: {
    test: string;
  };
}>;

declare var recursiveTest: RecursiveTest;

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

type GetExtraInjects<T> = T extends Module<unknown, unknown, infer Injects>
  ? {
      [K in keyof Injects]: SinkRef<Injects[K]>;
    }
  : never;

// type GetInjects<T> = T extends Module<infer Main, unknown, unknown>
//   ? {
//       default?: SinkRef<Main>;
//     } & GetExtraInjects<T>
//   : T extends (deps: unknown) => infer Main
//   ? {
//       default?: SinkRef<Main>;
//     }
//   : { default?: SinkRef<T> };

type ConfigurableThing = (
  deps: unknown
) => unknown | Module<unknown, unknown, unknown>;

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type Asdf = RequiredKeys<{ optional?: string }> extends never ? false : true;

type OnlyConfigurableKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends ConfigurableThing ? K : never;
}[keyof Structure];
type NonConfigurableKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends ConfigurableThing ? never : K;
}[keyof Structure];
type OnlyRequiredInjectKeys<Structure> = {
  [K in keyof Structure]: RequiredKeys<
    GetExtraInjects<Structure[K]>
  > extends never
    ? never
    : K;
}[keyof Structure];
type OnlyNonRequiredInjectKeys<Structure> = {
  [K in keyof Structure]: RequiredKeys<
    GetExtraInjects<Structure[K]>
  > extends never
    ? K
    : never;
}[keyof Structure];

type OnlyConfigurable<T> = Pick<T, OnlyConfigurableKeys<T>>;
type NonConfigurable<T> = Pick<T, NonConfigurableKeys<T>>;
type HasRequiredInjects<T> = Pick<T, OnlyRequiredInjectKeys<T>>;
type HasOptionalInjects<T> = Pick<T, OnlyNonRequiredInjectKeys<T>>;

type SystemConfig<Structure> = {
  [K in keyof OnlyConfigurable<Structure>]: {
    config: GetDeps<Structure[K]>;
    disabled?: boolean;
  };
} &
  {
    [K in keyof NonConfigurable<Structure>]?: {
      disabled?: boolean;
    };
  };

type ConfiguredSystem<Structure> = {
  currentConfig: SystemConfig<Structure>;
  start(): void;
};

type OnlySinkKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<unknown, unknown>
    ? K
    : never;
}[keyof Structure];

type SinkTypes<T extends {[key: string]: Sink<unknown, unknown>} = {}> = {
  [K in keyof T]: T[K] extends Sink<infer V, infer Config> ? {value: V, config: Config} : never
}

type GetSinks<Structure> = SinkTypes<Pick<Structure, OnlySinkKeys<Structure>>>

type TestStructure = {asdf: string, sink: Sink<number, Array<number>>, array: ArraySink<string>};
type Test = GetSinks<TestStructure>

type WireFactory<Structure> = {
  in<Key extends keyof Structure>(key: Key): InputWire<Structure[Key]>,
  out<Key extends keyof GetSinks<Structure>>(key: Key, config: GetSinks<Structure>[Key]['config']): SinkRef<GetSinks<Structure>[Key]['value']>
};

declare var fac: WireFactory<TestStructure>;

fac.out('array')

type System<Structure> = {
  configure(
    closure: (wire: WireFactory<Structure>) => SystemConfig<Structure>
  ): ConfiguredSystem<Structure>;
};

declare function createSystem<Structure>(
  structure: Structure
): System<Structure>;
declare function createModule<T, Deps, Injects>(): Module<T, Deps, Injects>;

const testInjectModule = createModule<
  void,
  void,
  { middleware: (req: any, next: () => void) => void }
>();

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
  sink: createArraySink<(req: any, next: () => void) => void>(),
  test: testInjectModule
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
  test: {
    inject: {
      middleware: wire.out('sink', undefined)
    }
  }
}));
