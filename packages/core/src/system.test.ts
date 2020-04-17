import {createSystem} from './index';

describe('system', () => {
  describe('createSystem', () => {
    it('should accept empty structure', () => {
      expect(() => createSystem({})).not.toThrow();
    });

    test.each([
      undefined,
      null,
      function test() {},
      [],
      Symbol(),
      123,
      'string',
      true
    ])('should not accept %p for structure', (structure) => {
      // @ts-ignore-next-line
      expect(() => createSystem(structure)).toThrowError('createSystem only accepts objects');
    })

    it('should return a configurable system', () => {
      const system = createSystem({});

      expect(system).toMatchObject({
        configure: expect.any(Function)
      });
    })
  });

  describe('system configure function', () => {
    it('should accept a configuration closure', () => {
      const system = createSystem({});

      expect(() => system.configure(() => ({}))).not.toThrow();
    });

    test.each([
      undefined,
      null,
      [],
      Symbol(),
      123,
      'string',
      true,
      {},
    ])('should not accept %p', (input) => {
      const system = createSystem({});

      // @ts-ignore-next-line
      expect(() => system.configure(input)).toThrowError('System.configure only accepts functions');
    });

    it('should call the configuration closure with an instance of WireFactory', () => {
      let wireFactory;
      createSystem({}).configure(wires => {
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
      'string',
      true,
      () => undefined
    ])('should check that config closure doesn\'t return %p', (config) => {
      // @ts-ignore-next-line
      expect(() => createSystem({}).configure(() => config)).toThrowErrorMatchingSnapshot();
    });

    it('should check that config doesn\'t contain any keys that don\'t exist in structure', () => {
      const system = createSystem({
        module: () => undefined,
        module2: (deps: {myDependency: string}) => deps.myDependency,
      });

      expect(() => system.configure(() => ({
        module2: {
          config: {
            myDependency: 'asdf'
          }
        },
        nonExistingModule: {
          config: {
            asdf: 123
          }
        }
      }))).toThrowErrorMatchingSnapshot();
    });
  });
});
