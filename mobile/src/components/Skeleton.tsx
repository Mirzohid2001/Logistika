import React from 'react';
import { View, StyleSheet } from 'react-native';
import { borderRadius, spacing, shadows } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';

interface SkeletonProps {
  height?: number;
  width?: number | string;
  style?: any;
}

export const Skeleton: React.FC<SkeletonProps> = ({ height = 16, width = '100%', style }) => {
  const styles = useThemedStyles(createBaseStyles);

  return (
    <View style={[styles.base, { height, width }, style]} />
  );
};

export const SkeletonCard: React.FC = () => {
  const styles = useThemedStyles(createCardStyles);

  return (
    <View style={styles.card}>
      <Skeleton height={18} width="48%" />
      <Skeleton height={14} width="82%" style={{ marginTop: spacing.md }} />
      <Skeleton height={14} width="64%" style={{ marginTop: spacing.sm }} />
    </View>
  );
};

const createBaseStyles = (colors: AppColors) =>
  StyleSheet.create({
    base: {
      borderRadius: borderRadius.md,
      opacity: 0.85,
      backgroundColor: colors.backgroundTertiary,
    },
  });

const createCardStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      padding: spacing.xl,
      marginHorizontal: spacing.lg,
      marginVertical: spacing.sm,
      borderRadius: borderRadius.xl,
      gap: spacing.xs,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderLight,
      ...shadows.sm,
    },
  });
