import { Platform } from 'react-native';

const TRACKING_CHANNEL_ID = 'driver-tracking';
const TRACKING_NOTIFICATION_ID = 'driver-location-tracking';

type TranslateFn = (key: string, options?: Record<string, string>) => string;

function getNotifeeModule() {
  try {
    return require('@notifee/react-native');
  } catch {
    return null;
  }
}

export function isBackgroundTrackingSupported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export async function startBackgroundTrackingSession(
  orderId: number,
  t: TranslateFn
): Promise<boolean> {
  if (Platform.OS === 'ios') {
    // Native CLLocationManager keeps GPS alive: UIBackgroundModes=location,
    // Always permission, allowsBackgroundLocationUpdates, and the blue bar.
    return true;
  }

  const notifeeModule = getNotifeeModule();
  const notifee = notifeeModule?.default;
  if (!notifee) {
    return false;
  }

  try {
    const channelId = await notifee.createChannel({
      id: TRACKING_CHANNEL_ID,
      name: t('tracking.backgroundChannelName'),
      importance: notifeeModule.AndroidImportance?.LOW ?? 2,
    });

    await notifee.displayNotification({
      id: TRACKING_NOTIFICATION_ID,
      title: t('tracking.backgroundNotificationTitle'),
      body: t('tracking.backgroundNotificationBody', { orderId: String(orderId) }),
      android: {
        channelId,
        asForegroundService: true,
        ongoing: true,
        foregroundServiceTypes: [notifeeModule.AndroidForegroundServiceType?.LOCATION ?? 8],
        pressAction: { id: 'default' },
      },
    });
    return true;
  } catch (error) {
    console.warn('Failed to start background tracking session:', error);
    return false;
  }
}

export async function stopBackgroundTrackingSession(): Promise<void> {
  const notifee = getNotifeeModule()?.default;
  if (!notifee) {
    return;
  }

  try {
    if (Platform.OS === 'android') {
      await notifee.stopForegroundService();
    }
    await notifee.cancelNotification(TRACKING_NOTIFICATION_ID);
  } catch (error) {
    console.warn('Failed to stop background tracking session:', error);
  }
}
