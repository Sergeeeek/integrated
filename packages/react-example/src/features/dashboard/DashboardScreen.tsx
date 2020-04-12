import { Link } from 'react-router-dom';
import * as React from 'react';

import { Route, Switch, match, Redirect } from 'react-router';

import { BottomNavigationLink } from './types';

export type Props = {
  links: BottomNavigationLink[],
  match: match,
}

export default function DashboardScreen({links, match}: Props) {
  return <div>
    <h1>Home screen</h1>
    <p>This is a self contained Home Screen packaged as a module.</p>
    <h3>Content</h3>
    <Switch>
      <Route exact path={match.path}>
        Nothing
      </Route>
      {links.map(link => (
        <Route key={link.path} exact path={`${match.path}/${link.path}`} component={link.Component} />
      ))}

      // if nothing matched
      <Redirect to={match.path} />
    </Switch>
    <h3>Links:</h3>
    <div style={{display: 'flex'}}>
      {links.map(link => (
        <div key={link.path}>
          <img src={link.image} />
          <Link to={`${match.path}/${link.path}`}>
            {link.name}
          </Link>
        </div>
      ))}
    </div>
  </div>
}
