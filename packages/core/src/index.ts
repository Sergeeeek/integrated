import * as toposort from 'toposort';

import {deepSet, flatten, FilterDeepResult, filterDeep, fromPairs} from './util';

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

const WireHubSymbol = '@______internal_WireHubSymbol';

const WireHubProto: {
  [WireHubSymbol]: true
} = Object.defineProperty({}, WireHubSymbol, {
  enumerable: false,
  configurable: false,
  writable: false,
  value: true,
});

interface WireHub<TAccept, TReturn, TConfig extends unknown[]> {
  [WireHubSymbol]: true;
  accept(from: string, value: TAccept, ...config: TConfig): WireHub<TAccept, TReturn, TConfig>;
  resolve(): TReturn;
}

function isWireHub(value: unknown): value is WireHub<unknown, unknown, unknown[]> {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'object') {
    const obj = value as {[key: string]: unknown};

    return Boolean(obj[WireHubSymbol]);
  }

  return false;
}

type ArrayWireHubConfig = {after?: InputWire<unknown>, before?: InputWire<unknown>}
type ArrayWireHub<T> = WireHub<T, Array<T>, [ArrayWireHubConfig?]>

export function createArrayWireHub<T>(entries: {[key: string]: {value: T, config?: ArrayWireHubConfig}} = {}): ArrayWireHub<T> {
  return Object.assign(Object.create(WireHubProto) as typeof WireHubProto, {
    accept(from: string, value: T, config?: ArrayWireHubConfig) {
      return createArrayWireHub({
        ...entries,
        [from]: {
          value,
          config
        }
      });
    },
    resolve() {
      const nodes = Object.getOwnPropertyNames(entries);
      const edges = flatten(nodes.map(node => {
        const {config} = entries[node];
        if (!config) {
          return [];
        }

        return [
          config.before ? [node, config.before.prop] : null,
          config.after ? [config.after.prop, node] : null,
        ].filter(v => v !== null) as [string, string][];
      }));

      const sortedEntries = toposort.array(nodes, edges);

      return sortedEntries.map(entry => entries[entry].value);
    }
  });
}

class OutputWire<T, Config extends unknown[]>  {
  _contravarianceHack?(arg: T): void;
  readonly config: Config;
  constructor(public readonly prop: string, public readonly mapper: Function = (id: T) => id, ...config: Config) {
    this.config = config;
  }

  map<U, V extends T = T>(mapper: (val: V) => U): OutputWire<U, Config> {
    return new OutputWire(this.prop, (val: V) => mapper(this.mapper(val)), ...this.config);
  }
}

function isOutputWire(value: unknown): value is OutputWire<unknown, unknown[]> {
  return value instanceof OutputWire;
}

type RecursiveRef<Deps> = Deps extends never ? never : {
  [K in keyof Deps]:
    | Deps[K]
    | InputWire<Deps[K] | RecursiveRef<Deps[K]>>;
};

type GetDeps<T> = T extends (config: infer V) => unknown
  ? RecursiveRef<V>
  : never;

const ModuleSymbol = '@______internal_ModuleSymbol';
const ModuleProto: {
  [ModuleSymbol]: true
} = Object.defineProperty({}, ModuleSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: true,
});

export interface ModuleDefinition<T, Deps, Injects> {
  (deps: Deps): readonly [T, {stop?(): void, inject?(): Injects}?];
}

export interface Module<T, Injects> {
  [ModuleSymbol]: true;
  instance: T;
  stop?(): void;
  inject?(): Injects;
  withDestructor(destructor: () => void): Module<T, Injects>;
  withInjects<U>(inject: () => U): Module<T, U>;
}

function internalCreateModule<T, Injects>(m: Omit<Module<T, Injects>, typeof ModuleSymbol>): Module<T, Injects> {
  return Object.assign(Object.create(ModuleProto) as typeof ModuleProto, m);
}

export function createModule<T>(instance: T): Module<T, never> {
  const module = internalCreateModule<T, never>({
    instance,
    withDestructor(destructor: () => void): Module<T, never> {
      return internalCreateModule({
        ...module,
        stop: destructor,
      });
    },
    withInjects<U>(inject: () => U): Module<T, U> {
      return internalCreateModule({
        ...module,
        inject,
      });
    }
  });

  return module;
}

function isModule(value: unknown): value is Module<unknown, unknown> {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'object') {
    const obj = value as {[key: string]: unknown};

    return Boolean(obj[ModuleSymbol]);
  }

  return false;
}

