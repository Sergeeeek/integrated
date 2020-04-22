import * as toposort from 'toposort';

import { InputWire, isInputWire } from './InputWire';
import { Module, createModule, isModule, ModuleDefinition } from './Module';
import { OutputWire, isOutputWire } from './OutputWire';
import { Socket, isSocket, createArraySocket, ArraySocket, ArraySocketConfig } from './Socket';
import { deepSet, flatten, FilterDeepResult, filterDeep, fromPairs, setDifference } from './util';

type Mappable = {[key: string]: unknown} | unknown[] | readonly unknown[];

type RecursiveRef<Deps> = [Deps] extends [never] ? never :
  | (Deps extends Mappable
    ? {
        [K in keyof Deps]:
          | RecursiveRef<Deps[K]>
          | InputWire<RecursiveRef<Deps[K]>>;
      }
    : Deps)
  | InputWire<Deps extends Mappable
    ? {
        [K in keyof Deps]:
          | RecursiveRef<Deps[K]>
          | InputWire<RecursiveRef<Deps[K]>>;
      }
    : Deps>;

type GetDeps<T> = T extends (config: infer V) => unknown
  ? {
    [K in keyof V]: RecursiveRef<V[K]>
  }
  : never;

type ModuleResultType<T> = T extends Socket<unknown, infer Return, unknown[]> ? Return :
    T extends ((() => infer R) | ((config: never) => infer R))
      ? R extends Module<infer M, {}> ? M : R
      : T

type InjectConfig<T> = OutputWire<T, unknown[]> | readonly OutputWire<T, unknown[]>[];

interface GetSelfInject<T> {
  readonly self?: InjectConfig<ModuleResultType<T>>,
};

type GetInjects<T> = T extends ((deps: unknown) => Module<unknown, infer Injects>)
  ? {
      readonly [K in Exclude<keyof Injects, 'self'>]: InjectConfig<Injects[K]>;
    }
  : {};


type RequiredKeys<T> = Exclude<keyof T, {
  [K in keyof T]: undefined extends T[K] ? K : [T[K]] extends [never] ? K : never;
}[keyof T]>;

type RemoveNever<T> = Omit<T, {
  [K in keyof T]: [T[K]] extends [never] ? K : never
}[keyof T]>


type RequiredNestedKeys<T> = RequiredKeys<{
  [K in keyof T]: RequiredKeys<T[K]>
}>;

type PropagateOptional<T> = {
  [K in RequiredNestedKeys<T>]-?: T[K]
} & {
  [K in Exclude<keyof T, RequiredNestedKeys<T>>]?: T[K]
}

type SystemConfig<Structure> = PropagateOptional<{
    [K in keyof Structure]: PropagateOptional<RemoveNever<{
        disabled?: boolean,
        config: GetDeps<Structure[K]>,
        inject: GetSelfInject<Structure[K]> & GetInjects<Structure[K]>,
    }>>
  }>;

export interface ConfiguredSystem<Structure> {
  readonly definition: Structure;
  readonly config: SystemConfig<Structure>;
  (): Module<MapToResultTypes<Structure>, never>;
};

type OnlySocketKeys<Structure> = {
  [K in keyof Structure]: Structure[K] extends Socket<unknown, unknown, unknown[]>
    ? K
    : never;
}[keyof Structure];

type SocketTypes<Structure> = {
  [K in keyof Structure]: Structure[K] extends Socket<infer V, infer R, infer Config> ? {value: V; return: R; config: Config} : never
}

type GetSockets<Structure> = SocketTypes<Pick<Structure, OnlySocketKeys<Structure>>>

type MapToResultTypes<Structure> = {
  [K in keyof Structure]: ModuleResultType<Structure[K]>
}

type WireFactory<Structure> = {
  /**
   * Wires in the resolved value from another module in this system. This will return
   * an InputWire which will be resolved to an actual value when system is started.
   * @param  module A different module in this system
   * @return        InputWire
   */
  from<M extends keyof Structure>(module: M): InputWire<MapToResultTypes<Structure>[M]>;
  /**
   * Wires the value of an inject into a specified socket. Returns an OutputWire,
   * which will be used when system is started.
   * @param  socket Reference to a socket in the system
   * @return        OutputWire
   */
  into<Key extends keyof GetSockets<Structure>>(socket: Key, ...config: GetSockets<Structure>[Key]['config']): OutputWire<GetSockets<Structure>[Key]['value'], GetSockets<Structure>[Key]['config']>;
};

export type System<Structure> = {
  configure(
    closure: (wire: WireFactory<Structure>) => SystemConfig<Structure>
  ): ConfiguredSystem<Structure>;
};

