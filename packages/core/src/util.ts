type Tail<T extends readonly unknown[]> = ((...list: T) => void) extends ((head: unknown, ...tail: infer Tail) => void) ? Tail : [];

type DeepGet<T, Path extends readonly (string | number | symbol)[]> = (Path extends [infer Head, ...unknown[]]
  ? Head extends keyof T ? { value: DeepGet<T[Head], Tail<Path>> } : {value: never}
  : {value: T})['value'];

type DeepSet<T, Path extends readonly (string | symbol)[], Val> =
  Path extends readonly [infer Head, ...unknown[]]
    ? {
      [K in keyof T]: K extends Head ? DeepSet<T[K], Tail<Path>, Val> : T[K]
    }
    : Val

function last<T>(arr: readonly T[]): T {
  return arr[arr.length - 1];
}

function arrayReplaceIndex<T>(arr: readonly T[], index: number, val: T): T[] {
  return [
    ...arr.slice(0, index),
    val,
    ...arr.slice(index + 1),
  ];
}

export function deepSet<T, Path extends readonly (string | symbol)[], Val>(obj: T, path: Path, val: Val): DeepSet<T, Path, Val> {
  const objPath = [obj];

  for (const prop of path) {
    if (objPath.length === path.length) {
      objPath.push(val as any);
      break;
    }
    if (last(objPath) === null || last(objPath) === undefined) {
      throw new Error(`Path ${path.join('.')} is invalid on ${JSON.stringify(obj, null, 2)}`);
    }
    const next = last(objPath)[prop];

    objPath.push(next);
  }

  return objPath.reduceRight((acc: any, next: any, ind: number) => {
    if (next === undefined || next === null) {
      throw new Error(`Path ${path.join('.')} is invalid on ${JSON.stringify(obj, null, 2)}`);
    } else if (Array.isArray(next)) {
      if (typeof path[ind] === 'symbol') {
        throw new Error('Tried to index array with a symbol');
      }
      const index = parseInt(path[ind] as string, 10);
      if (isNaN(ind)) {
        throw new Error('Passed invalid string as index to arrayReplaceIndex.')
      }
      return arrayReplaceIndex(next, index, acc);
    } else {
      return {
        ...next,
        [path[ind]]: acc,
      };
    }
  }) as any;
}

export function flatten<T>(array: ReadonlyArray<ReadonlyArray<T>>): ReadonlyArray<T> {
  return array.reduce((acc, next) => acc.concat(next), []);
}

function isPrimitiveOrEmpty(v: unknown): v is (string | number | boolean | undefined | null | symbol | Function) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'symbol' || typeof v === 'function' || v === undefined || v === null;
}

export type FilterDeepResult<Search> = ReadonlyArray<{path: (string | symbol)[]; value: Search}>;

export function filterDeep<T, TSearch>(obj: T, predicate: (value: unknown) => value is TSearch, path: (string | symbol)[] = []): FilterDeepResult<TSearch> {
  if (predicate(obj)) {
    return [{path: path, value: obj}];
  }

  if (Array.isArray(obj)) {
    return flatten(obj.map((elem, index) => filterDeep(elem, predicate, [...path, index.toString()])));
  }

  if (isPrimitiveOrEmpty(obj)) {
    return [];
  }

  if (obj instanceof Object) {
    const indexedObject = (obj as any);
    return flatten(
      [...Object.getOwnPropertyNames(indexedObject), ...(typeof Object.getOwnPropertySymbols === 'function' ? Object.getOwnPropertySymbols(indexedObject) : [])]
        .map(prop => filterDeep(indexedObject[prop], predicate, [...path, prop]))
    );
  }

  // Don't know how to traverse that
  return [];
}

export function fromPairs<U>(input: ReadonlyArray<readonly [string, U]>): {[key: string]: U} {
  return input.reduce<{[key: string]: U}>((acc, [key, val]) => {
    return {
      ...acc,
      [key]: val
    }
  }, {});
}

/**
 * Returns all values that exist in the second and don't exist in the first set
 */
export function setDifference<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  const result = new Set<T>();

  for (const val of set2) {
    if (!set1.has(val)) {
      result.add(val);
    }
  }

  return result;
}
