import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { MarkerView } from '@maplibre/maplibre-react-native';
import { toLngLat, type LatLng } from '../../utils/mapGeo';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

interface LogistikaMarkerProps {
  id: string;
  coordinate: LatLng;
  color?: string;
  size?: number;
  children?: React.ReactNode;
  onPress?: () => void;
  anchor?: { x: number; y: number };
}

export const LogistikaMarker: React.FC<LogistikaMarkerProps> = ({
  coordinate,
  color,
  size = 18,
  children,
  onPress,
  anchor = { x: 0.5, y: 0.5 },
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const markerColor = color ?? colors.primary;

  const content = children ?? (
    <View
      style={[
        styles.pin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: markerColor,
        },
      ]}
    />
  );

  return (
    <MarkerView coordinate={toLngLat(coordinate)} anchor={anchor} allowOverlap>
      {onPress ? (
        <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.customContainer}>
          {content}
        </TouchableOpacity>
      ) : (
        <View style={styles.customContainer}>{content}</View>
      )}
    </MarkerView>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    pin: {
      borderWidth: 2,
      borderColor: colors.textLight,
    },
    customContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      shadowOpacity: 0,
      elevation: 0,
    },
  });
