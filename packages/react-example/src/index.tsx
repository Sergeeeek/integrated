import {createSystem, createArrayWireHub} from '@ts-module-system/core';
import * as React from 'react';
import { ReactMiddlewareModule } from '@ts-module-system/react-middleware';
import { ReactWebModule } from '@ts-module-system/react-web';
import { ReactRouterModule } from '@ts-module-system/react-router';
import {RouteProps} from 'react-router';

document.addEventListener('DOMContentLoaded', () => {
  const system = createSystem({
    root: ReactMiddlewareModule,
    react: ReactWebModule,
    router: ReactRouterModule,
    routes: createArrayWireHub<React.ReactElement<RouteProps>>(),
    middleware: createArrayWireHub<React.ComponentType<{children?: React.ReactNode}>>(),
  });

  const configuredSystem = system.configure(wire => ({
    react: {
      config: {
        App: wire.in('router'),
        selector: '#root'
      }
    },
    router: {
      config: {
        routes: wire.in('routes'),
        type: 'browser',
        initialEntries: ['/']
      }
    },
    root: {
      config: {
        middleware: wire.in('middleware')
      }
    },
  }));

  configuredSystem();
});
