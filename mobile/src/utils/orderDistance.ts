import type { Order } from '../types';

export type OrderDistanceInfo = {
  planned_distance_km?: number | null;
  planned_distance_source?: string | null;
  tracked_distance_km?: number | null;
  loaded_distance_km?: number | null;
  deadhead_distance_km?: number | null;
  distance_delta_km?: number | null;
  is_final?: boolean;
  track_points_used?: number;
};

export function getOrderDistanceInfo(order?: Order | null): OrderDistanceInfo | null {
  if (!order) return null;
  const summary = order.distance_summary;
  const tracking = order.tracking_summary;
  const merged: OrderDistanceInfo = {
    planned_distance_km: summary?.planned_distance_km ?? tracking?.planned_distance_km,
    planned_distance_source: summary?.planned_distance_source ?? tracking?.planned_distance_source,
    tracked_distance_km: summary?.tracked_distance_km ?? tracking?.tracked_distance_km,
    loaded_distance_km: summary?.loaded_distance_km ?? tracking?.loaded_distance_km,
    deadhead_distance_km: summary?.deadhead_distance_km ?? tracking?.deadhead_distance_km,
    distance_delta_km: summary?.distance_delta_km ?? tracking?.distance_delta_km,
    is_final: summary?.is_final ?? tracking?.is_final,
    track_points_used: summary?.track_points_used ?? tracking?.track_points_used,
  };
  const hasData =
    (merged.tracked_distance_km != null && merged.tracked_distance_km > 0) ||
    (merged.loaded_distance_km != null && merged.loaded_distance_km > 0) ||
    (merged.planned_distance_km != null && merged.planned_distance_km > 0);
  return hasData ? merged : null;
}

export function orderHasDistanceMetrics(order?: Order | null): boolean {
  return getOrderDistanceInfo(order) != null || !!order?.tracking_summary;
}
