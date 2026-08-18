import { useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng } from '../utils/mapGeo';
import {
  computeDeadReckonedTarget,
  computeNextSmoothLocation,
  type DriverMotionTarget,
} from '../utils/mapTracking';

const TICK_MS = 50;

export type FleetMotionTarget = DriverMotionTarget & {
  driverId: number;
};

function toTargetsMap(targets: FleetMotionTarget[]): Map<number, DriverMotionTarget> {
  const next = new Map<number, DriverMotionTarget>();
  for (const item of targets) {
    next.set(item.driverId, {
      latitude: item.latitude,
      longitude: item.longitude,
      heading: item.heading ?? null,
      speedMps: item.speedMps ?? null,
      updatedAtMs: item.updatedAtMs ?? Date.now(),
      routeProgressM: item.routeProgressM ?? null,
    });
  }
  return next;
}

function toDisplaySeed(targets: FleetMotionTarget[]): Record<number, LatLng> {
  const seeded: Record<number, LatLng> = {};
  for (const item of targets) {
    seeded[item.driverId] = { latitude: item.latitude, longitude: item.longitude };
  }
  return seeded;
}

/**
 * Smooths many live driver markers (dispatcher fleet map) with the same
 * dead-reckoning model used on the client order tracking screen.
 */
export function useSmoothFleetLocations(
  targets: FleetMotionTarget[],
  enabled = true
): Record<number, LatLng> {
  const [displayById, setDisplayById] = useState<Record<number, LatLng>>(() =>
    toDisplaySeed(targets)
  );
  const displayRef = useRef<Record<number, LatLng>>(toDisplaySeed(targets));
  const targetsRef = useRef<Map<number, DriverMotionTarget>>(toTargetsMap(targets));

  const signature = useMemo(
    () =>
      targets
        .map(
          (t) =>
            `${t.driverId}:${t.latitude.toFixed(6)},${t.longitude.toFixed(6)},${t.speedMps ?? ''},${t.heading ?? ''},${t.updatedAtMs ?? ''},${t.routeProgressM ?? ''}`
        )
        .join('|'),
    [targets]
  );

  useEffect(() => {
    const next = toTargetsMap(targets);
    const nextDisplay: Record<number, LatLng> = { ...displayRef.current };
    next.forEach((fix, id) => {
      if (!nextDisplay[id]) {
        nextDisplay[id] = { latitude: fix.latitude, longitude: fix.longitude };
      }
    });
    for (const id of Object.keys(nextDisplay)) {
      const numId = Number(id);
      if (!next.has(numId)) {
        delete nextDisplay[numId];
      }
    }
    targetsRef.current = next;
    displayRef.current = nextDisplay;

    if (!enabled) {
      const snapped = toDisplaySeed(targets);
      displayRef.current = snapped;
      setDisplayById(snapped);
      return;
    }
    setDisplayById(nextDisplay);
  }, [signature, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      const nextDisplay: Record<number, LatLng> = { ...displayRef.current };
      targetsRef.current.forEach((fix, id) => {
        const predicted = computeDeadReckonedTarget(fix, now);
        const current = nextDisplay[id] ?? null;
        const stepped = computeNextSmoothLocation(current, predicted);
        if (!stepped) {
          return;
        }
        const prev = nextDisplay[id];
        if (
          !prev ||
          Math.abs(prev.latitude - stepped.latitude) > 1e-7 ||
          Math.abs(prev.longitude - stepped.longitude) > 1e-7
        ) {
          nextDisplay[id] = stepped;
          changed = true;
        }
      });
      if (changed) {
        displayRef.current = nextDisplay;
        setDisplayById(nextDisplay);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  return displayById;
}
