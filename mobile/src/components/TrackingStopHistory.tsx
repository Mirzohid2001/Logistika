import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../hooks/useTranslation';
import { OrderLocationTrack } from '../types';
import { deriveStopSegmentsFromTracks, formatDurationMinutes } from '../utils/trackStops';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

interface TrackingStopHistoryProps {
  tracks: OrderLocationTrack[];
  maxItems?: number;
}

export const TrackingStopHistory: React.FC<TrackingStopHistoryProps> = ({ tracks, maxItems = 8 }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t, currentLanguage } = useTranslation();
  const stops = useMemo(() => deriveStopSegmentsFromTracks(tracks).slice(0, maxItems), [tracks, maxItems]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const openOnMap = (lat: number, lng: number) => {
    const url = Platform.select({
      ios: `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=16`,
      android: `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=16`,
    });
    if (!url) return;
    Linking.canOpenURL(url).then((ok) => {
      Linking.openURL(ok ? url : `https://yandex.ru/maps/?pt=${lng},${lat}&z=16`);
    });
  };

  if (stops.length === 0) {
    return <Text style={styles.empty}>{t('tracking.noStopsYet')}</Text>;
  }

  return (
    <View style={styles.list}>
      {stops.map((stop, index) => (
        <TouchableOpacity
          key={`${stop.startedAt}-${index}`}
          style={[styles.item, stop.isOngoing && styles.itemOngoing]}
          onPress={() => openOnMap(stop.lat, stop.lng)}
          activeOpacity={0.8}>
          <View style={styles.itemHeader}>
            <View style={styles.itemTitleRow}>
              <MaterialIcons
                name={stop.isOngoing ? 'pause-circle-filled' : 'place'}
                size={18}
                color={stop.isOngoing ? colors.warning : colors.textSecondary}
              />
              <Text style={styles.itemTitle}>
                {stop.isOngoing ? t('tracking.currentStop') : t('tracking.stopNumber', { n: stops.length - index })}
              </Text>
            </View>
            <Text style={[styles.duration, stop.isOngoing && styles.durationOngoing]}>
              {formatDurationMinutes(stop.durationMinutes, t)}
              {stop.isOngoing ? ` · ${t('tracking.ongoing')}` : ''}
            </Text>
          </View>
          <Text style={styles.timeText}>
            {formatTime(stop.startedAt)}
            {stop.endedAt ? ` → ${formatTime(stop.endedAt)}` : ''}
          </Text>
          <Text style={styles.coords}>
            {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  item: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemOngoing: {
    borderColor: colors.warning,
    backgroundColor: colors.warningGlow,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: spacing.sm,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  itemTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flexShrink: 1,
  },
  duration: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  durationOngoing: {
    color: colors.warning,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  coords: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
});
