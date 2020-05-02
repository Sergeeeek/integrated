import { InputWire } from "./InputWire";
import { createSystem, createModule, createArraySocket, Module } from ".";
import { createSystemFromDeps, withMemoryErrorLogger } from "./testUtil";

describe("system", () => {
  describe("createSystem", () => {
    it("should accept empty structure", () => {
      expect(() => createSystem({})).not.toThrow();
    });

    test.each([
      undefined,
      null,
      function test(): void {
        return undefined;
      },
      [],
      Symbol(),
      123,
      "string",
      true,
    ])("should not accept %p for structure", (structure) => {
      // @ts-ignore
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
        from: expect.any(Function),
        into: expect.any(Function),
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
      (): void => undefined,
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

    it("should not initialize modules which are disabled", () => {
      const structure = {
        module1: jest.fn(() => "module1"),
      };
      const configuredSystem = createSystem(structure).configure(() => ({
        module1: { disabled: true },
      }));

      configuredSystem();

      expect(structure.module1).not.toHaveBeenCalled();
    });

    it("should throw an error when you don't call module.build() on a module builder", () => {
      const configuredSystem = createSystem({
        module: () => createModule("test"),
      }).configure(() => ({}));

      expect(() => configuredSystem()).toThrowErrorMatchingInlineSnapshot(
        `"Module \\"module\\" was resolved to a ModuleBuilder. Please check that you call .build()"`
      );
    });

    it("should stop initialized modules if system encountered an error while starting", () => {
      const destructor = jest.fn();
      const configuredSystem = createSystem({
        normalModule: () =>
          createModule("test").withDestructor(destructor).build(),
        failingModule: (deps: { normalModule: string }): string => {
          throw new Error("Test error");
        },
        afterFailingModule: (deps: { failingModule: string }) => {
          return createModule("shouldNotGetThere")
            .withDestructor(destructor)
            .build();
        },
      }).configure((wire) => ({
        failingModule: {
          config: {
            normalModule: wire.from("normalModule"),
          },
        },
        afterFailingModule: {
          config: {
            failingModule: wire.from("failingModule"),
          },
        },
      }));

      expect(() => configuredSystem()).toThrow();

      // Called for normalModule, not called for afterFailingModule
      expect(destructor).toHaveBeenCalledTimes(1);
    });

    describe("dependency resolution", () => {
      it("should resolve a wire.from to the value of the constant module", () => {
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
              dependency: wire.from("module1"),
            },
          },
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({ dependency: "constant" });
      });

      it("should resolve a wire.from call to the return value of the function module, instad of the function itself", () => {
        const module2 = jest.fn(
          (deps: { dependency: string }) => deps.dependency
        );
        const configuredSystem = createSystem({
          module1: () => "functionModuleInstance",
          module2,
        }).configure((wire) => ({
          module2: {
            config: {
              dependency: wire.from("module1"),
            },
          },
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({
          dependency: "functionModuleInstance",
        });
      });

      // TODO: Really need to think of better names to make it less confusing
      it("should resolve a wire.from call to the module type if the function returns a Module", () => {
        const module2 = jest.fn(
          (deps: { dependency: string }) => deps.dependency
        );
        const configuredSystem = createSystem({
          module1: () => createModule("module1Instance").build(),
          module2,
        }).configure((wire) => ({
          module2: {
            config: {
              dependency: wire.from("module1"),
            },
          },
        }));

        configuredSystem();

        expect(module2).toHaveBeenCalledWith({ dependency: "module1Instance" });
      });

      it("should resolve wire.from from nested structures such as objects, arrays", () => {
        const system = createSystem({
          constant: "constant",
          module: (deps: {
            value: string;
            array: string[];
            tuple: [string];
            map: Map<string, string>;
            nested: {
              value: string;
              deepNested: {
                value: string;
              };
              nestedMap: Map<
                number,
                {
                  value: string;
                }
              >;
            };
          }) => deps,
        });

        const configuredSystem = system.configure((wire) => ({
          module: {
            config: {
              value: wire.from("constant"),
              array: [wire.from("constant"), wire.from("constant")],
              tuple: [wire.from("constant")],
              map: new Map([["key", wire.from("constant")]]),
              nested: {
                value: wire.from("constant"),
                deepNested: {
                  value: wire.from("constant"),
                },
                // TS can't infer a union type of values for an array of tuple KV pairs
                nestedMap: new Map<
                  number,
                  | InputWire<{ value: string }>
                  | { value: string | InputWire<string> }
                >([
                  [0, { value: wire.from("constant") }],
                  [1, wire.from("constant").map((c) => ({ value: c }))],
                ]),
              },
            },
          },
        }));

        const result = configuredSystem().instance.module;

        expect(result).toEqual({
          value: "constant",
          array: ["constant", "constant"],
          tuple: ["constant"],
          map: new Map([["key", "constant"]]),
          nested: {
            value: "constant",
            deepNested: {
              value: "constant",
            },
            nestedMap: new Map([
              [0, { value: "constant" }],
              [1, { value: "constant" }],
            ]),
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
                constant: wire.from("constant"),
              },
            },
            module: {
              config: {
                array1: [wire.from("constant"), wire.from("constant")],
                array2: wire.from("arrayConstant"),
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
              constant: wire.from("constant"),
            },
          },
        }));

        expect(() => configuredSystem()).toThrowErrorMatchingSnapshot();
      });

      it("should allow to depend on disabled modules using wire.from(...).optional", () => {
        const configuredSystem = createSystem({
          constant: "constant",
          module: (deps: { constant?: string }) => deps,
        }).configure((wire) => ({
          constant: {
            disabled: true,
          },
          module: {
            config: {
              constant: wire.from("constant").optional,
            },
          },
        }));

        expect(configuredSystem).not.toThrow();

        const result = configuredSystem();
        expect(result.instance.module.constant).toBeUndefined();
      });

      it("should allow map one InputWire to another", () => {
        const configuredSystem = createSystem({
          configTime: new Date("2020-04-25T00:00:00.000Z"),
          module: (deps: { startTime: string }) => deps.startTime,
        }).configure((wire) => ({
          module: {
            config: {
              startTime: wire
                .from("configTime")
                .map((date) => date.toISOString()),
            },
          },
        }));

        const result = configuredSystem().instance.module;

        expect(result).toBe("2020-04-25T00:00:00.000Z");
      });

      describe("with sockets", () => {
        it("should allow to chain multiple maps together", () => {
          const configuredSystem = createSystem({
            constant: 10,
            module: (deps: { something: string }) => deps.something,
          }).configure((wire) => ({
            module: {
              config: {
                something: wire
                  .from("constant")
                  .map((n) => new Array<string>(n).fill("a"))
                  .map((a) => a.join(""))
                  .map((s) => s.toUpperCase()),
              },
            },
          }));

          const result = configuredSystem().instance.module;

          expect(result).toBe("AAAAAAAAAA");
        });

        it("should resolve array socket to an array value", () => {
          const configuredSystem = createSystem({
            socket: createArraySocket<number>(),
            number1: 1,
            number2: 2,
            number3: 3,
            module: (deps: { arrayOfNums: number[] }) =>
              new Set(deps.arrayOfNums),
          }).configure((wire) => ({
            number1: {
              inject: { self: wire.into("socket") },
            },
            number2: {
              inject: { self: wire.into("socket") },
            },
            number3: {
              inject: { self: wire.into("socket") },
            },
            module: {
              config: {
                arrayOfNums: wire.from("socket"),
              },
            },
          }));

          const result = configuredSystem().instance.module;

          expect(result).toEqual(new Set([1, 2, 3]));
        });

        it("should allow to map the resolved value of a socket when depending on a socket", () => {
          const configuredSystem = createSystem({
            socket: createArraySocket<number>(),
            number1: 1,
            number2: 2,
            number3: 3,
            module: (deps: { socketLength: number }) => deps.socketLength,
          }).configure((wire) => ({
            number1: { inject: { self: wire.into("socket") } },
            number2: { inject: { self: wire.into("socket") } },
            number3: { inject: { self: wire.into("socket") } },
            module: {
              config: {
                socketLength: wire.from("socket").map((arr) => arr.length),
              },
            },
          }));

          const result = configuredSystem().instance.module;

          expect(result).toBe(3);
        });
      });
    });

    describe("order of initialization", () => {
      function getOrderOfInitializationForDeps(
        edges: readonly [string, string][]
      ): readonly string[] {
        const order: string[] = [];
        createSystemFromDeps(edges, (self) => (): number => order.push(self));

        return order;
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

      describe("injects", () => {
        it("should take take value from injects of a module and put it into a socket specified by wire.into", () => {
          const configuredSystem = createSystem({
            socket: createArraySocket<string>(),
            module: () =>
              createModule(undefined)
                .withInjects(() => ({
                  test: "string",
                }))
                .build(),
          }).configure((wire) => ({
            module: {
              inject: {
                test: wire.into("socket"),
              },
            },
          }));

          const result = configuredSystem().instance.socket;

          expect(result).toEqual(["string"]);
        });

        it("should allow to inject into multiple sockets by passing an array of OutputWires", () => {
          const configuredSystem = createSystem({
            socket1: createArraySocket<string>(),
            socket2: createArraySocket<string>(),
            constant: "constant",
          }).configure((wire) => ({
            constant: {
              inject: { self: [wire.into("socket1"), wire.into("socket2")] },
            },
          }));

          const result = configuredSystem().instance;

          expect(result.socket1).toEqual(["constant"]);
          expect(result.socket2).toEqual(["constant"]);
        });

        it("should throw an error when trying to inject into a disabled socket", () => {
          const configuredSystem = createSystem({
            socket: createArraySocket<string>(),
            constant: "constant",
          }).configure((wire) => ({
            socket: { disabled: true },
            constant: { inject: { self: wire.into("socket") } },
          }));

          expect(() => configuredSystem()).toThrowErrorMatchingInlineSnapshot(
            `"Tried to inject a value from \\"constant\\" into \\"socket\\", but Socket \\"socket\\" is disabled"`
          );
        });

        it("should throw an error when trying to inject into something other than a socket", () => {
          const system = createSystem({
            constant1: "constant",
            constant2: "constant",
          });

          expect(() =>
            system.configure((wire) => ({
              constant1: {
                inject: {
                  // @ts-ignore
                  self: wire.into("constant2"),
                },
              },
            }))
          ).toThrowErrorMatchingInlineSnapshot(
            `"WireFactory.into called with key \\"constant2\\", but \\"constant2\\" is not a Socket in this system. Valid socket keys for this system are []"`
          );
        });

        it("should throw an error when OutputWire is not provided for an inject", () => {
          const { stdErr } = withMemoryErrorLogger(() => {
            const configuredSystem = createSystem({
              module: () =>
                createModule(undefined)
                  .withInjects(() => ({ test: "adsf" }))
                  .build(),
            }).configure(() => ({
              module: {
                //@ts-ignore
                inject: {},
              },
            }));

            expect(() => configuredSystem()).toThrowErrorMatchingSnapshot();
          });

          expect(stdErr).toMatchSnapshot();
        });

        it("should throw an error when something other than an OutputWire is passed as inject target", () => {
          const configuredSystem = createSystem({
            constant: "constant",
          }).configure(() => ({
            constant: {
              inject: {
                // @ts-ignore
                self: "asdf",
              },
            },
          }));

          expect(() => configuredSystem()).toThrowErrorMatchingInlineSnapshot(
            `"Wrong value passed to inject.self in module \\"constant\\". Please use wire.into to configure injects."`
          );
        });

        it("should throw an error if array of something other than OutputWire is paased as inject target", () => {
          const configuredSystem = createSystem({
            constant: "constant",
          }).configure(() => ({
            constant: {
              inject: {
                // @ts-ignore
                self: ["asfd"],
              },
            },
          }));

          expect(() => configuredSystem()).toThrowErrorMatchingInlineSnapshot(
            `"Wrong value passed to inject.self in module \\"constant\\". Please use wire.into to configure injects."`
          );
        });
      });
    });
  });

  describe("system stop", () => {
    function getOrderOfDestructionForDeps(
      edges: readonly [string, string][]
    ): readonly string[] {
      const order: string[] = [];
      const runningSystem = createSystemFromDeps(edges, (self) => (): Module<
        string,
        {}
      > =>
        createModule(self)
          .withDestructor(() => order.push(self))
          .build()
      );

      runningSystem.stop();

      return order;
    }

    test("order of destruction should be the reversed dependency order", () => {
      const order1 = getOrderOfDestructionForDeps([["B", "A"]]);
      const order2 = getOrderOfDestructionForDeps([
        ["C", "B"],
        ["B", "A"],
      ]);
      const order3 = getOrderOfDestructionForDeps([
        ["B", "A"],
        ["A", "C"],
      ]);

      expect(order1).toEqual(["B", "A"]);
      expect(order2).toEqual(["C", "B", "A"]);
      expect(order3).toEqual(["B", "A", "C"]);
    });

    it("should call destructors on modules with destructors", () => {
      const destructor = jest.fn();
      const configuredSystem = createSystem({
        module1: () =>
          createModule(undefined).withDestructor(destructor).build(),
      }).configure(() => ({}));

      const runningSystem = configuredSystem();
      runningSystem.stop();

      expect(destructor).toHaveBeenCalledTimes(1);
    });

    it("should not call the destructor on a disabled module", () => {
      const destructor = jest.fn();
      const configuredSystem = createSystem({
        module1: () =>
          createModule(undefined).withDestructor(destructor).build(),
      }).configure(() => ({ module1: { disabled: true } }));

      const runningSystem = configuredSystem();
      runningSystem.stop();

      expect(destructor).not.toHaveBeenCalled();
    });
  });

  it("should be usable as a module in a different system", () => {
    const system1 = createSystem({
      constant: "constant",
    }).configure(() => ({}));

    const system2 = createSystem({
      system1,
      module: (deps: { constant: string }) => deps.constant,
    }).configure((wire) => ({
      module: {
        config: {
          constant: wire.from("system1").map((sys) => sys.constant),
        },
      },
    }));

    const result = system2().instance.module;

    expect(result).toBe("constant");
  });
});
