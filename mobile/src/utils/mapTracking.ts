import type { LatLng } from './mapGeo';

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function smoothCoordinate(prev: LatLng, next: LatLng, factor = 0.35): LatLng {
  return {
    latitude: prev.latitude + (next.latitude - prev.latitude) * factor,
    longitude: prev.longitude + (next.longitude - prev.longitude) * factor,
  };
}

/** Bearing in degrees (0 = north, clockwise). */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function computePresenceAgeSeconds(lastSeenAt: string | null | undefined, nowMs = Date.now()): number | null {
  if (!lastSeenAt) {return null;}
  const ts = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) {return null;}
  return Math.max(0, Math.floor((nowMs - ts) / 1000));
}

export type PresenceLevel = 'online' | 'warning' | 'stale' | 'offline';

export function presenceLevelFromAge(ageSeconds: number | null): PresenceLevel {
  if (ageSeconds == null) {return 'offline';}
  if (ageSeconds <= 30) {return 'online';}
  if (ageSeconds <= 60) {return 'warning';}
  if (ageSeconds <= 180) {return 'stale';}
  return 'offline';
}

import type { AppColors } from '../theme/colors';

export function presenceColor(level: PresenceLevel, colors: AppColors): string {
  switch (level) {
    case 'online':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'stale':
      return colors.danger;
    default:
      return colors.textTertiary;
  }
}

export const SMOOTH_DRIVER_SNAP_METERS = 1.5;
export const SMOOTH_DRIVER_FACTOR = 0.28;
/** Cap how far ahead we invent position between GPS fixes. */
export const DEAD_RECKON_MAX_PREDICT_MS = 2500;
export const DEAD_RECKON_MIN_SPEED_MPS = 0.6;

export type DriverMotionTarget = LatLng & {
  heading?: number | null;
  speedMps?: number | null;
  updatedAtMs?: number | null;
  /** Meters along the planned/optimized polyline when map-matched. */
  routeProgressM?: number | null;
};

export type DeadReckonOptions = {
  maxPredictMs?: number;
  routePolyline?: LatLng[] | null;
};

/** Project a point along a bearing by distanceMeters. */
export function projectLocation(
  origin: LatLng,
  headingDegrees: number,
  distanceMeters: number
): LatLng {
  if (!Number.isFinite(distanceMeters) || distanceMeters === 0) {
    return origin;
  }
  const brng = (headingDegrees * Math.PI) / 180;
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lng1 = (origin.longitude * Math.PI) / 180;
  const angDist = distanceMeters / EARTH_RADIUS_M;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: ((((lng2 * 180) / Math.PI) + 540) % 360) - 180,
  };
}

/** Build cumulative distances along a polyline (same length as points). */
export function buildRouteCumulativeMeters(points: LatLng[]): number[] {
  if (!points.length) {return [];}
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  return cumulative;
}

/** Local projection of a point onto segment AB, t clamped to [0, 1]. */
export function projectPointOnSegment(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): { point: LatLng; t: number } {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) {
    return { point: a, t: 0 };
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.longitude - a.longitude) * dx + (point.latitude - a.latitude) * dy) / len2),
  );
  return {
    point: {
      latitude: a.latitude + t * dy,
      longitude: a.longitude + t * dx,
    },
    t,
  };
}

/** Meters along the polyline nearest to `point`. */
export function nearestProgressOnRoute(points: LatLng[], point: LatLng): number {
  if (points.length < 2) {
    return 0;
  }
  const cumulative = buildRouteCumulativeMeters(points);
  let bestDist = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const projected = projectPointOnSegment(point, points[i], points[i + 1]);
    const dist = haversineMeters(point, projected.point);
    if (dist < bestDist) {
      bestDist = dist;
      const segLen = cumulative[i + 1] - cumulative[i];
      bestProgress = cumulative[i] + projected.t * segLen;
    }
  }
  return bestProgress;
}

/** Split a planned route into traveled + remaining for taxi-style rendering. */
export function splitRouteByProgress(
  points: LatLng[],
  progressM: number,
): { traveled: LatLng[]; remaining: LatLng[] } {
  if (points.length < 2) {
    return { traveled: [], remaining: points };
  }
  const along = pointAlongRoute(points, progressM);
  if (!along) {
    return { traveled: [], remaining: points };
  }
  const cumulative = buildRouteCumulativeMeters(points);
  const traveled: LatLng[] = [];
  const remaining: LatLng[] = [along.point];
  for (let i = 0; i < points.length; i += 1) {
    if (cumulative[i] < progressM - 0.5) {
      traveled.push(points[i]);
    } else if (cumulative[i] > progressM + 0.5) {
      remaining.push(points[i]);
    }
  }
  traveled.push(along.point);
  if (traveled.length < 2) {
    return { traveled: [], remaining: points };
  }
  return { traveled, remaining };
}

