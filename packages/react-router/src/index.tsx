import * as React from 'react';
import { createModule } from '@ts-module-system/core';
import {BrowserRouter, HashRouter, RouteProps, MemoryRouter, Switch} from 'react-router-dom';

type RouterType = 'memory' | 'browser' | 'hash';
export type LocationDescriptor = History.LocationDescriptor;

interface ReactRouterModuleDeps {
  initialEntries?: LocationDescriptor[],
  initialIndex?: number,
  routes: React.ReactElement<RouteProps>[],
  Child?: React.ComponentType<{children?: React.ReactNode}>,
  type?: RouterType,
}

type CommonRouterProps = React.ComponentProps<typeof MemoryRouter> & React.ComponentProps<typeof BrowserRouter> & React.ComponentProps<typeof HashRouter>;
const routerTypeToModule: {
  [K in RouterType]: React.ComponentType<CommonRouterProps>
} = {
  memory: MemoryRouter,
  browser: BrowserRouter,
  hash: HashRouter,
}

export function ReactRouterModule({
    initialEntries,
    initialIndex,
    routes,
    Child = ({children}) => <>{children}</>,
    type = 'browser'
  }: ReactRouterModuleDeps) {

  const Router = routerTypeToModule[type];

  function ReactRouter() {
    return (
      <Router initialEntries={initialEntries} initialIndex={initialIndex}>
        <Child>
          <Switch>
            {routes}
          </Switch>
        </Child>
      </Router>
    );
  }

  return createModule(ReactRouter);
};
