import { Vibration } from 'react-native';
import { toastService } from '../services/toastService';

export interface StopAlertPayload {
  type?: string;
  order_id?: number | string;
  level?: string;
  message?: string;
}

export function handleStopAlertEvent(
  payload: StopAlertPayload,
  options?: { fallbackMessage?: string; vibrate?: boolean },
): void {
  if (payload.type && payload.type !== 'stop_alert') return;

  const orderId = payload.order_id != null ? Number(payload.order_id) : null;
  const level = payload.level === 'critical' ? 'critical' : 'warning';
  const message =
    payload.message ||
    options?.fallbackMessage ||
    (orderId ? `Buyurtma #${orderId}: uzoq to'xtash` : "Uzoq to'xtash aniqlandi");

  if (options?.vibrate !== false) {
    Vibration.vibrate(level === 'critical' ? [0, 350, 150, 350] : 250);
  }

  if (level === 'critical') {
    toastService.error(message);
  } else {
    toastService.info(message);
  }
}

export function isHighPriorityNotificationType(type?: string): boolean {
  return type === 'stop_alert' || type === 'route_deviation';
}
