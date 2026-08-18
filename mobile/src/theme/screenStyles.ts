import { StyleSheet } from 'react-native';
import { colors as lightColors } from './colors';
import { spacing, borderRadius } from './spacing';

type ThemeColors = typeof lightColors;

export const createScreenStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screenPadded: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    section: {
      marginBottom: spacing.xl,
    },
    accentOrb: {
      position: 'absolute',
      top: -80,
      right: -40,
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: colors.primaryGlow,
      opacity: 0.55,
    },
    accentOrbSecondary: {
      position: 'absolute',
      top: 40,
      left: -60,
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: colors.accentGlow,
      opacity: 0.35,
    },
    filterRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    filterPill: {
      flex: 1,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.round,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.borderLight,
      minHeight: 44,
      justifyContent: 'center',
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterPillText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    filterPillTextActive: {
      color: colors.textLight,
    },
  });
