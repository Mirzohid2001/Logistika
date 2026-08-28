import React, { useMemo, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, TextStyle, Animated } from 'react-native';
import { borderRadius, spacing, fontSize, fontWeight } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';
import { a11yButton } from '../utils/accessibility';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'success' | 'warning';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle;
  size?: 'sm' | 'md' | 'lg';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  size = 'md',
  accessibilityLabel,
  accessibilityHint,
}) => {
  const { colors, shadows } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows]);
  const scale = useRef(new Animated.Value(1)).current;

  const animatePress = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 28,
      bounciness: 3,
    }).start();
  };

  const buttonStyle = [
    styles.button,
    styles[size],
    styles[variant],
    (disabled || loading) && styles.disabled,
    style,
  ];

  const buttonTextStyle = [
    styles.text,
    styles[`${size}Text`],
    styles[`${variant}Text`],
    textStyle,
  ];

  const getIndicatorColor = () => {
    if (variant === 'outline') {return colors.primary;}
    return colors.textLight;
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={buttonStyle}
        onPress={onPress}
        onPressIn={() => animatePress(0.97)}
        onPressOut={() => animatePress(1)}
        disabled={disabled || loading}
        activeOpacity={0.9}
        {...a11yButton(accessibilityLabel || title, accessibilityHint)}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}>
        {loading ? (
          <ActivityIndicator color={getIndicatorColor()} size="small" />
        ) : (
          <Text style={buttonTextStyle}>{title}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) =>
  StyleSheet.create({
    button: {
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    sm: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
    },
    md: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xxl,
      minHeight: 56,
    },
    lg: {
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.xxxl,
      minHeight: 64,
    },
    primary: {
      backgroundColor: colors.primary,
      ...shadows.colored(colors.primary),
    },
    secondary: {
      backgroundColor: colors.secondary,
      ...shadows.colored(colors.secondary),
    },
    danger: {
      backgroundColor: colors.danger,
      ...shadows.colored(colors.danger),
    },
    success: {
      backgroundColor: colors.success,
      ...shadows.colored(colors.success),
    },
    warning: {
      backgroundColor: colors.logisticsAccent,
      ...shadows.colored(colors.logisticsAccent),
    },
    outline: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.primary,
      ...shadows.sm,
    },
    disabled: {
      opacity: 0.5,
    },
    text: {
      fontWeight: fontWeight.bold,
      letterSpacing: 0.5,
    },
    smText: {
      fontSize: fontSize.sm,
    },
    mdText: {
      fontSize: fontSize.base,
    },
    lgText: {
      fontSize: fontSize.lg,
    },
    primaryText: {
      color: colors.onPrimary,
    },
    secondaryText: {
      color: colors.textLight,
    },
    dangerText: {
      color: colors.textLight,
    },
    successText: {
      color: colors.textLight,
    },
    warningText: {
      color: colors.textLight,
    },
    outlineText: {
      color: colors.primary,
    },
  });
