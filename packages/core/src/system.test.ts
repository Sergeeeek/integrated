import { createSystem, createModule } from ".";

describe("system", () => {
  describe("createSystem", () => {
    it("should accept empty structure", () => {
      expect(() => createSystem({})).not.toThrow();
    });

    test.each([
      undefined,
      null,
      function test() {},
      [],
      Symbol(),
      123,
      "string",
      true,
    ])("should not accept %p for structure", (structure) => {
      // @ts-ignore-next-line
      expect(() => createSystem(structure)).toThrowError(
        "createSystem only accepts objects"
      );
    });

    it("should return a configurable system", () => {
      const system = createSystem({});

      expect(system).toMatchObject({
        configure: expect.any(Function),
      });
    });
  });

  describe("system configure function", () => {
    it("should accept a configuration closure", () => {
      const system = createSystem({});

      expect(() => system.configure(() => ({}))).not.toThrow();
    });

    test.each([undefined, null, [], Symbol(), 123, "string", true, {}])(
      "should not accept %p",
      (input) => {
        const system = createSystem({});

        // @ts-ignore-next-line
        expect(() => system.configure(input)).toThrowError(
          "System.configure only accepts functions"
        );
      }
    );

    it("should call the configuration closure with an instance of WireFactory", () => {
      let wireFactory;
      createSystem({}).configure((wires) => {
        wireFactory = wires;

        return {};
      });

      expect(wireFactory).toMatchObject({
        in: expect.any(Function),
        out: expect.any(Function),
      });
    });

    test.each([
      undefined,
      null,
      [],
      Symbol(),
      123,
      "string",
      true,
      () => undefined,
    ])("should check that config closure doesn't return %p", (config) => {
      expect(() =>
        // @ts-ignore
        createSystem({}).configure(() => config)
      ).toThrowErrorMatchingSnapshot();
    });

    it("should accept a plain object from the configuration closure", () => {
      expect(() => createSystem({}).configure(() => ({}))).not.toThrow();
    });

    it("should check that config doesn't contain any keys that don't exist in system structure", () => {
      const system = createSystem({
        module: () => undefined,
        module2: (deps: { myDependency: string }) => deps.myDependency,
      });

      expect(() =>
        system.configure(() => ({
          module2: {
            config: {
              myDependency: "asdf",
            },
          },
          nonExistingModule: {
            config: {
              asdf: 123,
            },
          },
        }))
      ).toThrowErrorMatchingInlineSnapshot(
        `"Config contains keys that don't exist in system definition. These keys are: [\\"nonExistingModule\\"]"`
      );
    });

    it('should check that only allowed module settings are "config", "inject" and "disabled"', () => {
      const system = createSystem({
        module: (deps: { string: string }) => deps.string,
      });

      expect(() =>
        system.configure(() => ({
          module: {
            invalidKeyHere: "asdf",
            config: {
              string: "string",
            },
            // typo on purpose
            imject: {},
          },
        }))
      ).toThrowErrorMatchingInlineSnapshot(
        `"Config for module \\"module\\" contains invalid keys: [\\"invalidKeyHere\\",\\"imject\\"]. Only these keys are allowed: [\\"config\\",\\"inject\\",\\"disabled\\"]"`
      );
    });
  });

  describe("system start", () => {
    it("should call any modules in the structure if they are functions", () => {
      const structure = {
        func1: jest.fn(() => "func1"),
        func2: jest.fn(() => "func2"),
        func3: jest.fn(() => "func3"),
      };
      const system = createSystem(structure);

      const configuredSystem = system.configure(() => ({}));

      configuredSystem();

      expect(structure.func1).toHaveBeenCalledTimes(1);
      expect(structure.func2).toHaveBeenCalledTimes(1);
      expect(structure.func3).toHaveBeenCalledTimes(1);
    });

    describe('dependency resolution', () => {
      it('should resolve a wire.in to the value of the constant module', () => {
        const module2 = jest.fn((deps: {dependency: string}) => deps.dependency);
        const system = createSystem({
          module1: 'constant',
          module2,
        });

        const configuredSystem = system.configure(wire => ({
          module2: {
            config: {
              dependency: wire.in('module1'),
            }
          }
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({dependency: 'constant'});
      });

      it('should resolve a wire.in call to the return value of the function module, instad of the function itself', () => {
        const module2 = jest.fn((deps: {dependency: string}) => deps.dependency);
        const configuredSystem = createSystem({
          module1: () => 'module1Instance',
          module2,
        }).configure(wire => ({
          module2: {
            config: {
              dependency: wire.in('module1'),
            }
          }
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({dependency: 'module1Instance'});
      });

      // TODO: Really need to think of better names to make it less confusing
      it('should resolve a wire.in call to the module type if the function returns a Module', () => {
        const module2 = jest.fn((deps: {dependency: string}) => deps.dependency);
        const configuredSystem = createSystem({
          module1: () => createModule('module1Instance'),
          module2,
        }).configure(wire => ({
          module2: {
            config: {
              dependency: wire.in('module1'),
            }
          }
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({dependency: 'module1Instance'});
      });
    });


    describe('order of initialization', () => {
      test('if module B depends on module A, then A should be initialized earlier than B', () => {
        const order: string[] = [];
        const configuredSystem = createSystem({
          A: () => order.push('A'),
          B: (deps: {A: number}) => order.push('B'),
        }).configure(wire => ({
          B: {
            config: {
              A: wire.in('A'),
            }
          }
        }));

        configuredSystem();

        expect(order).toEqual(['A', 'B']);
      });
    });
  });
});
