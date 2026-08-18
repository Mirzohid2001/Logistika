import { StyleSheet } from 'react-native';
import { spacing, fontSize, fontWeight, borderRadius, shadows } from './spacing';
import { colors as lightColors } from './colors';

type ThemeColors = typeof lightColors;

export const createListScreenStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContainer: {
      padding: spacing.lg,
      paddingBottom: spacing.xxxl + 24,
    },
    emptyContainer: {
      flex: 1,
    },
    skeletonWrap: {
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.colored(colors.primaryDark),
    },
    avatarText: {
      color: colors.textLight,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
    },
    rowContent: {
      flex: 1,
    },
    rowTitle: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.xs,
      letterSpacing: -0.2,
    },
    rowSubtitle: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    rowMeta: {
      fontSize: fontSize.sm,
      color: colors.textTertiary,
      marginTop: spacing.xs,
    },
    chevron: {
      fontSize: fontSize.xxl,
      color: colors.textTertiary,
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    listTitle: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.bold,
      color: colors.text,
      letterSpacing: -0.2,
    },
    statusBadge: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: borderRadius.round,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    statusText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      letterSpacing: 0.2,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xs,
      gap: spacing.xs,
    },
    ratingValue: {
      fontSize: fontSize.sm,
      color: colors.rating,
      fontWeight: fontWeight.bold,
    },
    ratingCount: {
      fontSize: fontSize.sm,
      color: colors.textTertiary,
    },
  });
