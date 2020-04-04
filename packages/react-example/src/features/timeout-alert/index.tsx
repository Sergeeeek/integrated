import * as React from 'react';
import {createModule} from '@ts-module-system/core';

export const TimeoutAlertModule = createModule({
  start({timeout, alert}: {timeout: number, alert: string}): React.ComponentType<{children?: JSX.Element}> {
    return ({children}: {children?: JSX.Element}) => {
      React.useEffect(() => {
        const timeoutHandle = setTimeout(() => {
          window.alert(alert)

          return () => {
            clearTimeout(timeoutHandle);
          };
        }, timeout);
      }, []);

      return children;
    }
  },
  inject(instance) {
    return {
      middleware: instance,
    }
  }
});
