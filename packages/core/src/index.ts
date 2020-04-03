import * as toposort from 'toposort';
import {deepSet} from './util';

class InputWire<T> {
  constructor(public readonly prop: string, public readonly isOptional: boolean = false, public readonly mapper: Function = (id: T) => id) {}

  get optional(): InputWire<undefined | T> {
    return new InputWire<undefined | T>(this.prop, true, this.mapper);
  }

  map<U>(mapper: (value: T) => U): InputWire<U> {
    return new InputWire<U>(this.prop, this.isOptional, (value: T) => mapper(this.mapper(value)));
  }
}

function isInputWire(value: unknown): value is InputWire<unknown> {
  return value instanceof InputWire;
}

const WireHubSymbol = Symbol();

interface WireHub<TAccept, TReturn, TConfig extends unknown[]> {
  [WireHubSymbol]: true;
  accept(value: TAccept, ...config: TConfig): WireHub<TAccept, TReturn, TConfig>;
  resolve(): TReturn;
}

function isWireHub(value: unknown): value is WireHub<unknown, unknown, unknown[]> {
  if (value === undefined || value === null) {
    return false;
  }

  return typeof value === 'object' && Boolean(value && value[WireHubSymbol]);
}

type ArrayWireHubConfig = {after: InputWire<unknown>}
type ArrayWireHub<T> = WireHub<T, Array<T>, [ArrayWireHubConfig?]>

export function createArrayWireHub<T>(entries: ReadonlyArray<[T, ArrayWireHubConfig?]> = []): ArrayWireHub<T> {
  return {
    [WireHubSymbol]: true,
    accept(value: T, config?: ArrayWireHubConfig) {
      return createArrayWireHub([...entries, [value, config]]);
    },
    resolve() {
      return entries.map(([value]) => value);
    }
  };
}

class OutputWire<T, Config extends unknown[]> {
  readonly config: Config;
  constructor(public readonly prop: string, public readonly mapper: Function = (id: T) => id, ...config: Config) {
    this.config = config;
  }

  map<U>(mapper: (val: T) => U): OutputWire<U, Config> {
    return new OutputWire(this.prop, (val: T) => mapper(this.mapper(val)), ...this.config);
  }
}

function isOutputWire(value: unknown): value is OutputWire<unknown, unknown[]> {
  return value instanceof OutputWire;
}

type RecursiveRef<Deps> = Deps extends never ? never : {
  [K in keyof Deps]:
    | RecursiveRef<Deps[K]>
    | InputWire<Deps[K] | RecursiveRef<Deps[K]>>;
};

type GetDeps<T> = T extends (config: infer V) => unknown
  ? {} extends V ? never : RecursiveRef<V>
  : T extends Module<unknown, infer V, unknown>
  ? RecursiveRef<V>
  : never;

const ModuleSymbol = Symbol();

export interface ModuleDefinition<T, Deps, Injects> {
  start(deps: Deps): T;
  stop?: (instance: T) => void,
  inject?: (instance: T, deps: Deps) => Injects;
}

export interface Module<T, Deps, Injects> extends ModuleDefinition<T, Deps, Injects> {
  [ModuleSymbol]: true;
}

export function createModule<T, Deps = never, Injects = never>(definition: ModuleDefinition<T, Deps, Injects>): Module<T, Deps, Injects> {
  return {
    [ModuleSymbol]: true,
    ...definition,
  };
}

function isModule(value: unknown): value is Module<unknown, unknown, unknown> {
  if (value === undefined || value === null) {
    return false;
  }

  return typeof value === 'object' && Boolean(value && value[ModuleSymbol]);
}

type GetInjects<T> = T extends Module<unknown, unknown, infer Injects>
  ? {
      [K in keyof Injects]: OutputWire<Injects[K], unknown[]>;
    }
  : never;


type RequiredKeys<T> = Exclude<keyof T, {
  [K in keyof T]: T[K] extends {} ? T[K] extends never ? K : never : K;
}[keyof T]>;

type RemoveNeverAndEmpty<T> = Pick<T, RequiredKeys<T>>

type RequiredNestedKeys<T> = RequiredKeys<{
  [K in keyof T]: RequiredKeys<T[K]>
}>;

