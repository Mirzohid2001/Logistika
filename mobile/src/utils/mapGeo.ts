export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

export function toLngLat(point: LatLng): [number, number] {
  return [point.longitude, point.latitude];
}

export function deltaToZoom(latitudeDelta: number): number {
  const safeDelta = Math.max(latitudeDelta, 0.0001);
  const zoom = Math.log2(360 / safeDelta) - 1;
  return Math.max(2, Math.min(18, zoom));
}

export function zoomToLatitudeDelta(zoomLevel: number): number {
  return 360 / Math.pow(2, zoomLevel + 1);
}

export function coordinatesToLineString(coordinates: LatLng[]): GeoJSON.LineString {
  return {
    type: 'LineString',
    coordinates: coordinates.map((point) => toLngLat(point)),
  };
}

export function regionFromCenter(
  latitude: number,
  longitude: number,
  latitudeDelta = 0.05,
  longitudeDelta = latitudeDelta,
): MapRegion {
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export function regionFromBounds(points: LatLng[], paddingFactor = 1.3): MapRegion | null {
  if (!points.length) {
    return null;
  }

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  points.forEach((point) => {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  });

  const latitudeDelta = Math.max((maxLat - minLat) * paddingFactor, 0.02);
  const longitudeDelta = Math.max((maxLng - minLng) * paddingFactor, 0.02);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}
