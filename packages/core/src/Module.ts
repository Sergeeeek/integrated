const ModuleSymbol = '@______internal_ModuleSymbol';
const ModuleProto: {
  [ModuleSymbol]: true
} = Object.defineProperty({}, ModuleSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: true,
});
type BaseInjects = {[key: string]: unknown};

export interface ModuleDefinition<T, Deps, Injects extends BaseInjects> {
  (deps: Deps): readonly [T, {stop?(): void, inject?(): Injects}?];
}

export interface Module<T, Injects extends BaseInjects> {
  [ModuleSymbol]: true;
  instance: T;
  stop?(): void;
  inject?(): Injects;
  withDestructor(destructor: () => void): ModuleWithDestructor<T, Injects>;
  withInjects<U extends {[key: string]: unknown}>(inject: () => U): ModuleWithInjects<T, U>;
}


export interface ModuleWithDestructor<T, Injects extends BaseInjects> extends Module<T, Injects> {
  stop(): void;
  withInjects<U extends BaseInjects>(inject: () => U): ModuleWithInjectsAndDestructor<T, U>;
}
export interface ModuleWithInjects<T, Injects extends BaseInjects> extends Module<T, Injects> {
  inject(): Injects;
  withDestructor(destructor: () => void): ModuleWithInjectsAndDestructor<T, Injects>;
}
export interface ModuleWithInjectsAndDestructor<T, Injects extends BaseInjects> extends Module<T, Injects> {
  stop(): void;
  inject(): Injects;
  withInjects<U extends BaseInjects>(inject: () => U): ModuleWithInjectsAndDestructor<T, U>;
  withDestructor(destructor: () => void): ModuleWithInjectsAndDestructor<T, Injects>;
}

function internalCreateModule<T, Injects extends {[key: string]: unknown}>(m: Omit<Module<T, Injects>, typeof ModuleSymbol>): Module<T, Injects> | ModuleWithDestructor<T, Injects> | ModuleWithInjects<T, Injects> | ModuleWithInjectsAndDestructor<T, Injects> {
  return Object.assign(Object.create(ModuleProto) as typeof ModuleProto, m);
}

export function createModule<T>(instance: T): Module<T, {}> {
  const module = internalCreateModule<T, {}>({
    instance,
    withDestructor(destructor: () => void): ModuleWithDestructor<T, {}> {
      return internalCreateModule({
        ...module,
        stop: destructor,
      }) as ModuleWithDestructor<T, {}>;
    },
    withInjects<U extends {[key: string]: unknown}>(inject: () => U): ModuleWithInjects<T, U> {
      return internalCreateModule({
        ...module,
        inject,
      }) as ModuleWithInjects<T, U>;
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
