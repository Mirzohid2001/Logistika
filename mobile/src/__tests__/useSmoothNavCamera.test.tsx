import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { useSmoothNavCamera, type SmoothNavCamera } from '../hooks/useSmoothNavCamera';
import type { LatLng } from '../utils/mapGeo';

let latest: SmoothNavCamera | null = null;

function Host({ enabled, coordinate }: { enabled: boolean; coordinate: LatLng | null }) {
  latest = useSmoothNavCamera(enabled, coordinate, 90, 10);
  return null;
}

describe('useSmoothNavCamera', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    latest = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('smoothly follows coordinate changes without snapping', () => {
    const start = { latitude: 41.3, longitude: 69.24 };
    const end = { latitude: 41.31, longitude: 69.25 };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Host enabled coordinate={start} />);
    });
    const firstCenter = latest!.center;

    act(() => {
      renderer.update(<Host enabled coordinate={end} />);
    });
    act(() => {
      jest.advanceTimersByTime(240);
    });

    expect(latest!.center.latitude).toBeGreaterThan(firstCenter.latitude);
    expect(latest!.center.latitude).toBeLessThan(end.latitude);
  });

  it('clears stale camera state while follow mode is disabled', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Host enabled coordinate={{ latitude: 41.3, longitude: 69.24 }} />,
      );
    });
    expect(latest).not.toBeNull();
    act(() => {
      renderer.update(<Host enabled={false} coordinate={null} />);
    });
    expect(latest).toBeNull();
  });
});
