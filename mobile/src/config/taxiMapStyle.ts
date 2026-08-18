/**
 * Product map style: muted taxi palette, 3D buildings, sparse labels.
 * Tiles: OpenFreeMap (OpenMapTiles).
 */

const TILE_SOURCE = 'https://tiles.openfreemap.org/planet';
const SPRITE = 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const NAME_FIELD = [
  'coalesce',
  ['get', 'name:ru'],
  ['get', 'name:uz'],
  ['get', 'name'],
  ['get', 'name:en'],
  ['get', 'name:latin'],
];

type Palette = {
  background: string;
  park: string;
  water: string;
  roadCasing: string;
  roadFill: string;
  motorway: string;
  motorwayCasing: string;
  building: string;
  building3d: string;
  label: string;
  labelHalo: string;
};

const LIGHT: Palette = {
  background: '#E8E2D6',
  park: '#C5D9B0',
  water: '#9EC9E6',
  roadCasing: '#D0C8BA',
  roadFill: '#FFFFFF',
  motorway: '#F2D27A',
  motorwayCasing: '#E0B94A',
  building: '#D8D0C4',
  building3d: '#CFC6B8',
  label: '#5C564C',
  labelHalo: '#F4EFE6',
};

const DARK: Palette = {
  background: '#141A24',
  park: '#1A2A22',
  water: '#1B3A52',
  roadCasing: '#0E131C',
  roadFill: '#3A4558',
  motorway: '#8A7340',
  motorwayCasing: '#5C4C28',
  building: '#2A3344',
  building3d: '#343E52',
  label: '#C5CDD8',
  labelHalo: '#141A24',
};

function roadWidth(base: number) {
  return ['interpolate', ['exponential', 1.3], ['zoom'], 8, base * 0.25, 12, base * 0.55, 15, base, 18, base * 1.7];
}

export function buildTaxiMapStyle(isDark: boolean, options?: { buildings3d?: boolean }) {
  const p = isDark ? DARK : LIGHT;
  const buildings3d = options?.buildings3d ?? true;
  const layers = [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': p.background },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': p.park, 'fill-opacity': 0.72 },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false],
        paint: { 'fill-color': p.park, 'fill-opacity': 0.45 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': p.water },
      },
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['match', ['get', 'class'], ['minor', 'service', 'path'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.roadCasing,
          'line-width': roadWidth(6.5),
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['match', ['get', 'class'], ['minor', 'service'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.roadFill,
          'line-width': roadWidth(4),
        },
      },
      {
        id: 'road-secondary-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.roadCasing,
          'line-width': roadWidth(8),
        },
      },
      {
        id: 'road-secondary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.roadFill,
          'line-width': roadWidth(5.2),
        },
      },
      {
        id: 'road-primary-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.motorwayCasing,
          'line-width': roadWidth(10),
        },
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.motorway,
          'line-width': roadWidth(6.5),
        },
      },
      {
        id: 'road-motorway-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.motorwayCasing,
          'line-width': roadWidth(12),
        },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': p.motorway,
          'line-width': roadWidth(8),
        },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        maxzoom: 15,
        paint: { 'fill-color': p.building, 'fill-opacity': 0.85 },
      },
      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': p.building3d,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.92,
        },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME_FIELD,
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-max-angle': 30,
        },
        paint: {
          'text-color': p.label,
          'text-halo-color': p.labelHalo,
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 5,
        filter: ['match', ['get', 'class'], ['city', 'town', 'village'], true, false],
        layout: {
          'text-field': NAME_FIELD,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 12, 16],
          'text-max-width': 8,
        },
        paint: {
          'text-color': p.label,
          'text-halo-color': p.labelHalo,
          'text-halo-width': 1.4,
        },
      },
    ];
    return {
      version: 8,
      name: isDark ? 'LogistikaTaxiDark' : 'LogistikaTaxiLight',
      sources: {
        openmaptiles: {
          type: 'vector',
          url: TILE_SOURCE,
        },
      },
      sprite: SPRITE,
      glyphs: GLYPHS,
      layers: buildings3d ? layers : layers.filter((layer) => layer.id !== 'building-3d'),
    };
}
