import { CommonActions, NavigationProp, ParamListBase } from '@react-navigation/native';

export type NavigationLike = NavigationProp<ParamListBase> & {
  getParent?: () => NavigationLike | undefined;
  getState?: () => { routes?: Array<{ name: string; state?: unknown }> };
  dispatch?: (action: ReturnType<typeof CommonActions.navigate>) => void;
};

export function getRootNavigation(navigation: NavigationLike): NavigationLike {
  let current: NavigationLike = navigation;
  while (current.getParent?.()) {
    current = current.getParent() as NavigationLike;
  }
  return current;
}

export function getActiveRouteName(state: any): string | undefined {
  if (!state?.routes?.length) {
    return undefined;
  }
  const route = state.routes[state.index ?? 0];
  if (route?.state) {
    return getActiveRouteName(route.state);
  }
  return route?.name;
}

export function navigateRoot(
  navigation: NavigationLike,
  screen: string,
  params?: object,
) {
  const root = getRootNavigation(navigation);
  if (root.dispatch) {
    root.dispatch(
      CommonActions.navigate({
        name: screen,
        params,
      }),
    );
    return;
  }
  root.navigate(screen as never, params as never);
}

export function navigateMainTab(
  navigation: NavigationLike,
  tab: string,
  params?: object,
) {
  navigateRoot(navigation, 'Main', {
    screen: tab,
    params,
  });
}

export function navigateRoleStack(
  navigation: NavigationLike,
  stack: 'ClientStack' | 'DriverStack' | 'DispatcherStack' | 'UpdaterStack',
  screen: string,
  params?: object,
) {
  navigateRoot(navigation, 'Main', {
    screen: stack,
    params: {
      screen,
      params,
    },
  });
}
