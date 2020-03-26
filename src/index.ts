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

function isInputWire(value: unknown): value is InputWire<unknown> {
  return value instanceof InputWire;
}

const SinkSymbol = Symbol();

interface Sink<TAccept, TReturn, TConfig extends unknown[]> {
  [SinkSymbol]: true;
  accept(value: TAccept, ...config: TConfig): Sink<TAccept, TReturn, TConfig>;
  resolve(): TReturn;
}

function isSink(value: unknown): value is Sink<unknown, unknown, unknown[]> {
  if (value === undefined || value === null) {
    return false;
  }

  return typeof value === 'object' && Boolean(value[SinkSymbol]);
}

type ArraySinkConfig = {after: InputWire<unknown>}
type ArraySink<T> = Sink<T, Array<T>, [ArraySinkConfig?]>

function createArraySink<T>(entries: ReadonlyArray<[T, ArraySinkConfig?]> = []): ArraySink<T> {
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

class SinkRef<T, Config extends unknown[]> {
  readonly config: Config;
  constructor(public readonly prop: string, ...config: Config) {
    this.prop = prop;
    this.config = config;
  }
}

function isSinkRef(value: unknown): value is SinkRef<unknown, unknown[]> {
  return value instanceof SinkRef;
}

type RecursiveRef<Deps> = Deps extends never ? never : {
  [K in keyof Deps]:
    | RecursiveRef<Deps[K]>
    | InputWire<Deps[K] | RecursiveRef<Deps[K]>>;
};

type GetDeps<T> = T extends (config: infer V) => unknown
  ? RecursiveRef<V>
  : T extends Module<unknown, infer V, unknown>
  ? RecursiveRef<V>
  : never;

const ModuleSymbol = Symbol();

interface ModuleDefinition<T, Deps, Injects> {
  start(deps: Deps): T;
  stop?: (instance: T) => void,
  inject?: (instance: T, deps: Deps) => Injects;
}

interface Module<T, Deps, Injects> extends ModuleDefinition<T, Deps, Injects> {
  [ModuleSymbol]: true;
}

function createModule<T, Deps = never, Injects = never>(definition: ModuleDefinition<T, Deps, Injects>): Module<T, Deps, Injects> {
  return {
    [ModuleSymbol]: true,
    ...definition,
  };
}

function isModule(value: unknown): value is Module<unknown, unknown, unknown> {
  if (value === undefined || value === null) {
    return false;
  }

  return Boolean(value[ModuleSymbol]);
}

type GetInjects<T> = T extends Module<unknown, unknown, infer Injects>
  ? {
      [K in keyof Injects]: SinkRef<Injects[K], unknown[]>;
    }
  : never;

type ConfigurableThing = ((...deps: unknown[]) => unknown) | Module<unknown, unknown, unknown>;
type InjectableThing = Module<unknown, unknown, {[key: string]: unknown}>;

type ConfigurableKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends ConfigurableThing ? K : never;
}[keyof Structure];
type InjectableKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends InjectableThing
    ? K
    : never;
}[keyof Structure];

type ConfigurableOrInjectableKeys<Structure> = ConfigurableKeys<Structure> | InjectableKeys<Structure>;
type ConfigurableAndInjectableKeys<Structure> = Extract<ConfigurableKeys<Structure>, InjectableKeys<Structure>> | Extract<InjectableKeys<Structure>, ConfigurableKeys<Structure>>;
type OnlyConfigurableKeys<Structure> = Exclude<ConfigurableKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type OnlyInjectableKeys<Structure> = Exclude<InjectableKeys<Structure>, ConfigurableAndInjectableKeys<Structure>>;
type NonConfigurableNonInjectableKeys<Structure> = Exclude<keyof Structure, ConfigurableOrInjectableKeys<Structure>>

type NonNeverAndNonEmptyKeys<T> = {
  [K in keyof T]: T[K] extends never ? never : {} extends T[K] ? never : K
}[keyof T];

type RemoveNeverAndEmpty<T> = Pick<T, NonNeverAndNonEmptyKeys<T>>

type NonRequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type NonRequiredNestedKeys<T> = {
  [K in keyof T]: NonRequiredKeys<T[K]>
}

type PropagateOptional<T> = {
  [K in keyof NonRequiredNestedKeys<T>]?: T[K]
} & {
  [K in Exclude<keyof T, keyof NonRequiredNestedKeys<T>>]: T[K]
}

type SystemConfig<Structure> = PropagateOptional<
  {
    [K in keyof Structure]: RemoveNeverAndEmpty<{
      disabled?: boolean,
      config: GetDeps<Structure[K]>,
      inject: GetInjects<Structure[K]>,
    }>
  }
>;
//   {
//     [K in NonConfigurableNonInjectableKeys<Structure>]?: {
//       disabled?: boolean;
//     }
//   } & {
//     [K in ConfigurableOrInjectableKeys<Structure>]: RemoveNever<{
//       config: GetDeps<Structure[K]>;
//       inject: GetInjects<Structure[K]>;
//       disabled?: boolean;
//     }>
//   }
// ;