type PropagateOptional<T> = {
  [K in RequiredNestedKeys<T>]-?: T[K]
} & {
  [K in Exclude<keyof T, RequiredNestedKeys<T>>]?: T[K]
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

const SystemMetaSymbol = Symbol();
type SystemMeta<Structure> = {
  readonly sortedModules: string[],
  readonly creator: ConfiguredSystem<Structure>
};
export type RunningSystemContext<Structure> = MapToResultTypes<Structure> & {
  [SystemMetaSymbol]: SystemMeta<Structure>,
};

export interface ConfiguredSystem<Structure> extends Module<RunningSystemContext<Structure>, never, never> {
  readonly definition: Structure;
  readonly config: SystemConfig<Structure>;
  start(): RunningSystemContext<Structure>;
  stop(instance: RunningSystemContext<Structure>): void,
};

type OnlySocketKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends WireHub<unknown, unknown, unknown[]>
    ? K
    : never;
}[keyof Structure];

type SocketTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends WireHub<infer V, infer R, infer Config> ? {value: V; return: R; config: Config} : never
}

type GetSockets<Structure> = SocketTypes<Pick<Structure, OnlySocketKeys<Structure>>>

type MapToResultTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends WireHub<unknown, infer Return, unknown[]> ? Return :
    Structure[K] extends (...config: unknown[]) => infer T ? T :
    Structure[K] extends Module<infer T, unknown, unknown> ? T : Structure[K]
}

type WireFactory<Structure> = {
  in<Key extends keyof Structure>(key: Key): InputWire<MapToResultTypes<Structure>[Key]>;
  out<Key extends keyof GetSockets<Structure>>(key: Key, ...config: GetSockets<Structure>[Key]['config']): OutputWire<GetSockets<Structure>[Key]['value'], GetSockets<Structure>[Key]['config']>;
};

export type System<Structure> = {
  configure(
    closure: (wire: WireFactory<Structure>) => SystemConfig<Structure>
  ): ConfiguredSystem<Structure>;
};

function isPrimitive(v: unknown): v is (string | number | boolean | undefined | null | symbol | Function) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'symbol' || typeof v === 'function' || v === undefined || v === null;
}

