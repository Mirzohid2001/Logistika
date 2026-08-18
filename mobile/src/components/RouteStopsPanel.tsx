import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { Order, OrderRouteStop } from '../types';
import { Button } from './Button';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import {
  formatRouteMetrics,
  getActiveRouteStop,
  getSortedRouteStops,
  routeStopsWithCoordinates,
  canManuallyCompleteStop,
  canSkipStop,
  stopToLatLng,
} from '../utils/routeStops';

interface RouteStopsPanelProps {
  order?: Order | null;
  stops: OrderRouteStop[];
  onOptimize?: () => void;
  onCompleteStop?: (stop: OrderRouteStop) => void;
  onSkipStop?: (stop: OrderRouteStop) => void;
  onNavigateStop?: (stop: OrderRouteStop) => void;
  onManageStops?: () => void;
  onOpenSettings?: () => void;
  optimizing?: boolean;
  actionLoading?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  showDriverActions?: boolean;
  embedded?: boolean;
}

type StopStatus = OrderRouteStop['status'];

function statusPalette(status: StopStatus, isActive: boolean, colors: AppColors) {
  if (status === 'completed') {
    return { bg: colors.successGlow, text: colors.success, dot: colors.success, border: colors.success };
  }
  if (status === 'arrived') {
    return { bg: colors.warningGlow, text: colors.warning, dot: colors.warning, border: colors.warning };
  }
  if (status === 'skipped') {
    return { bg: colors.backgroundSecondary, text: colors.textTertiary, dot: colors.textTertiary, border: colors.border };
  }
  if (isActive) {
    return { bg: colors.primaryGlow, text: colors.primary, dot: colors.primary, border: colors.primary };
  }
  return { bg: colors.backgroundSecondary, text: colors.textSecondary, dot: colors.border, border: colors.borderLight };
}

