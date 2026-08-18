import type { LatLng } from './mapGeo';
import { projectLocation } from './mapTracking';

export const NAV_FOLLOW_ZOOM_STOPPED = 16.85;
export const NAV_FOLLOW_ZOOM_FAST = 15.25;
export const NAV_FOLLOW_PITCH_STOPPED = 50;
export const NAV_FOLLOW_PITCH_FAST = 62;

/** Shortest-path heading interpolation (degrees). */
export function lerpHeading(from: number, to: number, factor: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * factor + 360) % 360;
}

export function lerpNumber(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}

export function navZoomFromSpeed(speedMps: number | null | undefined): number {
  const kmh = Math.max(0, (speedMps ?? 0) * 3.6);
  const t = Math.min(1, kmh / 90);
  return NAV_FOLLOW_ZOOM_STOPPED - t * (NAV_FOLLOW_ZOOM_STOPPED - NAV_FOLLOW_ZOOM_FAST);
}

export function navPitchFromSpeed(speedMps: number | null | undefined): number {
  const kmh = Math.max(0, (speedMps ?? 0) * 3.6);
  const t = Math.min(1, kmh / 90);
  return NAV_FOLLOW_PITCH_STOPPED + t * (NAV_FOLLOW_PITCH_FAST - NAV_FOLLOW_PITCH_STOPPED);
}

export function navLookAheadMeters(speedMps: number | null | undefined): number {
  const kmh = Math.max(0, (speedMps ?? 0) * 3.6);
  return 32 + Math.min(150, kmh * 1.55);
}

export function navLookAheadPoint(
  origin: LatLng,
  heading: number,
  speedMps: number | null | undefined,
): LatLng {
  return projectLocation(origin, heading, navLookAheadMeters(speedMps));
}
