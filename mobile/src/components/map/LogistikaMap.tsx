import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  MapView,
  Camera,
  type CameraRef,
  type MapViewRef,
  type RegionPayload,
} from '@maplibre/maplibre-react-native';
import { getVectorMapStyle } from '../../config/mapStyle';
import {
  deltaToZoom,
  regionFromCenter,
  toLngLat,
  zoomToLatitudeDelta,
  type LatLng,
  type MapRegion,
} from '../../utils/mapGeo';
import { useAppTheme } from '../../theme/useAppTheme';

export type LogistikaMapRef = {
  getCenter: () => Promise<LatLng | null>;
  getZoom: () => Promise<number | null>;
};

export type MapCameraPadding = {
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
};

export interface LogistikaMapProps {
  style?: StyleProp<ViewStyle>;
  center?: { latitude: number; longitude: number };
  region?: MapRegion;
  latitudeDelta?: number;
  zoomLevel?: number;
  /** Compass heading in degrees. Used in taxi-style navigation follow. */
  heading?: number;
  /** Camera pitch in degrees (0 = top-down, ~50 = navigation). */
  pitch?: number;
  padding?: MapCameraPadding;
  /** Animate camera when center/region changes (live tracking). */
  cameraAnimationMs?: number;
  /** When false, region prop updates from gestures do not reset the camera. */
  cameraFollowRegion?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  attributionEnabled?: boolean;
  onRegionChangeComplete?: (region: MapRegion) => void;
  onRegionIsChanging?: (region: MapRegion) => void;
  /** Fires only for real finger/gesture moves, not programmatic follow. */
  onUserGesture?: () => void;
  children?: React.ReactNode;
}

function regionFromPayload(
  center: { latitude: number; longitude: number },
  zoomLevel: number,
): MapRegion {
  const latitudeDelta = zoomToLatitudeDelta(zoomLevel);
  return regionFromCenter(center.latitude, center.longitude, latitudeDelta, latitudeDelta);
}

