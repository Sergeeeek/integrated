class Ref<T> {
  constructor(private prop: string, private mapper: Function) {}

  get optional(): Ref<void | T> {
    return new Ref<void | T>(this.prop, this.mapper);
  }

  map<U>(mapper: (value: T) => U): Ref<U> {
    return new Ref<U>(this.prop, (value: T) => mapper(this.mapper(value)));
  }
}

class Sink<T, Storage> {
  storage: Storage;
}

class ArraySink<T> extends Sink<T, Array<T>> {}

class SinkRef<T> {}

type RecursiveRef<Deps> = {
  [K in keyof Deps]:
    | RecursiveRef<Deps[K]>
    | Ref<Deps[K] | RecursiveRef<Deps[K]>>;
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
  } &
  {
    [K in keyof (OnlyConfigurable<Structure> &
      OnlyNonRequiredInjects<Structure>)]: {
      inject?: GetExtraInjects<Structure[K]>;
    };
  } &
  {
    [K in keyof (OnlyConfigurable<Structure> &
      OnlyRequiredInjects<Structure>)]: {
      inject: GetExtraInjects<Structure[K]>;
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

type System<Structure> = {
  configure(
    closure: (
      ref: <Key extends keyof Structure>(key: Key) => Ref<Structure[Key]>,
      sink: {
        array: <Key extends OnlySinkKeys<Structure>>(
          key: Key
        ) => Structure[Key] extends Sink<infer T, unknown> ? SinkRef<T> : never;
      }
    ) => SystemConfig<Structure>
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
  sink: new ArraySink<(req: any, next: () => void) => void>(),
  test: testInjectModule
});

const configuredSystem = testSystem.configure((ref, sink) => ({
  server: {
    config: {
      host: ref("constant"),
      port: 123,
      array: [ref("constant"), "123"],
      tuple: ["asdf", ref("date"), ref("date").map(d => d.getTime())],
      nested: {
        config: ref("date")
      }
    }
  },
  test: {
    inject: {
      middleware: sink.array("sink")
    }
  }
}));
