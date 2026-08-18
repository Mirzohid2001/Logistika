import { getApiBaseUrl, getMediaBaseUrl, getWsBaseUrl } from './appConfig';

export { getApiBaseUrl, getMediaBaseUrl, getWsBaseUrl };

export const REALTIME_MAX_RECONNECT_ATTEMPTS = 20;
export const REALTIME_RECONNECT_MAX_DELAY_MS = 15000;

export function getServerBaseUrl(): string {
  return getMediaBaseUrl();
}

export function getOrderTrackingWsUrl(orderId: number): string {
  return `${getWsBaseUrl()}/ws/orders/${orderId}/tracking/`;
}

export function getDispatcherTrackingWsUrl(): string {
  return `${getWsBaseUrl()}/ws/dispatcher/tracking/`;
}

export function getChatWsUrl(chatId: number): string {
  return `${getWsBaseUrl()}/ws/chat/${chatId}/`;
}
