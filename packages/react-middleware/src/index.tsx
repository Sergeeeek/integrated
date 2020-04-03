import * as React from 'react';
import {createModule} from '@ts-module-system/core'

export type ReactMiddleware = React.JSXElementConstructor<{children?: JSX.Element}>;

export interface ReactMiddlewareModuleConfig {
  middleware: readonly ReactMiddleware[],
  child: JSX.Element,
};

export default createModule<React.ComponentType, ReactMiddlewareModuleConfig, never>({
  start({middleware, child}) {
    return React.memo(() => {
      const nested = middleware.reduceRight((acc, Current) =>  <Current>{acc}</Current>, child);

      return nested;
    });
  },
})
