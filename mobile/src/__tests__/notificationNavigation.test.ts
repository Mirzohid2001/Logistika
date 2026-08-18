import {
  navigateFromNotification,
  getPrimaryRole,
} from '../utils/notificationNavigation';
import { Notification } from '../types';

describe('notificationNavigation', () => {
  const makeNav = (stacks: string[] = ['ClientStack', 'Notifications', 'Profile']) => {
    const navigate = jest.fn();
    const dispatch = jest.fn();
    const getParent = jest.fn(() => undefined);
    const getState = jest.fn(() => ({
      routes: stacks.map((name) => ({ name })),
    }));
    return { navigate, dispatch, getParent, getState };
  };

  const baseNotification = (overrides: Partial<Notification> = {}): Notification => ({
    id: 1,
    user: 1,
    notification_type: 'system',
    title: 'Test',
    message: 'Test message',
    is_read: false,
    created_at: '2026-06-09T00:00:00Z',
    ...overrides,
  });

  it('navigates client to bids for bid notification with advertisement', () => {
    const nav = makeNav();
    navigateFromNotification(
      nav,
      baseNotification({
        notification_type: 'bid_received',
        title: 'Yangi taklif',
        advertisement: { id: 42 },
      }),
      'client',
    );

    expect(nav.dispatch).toHaveBeenCalled();
    const action = nav.dispatch.mock.calls[0][0];
    expect(action.payload.name).toBe('Main');
    expect(action.payload.params).toEqual({
      screen: 'ClientStack',
      params: {
        screen: 'Bids',
        params: { advertisementId: 42 },
      },
    });
  });

  it('navigates client to my advertisements for legacy bid notification', () => {
    const nav = makeNav();
    navigateFromNotification(
      nav,
      baseNotification({
        notification_type: 'system',
        title: 'Yangi taklif',
      }),
      'client',
    );

    expect(nav.dispatch).toHaveBeenCalled();
    const action = nav.dispatch.mock.calls[0][0];
    expect(action.payload.name).toBe('Main');
    expect(action.payload.params).toEqual({
      screen: 'ClientStack',
      params: { screen: 'MyAdvertisements' },
    });
  });

  it('navigates client to order detail via nested stack', () => {
    const nav = makeNav();
    navigateFromNotification(
      nav,
      baseNotification({
        notification_type: 'order_created',
        order: { id: 7 } as Notification['order'],
      }),
      'client',
    );

    expect(nav.dispatch).toHaveBeenCalled();
    const action = nav.dispatch.mock.calls[0][0];
    expect(action.payload.params).toEqual({
      screen: 'ClientStack',
      params: {
        screen: 'ClientOrderDetail',
        params: { id: 7 },
      },
    });
  });

  it('navigates client to order detail for proof of delivery', () => {
    const nav = makeNav();
    navigateFromNotification(
      nav,
      baseNotification({
        notification_type: 'proof_of_delivery',
        order: { id: 9 } as Notification['order'],
      }),
      'client',
    );

    expect(nav.dispatch).toHaveBeenCalled();
    const action = nav.dispatch.mock.calls[0][0];
    expect(action.payload.params).toEqual({
      screen: 'ClientStack',
      params: {
        screen: 'ClientOrderDetail',
        params: { id: 9 },
      },
    });
  });

  it('detects primary role', () => {
    expect(getPrimaryRole({ is_client: true, is_driver: true })).toBe('driver');
    expect(getPrimaryRole({ is_client: true })).toBe('client');
  });

  it('navigates to chat detail when chat_id is present', () => {
    const nav = makeNav();
    navigateFromNotification(
      nav,
      baseNotification({
        notification_type: 'message_received',
        chat_id: 15,
      }),
      'client',
    );

    expect(nav.dispatch).toHaveBeenCalled();
    const action = nav.dispatch.mock.calls[0][0];
    expect(action.payload).toEqual({
      name: 'ChatDetail',
      params: { id: 15 },
    });
  });

  it('navigates dispatcher to order detail for SOS', () => {
    const nav = makeNav(['DispatcherStack', 'Main']);
    navigateFromNotification(
      nav,
      baseNotification({
        notification_type: 'driver_sos',
        order: { id: 9 } as Notification['order'],
      }),
      'dispatcher',
    );

    expect(nav.dispatch).toHaveBeenCalled();
    const action = nav.dispatch.mock.calls[0][0];
    expect(action.payload.params).toEqual({
      screen: 'DispatcherStack',
      params: {
        screen: 'DispatcherOrderDetail',
        params: { id: 9 },
      },
    });
  });

  it('navigates driver load offer without ad to DriverMatches', () => {
    const nav = makeNav(['DriverStack', 'Main']);
    navigateFromNotification(
      nav,
      baseNotification({
        notification_type: 'driver_load_offer',
      }),
      'driver',
    );

    expect(nav.dispatch).toHaveBeenCalled();
    const action = nav.dispatch.mock.calls[0][0];
    expect(action.payload.params).toEqual({
      screen: 'DriverStack',
      params: { screen: 'DriverMatches' },
    });
  });
});
