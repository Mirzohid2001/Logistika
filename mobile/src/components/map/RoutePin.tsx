import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { LogistikaMarker } from './LogistikaMarker';
import type { LatLng } from '../../utils/mapGeo';
import { borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

export type RoutePinKind = 'pickup' | 'dropoff' | 'stop' | 'active';

interface RoutePinProps {
  id: string;
  coordinate: LatLng;
  kind: RoutePinKind;
  label?: string;
  index?: number;
}

export const RoutePin: React.FC<RoutePinProps> = ({ id, coordinate, kind, label, index }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const fill =
    kind === 'pickup'
      ? colors.success
      : kind === 'dropoff'
        ? colors.logisticsAccent
        : kind === 'active'
          ? colors.primary
          : colors.textSecondary;
  const icon =
    kind === 'pickup' ? 'trip-origin' : kind === 'dropoff' ? 'flag' : 'place';

  return (
    <LogistikaMarker id={id} coordinate={coordinate} anchor={{ x: 0.5, y: 1 }}>
      <View style={styles.wrap}>
        {label ? (
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ) : null}
        <View style={[styles.head, { backgroundColor: fill }]}>
          {index != null ? (
            <Text style={styles.index}>{index}</Text>
          ) : (
            <MaterialIcons name={icon} size={16} color={colors.textLight} />
          )}
        </View>
        <View style={[styles.tail, { borderTopColor: fill }]} />
      </View>
    </LogistikaMarker>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      alignItems: 'center',
    },
    chip: {
      maxWidth: 140,
      marginBottom: 4,
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: borderRadius.round,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    chipText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    head: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.textLight,
    },
    index: {
      color: colors.textLight,
      fontSize: 12,
      fontWeight: fontWeight.bold,
    },
    tail: {
      width: 0,
      height: 0,
      borderLeftWidth: 7,
      borderRightWidth: 7,
      borderTopWidth: 9,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      marginTop: -1,
    },
  });
