import * as React from 'react';
import {createModule} from '@ts-module-system/core'

export type ReactMiddleware = React.ComponentType<{children?: React.ReactNode}>;

export interface ReactMiddlewareModuleConfig {
  middleware: readonly ReactMiddleware[],
  child: React.ReactNode,
};

export function ReactMiddlewareModule({middleware, child}: ReactMiddlewareModuleConfig) {
  const ReactMiddleware = React.memo(() => {
    const nested = middleware.reduceRight((acc, Current) =>  <Current>{acc}</Current>, child);

    return <>{nested}</>;
  });

  return createModule(ReactMiddleware);
}
