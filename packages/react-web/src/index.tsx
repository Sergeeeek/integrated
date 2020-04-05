import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {createModule} from '@ts-module-system/core';

export interface ReactConfig {
  App: React.JSXElementConstructor<{}>,
  selector: string
}

export interface ReactInstance {
  container: Element
}

export default createModule({
  start({selector, App}: ReactConfig) {
    const container = document.querySelector(selector);

    if (!container) {
      throw new Error(`Couldn\'t find a container DOM node with selector ${selector}`)
    }

    ReactDOM.render(<App />, container);

    return {
      instance: container,
      stop() {
        ReactDOM.unmountComponentAtNode(container);
      }
    };
  },
});
