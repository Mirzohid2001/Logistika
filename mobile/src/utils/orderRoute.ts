import type { Advertisement, Order, OrderRouteStop } from '../types';
import type { LatLng } from './mapGeo';
import { ordersService } from '../services/ordersService';
import { getActiveRouteStop, stopToLatLng } from './routeStops';

export type DriverNavPhase = 'to_pickup' | 'to_destination' | 'finished' | 'inactive';

export interface OrderRouteEndpoints {
  departure: LatLng;
  destination: LatLng;
}

const CITY_COORDS: Record<string, LatLng> = {
  tashkent: { latitude: 41.2995, longitude: 69.2401 },
  toshkent: { latitude: 41.2995, longitude: 69.2401 },
  'toshkent sh': { latitude: 41.2995, longitude: 69.2401 },
  ташкент: { latitude: 41.2995, longitude: 69.2401 },
  samarkand: { latitude: 39.6542, longitude: 66.9597 },
  samarqand: { latitude: 39.6542, longitude: 66.9597 },
  самарканд: { latitude: 39.6542, longitude: 66.9597 },
  bukhara: { latitude: 39.7681, longitude: 64.4556 },
  buxoro: { latitude: 39.7681, longitude: 64.4556 },
  бухара: { latitude: 39.7681, longitude: 64.4556 },
  andijan: { latitude: 40.7821, longitude: 72.3442 },
  andijon: { latitude: 40.7821, longitude: 72.3442 },
  namangan: { latitude: 40.9983, longitude: 71.6726 },
  fergana: { latitude: 40.3842, longitude: 71.7843 },
  fargona: { latitude: 40.3842, longitude: 71.7843 },
  nukus: { latitude: 42.4531, longitude: 59.6103 },
  urgench: { latitude: 41.5500, longitude: 60.6333 },
  urganch: { latitude: 41.5500, longitude: 60.6333 },
  termez: { latitude: 37.2242, longitude: 67.2783 },
  termiz: { latitude: 37.2242, longitude: 67.2783 },
  jizzakh: { latitude: 40.1158, longitude: 67.8422 },
  jizzax: { latitude: 40.1158, longitude: 67.8422 },
  qarshi: { latitude: 38.8606, longitude: 65.7891 },
  karshi: { latitude: 38.8606, longitude: 65.7891 },
};

const geocodeCache = new Map<string, LatLng>();
const reverseGeocodeCache = new Map<string, string>();

function normalizeCityKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ʻʼ'`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function cityFallbackCoordinate(cityName: string): LatLng | null {
  const key = normalizeCityKey(cityName);
  if (CITY_COORDS[key]) {return CITY_COORDS[key];}
  const partial = Object.entries(CITY_COORDS).find(([name]) => key.includes(name) || name.includes(key));
  return partial ? partial[1] : null;
}

function getCityName(city: Advertisement['departure_city']): string {
  if (!city || typeof city === 'number') {return '';}
  return city.name || '';
}

function parseCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {return value;}
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toLatLng(point?: { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown } | null): LatLng | null {
  if (!point) {return null;}
  const lat = parseCoord(point.lat ?? point.latitude);
  const lng = parseCoord(point.lng ?? point.longitude);
  if (lat == null || lng == null) {return null;}
  return { latitude: lat, longitude: lng };
}

export function resolveFallbackRouteEndpoints(advertisement: Advertisement): OrderRouteEndpoints | null {
  const departureCity = getCityName(advertisement.departure_city);
  const destinationCity = getCityName(advertisement.destination_city);
  const departure = cityFallbackCoordinate(departureCity);
  const destination = cityFallbackCoordinate(destinationCity);
  if (!departure || !destination) {return null;}
  return { departure, destination };
}

export function getEffectiveRouteEndpoints(
  advertisement: Advertisement | null,
  cached: OrderRouteEndpoints | null,
  order?: Order | null,
): OrderRouteEndpoints | null {
  if (cached) {return cached;}
  const fromPlan = routePointsToEndpoints(order?.planned_route_points);
  if (fromPlan) {return fromPlan;}
  if (advertisement) {return resolveFallbackRouteEndpoints(advertisement);}
  return null;
}

export function routePointsToEndpoints(
  points?: Array<{ lat: number; lng: number }> | null,
): OrderRouteEndpoints | null {
  if (!points || points.length < 2) {return null;}
  const departure = toLatLng(points[0]);
  const destination = toLatLng(points[points.length - 1]);
  if (!departure || !destination) {return null;}
  return { departure, destination };
}

