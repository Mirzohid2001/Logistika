import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { advertisementsService } from '../services/advertisementsService';
import { TripProfitEstimate } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { formatMoney } from '../utils/formatLocale';

interface TripProfitCardProps {
  advertisementId: number;
  amount?: string | number | null;
}

export const TripProfitCard: React.FC<TripProfitCardProps> = ({ advertisementId, amount }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t, currentLanguage } = useTranslation();
  const [estimate, setEstimate] = useState<TripProfitEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!amount || Number(amount) <= 0) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await advertisementsService.getTripEstimate(advertisementId, Number(amount));
        if (!cancelled) setEstimate(data);
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [advertisementId, amount]);

  if (!amount || Number(amount) <= 0) return null;
  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!estimate) return null;

  const suffix = t('dashboard.currencySuffix');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('features.tripProfit.title')}</Text>
      <Text style={styles.subtitle}>
        {t('features.tripProfit.distance', { km: estimate.estimated_distance_km })}
      </Text>
      {!!estimate.distance_source && (
        <Text style={styles.meta}>
          {t('features.tripProfit.distanceSource', { source: estimate.distance_source })}
        </Text>
      )}
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.label}>{t('features.tripProfit.revenue')}</Text>
          <Text style={styles.value}>{formatMoney(estimate.revenue, currentLanguage, suffix)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.label}>{t('features.tripProfit.costs')}</Text>
          <Text style={styles.value}>{formatMoney(estimate.total_cost, currentLanguage, suffix)}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.label}>{t('features.tripProfit.fuel')}</Text>
          <Text style={styles.value}>{formatMoney(estimate.fuel_cost, currentLanguage, suffix)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.label}>{t('features.tripProfit.toll')}</Text>
          <Text style={styles.value}>{formatMoney(estimate.toll_estimate, currentLanguage, suffix)}</Text>
        </View>
      </View>
      <Text style={[styles.net, estimate.is_profitable ? styles.netGood : styles.netBad]}>
        {t('features.tripProfit.net')}: {formatMoney(estimate.net_profit, currentLanguage, suffix)}
        {' · '}
        {estimate.margin_percent}%
      </Text>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  meta: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  metric: { flex: 1 },
  label: { fontSize: fontSize.xs, color: colors.textSecondary },
  value: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: 2 },
  net: { marginTop: spacing.sm, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  netGood: { color: colors.success },
  netBad: { color: colors.error },
});
