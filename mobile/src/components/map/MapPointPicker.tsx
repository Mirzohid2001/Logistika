import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { LogistikaMap, type LogistikaMapRef } from './LogistikaMap';
import { borderRadius, fontSize, spacing } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { regionFromCenter, type MapRegion } from '../../utils/mapGeo';

export type MapPointPickerRef = {
  getRegion: () => Promise<MapRegion>;
};

interface MapPointPickerProps {
  region: MapRegion;
  onRegionChange: (region: MapRegion) => void;
  accentColor: string;
  height?: number;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}

export const MapPointPicker = forwardRef<MapPointPickerRef, MapPointPickerProps>(
  ({ region, onRegionChange, accentColor, height = 220, onGestureStart, onGestureEnd }, ref) => {
    const styles = useThemedStyles(createStyles);
    const mapRef = useRef<LogistikaMapRef>(null);
    const [cameraRegion, setCameraRegion] = useState(region);
    const [pickedRegion, setPickedRegion] = useState(region);
    const internalGestureRef = useRef(false);
    const externalRegionRef = useRef(region);
    const gestureActiveRef = useRef(false);

    useEffect(() => {
      const external = externalRegionRef.current;
      const movedExternally =
        Math.abs(region.latitude - external.latitude) > 0.000001 ||
        Math.abs(region.longitude - external.longitude) > 0.000001;

      if (internalGestureRef.current) {
        internalGestureRef.current = false;
        return;
      }

      if (!movedExternally) {
        return;
      }

      externalRegionRef.current = region;
      setCameraRegion(region);
      setPickedRegion(region);
    }, [region]);

    const beginGesture = () => {
      if (!gestureActiveRef.current) {
        gestureActiveRef.current = true;
        onGestureStart?.();
      }
    };

    const endGesture = () => {
      if (gestureActiveRef.current) {
        gestureActiveRef.current = false;
        onGestureEnd?.();
      }
    };

    const handleRegionChanging = (next: MapRegion) => {
      beginGesture();
      internalGestureRef.current = true;
      externalRegionRef.current = next;
      setPickedRegion(next);
    };

    const handleRegionChange = (next: MapRegion) => {
      internalGestureRef.current = true;
      externalRegionRef.current = next;
      setPickedRegion(next);
      onRegionChange(next);
      endGesture();
    };

    useImperativeHandle(ref, () => ({
      getRegion: async () => {
        const center = await mapRef.current?.getCenter();
        const zoom = await mapRef.current?.getZoom();
        if (center) {
          const next = regionFromCenter(
            center.latitude,
            center.longitude,
            pickedRegion.latitudeDelta,
            pickedRegion.longitudeDelta,
          );
          if (zoom != null) {
            const latitudeDelta = 360 / Math.pow(2, zoom + 1);
            next.latitudeDelta = latitudeDelta;
            next.longitudeDelta = latitudeDelta;
          }
          internalGestureRef.current = true;
          externalRegionRef.current = next;
          setPickedRegion(next);
          onRegionChange(next);
          return next;
        }
        return pickedRegion;
      },
    }));

    return (
      <View
        style={[styles.container, { height }]}
        onStartShouldSetResponderCapture={() => {
          beginGesture();
          return false;
        }}
        onMoveShouldSetResponderCapture={() => {
          beginGesture();
          return false;
        }}
        onResponderTerminationRequest={() => false}>
        <LogistikaMap
          ref={mapRef}
          style={styles.map}
          region={cameraRegion}
          cameraFollowRegion
          rotateEnabled={false}
          pitchEnabled={false}
          onRegionIsChanging={handleRegionChanging}
          onRegionChangeComplete={handleRegionChange}
        />
        <View pointerEvents="none" style={styles.crosshairLayer}>
          <View style={[styles.crosshairRing, { borderColor: accentColor }]}>
            <MaterialIcons name="place" size={28} color={accentColor} />
          </View>
        </View>
        <View pointerEvents="none" style={styles.coordsBadge}>
          <Text style={styles.coordsText}>
            {pickedRegion.latitude.toFixed(5)}, {pickedRegion.longitude.toFixed(5)}
          </Text>
        </View>
      </View>
    );
  },
);

MapPointPicker.displayName = 'MapPointPicker';

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    map: {
      flex: 1,
    },
    crosshairLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    crosshairRing: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBackground,
    },
    coordsBadge: {
      position: 'absolute',
      left: spacing.sm,
      bottom: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.md,
      backgroundColor: colors.cardBackground + 'E6',
    },
    coordsText: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
  });
