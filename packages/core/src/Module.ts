type BaseInjects = {[key: string]: unknown};

const ModuleSymbol = '@______internal_ModuleSymbol';
const ModuleProto: {
  [ModuleSymbol]: true
} = Object.defineProperty({}, ModuleSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: true,
});

export interface InternalModule<T, Injects extends BaseInjects> extends Module<T, Injects> {
  [ModuleSymbol]: true;
}

export function internalCreateModule<T, Injects extends {[key: string]: unknown}>(m: Module<T, Injects>): InternalModule<T, Injects> {
  return Object.assign(Object.create(ModuleProto) as typeof ModuleProto, m);
}

export function isModule(value: unknown): value is InternalModule<unknown, {}> {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'object') {
    const obj = value as {[key: string]: unknown};

    return Boolean(obj[ModuleSymbol]);
  }

  return false;
}

export interface ModuleBuilder<T, Injects extends BaseInjects> {
  instance: T;
  stop?: () => void,
  inject?: () => Injects,
  withDestructor(destructor: () => void): ModuleBuilder<T, Injects>;
  withInjects<U extends {[key: string]: unknown}>(inject: () => U): ModuleBuilder<T, U>;
  build(): Module<T, Injects>;
}

export interface Module<T, Injects extends BaseInjects> {
  instance: T;
  stop(): void;
  inject(): Injects;
}

export function createModule<T>(instance: T): ModuleBuilder<T, {}> {
  const module = {
    instance,
    withDestructor(destructor: () => void): ModuleBuilder<T, {}> {
      return {
        ...this,
        stop: destructor,
      };
    },
    withInjects<U extends {[key: string]: unknown}>(inject: () => U): ModuleBuilder<T, U> {
      return {
        ...this,
        inject,
      };
    },
    build() {
      return internalCreateModule({
        instance: this.instance,
        stop: this.stop || (() => {}),
        inject: this.inject || (() => {}),
      });
    }
  }

  return module;
}
