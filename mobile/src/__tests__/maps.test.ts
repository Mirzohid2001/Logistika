import { getVectorMapStyle, OSM_MAP_STYLE } from '../config/mapStyle';
import { buildTaxiMapStyle } from '../config/taxiMapStyle';

describe('maps config', () => {
  it('keeps a raster OSM fallback', () => {
    expect(OSM_MAP_STYLE.version).toBe(8);
    expect(OSM_MAP_STYLE.sources.osm.type).toBe('raster');
    expect(OSM_MAP_STYLE.sources.osm.tiles[0]).toContain('openstreetmap.org');
  });

  it('builds a taxi vector style with 3D buildings', () => {
    const light = getVectorMapStyle(false);
    const dark = getVectorMapStyle(true);
    expect(light.name).toBe('LogistikaTaxiLight');
    expect(dark.name).toBe('LogistikaTaxiDark');
    expect(light.sources.openmaptiles.url).toContain('openfreemap.org');
    expect(light.layers.some((layer: { id: string }) => layer.id === 'building-3d')).toBe(true);
    expect(dark.layers.some((layer: { id: string }) => layer.id === 'building-3d')).toBe(true);
    expect(buildTaxiMapStyle(false).layers[0].paint['background-color']).toBe('#E8E2D6');
  });
});