type GetInjects<T> = T extends ((deps: unknown) => Module<unknown, infer Injects>)
  ? {
      [K in keyof Injects]: OutputWire<Injects[K], unknown[]>;
    }
  : never;


type RequiredKeys<T> = Exclude<keyof T, {
  [K in keyof T]: undefined extends T[K] ? K : [T[K]] extends [never] ? K : never;
}[keyof T]>;

type RemoveNever<T> = Omit<T, {
  [K in keyof T]: [T[K]] extends [never] ? K : never
}[keyof T]>


type RequiredNestedKeys<T> = RequiredKeys<{
  [K in keyof T]: RequiredKeys<T[K]>
}>;

type TestRequired = PropagateOptional<{
  test: {
    disabled?: boolean,
    config: GetDeps<(deps: {asdf: string}) => number>
  }
}>

type PropagateOptional<T> = {
  [K in RequiredNestedKeys<T>]-?: T[K]
} & {
  [K in Exclude<keyof T, RequiredNestedKeys<T>>]?: T[K]
}

type SystemConfig<Structure> = PropagateOptional<{
    [K in keyof Structure]: RemoveNever<{
        disabled?: boolean,
        config: GetDeps<Structure[K]>,
        inject: GetInjects<Structure[K]>,
    }>
  }>;

type Test = SystemConfig<{
  test: (deps: {asdf: string}) => number,
}>

export interface ConfiguredSystem<Structure> {
  readonly definition: Structure;
  readonly config: SystemConfig<Structure>;
  (): Module<MapToResultTypes<Structure>, never>;
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
    Structure[K] extends ((config: never) => infer T)
      ? T extends Module<infer M, unknown> ? M : T
      : Structure[K]
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

function getAllNodes<Structure>(structure: Structure): readonly string[] {
  return flatten((Object.getOwnPropertyNames(structure) as (keyof Structure)[]).map((key: keyof Structure) => {
    if (isWireHub(structure[key])) {
      return [`${key}_empty_init_RESERVED`, key as string];
    } else {
      return [key as string];
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

      const configuredSystem = () => {
        const moduleDepsPairs: (readonly [
          string,
          {
            isWireHub: boolean,
            inputs: FilterDeepResult<InputWire<unknown>>,
            outputs?: {[key: string]: OutputWire<unknown, unknown[]>},
          }
        ])[] = (Object.getOwnPropertyNames(config) as string[]).map((moduleName) => [moduleName, {
          isWireHub: isWireHub(structure[moduleName]),
          inputs: filterDeep(weakTypeConfig[moduleName] && weakTypeConfig[moduleName].config, isInputWire),
          outputs: weakTypeConfig[moduleName] && weakTypeConfig[moduleName].inject,
        }] as const);
        const moduleDepsMap = fromPairs(moduleDepsPairs);

        const nodes = getAllNodes(structure);
        const dependencyGraph = createDependencyGraph(moduleDepsPairs);

        const sortedModules = toposort.array(nodes, dependencyGraph);

        const context: Partial<MapToResultTypes<Structure>> = {};
        const initializedModules: {[key: string]: {stop?(): void, inject?(): unknown}} = {};

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
            const initialized = currentModule(deps);

            if (isModule(initialized)) {
              const {instance, stop, inject} = initialized;

              initializedModules[module] = {stop, inject};
              context[module] = instance;

              if (inject) {
                const injects = inject();
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
                    context[sinkRef.prop] = maybeSink.accept(module, sinkRef.mapper(injects[sinkRef.prop]), ...sinkRef.config);
                  } else {
                    throw new Error(`Tried to inject a value from "${module}" into "${sinkRef.prop}", but "${sinkRef.prop}" is not a WireHub"`)
                  }
                })
              }
            } else {
              context[module] = initialized;
            }
          } else {
            context[module] = currentModule as unknown;
          }
        }
        const fullContext = context as MapToResultTypes<Structure>;

        return createModule(fullContext)
          .withDestructor(() => {
              const reverseSortedModules = sortedModules.reverse();

              for (const moduleName of reverseSortedModules) {
                if (weakTypeConfig[moduleName] && weakTypeConfig[moduleName].disabled) {
                  continue;
                }
                if (isModule(structure[moduleName])) {
                  if (initializedModules[moduleName] && initializedModules[moduleName].stop) {
                    initializedModules[moduleName].stop!();
                  }
                }
              }
          });
      };

      Object.assign(configuredSystem, {
        definition: structure,
        config,
      });

      return configuredSystem as ConfiguredSystem<Structure>;
    }
  }
}
