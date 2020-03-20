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

interface Sink<T, Return, Config extends any[]> {
  [SinkSymbol]: true,
  accept(value: T): Sink<T, Return, Config>,
  resolve(): Return,
}
type ArraySink<T> = Sink<T, Array<T>, [{after: InputWire<unknown>}?]>

declare function createArraySink<T>(): ArraySink<T>;

class SinkRef<T> {}

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
      [K in keyof Injects]: SinkRef<Injects[K]>;
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

type ConfigurableAndInjectableKeys<Structure> = OnlyConfigurableKeys<Structure> & RequiredInjectKeys<Structure>;
type OnlyOnlyConfigurableKeys<Structure> = Exclude<OnlyConfigurableKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type OnlyInjectableKeys<Structure> = Exclude<RequiredInjectKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type NonConfigurableNonInjectableKeys<Structure> = Exclude<keyof Structure, ConfigurableAndInjectableKeys<Structure> | OnlyOnlyConfigurableKeys<Structure> | OnlyInjectableKeys<Structure>>

type SystemConfig<Structure> = {
  [K in NonConfigurableNonInjectableKeys<Structure>]?: {
    disabled?: boolean,
  }
} & {
  [K in OnlyOnlyConfigurableKeys<Structure>]: {
    config: GetDeps<Structure[K]>;
    disabled?: boolean,
  };
} &
  {
    [K in OnlyInjectableKeys<Structure>]: {
      inject: GetInjects<Structure[K]>;
      disabled?: boolean,
    }
  } &
  {
    [K in ConfigurableAndInjectableKeys<Structure>]: {
      config: GetDeps<Structure[K]>;
      inject: GetInjects<Structure[K]>;
      disabled?: boolean,
    }
  };

type ConfiguredSystem<Structure> = {
  currentConfig: SystemConfig<Structure>;
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
  out<Key extends keyof GetSinks<Structure>>(key: Key, ...config: GetSinks<Structure>[Key]['config']): SinkRef<GetSinks<Structure>[Key]['value']>
};

declare var fac: WireFactory<TestStructure>;

type System<Structure> = {
  configure(
    closure: (wire: WireFactory<Structure>) => SystemConfig<Structure>
  ): ConfiguredSystem<Structure>;
};

declare function createSystem<Structure>(
  structure: Structure
): System<Structure>;
declare function createModule<T, Deps, Injects>(): Module<T, Deps, Injects>;

const AuthModule = createModule<
  void,
  {
    db: string
  },
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
    middlewares: ReadonlyArray<(req: any, next: () => void) => void>
    host: string;
    port: number;
    tuple: [string, Date, number];
    array: string[];
    nested: { config: Date };
  }) => ({
    start: () => console.log(config)
  }),
  middlewares: createArraySink<(req: any, next: () => void) => void>(),
  auth: AuthModule,
});

const configuredSystem = testSystem.configure(wire => ({
  server: {
    config: {
      middlewares: wire.in('middlewares'),
      host: wire.in("constant"),
      port: 123,
      array: [wire.in("constant"), "123"],
      tuple: [wire.in('constant').map(s => s.toUpperCase()), wire.in("date"), wire.in("date").map(d => d.getTime())],
      nested: {
        config: wire.in("date")
      }
    }
  },
  auth: {
    config: {
      db: wire.in('constant')
    },
    inject: {
      middleware: wire.out('middlewares')
    }
  }
}));
