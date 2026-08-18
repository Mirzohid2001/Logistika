import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';

interface MapSpeedHudProps {
  visible: boolean;
  kmh: number;
  unitLabel: string;
}

export const MapSpeedHud: React.FC<MapSpeedHudProps> = ({ visible, kmh, unitLabel }) => {
  const styles = useThemedStyles(createStyles);
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.hud} pointerEvents="none">
      <Text style={styles.value}>{Math.round(kmh)}</Text>
      <Text style={styles.unit}>{unitLabel}</Text>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    hud: {
      position: 'absolute',
      left: spacing.md,
      top: 58,
      minWidth: 64,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.borderLight,
      alignItems: 'center',
      zIndex: 4,
    },
    value: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.extrabold,
      color: colors.text,
      lineHeight: 28,
    },
    unit: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: colors.textSecondary,
    },
  });
