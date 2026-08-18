import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAppTheme } from '../theme/useAppTheme';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme';
import { a11yButton, a11yHeader } from '../utils/accessibility';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  variant?: 'empty' | 'error';
  actionText?: string;
  onActionPress?: () => void;
  accessibilityLabel?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon,
  variant = 'empty',
  actionText,
  onActionPress,
  accessibilityLabel,
}) => {
  const { colors, shadows: themedShadows } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, themedShadows), [colors, themedShadows]);
  const ringColor = variant === 'error' ? colors.dangerGlow : colors.primaryGlow;
  const iconColor = variant === 'error' ? colors.danger : colors.primary;

  return (
    <View style={styles.container} {...a11yHeader(accessibilityLabel || title)}>
      <View style={[styles.iconRing, { backgroundColor: ringColor, borderColor: `${iconColor}22` }]}>
        {icon || (
          <MaterialIcons
            name={variant === 'error' ? 'error-outline' : 'inbox'}
            size={34}
            color={iconColor}
          />
        )}
      </View>
      <Text style={[styles.title, { color: variant === 'error' ? colors.danger : colors.text }]}>
        {title}
      </Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {actionText && onActionPress ? (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onActionPress}
          activeOpacity={0.85}
          {...a11yButton(actionText)}>
          <Text style={styles.actionText}>{actionText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  themedShadows: ReturnType<typeof useAppTheme>['shadows'],
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxxl,
      paddingHorizontal: spacing.xxl,
    },
    iconRing: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xl,
      borderWidth: 1,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      textAlign: 'center',
      marginBottom: spacing.xs,
      letterSpacing: -0.3,
      maxWidth: 320,
    },
    message: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      fontWeight: fontWeight.medium,
      maxWidth: 320,
    },
    actionButton: {
      marginTop: spacing.xl,
      paddingHorizontal: spacing.xxl,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.round,
      minHeight: 50,
      justifyContent: 'center',
      backgroundColor: colors.primary,
      ...themedShadows.colored(colors.primaryDark),
    },
    actionText: {
      color: colors.textLight,
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
    },
  });
