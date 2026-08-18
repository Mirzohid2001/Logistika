const mockCreateChannel = jest.fn().mockResolvedValue('driver-tracking');
const mockDisplayNotification = jest.fn().mockResolvedValue(undefined);
const mockStopForegroundService = jest.fn().mockResolvedValue(undefined);
const mockCancelNotification = jest.fn().mockResolvedValue(undefined);

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: (...args: unknown[]) => mockCreateChannel(...args),
    displayNotification: (...args: unknown[]) => mockDisplayNotification(...args),
    stopForegroundService: (...args: unknown[]) => mockStopForegroundService(...args),
    cancelNotification: (...args: unknown[]) => mockCancelNotification(...args),
  },
  AndroidImportance: { LOW: 2 },
  AndroidForegroundServiceType: { LOCATION: 8 },
}));

import { Platform } from 'react-native';
import {
  isBackgroundTrackingSupported,
  startBackgroundTrackingSession,
  stopBackgroundTrackingSession,
} from '../services/backgroundTrackingService';

const t = (key: string) => key;

describe('backgroundTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  it('reports platform support', () => {
    expect(isBackgroundTrackingSupported()).toBe(true);
  });

  it('starts android foreground service notification', async () => {
    const started = await startBackgroundTrackingSession(14, t);

    expect(started).toBe(true);
    expect(mockCreateChannel).toHaveBeenCalled();
    expect(mockDisplayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        android: expect.objectContaining({
          asForegroundService: true,
          ongoing: true,
        }),
      })
    );
  });

  it('does not use a local notification to keep iOS GPS alive', async () => {
    Platform.OS = 'ios';
    const started = await startBackgroundTrackingSession(14, t);
    expect(started).toBe(true);
    expect(mockDisplayNotification).not.toHaveBeenCalled();
  });

  it('stops foreground service and cancels notification', async () => {
    await stopBackgroundTrackingSession();

    expect(mockStopForegroundService).toHaveBeenCalled();
    expect(mockCancelNotification).toHaveBeenCalledWith('driver-location-tracking');
  });
});
