import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { spacing, borderRadius, shadows, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { ScreenBackground } from './ScreenBackground';

interface LoadingSpinnerProps {
  label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ label }) => {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} />
          {label ? <Text style={styles.label}>{label}</Text> : null}
        </View>
      </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    card: {
      minWidth: 140,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.xxl,
      borderRadius: borderRadius.xl,
      backgroundColor: colors.cardBackground,
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
      ...shadows.lg,
    },
    label: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.textSecondary,
    },
  });
