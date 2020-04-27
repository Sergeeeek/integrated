import { InputWire } from "./InputWire";
import { createArraySocket } from "./Socket";

describe("ArraySocket", () => {
  it("should be initialized as empty, as observed from the result of .resolve", () => {
    const socket = createArraySocket();

    expect(socket.resolve()).toEqual([]);
  });

  it("should accept and return a new socket, which resolves to an array with that value", () => {
    const socket = createArraySocket<string>();
    const socketWithVal = socket.accept("module", "asdf");

    // Old socket is still empty
    expect(socket.resolve()).toEqual([]);

    expect(socketWithVal.resolve()).toEqual(["asdf"]);
  });

  it('should resolve values in dependency order when they supply "before" in config', () => {
    const socket = createArraySocket<string>()
      .accept("module1", "asdf")
      .accept("module2", "qwer", { before: new InputWire("module1") });

    expect(socket.resolve()).toEqual(["qwer", "asdf"]);
  });

  it('should resolve values in dependency order when they supply "after" in config', () => {
    const socket = createArraySocket<string>()
      .accept("module1", "asdf", { after: new InputWire("module2") })
      .accept("module2", "qwer");

    expect(socket.resolve()).toEqual(["qwer", "asdf"]);
  });

  it('should not throw an error when non-existant dependency is specified in "before" or "after"', () => {
    const socket = createArraySocket<string>().accept("module1", "asdf", {
      after: new InputWire("module2"),
    });

    expect(() => socket.resolve()).not.toThrow();
  });

  it("should throw an error when cyclic dependencies are detected", () => {
    const socket = createArraySocket<string>()
      .accept("module1", "asdf", { after: new InputWire("module2") })
      .accept("module2", "qwer", { after: new InputWire("module1") });

    expect(() => socket.resolve()).toThrowErrorMatchingInlineSnapshot(
      `"Cyclic dependency, node was:\\"module2\\""`
    );
  });
});
