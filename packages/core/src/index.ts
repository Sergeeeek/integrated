import * as toposort from 'toposort';

import { InputWire, isInputWire } from './InputWire';
import {
  Module,
  createModule,
  isModule,
  isModuleBuilder
} from './Module';
import { OutputWire, isOutputWire } from './OutputWire';
import { Socket, isSocket, createArraySocket, ArraySocket, ArraySocketConfig } from './Socket';
import { deepSet, flatten, FilterDeepResult, filterDeep, fromPairs, setDifference } from './util';

type Mappable = {[key: string]: unknown} | unknown[] | readonly unknown[];

type RecursiveRef<Deps> = [Deps] extends [never] ? never :
  | (Deps extends Mappable
      ? {
          [K in keyof Deps]:
            | RecursiveRef<Deps[K]>
        }
      : Deps extends Map<infer MK, infer MV> ? Map<MK, RecursiveRef<MV>> : Deps
    )
    | (InputWire<Deps>);

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
  readonly self?: InjectConfig<ModuleResultType<T>>;
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
        disabled?: boolean;
        config: GetDeps<Structure[K]>;
        inject: GetSelfInject<Structure[K]> & GetInjects<Structure[K]>;
    }>>
  }>;

/**
 * A system which is configured and ready to start.
 * You can inspect its definition and config.
 */