function createDependencyGraph(definitions: ReadonlyArray<readonly [string, {isSocket: boolean, inputs: FilterDeepResult<InputWire<unknown>>, outputs?: {[key: string]: InjectConfig<unknown>}}]>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  definitions.forEach(([moduleName, {inputs, outputs, isSocket}]) => {
    if (isSocket) {
      edges.push([`${moduleName}_empty_init_RESERVED`, moduleName]);
    }

    inputs.forEach(dep => edges.push([dep.value.prop, moduleName]));

    if (outputs) {
      const addOutput = (outputWire: OutputWire<unknown, unknown[]>) => {
          const wireProp = outputWire.prop;

          // Socket is going to be initialized at '${sinkProp}_empty_init_RESERVED'.
          // To put a value in a sink module will depend on its start point node.
          // To make sure all sink values are initialized before the sink is used,
          // module will be a dependency of sink "end" graph node. if you depend on sink "end",
          // you can be sure that all things that all SinkRefs for that sink are resolved
          edges.push([`${wireProp}_empty_init_RESERVED`, moduleName])
          edges.push([moduleName, wireProp]);
      }
      Object.getOwnPropertyNames(outputs).forEach(prop => {
        const outputWireOrArray = outputs[prop];

        if (Array.isArray(outputWireOrArray)) {
          outputWireOrArray.forEach(addOutput);
        } else {
          // TypeScript can't infer that if it's not an array
          // then it's definitely OutputWire. Weird
          addOutput(outputWireOrArray as OutputWire<unknown, unknown[]>);
        }
      });
    }
  });

  return edges;
}

function getAllNodes<Structure>(structure: Structure): readonly string[] {
  return flatten((Object.getOwnPropertyNames(structure) as (keyof Structure)[]).map((key: keyof Structure) => {
    if (isSocket(structure[key])) {
      return [`${key}_empty_init_RESERVED`, key as string];
    } else {
      return [key as string];
    }
  }));
}

function prettyPrintArray(arr: readonly string[]): string {
  return JSON.stringify(arr);
}

const allowedModuleConfigKeys = new Set(['config', 'inject', 'disabled']);

function validateConfig<Structure>(structure: Structure, config: SystemConfig<Structure>) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('System configuration closure should return a plain object');
  }

  const structureKeys = new Set(Object.getOwnPropertyNames(structure));
  const configKeys = new Set(Object.getOwnPropertyNames(config));

  const difference = setDifference(structureKeys, configKeys);

  if (difference.size > 0) {
    throw new Error(`Config contains keys that don\'t exist in system definition. These keys are: ${prettyPrintArray([...difference])}`)
  }

  // Validating each module's configs for invalid keys
  for (const configKey of configKeys) {
    const moduleConfig = config[configKey];

    const moduleConfigKeys = new Set(Object.getOwnPropertyNames(moduleConfig));
    const invalidModuleConfigKeys = setDifference(allowedModuleConfigKeys, moduleConfigKeys);

    if (invalidModuleConfigKeys.size > 0) {
      throw new Error(`Config for module "${configKey}" contains invalid keys: ${prettyPrintArray([...invalidModuleConfigKeys])}. Only these keys are allowed: ${prettyPrintArray([...allowedModuleConfigKeys])}`)
    }
  }
}

