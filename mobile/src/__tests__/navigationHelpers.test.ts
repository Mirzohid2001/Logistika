import { CommonActions } from '@react-navigation/native';
import {
  getRootNavigation,
  navigateRoot,
  safeGoBack,
  stackScreenOptions,
} from '../utils/navigationHelpers';

describe('navigationHelpers', () => {
  it('walks up to the root navigator', () => {
    const root = { navigate: jest.fn() };
    const child = { getParent: () => root };
    expect(getRootNavigation(child as never)).toBe(root);
  });

  it('disables back swipe when the stack has nowhere to go', () => {
    expect(stackScreenOptions({ canGoBack: () => false })).toEqual({
      headerShown: false,
      gestureEnabled: false,
    });
    expect(stackScreenOptions({ canGoBack: () => true }).gestureEnabled).toBe(true);
  });

  it('goes back when a previous screen exists', () => {
    const goBack = jest.fn();
    const ok = safeGoBack({
      canGoBack: () => true,
      goBack,
    } as never);
    expect(ok).toBe(true);
    expect(goBack).toHaveBeenCalled();
  });

  it('falls back to Main instead of dispatching unhandled GO_BACK', () => {
    const dispatch = jest.fn();
    const ok = safeGoBack({
      canGoBack: () => false,
      goBack: jest.fn(),
      getParent: () => undefined,
      getState: () => ({ routes: [{ name: 'Main' }, { name: 'Auth' }] }),
      dispatch,
    } as never);
    expect(ok).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.navigate({ name: 'Main', params: undefined }),
    );
  });
});

describe('navigateRoot', () => {
  it('dispatches on the root navigator', () => {
    const dispatch = jest.fn();
    const root = { dispatch, getParent: () => undefined };
    const child = { getParent: () => root };
    navigateRoot(child as never, 'Main', { screen: 'DriverStack' });
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.navigate({
        name: 'Main',
        params: { screen: 'DriverStack' },
      }),
    );
  });
});
