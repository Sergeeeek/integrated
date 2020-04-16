import {createSystem, createArrayWireHub} from './index';
import {InputWire} from './InputWire';

describe('WireFactory', () => {
  describe('wire.in', () => {
    const exampleSystem = createSystem({
      constant: 'constant',
      func: (deps: {something: string}) => deps.something,
    });

    it('should accept a prop name of another system module', () => {
      expect(() => exampleSystem.configure(wire => ({
        func: {
          config: {
            something: wire.in('constant'),
          }
        }
      }))).not.toThrow();
    });

    test.each([
      undefined,
      null,
      [],
      Symbol(),
      123,
      true,
      {},
      () => undefined,
    ])('should not accept %p', (input) => {
      expect(() => exampleSystem.configure(wire => ({
        func: {
          config: {
            // @ts-ignore-next-line
            something: wire.in(input),
          }
        }
      }))).toThrowError('WireFactory.in only accepts strings');
    });

    it('should not accept props that don\'t exist in the system', () => {
      expect(() => exampleSystem.configure(wire => ({
        func: {
          config: {
            // @ts-ignore-next-line
            something: wire.in('someRandomKey')
          }
        }
      }))).toThrowError('WireFactory.in called with unknown key "someRandomKey". Valid keys for this system are "constant", "func"')
    });

    it('should return an InputWire', () => {
      const configuredSystem = exampleSystem.configure(wire => ({
        func: {
          config: {
            something: wire.in('constant'),
          }
        }
      }));

      const wireInResult = configuredSystem.config.func.config.something;

      expect(wireInResult).toBeInstanceOf(InputWire)
      expect((wireInResult as InputWire<string>).prop).toEqual('constant');
    });
  });

  describe('wire.out', () => {
    const exampleSystem = createSystem({
      arrayWireHub: createArrayWireHub<number>(),
      constant: 123,
      otherConstant: 'constant'
    });

    it('should accept a prop name of another system module', () => {
      expect(() => exampleSystem.configure(wire => ({
        constant: {
          inject: {
            self: wire.out('arrayWireHub')
          }
        }
      }))).not.toThrow();
    });

    test.each([
      [undefined, 'undefined'],
      [null, 'null'],
      [[], '[]'],
      [Symbol(), 'Symbol()'],
      [123, '123'],
      [true, 'true'],
      [{}, '{}'],
      [() => undefined, 'function () { return undefined; }'],
    ])('should not accept %p', (input, string) => {
      expect(() => exampleSystem.configure(wire => ({
        constant: {
          // @ts-ignore-next-line
          inject: { self: wire.out(input) }
        }
      }))).toThrowError(`WireFactory.out only accepts strings, but received ${string}`);
    });

    it('should not accept a prop that doesn\'t exist in the system', () => {
      expect(() => exampleSystem.configure(wire => ({
        constant: {
          // @ts-ignore-next-line
          inject: { self: wire.out('someRandomKey') }
        }
      }))).toThrowError('WireFactory.out called with unknown key "someRandomKey". Valid output keys for this system are "arrayWireHub"');
    });

    it('should not accept a prop that points to something other than a WireHub', () => {
      expect(() => exampleSystem.configure(wire => ({
        constant: {
          // @ts-ignore-next-line
          inject: { self: wire.out('otherConstant') }
        }
      }))).toThrowError('WireFactory.out called with key "otherConstant", but "otherConstant" is not a WireHub in this system. Valid output keys for this system are "arrayWireHub"');
    });
  });
});
