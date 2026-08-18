import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { ordersService } from './ordersService';
import {
  getLatestLocationsPerOrder,
  QueuedLocation,
  removeQueuedLocationsForOrders,
  upsertQueuedLocation,
} from '../utils/locationQueue';

const QUEUE_KEY = 'location_update_queue_v1';
/** ~1Hz GPS stream for Yandex-like live tracking. */
export const LOCATION_POST_INTERVAL_MS = 1000;
export const LOCATION_MOVEMENT_THRESHOLD_METERS = 2;
/** Skip GPS fixes worse than this accuracy (meters). */
export const LOCATION_MAX_ACCURACY_METERS = 45;

export type LocationMotionExtras = {
  speedMps?: number | null;
  heading?: number | null;
};

/** Normalize Geolocation coords into API motion fields (null when GPS has no fix). */
export function motionFromCoords(coords: {
  speed?: number | null;
  heading?: number | null;
}): LocationMotionExtras {
  const speedRaw = coords.speed;
  const headingRaw = coords.heading;
  const speedMps =
    speedRaw != null && Number.isFinite(speedRaw) && speedRaw >= 0 ? speedRaw : null;
  const heading =
    headingRaw != null && Number.isFinite(headingRaw) && headingRaw >= 0
      ? ((headingRaw % 360) + 360) % 360
      : null;
  return { speedMps, heading };
}

/** True when accuracy is missing or good enough to publish. */
export function isAcceptableGpsAccuracy(
  accuracy: number | null | undefined,
  maxMeters = LOCATION_MAX_ACCURACY_METERS
): boolean {
  if (accuracy == null || !Number.isFinite(accuracy)) {
    return true;
  }
  return accuracy <= maxMeters;
}

type TranslateFn = (key: string) => string;

export async function readLocationQueue(): Promise<QueuedLocation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedLocation[];
  } catch {
    return [];
  }
}

export async function writeLocationQueue(queue: QueuedLocation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function ensureForegroundLocationPermission(t: TranslateFn): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: t('tracking.permissionRequiredTitle'),
        message: t('tracking.locationPermissionRequired'),
        buttonPositive: t('common.ok'),
        buttonNegative: t('common.cancel'),
      }
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      showLocationDeniedAlert(t);
      return false;
    }
    return true;
  }

  const permission = await Geolocation.requestAuthorization('whenInUse');
  if (permission === 'denied' || permission === 'disabled') {
    showLocationDeniedAlert(t);
    return false;
  }
  return true;
}

export async function ensureBackgroundLocationPermission(t: TranslateFn): Promise<boolean> {
  const foregroundGranted = await ensureForegroundLocationPermission(t);
  if (!foregroundGranted) {
    return false;
  }

  if (Platform.OS === 'android') {
    if (Platform.Version < 29) {
      return true;
    }
    const backgroundGranted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      {
        title: t('tracking.backgroundPermissionTitle'),
        message: t('tracking.backgroundPermissionMessage'),
        buttonPositive: t('common.ok'),
        buttonNegative: t('common.cancel'),
      }
    );
    if (backgroundGranted !== PermissionsAndroid.RESULTS.GRANTED) {
      showLocationDeniedAlert(t);
      return false;
    }
    return true;
  }

  const permission = await Geolocation.requestAuthorization('always');
  if (permission !== 'granted') {
    showLocationDeniedAlert(t);
    return false;
  }
  return true;
}

/** @deprecated use ensureForegroundLocationPermission */
export const ensureLocationPermission = ensureForegroundLocationPermission;

function showLocationDeniedAlert(t: TranslateFn) {
  Alert.alert(t('common.error'), t('tracking.locationPermissionDenied'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('tracking.openSettings'), onPress: () => Linking.openSettings() },
  ]);
}

export async function enqueueLocationUpdate(item: QueuedLocation): Promise<void> {
  const queue = await readLocationQueue();
  const nextQueue = upsertQueuedLocation(queue, item);
  await writeLocationQueue(nextQueue);
}

export async function flushLocationQueue(): Promise<void> {
  const queue = await readLocationQueue();
  if (!queue.length) return;

  const latestItems = getLatestLocationsPerOrder(queue);
  const flushedOrderIds: number[] = [];

  for (const item of latestItems) {
    try {
      await ordersService.updateLocation(item.orderId, item.lat, item.lng, item.appState, {
        speedMps: item.speedMps,
        heading: item.heading,
      });
      flushedOrderIds.push(item.orderId);
    } catch (error) {
      if (isLocationUpdateRejected(error)) {
        flushedOrderIds.push(item.orderId);
      }
      continue;
    }
  }

  if (!flushedOrderIds.length) {
    return;
  }

  const remaining = removeQueuedLocationsForOrders(queue, flushedOrderIds);
  await writeLocationQueue(remaining);
}

export function isLocationUpdateRejected(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const statusCode = (error as { statusCode?: number }).statusCode;
  const code = (error as { code?: string }).code;
  const originalCode = (error as { originalError?: { response?: { data?: { code?: string } } } })
    .originalError?.response?.data?.code;
  if (
    code === 'location_updates_not_allowed' ||
    originalCode === 'location_updates_not_allowed'
  ) {
    return true;
  }
  return statusCode === 400 || statusCode === 403 || statusCode === 404;
}

export async function postLocationUpdate(
  orderId: number,
  lat: number,
  lng: number,
  appState: 'foreground' | 'background' | 'inactive' = 'foreground',
  motion: LocationMotionExtras = {}
): Promise<void> {
  try {
    await ordersService.updateLocation(orderId, lat, lng, appState, motion);
    await flushLocationQueue();
  } catch (error) {
    if (isLocationUpdateRejected(error)) {
      throw error;
    }
    await enqueueLocationUpdate({
      orderId,
      lat,
      lng,
      appState,
      timestamp: new Date().toISOString(),
      speedMps: motion.speedMps,
      heading: motion.heading,
    });
  }
}