function centerFromRegionFeature(
  feature: GeoJSON.Feature<GeoJSON.Point, RegionPayload>,
): LatLng | null {
  const coords = feature.geometry?.coordinates;
  if (coords && coords.length >= 2) {
    const [longitude, latitude] = coords;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  const bounds = feature.properties?.visibleBounds;
  if (bounds && bounds.length === 2) {
    const [northEast, southWest] = bounds;
    if (northEast?.length >= 2 && southWest?.length >= 2) {
      return {
        latitude: (northEast[1] + southWest[1]) / 2,
        longitude: (northEast[0] + southWest[0]) / 2,
      };
    }
  }

  return null;
}

function isUserGesture(
  feature: GeoJSON.Feature<GeoJSON.Point, RegionPayload>,
): boolean {
  const props = feature.properties as (RegionPayload & { isUserInteraction?: boolean }) | undefined;
  return props?.isUserInteraction === true;
}

export const LogistikaMap = forwardRef<LogistikaMapRef, LogistikaMapProps>(
  (
    {
      style,
      center,
      region,
      latitudeDelta = 0.05,
      zoomLevel,
      heading = 0,
      pitch = 0,
      padding,
      cameraAnimationMs = 0,
      cameraFollowRegion = true,
      scrollEnabled = true,
      zoomEnabled = true,
      rotateEnabled = true,
      pitchEnabled = true,
      attributionEnabled = true,
      onRegionChangeComplete,
      onRegionIsChanging,
      onUserGesture,
      children,
    },
    ref,
  ) => {
    const { isDark } = useAppTheme();
    const mapStyle = useMemo(() => getVectorMapStyle(isDark), [isDark]);
    const mapViewRef = useRef<MapViewRef>(null);
    const cameraRef = useRef<CameraRef>(null);
    const skipCameraSyncRef = useRef(false);
    const zoomRef = useRef(zoomLevel ?? deltaToZoom(latitudeDelta));
    const followRef = useRef(cameraFollowRegion);
    followRef.current = cameraFollowRegion;

    useImperativeHandle(ref, () => ({
      getCenter: async () => {
        try {
          const position = await mapViewRef.current?.getCenter();
          if (!position || position.length < 2) {
            return null;
          }
          const [longitude, latitude] = position;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }
          return { latitude, longitude };
        } catch {
          return null;
        }
      },
      getZoom: async () => {
        try {
          const zoom = await mapViewRef.current?.getZoom();
          return typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : null;
        } catch {
          return null;
        }
      },
    }));

    const activeRegion = useMemo(() => {
      if (region) {
        return region;
      }
      if (center) {
        return regionFromCenter(center.latitude, center.longitude, latitudeDelta, latitudeDelta);
      }
      return regionFromCenter(41.2995, 69.2401, latitudeDelta, latitudeDelta);
    }, [center, latitudeDelta, region]);

    const activeZoom = zoomLevel ?? deltaToZoom(activeRegion.latitudeDelta);
    zoomRef.current = activeZoom;

    const appliedRef = useRef({
      latitude: activeRegion.latitude,
      longitude: activeRegion.longitude,
      zoom: activeZoom,
      heading,
      pitch,
      padding,
    });

    if (cameraFollowRegion) {
      appliedRef.current = {
        latitude: activeRegion.latitude,
        longitude: activeRegion.longitude,
        zoom: activeZoom,
        heading,
        pitch,
        padding,
      };
    }

    const applied = appliedRef.current;

    useEffect(() => {
      if (!cameraFollowRegion || skipCameraSyncRef.current) {
        skipCameraSyncRef.current = false;
        return;
      }
      cameraRef.current?.setCamera({
        centerCoordinate: toLngLat(activeRegion),
        zoomLevel: activeZoom,
        heading,
        pitch,
        ...(padding ? { padding } : {}),
        animationDuration: cameraAnimationMs,
        animationMode: cameraAnimationMs > 0 ? 'easeTo' : 'moveTo',
      });
      // Field-level deps keep follow camera stable; the region object is recreated each render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      activeRegion.latitude,
      activeRegion.longitude,
      activeRegion.latitudeDelta,
      activeZoom,
      heading,
      pitch,
      padding?.paddingBottom,
      padding?.paddingTop,
      padding?.paddingLeft,
      padding?.paddingRight,
      cameraAnimationMs,
      cameraFollowRegion,
    ]);

    const emitRegion = (
      feature: GeoJSON.Feature<GeoJSON.Point, RegionPayload>,
      handler?: (region: MapRegion) => void,
    ) => {
      if (!handler) {
        return;
      }
      const centerPoint = centerFromRegionFeature(feature);
      if (!centerPoint) {
        return;
      }
      const zoom = feature.properties?.zoomLevel ?? zoomRef.current;
      zoomRef.current = zoom;
      skipCameraSyncRef.current = true;
      handler(regionFromPayload(centerPoint, zoom));
    };

    const handleRegionEvent = (
      feature: GeoJSON.Feature<GeoJSON.Point, RegionPayload>,
      handler?: (region: MapRegion) => void,
    ) => {
      if (isUserGesture(feature) && followRef.current === false) {
        skipCameraSyncRef.current = true;
      }
      if (isUserGesture(feature)) {
        onUserGesture?.();
      }
      emitRegion(feature, handler);
    };

    return (
      <MapView
        ref={mapViewRef}
        style={style}
        mapStyle={mapStyle}
        scrollEnabled={scrollEnabled}
        zoomEnabled={zoomEnabled}
        rotateEnabled={rotateEnabled}
        pitchEnabled={pitchEnabled}
        attributionEnabled={attributionEnabled}
        regionDidChangeDebounceTime={80}
        onRegionDidChange={(feature) => handleRegionEvent(feature, onRegionChangeComplete)}
        onRegionIsChanging={(feature) => handleRegionEvent(feature, onRegionIsChanging)}>
        <Camera
          ref={cameraRef}
          centerCoordinate={[applied.longitude, applied.latitude]}
          zoomLevel={applied.zoom}
          heading={applied.heading}
          pitch={applied.pitch}
          padding={applied.padding}
          animationDuration={0}
        />
        {children}
      </MapView>
    );
  },
);

LogistikaMap.displayName = 'LogistikaMap';
