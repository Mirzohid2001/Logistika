import { colors as themeColors } from '../theme/colors';
import {
  bearingDegrees,
  computeDeadReckonedTarget,
  computeNextSmoothLocation,
  computePresenceAgeSeconds,
  filterTrackCoordinates,
  haversineMeters,
  nearestProgressOnRoute,
  pointAlongRoute,
  presenceColor,
  presenceLevelFromAge,
  projectLocation,
  reconcileMotionTarget,
  smoothCoordinate,
  splitRouteByProgress,
} from '../utils/mapTracking';

describe('mapTracking', () => {
  it('computes distance between two points', () => {
    const a = { latitude: 41.2995, longitude: 69.2401 };
    const b = { latitude: 41.3, longitude: 69.241 };
    expect(haversineMeters(a, b)).toBeGreaterThan(0);
    expect(haversineMeters(a, b)).toBeLessThan(200);
  });

  it('smooths coordinates toward target', () => {
    const prev = { latitude: 41.0, longitude: 69.0 };
    const next = { latitude: 42.0, longitude: 70.0 };
    const mid = smoothCoordinate(prev, next, 0.5);
    expect(mid.latitude).toBeGreaterThan(prev.latitude);
    expect(mid.latitude).toBeLessThan(next.latitude);
  });

  it('returns bearing between points', () => {
    const from = { latitude: 41.0, longitude: 69.0 };
    const toNorth = { latitude: 42.0, longitude: 69.0 };
    const toEast = { latitude: 41.0, longitude: 70.0 };
    expect(bearingDegrees(from, toNorth)).toBeLessThan(5);
    expect(bearingDegrees(from, toEast)).toBeGreaterThan(85);
    expect(bearingDegrees(from, toEast)).toBeLessThan(95);
  });

  it('maps presence age to levels', () => {
    expect(presenceLevelFromAge(10)).toBe('online');
    expect(presenceLevelFromAge(45)).toBe('warning');
    expect(presenceLevelFromAge(120)).toBe('stale');
    expect(presenceLevelFromAge(400)).toBe('offline');
  });

  it('computes presence age from ISO timestamp', () => {
    const now = Date.parse('2026-06-08T12:00:30.000Z');
    expect(computePresenceAgeSeconds('2026-06-08T12:00:00.000Z', now)).toBe(30);
    expect(computePresenceAgeSeconds(null, now)).toBeNull();
    expect(computePresenceAgeSeconds('invalid', now)).toBeNull();
  });

  it('returns presence colors per level', () => {
    expect(presenceColor('online', themeColors)).toBe(themeColors.success);
    expect(presenceColor('offline', themeColors)).toBe(themeColors.textTertiary);
  });

  it('filters teleport jumps from track polyline', () => {
    const points = [
      { latitude: 41.0, longitude: 69.0 },
      { latitude: 41.001, longitude: 69.001 },
      { latitude: 50.0, longitude: 80.0 },
      { latitude: 41.002, longitude: 69.002 },
    ];
    const filtered = filterTrackCoordinates(points, 5000);
    expect(filtered).toHaveLength(3);
    expect(filtered.some((p) => p.latitude === 50)).toBe(false);
  });

  it('computeNextSmoothLocation snaps when close enough', () => {
    const cur = { latitude: 41.0, longitude: 69.0 };
    const near = { latitude: 41.000001, longitude: 69.000001 };
    expect(computeNextSmoothLocation(cur, near)).toEqual(near);
  });

  it('computeNextSmoothLocation steps toward distant target', () => {
    const cur = { latitude: 41.0, longitude: 69.0 };
    const far = { latitude: 42.0, longitude: 70.0 };
    const next = computeNextSmoothLocation(cur, far);
    expect(next!.latitude).toBeGreaterThan(cur.latitude);
    expect(next!.latitude).toBeLessThan(far.latitude);
  });

  it('computeNextSmoothLocation returns target when current is null', () => {
    const target = { latitude: 41.5, longitude: 69.5 };
    expect(computeNextSmoothLocation(null, target)).toEqual(target);
  });

  it('uses time-based smoothing independent of frame rate', () => {
    const start = { latitude: 41.0, longitude: 69.0 };
    const target = { latitude: 41.01, longitude: 69.01 };
    const oneFrame = computeNextSmoothLocation(start, target, 0, undefined, 100)!;
    const halfFrame = computeNextSmoothLocation(start, target, 0, undefined, 50)!;
    const twoFrames = computeNextSmoothLocation(halfFrame, target, 0, undefined, 50)!;
    expect(twoFrames.latitude).toBeCloseTo(oneFrame.latitude, 8);
    expect(twoFrames.longitude).toBeCloseTo(oneFrame.longitude, 8);
  });

  it('rejects stale and impossible motion targets', () => {
    const previous = {
      latitude: 41.3,
      longitude: 69.24,
      updatedAtMs: 10_000,
      speedMps: 10,
      heading: 90,
    };
    expect(
      reconcileMotionTarget(previous, {
        latitude: 41.301,
        longitude: 69.241,
        updatedAtMs: 9_000,
      }),
    ).toBeNull();
    expect(
      reconcileMotionTarget(previous, {
        latitude: 42.3,
        longitude: 70.24,
        updatedAtMs: 11_000,
      }),
    ).toBeNull();
  });

  it('derives speed and heading when a packet omits motion fields', () => {
    const previous = {
      latitude: 41.3,
      longitude: 69.24,
      updatedAtMs: 1_000,
    };
    const next = reconcileMotionTarget(previous, {
      latitude: 41.3,
      longitude: 69.2402,
      updatedAtMs: 3_000,
    });
    expect(next).not.toBeNull();
    expect(next!.speedMps).toBeGreaterThan(1);
    expect(next!.heading).toBeGreaterThan(80);
    expect(next!.heading).toBeLessThan(100);
  });

  it('projectLocation moves north by ~distance', () => {
    const origin = { latitude: 41.0, longitude: 69.0 };
    const projected = projectLocation(origin, 0, 100);
    expect(projected.latitude).toBeGreaterThan(origin.latitude);
    expect(Math.abs(projected.longitude - origin.longitude)).toBeLessThan(0.0001);
    expect(haversineMeters(origin, projected)).toBeGreaterThan(90);
    expect(haversineMeters(origin, projected)).toBeLessThan(110);
  });

  it('computeDeadReckonedTarget advances with speed and heading', () => {
    const fix = {
      latitude: 41.0,
      longitude: 69.0,
      heading: 90,
      speedMps: 20,
      updatedAtMs: 1_000,
    };
    const predicted = computeDeadReckonedTarget(fix, 2_000);
    expect(predicted.longitude).toBeGreaterThan(fix.longitude);
    expect(haversineMeters(fix, predicted)).toBeGreaterThan(15);
    expect(haversineMeters(fix, predicted)).toBeLessThan(25);
  });

  it('uses local receipt time so server clock skew cannot break prediction', () => {
    const fix = {
      latitude: 41.0,
      longitude: 69.0,
      heading: 90,
      speedMps: 10,
      updatedAtMs: 9_999_999,
      receivedAtMs: 1_000,
    };
    const predicted = computeDeadReckonedTarget(fix, 2_000);
    expect(haversineMeters(fix, predicted)).toBeGreaterThan(8);
    expect(haversineMeters(fix, predicted)).toBeLessThan(12);
  });

  it('computeDeadReckonedTarget stays put when nearly stopped', () => {
    const fix = {
      latitude: 41.0,
      longitude: 69.0,
      heading: 90,
      speedMps: 0.1,
      updatedAtMs: 1_000,
    };
    expect(computeDeadReckonedTarget(fix, 2_000)).toEqual({
      latitude: 41.0,
      longitude: 69.0,
    });
  });

  it('computeDeadReckonedTarget follows the route polyline when progress is known', () => {
    const route = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.25 },
      { latitude: 41.3, longitude: 69.26 },
    ];
    const fix = {
      latitude: 41.3,
      longitude: 69.24,
      heading: 0,
      speedMps: 20,
      updatedAtMs: 1_000,
      routeProgressM: 0,
    };
    const predicted = computeDeadReckonedTarget(fix, 2_000, { routePolyline: route });
    // Along eastbound route, longitude increases even though heading says north.
    expect(predicted.longitude).toBeGreaterThan(fix.longitude);
    expect(Math.abs(predicted.latitude - 41.3)).toBeLessThan(0.0002);
  });

  it('pointAlongRoute lands mid-segment', () => {
    const route = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.25 },
    ];
    const mid = pointAlongRoute(route, haversineMeters(route[0], route[1]) / 2);
    expect(mid).not.toBeNull();
    expect(mid!.point.longitude).toBeGreaterThan(69.24);
    expect(mid!.point.longitude).toBeLessThan(69.25);
  });

  it('splits a route into traveled and remaining segments', () => {
    const route = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.25 },
      { latitude: 41.3, longitude: 69.26 },
    ];
    const total = haversineMeters(route[0], route[1]) + haversineMeters(route[1], route[2]);
    const split = splitRouteByProgress(route, total * 0.5);
    expect(split.traveled.length).toBeGreaterThanOrEqual(2);
    expect(split.remaining.length).toBeGreaterThanOrEqual(2);
    expect(split.traveled[0].longitude).toBeCloseTo(69.24, 4);
    expect(split.remaining[split.remaining.length - 1].longitude).toBeCloseTo(69.26, 4);
  });

  it('nearestProgressOnRoute is near zero at the start', () => {
    const route = [
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.3, longitude: 69.26 },
    ];
    expect(nearestProgressOnRoute(route, route[0])).toBeLessThan(5);
  });
});
