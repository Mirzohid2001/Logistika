import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../utils/mapGeo';
import {
  buildRouteCumulativeMeters,
  computeDeadReckonedTarget,
  computeNextSmoothLocation,
  reconcileMotionTarget,
  type DriverMotionTarget,
} from '../utils/mapTracking';

import { LIVE_MARKER_TICK_MS, shouldSkipMarkerUpdate } from '../utils/liveTrackingPerf';

function toMotionTarget(target: DriverMotionTarget | LatLng): DriverMotionTarget {
  const motion = target as DriverMotionTarget;
  return {
    latitude: target.latitude,
    longitude: target.longitude,
    heading: motion.heading ?? null,
    speedMps: motion.speedMps ?? null,
    receivedAtMs: motion.receivedAtMs ?? Date.now(),
    updatedAtMs: motion.updatedAtMs ?? Date.now(),
    routeProgressM: motion.routeProgressM ?? null,
  };
}

/**
 * Smooths the driver marker between GPS fixes using dead reckoning + easing.
 * Prefer along-route prediction when a polyline is supplied.
 */
export function useSmoothDriverLocation(
  target: DriverMotionTarget | LatLng | null,
  enabled = true,
  routePolyline: LatLng[] | null = null
) {
  const [display, setDisplay] = useState<LatLng | null>(
    target ? { latitude: target.latitude, longitude: target.longitude } : null
  );
  const displayRef = useRef<LatLng | null>(
    target ? { latitude: target.latitude, longitude: target.longitude } : null
  );
  const targetRef = useRef<DriverMotionTarget | null>(target ? toMotionTarget(target) : null);
  const routeRef = useRef<LatLng[] | null>(routePolyline);
  const routeCumulativeRef = useRef<number[] | null>(
    routePolyline ? buildRouteCumulativeMeters(routePolyline) : null,
  );
  const lastTickAtRef = useRef(Date.now());

  useEffect(() => {
    routeRef.current = routePolyline;
    routeCumulativeRef.current = routePolyline
      ? buildRouteCumulativeMeters(routePolyline)
      : null;
  }, [routePolyline]);

  useEffect(() => {
    if (!target) {
      targetRef.current = null;
      displayRef.current = null;
      setDisplay(null);
      return;
    }
    const motion = reconcileMotionTarget(targetRef.current, toMotionTarget(target));
    if (!motion) {
      return;
    }
    targetRef.current = motion;
    if (!enabled || !displayRef.current) {
      const snap = { latitude: motion.latitude, longitude: motion.longitude };
      displayRef.current = snap;
      setDisplay(snap);
    }
  }, [target, enabled]);

  useEffect(() => {
    if (!enabled) {
      if (targetRef.current) {
        const snap = {
          latitude: targetRef.current.latitude,
          longitude: targetRef.current.longitude,
        };
        displayRef.current = snap;
        setDisplay(snap);
      }
      return;
    }

    lastTickAtRef.current = Date.now();

    const interval = setInterval(() => {
      const fix = targetRef.current;
      const cur = displayRef.current;
      if (!fix) {return;}
      const now = Date.now();
      const elapsedMs = Math.max(1, now - lastTickAtRef.current);
      lastTickAtRef.current = now;
      const predicted = computeDeadReckonedTarget(fix, now, {
        routePolyline: routeRef.current,
        routeCumulativeMeters: routeCumulativeRef.current,
      });
      if (!cur) {
        displayRef.current = predicted;
        setDisplay(predicted);
        return;
      }
      const next = computeNextSmoothLocation(cur, predicted, undefined, undefined, elapsedMs);
      if (!next) {return;}
      if (shouldSkipMarkerUpdate(cur, next)) {
        return;
      }
      displayRef.current = next;
      setDisplay(next);
    }, LIVE_MARKER_TICK_MS);

    return () => clearInterval(interval);
  }, [enabled]);

  return display;
}
