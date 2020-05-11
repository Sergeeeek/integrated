import * as React from "react";
import * as ReactDOM from "react-dom";
import { createModule, Module } from "@integrated/core";

export interface ReactConfig {
  App: React.JSXElementConstructor<{}>;
  selector: string;
}

export interface ReactInstance {
  container: Element;
}

export function ReactModule({
  selector,
  App,
}: ReactConfig): Module<ReactInstance, {}> {
  const container = document.querySelector(selector);

  if (!container) {
    throw new Error(
      `Couldn\'t find a container DOM node with selector ${selector}`
    );
  }

  ReactDOM.render(<App />, container);

  return createModule({
    container,
  })
    .withDestructor(() => {
      ReactDOM.unmountComponentAtNode(container);
    })
    .build();
}
