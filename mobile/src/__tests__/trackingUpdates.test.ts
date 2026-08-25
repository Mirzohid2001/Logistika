import {
  applyLocationUpdateToOrder,
  applyOrderRealtimePayload,
  appendLocationTrack,
  mergeLocationTracks,
  mergeOrderTrackingSnapshot,
} from '../utils/trackingUpdates';
import { Order } from '../types';

const baseOrder: Order = {
  id: 1,
  advertisement: 1,
  driver: 2,
  client: 3,
  created_at: '2026-01-01T09:00:00Z',
  status: { id: 1, code: 'in_progress', name: 'In progress' },
  current_location_lat: 39.1,
  current_location_lng: 64.4,
  driver_last_seen_at: '2026-01-01T10:00:00Z',
};

describe('trackingUpdates', () => {
  describe('applyLocationUpdateToOrder', () => {
    it('updates current coordinates from websocket payload', () => {
      const updated = applyLocationUpdateToOrder(baseOrder, {
        lat: 39.5,
        lng: 64.9,
        speed_mps: 8.2,
        heading: 45,
        driver_last_seen_at: '2026-01-01T10:05:00Z',
      });

      expect(updated?.current_location_lat).toBe(39.5);
      expect(updated?.current_location_lng).toBe(64.9);
      expect(updated?.current_speed_mps).toBe(8.2);
      expect(updated?.current_heading).toBe(45);
      expect(updated?.driver_last_seen_at).toBe('2026-01-01T10:05:00Z');
    });

    it('returns original order when payload has no coordinates', () => {
      expect(applyLocationUpdateToOrder(baseOrder, {})).toBe(baseOrder);
      expect(applyLocationUpdateToOrder(null, { lat: 1, lng: 2 })).toBeNull();
    });

    it('ignores an older websocket location packet', () => {
      const updated = applyLocationUpdateToOrder(baseOrder, {
        lat: 40,
        lng: 65,
        driver_last_seen_at: '2026-01-01T09:59:59Z',
      });
      expect(updated).toBe(baseOrder);
    });
  });

  describe('applyOrderRealtimePayload', () => {
    it('updates offline payment confirmation from websocket payload', () => {
      const orderWithAmount: Order = {
        ...baseOrder,
        total_amount: 500000,
        paid_amount: 0,
        remaining_amount: 500000,
        is_fully_paid: false,
      };
      const updated = applyOrderRealtimePayload(orderWithAmount, {
        type: 'order_client_payment_confirmed',
        order_id: 1,
        client_payment_confirmed: true,
        client_payment_confirmed_at: '2026-01-01T11:00:00Z',
        is_fully_paid: true,
        remaining_amount: 0,
        payment_progress: 100,
      });

      expect(updated?.client_payment_confirmed).toBe(true);
      expect(updated?.client_payment_confirmed_at).toBe('2026-01-01T11:00:00Z');
      expect(updated?.is_fully_paid).toBe(true);
      expect(updated?.remaining_amount).toBe(0);
      expect(updated?.payment_progress).toBe(100);
    });

    it('updates client delivery confirmation from websocket payload', () => {
      const updated = applyOrderRealtimePayload(baseOrder, {
        type: 'order_delivery_confirmed',
        order_id: 1,
        client_delivery_confirmed: true,
        client_delivery_confirmed_at: '2026-01-01T11:30:00Z',
      });

      expect(updated?.client_delivery_confirmed).toBe(true);
      expect(updated?.client_delivery_confirmed_at).toBe('2026-01-01T11:30:00Z');
    });

    it('marks proof of delivery present from websocket payload', () => {
      const updated = applyOrderRealtimePayload(baseOrder, {
        type: 'order_pod_submitted',
        order_id: 1,
        has_proof_of_delivery: true,
        updated_at: '2026-01-01T11:20:00Z',
      });
      expect(updated?.proof_of_delivery).toBeTruthy();
    });

    it('updates route stop status on route_stop_completed payload', () => {
      const order: Order = {
        ...baseOrder,
        route_stops: [
          {
            id: 10,
            sequence: 1,
            stop_type: 'pickup',
            label: 'Pickup',
            address: 'A',
            status: 'arrived',
          },
        ],
      };
      const updated = applyOrderRealtimePayload(order, {
        type: 'route_stop_completed',
        stop_id: 10,
        completed_at: '2026-01-01T11:00:00Z',
        skipped: false,
      });
      expect(updated?.route_stops?.[0].status).toBe('completed');
    });
  });

  describe('appendLocationTrack', () => {
    it('prepends a new track point', () => {
      const tracks = appendLocationTrack([], {
        lat: 39.5,
        lng: 64.9,
        updated_at: '2026-01-01T10:05:00Z',
      });

      expect(tracks).toHaveLength(1);
      expect(tracks[0].lat).toBe(39.5);
    });

    it('skips duplicate consecutive points', () => {
      const first = appendLocationTrack([], {
        lat: 39.5,
        lng: 64.9,
        updated_at: '2026-01-01T10:05:00Z',
      });
      const second = appendLocationTrack(first, {
        lat: 39.5,
        lng: 64.9,
        updated_at: '2026-01-01T10:05:00Z',
      });

      expect(second).toHaveLength(1);
    });

    it('does not prepend an out-of-order live point', () => {
      const current = appendLocationTrack([], {
        lat: 39.5,
        lng: 64.9,
        updated_at: '2026-01-01T10:05:00Z',
      });
      const older = appendLocationTrack(current, {
        lat: 39.4,
        lng: 64.8,
        updated_at: '2026-01-01T10:04:00Z',
      });
      expect(older).toBe(current);
    });
  });

  it('preserves newer live motion when an old poll resolves', () => {
    const live: Order = {
      ...baseOrder,
      current_location_lat: 41,
      current_location_lng: 69,
      current_speed_mps: 12,
      driver_last_seen_at: '2026-01-01T10:05:00Z',
    };
    const merged = mergeOrderTrackingSnapshot(live, baseOrder);
    expect(merged.current_location_lat).toBe(41);
    expect(merged.current_speed_mps).toBe(12);
    expect(merged.driver_last_seen_at).toBe('2026-01-01T10:05:00Z');
  });

  it('merges and sorts REST and live tracks without duplicates', () => {
    const live = [{ id: 2, lat: 40, lng: 65, timestamp: '2026-01-01T10:05:00Z' }];
    const rest = [
      { id: 1, lat: 39.5, lng: 64.9, timestamp: '2026-01-01T10:00:00Z' },
      { id: 3, lat: 40, lng: 65, timestamp: '2026-01-01T10:05:00Z' },
    ];
    const merged = mergeLocationTracks(live, rest);
    expect(merged).toHaveLength(2);
    expect(merged[0].timestamp).toBe('2026-01-01T10:05:00Z');
  });
});
