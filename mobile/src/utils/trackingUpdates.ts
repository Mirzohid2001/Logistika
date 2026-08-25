import { Order, OrderLocationTrack, OrderRouteStop } from '../types';

export interface LocationUpdatePayload {
  type?: string;
  order_id?: number;
  lat?: number;
  lng?: number;
  speed_mps?: number | null;
  heading?: number | null;
  raw_lat?: number | null;
  raw_lng?: number | null;
  snapped?: boolean;
  route_offset_meters?: number | null;
  route_progress_m?: number | null;
  updated_at?: string;
  driver_last_seen_at?: string;
  driver_app_state?: string;
  driver_presence?: Order['driver_presence'];
  tracking_summary?: Record<string, unknown>;
  estimated_eta_minutes?: number | null;
  status_code?: string;
  status_name?: string;
  message?: string;
  is_fully_paid?: boolean;
  remaining_amount?: number;
  paid_amount?: number;
  total_amount?: number;
  client_payment_confirmed?: boolean | null;
  client_payment_confirmed_at?: string | null;
  client_paid_reported?: boolean | null;
  client_paid_reported_at?: string | null;
  client_delivery_confirmed?: boolean | null;
  client_delivery_confirmed_at?: string | null;
  payment_progress?: number;
  distance_summary?: Order['distance_summary'];
  tracked_distance_meters?: number | null;
  tracked_distance_computed_at?: string | null;
  stop_id?: number;
  sequence?: number;
  skipped?: boolean;
  completed_at?: string;
  detected_at?: string;
  status?: string;
  has_proof_of_delivery?: boolean;
}

