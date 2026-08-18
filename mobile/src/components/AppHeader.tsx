import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { spacing, fontSize, fontWeight, shadows, borderRadius } from '../theme';
import { useAppTheme } from '../theme/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import { a11yHeader } from '../utils/accessibility';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  variant?: 'default' | 'hero';
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  variant = 'default',
  showBack,
  onBack,
  right,
}) => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canGoBack = navigation.canGoBack?.() ?? false;
  const backVisible = showBack ?? canGoBack;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigation.goBack();
  };

  return (
    <View
      style={[
        styles.container,
        variant === 'hero' && styles.containerHero,
        {
          paddingTop: Math.max(insets.top, spacing.md) + spacing.sm,
        },
      ]}>
      {(backVisible || right) && (
        <View style={styles.toolbar}>
          {backVisible ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}>
              <MaterialIcons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      )}
      <View style={styles.accentRow}>
        <View style={[styles.accentBar, { backgroundColor: colors.primary }]} />
        <View style={[styles.accentBar, { backgroundColor: colors.logisticsAccent }]} />
        <View style={[styles.accentBar, { backgroundColor: colors.secondary }]} />
      </View>
      <Text
        style={[styles.title, variant === 'hero' && styles.titleHero, { color: colors.text }]}
        {...a11yHeader(title)}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
    },
    containerHero: {
      paddingBottom: spacing.md,
      backgroundColor: 'transparent',
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      minHeight: 40,
    },
    backButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.xs,
      borderRadius: borderRadius.round,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    backPlaceholder: {
      width: 40,
    },
    right: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    accentRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.md,
    },
    accentBar: {
      height: 4,
      width: 28,
      borderRadius: 999,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.extrabold,
      letterSpacing: -0.4,
    },
    titleHero: {
      fontSize: fontSize.xxxl,
      lineHeight: 34,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      lineHeight: 20,
    },
  });