export function createSystem<Structure extends {}>(structure: Structure): System<Structure> {
  if (typeof structure !== 'object' || structure === null || Array.isArray(structure)) {
    throw new Error('createSystem only accepts objects');
  }
  return {
    configure(closure) {
      if (typeof closure !== 'function') {
        throw new Error('System.configure only accepts functions');
      }
      const wireFactory: WireFactory<Structure> = {
        from(key) {
          if (typeof key !== 'string') {
            throw new Error('WireFactory.in only accepts strings');
          }
          if (!(key in structure)) {
            const validKeys = Object.getOwnPropertyNames(structure);
            throw new Error(`WireFactory.in called with unknown key "${key}". Valid keys for this system are ${prettyPrintArray(validKeys)}`)
          }
          return new InputWire(key as string);
        },
        into(key, ...config) {
          if (typeof key !== 'string') {
            throw new Error(`WireFactory.out only accepts strings, but received ${JSON.stringify(key) || key && key.toString()}`)
          }
          if (!(key in structure)) {
            const validKeys = Object.getOwnPropertyNames(structure).filter(prop => isSocket(structure[prop]));
            throw new Error(`WireFactory.out called with unknown key "${key}". Valid output keys for this system are ${prettyPrintArray(validKeys)}`)
          }
          if (!isSocket(structure[key])) {
            const validKeys = Object.getOwnPropertyNames(structure).filter(prop => isSocket(structure[prop]));
            throw new Error(`WireFactory.out called with key "${key}", but "${key}" is not a Socket in this system. Valid output keys for this system are ${prettyPrintArray(validKeys)}`)
          }
          return new OutputWire(key as string, (id: unknown) => id, ...config);
        }
      };

      const config = closure(wireFactory);

      validateConfig(structure, config);

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
            isSocket: boolean,
            inputs: FilterDeepResult<InputWire<unknown>>,
            outputs?: {[key: string]: InjectConfig<unknown>},
          }
        ])[] = (Object.getOwnPropertyNames(config) as string[]).map((moduleName) => [moduleName, {
          isSocket: isSocket(structure[moduleName]),
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
          // If context already has a module, that means that it's a sink, because sinks appear in sortedModules twice
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
              const {path, value: inputWire} = dep;
              const depConfig = weakTypeConfig[inputWire.prop];

              if (depConfig && depConfig.disabled && !inputWire.isOptional) {
                const prettyDependencyPath = [module, 'config', ...path].join('.');
                throw new Error(`Module "${module}" has a dependency "${inputWire.prop}" at config path "${prettyDependencyPath}",`
                + ` but that dependency is disabled through config and InputWire is not optional.`
                + `\nPlease remove the disabled flag from "${inputWire.prop}" or make the dependency at "${prettyDependencyPath}" optional.`);
              }
              const depValue = inputWire.mapper(context[inputWire.prop]);

              if (isSocket(depValue)) {
                deps = deepSet(deps, path, depValue.resolve());
              } else {
                deps = deepSet(deps, path, depValue);
              }
            }
          }

          const acceptInject = (outputWire: OutputWire<unknown, unknown[]>, inject: unknown) => {
            const maybeSink = context[outputWire.prop];
            const sinkConfig = weakTypeConfig[outputWire.prop];

            if (sinkConfig && sinkConfig.disabled) {
              throw new Error(`Tried to inject a value from "${module}" into "${outputWire.prop}", but Socket "${outputWire.prop}" is disabled`)
            }

            if (isSocket(maybeSink)) {
              context[outputWire.prop] = maybeSink.accept(module, outputWire.mapper(inject), ...outputWire.config);
            } else {
              throw new Error(`Tried to inject a value from "${module}" into "${outputWire.prop}", but "${outputWire.prop}" is not a Socket"`)
            }
          };

          // Module init
          if (isSocket(currentModule)) {
            context[module] = currentModule;
          } else if (typeof currentModule === 'function') {
            const initialized = currentModule(deps);

            if (isModule(initialized)) {
              const {instance, stop, inject} = initialized;

              initializedModules[module] = {stop, inject};
              context[module] = instance;

              if (inject) {
              }
            } else {
              context[module] = initialized;
            }
          } else {
            context[module] = currentModule as unknown;
          }

          if (initializedModules[module] && initializedModules[module].inject || moduleConfig && moduleConfig.inject && moduleConfig.inject.self) {
            const inject = () => {
              if (initializedModules[module] && initializedModules[module].inject) {
                const result = initializedModules[module].inject!();
                if (typeof result === 'object') {
                  return result;
                }
              }
            };
            const injects = {
              ...(inject ? inject() : undefined),
              self: context[module],
            };
            const injectConfig = moduleDepsMap[module].outputs;

            const allInjects = new Set([
              ...Object.getOwnPropertyNames(injects),
              ...Object.getOwnPropertyNames(injectConfig)
            ]);

            allInjects.forEach(key => {
              if (!(injects instanceof Object && key in injects && injectConfig && (key in injectConfig || key === 'self'))) {
                console.error('Provided by module: ', injects);
                console.error('Found in config', injectConfig);
                throw new Error(`Tried to inject a value from "${module}", but either the value was not provided or inject destination was not configured.\nSee error above for more details.`);
              }
              if (key === 'self' && injectConfig.self === undefined || injectConfig.self === null) {
                return;
              }
              const outputWireOrArray = injectConfig[key];

              const isValidConfig = isOutputWire(outputWireOrArray) || (Array.isArray(outputWireOrArray) && outputWireOrArray.every(out => isOutputWire(out)));
              if (!isValidConfig) {
                throw new Error(`Wrong value passed to inject.${key} in module "${module}". Please use wire.into to configure injects.`);
              }

              if (Array.isArray(outputWireOrArray)) {
                outputWireOrArray.forEach(wire => acceptInject(wire, injects[key]));
              } else {
                const outputWire = outputWireOrArray as OutputWire<unknown, unknown[]>;

                acceptInject(outputWire, injects[key]);
              }
            });
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
                if (initializedModules[moduleName] && initializedModules[moduleName].stop) {
                  initializedModules[moduleName].stop!();
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

// Socket exports
export { Socket, isSocket, createArraySocket, ArraySocket, ArraySocketConfig };

// Module exports
export { Module, createModule, isModule, ModuleDefinition }
