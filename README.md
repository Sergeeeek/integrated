# Integrated
> Decouple modules and assemble them back with ease

A declarative micro-framework for Dependency Injection in TypeScript and JavaScript.

## Table Of Contents


## Usage

Let's make an express application which fetches some stuff from a database.

### Create a module

To do this in **Integrated** we'll first need a *module*:

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
argument for configuration. Here, we'll take the `dbConnection` and `port`,
these are the *dependencies* of our ServerModule.

> This definition of a module doesn't allow for the server to be stopped yet,
don't worry we'll get to that later.

### Assemble it!

We need to tell **Integrated** about the modules that we have, we do that by
creating a new *system*:

```typescript
import { createSystem } from '@integrated/core';

const serverSystem = createSystem({
  db: PostgresDBConnectionModule,
  server: ExpressModule,
});
```

Systems are a collection of modules.

`createSystem` takes a system definition and returns a new system.
The definition is a plain JS object where values are your modules and keys just give your modules a name in *this particular* system.

As you see, we didn't tell **Integrated** how to configure the dependencies
between different modules. Lets do that!

> Side note: you can have as many systems as you want, they do not have global state.

### Configure it!

Remember in the `ServerModule` definition that it had a config argument which took a `dbConnection` and a `port`? This is where we tell **Integrated** what to put in that config:

```typescript
const server = serverSystem.configure(wire => ({
  server: {
    config: {
      // db is the module name we gave to PostgresDBConnectionModule when
      // creating the system
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

`wire.from` allows us to refer to other modules in a system by their name. Did I mention this is all type-safe? It is! Look:
- Referring to a non-existant module will result in a **type** error.
- Referring to a module that doesn't match the type required in a config will also result in a *type* error.

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
If tomorrow you decide that you want to use MongoDB, you will just implement a new module and change the system config, without touching any of the code in ServerModule, this is the power of Dependency Injection!

### Stop it!

```typescript
const serverInstance = server();

serverInstance.stop();
```

Now **Integrated** will go through each initialized module in reverse order and stop it.

But wait, how is it going to stop the express server?

Let's go back and revise our `ServerModule` definition a bit:

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

Now **Integrated** can properly stop the server when the system stops.

### Systems are modules too

When we called `serverSystem.configure`, we got back a function that initializes that system, so why not try this?

```typescript
const appSystem = createSystem({
  // System inside a system, wat
  server: server,
  // Some other systems
  jobRunner: jobRunner,
});
```

*Modules* in **Integrated** are just plain functions, that a *configured system* is also a module.

This makes your code even more composable! You can now compose arbitrarily complex systems into larger systems without writing much glue code.


## API



## Installation

## Acknowledgements


## License
