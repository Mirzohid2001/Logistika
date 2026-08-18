import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { ordersService } from '../services/ordersService';
import {
  startActiveOrderLocationSession,
  stopActiveOrderLocationSession,
} from '../services/activeOrderLocationSession';
import type { Order } from '../types';

const TRACKING_STATUSES = new Set(['in_progress', 'in_transit']);

function firstActiveTrip(payload: { results?: Order[] } | Order[] | null | undefined): Order | null {
  const rows = Array.isArray(payload) ? payload : payload?.results || [];
  return rows.find((order) => TRACKING_STATUSES.has(order.status?.code || '')) || null;
}

/** Keep GPS alive for the driver's active trip, even when the map screen is closed. */
export function useDriverActiveOrderTracking() {
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const payload = await ordersService.getOrders({ status: 'active', page_size: 20 });
        if (cancelled) {
          return;
        }
        const active = firstActiveTrip(payload);
        if (active) {
          await startActiveOrderLocationSession(active.id, t);
        } else {
          await stopActiveOrderLocationSession();
        }
      } catch {
        // Keep the existing session if the list request fails.
      }
    };

    void sync();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void sync();
      }
    });
    const interval = setInterval(() => {
      void sync();
    }, 20000);

    return () => {
      cancelled = true;
      appSub.remove();
      clearInterval(interval);
    };
  }, [t]);
}
