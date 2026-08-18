import {
  canDepartToDestination,
  canFinishTrip,
  canMutateRouteStops,
  canPostLocationUpdates,
  canStartTrip,
  getActiveNavigationTarget,
  getDriverNavPhase,
  getEffectiveRouteEndpoints,
  resolveFallbackRouteEndpoints,
  reverseGeocodeAddress,
  routePointsToEndpoints,
} from '../utils/orderRoute';
import type { Advertisement } from '../types';

describe('orderRoute', () => {
  const endpoints = {
    departure: { latitude: 41.0, longitude: 69.0 },
    destination: { latitude: 42.0, longitude: 70.0 },
  };

  it('parses planned route endpoints', () => {
    expect(
      routePointsToEndpoints([
        { lat: 41.1, lng: 69.1 },
        { lat: 41.2, lng: 69.2 },
        { lat: 41.3, lng: 69.3 },
      ]),
    ).toEqual({
      departure: { latitude: 41.1, longitude: 69.1 },
      destination: { latitude: 41.3, longitude: 69.3 },
    });
  });

  it('maps order status to navigation phase', () => {
    expect(getDriverNavPhase('pending')).toBe('inactive');
    expect(getDriverNavPhase('approved_by_client')).toBe('to_pickup');
    expect(getDriverNavPhase('in_progress')).toBe('to_pickup');
    expect(getDriverNavPhase('in_transit')).toBe('to_destination');
    expect(getDriverNavPhase('completed')).toBe('finished');
  });

  it('selects active navigation target by phase', () => {
    expect(getActiveNavigationTarget('to_pickup', endpoints)).toEqual(endpoints.departure);
    expect(getActiveNavigationTarget('to_destination', endpoints)).toEqual(endpoints.destination);
    expect(getActiveNavigationTarget('finished', endpoints)).toBeNull();
  });

  it('prefers active route stop over legacy endpoints', () => {
    const order = {
      route_stops: [
        {
          id: 1,
          sequence: 1,
          stop_type: 'pickup',
          label: 'A',
          address: 'addr',
          lat: 40.5,
          lng: 68.5,
          status: 'completed',
        },
        {
          id: 2,
          sequence: 2,
          stop_type: 'delivery',
          label: 'B',
          address: 'addr b',
          lat: 41.5,
          lng: 69.5,
          status: 'pending',
        },
      ],
    } as any;
    expect(getActiveNavigationTarget('to_pickup', endpoints, order)).toEqual({
      latitude: 41.5,
      longitude: 69.5,
    });
  });

  it('exposes driver action availability', () => {
    expect(canStartTrip('approved_by_client')).toBe(true);
    expect(canStartTrip('pending')).toBe(false);
    expect(canPostLocationUpdates('in_progress')).toBe(true);
    expect(canPostLocationUpdates('approved_by_client')).toBe(true);
    expect(canPostLocationUpdates('pending')).toBe(false);
    expect(canPostLocationUpdates('completed')).toBe(false);
    expect(canDepartToDestination('in_progress')).toBe(true);
    expect(
      canDepartToDestination('in_progress', [
        { stop_type: 'pickup', status: 'pending', lat: 41, lng: 69, sequence: 1 },
      ]),
    ).toBe(false);
    expect(
      canDepartToDestination('in_progress', [
        { stop_type: 'pickup', status: 'arrived', lat: 41, lng: 69, sequence: 1 },
      ]),
    ).toBe(true);
    expect(canFinishTrip('in_transit')).toBe(true);
    expect(canFinishTrip('in_progress')).toBe(false);
    expect(canMutateRouteStops('in_progress')).toBe(true);
    expect(canMutateRouteStops('approved_by_client')).toBe(true);
    expect(canMutateRouteStops('in_transit')).toBe(false);
  });

  it('resolves fallback endpoints for cyrillic city names', () => {
    const ad = {
      departure_city: { id: 1, country: 1, name: 'Бухара' },
      destination_city: { id: 2, country: 1, name: 'Ташкент' },
      departure_address: 'addr a',
      destination_address: 'addr b',
    } as Advertisement;
    const endpoints = resolveFallbackRouteEndpoints(ad);
    expect(endpoints?.departure.latitude).toBeCloseTo(39.7681, 3);
    expect(endpoints?.destination.latitude).toBeCloseTo(41.2995, 3);
  });

  it('getEffectiveRouteEndpoints prefers cached values', () => {
    const cached = {
      departure: { latitude: 1, longitude: 2 },
      destination: { latitude: 3, longitude: 4 },
    };
    expect(getEffectiveRouteEndpoints(null, cached, null)).toEqual(cached);
  });

  describe('reverseGeocodeAddress', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns null for invalid coordinates', async () => {
      await expect(reverseGeocodeAddress(Number.NaN, 69)).resolves.toBeNull();
      await expect(reverseGeocodeAddress(41, Number.POSITIVE_INFINITY)).resolves.toBeNull();
    });

    it('returns display_name from nominatim response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ display_name: 'Tashkent, Uzbekistan' }),
      }) as typeof fetch;

      await expect(reverseGeocodeAddress(41.2995, 69.2401)).resolves.toBe('Tashkent, Uzbekistan');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('nominatim.openstreetmap.org/reverse'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'User-Agent': 'LogistikaMobile/1.0' }),
        }),
      );
    });

    it('prefixes city name when missing from geocoded address', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ display_name: '12 Amir Temur ko\'chasi' }),
      }) as typeof fetch;

      await expect(reverseGeocodeAddress(41.3, 69.25, 'Tashkent')).resolves.toBe(
        "Tashkent, 12 Amir Temur ko'chasi",
      );
    });

    it('returns null when geocoder fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as typeof fetch;
      await expect(reverseGeocodeAddress(41.301, 69.261)).resolves.toBeNull();
    });
  });
});