const SystemMetaSymbol = Symbol();
type SystemMeta<Structure> = {
  readonly sortedModules: string[],
  readonly creator: ConfiguredSystem<Structure>
};
type RunningSystemContext<Structure> = MapToResultTypes<Structure> & {
  [SystemMetaSymbol]: SystemMeta<Structure>,
};

interface ConfiguredSystem<Structure> extends Module<RunningSystemContext<Structure>, never, never> {
  readonly definition: Structure;
  readonly config: SystemConfig<Structure>;
  start(): RunningSystemContext<Structure>;
  stop(instance: RunningSystemContext<Structure>): void,
};

type Test = ConfiguredSystem<{}> extends Module<infer T, unknown, unknown> ? T : never;

type OnlySinkKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<unknown, unknown, unknown[]>
    ? K
    : never;
}[keyof Structure];

type SinkTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<infer V, infer R, infer Config> ? {value: V; return: R; config: Config} : never
}

type GetSinks<Structure> = SinkTypes<Pick<Structure, OnlySinkKeys<Structure>>>

type MapToResultTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends Sink<unknown, infer Return, unknown[]> ? Return :
    Structure[K] extends (...config: unknown[]) => infer T ? T :
    Structure[K] extends Module<infer T, unknown, unknown> ? T : Structure[K]
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

function isPrimitive(v: unknown): v is (string | number | boolean | undefined | null | symbol | Function) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'symbol' || typeof v === 'function' || v === undefined || v === null;
}

function flatten<T>(array: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<T> {
  return array.reduce((acc, next) => acc.concat(next), []);
}

type FindDeepResult<Search> = ReadonlyArray<{path: (string | number | symbol)[]; value: Search}>;

function findDeep<T, TSearch>(obj: T, predicate: (value: unknown) => value is TSearch, path: (string | symbol | number)[] = []): FindDeepResult<TSearch> {
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
        .map(prop => findDeep((obj as unknown)[prop], predicate, [...path, prop]))
    );
  }

  // Don't know how to traverse that
  return [];
}

function values<T extends {[K in keyof T]: unknown}>(map: T): Array<T[keyof T]> {
  if (map === undefined || map === null) {
    return [];
  }
  return Object.getOwnPropertyNames(map)
    .map(prop => map[prop]);
}

