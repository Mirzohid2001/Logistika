import type { Order, OrderRouteStop } from '../types';
import type { LatLng } from './mapGeo';
import { geocodeAddress } from './orderRoute';

function parseCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function stopToLatLng(stop: OrderRouteStop): LatLng | null {
  const lat = parseCoord(stop.lat);
  const lng = parseCoord(stop.lng);
  if (lat == null || lng == null) return null;
  return { latitude: lat, longitude: lng };
}

export function getSortedRouteStops(stops?: OrderRouteStop[] | null): OrderRouteStop[] {
  if (!stops?.length) return [];
  return [...stops].sort((a, b) => a.sequence - b.sequence);
}

export function getActiveRouteStop(stops?: OrderRouteStop[] | null): OrderRouteStop | null {
  const sorted = getSortedRouteStops(stops);
  return (
    sorted.find((stop) => stop.status === 'arrived') ??
    sorted.find((stop) => stop.status === 'pending') ??
    null
  );
}

export function canManuallyCompleteStop(stop?: OrderRouteStop | null): boolean {
  return Boolean(stop && stop.status === 'arrived');
}

export function canSkipStop(
  stop?: OrderRouteStop | null,
  allStops?: OrderRouteStop[] | null,
): boolean {
  if (!stop || stop.status === 'completed' || stop.status === 'skipped') {
    return false;
  }
  if (stop.stop_type === 'pickup') {
    return false;
  }
  const sorted = getSortedRouteStops(allStops);
  const lastDelivery =
    [...sorted].reverse().find((item) => item.stop_type === 'delivery') ??
    sorted[sorted.length - 1];
  if (lastDelivery && lastDelivery.id === stop.id) {
    return false;
  }
  return true;
}

export function routeStopsWithCoordinates(stops?: OrderRouteStop[] | null): OrderRouteStop[] {
  return getSortedRouteStops(stops).filter((stop) => stopToLatLng(stop) != null);
}

export function routeStopsToMapCoordinates(stops?: OrderRouteStop[] | null): LatLng[] {
  return routeStopsWithCoordinates(stops)
    .map((stop) => stopToLatLng(stop))
    .filter((point): point is LatLng => point != null);
}

export function getPlannedRouteCoordinates(order?: Order | null): LatLng[] {
  const optimized = (order?.optimized_route_polyline || [])
    .map((point) => {
      const lat = parseCoord(point.lat);
      const lng = parseCoord(point.lng);
      if (lat == null || lng == null) return null;
      return { latitude: lat, longitude: lng };
    })
    .filter((point): point is LatLng => point != null);
  if (optimized.length > 1) return optimized;

  const fromStops = routeStopsToMapCoordinates(order?.route_stops);
  if (fromStops.length > 1) return fromStops;

  const fromPlan = (order?.planned_route_points || [])
    .map((point) => {
      const lat = parseCoord(point.lat);
      const lng = parseCoord(point.lng);
      if (lat == null || lng == null) return null;
      return { latitude: lat, longitude: lng };
    })
    .filter((point): point is LatLng => point != null);
  return fromPlan;
}

export function countStopsNeedingCoordinates(stops?: OrderRouteStop[] | null): number {
  return getSortedRouteStops(stops).filter((stop) => !stopToLatLng(stop) && stop.address?.trim()).length;
}

export async function hydrateRouteStopCoordinates(
  orderId: number,
  stops: OrderRouteStop[],
  updateStop: (
    orderId: number,
    stopId: number,
    payload: { lat: number; lng: number }
  ) => Promise<OrderRouteStop>
): Promise<OrderRouteStop[]> {
  const updated = [...stops];
  for (const stop of updated) {
    if (stopToLatLng(stop) || !stop.address?.trim()) continue;
    const point = await geocodeAddress('', stop.address);
    if (!point) continue;
    const saved = await updateStop(orderId, stop.id, {
      lat: point.latitude,
      lng: point.longitude,
    });
    const index = updated.findIndex((item) => item.id === stop.id);
    if (index >= 0) updated[index] = saved;
  }
  return updated;
}

export function formatRouteMetrics(order?: Order | null): string | null {
  const distanceInfo = order?.distance_summary;
  const distanceMeters =
    order?.optimized_route_distance_meters ??
    (distanceInfo?.planned_distance_km != null
      ? Math.round(distanceInfo.planned_distance_km * 1000)
      : null);
  const duration = order?.optimized_route_duration_seconds;
  if (!distanceMeters && !duration) return null;
  const km = distanceMeters != null ? `${(distanceMeters / 1000).toFixed(1)} km` : null;
  const minutes = duration != null ? `${Math.round(duration / 60)} min` : null;
  return [km, minutes].filter(Boolean).join(' · ');
}
