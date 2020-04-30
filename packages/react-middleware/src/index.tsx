import * as React from 'react';

export type ReactMiddleware = React.ComponentType<{children?: React.ReactNode}>;

export interface ReactMiddlewareModuleConfig {
  middleware: readonly ReactMiddleware[],
  Child?: React.ComponentType<unknown>,
};

export function ReactMiddlewareModule({middleware, Child}: ReactMiddlewareModuleConfig) {
  const ReactMiddleware = React.memo((props) => {
    const child = Child ? <Child {...props} /> : props.children;
    const nested = middleware.reduceRight((acc, Current) =>  <Current>{acc}</Current>, child);

    return <>{nested}</>;
  });

  return ReactMiddleware;
}