function createDependencyGraph(definitions: ReadonlyArray<readonly [string, {isSink: boolean, inputs: FindDeepResult<InputWire<unknown>>, outputs?: {[key: string]: SinkRef<unknown, unknown[]>}}]>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  definitions.forEach(([moduleName, {inputs, outputs, isSink}]) => {
    if (isSink) {
      edges.push([`${moduleName}_start_RESERVED`, moduleName]);
    }

    inputs.forEach(dep => edges.push([dep.value.prop, moduleName]));

    if (outputs) {
      Object.getOwnPropertyNames(outputs).forEach(prop => {
        const sinkRef = outputs[prop];
        const sinkProp = sinkRef.prop;

        // Sink is going to be initialized at '${sinkProp}_start_RESERVED'.
        // To put a value in a sink module will depend on its start point node.
        // To make sure all sink values are initialized before the sink is used,
        // module will be a dependency of sink "end" graph node. if you depend on sink "end",
        // you can be sure that all things that all SinkRefs for that sink are resolved
        edges.push([`${sinkProp}_start_RESERVED`, moduleName])
        edges.push([moduleName, sinkProp]);
      });
    }
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

function getAllNodes<Structure>(structure: Structure): readonly string[] {
  return flatten(Object.getOwnPropertyNames(structure).map(key => {
    if (isSink(structure[key])) {
      return [`${key}_start_RESERVED`, key];
    } else {
      return [key];
    }
  }));
}

function createSystem<Structure>(structure: Structure): System<Structure> {
  return {
    configure(closure) {
      const wireFactory: WireFactory<Structure> = {
        in(key) {
          return new InputWire(key as string, (id: unknown) => id);
        },
        out(key, ...config) {
          return new SinkRef(key as string, ...config);
        }
      };

      const config = closure(wireFactory);
      console.log(config);

      const configuredSystem = {
        [ModuleSymbol]: true as const,
        definition: structure,
        config,
        stop(instance: RunningSystemContext<Structure>) {
          if (instance[SystemMetaSymbol].creator !== configuredSystem) {
            throw new Error('Tried to stop a running system using a ConfiguredSystem instance that did not start it');
          }
          const reverseSortedModules = instance[SystemMetaSymbol].sortedModules.reverse();

          for (const moduleName of reverseSortedModules) {
            if (isModule(structure[moduleName])) {
              if (structure[moduleName].stop) {
                structure[moduleName].stop(instance[moduleName]);
              }
            }
          }
        },
        start() {
          const moduleDepsPairs: (readonly [
            string,
            {
              isSink: boolean,
              inputs: FindDeepResult<InputWire<unknown>>,
              outputs?: {[key: string]: SinkRef<unknown, unknown[]>},
            }
          ])[] = Object.getOwnPropertyNames(config).map((moduleName) => [moduleName, {
            isSink: isSink(structure[moduleName]),
            inputs: findDeep(config[moduleName]?.config, isInputWire),
            outputs: config[moduleName]?.inject,
          }] as const);
          const moduleDepsMap = fromPairs(moduleDepsPairs);

          const nodes = getAllNodes(structure);
          const dependencyGraph = createDependencyGraph(moduleDepsPairs);

          const sortedModules: string[] = toposortArray(nodes, dependencyGraph);
          console.log({sortedModules});

          const context: Partial<MapToResultTypes<Structure>> = {};
          const weakTypeConfig: {
            [key: string]: SystemConfig<Structure>[keyof SystemConfig<Structure>]
          } = config;

          for (const moduleName of sortedModules) {
            const module = moduleName.replace(/_start_RESERVED$/, '');
            // If context already has a module, that means that it's a sink
            if (context[module]) {
              continue;
            }
            const currentModule = structure[module];
            const moduleConfig = weakTypeConfig.hasOwnProperty(module) ? weakTypeConfig[module] : undefined;
            let deps: unknown;

            if (moduleConfig && 'config' in moduleConfig) {
              deps = (moduleConfig as any).config;

              for (const dep of moduleDepsMap[module as string].inputs) {
                const depValue = dep.value.mapper(context[dep.value.prop]);

                const setAny: any = set;
                if (isSink(depValue)) {
                  deps = setAny(...dep.path)(depValue.resolve())(deps);
                } else {
                  deps = setAny(...dep.path)(depValue)(deps);
                }
              }
            }

            if (isSink(currentModule)) {
              context[module] = currentModule;
            } else if (typeof currentModule === 'function') {
              context[module] = currentModule(deps);
            } else if (isModule(currentModule)) {
              const instance = currentModule.start(deps);
              context[module] = instance;

              if (currentModule.inject) {
                const injects: any = currentModule.inject(instance, deps);
                const injectConfig = moduleDepsMap[module].outputs;

                const allInjects = new Set([
                  ...Object.getOwnPropertyNames(injects),
                  ...Object.getOwnPropertyNames(injectConfig)]
                );

                allInjects.forEach(key => {
                  if (!(key in injects && key in injectConfig)) {
                    console.error('Provided by module: ', injects);
                    console.error('Found in config', injectConfig);
                    throw new Error(`Tried to inject a value from "${module}", but either the value was not provided or inject destination was not configured.\nSee error above for more details.`);
                  }
                  const sinkRef = injectConfig[key];
                  const maybeSink = context[sinkRef.prop];

                  if (isSink(maybeSink)) {
                    context[sinkRef.prop] = maybeSink.accept(injects[sinkRef.prop], ...sinkRef.config);
                  } else {
                    throw new Error(`Tried to inject a value from "${module}" into "${sinkRef.prop}", but "${sinkRef.prop}" is not a Sink"`)
                  }
                })
              }
            } else {
              context[module] = currentModule as unknown;
            }
          }
          const fullContext: MapToResultTypes<Structure> = context as any;

          const runningSystem: RunningSystemContext<Structure> = {
            ...fullContext,
            [SystemMetaSymbol]: {
              creator: configuredSystem,
              sortedModules,
            },
          };

          return runningSystem;
        }
      };

      return configuredSystem;
    }
  }
}

const ServerModule = createModule({
  start(deps: {host: string, port: number, middleware: readonly string[]}): void {
    console.log('server create', {middleware: deps.middleware});

    return undefined;
  },
  stop() {
    console.log('destroying server');
  },
});
interface AuthInstance {
  auth(creds: {user: string, pass: string}): Promise<{authToken: string}>
}

const AuthModule = createModule<AuthInstance, {secret: string}, {middleware: string}>({
  start({secret}) {
    return {
      auth({user, pass}: {user: string, pass: string}): Promise<{authToken: string}> {
        return Promise.resolve({authToken: 'asdf'});
      }
    };
  },
  stop(instance) {
    console.log('destroying auth');
  },
  inject(_instance, deps) {
    return {
      middleware: deps.secret,
    };
  }
});

const EnvModule = () => {
  return {
    get(env: string): string | undefined {
      return env;
    }
  };
};

const subSystem = createSystem({
  test: 'I\'m a subsystem',
}).configure(() => {
  return {};
});


const testSystem = createSystem({
  subSystem,
  server: ServerModule,
  constant: "asdf",
  env: EnvModule,
  date: new Date(),
  middleware: createArraySink<string>(),
  auth: AuthModule,
});

const configuredSystem = testSystem.configure(wire => ({
  server: {
    config: {
      host: wire.in('env').map(env => env.get('SERVER_HOST')),
      port: 123,
      middleware: wire.in('middleware'),
    },
  },
  auth: {
    config: {
      secret: wire.in('subSystem').map(s => s.test),
    },
    inject: {
      middleware: wire.out('middleware')
    }
  }
}));

const runningSystem = configuredSystem.start();
configuredSystem.stop(runningSystem);
