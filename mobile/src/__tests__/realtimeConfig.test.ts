import { Platform } from 'react-native';
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
    expect(getServerBaseUrl()).toBe('http://10.0.2.2:8000');
    expect(getApiBaseUrl()).toBe('http://10.0.2.2:8000/api');
    expect(getWsBaseUrl()).toBe('ws://10.0.2.2:8000');
    expect(getOrderTrackingWsUrl(7)).toBe('ws://10.0.2.2:8000/ws/orders/7/tracking/');
    expect(getDispatcherTrackingWsUrl()).toBe('ws://10.0.2.2:8000/ws/dispatcher/tracking/');
    expect(getChatWsUrl(3)).toBe('ws://10.0.2.2:8000/ws/chat/3/');
    expect(REALTIME_MAX_RECONNECT_ATTEMPTS).toBe(20);
  });

  it('uses localhost on iOS simulator', () => {
    Platform.OS = 'ios';
    expect(getServerBaseUrl()).toBe('http://127.0.0.1:8000');
    expect(getOrderTrackingWsUrl(12)).toBe('ws://127.0.0.1:8000/ws/orders/12/tracking/');
    expect(getDispatcherTrackingWsUrl()).toBe('ws://127.0.0.1:8000/ws/dispatcher/tracking/');
  });
});
