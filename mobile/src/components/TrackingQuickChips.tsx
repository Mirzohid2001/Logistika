import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../hooks/useTranslation';
import { Order } from '../types';
import { formatDurationMinutes } from '../utils/trackStops';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

interface TrackingQuickChipsProps {
  trackingSummary?: Order['tracking_summary'];
  estimatedEtaMinutes?: number | null;
}

export const TrackingQuickChips: React.FC<TrackingQuickChipsProps> = ({
  trackingSummary,
  estimatedEtaMinutes,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  if (!trackingSummary) {return null;}

  const statusColor =
    trackingSummary.status === 'stopped'
      ? colors.warning
      : trackingSummary.status === 'moving'
        ? colors.success
        : colors.textTertiary;

  const statusLabel =
    trackingSummary.status === 'stopped'
      ? t('tracking.statusStopped')
      : trackingSummary.status === 'moving'
        ? t('tracking.statusMoving')
        : t('tracking.statusUnknown');

  return (
    <View style={styles.row}>
      <View style={[styles.chip, { backgroundColor: `${statusColor}18` }]}>
        <MaterialIcons
          name={trackingSummary.status === 'stopped' ? 'pause-circle-filled' : 'local-shipping'}
          size={14}
          color={statusColor}
        />
        <Text style={[styles.chipText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      {estimatedEtaMinutes != null && (
        <View style={styles.chip}>
          <MaterialIcons name="schedule" size={14} color={colors.primary} />
          <Text style={styles.chipText}>ETA {estimatedEtaMinutes} min</Text>
        </View>
      )}
      {(trackingSummary.stop_count ?? 0) > 0 && (
        <View style={styles.chip}>
          <MaterialIcons name="place" size={14} color={colors.textSecondary} />
          <Text style={styles.chipText}>
            {trackingSummary.stop_count} ·{' '}
            {formatDurationMinutes(trackingSummary.total_stop_minutes ?? 0, t)}
          </Text>
        </View>
      )}
      {!!trackingSummary.alert_level && (
        <View
          style={[
            styles.chip,
            trackingSummary.alert_level === 'critical' ? styles.chipCritical : styles.chipWarning,
          ]}>
          <MaterialIcons name="warning" size={14} color={trackingSummary.alert_level === 'critical' ? colors.danger : colors.warning} />
          <Text
            style={[
              styles.chipText,
              trackingSummary.alert_level === 'critical' ? styles.chipTextCritical : styles.chipTextWarning,
            ]}
            numberOfLines={1}>
            {trackingSummary.alert_message || t('tracking.longStopAlertDriver')}
          </Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.round,
    backgroundColor: colors.background,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flexShrink: 1,
  },
  chipWarning: {
    backgroundColor: colors.warningGlow,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  chipCritical: {
    backgroundColor: colors.dangerGlow,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  chipTextWarning: {
    color: colors.warning,
  },
  chipTextCritical: {
    color: colors.danger,
  },
});
