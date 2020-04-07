import {createSystem, createArrayWireHub} from '@ts-module-system/core';
import * as React from 'react';
import { ReactMiddlewareModule } from '@ts-module-system/react-middleware';
import { ReactWebModule } from '@ts-module-system/react-web';

import { SomeProviderModule } from './features/some-provider';
import { TimeoutAlertModule } from './features/timeout-alert';

function App({useValue}: {useValue: () => string}) {
  return useValue();
}

document.addEventListener('DOMContentLoaded', () => {
  const system = createSystem({
    root: ReactMiddlewareModule,
    react: ReactWebModule,
    middleware: createArrayWireHub<React.ComponentType<{children?: React.ReactNode}>>(),
    timeoutAlert: TimeoutAlertModule,
    prov: SomeProviderModule<string>(),
  });

  const configuredSystem = system.configure(wire => ({
    react: {
      config: {
        App: wire.in('root'),
        selector: '#root'
      }
    },
    root: {
      config: {
        child: wire.in('prov').map((prov) => <App useValue={useValue} />),
        middleware: wire.in('middleware')
      }
    },
    timeoutAlert: {
      config: {
        alert: 'Hello',
        timeout: 5000,
      },
      inject: {
        middleware: wire.out('middleware')
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
  }));

  configuredSystem();
});
