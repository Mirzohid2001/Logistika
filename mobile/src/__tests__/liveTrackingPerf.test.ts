import {
  downsamplePolyline,
  isCameraNearlyEqual,
  shouldSkipMarkerUpdate,
} from '../utils/liveTrackingPerf';

describe('liveTrackingPerf', () => {
  it('skips marker updates smaller than parking jitter', () => {
    const a = { latitude: 41.2995, longitude: 69.2401 };
    const nearby = { latitude: 41.299501, longitude: 69.240101 };
    const far = { latitude: 41.3005, longitude: 69.2411 };
    expect(shouldSkipMarkerUpdate(a, nearby)).toBe(true);
    expect(shouldSkipMarkerUpdate(a, far)).toBe(false);
    expect(shouldSkipMarkerUpdate(null, a)).toBe(false);
  });

  it('skips near-identical camera frames', () => {
    const camera = {
      center: { latitude: 41.3, longitude: 69.24 },
      heading: 90,
      pitch: 56,
      zoom: 16.4,
    };
    expect(isCameraNearlyEqual(camera, { ...camera, heading: 90.1 })).toBe(true);
    expect(isCameraNearlyEqual(camera, { ...camera, heading: 95 })).toBe(false);
    expect(
      isCameraNearlyEqual({ ...camera, heading: 359.9 }, { ...camera, heading: 0.1 }),
    ).toBe(true);
  });

  it('does not treat a large heading wrap as equal', () => {
    const camera = {
      center: { latitude: 41.3, longitude: 69.24 },
      heading: 10,
      pitch: 56,
      zoom: 16.4,
    };
    expect(isCameraNearlyEqual(camera, { ...camera, heading: 180 })).toBe(false);
  });

  it('downsamples long polylines while keeping endpoints', () => {
    const points = Array.from({ length: 500 }, (_, i) => ({
      latitude: 41 + i * 0.001,
      longitude: 69 + i * 0.001,
    }));
    const reduced = downsamplePolyline(points, 50);
    expect(reduced).toHaveLength(50);
    expect(reduced[0]).toEqual(points[0]);
    expect(reduced[reduced.length - 1]).toEqual(points[points.length - 1]);
  });
});
