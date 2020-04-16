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

    /// TODO: Make sure System.configure validates the config returned from configuration closure
  });
});
