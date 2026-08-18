import {
  getLatestLocationsPerOrder,
  removeQueuedLocationsForOrders,
  upsertQueuedLocation,
  QueuedLocation,
} from '../utils/locationQueue';

const makeEntry = (
  orderId: number,
  lat: number,
  timestamp: string
): QueuedLocation => ({
  orderId,
  lat,
  lng: 64.4 + orderId,
  appState: 'background',
  timestamp,
});

describe('locationQueue', () => {
  describe('upsertQueuedLocation', () => {
    it('replaces older point for the same order', () => {
      const queue = [makeEntry(1, 39.1, '2026-01-01T10:00:00Z')];
      const next = upsertQueuedLocation(queue, makeEntry(1, 39.2, '2026-01-01T10:05:00Z'));

      expect(next).toHaveLength(1);
      expect(next[0].lat).toBe(39.2);
    });

    it('keeps latest points for different orders', () => {
      const queue = [makeEntry(1, 39.1, '2026-01-01T10:00:00Z')];
      const next = upsertQueuedLocation(queue, makeEntry(2, 40.1, '2026-01-01T10:01:00Z'));

      expect(next).toHaveLength(2);
      expect(next.map((item) => item.orderId).sort()).toEqual([1, 2]);
    });
  });

  describe('getLatestLocationsPerOrder', () => {
    it('returns only the newest point per order', () => {
      const queue = [
        makeEntry(1, 39.1, '2026-01-01T10:00:00Z'),
        makeEntry(1, 39.2, '2026-01-01T10:05:00Z'),
        makeEntry(2, 40.1, '2026-01-01T10:02:00Z'),
      ];

      const latest = getLatestLocationsPerOrder(queue);
      expect(latest).toHaveLength(2);
      expect(latest.find((item) => item.orderId === 1)?.lat).toBe(39.2);
      expect(latest.find((item) => item.orderId === 2)?.lat).toBe(40.1);
    });
  });

  describe('removeQueuedLocationsForOrders', () => {
    it('removes flushed orders from queue', () => {
      const queue = [
        makeEntry(1, 39.2, '2026-01-01T10:05:00Z'),
        makeEntry(2, 40.1, '2026-01-01T10:02:00Z'),
      ];

      const next = removeQueuedLocationsForOrders(queue, [1]);
      expect(next).toHaveLength(1);
      expect(next[0].orderId).toBe(2);
    });
  });
});
