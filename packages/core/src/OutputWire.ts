
export class OutputWire<T, Config extends unknown[]>  {
  _contravarianceHack?(arg: T): void;
  readonly config: Config;
  constructor(public readonly prop: string, public readonly mapper: Function = (id: T) => id, ...config: Config) {
    this.config = config;
  }

  // map<U, V extends T = T>(mapper: (val: V) => U): OutputWire<U, Config> {
  //   return new OutputWire(this.prop, (val: V) => mapper(this.mapper(val)), ...this.config);
  // }
}

export function isOutputWire(value: unknown): value is OutputWire<unknown, unknown[]> {
  return value instanceof OutputWire;
}