export const RouteStopsPanel: React.FC<RouteStopsPanelProps> = ({
  order,
  stops,
  onOptimize,
  onCompleteStop,
  onSkipStop,
  onNavigateStop,
  onManageStops,
  onOpenSettings,
  optimizing = false,
  actionLoading = false,
  t,
  showDriverActions = false,
  embedded = false,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const sorted = getSortedRouteStops(stops);
  if (!sorted.length || !order) return null;

  const activeStop = getActiveRouteStop(sorted);
  const metrics = formatRouteMetrics(order);
  const canOptimize = showDriverActions && routeStopsWithCoordinates(sorted).length >= 2;
  const completedCount = sorted.filter((stop) => stop.status === 'completed').length;
  const progressRatio = sorted.length > 0 ? completedCount / sorted.length : 0;

  const showActionBar = useMemo(
    () =>
      showDriverActions &&
      !!activeStop &&
      activeStop.status !== 'completed' &&
      activeStop.status !== 'skipped',
    [showDriverActions, activeStop],
  );

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{t('tracking.routeStopsTitle')}</Text>
          {metrics ? <Text style={styles.metrics}>{metrics}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>
              {t('tracking.stopsProgress', { completed: completedCount, total: sorted.length })}
            </Text>
          </View>
          {onManageStops ? (
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={onManageStops}
              accessibilityRole="button"
              accessibilityLabel={t('tracking.routeStopManage.openShort')}>
              <MaterialIcons name="edit-location-alt" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
          {onOpenSettings ? (
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel={t('tracking.routePlan.openShort')}>
              <MaterialIcons name="tune" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progressRatio * 100)}%` }]} />
      </View>

      {order.route_optimization_provider ? (
        <Text style={styles.provider}>
          {t('tracking.routeProvider', { provider: order.route_optimization_provider })}
        </Text>
      ) : null}

      <View style={styles.timeline}>
        {sorted.map((stop, index) => {
          const isActive = activeStop?.id === stop.id;
          const palette = statusPalette(stop.status, isActive, colors);
          const isLast = index === sorted.length - 1;
          const stopTitle =
            stop.label ||
            (stop.stop_type === 'pickup' ? t('tracking.stopPickup') : t('tracking.stopDelivery'));

          return (
            <View key={stop.id} style={styles.timelineRow}>
              <View style={styles.railColumn}>
                <View
                  style={[
                    styles.railDot,
                    { backgroundColor: palette.dot, borderColor: palette.border },
                    isActive && styles.railDotActive,
                  ]}>
                  {stop.status === 'completed' ? (
                    <MaterialIcons name="check" size={12} color={colors.textLight} />
                  ) : (
                    <Text style={styles.railDotText}>{stop.sequence}</Text>
                  )}
                </View>
                {!isLast ? <View style={[styles.railLine, stop.status === 'completed' && styles.railLineDone]} /> : null}
              </View>

              <View
                style={[
                  styles.stopCard,
                  isActive && styles.stopCardActive,
                  { borderColor: isActive ? palette.border : colors.borderLight },
                ]}>
                <View style={styles.stopCardHeader}>
                  <View style={styles.stopTitleWrap}>
                    <Text style={styles.stopLabel}>{stopTitle}</Text>
                    {isActive ? (
                      <Text style={styles.activeHint}>{t('tracking.activeStopLabel')}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: palette.bg }]}>
                    <Text style={[styles.statusPillText, { color: palette.text }]}>
                      {t(`tracking.stopStatus.${stop.status}`)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.stopAddress} numberOfLines={2}>
                  {stop.address}
                </Text>
                {stop.status === 'skipped' && stop.notes ? (
                  <Text style={styles.skipNotes} numberOfLines={2}>
                    {stop.notes.replace(/^\[skip:[^\]]+\]\s*/, '')}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {showActionBar && activeStop ? (
        <View style={styles.actionBar}>
          {onNavigateStop ? (
            <TouchableOpacity
              style={styles.navIconButton}
              onPress={() => onNavigateStop(activeStop)}
              activeOpacity={0.85}>
              <MaterialIcons name="navigation" size={22} color={colors.primary} />
              <Text style={styles.navIconLabel}>{t('tracking.navigateToStop')}</Text>
            </TouchableOpacity>
          ) : null}
          {onCompleteStop ? (
            <Button
              title={
                activeStop.stop_type === 'pickup'
                  ? t('orders.poexali')
                  : t('tracking.completeStop')
              }
              onPress={() => onCompleteStop(activeStop)}
              loading={actionLoading}
              variant="primary"
              style={styles.completeButton}
              size="md"
              disabled={!canManuallyCompleteStop(activeStop)}
            />
          ) : null}
          {onSkipStop && canSkipStop(activeStop, sorted) ? (
            <Button
              title={t('tracking.skipStop')}
              onPress={() => onSkipStop(activeStop)}
              loading={actionLoading}
              variant="outline"
              style={styles.skipButton}
              size="md"
            />
          ) : null}
        </View>
      ) : null}
      {showActionBar && activeStop && onCompleteStop && !canManuallyCompleteStop(activeStop) ? (
        <Text style={styles.arriveHint}>
          {!stopToLatLng(activeStop) && canSkipStop(activeStop, sorted)
            ? t('tracking.noCoordsCanSkip')
            : !stopToLatLng(activeStop)
              ? t('tracking.noCoordsNeedDispatcher')
              : t('tracking.arriveBeforeAction')}
        </Text>
      ) : null}

      {canOptimize && onOptimize ? (
        <Button
          title={t('tracking.optimizeRoute')}
          onPress={onOptimize}
          loading={optimizing}
          variant="outline"
          style={styles.optimizeButton}
          size="sm"
        />
      ) : null}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  containerEmbedded: {
    marginTop: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  metrics: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressBadge: {
    backgroundColor: colors.primaryGlow,
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: `${colors.primary}33`,
  },
  progressBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  progressTrack: {
    height: 6,
    borderRadius: borderRadius.round,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.round,
    backgroundColor: colors.primary,
  },
  provider: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  timeline: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  railColumn: {
    width: 28,
    alignItems: 'center',
  },
  railDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
  },
  railDotActive: {
    borderWidth: 2,
  },
  railDotText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  railLine: {
    flex: 1,
    width: 2,
    minHeight: 24,
    marginTop: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 1,
  },
  railLineDone: {
    backgroundColor: colors.success,
    opacity: 0.45,
  },
  stopCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    marginBottom: spacing.xs,
  },
  stopCardActive: {
    backgroundColor: colors.surfaceMuted,
  },
  stopCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  stopTitleWrap: {
    flex: 1,
  },
  stopLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  activeHint: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  stopAddress: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  skipNotes: {
    marginTop: 4,
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  arriveHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  navIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  navIconLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginTop: 2,
  },
  completeButton: {
    flex: 1,
    marginBottom: 0,
  },
  skipButton: {
    flex: 1,
    marginBottom: 0,
  },
  optimizeButton: {
    marginTop: spacing.xs,
  },
});
