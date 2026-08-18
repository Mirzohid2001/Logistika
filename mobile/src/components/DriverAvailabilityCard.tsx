import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Geolocation from 'react-native-geolocation-service';
import { advertisementsService } from '../services/advertisementsService';
import { locationsService } from '../services/locationsService';
import { ensureForegroundLocationPermission } from '../services/locationTrackingService';
import { toastService } from '../services/toastService';
import { DriverAvailability } from '../types';
import { Card } from './Card';
import { useTranslation } from '../hooks/useTranslation';
import { borderRadius, fontSize, fontWeight, spacing } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { formatDateTime } from '../utils/formatLocale';
import { a11yButton } from '../utils/accessibility';

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

type StatusKey = 'available' | 'busy' | 'scheduled' | 'on_trip';

export const DriverAvailabilityCard: React.FC = () => {
  const { t, currentLanguage } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [data, setData] = useState<DriverAvailability | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await advertisementsService.getAvailability();
      setData(next && typeof next === 'object' ? next : null);
    } catch {
      setData(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const effective: StatusKey =
    data?.effective === 'on_trip' ||
    data?.effective === 'busy' ||
    data?.effective === 'scheduled' ||
    data?.effective === 'available'
      ? data.effective
      : 'available';

  const setStatus = async (status: 'available' | 'busy' | 'scheduled', availableFrom?: string) => {
    if (effective === 'on_trip' || saving) {
      return;
    }
    try {
      setSaving(true);
      const next = await advertisementsService.updateAvailability({
        status,
        available_from: availableFrom || null,
      });
      setData(next && typeof next === 'object' ? next : null);
    } catch {
      // Keep previous status.
    } finally {
      setSaving(false);
    }
  };

  const detectCityFromGps = async () => {
    if (locating || saving) {
      return;
    }
    try {
      setLocating(true);
      const granted = await ensureForegroundLocationPermission(t);
      if (!granted) {
        return;
      }
      const position = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        });
      });
      const nearest = await locationsService.getNearestCity(
        position.coords.latitude,
        position.coords.longitude,
        { maxKm: 120 },
      );
      const next = await advertisementsService.updateAvailability({
        current_city: nearest.id,
      });
      setData(next && typeof next === 'object' ? next : null);
      toastService.success(
        t('matching.availability.gpsCityFound', {
          city: nearest.name,
          km: nearest.distance_km,
        }),
      );
    } catch {
      toastService.error(t('matching.availability.gpsError'));
    } finally {
      setLocating(false);
    }
  };

  const tone = useMemo(() => {
    if (effective === 'available') {
      return { color: colors.success, bg: `${colors.success}18`, icon: 'check-circle' as const };
    }
    if (effective === 'on_trip') {
      return { color: colors.primary, bg: `${colors.primary}18`, icon: 'local-shipping' as const };
    }
    if (effective === 'scheduled') {
      return { color: colors.warning, bg: `${colors.warning}18`, icon: 'schedule' as const };
    }
    return { color: colors.textTertiary, bg: `${colors.textTertiary}18`, icon: 'pause-circle-filled' as const };
  }, [colors, effective]);

  const statusLabel =
    effective === 'on_trip'
      ? t('matching.availability.onTrip')
      : effective === 'busy'
        ? t('matching.availability.busy')
        : effective === 'scheduled'
          ? t('matching.availability.scheduled')
          : t('matching.availability.available');

  const freeFromLabel =
    typeof data?.available_from === 'string' && data.available_from
      ? formatDateTime(data.available_from, currentLanguage)
      : null;

  const options: Array<{
    key: 'available' | 'busy' | 'scheduled';
    label: string;
    active: boolean;
    onPress: () => void;
  }> = [
    {
      key: 'available',
      label: t('matching.availability.imFree'),
      active: effective === 'available',
      onPress: () => void setStatus('available'),
    },
    {
      key: 'busy',
      label: t('matching.availability.imBusy'),
      active: effective === 'busy',
      onPress: () => void setStatus('busy'),
    },
    {
      key: 'scheduled',
      label: t('matching.availability.freeIn2hShort'),
      active: effective === 'scheduled',
      onPress: () => void setStatus('scheduled', hoursFromNow(2)),
    },
  ];

  return (
    <Card variant="elevated" style={styles.card} padding="lg">
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
          <MaterialIcons name={tone.icon} size={22} color={tone.color} />
        </View>
        <View style={styles.topCopy}>
          <Text style={styles.kicker}>{t('matching.availability.title')}</Text>
          <Text style={styles.status} numberOfLines={2}>
            {statusLabel}
          </Text>
          {freeFromLabel ? (
            <Text style={styles.meta}>
              {t('matching.availability.freeFrom')}: {freeFromLabel}
            </Text>
          ) : null}
          <View style={styles.cityRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate('DriverLanes')}
              hitSlop={8}
              style={styles.cityLinkWrap}
              accessibilityRole="button">
              <Text style={styles.cityLink}>
                {data?.current_city
                  ? `${t('matching.availability.currentCity')}: ${data.current_city}`
                  : t('matching.availability.setCurrentCity')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void detectCityFromGps()}
              disabled={locating}
              hitSlop={8}
              accessibilityRole="button"
              {...a11yButton(t('matching.availability.useGps'))}>
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialIcons name="my-location" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
        {saving ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      {effective === 'on_trip' ? (
        <TouchableOpacity
          style={[styles.primaryAction, { backgroundColor: `${colors.primary}14` }]}
          onPress={() => navigation.navigate('DriverMatches')}
          activeOpacity={0.85}
          {...a11yButton(t('matching.availability.findReturn'))}>
          <MaterialIcons name="alt-route" size={18} color={colors.primary} />
          <Text style={[styles.primaryActionText, { color: colors.primary }]}>
            {t('matching.availability.findReturn')}
          </Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.track}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.trackItem, option.active && styles.trackItemActive]}
              onPress={option.onPress}
              disabled={saving}
              activeOpacity={0.85}
              {...a11yButton(option.label)}
              accessibilityState={{ selected: option.active, disabled: saving }}>
              <Text
                style={[styles.trackText, option.active && styles.trackTextActive]}
                numberOfLines={1}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('DriverLanes')}
          activeOpacity={0.85}
          {...a11yButton(t('matching.lanes.open'))}>
          <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}14` }]}>
            <MaterialIcons name="alt-route" size={16} color={colors.primary} />
          </View>
          <Text style={styles.actionLabel}>{t('matching.lanes.openShort')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
        <View style={styles.actionDivider} />
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('DriverMatches')}
          activeOpacity={0.85}
          {...a11yButton(t('matching.feed.title'))}>
          <View style={[styles.actionIcon, { backgroundColor: `${colors.logisticsAccent}14` }]}>
            <MaterialIcons name="local-offer" size={16} color={colors.logisticsAccent} />
          </View>
          <Text style={styles.actionLabel}>{t('matching.feed.openShort')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const createStyles = (colors: AppColors) => ({
  card: {
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  topCopy: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  status: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  meta: {
    marginTop: 2,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  cityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginTop: 4,
  },
  cityLinkWrap: {
    flex: 1,
  },
  cityLink: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  track: {
    marginTop: spacing.lg,
    flexDirection: 'row' as const,
    padding: 4,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  trackItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  trackItemActive: {
    backgroundColor: colors.primary,
  },
  trackText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  trackTextActive: {
    color: colors.textLight,
  },
  primaryAction: {
    marginTop: spacing.lg,
    minHeight: 44,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  primaryActionText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  actions: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  actionRow: {
    minHeight: 44,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  actionDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 36,
  },
});
