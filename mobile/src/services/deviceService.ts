import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'logistika_device_id_v2';

function generateFallbackDeviceId(): string {
  return `fb_${Platform.OS}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export const deviceService = {
  async getDeviceId(): Promise<string> {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 8) {
      return existing;
    }

    const created = generateFallbackDeviceId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  },
};
