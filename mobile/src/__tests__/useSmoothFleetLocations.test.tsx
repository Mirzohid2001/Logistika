import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  useSmoothFleetLocations,
  type FleetMotionTarget,
} from '../hooks/useSmoothFleetLocations';
import type { LatLng } from '../utils/mapGeo';

let latest: Record<number, LatLng> = {};

function Host({ targets, enabled = true }: { targets: FleetMotionTarget[]; enabled?: boolean }) {
  latest = useSmoothFleetLocations(targets, enabled);
  return null;
}

describe('useSmoothFleetLocations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    latest = {};
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('seeds display positions from targets', () => {
    const targets: FleetMotionTarget[] = [
      { driverId: 1, latitude: 41.3, longitude: 69.24 },
      { driverId: 2, latitude: 41.4, longitude: 69.3 },
    ];
    act(() => {
      TestRenderer.create(<Host targets={targets} />);
    });
    expect(latest[1]).toEqual({ latitude: 41.3, longitude: 69.24 });
    expect(latest[2]).toEqual({ latitude: 41.4, longitude: 69.3 });
  });

  it('interpolates fleet markers toward updated targets', () => {
    const start: FleetMotionTarget[] = [
      { driverId: 1, latitude: 41.0, longitude: 69.0, speedMps: 0, updatedAtMs: 1 },
    ];
    const end: FleetMotionTarget[] = [
      {
        driverId: 1,
        latitude: 41.05,
        longitude: 69.05,
        speedMps: 15,
        heading: 45,
        updatedAtMs: Date.now(),
      },
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Host targets={start} />);
    });
    act(() => {
      renderer.update(<Host targets={end} />);
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(latest[1].latitude).toBeGreaterThan(41.0);
    expect(latest[1].latitude).toBeLessThan(41.05);
  });
});
