import { buildTaxiMapStyle } from './taxiMapStyle';

/**
 * Live maps use a custom taxi vector style on OpenFreeMap tiles
 * (3D buildings, muted palette, sparse labels).
 *
 * Raster OSM remains a documented fallback.
 */
export const VECTOR_MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const VECTOR_MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export function getVectorMapStyle(isDark: boolean) {
  return buildTaxiMapStyle(isDark);
}

export const MAP_TILE_URLS = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors';

export const OSM_MAP_STYLE = {
  version: 8,
  name: 'LogistikaMap',
  sources: {
    osm: {
      type: 'raster',
      tiles: MAP_TILE_URLS,
      tileSize: 256,
      attribution: MAP_ATTRIBUTION,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
} as const;
