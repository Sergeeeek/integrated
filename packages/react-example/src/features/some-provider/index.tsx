import * as React from 'react';
import { createModule } from '@ts-module-system/core';

export function SomeProviderModule<V>() {
  return (deps: {value: V}) => {
    const ValueContext = React.createContext<{value: V | undefined}>({value: undefined});
    const SomeProvider = ({children}: {children: React.ReactNode}) => <ValueContext.Provider value={deps}>{children}</ValueContext.Provider>;

    return createModule({
      useValue() {
        return React.useContext(ValueContext)
      }
    }).withInjects(() => ({
        middleware: SomeProvider,
    }));
  };
}
