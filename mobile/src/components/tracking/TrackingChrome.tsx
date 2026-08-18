import React, { ReactNode, useContext } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { FLOATING_TAB_BAR_BOTTOM } from '../../theme/navigation';

const SHEET_MAX_COLLAPSED = 400;
const SHEET_MAX_EXPANDED = 560;
const SHEET_HANDLE_HEIGHT = 18;
const SHEET_EXPAND_ROW_HEIGHT = 48;
const SHEET_TAB_GAP = 8;

interface TrackingBottomSheetProps {
  children: ReactNode;
  expanded?: boolean;
  onToggleExpand?: () => void;
  expandLabel?: string;
  collapseLabel?: string;
}

export const TrackingBottomSheet: React.FC<TrackingBottomSheetProps> = ({
  children,
  expanded = false,
  onToggleExpand,
  expandLabel,
  collapseLabel,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const bottomClearance =
    typeof tabBarHeight === 'number' && tabBarHeight > 0
      ? tabBarHeight + FLOATING_TAB_BAR_BOTTOM + SHEET_TAB_GAP
      : Math.max(insets.bottom, SHEET_TAB_GAP);

  const sheetMaxHeight = expanded ? SHEET_MAX_EXPANDED : SHEET_MAX_COLLAPSED;
  const chromeHeight = SHEET_HANDLE_HEIGHT + (onToggleExpand ? SHEET_EXPAND_ROW_HEIGHT : 0);

  return (
    <View style={[styles.sheetAnchor, { bottom: bottomClearance, maxHeight: sheetMaxHeight }]}>
      <View style={styles.sheetInner}>
        <View style={styles.handle} />
        <View style={styles.handle} />
        <ScrollView
          style={[styles.scroll, { maxHeight: sheetMaxHeight - chromeHeight }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled>
          {children}
        </ScrollView>
        {onToggleExpand ? (
          <TouchableOpacity style={styles.expandRow} onPress={onToggleExpand} activeOpacity={0.8}>
            <Text style={styles.expandText}>{expanded ? collapseLabel : expandLabel}</Text>
            <MaterialIcons
              name={expanded ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

interface TrackingPhaseBadgeProps {
  label: string;
  icon?: 'flag' | 'shipping' | 'location';
}

export const TrackingPhaseBadge: React.FC<TrackingPhaseBadgeProps> = ({ label, icon = 'shipping' }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const iconName =
    icon === 'flag' ? 'flag' : icon === 'location' ? 'my-location' : 'local-shipping';
  return (
    <View style={styles.phaseBadge}>
      <MaterialIcons name={iconName} size={16} color={colors.primary} />
      <Text style={styles.phaseText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

interface TrackingOrderSummaryProps {
  orderId: number;
  title?: string;
  subtitle?: string;
  statusLabel?: string;
  statusColor?: string;
  meta?: string;
}

export const TrackingOrderSummary: React.FC<TrackingOrderSummaryProps> = ({
  orderId,
  title,
  subtitle,
  statusLabel,
  statusColor,
  meta,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const resolvedStatusColor = statusColor ?? colors.primary;

  return (
    <View style={styles.summary}>
      <View style={styles.summaryTop}>
        <Text style={styles.summaryOrder}>#{orderId}</Text>
        {statusLabel ? (
          <View style={[styles.summaryStatus, { backgroundColor: `${resolvedStatusColor}18` }]}>
            <View style={[styles.summaryStatusDot, { backgroundColor: resolvedStatusColor }]} />
            <Text style={[styles.summaryStatusText, { color: resolvedStatusColor }]}>{statusLabel}</Text>
          </View>
        ) : null}
      </View>
      {title ? <Text style={styles.summaryTitle} numberOfLines={1}>{title}</Text> : null}
      {subtitle ? <Text style={styles.summarySubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      {meta ? <Text style={styles.summaryMeta}>{meta}</Text> : null}
    </View>
  );
};

interface TrackingTripActionBarProps {
  children: ReactNode;
  hint?: string;
}

export const TrackingTripActionBar: React.FC<TrackingTripActionBarProps> = ({ children, hint }) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.tripActions}>
      {children}
      {hint ? <Text style={styles.tripHint}>{hint}</Text> : null}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    sheetAnchor: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: SHEET_MAX_COLLAPSED,
    },
    sheetInner: {
      overflow: 'hidden',
      backgroundColor: colors.backgroundSecondary,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      borderBottomLeftRadius: borderRadius.xl,
      borderBottomRightRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    scroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      gap: spacing.md,
    },
    expandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    expandText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primary,
    },
    phaseBadge: {
      position: 'absolute',
      top: spacing.md,
      alignSelf: 'center',
      maxWidth: '82%',
      zIndex: 3,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: borderRadius.round,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    phaseText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      flexShrink: 1,
    },
    summary: {
      gap: spacing.xs,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    summaryTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    summaryOrder: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    summaryStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.round,
    },
    summaryStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    summaryStatusText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
    },
    summaryTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    summarySubtitle: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    summaryMeta: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
    tripActions: {
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    tripHint: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
