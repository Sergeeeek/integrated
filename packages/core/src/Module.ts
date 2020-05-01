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

const ModuleBuilderSymbol = '@______internal_ModuleBuilderSymbol';
const ModuleBuilderProto: {
  [ModuleBuilderSymbol]: true
} = Object.defineProperty({}, ModuleBuilderSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: true,
});

export interface InternalModule<T, Injects extends BaseInjects> extends Module<T, Injects> {
  [ModuleSymbol]: true;
}

function internalBuildModule<T, Injects extends {[key: string]: unknown}>(m: Module<T, Injects>): InternalModule<T, Injects> {
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

export function isModuleBuilder(value: unknown): value is InternalModuleBuilder<unknown, {}> {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'object') {
    const obj = value as {[key: string]: unknown};

    return Boolean(obj[ModuleBuilderSymbol]);
  }

  return false;
}

export interface InternalModuleBuilder<T, Injects extends BaseInjects> extends ModuleBuilder<T, Injects> {
  [ModuleBuilderSymbol]: true,
}

export interface ModuleBuilder<T, Injects extends BaseInjects> {
  instance: T;
  stop?: () => void,
  inject?: () => Injects,
  withDestructor(destructor: () => void): ModuleBuilder<T, Injects>;
  withInjects<U extends {[key: string]: unknown}>(inject: () => U): ModuleBuilder<T, U>;
  build(): Module<T, Injects>;
}

function internalCreateModule<T, Injects extends BaseInjects>(m: ModuleBuilder<T, Injects>): InternalModuleBuilder<T, Injects> {
  return Object.assign(Object.create(ModuleBuilderProto) as typeof ModuleBuilderProto, m);
}

export interface Module<T, Injects extends BaseInjects> {
  instance: T;
  stop(): void;
  inject(): Injects;
}

export function createModule<T>(instance: T): ModuleBuilder<T, {}> {
  const module = internalCreateModule({
    instance,
    withDestructor(destructor: () => void): ModuleBuilder<T, {}> {
      return internalCreateModule({
        ...this,
        stop: destructor,
      });
    },
    withInjects<U extends {[key: string]: unknown}>(inject: () => U): ModuleBuilder<T, U> {
      return internalCreateModule({
        ...this,
        inject,
      });
    },
    build() {
      return internalBuildModule({
        instance: this.instance,
        stop: this.stop || (() => {}),
        inject: this.inject || (() => {}),
      });
    }
  });

  return module;
}
