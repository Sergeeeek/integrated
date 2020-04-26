
export class OutputWire<T, Config extends unknown[]>  {
  _contravarianceHack?(arg: T): void;
  readonly config: Config;
  constructor(public readonly prop: string, ...config: Config) {
    this.config = config;
  }
}

export function isOutputWire(value: unknown): value is OutputWire<unknown, unknown[]> {
  return value instanceof OutputWire;
}