export async function geocodeAddress(cityName: string, address: string): Promise<LatLng | null> {
  const query = [address, cityName, 'Uzbekistan'].filter(Boolean).join(', ');
  const cacheKey = normalizeCityKey(query);
  const cached = geocodeCache.get(cacheKey);
  if (cached) {return cached;}

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LogistikaMobile/1.0',
      },
    });
    if (!response.ok) {return cityFallbackCoordinate(cityName);}
    const data = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) {return cityFallbackCoordinate(cityName);}
    const result: LatLng = {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
    };
    if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
      return cityFallbackCoordinate(cityName);
    }
    geocodeCache.set(cacheKey, result);
    return result;
  } catch {
    return cityFallbackCoordinate(cityName);
  }
}

export async function reverseGeocodeAddress(
  latitude: number,
  longitude: number,
  cityName?: string,
): Promise<string | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {return null;}
  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) {return cached;}

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      'accept-language': 'ru,uz,en',
      zoom: '18',
      addressdetails: '1',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LogistikaMobile/1.0',
      },
    });
    if (!response.ok) {return null;}
    const data = (await response.json()) as { display_name?: string };
    const displayName = data.display_name?.trim();
    if (!displayName) {return null;}
    const normalized = cityName && !displayName.toLowerCase().includes(cityName.toLowerCase())
      ? `${cityName}, ${displayName}`
      : displayName;
    reverseGeocodeCache.set(cacheKey, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function resolveAdvertisementRouteEndpoints(
  advertisement: Advertisement,
): Promise<OrderRouteEndpoints | null> {
  const departureCity = getCityName(advertisement.departure_city);
  const destinationCity = getCityName(advertisement.destination_city);
  const [departure, destination] = await Promise.all([
    geocodeAddress(departureCity, advertisement.departure_address),
    geocodeAddress(destinationCity, advertisement.destination_address),
  ]);
  if (!departure || !destination) {return null;}
  return { departure, destination };
}

export async function ensureOrderRoutePlan(
  orderId: number,
  order: Order,
  advertisement: Advertisement | null,
): Promise<OrderRouteEndpoints | null> {
  const fromPlan = routePointsToEndpoints(order.planned_route_points);
  if (fromPlan) {return fromPlan;}
  if (!advertisement) {return null;}

  const fallback = resolveFallbackRouteEndpoints(advertisement);
  const endpoints = (await resolveAdvertisementRouteEndpoints(advertisement)) ?? fallback;
  if (!endpoints) {return null;}

  try {
    await ordersService.setRoutePlan(orderId, [
      { lat: endpoints.departure.latitude, lng: endpoints.departure.longitude },
      { lat: endpoints.destination.latitude, lng: endpoints.destination.longitude },
    ], { thresholdMeters: 500 });
  } catch {
    // Route plan is optional for map UX; keep local endpoints.
  }
  return endpoints;
}

export function getDriverNavPhase(statusCode?: string): DriverNavPhase {
  switch (statusCode) {
    case 'pending':
    case 'new':
      return 'inactive';
    case 'approved_by_client':
    case 'in_progress':
      return 'to_pickup';
    case 'in_transit':
      return 'to_destination';
    case 'completed':
      return 'finished';
    default:
      return 'inactive';
  }
}

export function getActiveNavigationTarget(
  phase: DriverNavPhase,
  endpoints: OrderRouteEndpoints | null,
  order?: Order | null,
): LatLng | null {
  const activeStop = getActiveRouteStop(order?.route_stops);
  const activeStopPoint = activeStop ? stopToLatLng(activeStop) : null;
  if (activeStopPoint) {return activeStopPoint;}

  if (!endpoints) {return null;}
  if (phase === 'to_pickup') {return endpoints.departure;}
  if (phase === 'to_destination') {return endpoints.destination;}
  return null;
}

export function isOrderApprovedForDriver(statusCode?: string): boolean {
  return statusCode === 'approved_by_client';
}

export function canStartTrip(statusCode?: string): boolean {
  return isOrderApprovedForDriver(statusCode);
}

export function canPostLocationUpdates(statusCode?: string): boolean {
  return statusCode === 'approved_by_client' || statusCode === 'in_progress' || statusCode === 'in_transit';
}

export function pickupStopReadyForDepart(stops?: OrderRouteStop[]): boolean {
  if (!stops?.length) {
    return true;
  }
  const pickup = [...stops]
    .filter((stop) => stop.stop_type === 'pickup')
    .sort((a, b) => a.sequence - b.sequence)[0];
  if (!pickup) {
    return true;
  }
  if (pickup.lat == null || pickup.lng == null) {
    return true;
  }
  return pickup.status === 'arrived' || pickup.status === 'completed';
}

export function canDepartToDestination(statusCode?: string, stops?: OrderRouteStop[]): boolean {
  return statusCode === 'in_progress' && pickupStopReadyForDepart(stops);
}

export function canFinishTrip(statusCode?: string): boolean {
  return statusCode === 'in_transit';
}

export function canMutateRouteStops(statusCode?: string): boolean {
  return statusCode === 'approved_by_client' || statusCode === 'in_progress';
}
