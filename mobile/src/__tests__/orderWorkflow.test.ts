import {
  getClientNextAction,
  getDriverListHintKey,
  getDriverNextAction,
} from '../utils/orderWorkflow';
import type { Order } from '../types';

const baseOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 1,
    status: { id: 1, code: 'in_transit', name: 'In transit' },
    ...overrides,
  } as Order);

describe('orderWorkflow next action', () => {
  it('asks the driver to submit POD while in transit without proof', () => {
    const action = getDriverNextAction(baseOrder());
    expect(action?.titleKey).toBe('orders.nextAction.submitPodTitle');
    expect(action?.tone).toBe('action');
  });

  it('asks the driver to wait after POD until the client confirms', () => {
    const action = getDriverNextAction(
      baseOrder({
        proof_of_delivery: {
          id: 1,
          receiver_name: 'Ali',
          delivered_lat: 41.3,
          delivered_lng: 69.2,
          delivered_at: '2026-01-01T12:00:00Z',
        },
      }),
    );
    expect(action?.titleKey).toBe('orders.nextAction.waitDeliveryTitle');
    expect(action?.tone).toBe('wait');
    expect(getDriverListHintKey('in_transit', baseOrder({
      proof_of_delivery: {
        id: 1,
        receiver_name: 'Ali',
        delivered_lat: 41.3,
        delivered_lng: 69.2,
        delivered_at: '2026-01-01T12:00:00Z',
      },
    }))).toBe('orders.waitingForClientDeliveryHint');
  });

  it('asks the client to confirm delivery after POD', () => {
    const action = getClientNextAction(
      baseOrder({
        proof_of_delivery: {
          id: 1,
          receiver_name: 'Ali',
          delivered_lat: 41.3,
          delivered_lng: 69.2,
          delivered_at: '2026-01-01T12:00:00Z',
        },
      }),
    );
    expect(action?.ctaKey).toBe('orders.clientDeliveryConfirmButton');
    expect(action?.titleKey).toBe('orders.nextAction.confirmDeliveryTitle');
  });

  it('asks the client to pay after delivery is confirmed', () => {
    const action = getClientNextAction(
      baseOrder({
        proof_of_delivery: {
          id: 1,
          receiver_name: 'Ali',
          delivered_lat: 41.3,
          delivered_lng: 69.2,
          delivered_at: '2026-01-01T12:00:00Z',
        },
        client_delivery_confirmed: true,
        remaining_amount: 500000,
      }),
    );
    expect(action?.ctaKey).toBe('payments.payRemaining');
    expect(action?.secondaryCtaKey).toBe('orders.clientPaymentReportPaid');
  });

  it('asks the driver to confirm payment after the client reports paid', () => {
    const action = getDriverNextAction(
      baseOrder({
        proof_of_delivery: {
          id: 1,
          receiver_name: 'Ali',
          delivered_lat: 41.3,
          delivered_lng: 69.2,
          delivered_at: '2026-01-01T12:00:00Z',
        },
        client_delivery_confirmed: true,
        client_paid_reported: true,
      }),
    );
    expect(action?.ctaKey).toBe('orders.markPaymentReceived');
    expect(action?.tone).toBe('action');
  });

  it('asks the driver to pick up cargo after arriving at pickup', () => {
    const action = getDriverNextAction(
      baseOrder({
        status: { id: 2, code: 'in_progress', name: 'In progress' },
        route_stops: [
          {
            id: 1,
            sequence: 1,
            stop_type: 'pickup',
            label: 'A',
            address: 'addr',
            status: 'arrived',
          },
        ],
      }),
    );
    expect(action?.titleKey).toBe('orders.nextAction.loadCargoTitle');
  });
});
