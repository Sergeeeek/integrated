import { createSystem, createArraySocket } from "./index";
import { InputWire } from "./InputWire";

describe("WireFactory", () => {
  describe("wire.from", () => {
    const exampleSystem = createSystem({
      constant: "constant",
      func: (deps: { something: string }) => deps.something,
    });

    it("should accept a prop name of another system module", () => {
      expect(() =>
        exampleSystem.configure((wire) => ({
          func: {
            config: {
              something: wire.from("constant"),
            },
          },
        }))
      ).not.toThrow();
    });

    test.each([
      undefined,
      null,
      [],
      Symbol(),
      123,
      true,
      {},
      (): void => undefined,
    ])("should not accept %p", (input) => {
      expect(() =>
        exampleSystem.configure((wire) => ({
          func: {
            config: {
              // @ts-ignore
              something: wire.from(input),
            },
          },
        }))
      ).toThrowError("WireFactory.from only accepts strings");
    });

    it("should not accept props that don't exist in the system", () => {
      expect(() =>
        exampleSystem.configure((wire) => ({
          func: {
            config: {
              // @ts-ignore
              something: wire.from("someRandomKey"),
            },
          },
        }))
      ).toThrowErrorMatchingInlineSnapshot(
        `"WireFactory.from called with unknown key \\"someRandomKey\\". Valid keys for this system are [\\"constant\\",\\"func\\"]"`
      );
    });

    it("should return an InputWire", () => {
      const configuredSystem = exampleSystem.configure((wire) => ({
        func: {
          config: {
            something: wire.from("constant"),
          },
        },
      }));

      const wireInResult = configuredSystem.config.func.config.something;

      expect(wireInResult).toBeInstanceOf(InputWire);
      expect((wireInResult as InputWire<string>).prop).toEqual("constant");
    });
  });

  describe("wire.into", () => {
    const exampleSystem = createSystem({
      arraySocket: createArraySocket<number>(),
      constant: 123,
      otherConstant: "constant",
    });

    it("should accept a prop name of another system module", () => {
      expect(() =>
        exampleSystem.configure((wire) => ({
          constant: {
            inject: {
              self: wire.into("arraySocket"),
            },
          },
        }))
      ).not.toThrow();
    });

    test.each([
      [undefined, "undefined"],
      [null, "null"],
      [[], "[]"],
      [Symbol(), "Symbol()"],
      [123, "123"],
      [true, "true"],
      [{}, "{}"],
      [(): void => undefined, "function () { return undefined; }"],
    ])("should not accept %p", (input, string) => {
      expect(() =>
        exampleSystem.configure((wire) => ({
          constant: {
            // @ts-ignore
            inject: { self: wire.into(input) },
          },
        }))
      ).toThrowError(
        `WireFactory.into only accepts strings, but received ${string}`
      );
    });

    it("should not accept a prop that doesn't exist in the system", () => {
      expect(() =>
        exampleSystem.configure((wire) => ({
          constant: {
            // @ts-ignore
            inject: { self: wire.into("someRandomKey") },
          },
        }))
      ).toThrowErrorMatchingInlineSnapshot(
        `"WireFactory.into called with unknown key \\"someRandomKey\\". Valid output keys for this system are [\\"arraySocket\\"]"`
      );
    });

    it("should not accept a prop that points to something other than a Socket", () => {
      expect(() =>
        exampleSystem.configure((wire) => ({
          constant: {
            // @ts-ignore
            inject: { self: wire.into("otherConstant") },
          },
        }))
      ).toThrowErrorMatchingInlineSnapshot(
        `"WireFactory.into called with key \\"otherConstant\\", but \\"otherConstant\\" is not a Socket in this system. Valid socket keys for this system are [\\"arraySocket\\"]"`
      );
    });
  });
});
