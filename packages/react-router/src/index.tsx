import {Route} from 'react-router';
import {createModule} from '@ts-module-system/core';

interface ReactRouterModuleDeps {
  routes: readonly (typeof Route)[],
}

// export const ReactRouterModule = createModule({
//   start({routes}: ReactRouterModuleDeps) {
//     return {
//       instance:
//     };
//   }
// });
