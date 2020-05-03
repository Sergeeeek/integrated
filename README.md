# Integrated
> Decouple your code into self-contained modules and integrate them declaratively.

A declarative micro-framework for Dependency Injection in TypeScript and JavaScript

## Table Of Contents


## Usage

### Create a module

In integrated there are 2 types of modules: constants and function modules.

Constants speak for themselves and are not that interesting, so let's look at function modules:

```typescript
// We'll make a simple express server that fetches some stuff
function ServerModule(config: {dbConnection: DBConnection, port: number}): {
  const db = config.dbConnection;
  const app = express();
  app.get('/stuff', function (req, res) {
    res.send(db.queryStuff());
  });
  
  app.listen(config.port, () => console.log('Server is listening on port ${config.port}`));
}
```

Function modules are just normal functions.  They can either initialize some stateful components or create an instance of something.

In this case we create a `ServerModule` which fetches some stuff when given a `DBConnection`.

> This definition of a module doesn't allow for a server to be stopped, don't worry we'll get to that later.

### Assemble it!

We need to tell integrated about the modules that we have. For that we need to use a *System*.

Systems are a collection of modules:
```typescript
import { createSystem } from '@integrated/core';

const serverSystem = createSystem({
  db: PostgresDBConnectionModule,
  server: ExpressModule,
});
```

`createSystem` takes a system definition and returns a new system.
The definition is a plain JS object where values are your modules and keys just give your modules a name in *this particular* system.

> Side note: you can have as many systems as you want, they do not have global state.

### Configure it!

Once you have a system, you will need to configure it before starting.
Remember in the `ServerModule` definition that it had a config argument which took a `dbConnection` and a `port`? This is where we tell integrated what to put in that config:

```typescript
const server = serverSystem.configure(wire => ({
  server: {
    config: {
      dbConnection: wire.from('db'), // db is the module name we gave to PostgresDBConnectionModule when creating the system
      port: 3000,
    },
  },
}));
```

`wire.from` allows us to refer to other modules in a system by their name. Did I mention this is all type-safe? It is! Referring to a non-existant module will result in a **type** error instead of a runtime error (if you're using TypeScript, that is)

### Start it!

```typescript
server();

// prints: Server is listening on port 3000
```

Now we've got a server running that fetches some stuff for us, very useful!

Let's see what integrated did for you there:
1. Analyzed the config to find any dependencies between your modules
2. Figured out an order in which to start modules
3. Started each module one by one, wiring in the dependencies that you specified.

In the resulting code the `ServerModule` module never explicitly refers to `PostgresDBConnectionModule`, which means that they're decoupled.
If tomorrow you decide that you want to use MongoDB, you will just implement a new module and change the system config, without touching any of the code in ServerModule, this is the power of Dependency Injection!

### Stopping the system

```typescript
const serverInstance = server();

serverInstance.stop();
```

Now integrated will go through each initialized module in reverse order and stop it.

But wait, how is it going to stop the express server?

Let's go back and revise our `ServerModule` definition a bit:

```typescript
import { createModule } from '@integrated/core';

function ServerModule(config: {dbConnection: DBConnection, port: number}): {
  const db = config.dbConnection;
  const app = express();
  app.get('/stuff', function (req, res) {
    res.send(db.queryStuff());
  });
  
  // Store the server instance
  const expressServer = app.listen(config.port, () => console.log('Server is listening on port ${config.port}`));

  // This is new
  return createModule(undefined)
    .withDestructor(() => expressServer.close())
    .build();
}
```

If you want to tell @integrated that your module can be destroyed, you'll need to use `createModule` to wrap the return value of that system and call `withDestructor` to tell how to actually destroy it.

In this example our ServerModule instance will be `undefined`, now explicitly instead of implicitly like it was before (ServerModule didn't have a return statement)

### Systems are modules too

When we called `serverSystem.configure`, we got back a function that initializes that system, so why not try this?

```typescript
const appSystem = createSystem({
  server: server,
  client: ReactAppModule,
});
```

Remember, modules in `integrated` are just plain functions, so they are also modules at the same time.

This makes your code even more composable! You can now compose arbitrarily complex systems into a larger system.


## API

## Installation

## Acknowledgements


## License
