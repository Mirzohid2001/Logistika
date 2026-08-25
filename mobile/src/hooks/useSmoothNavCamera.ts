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
const POSITION_RESPONSE_MS = 360;
const HEADING_RESPONSE_MS = 480;
const ZOOM_RESPONSE_MS = 620;
const PITCH_RESPONSE_MS = 540;

function easingFactor(elapsedMs: number, responseMs: number): number {
  const safeElapsedMs = Math.max(1, Math.min(elapsedMs, 250));
  return 1 - Math.exp(-safeElapsedMs / responseMs);
}

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
  const lastTickAtRef = useRef(Date.now());
  targetRef.current = { coordinate, heading, speedMps, enabled };
  const hasCoordinate = coordinate !== null;

  useEffect(() => {
    if (!enabled || !targetRef.current.coordinate) {
      cameraRef.current = null;
      setCamera(null);
      return;
    }

    lastTickAtRef.current = Date.now();
    const updateCamera = () => {
      const target = targetRef.current;
      if (!target.enabled || !target.coordinate) {
        return;
      }
      const now = Date.now();
      const elapsedMs = Math.max(1, now - lastTickAtRef.current);
      lastTickAtRef.current = now;
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
      const posFactor = easingFactor(elapsedMs, POSITION_RESPONSE_MS);
      const headingFactor = easingFactor(elapsedMs, HEADING_RESPONSE_MS);
      const zoomFactor = easingFactor(elapsedMs, ZOOM_RESPONSE_MS);
      const pitchFactor = easingFactor(elapsedMs, PITCH_RESPONSE_MS);
      const next: SmoothNavCamera = {
        center: {
          latitude: lerpNumber(prev.center.latitude, lookAhead.latitude, posFactor),
          longitude: lerpNumber(prev.center.longitude, lookAhead.longitude, posFactor),
        },
        heading: lerpHeading(prev.heading, target.heading, headingFactor),
        pitch: lerpNumber(prev.pitch, nextPitch, pitchFactor),
        zoom: lerpNumber(prev.zoom, nextZoom, zoomFactor),
      };
      cameraRef.current = next;
      if (!isCameraNearlyEqual(prev, next)) {
        setCamera(next);
      }
    };
    updateCamera();
    const interval = setInterval(updateCamera, LIVE_CAMERA_TICK_MS);

    return () => clearInterval(interval);
  }, [enabled, hasCoordinate]);

  if (!enabled || !coordinate) {
    return null;
  }
  return camera;
}
