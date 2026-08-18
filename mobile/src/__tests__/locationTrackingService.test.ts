import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import { Platform } from 'react-native';
import {
  enqueueLocationUpdate,
  flushLocationQueue,
  isAcceptableGpsAccuracy,
  postLocationUpdate,
  readLocationQueue,
  buildActiveLocationWatchOptions,
  resolveLocationAccess,
  ensureBackgroundLocationPermission,
  resetLocationAccessState,
} from '../services/locationTrackingService';
import { ordersService } from '../services/ordersService';
import {
  getIosLocationAuthStatus,
  requestIosAlwaysAuthorization,
} from '../services/iosLocationAuth';

jest.mock('../services/ordersService', () => ({
  ordersService: {
    updateLocation: jest.fn(),
  },
}));

jest.mock('../services/iosLocationAuth', () => ({
  getIosLocationAuthStatus: jest.fn().mockResolvedValue('whenInUse'),
  requestIosAlwaysAuthorization: jest.fn().mockResolvedValue('whenInUse'),
  isIosAlwaysGranted: (status: string) => status === 'always',
  subscribeIosLocationAuth: jest.fn(() => () => undefined),
}));

const mockedIosStatus = getIosLocationAuthStatus as jest.Mock;
const mockedIosAlways = requestIosAlwaysAuthorization as jest.Mock;

jest.mock('../services/ordersService', () => ({
  ordersService: {
    updateLocation: jest.fn(),
  },
}));

const mockedUpdateLocation = ordersService.updateLocation as jest.Mock;

describe('locationTrackingService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetLocationAccessState();
    await AsyncStorage.clear();
  });

  it('rejects inaccurate GPS fixes', () => {
    expect(isAcceptableGpsAccuracy(12)).toBe(true);
    expect(isAcceptableGpsAccuracy(80)).toBe(false);
    expect(isAcceptableGpsAccuracy(null)).toBe(true);
  });

  it('keeps only the latest queued point per order', async () => {
    await enqueueLocationUpdate({
      orderId: 7,
      lat: 39.1,
      lng: 64.4,
      appState: 'background',
      timestamp: '2026-01-01T10:00:00Z',
    });
    await enqueueLocationUpdate({
      orderId: 7,
      lat: 39.2,
      lng: 64.5,
      appState: 'background',
      timestamp: '2026-01-01T10:05:00Z',
    });

    const queue = await readLocationQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].lat).toBe(39.2);
  });

  it('flushes only latest points per order', async () => {
    mockedUpdateLocation.mockResolvedValue({ id: 7 });

    await enqueueLocationUpdate({
      orderId: 7,
      lat: 39.1,
      lng: 64.4,
      appState: 'background',
      timestamp: '2026-01-01T10:00:00Z',
    });
    await enqueueLocationUpdate({
      orderId: 7,
      lat: 39.2,
      lng: 64.5,
      appState: 'background',
      timestamp: '2026-01-01T10:05:00Z',
    });
    await enqueueLocationUpdate({
      orderId: 8,
      lat: 40.1,
      lng: 65.1,
      appState: 'background',
      timestamp: '2026-01-01T10:06:00Z',
    });

    await flushLocationQueue();

    expect(mockedUpdateLocation).toHaveBeenCalledTimes(2);
    expect(mockedUpdateLocation).toHaveBeenCalledWith(7, 39.2, 64.5, 'background', {
      speedMps: undefined,
      heading: undefined,
    });
    expect(mockedUpdateLocation).toHaveBeenCalledWith(8, 40.1, 65.1, 'background', {
      speedMps: undefined,
      heading: undefined,
    });
    expect(await readLocationQueue()).toHaveLength(0);
  });

  it('continues flushing other orders when one request fails', async () => {
    mockedUpdateLocation
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 8 });

    await enqueueLocationUpdate({
      orderId: 7,
      lat: 39.1,
      lng: 64.4,
      appState: 'background',
      timestamp: '2026-01-01T10:00:00Z',
    });
    await enqueueLocationUpdate({
      orderId: 8,
      lat: 40.1,
      lng: 65.1,
      appState: 'background',
      timestamp: '2026-01-01T10:06:00Z',
    });

    await flushLocationQueue();

    expect(mockedUpdateLocation).toHaveBeenCalledTimes(2);
    const queue = await readLocationQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].orderId).toBe(7);
  });

  it('queues update when network request fails', async () => {
    mockedUpdateLocation.mockRejectedValueOnce(new Error('offline'));

    await postLocationUpdate(9, 41.3, 69.2, 'background');

    const queue = await readLocationQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].orderId).toBe(9);
    expect(queue[0].lat).toBe(41.3);
  });

  it('does not queue rejected location updates', async () => {
    mockedUpdateLocation.mockRejectedValueOnce({
      statusCode: 400,
      code: 'validation_error',
      originalError: { response: { data: { code: 'location_updates_not_allowed' } } },
    });

    await expect(postLocationUpdate(2, 41.3, 69.2, 'foreground')).rejects.toBeTruthy();
    const queue = await readLocationQueue();
    expect(queue).toHaveLength(0);
  });

  it('enables iOS background GPS watch flags', () => {
    const options = buildActiveLocationWatchOptions();
    expect(options.showsBackgroundLocationIndicator).toBe(true);
    expect(options.pauseUpdatesAutomatically).toBe(false);
    expect(options.useSignificantChanges).toBe(false);
    expect(options.accuracy?.ios).toBe('bestForNavigation');
  });

  it('allows iOS foreground tracking when Always is denied', async () => {
    const previous = Platform.OS;
    Platform.OS = 'ios';
    resetLocationAccessState();
    (Geolocation.requestAuthorization as jest.Mock).mockResolvedValue('granted');
    mockedIosStatus.mockResolvedValue('whenInUse');
    mockedIosAlways.mockResolvedValue('whenInUse');

    const access = await resolveLocationAccess((key) => key);
    expect(access.foreground).toBe(true);
    expect(access.background).toBe(false);
    expect(mockedIosAlways).toHaveBeenCalled();
    expect(await ensureBackgroundLocationPermission((key) => key)).toBe(true);
    Platform.OS = previous;
  });

  it('marks iOS background granted only for Always, not When-In-Use', async () => {
    const previous = Platform.OS;
    Platform.OS = 'ios';
    resetLocationAccessState();
    (Geolocation.requestAuthorization as jest.Mock).mockResolvedValue('granted');
    mockedIosStatus.mockResolvedValue('whenInUse');
    mockedIosAlways.mockResolvedValue('always');

    const access = await resolveLocationAccess((key) => key);
    expect(access.foreground).toBe(true);
    expect(access.background).toBe(true);
    Platform.OS = previous;
  });
});
