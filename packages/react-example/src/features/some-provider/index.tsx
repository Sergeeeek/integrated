import * as React from 'react';
import { createModule } from '@ts-module-system/core';

export function SomeProviderModule<V>() {
  return createModule({
    start(deps: {value: V}) {
      const ValueContext = React.createContext<{value: V | undefined}>({value: undefined});
      const SomeProvider = ({children}: {children: React.ReactNode}) => <ValueContext.Provider value={deps}>{children}</ValueContext.Provider>;

      return {
        instance: {
          useValue() {
            return React.useContext(ValueContext)
          }
        },
        inject() {
          return {
            middleware: SomeProvider,
          };
        }
      }
    }
  });
};
