
export interface BottomNavigationLink {
  image: string,
  name: string,
  path: string,
  Component: React.ComponentType,
};

export interface DashboardModuleConfig {
  links: BottomNavigationLink[],
  basePath?: string
}