export function trackingTimestampMs(value: string | null | undefined): number | null {
  if (!value) {return null;}
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function payloadLocationTimestampMs(payload: LocationUpdatePayload): number | null {
  return trackingTimestampMs(payload.driver_last_seen_at || payload.updated_at);
}

/** Keep live motion when an older REST request resolves after a WebSocket packet. */
export function mergeOrderTrackingSnapshot(current: Order | null, incoming: Order): Order {
  if (!current || current.id !== incoming.id) {return incoming;}
  const currentAt = trackingTimestampMs(current.driver_last_seen_at);
  const incomingAt = trackingTimestampMs(incoming.driver_last_seen_at);
  if (currentAt == null || incomingAt == null || incomingAt >= currentAt) {
    return incoming;
  }
  return {
    ...incoming,
    current_location_lat: current.current_location_lat,
    current_location_lng: current.current_location_lng,
    current_speed_mps: current.current_speed_mps,
    current_heading: current.current_heading,
    route_progress_m: current.route_progress_m,
    driver_last_seen_at: current.driver_last_seen_at,
    driver_app_state: current.driver_app_state,
    driver_presence: current.driver_presence,
    tracking_summary: current.tracking_summary,
    distance_summary: current.distance_summary,
    estimated_eta_minutes: current.estimated_eta_minutes,
  };
}

/** Merge polling history with live points without rolling the route backwards. */
export function mergeLocationTracks(
  current: OrderLocationTrack[],
  incoming: OrderLocationTrack[],
  maxPoints = 200,
): OrderLocationTrack[] {
  const byKey = new Map<string, OrderLocationTrack>();
  for (const track of [...current, ...incoming]) {
    const key = `${track.timestamp}|${Number(track.lat).toFixed(7)}|${Number(track.lng).toFixed(7)}`;
    if (!byKey.has(key)) {
      byKey.set(key, track);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => (trackingTimestampMs(b.timestamp) ?? 0) - (trackingTimestampMs(a.timestamp) ?? 0))
    .slice(0, maxPoints);
}

function applyRouteStopPayload(order: Order, payload: LocationUpdatePayload): Order {
  if (!payload.stop_id || !order.route_stops?.length) {
    return order;
  }
  const route_stops = order.route_stops.map((stop): OrderRouteStop => {
    if (stop.id !== payload.stop_id) {
      return stop;
    }
    if (payload.type === 'route_stop_completed') {
      return {
        ...stop,
        status: payload.skipped ? 'skipped' : 'completed',
        completed_at: payload.completed_at || stop.completed_at,
      };
    }
    if (payload.type === 'route_stop_arrived') {
      return {
        ...stop,
        status: 'arrived',
        arrived_at: payload.detected_at || stop.arrived_at,
      };
    }
    return stop;
  });
  return { ...order, route_stops };
}

export function applyOrderRealtimePayload(order: Order | null, payload: LocationUpdatePayload): Order | null {
  if (!order) {return order;}

  if (payload.type === 'route_stop_completed' || payload.type === 'route_stop_arrived') {
    return applyRouteStopPayload(order, payload);
  }

  if (payload.type === 'order_status_changed' && payload.status_code) {
    return {
      ...order,
      status: {
        ...order.status,
        code: payload.status_code,
        name: payload.status_name || order.status.name,
      },
      is_fully_paid:
        payload.is_fully_paid !== undefined ? payload.is_fully_paid : order.is_fully_paid,
      remaining_amount:
        payload.remaining_amount !== undefined
          ? payload.remaining_amount
          : order.remaining_amount,
      distance_summary: (payload.distance_summary as Order['distance_summary']) || order.distance_summary,
      tracked_distance_meters:
        payload.tracked_distance_meters !== undefined
          ? payload.tracked_distance_meters
          : order.tracked_distance_meters,
      tracked_distance_computed_at:
        payload.tracked_distance_computed_at ?? order.tracked_distance_computed_at,
      tracking_summary: payload.distance_summary
        ? {
            ...(order.tracking_summary || {}),
            ...(payload.distance_summary as Record<string, unknown>),
          }
        : order.tracking_summary,
    };
  }

  if (payload.type === 'order_client_payment_confirmed') {
    const confirmed =
      payload.client_payment_confirmed !== undefined
        ? payload.client_payment_confirmed
        : order.client_payment_confirmed;
    const total = order.total_amount ?? 0;
    const paidPlatform = order.paid_amount ?? 0;
    const settled =
      total > 0 && (paidPlatform >= total || confirmed === true);
    return {
      ...order,
      client_payment_confirmed: confirmed,
      client_payment_confirmed_at:
        payload.client_payment_confirmed_at ?? order.client_payment_confirmed_at,
      is_fully_paid: payload.is_fully_paid ?? settled,
      remaining_amount:
        payload.remaining_amount !== undefined
          ? payload.remaining_amount
          : settled
            ? 0
            : order.remaining_amount,
      payment_progress:
        payload.payment_progress !== undefined
          ? payload.payment_progress
          : settled
            ? 100
            : order.payment_progress,
    };
  }

  if (payload.type === 'order_client_payment_reported') {
    return {
      ...order,
      client_paid_reported:
        payload.client_paid_reported !== undefined
          ? payload.client_paid_reported
          : order.client_paid_reported,
      client_paid_reported_at:
        payload.client_paid_reported_at ?? order.client_paid_reported_at,
    };
  }

  if (payload.type === 'order_pod_submitted' && payload.has_proof_of_delivery) {
    return {
      ...order,
      proof_of_delivery: order.proof_of_delivery ?? {
        id: 0,
        receiver_name: '',
        delivered_lat: 0,
        delivered_lng: 0,
        delivered_at: payload.updated_at || new Date().toISOString(),
      },
    };
  }

  if (payload.type === 'order_delivery_confirmed') {
    return {
      ...order,
      client_delivery_confirmed:
        payload.client_delivery_confirmed !== undefined
          ? payload.client_delivery_confirmed
          : order.client_delivery_confirmed,
      client_delivery_confirmed_at:
        payload.client_delivery_confirmed_at ?? order.client_delivery_confirmed_at,
    };
  }

  if (payload.type === 'order_payment_updated') {
    return {
      ...order,
      is_fully_paid: payload.is_fully_paid ?? order.is_fully_paid,
      remaining_amount:
        payload.remaining_amount !== undefined
          ? payload.remaining_amount
          : order.remaining_amount,
      paid_amount: payload.paid_amount ?? order.paid_amount,
      total_amount: payload.total_amount ?? order.total_amount,
      payment_progress:
        payload.total_amount != null && payload.total_amount > 0 && payload.paid_amount != null
          ? Math.min(100, (payload.paid_amount / payload.total_amount) * 100)
          : payload.is_fully_paid
            ? 100
            : order.payment_progress,
    };
  }

  return applyLocationUpdateToOrder(order, payload);
}

export function applyLocationUpdateToOrder(
  order: Order | null,
  payload: LocationUpdatePayload
): Order | null {
  if (!order || payload.lat == null || payload.lng == null) {
    return order;
  }
  const currentAt = trackingTimestampMs(order.driver_last_seen_at);
  const incomingAt = payloadLocationTimestampMs(payload);
  if (currentAt != null && incomingAt != null && incomingAt < currentAt) {
    return order;
  }
  const trackingSummary = (payload.tracking_summary as Order['tracking_summary']) || order.tracking_summary;
  const next: Order = {
    ...order,
    current_location_lat: payload.lat,
    current_location_lng: payload.lng,
    current_speed_mps:
      payload.speed_mps !== undefined ? payload.speed_mps : order.current_speed_mps,
    current_heading:
      payload.heading !== undefined ? payload.heading : order.current_heading,
    route_progress_m:
      payload.route_progress_m !== undefined
        ? payload.route_progress_m
        : order.route_progress_m,
    driver_last_seen_at: payload.driver_last_seen_at || order.driver_last_seen_at,
    driver_app_state: (payload.driver_app_state as Order['driver_app_state']) || order.driver_app_state,
    driver_presence: payload.driver_presence || order.driver_presence,
    tracking_summary: trackingSummary,
    distance_summary: trackingSummary
      ? {
          planned_distance_km: trackingSummary.planned_distance_km,
          planned_distance_source: trackingSummary.planned_distance_source,
          tracked_distance_km: trackingSummary.tracked_distance_km,
          distance_delta_km: trackingSummary.distance_delta_km,
          is_final: trackingSummary.is_final,
          track_points_used: trackingSummary.track_points_used,
        }
      : order.distance_summary,
    estimated_eta_minutes:
      payload.estimated_eta_minutes !== undefined
        ? payload.estimated_eta_minutes
        : order.estimated_eta_minutes,
  };
  if (payload.status_code) {
    next.status = {
      ...next.status,
      code: payload.status_code,
      name: payload.status_name || next.status.name,
    };
  }
  return next;
}

export function appendLocationTrack(
  tracks: OrderLocationTrack[],
  payload: LocationUpdatePayload,
  maxPoints: number = 200
): OrderLocationTrack[] {
  if (payload.lat == null || payload.lng == null) {
    return tracks;
  }
  const timestamp = payload.updated_at || payload.driver_last_seen_at || new Date().toISOString();
  const last = tracks[0];
  const lastTimestampMs = trackingTimestampMs(last?.timestamp);
  const nextTimestampMs = trackingTimestampMs(timestamp);
  if (lastTimestampMs != null && nextTimestampMs != null && nextTimestampMs < lastTimestampMs) {
    return tracks;
  }
  if (
    last &&
    Number(last.lat) === Number(payload.lat) &&
    Number(last.lng) === Number(payload.lng) &&
    last.timestamp === timestamp
  ) {
    return tracks;
  }
  const nextTrack: OrderLocationTrack = {
    id: Date.now(),
    lat: payload.lat,
    lng: payload.lng,
    timestamp,
  };
  return [nextTrack, ...tracks].slice(0, maxPoints);
}
