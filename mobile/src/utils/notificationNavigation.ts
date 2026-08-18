import { Notification } from '../types';
import { navigateRoot, navigateRoleStack } from './navigationHelpers';

export type UserRole = 'client' | 'driver' | 'dispatcher' | 'updater' | null;

type NavigationLike = Parameters<typeof navigateRoot>[0];

const TRACKING_TYPES = new Set([
  'order_started',
  'order_approved',
  'order_in_transit',
  'order_completed',
  'geofence_event',
  'route_deviation',
  'stop_alert',
  'route_stop_arrived',
  'route_stop_completed',
]);

const DRIVER_VERIFICATION_TYPES = new Set([
  'driver_verification_approved',
  'driver_verification_rejected',
  'driver_verification_pending',
]);

const VEHICLE_VERIFICATION_TYPES = new Set([
  'vehicle_verification_approved',
  'vehicle_verification_rejected',
  'vehicle_verification_pending',
]);

function isBidNotification(notification: Pick<Notification, 'notification_type' | 'title'>) {
  return (
    notification.notification_type === 'bid_received' ||
    (notification.notification_type === 'system' && notification.title === 'Yangi taklif')
  );
}

function getAvailableStacks(nav: NavigationLike): string[] {
  const routes = nav.getState?.()?.routes;
  if (!routes) {
    return [];
  }
  return routes.map((route) => route.name);
}

type RoleStack = 'ClientStack' | 'DriverStack' | 'DispatcherStack' | 'UpdaterStack';

function resolveClientStack(nav: NavigationLike, role: UserRole): 'ClientStack' | null {
  const stacks = getAvailableStacks(nav);
  if (stacks.includes('ClientStack')) {
    return 'ClientStack';
  }
  if (role === 'client') {
    return 'ClientStack';
  }
  return null;
}

function resolveDriverStack(nav: NavigationLike, role: UserRole): 'DriverStack' | null {
  const stacks = getAvailableStacks(nav);
  if (stacks.includes('DriverStack')) {
    return 'DriverStack';
  }
  if (role === 'driver') {
    return 'DriverStack';
  }
  return null;
}

function goToStackScreen(
  nav: NavigationLike,
  stack: RoleStack,
  screen: string,
  params?: object,
) {
  navigateRoleStack(nav, stack, screen, params);
}

function goToAppScreen(nav: NavigationLike, screen: string, params?: object) {
  navigateRoot(nav, screen, params);
}

