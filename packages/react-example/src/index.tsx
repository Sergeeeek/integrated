import { ReactMiddlewareModule } from '@ts-module-system/react-middleware';
import { ReactRouterModule } from '@ts-module-system/react-router';
import { ReactWebModule } from '@ts-module-system/react-web';
import {createSystem, createArrayWireHub} from '@ts-module-system/core';
import * as React from 'react';

import { RouteProps } from 'react-router';

import { BottomNavigationLink, DashboardModule } from './features/dashboard';
import { HomeModule } from './features/home';

document.addEventListener('DOMContentLoaded', () => {
  const system = createSystem({
    /// Constants
    dashboardPath: '/dashboard',

    /// React Config
    root: ReactMiddlewareModule,
    react: ReactWebModule,
    router: ReactRouterModule,
    /**
     * WireHub for injecting routes
     */
    routes: createArrayWireHub<React.ReactElement<RouteProps>>(),
    /**
     * WireHub for injecting ReactMiddleware.
     */
    middleware: createArrayWireHub<React.ComponentType<{children?: React.ReactNode}>>(),

    /// App Modules
    dashboardLinks: createArrayWireHub<BottomNavigationLink>(),
    dashboard: DashboardModule,

    home: HomeModule,
  });

  const configuredSystem = system.configure(wire => ({
    react: {
      config: {
        App: wire.in('router'),
        selector: '#root'
      },
    },
    router: {
      config: {
        routes: wire.in('routes'),
        type: 'browser',
      }
    },
    root: {
      config: {
        middleware: wire.in('middleware')
      }
    },
    dashboard: {
      config: {
        basePath: wire.in('dashboardPath'),
        links: wire.in('dashboardLinks')
      },
      inject: {
        self: [wire.out('routes')]
      }
    },
    home: {
      inject: {
        dashboardLink: wire.out('dashboardLinks')
      }
    }
  }));

  configuredSystem();
});
