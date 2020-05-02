import { createSystem } from ".";
import { flatten } from "./util";
import { Module } from "../dist";

export function createSystemFromDeps(
  edges: readonly [string, string][],
  moduleFactory: (self: string) => (deps: { [key: string]: unknown }) => unknown
): Module<{ [key: string]: unknown }, {}> {
  const structure: {
    [key: string]: (deps: { [key: string]: unknown }) => unknown;
  } = {};
  const allNodes = new Set(flatten(edges));
  for (const node of allNodes) {
    structure[node] = moduleFactory(node);
  }

  const result = createSystem(structure).configure((wire) => {
    const config: {
      [key: string]: { config: { [key: string]: unknown } };
    } = {};

    // From dependent to dependency,
    // e.g. if A depends on B, then from = A and to = B
    for (const [from, to] of edges) {
      const configFrom = config[from] ?? {};
      config[from] = {
        ...configFrom,
        config: {
          ...configFrom.config,
          [to]: wire.from(to),
        },
      };
    }

    return config;
  })();

  return result;
}

export function withMemoryErrorLogger<T>(
  closure: () => T
): { stdErr: unknown[]; result?: T } {
  const stdErr: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]): void => {
    stdErr.push(args);
  };

  try {
    const result = closure();
    return {
      result,
      stdErr,
    };
  } catch (e) {
    return {
      stdErr,
    };
  } finally {
    console.error = originalError;
  }
}
