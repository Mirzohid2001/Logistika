import { Linking, Platform } from 'react-native';
import type { LatLng } from './mapGeo';

async function tryOpenExternalUrl(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

function buildYandexMapsWebUrlForAddress(city: string, address: string): string {
  const fullAddress = [city, address].filter(Boolean).join(', ');
  return `https://yandex.ru/maps/?text=${encodeURIComponent(fullAddress)}`;
}

function buildYandexMapsWebUrlForPoint(point: LatLng): string {
  const lat = point.latitude.toFixed(6);
  const lng = point.longitude.toFixed(6);
  return `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
}

export async function openYandexNavigatorToAddress(city: string, address: string): Promise<void> {
  const fullAddress = [city, address].filter(Boolean).join(', ');
  const encodedAddress = encodeURIComponent(fullAddress);
  const nativeUrls = [
    `yandexnavi://build_route?address_to=${encodedAddress}`,
    `yandexmaps://maps.yandex.ru/?text=${encodedAddress}`,
  ];

  for (const url of nativeUrls) {
    if (await tryOpenExternalUrl(url)) return;
  }

  await Linking.openURL(buildYandexMapsWebUrlForAddress(city, address));
}

export async function openYandexNavigatorToPoint(
  point: LatLng,
  fallbackCity: string,
  fallbackAddress: string,
): Promise<void> {
  const lat = point.latitude.toFixed(6);
  const lng = point.longitude.toFixed(6);
  const nativeUrls = [
    `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`,
    `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=16&l=map`,
  ];

  for (const url of nativeUrls) {
    if (await tryOpenExternalUrl(url)) return;
  }

  try {
    await Linking.openURL(buildYandexMapsWebUrlForPoint(point));
  } catch {
    await openYandexNavigatorToAddress(fallbackCity, fallbackAddress);
  }
}
