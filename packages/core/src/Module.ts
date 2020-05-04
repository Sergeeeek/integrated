type BaseInjects = { [key: string]: unknown };

class Module<T, Injects extends BaseInjects> {
  isStopped = false;
  constructor(
    public instance: T,
    private destructor?: () => void,
    private injector?: () => Injects
  ) {}

  stop = (): void => {
    if (this.isStopped || !this.destructor) {
      return;
    }

    this.isStopped = true;
    this.destructor();
  };
  inject = (): Injects | void => {
    if (this.injector) {
      return this.injector();
    }

    return undefined;
  };
}

class ModuleBuilder<T, Injects extends BaseInjects> {
  constructor(
    public instance: T,
    public destructor?: () => void,
    public injector?: () => Injects
  ) {}

  withDestructor(destructor: () => void): ModuleBuilder<T, Injects> {
    return new ModuleBuilder(this.instance, destructor, this.injector);
  }
  withInjects<U extends { [key: string]: unknown }>(
    injector: () => U
  ): ModuleBuilder<T, U> {
    return new ModuleBuilder(this.instance, this.destructor, injector);
  }
  build(): Module<T, Injects> {
    return new Module<T, Injects>(
      this.instance,
      this.destructor,
      this.injector
    );
  }
}

export function isModule(value: unknown): value is Module<unknown, {}> {
  return value instanceof Module;
}

export function isModuleBuilder(
  value: unknown
): value is ModuleBuilder<unknown, {}> {
  return value instanceof ModuleBuilder;
}

export function createModule<T>(instance: T): ModuleBuilder<T, {}> {
  return new ModuleBuilder(instance);
}
