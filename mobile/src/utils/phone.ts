import { Linking, Platform } from 'react-native';

/** Normalize Uzbekistan phone to 998XXXXXXXXX (digits only). */
export function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {return '';}
  if (digits.startsWith('998') && digits.length >= 12) {
    return digits.slice(0, 12);
  }
  if (digits.length === 9 && digits.startsWith('9')) {
    return `998${digits}`;
  }
  return digits;
}

export function isValidUzPhone(phone: string): boolean {
  return /^998\d{9}$/.test(normalizePhone(phone));
}

/** Dialer URL for a phone number (tel: scheme). */
export function toTelUrl(phone: string): string | null {
  const digits = String(phone || '').replace(/[^\d+]/g, '').trim();
  if (!digits) {return null;}
  return `tel:${digits}`;
}

export async function makePhoneCall(phone?: string | null): Promise<boolean> {
  const url = toTelUrl(phone || '');
  if (!url) {return false;}
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen && Platform.OS === 'ios') {
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
