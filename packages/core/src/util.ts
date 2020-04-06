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


type Test = DeepSet<{
  readonly nested: [{
    readonly key: 'asdf'
  }]
}, readonly ['nested', '0', 'key'], 123>;

// function get<T, Path extends (string | number | symbol)[]>(obj: T, path: Path): DeepGet<T, Path> {
//   if (obj === null || obj === undefined) {
//     return obj;
//   }
//
//   let cur = obj;
//
//
// }
//
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