function flatten<T>(array: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<T> {
  return array.reduce((acc, next) => acc.concat(next), []);
}

type FilterDeepResult<Search> = ReadonlyArray<{path: (string | symbol)[]; value: Search}>;

function filterDeep<T, TSearch>(obj: T, predicate: (value: unknown) => value is TSearch, path: (string | symbol)[] = []): FilterDeepResult<TSearch> {
  if (predicate(obj)) {
    return [{path: path, value: obj}];
  }

  if (Array.isArray(obj)) {
    return flatten(obj.map((elem, index) => filterDeep(elem, predicate, [...path, index.toString()])));
  }

  if (isPrimitive(obj)) {
    return [];
  }

  if (obj instanceof Object) {
    return flatten(
      [...Object.getOwnPropertyNames(obj), ...Object.getOwnPropertySymbols(obj)]
        .map(prop => filterDeep(obj[prop], predicate, [...path, prop]))
    );
  }

  // Don't know how to traverse that
  return [];
}

function createDependencyGraph(definitions: ReadonlyArray<readonly [string, {isWireHub: boolean, inputs: FilterDeepResult<InputWire<unknown>>, outputs?: {[key: string]: OutputWire<unknown, unknown[]>}}]>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  definitions.forEach(([moduleName, {inputs, outputs, isWireHub}]) => {
    if (isWireHub) {
      edges.push([`${moduleName}_empty_init_RESERVED`, moduleName]);
    }

    inputs.forEach(dep => edges.push([dep.value.prop, moduleName]));

    if (outputs) {
      Object.getOwnPropertyNames(outputs).forEach(prop => {
        const sinkRef = outputs[prop];
        const sinkProp = sinkRef.prop;

        // WireHub is going to be initialized at '${sinkProp}_empty_init_RESERVED'.
        // To put a value in a sink module will depend on its start point node.
        // To make sure all sink values are initialized before the sink is used,
        // module will be a dependency of sink "end" graph node. if you depend on sink "end",
        // you can be sure that all things that all SinkRefs for that sink are resolved
        edges.push([`${sinkProp}_empty_init_RESERVED`, moduleName])
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
    if (isWireHub(structure[key])) {
      return [`${key}_empty_init_RESERVED`, key];
    } else {
      return [key];
    }
  }));
}

export function createSystem<Structure>(structure: Structure): System<Structure> {
  return {
    configure(closure) {
      const wireFactory: WireFactory<Structure> = {
        in(key) {
          return new InputWire(key as string);
        },
        out(key, ...config) {
          return new OutputWire(key as string, (id: unknown) => id, ...config);
        }
      };

      const config = closure(wireFactory);
      const weakTypeConfig: {
        [key: string]: {
          disabled?: boolean,
          config?: unknown,
          inject?: {
            [injectKey: string]: OutputWire<unknown, unknown[]>
          }
        }
      } = config;

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
            if (weakTypeConfig[moduleName] && weakTypeConfig[moduleName].disabled) {
              continue;
            }
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
              isWireHub: boolean,
              inputs: FilterDeepResult<InputWire<unknown>>,
              outputs?: {[key: string]: OutputWire<unknown, unknown[]>},
            }
          ])[] = Object.getOwnPropertyNames(config).map((moduleName) => [moduleName, {
            isWireHub: isWireHub(structure[moduleName]),
            inputs: filterDeep(config[moduleName] && config[moduleName].config, isInputWire),
            outputs: config[moduleName] && config[moduleName].inject,
          }] as const);
          const moduleDepsMap = fromPairs(moduleDepsPairs);

          const nodes = getAllNodes(structure);
          const dependencyGraph = createDependencyGraph(moduleDepsPairs);

          const sortedModules: string[] = toposort.array(nodes, dependencyGraph);

          const context: Partial<MapToResultTypes<Structure>> = {};

          for (const moduleName of sortedModules) {
            const module = moduleName.replace(/_empty_init_RESERVED$/, '');
            // If context already has a module, that means that it's a sink
            if (context[module]) {
              continue;
            }
            const currentModule = structure[module];
            const moduleConfig = weakTypeConfig[module];
            if (moduleConfig && moduleConfig.disabled) {
              continue;
            }
            let deps: unknown;

            // Resolving InputWires to real deps
            if (moduleConfig && 'config' in moduleConfig) {
              deps = moduleConfig.config;

              for (const dep of moduleDepsMap[module as string].inputs) {
                const depConfig = weakTypeConfig[dep.value.prop];

                if (depConfig && depConfig.disabled && !dep.value.isOptional) {
                  throw new Error(`Module "${module}" has a dependency "${dep.value.prop}" at config path "${[module, 'config', ...dep.path].join('.')}", but that dependency is disabled through config and InputWire is not optional.\nPlease remove the disabled flag from "${module}" or make the dependency optional.`);
                }
                const depValue = dep.value.mapper(context[dep.value.prop]);

                if (isWireHub(depValue)) {
                  deps = deepSet(deps, dep.path, depValue.resolve());
                } else {
                  deps = deepSet(deps, dep.path, depValue);
                }
              }
            }

            // Module init
            if (isWireHub(currentModule)) {
              context[module] = currentModule;
            } else if (typeof currentModule === 'function') {
              context[module] = currentModule(deps);
            } else if (isModule(currentModule)) {
              const instance = currentModule.start(deps);
              context[module] = instance;

              if (currentModule.inject) {
                const injects = currentModule.inject(instance, deps);
                const injectConfig = moduleDepsMap[module].outputs;

                const allInjects = new Set([
                  ...Object.getOwnPropertyNames(injects),
                  ...Object.getOwnPropertyNames(injectConfig)]
                );

                allInjects.forEach(key => {
                  if (!(injects instanceof Object && key in injects && injectConfig && key in injectConfig)) {
                    console.error('Provided by module: ', injects);
                    console.error('Found in config', injectConfig);
                    throw new Error(`Tried to inject a value from "${module}", but either the value was not provided or inject destination was not configured.\nSee error above for more details.`);
                  }
                  const sinkRef = injectConfig[key];
                  const maybeSink = context[sinkRef.prop];
                  const sinkConfig = weakTypeConfig[sinkRef.prop];

                  if (sinkConfig && sinkConfig.disabled) {
                    throw new Error(`Tried to inject a value from "${module}" into "${sinkRef.prop}", but WireHub "${sinkRef.prop}" is disabled`)
                  }

                  if (isWireHub(maybeSink)) {
                    context[sinkRef.prop] = maybeSink.accept(sinkRef.mapper(injects[sinkRef.prop]), ...sinkRef.config);
                  } else {
                    throw new Error(`Tried to inject a value from "${module}" into "${sinkRef.prop}", but "${sinkRef.prop}" is not a WireHub"`)
                  }
                })
              }
            } else {
              context[module] = currentModule as unknown;
            }
          }
          const fullContext = context as MapToResultTypes<Structure>;

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
