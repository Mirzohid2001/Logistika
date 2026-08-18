import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useSmoothDriverLocation } from '../hooks/useSmoothDriverLocation';
import type { LatLng } from '../utils/mapGeo';

let latestDisplay: LatLng | null = null;

function Host({ target, enabled = true }: { target: LatLng | null; enabled?: boolean }) {
  latestDisplay = useSmoothDriverLocation(target, enabled);
  return null;
}

describe('useSmoothDriverLocation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    latestDisplay = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('snaps display to initial target', () => {
    const target = { latitude: 41.2995, longitude: 69.2401 };
    act(() => {
      TestRenderer.create(<Host target={target} />);
    });
    expect(latestDisplay).toEqual(target);
  });

  it('clears display when target becomes null', () => {
    const target = { latitude: 41.3, longitude: 69.24 };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Host target={target} />);
    });
    act(() => {
      renderer.update(<Host target={null} />);
    });
    expect(latestDisplay).toBeNull();
  });

  it('interpolates toward a new target over timer ticks', () => {
    const start = { latitude: 41.0, longitude: 69.0 };
    const end = { latitude: 41.05, longitude: 69.05 };
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<Host target={start} />);
    });
    act(() => {
      renderer.update(<Host target={end} />);
    });

    const beforeTicks = latestDisplay;
    expect(beforeTicks).toEqual(start);

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(latestDisplay).not.toBeNull();
    expect(latestDisplay!.latitude).toBeGreaterThan(start.latitude);
    expect(latestDisplay!.latitude).toBeLessThan(end.latitude);
  });

  it('jumps to target immediately when smoothing disabled', () => {
    const start = { latitude: 41.0, longitude: 69.0 };
    const end = { latitude: 41.05, longitude: 69.05 };
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<Host target={start} enabled={false} />);
    });
    act(() => {
      renderer.update(<Host target={end} enabled={false} />);
    });

    expect(latestDisplay).toEqual(end);
  });
});
