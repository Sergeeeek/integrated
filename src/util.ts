type Tail<T extends unknown[]> = ((...list: T) => void) extends ((head: unknown, ...tail: infer Tail) => void) ? Tail : [];

type DeepGet<T, Path extends (string | number | symbol)[]> = (Path extends [infer Head, ...unknown[]]
  ? Head extends keyof T ? { value: DeepGet<T[Head], Tail<Path>> } : {value: never}
  : {value: T})['value'];

type DeepSet<T, Path extends (string | number | symbol)[], Val> =
  Path extends [infer Head, ...unknown[]] ?
    {
      [K in keyof T]: K extends Head ? DeepSet<T[K], Tail<Path>, Val> : T[K]
    }
  : Val

function get<T, Path extends (string | number | symbol)[]>(obj: T, path: Path): DeepGet<T, Path> {
  if (obj === null || obj === undefined) {
    return obj;
  }

  let cur = obj;


}

function last<T>(arr: readonly T[]): T {
  return arr[arr.length - 1];
}

function set<T, Path extends (string | number | symbol)[], Val>(obj: T, path: Path, val: Val): DeepSet<T, Path, Val> {
  const objPath = [obj];

  for (const prop of path) {
    if (objPath.length === path.length) {
      break;
    }
    objPath.push(last(objPath)[prop]);
  }

  //objPath.reduceRight((acc, next) => , {[last(path)]: val})
}
