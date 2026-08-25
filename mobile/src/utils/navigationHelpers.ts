import { CommonActions } from '@react-navigation/native';

export type NavigationLike = {
  navigate: Function;
  getParent?: Function;
  getState?: Function;
  dispatch?: Function;
  canGoBack?: Function;
  goBack?: Function;
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
  root.navigate(screen, params);
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

/** iOS back-swipe on a root/deep-linked screen otherwise logs GO_BACK unhandled. */
export function stackScreenOptions(navigation: { canGoBack?: () => boolean }) {
  return {
    headerShown: false as const,
    gestureEnabled: navigation.canGoBack?.() ?? false,
  };
}

export function safeGoBack(navigation: NavigationLike): boolean {
  if (navigation.canGoBack?.() && navigation.goBack) {
    navigation.goBack();
    return true;
  }
  const root = getRootNavigation(navigation);
  const routeNames = (root.getState?.()?.routes || []).map((route: any) => route.name);
  if (routeNames.includes('Main')) {
    navigateRoot(navigation, 'Main');
    return true;
  }
  if (routeNames.includes('Auth')) {
    navigateRoot(navigation, 'Auth');
    return true;
  }
  return false;
}
