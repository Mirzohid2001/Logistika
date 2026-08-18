import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toastService, ToastPayload } from '../services/toastService';
import { borderRadius, fontSize, fontWeight, shadows, spacing } from '../theme';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';

export const GlobalToast: React.FC = () => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const [payload, setPayload] = useState<ToastPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return toastService.onToast((nextPayload) => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      setPayload(nextPayload);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();

      hideTimeoutRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.98, duration: 200, useNativeDriver: true }),
        ]).start(() => setPayload(null));
      }, 2800);
    });
  }, [opacity, translateY, scale]);

  if (!payload) {
    return null;
  }

  const palette =
    payload.type === 'success'
      ? { bg: colors.success, glow: colors.successGlow, icon: 'check-circle' }
      : payload.type === 'error'
        ? { bg: colors.danger, glow: colors.dangerGlow, icon: 'error-outline' }
        : { bg: colors.primary, glow: colors.primaryGlow, icon: 'info-outline' };

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          top: insets.top + spacing.md,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}>
      <View style={[styles.toast, { backgroundColor: palette.bg, borderColor: palette.glow }]}>
        <View style={[styles.iconWrap, { backgroundColor: palette.glow }]}>
          <MaterialIcons name={palette.icon} size={20} color={palette.bg} />
        </View>
        <Text style={styles.text} numberOfLines={3}>
          {payload.message}
        </Text>
      </View>
    </Animated.View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 9999,
    },
    toast: {
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      ...shadows.lg,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      color: colors.textLight,
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      lineHeight: 20,
    },
  });
