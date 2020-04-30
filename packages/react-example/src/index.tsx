import { ReactMiddlewareModule } from '@integrated/react-middleware';
import { ReactRouterModule } from '@integrated/react-router';
import { ReactWebModule } from '@integrated/react-web';
import {createSystem, createArraySocket} from '@integrated/core';
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
    routes: createArraySocket<React.ReactElement<RouteProps>>(),
    /**
     * WireHub for injecting ReactMiddleware.
     */
    middleware: createArraySocket<React.ComponentType<{children?: React.ReactNode}>>(),

    /// App Modules
    dashboardLinks: createArraySocket<BottomNavigationLink>(),
    dashboard: DashboardModule,

    home: HomeModule,
  });

  const configuredSystem = system.configure(wire => ({
    react: {
      config: {
        App: wire.from('router'),
        selector: '#root'
      },
    },
    router: {
      config: {
        routes: wire.from('routes'),
        type: 'browser',
      }
    },
    root: {
      config: {
        middleware: wire.from('middleware')
      }
    },
    dashboard: {
      config: {
        basePath: wire.from('dashboardPath'),
        links: wire.from('dashboardLinks')
      },
      inject: {
        self: [wire.into('routes')]
      }
    },
    home: {
      inject: {
        dashboardLink: wire.into('dashboardLinks')
      }
    }
  }));

  configuredSystem();
});
