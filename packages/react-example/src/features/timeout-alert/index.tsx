import * as React from 'react';
import {createModule} from '@ts-module-system/core';

export const TimeoutAlertModule = createModule({
  start({timeout, alert}: {timeout: number, alert: string}) {
    const TimeoutAlertMiddleware = ({children}: {children?: React.ReactNode}) => {
      React.useEffect(() => {
        const timeoutHandle = setTimeout(() => {
          window.alert(alert)

          return () => {
            clearTimeout(timeoutHandle);
          };
        }, timeout);
      }, []);

      return <>{children}</>;
    };
    return {
      instance: TimeoutAlertMiddleware,
      inject() {
        return {
          middleware: TimeoutAlertMiddleware,
        }
      }
    }
  },
});
