import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../hooks/useTranslation';
import { useLiveStopDuration } from '../hooks/useLiveStopDuration';
import { Order } from '../types';
import { formatDurationMinutes } from '../utils/trackStops';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

interface TrackingStatsPanelProps {
  order: Order;
  compact?: boolean;
}

export const TrackingStatsPanel: React.FC<TrackingStatsPanelProps> = ({ order, compact }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const summary = order.tracking_summary;
  const distance = order.distance_summary ?? {
    planned_distance_km: summary?.planned_distance_km,
    tracked_distance_km: summary?.tracked_distance_km,
    loaded_distance_km: summary?.loaded_distance_km,
    deadhead_distance_km: summary?.deadhead_distance_km,
    distance_delta_km: summary?.distance_delta_km,
    is_final: summary?.is_final,
  };
  const hasDistance =
    (distance.tracked_distance_km != null && distance.tracked_distance_km > 0) ||
    (distance.planned_distance_km != null && distance.planned_distance_km > 0);
  if (!summary && !hasDistance) return null;

  const liveStopMinutes = useLiveStopDuration(summary?.current_stop_started_at, summary?.status);
  const currentStopDisplay =
    summary?.status === 'stopped' && liveStopMinutes != null
      ? liveStopMinutes
      : summary?.last_stop_minutes;

  const statusLabel =
    summary?.status === 'stopped'
      ? t('tracking.statusStopped')
      : summary?.status === 'moving'
        ? t('tracking.statusMoving')
        : t('tracking.statusUnknown');

  const statusColor =
    summary?.status === 'stopped'
      ? colors.warning
      : summary?.status === 'moving'
        ? colors.success
        : colors.textTertiary;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {!!summary && (
      <View style={styles.statusRow}>
        <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
          <MaterialIcons
            name={summary?.status === 'stopped' ? 'pause-circle-filled' : summary?.status === 'moving' ? 'local-shipping' : 'help-outline'}
            size={16}
            color={statusColor}
          />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {summary?.speed_kmh != null && (
          <Text style={styles.speedText}>
            {Math.round(summary.speed_kmh)} {t('tracking.kmh')}
          </Text>
        )}
      </View>
      )}

      {!!summary && summary.progress_percent != null && (
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{t('tracking.routeProgress')}</Text>
            <Text style={styles.progressValue}>{summary.progress_percent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${summary.progress_percent}%` }]} />
          </View>
        </View>
      )}

      <View style={styles.grid}>
        {!!summary && order.estimated_eta_minutes != null && (
          <StatItem icon="schedule" label="ETA" value={`${order.estimated_eta_minutes} min`} />
        )}
        {!!summary && summary.remaining_distance_km != null && (
          <StatItem
            icon="straighten"
            label={t('tracking.remainingDistance')}
            value={`${summary.remaining_distance_km} km`}
          />
        )}
        {distance.tracked_distance_km != null && distance.tracked_distance_km > 0 && (
          <StatItem
            icon="route"
            label={distance.is_final ? t('tracking.trackedDistanceFinal') : t('tracking.trackedDistance')}
            value={`${distance.tracked_distance_km} km`}
          />
        )}
        {distance.loaded_distance_km != null && distance.loaded_distance_km > 0 && (
          <StatItem
            icon="local-shipping"
            label={t('tracking.loadedDistance')}
            value={`${distance.loaded_distance_km} km`}
          />
        )}
        {distance.deadhead_distance_km != null && distance.deadhead_distance_km > 0 && (
          <StatItem
            icon="directions-car"
            label={t('tracking.deadheadDistance')}
            value={`${distance.deadhead_distance_km} km`}
          />
        )}
        {distance.planned_distance_km != null && distance.planned_distance_km > 0 && (
          <StatItem
            icon="map"
            label={t('tracking.plannedDistance')}
            value={`${distance.planned_distance_km} km`}
          />
        )}
        {distance.distance_delta_km != null && !compact && Math.abs(distance.distance_delta_km) >= 0.1 && (
          <StatItem
            icon="compare-arrows"
            label={t('tracking.distanceDelta')}
            value={`${distance.distance_delta_km > 0 ? '+' : ''}${distance.distance_delta_km} km`}
          />
        )}
        {(summary?.stop_count ?? 0) > 0 && (
          <StatItem icon="place" label={t('tracking.stopsCount')} value={String(summary?.stop_count)} />
        )}
        {(summary?.total_stop_minutes ?? 0) > 0 && (
          <StatItem
            icon="timer"
            label={t('tracking.totalStop')}
            value={formatDurationMinutes(summary?.total_stop_minutes ?? 0, t)}
          />
        )}
        {currentStopDisplay != null && currentStopDisplay > 0 && summary?.status === 'stopped' && (
          <StatItem
            icon="pause"
            label={t('tracking.currentStop')}
            value={formatDurationMinutes(currentStopDisplay, t)}
            highlight
          />
        )}
        {(summary?.longest_stop_minutes ?? 0) > 0 && !compact && (
          <StatItem
            icon="av-timer"
            label={t('tracking.longestStop')}
            value={formatDurationMinutes(summary?.longest_stop_minutes ?? 0, t)}
          />
        )}
        {(summary?.total_moving_minutes ?? 0) > 0 && !compact && (
          <StatItem
            icon="directions-car"
            label={t('tracking.totalMoving')}
            value={formatDurationMinutes(summary?.total_moving_minutes ?? 0, t)}
          />
        )}
      </View>
    </View>
  );
};

const StatItem = ({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();

  return (
    <View style={[styles.statItem, highlight && styles.statItemHighlight]}>
      <MaterialIcons name={icon} size={18} color={highlight ? colors.warning : colors.primary} />
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  containerCompact: {
    gap: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.round,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  speedText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  progressBlock: {
    marginTop: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  progressValue: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statItem: {
    width: '47%',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 2,
  },
  statItemHighlight: {
    backgroundColor: colors.warningGlow,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  statValueHighlight: {
    color: colors.warning,
  },
});
