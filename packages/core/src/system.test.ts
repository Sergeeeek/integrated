import { InputWire } from "./InputWire";
import { createSystem, createModule } from ".";
import { flatten } from "./util";

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

    describe("dependency resolution", () => {
      it("should resolve a wire.in to the value of the constant module", () => {
        const module2 = jest.fn(
          (deps: { dependency: string }) => deps.dependency
        );
        const system = createSystem({
          module1: "constant",
          module2,
        });

        const configuredSystem = system.configure((wire) => ({
          module2: {
            config: {
              dependency: wire.in("module1"),
            },
          },
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({ dependency: "constant" });
      });

      it("should resolve a wire.in call to the return value of the function module, instad of the function itself", () => {
        const module2 = jest.fn(
          (deps: { dependency: string }) => deps.dependency
        );
        const configuredSystem = createSystem({
          module1: () => "functionModuleInstance",
          module2,
        }).configure((wire) => ({
          module2: {
            config: {
              dependency: wire.in("module1"),
            },
          },
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({
          dependency: "functionModuleInstance",
        });
      });

      // TODO: Really need to think of better names to make it less confusing
      it("should resolve a wire.in call to the module type if the function returns a Module", () => {
        const module2 = jest.fn(
          (deps: { dependency: string }) => deps.dependency
        );
        const configuredSystem = createSystem({
          module1: () => createModule("module1Instance"),
          module2,
        }).configure((wire) => ({
          module2: {
            config: {
              dependency: wire.in("module1"),
            },
          },
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({ dependency: "module1Instance" });
      });

      it("should resolve wire.in in nested structures such as objects, arrays", () => {
        const system = createSystem({
          constant: "constant",
          module: (deps: {
            value: string;
            array: string[];
            tuple: [string];
            nested: {
              value: string;
              deepNested: {
                value: string;
              };
            };
          }) => deps,
        });

        const configuredSystem = system.configure((wire) => ({
          module: {
            config: {
              value: wire.in("constant"),
              array: [wire.in("constant"), wire.in("constant")],
              tuple: [wire.in("constant")],
              nested: {
                value: wire.in("constant"),
                deepNested: {
                  value: wire.in("constant"),
                },
              },
            },
          },
        }));

        const result = configuredSystem().instance.module;

        expect(result).toEqual({
          value: "constant",
          array: ["constant", "constant"],
          tuple: ["constant"],
          nested: {
            value: "constant",
            deepNested: {
              value: "constant",
            },
          },
        });
      });

      it("should allow to pass inputwires inside of arrays as well as wrapping the array itself", () => {
        const system = createSystem({
          constant: "constant",
          arrayConstant: (deps: { constant: string }) => [deps.constant],
          module: (deps: { array1: string[]; array2: string[] }) => deps,
        });

        const configuredSystem = system.configure((wire) => {
          return {
            arrayConstant: {
              config: {
                constant: wire.in("constant"),
              },
            },
            module: {
              config: {
                array1: [wire.in("constant"), wire.in("constant")],
                array2: wire.in("arrayConstant"),
              },
            },
          };
        });

        const result = configuredSystem().instance.module;

        expect(result).toEqual({
          array1: ["constant", "constant"],
          array2: ["constant"],
        });
      });

      it("should give an error when you try to depend on a disabled module", () => {
        const configuredSystem = createSystem({
          constant: "constant",
          module: (deps: { constant: string }) => deps,
        }).configure((wire) => ({
          constant: {
            disabled: true,
          },
          module: {
            config: {
              constant: wire.in("constant"),
            },
          },
        }));

        expect(() => configuredSystem()).toThrowErrorMatchingSnapshot();
      });

      it('should allow to depend on disabled modules using wire.in(...).optional', () => {
        const configuredSystem = createSystem({
          constant: 'constant',
          module: (deps: { constant?: string }) => deps,
        }).configure(wire => ({
          constant: {
            disabled: true,
          },
          module: {
            config: {
              constant: wire.in('constant').optional
            }
          }
        }));

        expect(configuredSystem).not.toThrow();

        const result = configuredSystem();
        expect(result.instance.module.constant).toBeUndefined();
      });
    });

    describe("order of initialization", () => {
      function getOrderOfInitializationForDeps(
        edges: readonly [string, string][]
      ): string[] {
        const structure: {
          [key: string]: (
            deps: { [key: string]: number } & { order: string[] }
          ) => number;
        } & { order?: string[] } = {};
        structure.order = [];
        const allNodes = new Set(flatten(edges));
        for (const node of allNodes) {
          structure[node] = (
            deps: { [key: string]: number } & { order: string[] }
          ) => deps.order.push(node);
        }

        const result = createSystem(structure).configure((wire) => {
          const config = {};

          for (const node of allNodes) {
            config[node] = {
              config: {
                order: wire.in("order"),
              },
            };
          }

          // From dependent to dependency,
          // e.g. if A depends on B, then from = A and to = B
          for (const [from, to] of edges) {
            config[from] = {
              ...config[from],
              config: {
                ...config[from].config,
                [to]: wire.in(to),
              },
            };
          }

          return config;
        })();

        return result.instance.order!;
      }

      test("if module B depends on module A, then A should be initialized earlier than B", () => {
        const order = getOrderOfInitializationForDeps([["B", "A"]]);
        expect(order).toEqual(["A", "B"]);
      });

      test("if module C depends on B and B depends on A, then the order of initialization should be A => B => C", () => {
        const order = getOrderOfInitializationForDeps([
          ["C", "B"],
          ["B", "A"],
        ]);

        expect(order).toEqual(["A", "B", "C"]);
      });

      test("if B depends on A and A depends on C, then order of init should be C => A => B", () => {
        const order = getOrderOfInitializationForDeps([
          ["B", "A"],
          ["A", "C"],
        ]);

        expect(order).toEqual(["C", "A", "B"]);
      });
    });
  });
});
