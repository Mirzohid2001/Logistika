export interface QueuedLocation {
  orderId: number;
  lat: number;
  lng: number;
  appState: 'foreground' | 'background' | 'inactive';
  timestamp: string;
  speedMps?: number | null;
  heading?: number | null;
}

export const MAX_QUEUE_SIZE = 50;

/** Har bir buyurtma uchun faqat eng yangi nuqta saqlanadi. */
export function upsertQueuedLocation(
  queue: QueuedLocation[],
  item: QueuedLocation
): QueuedLocation[] {
  const withoutOrder = queue.filter((entry) => entry.orderId !== item.orderId);
  const next = [...withoutOrder, item];
  return next.slice(-MAX_QUEUE_SIZE);
}

/** Flush uchun buyurtma bo'yicha eng yangi nuqtalar. */
export function getLatestLocationsPerOrder(queue: QueuedLocation[]): QueuedLocation[] {
  const latestByOrder = new Map<number, QueuedLocation>();
  for (const entry of queue) {
    const existing = latestByOrder.get(entry.orderId);
    if (!existing || entry.timestamp >= existing.timestamp) {
      latestByOrder.set(entry.orderId, entry);
    }
  }
  return Array.from(latestByOrder.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
}

export function removeQueuedLocationsForOrders(
  queue: QueuedLocation[],
  orderIds: number[]
): QueuedLocation[] {
  const removeSet = new Set(orderIds);
  return queue.filter((entry) => !removeSet.has(entry.orderId));
}
