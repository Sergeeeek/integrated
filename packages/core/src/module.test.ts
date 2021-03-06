import { isModule, createModule } from "./Module";

describe("isModule", () => {
  test.each([
    undefined,
    null,
    [],
    Symbol(),
    123,
    "string",
    true,
    (): void => undefined,
    {},
  ])("should return false for %p", (val) => {
    expect(isModule(val)).toBe(false);
  });

  it("should return false for a ModuleBuilder", () => {
    expect(isModule(createModule("test"))).toBe(false);
  });

  it("should return true for a module built from ModuleBuilder", () => {
    expect(isModule(createModule("test").build())).toBe(true);
  });
});
