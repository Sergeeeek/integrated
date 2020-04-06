import {createSystem, createArrayWireHub} from '@ts-module-system/core';
import * as React from 'react';
import ReactMiddlewareModule from '@ts-module-system/react-middleware';
import ReactModule from '@ts-module-system/react-web';

import { SomeProviderModule } from './features/some-provider';
import { TimeoutAlertModule } from './features/timeout-alert';

document.addEventListener('DOMContentLoaded', () => {
  const system = createSystem({
    root: ReactMiddlewareModule,
    react: ReactModule,
    middleware: createArrayWireHub<React.ComponentType<{children?: React.ReactNode}>>(),
    timeoutAlert: TimeoutAlertModule,
    prov: SomeProviderModule<string>(),
  });

  system.configure(wire => ({
    react: {
      config: {
        App: wire.in('root'),
        selector: '#root'
      }
    },
    root: {
      config: {
        child: <div>App</div>,
        middleware: wire.in('middleware')
      }
    },
    timeoutAlert: {
      config: {
        alert: 'Hello',
        timeout: 5000,
      },
      inject: {
        middleware: wire.out('middleware', { after: wire.in('prov') })
      }
    },
    prov: {
      config: {
        value: 'asdfasdfasdf'
      },
      inject: {
        middleware: wire.out('middleware', {after: wire.in('timeoutAlert')})
      }
    }
  })).start();
});
