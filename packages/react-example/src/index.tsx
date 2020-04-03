import * as React from 'react';
import {createSystem, createArrayWireHub} from '@ts-module-system/core';
import ReactModule from '@ts-module-system/react-web';
import ReactMiddlewareModule from '@ts-module-system/react-middleware';

document.addEventListener('DOMContentLoaded', () => {
  const system = createSystem({
    root: ReactMiddlewareModule,
    react: ReactModule,
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
        middleware: [({children}) => <div>{children}</div>]
      }
    }
  })).start();
});
