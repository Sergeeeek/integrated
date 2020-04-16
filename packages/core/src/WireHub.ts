import * as toposort from 'toposort';

import {InputWire} from './InputWire';
import {flatten} from './util';

const WireHubSymbol = '@______internal_WireHubSymbol';

const WireHubProto: {
  [WireHubSymbol]: true
} = Object.defineProperty({}, WireHubSymbol, {
  enumerable: false,
  configurable: false,
  writable: false,
  value: true,
});

export interface WireHub<TAccept, TReturn, TConfig extends unknown[]> {
  [WireHubSymbol]: true;
  accept(from: string, value: TAccept, ...config: TConfig): WireHub<TAccept, TReturn, TConfig>;
  resolve(): TReturn;
}

export function isWireHub(value: unknown): value is WireHub<unknown, unknown, unknown[]> {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'object') {
    const obj = value as {[key: string]: unknown};

    return Boolean(obj[WireHubSymbol]);
  }

  return false;
}

export type ArrayWireHubConfig = {after?: InputWire<unknown>, before?: InputWire<unknown>}
export type ArrayWireHub<T> = WireHub<T, Array<T>, [ArrayWireHubConfig?]>

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
