import * as React from 'react';
import {createModule} from '@ts-module-system/core';

export function TimeoutAlertModule({timeout, alert}: {timeout: number, alert: string}) {
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

  return createModule(TimeoutAlertMiddleware)
    .withInjects(() => ({
      middleware: TimeoutAlertMiddleware,
    }));
};
