import * as React from 'react';

import {match, Route} from 'react-router';

import { DashboardModuleConfig } from './types';
import DashboardScreen from './DashboardScreen';

export const DashboardModule = ({links, basePath = '/dashboard'}: DashboardModuleConfig) => {
  const HomeWithLinks = (props: {match: match}) => <DashboardScreen {...props} links={links} />

  return <Route path={basePath} component={HomeWithLinks} />
};

export * from './types';
