# Integrated
> Decouple modules and assemble them back with ease

A declarative micro-framework for Dependency Injection in TypeScript and JavaScript.

## Installation

**npm**:
```sh
$ npm install --save @integrated/core
```

**yarn**:
```sh
$ yarn add @integrated/core
```

## Table Of Contents

- [Integrated](#integrated)
  * [Installation](#installation)
  * [Table Of Contents](#table-of-contents)
- [Usage](#usage)
  * [Create a module](#create-a-module)
  * [Assemble it!](#assemble-it)
  * [Configure it!](#configure-it)
  * [Start it!](#start-it)
  * [Stop it!](#stop-it)
  * [Contexts are modules too](#contexts-are-modules-too)
- [API](#api)
  * [`createContext(definition): Context`](#createcontextdefinition-context)
      - [`context.configure(configClosure: (wire: WireFactory) => ContextConfig): ConfiguredContext`](#contextconfigureconfigclosure-wire-wirefactory--contextconfig-configuredcontext)
  * [WireFactory](#wirefactory)
      - [Methods](#methods)
      - [`from(contextKey: string): InputWire`](#fromcontextkey-string-inputwire)
      - [`into(contextKey: string, config?: SocketConfig): OutputWire`](#intocontextkey-string-config-socketconfig-outputwire)
  * [InputWire](#inputwire)
      - [Properties](#properties)
      - [`.optional`](#optional)
      - [Methods](#methods-1)
      - [`map(mapper): InputWire`](#mapmapper-inputwire)
  * [`createModule(instance: T): ModuleBuilder`](#createmoduleinstance-t-modulebuilder)
  * [`ModuleBuilder`](#modulebuilder)
      - [Methods](#methods-2)
      - [`withDestructor(destructorFn: () => void): ModuleBuilder`](#withdestructordestructorfn---void-modulebuilder)
      - [`withInjects(injectFn: () => NewInjects): ModuleBuilder`](#withinjectsinjectfn---newinjects-modulebuilder)
      - [`build(): Module`](#build-module)
  * [`Module`](#module)
      - [Properties](#properties-1)
      - [`.instance`](#instance)
      - [Methods](#methods-3)
      - [`stop(): void`](#stop-void)
      - [`inject(): {[key: string]: any} | void`](#inject-key-string-any--void)
  * [`createArraySocket()`](#createarraysocket)
    + [Config](#config)
  * [Acknowledgements](#acknowledgements)
  * [License](#license)

# Usage

Let's make an example express application which fetches some stuff from a database.

To do this in **Integrated** we'll first need a *module*:

## Create a module

```typescript
// We'll make a simple express server that fetches some stuff
function ServerModule(config: {dbConnection: DBConnection, port: number}) {
  const db = config.dbConnection;
  const app = express();
  app.get('/stuff', function (req, res) {
    res.send(db.queryStuff());
  });

  const expressServer = app.listen(config.port, () => console.log(`Server is listening on port ${config.port}`));

  return expressServer;
}
```

*Modules* in **Integrated** are just normal functions with an optional first
argument for configuration. Here, we'll take the dbConnection and port,
these are the *dependencies* of our ServerModule.

> This definition of a module doesn't allow for the server to be stopped yet,
don't worry we'll get to that later.

## Assemble it!

We need to tell **Integrated** about the modules that we have, we do that by
creating a new *context*:

```typescript
import { createContext } from '@integrated/core';

const serverContext = createContext({
  db: PostgresDBConnectionModule,
  server: ExpressModule,
});
```

Context is a collection of modules.

`createContext` takes a context definition and returns a new context.
The definition is a plain JS object where values are your modules and keys just give your modules a name in *this particular* context.

As you see, we didn't tell **Integrated** how to configure the dependencies
between different modules. Lets do that!

> Side note: you can have as many contexts as you want, they do not have global state.

## Configure it!

Remember in the `ServerModule` definition that it had a config argument which took a `dbConnection` and a `port`? This is where we tell **Integrated** what to put in that config:

```typescript
const server = serverContext.configure(wire => ({
  server: {
    config: {
      // db is the module name we gave to PostgresDBConnectionModule when
      // creating the context
      dbConnection: wire.from('db'),

      /**
       *  You can mix normal values and wire.from in any way you want.
       *  Integrated will automatically find all references to other modules.
       *
       *  That also works for nested structures like objects, arrays and Maps
       */
      port: 3000,
    },
  },
}));
```

`wire.from` allows us to refer to other modules in a context by their name. Did I mention this is all type-safe? It is!
- Referring to a non-existant module will result in a **type** error.
- Referring to a module that doesn't match the type required in a config will also result in a **type** error.

You are **not** losing out on type safety when you use **Integrated**.

## Start it!

```typescript
server();

// prints: Server is listening on port 3000
```

Now we've got a server running that fetches some stuff for us, very useful!

Let's see what **Integrated** did for you there:
1. Analyzed the config to find any dependencies between your modules
2. Figured out an order in which to start modules
3. Started each module one by one, wiring in the dependencies that you specified.

In the resulting code the `ServerModule` module never explicitly refers to `PostgresDBConnectionModule`, which means that they're decoupled.
If tomorrow you decide that you want to use MongoDB, you will just implement a new module and change the context config, without touching any of the code in ServerModule, this is the power of Dependency Injection!

## Stop it!

```typescript
const serverInstance = server();

serverInstance.stop();
```

Now **Integrated** will go through each initialized module in reverse order and stop it.

But wait, how is it going to stop the express server?

Let's go back and revise our ServerModule definition a bit:

```typescript
import { createModule } from '@integrated/core';

function ServerModule(config: {dbConnection: DBConnection, port: number}) {
  const db = config.dbConnection;
  const app = express();
  app.get('/stuff', function (req, res) {
    res.send(db.queryStuff());
  });

  const expressServer = app.listen(config.port, () => console.log(`Server is listening on port ${config.port}`));

  // This is new
  return createModule(expressServer)
    .withDestructor(() => expressServer.close())
    .build();
}
```
> Updated server module with destructor

Now instead of returning the `expressServer` as we did before, we wrap it in a
`createModule` call, which allows us to specify a destructor.

Now **Integrated** can properly stop the server when the context stops.

## Contexts are modules too

When we called `serverContext.configure`, we got back a function that initializes that context, so why not try this?

```typescript
const appContext = createSystem({
  // System inside a system, wat
  server: server,
  // Some other modules
  jobRunner: jobRunner,
});
```

*Modules* in **Integrated** are just plain functions, that a *configured context* is also a module.

This makes your code even more composable! You can now compose arbitrarily complex modules into larger systems without writing much glue code.


# API

## `createContext(definition): Context`

Creates a context based on the definition.

| Argument   | Type         | Description                                     |
| ---        | ---          | ---                                             |
| definition | T extends {} | The definition object for creating the context. |

`definition` is a plain JS object. Each key is an arbitrary string that can contain these values:

- **Functions**:

  Will be executed when context starts.
  Functions that have only one object argument will be configurable by **Integrated**.
  Return value will be used as the initialized value

- **Sockets**:

  Allow to `inject` your modules into them, reversing the dependency.

- **Other values**:

  No special treatment, will be stored as is.

**Returns**

A `Context` instance.

**Example**

```typescript
const context = createContext({
  stringConstant: 'simple string constant',
  objConstant: {you: 'can put any values here'},

  module: () => {
    console.log('module init logic goes here');
    // ...

    return moduleInstance;
  }

  strings: createArraySocket<string>(), // we'll get to that later
});
```

**Methods**

#### `context.configure(configClosure: (wire: WireFactory) => ContextConfig): ConfiguredContext`

Configures the context. This is where you can specify dependencies between modules in a system.

| Argument      | Type                                   | Description                              |
| ---           | ---                                    | ---                                      |
| configClosure | `(wire: WireFactory) => ContextConfig` | A function which does the configuration. |

- **Arguments**
  - **configClosure(wire: WireFactory): ContextConfig**

  - **Arguments**
    - `wire` (WireFactory): An object that allows to wire dependencies
  - **Returns**: `{ [keyFromDefinition]: ModuleSettings }`. Where ModuleSettings is an object with keys:
    - `config`: if your module is configurable (a function module with one object argument) then `config` is required.

      This value must match the structure of your module's config, but instead of providing concrete values you can provide **references** to other modules, which will be substituted with values of those modules.
    - `inject`: this object has an optional `self` key, and other injection keys provided by the function module. Values of this modules are references to sockets obtained from [`wire.into`](#intocontextkey-string-config-socketconfig-outputwire). See `createArraySocket`.
    - `disabled?: boolean`: should this module be disabled? Optional, false by default. If you depend on a disabled module,
    you will get an error when context starts. If you want to optionally depend on a module, then use `wire.from('...').optional`, it will resolve to undefined if module is disabled.
- **Returns**
  A function which starts the context, and also has some additional properties for inspection.

**Example**

```typescript
const context = createContext({
  constant: 'constant',
  moduleWithConfig: (config: {keyFromModuleConfig: string}) => 'module instance',
  strings: createArraySocket<string>(),
});

const configuredContext = context.configure(wire => {
  return {
    moduleWithConfig: {
      config: {
        keyFromModuleConfig: wire.from('constant'),
        // if module doesn't have additional injectable things, inject key is also optional
        inject: { self: wire.into('strings') }
      },
      // providing a config for constants is optional
      constant: {
        inject: { self: wire.into('strings') }
      },
    }
  };
});

console.log(configuredContext().instance)
// {
//   constant: 'constant',
//   moduleWithConfig: 'module instance',
//   strings: ['constant', 'module instance']
// }
```



## WireFactory

#### Methods

#### `from(contextKey: string): InputWire`

Allows you to specify dependencies between modules when configuring the context.
When a module has a config, instead of passing values directly, you can pass the result of this function.

| Argument   | Type   | Description                               |
| ---        | ---    | ---                                       |
| contextKey | string | A module name from the context definition |

**Returns**

An instance of [`InputWire`](#inputwire), which is a reference to a module in context.

**Example**

```typescript
const context = createContext({
  computedWelcome: () => {
    // Imagine some dynamic string creation here
    return 'Welcome to my server!';
  },
  server: (config: {port: number, welcomeMsg: string}) => {
    // ... do setup using config
  },
});

context.configure((wire /* here's our WireFactory */) => {
  return {
    server: {
      // This has the same type as the first argument of server module,
      // except that you can replace any normal values like number and string with
      // InputWire<number> and InputWire<string>
      config: {
        // Pass directly
        port: 3000,
        // Reference from context
        welcomeMsg: wire.from('computedWelcome'),
      }
    }
  };
});
```



---


#### `into(contextKey: string, config?: SocketConfig): OutputWire`

Allows you to inject a module into a `Socket`.

| Argument   | Type         | Description                                                                       |
| ---        | ---          | ---                                                                               |
| contextKey | string       | Socket name from context definition                                               |
| config     | SocketConfig | Config for the socket, it's different for every socket, please look at their docs |

**Returns**

An instance of `OutputWire`, which is a reference to a socket in context.

**Example**

```typescript
const context = createContext({
  module1: () => 'string1',
  module2: () => 'string2',
  module3: () => 'string3',
  strings: createArraySocket<string>(),
  consumer: (config: {strings: string[]}) => console.log(strings.join(', ')),
});

const configuredContext = context.configure(wire => {
  return {
    module1: { inject: { self: wire.into('strings') } },
    module2: { inject: { self: wire.into('strings', {after: 'module1', before: 'module3'} /* config is specific to ArraySocket */) } },
    module3: { inject: { self: wire.into('strings') } },
    consumer: {
      config: {
        strings: wire.from('strings'),
      },
    },
  };
});

configuredContext(); // prints "string1, string2, string3"
```



## InputWire

A reference to another module in context. You can create it only from `WireFactory.from`.

InputWire is resolved to the actual instance of a module at context start time. Having an `InputWire` in the config of a module
creates a dependency to that module, which changes order of initialization.

#### Properties

#### `.optional`

Lets you optionally depend on a module. If the module you depend on gets disabled
context will not crash on startup if you only optionally depend on it. in that case you will receive `undefined` instead of the module instance.

**Returns**

For `InputWire<T>` it will return `InputWire<T | undefined>`

#### Methods

#### `map(mapper): InputWire`

Allows you to transform dependencies to make them fit without implementing additional modules in context that just do transformations.

Very useful when trying to bridge slightly incompatible modules together.

| Argument | Type     | Description                                                                                   |
| ---      | ---      | ---                                                                                           |
| mapper   | Function | Function that takes the type of value referred by InputWire and transorms it into a new value |

**Returns**

A new `InputWire`, which takes the result of the base `InputWire` and transorms it using the `mapper`.

**Example**

```typescript
const configuredContext = createContext({
  constant: 'constant',
  repeatPrint: (config: {value: string, repeatCount: number}) => {
    console.log('Repeating!');
    for (let i = 0; i < config.repeatCount; i++) {
      console.log(config.value);
    }
  }
}).configure(wire => {
  return {
    repeatPrint: {
      config: {
        value: wire.from('constant'),
        repeatCount: wire.from('constant').map(str => str.length) // this is now an InputWire<number>
      }
    }
  };
});

configuredContext(); // prints 'constant' 8 times
```

## `createModule<T>(instance: T): ModuleBuilder<T, {}>`

Module can be return from a function in a context to specify a destructor or an inject for your module.

| Argument | Type | Description                                                                                                                |
| ---      | ---  | ---                                                                                                                        |
| instance | any  | Instance of your module. You would normally just return that from your function, but with createModule you can augment it. |

**Returns**

A `ModuleBuilder` instance.

## `ModuleBuilder<Instance, Injects>`

A helper class for creating a `Module`

#### Methods

#### `withDestructor(destructorFn: () => void): ModuleBuilder<Instance, Injects>`

Provide a custom destructor for your module instance.

| Argument     | Type     | Description                           |
| ---          | ---      | ---                                   |
| destructorFn | function | A function which destroys your module |

**Returns**
A `ModuleBuilder` with a destructor. Calling `withDestructor` again will overwrite it.

---


#### `withInjects<NewInjects extends {[key: string]: unkown}>(injectFn: () => NewInjects): ModuleBuilder<Instance, NewInjects>`

Provide an additional injection for your module. This is useful for implementing plugins.

| Argument | Type     | Description                                                                                                        |
| ---      | ---      | ---                                                                                                                |
| injectFn | function | A function which should return an object where keys give name to injects and values specify what's being injected. |

**Returns**

A `ModuleBuilder` with new injects. Calling `withInjects` again will overwrite them.

**Example**

```typescript
// modules/AuthModule.ts
function AuthModule(config {...}) {
  const authInstance = // do some setup here...

  return createModule(authInstance)
    .withInjects(() => {
      return {
        // Let's inject server middleware which adds auth logic here
        middleware: (req, res, next) => {
          if (authInstance.isAuthorised(req)) {
            next();
          } else {
            res.send('NOT AUTHORISED');
          }
        }
      };
    })
    .build();
}

// modules/ServerModule.ts
function ServerModule(config: {middleware: Array<(req, res, next) => void>}) {
  const app = express();

  config.middleware.forEach(middleware => app.use(middleware));

  app.listen(3000);

  return createModule(app)
    .withDestructor(() => app.close())
    .build();
}


// App.ts
const context = createContext({
  server: ServerModule,
  middleware: createArraySocket<(req, res, next) => void>(), // create an injection point for all modules which have middleware
  auth: AuthModule,
}).configure(wire => {
  return {
    server: {
      config: {
        middleware: wire.from('middleware'), // resolve all injected middleware
      },
    },
    auth: {
      // this should match the object that was returned in the injector function passed to .withInjects
      inject: {
        middleware: wire.into('middleware'),
      },
    },
  };
});

context(); // server initialized with auth middleware
```

---


#### `build(): Module<Instance, Injects>`

## `Module<Instance, Injects>`

Used when you need to provide a destructor or additional injects except for `self`.

#### Properties

#### `.instance`

Instance value of a module.

#### Methods

#### `stop(): void`

Destroys the module. Implementation of the destructor is provided in `ModuleBuilder.withDestructor`

---

#### `inject(): {[key: string]: any} | void`

Creates a map of "injects", some values that you can inject into sockets in context. You probably will never use this directly, as it's used internally by **Integrated**


## `createArraySocket<Value>()`

Creates an array socket, that can be put in a context. Array sockets let you inject values into them, essentially reversing the dependency and making a sort of "plug-in"
way of assempling modules.

Array sockets take values of the type `Value` (generic) via `WireFactory.into`.

When you depend on array sockets via `WireFactory.from`, it will resolve to an array of all injected values into it.

### Config

Sockets, and array sockets in particular, have a concept of config. You can specify that config per value when injecting it using `WireFactory.into`.

For array sockets the config has type:

| Property | Type   | Description                                                                  |
| ---      | ---    | ---                                                                          |
| before   | string | Name of the module that should appear before the current one in that socket. |
| after    | string | Name of the module that should appear after the current one in that socket.  |

```typescript
// ... context init, etc
context.configure(wire => {
  return {
    otherModule: { inject: self: wire.into('socket') },
    firstModule: { inject: self: wire.into('socket') }
    someModule: { inject: { self: wire.into('socket', { before: 'otherModule', after: 'firstModule' } /* config */) } }
    dependentModule: {
      config: {
        modules: wire.from('socket'),
      }
    }
  };
});

// Dependent module receives: firstModule => someModule => otherModule
```


## Acknowledgements

Very big sources of inspiration:
- [Integrant](https://github.com/weavejester/integrant)
- [Uber's Fusion.js](https://fusionjs.com/)

## License

Copyright © 2020 Sergey Poznyak

Released under the MIT license.
