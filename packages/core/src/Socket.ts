import * as toposort from 'toposort';

import {InputWire} from './InputWire';
import {flatten} from './util';

const SocketSymbol = '@______internal_SocketSymbol';

const SocketProto: {
  [SocketSymbol]: true
} = Object.defineProperty({}, SocketSymbol, {
  enumerable: false,
  configurable: false,
  writable: false,
  value: true,
});

export interface Socket<TAccept, TReturn, TConfig extends unknown[]> {
  [SocketSymbol]: true;
  accept(from: string, value: TAccept, ...config: TConfig): Socket<TAccept, TReturn, TConfig>;
  resolve(): TReturn;
}

export function isSocket(value: unknown): value is Socket<unknown, unknown, unknown[]> {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'object') {
    const obj = value as {[key: string]: unknown};

    return Boolean(obj[SocketSymbol]);
  }

  return false;
}

export type ArraySocketConfig = {after?: InputWire<unknown>, before?: InputWire<unknown>}
export type ArraySocket<T> = Socket<T, Array<T>, [ArraySocketConfig?]>

export function createArraySocket<T>(entries: {[key: string]: {value: T, config?: ArraySocketConfig}} = {}): ArraySocket<T> {
  return Object.assign(Object.create(SocketProto) as typeof SocketProto, {
    accept(from: string, value: T, config?: ArraySocketConfig) {
      return createArraySocket({
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
