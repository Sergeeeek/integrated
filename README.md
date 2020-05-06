# Integrated
> Decouple modules and assemble them back with ease

A declarative micro-framework for Dependency Injection in TypeScript and JavaScript.

## Installation

**NPM**:
```sh
$ npm install --save @integrated/core
```

**Yarn**:
```sh
$ yarn add @integrated/core
```

## Table Of Contents



## Usage

Let's make an example express application which fetches some stuff from a database.

To do this in **Integrated** we'll first need a *module*:

### Create a module

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

### Assemble it!

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

### Configure it!

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

### Start it!

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

### Stop it!

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

### Contexts are modules too

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


## API

### `createContext(definition): Context`

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

**Returns**

A `Context` instance.

**Methods**

#### `context.configure(configClosure: (wire: WireFactory) => ContextConfig): ConfiguredContext`

Configures the context. This is where you can specify dependencies between modules in a system.

- **configClosure(wire: WireFactory): ContextConfig**

  A function which does the configuration.


- **Arguments**
  - `wire` (WireFactory): An object that allows to wire dependencies
    - `wire.from(key: Key)`: Takes the module key, which is a key in the definition object,
    and creates a refernce to that module, that you can put in config
    - `wire.into(key: Key, config?)`: Takes the key of a socket and an optional config for that socket.
    Creates a reference to that socket that you can use in a config to inject a value into a socket.
- **Returns**: `{ [keyFromDefinition]: ModuleSettings }`. Where ModuleSettings is an object with keys:
  - `config`: if your module is configurable (a function module with one object argument) then `config` is required.

    This value must match the structure of your module's config, but instead of providing concrete values you can provide **references** to other modules, which will be substituted with values of those modules.
  - `inject`: this object has an optional `self` key, and other injection keys provided by the function module. Values of this modules are references to sockets obtained from `wire.into`.
  - `disabled?: boolean`: should this module be disabled? Optional, false by default. If you depend on a disabled module,
  you will get an error when context starts. If you want to optionally depend on a module, then use `wire.from('...').optional`, it will resolve to undefined if module is disabled.

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
      // providing a config for constants is optional
      config: {
        keyFromModuleConfig: wire.from('constant'),
        inject: { self: wire.into('strings') }
      },
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


## Acknowledgements


## License
