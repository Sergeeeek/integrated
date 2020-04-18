const ModuleSymbol = '@______internal_ModuleSymbol';
const ModuleProto: {
  [ModuleSymbol]: true
} = Object.defineProperty({}, ModuleSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: true,
});

export interface ModuleDefinition<T, Deps, Injects extends {[key: string]: unknown}> {
  (deps: Deps): readonly [T, {stop?(): void, inject?(): Injects}?];
}

export interface Module<T, Injects extends {[key: string]: unknown}> {
  [ModuleSymbol]: true;
  instance: T;
  stop?(): void;
  inject?(): Injects;
  withDestructor(destructor: () => void): Module<T, Injects>;
  withInjects<U extends {[key: string]: unknown}>(inject: () => U): Module<T, U>;
}

function internalCreateModule<T, Injects extends {[key: string]: unknown}>(m: Omit<Module<T, Injects>, typeof ModuleSymbol>): Module<T, Injects> {
  return Object.assign(Object.create(ModuleProto) as typeof ModuleProto, m);
}

export function createModule<T>(instance: T): Module<T, {}> {
  const module = internalCreateModule<T, never>({
    instance,
    withDestructor(destructor: () => void): Module<T, never> {
      return internalCreateModule({
        ...module,
        stop: destructor,
      });
    },
    withInjects<U extends {[key: string]: unknown}>(inject: () => U): Module<T, U> {
      return internalCreateModule({
        ...module,
        inject,
      });
    }
  });

  return module;
}

export function isModule(value: unknown): value is Module<unknown, {}> {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'object') {
    const obj = value as {[key: string]: unknown};

    return Boolean(obj[ModuleSymbol]);
  }

  return false;
}
