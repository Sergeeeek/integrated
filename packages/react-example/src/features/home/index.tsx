import * as React from 'react';
import { createModule } from '@integrated/core';

function HomeScreen() {
  return <>Home screen, wow</>
}

export function HomeModule() {
  return createModule(HomeScreen)
    .withInjects(() => ({
      dashboardLink: {
        name: 'Home',
        path: 'home',
        image: '',
        Component: HomeScreen,
      }
    }))
    .build();
}