export interface ConfiguredSystem<Structure> extends Module<never, {}> {
  /**
   * This is the system definition that was passed to createSystem in case you need it.
   */
  readonly definition: Structure;
  /**
   * This is the system config that was returned from the configuration closure.
   */
  readonly config: SystemConfig<Structure>;
  /**
   * ConfiguredSystem is also a function that you can call. Calling it will start the system.
   *
   * @returns A module that can be stopped
   */
  (): Module<MapToResultTypes<Structure>, {}>;
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

/**
 * System is the aggregation of modules, that allows to declare dependnecies between
 * those modules through configuration.
 */
export type System<Structure> = {
  /**
   * Configure takes a closure which should return the system configuration.
   *
   * @param closure - A function that takes a {@link WireFactory} and returns a
   *                  config.
   * @returns The configured system that can be started.
   */
  configure(
    /**
     * @param wire - WireFactory instance for this system. Use {@link WireFactory#from}
     *               and {@link WireFactory#into} to define dependencies between modules
     *               declaratively.
     * @return A config for this system
     */
    closure: (wire: WireFactory<Structure>) => SystemConfig<Structure>
  ): ConfiguredSystem<Structure>;
};

function createDependencyGraph(definitions: ReadonlyArray<readonly [string, {isSocket: boolean; inputs: FilterDeepResult<InputWire<unknown>>; outputs?: {[key: string]: InjectConfig<unknown>}}]>): Array<[string, string]> {
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

        if (Array.isArray(outputWireOrArray) && outputWireOrArray.every(isOutputWire)) {
          outputWireOrArray.forEach(addOutput);
        } else if (isOutputWire(outputWireOrArray)) {
          addOutput(outputWireOrArray as OutputWire<unknown, unknown[]>);
        } else {
          throw new Error(`Wrong value passed to inject.${prop} in module "${moduleName}". Please use wire.into to configure injects.`)
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

function validateConfig<Structure>(structure: Structure, config: SystemConfig<Structure>): void {
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

/**
 * Creates a system that can be configured later.
 *
 * @remarks
 *
 * This is the main entry point for working with this library. Your app, or some
 * part of your app will likely be defined as a system.
 *
 * The structure of a system is a plain JS object, that defines everything that
 * exists in this system. Check out this imaginary example:
 * ```ts
 * const system = createSystem({
 *   dbConnection: PostgresDBConnectorModule,
 *   apiServer: APIModule,
 * });
 * ```
 * In this example we have defined a simple system with two Modules: dbConnection
 * and apiServer. Having them in one system allows them to depend on each other
 * when configuring the system:
 * ```ts
 * system.configure(wire => ({
 *   apiServer: {
 *     config: {
 *       dbConnection: wire.from('dbConnection')
 *     }
 *   }
 * }));
 * ```
 * Code above means that dbConnection will be passed to the apiServer's init function
 * when system starts. Here's how APIModule could be defined:
 * ```ts
 * import express from 'express';
 *
 * function ExpressModule(
 *   config: {
 *     dbConnection: DBConnection,
 *     port?: 3000
 *   }
 * ) {
 *   const app = express();
 *   // Pass dbConnection somewhere
 *   // ...
 *   app.listen(config.port, () => console.log(`Example app listening at http://localhost:${port}`));
 * }
 * ```
 *
 * Note that you don't need to pass any type info to createSystem (in most cases),
 * because TypeScript can infer everything.
 *
 * @param structure - A definition of modules for this system
 */
export function createSystem<Structure extends {}>(structure: Structure): System<Structure> {
  if (typeof structure !== 'object' || structure === null || Array.isArray(structure)) {
    throw new Error('createSystem only accepts objects');
  }
  return {
    configure(closure): ConfiguredSystem<Structure> {
      if (typeof closure !== 'function') {
        throw new Error('System.configure only accepts functions');
      }
      const wireFactory: WireFactory<Structure> = {
        from(key) {
          if (typeof key !== 'string') {
            throw new Error('WireFactory.from only accepts strings');
          }
          if (!(key in structure)) {
            const validKeys = Object.getOwnPropertyNames(structure);
            throw new Error(`WireFactory.from called with unknown key "${key}". Valid keys for this system are ${prettyPrintArray(validKeys)}`)
          }
          return new InputWire(key as string);
        },
        into(key, ...config) {
          if (typeof key !== 'string') {
            throw new Error(`WireFactory.into only accepts strings, but received ${JSON.stringify(key) || key && key.toString()}`)
          }
          if (!(key in structure)) {
            const validKeys = Object.getOwnPropertyNames(structure).filter(prop => isSocket(structure[prop]));
            throw new Error(`WireFactory.into called with unknown key "${key}". Valid output keys for this system are ${prettyPrintArray(validKeys)}`)
          }
          if (!isSocket(structure[key])) {
            const validKeys = Object.getOwnPropertyNames(structure).filter(prop => isSocket(structure[prop]));
            throw new Error(`WireFactory.into called with key "${key}", but "${key}" is not a Socket in this system. Valid socket keys for this system are ${prettyPrintArray(validKeys)}`)
          }
          return new OutputWire(key as string, ...config);
        }
      };

      const config = closure(wireFactory);

      validateConfig(structure, config);

      const weakTypeConfig: {
        [key: string]: {
          disabled?: boolean;
          config?: unknown;
          inject?: {
            [injectKey: string]: OutputWire<unknown, unknown[]>;
          };
        };
      } = config;

      const configuredSystem = () => {
        const moduleDepsPairs: (readonly [
          string,
          {
            isSocket: boolean;
            inputs: FilterDeepResult<InputWire<unknown>>;
            outputs?: {[key: string]: InjectConfig<unknown>};
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

        /**
         * Track how many modules are initialized, so we can destroy them properly in case system fails to start
         */
        let completedModulesIndex = 0;

        const context: Partial<MapToResultTypes<Structure>> = {};
        const initializedModules: {[key: string]: {stop(): void; inject(): unknown}} = {};

        try {
          for (const moduleName of sortedModules) {
            const module = moduleName.replace(/_empty_init_RESERVED$/, '');

            // If context already has a module, that means that it's a sink, because sinks appear in sortedModules twice
            if (context[module]) {
              context[module] = context[module].resolve()
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
                  throw new Error(
                    'Socket wasn\'t resolved before a dependant module started to initialize.'
                    + '\nSomething is wrong with the world.'
                    + `\nDependant module is "${module}". Socket is "${inputWire.prop}"`
                  );
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
                context[outputWire.prop] = maybeSink.accept(module, inject, ...outputWire.config);
              } else {
                throw new Error(`Tried to inject a value from "${module}" into "${outputWire.prop}", but "${outputWire.prop}" is not a Socket"`)
              }
            };

            //
            // Starting modules
            //

            if (isSocket(currentModule)) {
              context[module] = currentModule;
            } else if (typeof currentModule === 'function') {
              const initialized = currentModule(deps);

              if (isModuleBuilder(initialized)) {
                throw new Error(`Module "${module}" was resolved to a ModuleBuilder. Please check that you call .build()`);
              }

              if (isModule(initialized)) {
                const {instance, stop, inject} = initialized;

                initializedModules[module] = {stop, inject};
                context[module] = instance;
              } else {
                context[module] = initialized;
              }
            } else {
              context[module] = currentModule as unknown;
            }

            completedModulesIndex++;

            if (initializedModules[module] || (moduleConfig && moduleConfig.inject && moduleConfig.inject.self)) {
              const inject = () => {
                if (initializedModules[module]) {
                  const result = initializedModules[module].inject();
                  if (typeof result === 'object' && result !== null && result !== undefined) {
                    return result;
                  }
                }
              };
              const injects = {
                ...inject(),
                self: context[module],
              };
              const injectConfig = moduleDepsMap[module] && moduleDepsMap[module].outputs || {};

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

                if (Array.isArray(outputWireOrArray)) {
                  outputWireOrArray.forEach(wire => acceptInject(wire, injects[key]));
                } else {
                  const outputWire = outputWireOrArray as OutputWire<unknown, unknown[]>;

                  acceptInject(outputWire, injects[key]);
                }
              });
            }
          }
        } catch (err) {
          for (let i = completedModulesIndex - 1; i >= 0; i--) {
            const moduleName = sortedModules[i];

            if (weakTypeConfig[moduleName] && weakTypeConfig[moduleName].disabled) {
              continue;
            }
            if (initializedModules[moduleName] && initializedModules[moduleName].stop) {
              initializedModules[moduleName].stop();
            }
          }

          throw err;
        }
        const fullContext = context as MapToResultTypes<Structure>;

        return createModule(fullContext)
          .withDestructor(() => {
            for (let i = sortedModules.length - 1; i >= 0; i--) {
              const moduleName = sortedModules[i];

              if (weakTypeConfig[moduleName] && weakTypeConfig[moduleName].disabled) {
                continue;
              }
              if (initializedModules[moduleName] && initializedModules[moduleName].stop) {
                initializedModules[moduleName].stop!();
              }
            }
          })
          .build();
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
export { Module, createModule }
