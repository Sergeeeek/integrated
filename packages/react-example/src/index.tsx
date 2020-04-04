import * as React from 'react';
import {createSystem, createArrayWireHub} from '@ts-module-system/core';
import ReactMiddlewareModule from '@ts-module-system/react-middleware';
import ReactModule from '@ts-module-system/react-web';

document.addEventListener('DOMContentLoaded', () => {
  const system = createSystem({
    root: ReactMiddlewareModule,
    react: ReactModule,
    middleware: createArrayWireHub<React.ComponentType<{children?: JSX.Element}>>(),
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