export function navigateFromNotification(
  nav: NavigationLike,
  notification: Notification,
  role: UserRole,
) {
  const orderId = notification.order?.id;
  const advertisementId = notification.advertisement?.id;
  const chatId = notification.chat_id;
  const { notification_type: type } = notification;

  if (type === 'message_received') {
    if (chatId) {
      goToAppScreen(nav, 'ChatDetail', { id: chatId });
      return;
    }
    goToAppScreen(nav, 'ChatList');
    return;
  }

  if (DRIVER_VERIFICATION_TYPES.has(type)) {
    goToAppScreen(nav, 'UploadDocuments');
    return;
  }

  if (VEHICLE_VERIFICATION_TYPES.has(type)) {
    const driverStack = resolveDriverStack(nav, role);
    if (driverStack) {
      goToStackScreen(nav, driverStack, 'Vehicles');
      return;
    }
    goToAppScreen(nav, 'DriverDocuments');
    return;
  }

  if (type === 'driver_arriving' && orderId) {
    const clientStack = resolveClientStack(nav, role);
    if (clientStack) {
      goToStackScreen(nav, clientStack, 'ClientOrderTracking', { id: orderId });
      return;
    }
  }

  if (type === 'driver_sos') {
    if (role === 'dispatcher' || getAvailableStacks(nav).includes('DispatcherStack')) {
      if (orderId) {
        goToStackScreen(nav, 'DispatcherStack', 'DispatcherOrderDetail', { id: orderId });
      } else {
        goToStackScreen(nav, 'DispatcherStack', 'DispatcherMonitoring');
      }
      return;
    }
    if (orderId) {
      const clientStack = resolveClientStack(nav, role);
      if (clientStack) {
        goToStackScreen(nav, clientStack, 'ClientOrderDetail', { id: orderId });
        return;
      }
    }
    return;
  }

  if (type === 'rating_received') {
    goToAppScreen(nav, 'ReviewsHistory');
    return;
  }

  if (type === 'document_expiry') {
    const stacks = getAvailableStacks(nav);
    if (stacks.includes('DispatcherStack') || role === 'dispatcher') {
      goToStackScreen(nav, 'DispatcherStack', 'DispatcherDriverDocuments');
      return;
    }
    if (stacks.includes('UpdaterStack') || role === 'updater') {
      goToStackScreen(nav, 'UpdaterStack', 'UpdaterDriverDocuments');
      return;
    }
    goToAppScreen(nav, 'DriverDocuments');
    return;
  }

  if (type === 'complaint_filed') {
    const stacks = getAvailableStacks(nav);
    if (stacks.includes('DispatcherStack') || role === 'dispatcher') {
      goToStackScreen(nav, 'DispatcherStack', 'StaffComplaints');
      return;
    }
    if (stacks.includes('UpdaterStack') || role === 'updater') {
      goToStackScreen(nav, 'UpdaterStack', 'StaffComplaints');
      return;
    }
    return;
  }

  if (type === 'driver_load_offer') {
    const driverStack = resolveDriverStack(nav, role);
    if (driverStack) {
      if (advertisementId) {
        goToStackScreen(nav, driverStack, 'AdvertisementDetail', { id: advertisementId });
      } else {
        goToStackScreen(nav, driverStack, 'DriverMatches');
      }
    }
    return;
  }

  if (type === 'saved_search_match') {
    const driverStack = resolveDriverStack(nav, role);
    if (driverStack) {
      if (advertisementId) {
        goToStackScreen(nav, driverStack, 'AdvertisementDetail', { id: advertisementId });
      } else {
        goToStackScreen(nav, driverStack, 'AvailableAdvertisements');
      }
    }
    return;
  }

  if (isBidNotification(notification)) {
    const clientStack = resolveClientStack(nav, role);
    if (clientStack) {
      if (advertisementId) {
        goToStackScreen(nav, clientStack, 'Bids', { advertisementId });
      } else {
        goToStackScreen(nav, clientStack, 'MyAdvertisements');
      }
      return;
    }

    const driverStack = resolveDriverStack(nav, role);
    if (driverStack) {
      goToStackScreen(nav, driverStack, 'MyBids');
    }
    return;
  }

  if (type === 'payment_received') {
    const clientStack = resolveClientStack(nav, role);
    if (clientStack && orderId) {
      goToStackScreen(nav, clientStack, 'ClientOrderDetail', { id: orderId });
    }
    return;
  }

  if (orderId) {
    const stacks = getAvailableStacks(nav);
    const useTrackingScreen = TRACKING_TYPES.has(type);

    if (stacks.includes('UpdaterStack') || role === 'updater') {
      goToStackScreen(
        nav,
        'UpdaterStack',
        useTrackingScreen ? 'UpdaterTracking' : 'UpdaterOrderUpdate',
        { id: orderId },
      );
      return;
    }

    const clientStack = resolveClientStack(nav, role);
    if (clientStack) {
      const screen = useTrackingScreen ? 'ClientOrderTracking' : 'ClientOrderDetail';
      goToStackScreen(nav, clientStack, screen, { id: orderId });
      return;
    }

    const driverStack = resolveDriverStack(nav, role);
    if (driverStack) {
      const screen = useTrackingScreen ? 'OrderTracking' : 'OrderDetail';
      goToStackScreen(nav, driverStack, screen, { id: orderId });
      return;
    }

    if (role === 'dispatcher' || stacks.includes('DispatcherStack')) {
      goToStackScreen(nav, 'DispatcherStack', 'DispatcherOrderDetail', { id: orderId });
      return;
    }
  }

  const clientStack = resolveClientStack(nav, role);
  if (clientStack) {
    goToStackScreen(nav, clientStack, 'Dashboard');
    return;
  }

  const driverStack = resolveDriverStack(nav, role);
  if (driverStack) {
    goToStackScreen(nav, driverStack, 'Dashboard');
  }
}

export function navigateFromPushData(
  nav: NavigationLike,
  data: Record<string, string | undefined>,
  role: UserRole,
) {
  const notification: Notification = {
    id: data.notification_id ? parseInt(data.notification_id, 10) : 0,
    user: 0,
    notification_type: data.type || 'system',
    title: data.title || '',
    message: data.body || '',
    is_read: false,
    created_at: new Date().toISOString(),
    order: data.order_id ? ({ id: parseInt(data.order_id, 10) } as Notification['order']) : undefined,
    advertisement: data.advertisement_id
      ? ({ id: parseInt(data.advertisement_id, 10) } as Notification['advertisement'])
      : undefined,
    chat_id: data.chat_id ? parseInt(data.chat_id, 10) : undefined,
  };
  navigateFromNotification(nav, notification, role);
}

export function getPrimaryRole(user: {
  is_client?: boolean;
  is_driver?: boolean;
  is_dispatcher?: boolean;
  is_updater?: boolean;
} | null): UserRole {
  if (!user) return null;
  if (user.is_dispatcher) return 'dispatcher';
  if (user.is_updater) return 'updater';
  if (user.is_driver) return 'driver';
  if (user.is_client) return 'client';
  return null;
}
