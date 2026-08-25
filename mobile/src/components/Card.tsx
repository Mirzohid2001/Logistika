import React, { useMemo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { borderRadius, spacing, shadows } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'elevated' | 'outlined' | 'soft';
  padding?: 'md' | 'lg' | 'xl';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
  padding = 'lg',
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const cardStyle = [
    styles.card,
    styles[`padding_${padding}`],
    variant === 'elevated' && styles.cardElevated,
    variant === 'outlined' && styles.cardOutlined,
    variant === 'soft' && styles.cardSoft,
    style,
  ];

  return <View style={cardStyle}>{children}</View>;
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.cardBackground,
      borderRadius: borderRadius.xl,
      marginVertical: spacing.xs,
      marginHorizontal: 0,
      ...shadows.sm,
      borderWidth: 1,
      borderColor: colors.borderLight,
      overflow: 'hidden',
    },
    padding_md: {
      padding: spacing.md + 2,
    },
    padding_lg: {
      padding: spacing.lg,
    },
    padding_xl: {
      padding: spacing.xl,
    },
    cardElevated: {
      backgroundColor: colors.surfaceElevated,
      ...shadows.lg,
      borderColor: `${colors.primaryLight}22`,
    },
    cardOutlined: {
      ...shadows.sm,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    cardSoft: {
      ...shadows.sm,
      backgroundColor: colors.surfaceMuted,
      borderColor: `${colors.borderLight}CC`,
    },
  });
