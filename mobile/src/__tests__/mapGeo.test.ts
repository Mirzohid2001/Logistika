import { coordinatesToLineString, deltaToZoom, toLngLat } from '../utils/mapGeo';

describe('mapGeo', () => {
  it('converts lat/lng to maplibre coordinate order', () => {
    expect(toLngLat({ latitude: 41.3, longitude: 69.24 })).toEqual([69.24, 41.3]);
  });

  it('builds line strings for polylines', () => {
    const line = coordinatesToLineString([
      { latitude: 41.3, longitude: 69.24 },
      { latitude: 41.31, longitude: 69.25 },
    ]);
    expect(line.coordinates).toEqual([
      [69.24, 41.3],
      [69.25, 41.31],
    ]);
  });

  it('converts latitude delta to zoom level', () => {
    expect(deltaToZoom(0.05)).toBeGreaterThan(10);
  });
});
