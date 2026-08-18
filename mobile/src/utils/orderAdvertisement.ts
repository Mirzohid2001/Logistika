import { advertisementsService } from '../services/advertisementsService';
import type { Advertisement, Order } from '../types';

export function getEmbeddedAdvertisement(
  order: Order | null | undefined,
): Advertisement | null {
  if (!order?.advertisement || typeof order.advertisement !== 'object') {
    return null;
  }
  return order.advertisement;
}

export async function resolveOrderAdvertisement(
  order: Order | null | undefined,
): Promise<Advertisement | null> {
  if (!order?.advertisement) return null;
  if (typeof order.advertisement === 'object') {
    return order.advertisement;
  }
  try {
    return await advertisementsService.getAdvertisement(order.advertisement);
  } catch {
    return null;
  }
}
