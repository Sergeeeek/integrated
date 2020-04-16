
export class InputWire<T> {
  constructor(public readonly prop: string, public readonly isOptional: boolean = false, public readonly mapper: Function = (id: T) => id) {}

  get optional(): InputWire<undefined | T> {
    return new InputWire<undefined | T>(this.prop, true, this.mapper);
  }

  map<U>(mapper: (value: T) => U): InputWire<U> {
    return new InputWire<U>(this.prop, this.isOptional, (value: T) => mapper(this.mapper(value)));
  }
}

export function isInputWire(value: unknown): value is InputWire<unknown> {
  return value instanceof InputWire;
}
