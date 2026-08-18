import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import { SkeletonCard } from '../Skeleton';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { formatShortDate, formatTrendCompact } from '../../utils/formatLocale';
import { a11yButton } from '../../utils/accessibility';

export function useDashboardStyles() {
  const dashboardStyles = useThemedStyles(createDashboardStyles);
  return { dashboardStyles };
}

export const DashboardLoading = () => {
  const styles = useThemedStyles(createWidgetStyles);
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
};

interface DashboardEmptyProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export const DashboardEmpty: React.FC<DashboardEmptyProps> = ({ title, message, retryLabel, onRetry }) => (
  <EmptyState variant="error" title={title} message={message} actionText={retryLabel} onActionPress={onRetry} />
);

interface PeriodSelectorProps {
  value: 7 | 30 | 90;
  onChange: (days: 7 | 30 | 90) => void;
  labelForDays: (days: number) => string;
  accentColor?: string;
}

export const DashboardPeriodSelector: React.FC<PeriodSelectorProps> = ({
  value,
  onChange,
  labelForDays,
  accentColor,
}) => {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createWidgetStyles);
  const accent = accentColor ?? colors.primary;

  return (
    <View style={styles.periodRow}>
      {([7, 30, 90] as const).map((days) => (
        <TouchableOpacity
          key={days}
          style={[
            styles.periodChip,
            value === days && { backgroundColor: accent, borderColor: accent, ...shadows.colored(accent) },
          ]}
          onPress={() => onChange(days)}
          {...a11yButton(labelForDays(days))}
          accessibilityState={{ selected: value === days }}>
          <Text style={[styles.periodChipText, value === days && styles.periodChipTextActive]}>
            {labelForDays(days)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

interface StatCardProps {
  icon: string;
  iconColor: string;
  value: string;
  label: string;
}

export const DashboardWelcomeCard: React.FC<{
  title: string;
  subtitle: string;
  accentColor: string;
  style?: object;
}> = ({ title, subtitle, accentColor, style }) => {
  const styles = useThemedStyles(createDashboardStyles);
  return (
    <Card variant="elevated" style={[styles.welcomeCard, { backgroundColor: accentColor }, style]}>
      <View style={styles.welcomeOrbLarge} />
      <View style={styles.welcomeOrbSmall} />
      <Text style={styles.welcomeText}>{title}</Text>
      <Text style={styles.welcomeSubtext}>{subtitle}</Text>
    </Card>
  );
};

export const DashboardStatCard: React.FC<StatCardProps> = ({ icon, iconColor, value, label }) => {
  const styles = useThemedStyles(createWidgetStyles);
  return (
    <Card variant="elevated" style={styles.statCard} padding="md">
      <View style={[styles.statIconContainer, { backgroundColor: `${iconColor}18` }]}>
        <MaterialIcons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
};

interface ActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  accentColor?: string;
}

export const DashboardActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
  variant = 'primary',
  accentColor,
}) => {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createWidgetStyles);
  const accent = accentColor ?? colors.primary;

  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        variant === 'primary' && { backgroundColor: accent, ...shadows.colored(accent) },
        variant === 'secondary' && { ...styles.actionButtonSecondary, borderColor: accent },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      {...a11yButton(label)}>
      <MaterialIcons
        name={icon}
        size={22}
        color={variant === 'secondary' ? accent : colors.textLight}
      />
      <Text
        style={[
          styles.actionButtonText,
          variant === 'secondary' && { ...styles.actionButtonTextSecondary, color: accent },
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export interface TrendItem {
  date: string;
  value: number;
}

interface TrendCardProps {
  title: string;
  items: TrendItem[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  detailText?: string;
  detailActionLabel?: string;
  onDetailAction?: () => void;
  language: string;
  accentColor?: string;
  emptyMessage?: string;
  maxVisibleItems?: number;
}

export const DashboardTrendCard: React.FC<TrendCardProps> = ({
  title,
  items,
  selectedDate,
  onSelectDate,
  detailText,
  detailActionLabel,
  onDetailAction,
  language,
  accentColor,
  emptyMessage,
  maxVisibleItems = 7,
}) => {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createWidgetStyles);
  const accent = accentColor ?? colors.primary;
  const hasData = items.some((item) => item.value > 0);
  const visibleItems = hasData ? items.slice(-maxVisibleItems) : [];
  const max = Math.max(...visibleItems.map((item) => item.value), 1);

  return (
    <Card variant="soft" style={styles.quickStatsCard}>
      <Text style={styles.cardTitle}>{title}</Text>
      {!hasData && emptyMessage ? (
        <View style={styles.trendEmptyBox}>
          <MaterialIcons name="insights" size={28} color={colors.textTertiary} />
          <Text style={styles.trendEmptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.trendWrap}>
          {visibleItems.map((item) => (
            <TouchableOpacity
              key={item.date}
              style={styles.trendRow}
              onPress={() => onSelectDate(item.date)}
              {...a11yButton(`${formatShortDate(item.date, language)} ${item.value}`)}>
              <Text style={styles.trendLabel}>{formatShortDate(item.date, language)}</Text>
              <View style={styles.trendTrack}>
                <View
                  style={[
                    styles.trendFill,
                    { width: `${(item.value / max) * 100}%`, backgroundColor: `${accent}66` },
                    selectedDate === item.date && { backgroundColor: accent },
                  ]}
                />
              </View>
              <Text style={styles.trendValue}>{formatTrendCompact(item.value)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {detailText && (
        <View style={[styles.trendDetailBox, { backgroundColor: `${accent}12` }]}>
          <Text style={styles.trendDetailText}>{detailText}</Text>
          {detailActionLabel && onDetailAction && (
            <TouchableOpacity
              style={[styles.trendDetailButton, { backgroundColor: accent }]}
              onPress={onDetailAction}
              {...a11yButton(detailActionLabel)}>
              <Text style={styles.trendDetailButtonText}>{detailActionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Card>
  );
};

const createDashboardStyles = (colors: AppColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxxl + 24,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.warningGlow,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: `${colors.warning}44`,
    },
    warningText: {
      flex: 1,
      color: colors.warning,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    updatedAtText: {
      fontSize: fontSize.sm,
      color: colors.textTertiary,
      marginBottom: spacing.md,
      fontWeight: fontWeight.medium,
    },
    toolbar: {
      marginBottom: spacing.lg,
    },
    toolbarMeta: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      textAlign: 'right',
      marginTop: spacing.xs,
      fontWeight: fontWeight.medium,
    },
    heroCard: {
      marginBottom: spacing.lg,
      padding: spacing.xxl,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      position: 'relative',
    },
    heroOrbLarge: {
      position: 'absolute',
      top: -30,
      right: -20,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    heroOrbSmall: {
      position: 'absolute',
      bottom: -20,
      left: -10,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    heroScreenTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.textLight,
      opacity: 0.85,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    heroGreeting: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.extrabold,
      color: colors.textLight,
      marginBottom: spacing.xs,
      letterSpacing: -0.3,
    },
    heroSubtitle: {
      fontSize: fontSize.md,
      color: colors.textLight,
      opacity: 0.92,
      lineHeight: 22,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.round,
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    heroBadgeText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.textLight,
    },
    welcomeCard: {
      marginBottom: spacing.lg,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      position: 'relative',
    },
    welcomeOrbLarge: {
      position: 'absolute',
      top: -30,
      right: -20,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    welcomeOrbSmall: {
      position: 'absolute',
      bottom: -20,
      left: -10,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    welcomeText: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.extrabold,
      color: colors.textLight,
      marginBottom: spacing.xs,
      letterSpacing: -0.3,
    },
    welcomeSubtext: {
      fontSize: fontSize.md,
      color: colors.textLight,
      opacity: 0.92,
      lineHeight: 22,
    },
    snapshotCard: {
      marginBottom: spacing.lg,
    },
    snapshotRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    snapshotTile: {
      flex: 1,
    },
    snapshotDivider: {
      width: 1,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    snapshotIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    snapshotLabel: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      fontWeight: fontWeight.medium,
    },
    snapshotValue: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.text,
      letterSpacing: -0.2,
    },
    actionSection: {
      marginBottom: spacing.xl,
    },
    actionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    actionGridCell: {
      width: '47%',
      flexGrow: 1,
      minWidth: '46%',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    quickStatsCard: {
      marginBottom: spacing.lg,
    },
    cardTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.lg,
      letterSpacing: -0.2,
    },
    quickStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    quickStatItem: {
      flex: 1,
    },
    quickStatDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    quickStatLabel: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    quickStatValue: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    actions: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.textTertiary,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    seeAllText: {
      fontSize: fontSize.sm,
      color: colors.primary,
      fontWeight: fontWeight.semibold,
    },
    recentCard: {
      marginBottom: spacing.lg,
    },
    recentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    recentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    recentItemContent: {
      flex: 1,
    },
    recentItemTitle: {
      fontSize: fontSize.base,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    recentItemStatus: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      fontWeight: fontWeight.semibold,
    },
  });

const createWidgetStyles = (colors: AppColors) =>
  StyleSheet.create({
    skeletonWrap: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    periodRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    periodChip: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.round,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderLight,
      alignItems: 'center',
      minHeight: 40,
      justifyContent: 'center',
    },
    periodChipText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.textSecondary,
    },
    periodChipTextActive: {
      color: colors.textLight,
    },
    statCard: {
      width: '48%',
      flexGrow: 1,
      minWidth: '46%',
      marginVertical: 0,
    },
    statIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    statValue: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.extrabold,
      color: colors.text,
      marginBottom: 2,
      letterSpacing: -0.2,
    },
    statLabel: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      fontWeight: fontWeight.semibold,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.lg,
      minHeight: 52,
    },
    actionButtonSecondary: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1.5,
    },
    actionButtonText: {
      color: colors.textLight,
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
    },
    actionButtonTextSecondary: {},
    quickStatsCard: {
      marginBottom: spacing.lg,
      marginVertical: spacing.sm,
    },
    cardTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.lg,
      letterSpacing: -0.2,
    },
    trendWrap: {
      gap: spacing.xs,
    },
    trendEmptyBox: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    trendEmptyText: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: spacing.md,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    trendLabel: {
      width: 54,
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      fontWeight: fontWeight.medium,
    },
    trendTrack: {
      flex: 1,
      height: 8,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: borderRadius.round,
      overflow: 'hidden',
    },
    trendFill: {
      height: '100%',
      borderRadius: borderRadius.round,
    },
    trendValue: {
      width: 36,
      textAlign: 'right',
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      fontWeight: fontWeight.bold,
    },
    trendDetailBox: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: borderRadius.md,
    },
    trendDetailText: {
      fontSize: fontSize.sm,
      color: colors.text,
      marginBottom: spacing.sm,
      lineHeight: 20,
    },
    trendDetailButton: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.round,
      minHeight: 40,
      justifyContent: 'center',
    },
    trendDetailButtonText: {
      color: colors.textLight,
      fontWeight: fontWeight.bold,
      fontSize: fontSize.sm,
    },
  });