/** Point + heading at a given distance along the polyline. */
export function pointAlongRoute(
  points: LatLng[],
  progressMeters: number
): { point: LatLng; heading: number | null } | null {
  if (points.length < 2) {return null;}
  const cumulative = buildRouteCumulativeMeters(points);
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) {
    return { point: points[0], heading: null };
  }
  const clamped = Math.max(0, Math.min(progressMeters, total));
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = cumulative[i];
    const end = cumulative[i + 1];
    if (clamped > end && i < points.length - 2) {continue;}
    const segLen = end - start;
    const t = segLen > 0 ? (clamped - start) / segLen : 0;
    const a = points[i];
    const b = points[i + 1];
    const point = {
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    };
    const heading = segLen >= 1 ? bearingDegrees(a, b) : null;
    return { point, heading };
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return { point: last, heading: bearingDegrees(prev, last) };
}

/**
 * Extrapolate the last GPS fix forward using speed + heading (Yandex-style glide).
 * When a route polyline + progress are available, advance along the road instead
 * of a straight bearing (much closer to taxi UX).
 */
export function computeDeadReckonedTarget(
  fix: DriverMotionTarget,
  nowMs: number,
  options: DeadReckonOptions | number = DEAD_RECKON_MAX_PREDICT_MS
): LatLng {
  const opts: DeadReckonOptions =
    typeof options === 'number' ? { maxPredictMs: options } : options || {};
  const maxPredictMs = opts.maxPredictMs ?? DEAD_RECKON_MAX_PREDICT_MS;
  const base: LatLng = { latitude: fix.latitude, longitude: fix.longitude };
  const speed = fix.speedMps ?? 0;
  if (!Number.isFinite(speed) || speed < DEAD_RECKON_MIN_SPEED_MPS) {
    return base;
  }
  const updatedAt = fix.updatedAtMs ?? nowMs;
  const dtMs = Math.min(Math.max(0, nowMs - updatedAt), maxPredictMs);
  if (dtMs < 16) {
    return base;
  }
  const advanceM = speed * (dtMs / 1000);
  const polyline = opts.routePolyline;
  if (
    polyline &&
    polyline.length >= 2 &&
    fix.routeProgressM != null &&
    Number.isFinite(fix.routeProgressM)
  ) {
    const along = pointAlongRoute(polyline, fix.routeProgressM + advanceM);
    if (along) {
      return along.point;
    }
  }
  const heading = fix.heading;
  if (heading == null || !Number.isFinite(heading)) {
    return base;
  }
  return projectLocation(base, heading, advanceM);
}

/** Stable display heading: when stopped keep last heading, ignore micro jitter. */
export function resolveDisplayHeading(
  preferred: number | null | undefined,
  speedMps: number | null | undefined,
  heldHeading: number
): number {
  const stopped = speedMps != null && speedMps < DEAD_RECKON_MIN_SPEED_MPS;
  if (stopped) {
    if (preferred != null && Number.isFinite(preferred)) {
      return preferred;
    }
    return heldHeading;
  }
  if (preferred != null && Number.isFinite(preferred)) {
    return preferred;
  }
  return heldHeading;
}

/** One interpolation step for live driver marker (used by hook + tests). */
export function computeNextSmoothLocation(
  current: LatLng | null,
  target: LatLng | null,
  snapMeters = SMOOTH_DRIVER_SNAP_METERS,
  factor = SMOOTH_DRIVER_FACTOR,
): LatLng | null {
  if (!target) {return null;}
  if (!current) {return target;}
  const dist = haversineMeters(current, target);
  if (dist < snapMeters) {return target;}
  return smoothCoordinate(current, target, factor);
}

export function filterTrackCoordinates(
  points: LatLng[],
  maxJumpMeters = 20000,
): LatLng[] {
  const filtered: LatLng[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {continue;}
    if (!filtered.length) {
      filtered.push(point);
      continue;
    }
    if (haversineMeters(filtered[filtered.length - 1], point) > maxJumpMeters) {continue;}
    filtered.push(point);
  }
  return filtered;
}
