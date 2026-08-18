import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../utils/mapGeo';
import {
  lerpHeading,
  lerpNumber,
  navLookAheadPoint,
  navPitchFromSpeed,
  navZoomFromSpeed,
} from '../utils/navCamera';

import { LIVE_CAMERA_TICK_MS, isCameraNearlyEqual } from '../utils/liveTrackingPerf';
const POS_FACTOR = 0.22;
const HEADING_FACTOR = 0.16;
const ZOOM_FACTOR = 0.12;
const PITCH_FACTOR = 0.14;

export type SmoothNavCamera = {
  center: LatLng;
  heading: number;
  pitch: number;
  zoom: number;
};

export function useSmoothNavCamera(
  enabled: boolean,
  coordinate: LatLng | null,
  heading: number,
  speedMps: number | null | undefined,
): SmoothNavCamera | null {
  const [camera, setCamera] = useState<SmoothNavCamera | null>(null);
  const cameraRef = useRef<SmoothNavCamera | null>(null);
  const targetRef = useRef({ coordinate, heading, speedMps, enabled });
  targetRef.current = { coordinate, heading, speedMps, enabled };

  useEffect(() => {
    if (!enabled || !coordinate) {
      return;
    }

    const interval = setInterval(() => {
      const target = targetRef.current;
      if (!target.enabled || !target.coordinate) {
        return;
      }
      const lookAhead = navLookAheadPoint(target.coordinate, target.heading, target.speedMps);
      const nextZoom = navZoomFromSpeed(target.speedMps);
      const nextPitch = navPitchFromSpeed(target.speedMps);
      const prev = cameraRef.current;
      if (!prev) {
        const snap = {
          center: lookAhead,
          heading: target.heading,
          pitch: nextPitch,
          zoom: nextZoom,
        };
        cameraRef.current = snap;
        setCamera(snap);
        return;
      }
      const next: SmoothNavCamera = {
        center: {
          latitude: lerpNumber(prev.center.latitude, lookAhead.latitude, POS_FACTOR),
          longitude: lerpNumber(prev.center.longitude, lookAhead.longitude, POS_FACTOR),
        },
        heading: lerpHeading(prev.heading, target.heading, HEADING_FACTOR),
        pitch: lerpNumber(prev.pitch, nextPitch, PITCH_FACTOR),
        zoom: lerpNumber(prev.zoom, nextZoom, ZOOM_FACTOR),
      };
      cameraRef.current = next;
      if (!isCameraNearlyEqual(prev, next)) {
        setCamera(next);
      }
    }, LIVE_CAMERA_TICK_MS);

    return () => clearInterval(interval);
  }, [enabled, Boolean(coordinate)]);

  if (!enabled) {
    return null;
  }
  return camera;
}
