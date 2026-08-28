import { Platform } from 'react-native';
import {DEV_API_PORT} from '../config/appConfig';
import {
  getApiBaseUrl,
  getChatWsUrl,
  getDispatcherTrackingWsUrl,
  getOrderTrackingWsUrl,
  getServerBaseUrl,
  getWsBaseUrl,
  REALTIME_MAX_RECONNECT_ATTEMPTS,
} from '../config/realtimeConfig';

describe('realtimeConfig', () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOs;
  });

  it('uses emulator loopback on Android', () => {
    Platform.OS = 'android';
    expect(getServerBaseUrl()).toBe(`http://10.0.2.2:${DEV_API_PORT}`);
    expect(getApiBaseUrl()).toBe(`http://10.0.2.2:${DEV_API_PORT}/api`);
    expect(getWsBaseUrl()).toBe(`ws://10.0.2.2:${DEV_API_PORT}`);
    expect(getOrderTrackingWsUrl(7)).toBe(`ws://10.0.2.2:${DEV_API_PORT}/ws/orders/7/tracking/`);
    expect(getDispatcherTrackingWsUrl()).toBe(`ws://10.0.2.2:${DEV_API_PORT}/ws/dispatcher/tracking/`);
    expect(getChatWsUrl(3)).toBe(`ws://10.0.2.2:${DEV_API_PORT}/ws/chat/3/`);
    expect(REALTIME_MAX_RECONNECT_ATTEMPTS).toBe(20);
  });

  it('uses localhost on iOS simulator', () => {
    Platform.OS = 'ios';
    expect(getServerBaseUrl()).toBe(`http://127.0.0.1:${DEV_API_PORT}`);
    expect(getOrderTrackingWsUrl(12)).toBe(`ws://127.0.0.1:${DEV_API_PORT}/ws/orders/12/tracking/`);
    expect(getDispatcherTrackingWsUrl()).toBe(`ws://127.0.0.1:${DEV_API_PORT}/ws/dispatcher/tracking/`);
  });
});
