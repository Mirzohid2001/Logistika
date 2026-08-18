import { Dimensions, PixelRatio, Platform } from 'react-native';
import type { LatLng } from './mapGeo';
import { haversineMeters } from './mapTracking';

export type CameraFrame = {
  center: LatLng;
  heading: number;
  pitch: number;
  zoom: number;
};

/**
 * Long live-tracking sessions (especially older iPhones) cannot sustain
 * 30fps React setState + MapLibre 3D extrusions. GPS itself is ~1Hz;
 * interpolation only needs 10–15fps.
 */
export function isLowEndLiveMapDevice(): boolean {
  const { height, width } = Dimensions.get('window');
  const maxDim = Math.max(height, width);
  if (Platform.OS === 'ios') {
    // SE / 8 / 8 Plus logical size. Newer minis are 812+.
    return maxDim <= 736;
  }
  return maxDim <= 640 || PixelRatio.get() <= 1.5;
}

const lowEnd = isLowEndLiveMapDevice();

export const LIVE_MARKER_TICK_MS = lowEnd ? 80 : Platform.OS === 'ios' ? 66 : 50;
export const LIVE_CAMERA_TICK_MS = lowEnd ? 100 : 80;
export const LIVE_FLEET_TICK_MS = lowEnd ? 100 : 66;
export const LIVE_MAP_FPS = lowEnd ? 20 : 30;
export const LIVE_REGION_DEBOUNCE_MS = lowEnd ? 160 : 80;
export const LIVE_TRACK_MAX_POINTS = lowEnd ? 120 : 180;

export const MIN_MARKER_MOVE_METERS = 0.35;
export const MIN_CAMERA_HEADING_DELTA = 0.25;
export const MIN_CAMERA_PITCH_DELTA = 0.2;
export const MIN_CAMERA_ZOOM_DELTA = 0.015;
export const MIN_CAMERA_MOVE_METERS = 0.45;

export function shouldRender3dBuildings(): boolean {
  return !isLowEndLiveMapDevice();
}

export function shouldRenderRouteGlow(): boolean {
  return !isLowEndLiveMapDevice();
}

export function shouldSkipMarkerUpdate(prev: LatLng | null, next: LatLng | null): boolean {
  if (!next) {
    return prev == null;
  }
  if (!prev) {
    return false;
  }
  return haversineMeters(prev, next) < MIN_MARKER_MOVE_METERS;
}

export function isCameraNearlyEqual(
  prev: CameraFrame | null,
  next: CameraFrame,
): boolean {
  if (!prev) {
    return false;
  }
  if (Math.abs(((prev.heading - next.heading + 540) % 360) - 180) > MIN_CAMERA_HEADING_DELTA) {
    return false;
  }
  if (Math.abs(prev.pitch - next.pitch) > MIN_CAMERA_PITCH_DELTA) {
    return false;
  }
  if (Math.abs(prev.zoom - next.zoom) > MIN_CAMERA_ZOOM_DELTA) {
    return false;
  }
  return haversineMeters(prev.center, next.center) < MIN_CAMERA_MOVE_METERS;
}

export function downsamplePolyline(points: LatLng[], maxPoints = LIVE_TRACK_MAX_POINTS): LatLng[] {
  if (points.length <= maxPoints) {
    return points;
  }
  const lastIndex = points.length - 1;
  const step = lastIndex / (maxPoints - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < maxPoints - 1; i += 1) {
    const point = points[Math.round(i * step)];
    const prev = out[out.length - 1];
    if (!prev || prev.latitude !== point.latitude || prev.longitude !== point.longitude) {
      out.push(point);
    }
  }
  const end = points[lastIndex];
  const prev = out[out.length - 1];
  if (!prev || prev.latitude !== end.latitude || prev.longitude !== end.longitude) {
    out.push(end);
  }
  return out;
}
