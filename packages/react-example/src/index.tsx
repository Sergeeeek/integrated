import {createSystem, createArrayWireHub} from '@ts-module-system/core';
import * as React from 'react';
import ReactMiddlewareModule from '@ts-module-system/react-middleware';
import ReactModule from '@ts-module-system/react-web';

import { TimeoutAlertModule } from './features/timeout-alert';

document.addEventListener('DOMContentLoaded', () => {
  const system = createSystem({
    root: ReactMiddlewareModule,
    react: ReactModule,
    middleware: createArrayWireHub<React.ComponentType<{children?: JSX.Element}>>(),
    timeoutAlert: TimeoutAlertModule,
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
        child: <div>hello</div>,
        middleware: wire.in('middleware')
      }
    }
  })).start();
});
