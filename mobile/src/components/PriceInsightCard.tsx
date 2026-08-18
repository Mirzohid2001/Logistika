import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { advertisementsService } from '../services/advertisementsService';
import { PriceInsight } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from './Button';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { formatMoney } from '../utils/formatLocale';

interface PriceInsightCardProps {
  fromCityId: number | null;
  toCityId: number | null;
  weight?: string;
  onApplySuggested?: (amount: number) => void;
  showApplyButton?: boolean;
}

export const PriceInsightCard: React.FC<PriceInsightCardProps> = ({
  fromCityId,
  toCityId,
  weight,
  onApplySuggested,
  showApplyButton = Boolean(onApplySuggested),
}) => {
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [insight, setInsight] = useState<PriceInsight | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fromCityId || !toCityId || fromCityId === toCityId) {
      setInsight(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await advertisementsService.getPriceInsight({
          from_city: fromCityId,
          to_city: toCityId,
          weight: weight ? Number(weight) : undefined,
        });
        if (!cancelled) setInsight(data);
      } catch {
        if (!cancelled) setInsight(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fromCityId, toCityId, weight]);

  if (!fromCityId || !toCityId || fromCityId === toCityId) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!insight?.available) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('features.priceInsight.title')}</Text>
        <Text style={styles.muted}>{t('features.priceInsight.noData')}</Text>
      </View>
    );
  }

  const suffix = t('dashboard.currencySuffix');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('features.priceInsight.title')}</Text>
      <Text style={styles.subtitle}>{t('features.priceInsight.subtitle')}</Text>
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>{t('features.priceInsight.suggested')}</Text>
          <Text style={styles.metricValue}>
            {formatMoney(insight.suggested_amount || 0, currentLanguage, suffix)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>{t('features.priceInsight.range')}</Text>
          <Text style={styles.metricValueSmall}>
            {formatMoney(insight.min_amount || 0, currentLanguage, suffix)} –{' '}
            {formatMoney(insight.max_amount || 0, currentLanguage, suffix)}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>
        {t('features.priceInsight.samples', { count: insight.sample_count || 0 })}
        {' · '}
        {t(`features.priceInsight.confidence.${insight.confidence || 'low'}`)}
      </Text>
      {showApplyButton && insight.suggested_amount != null && insight.suggested_amount > 0 ? (
        <Button
          title={t('features.priceInsight.apply')}
          variant="outline"
          onPress={() => onApplySuggested?.(Math.round(insight.suggested_amount!))}
          style={styles.applyButton}
        />
      ) : null}
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
    row: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    metric: {
      flex: 1,
    },
    metricLabel: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
    metricValue: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: colors.primary,
      marginTop: 2,
    },
    metricValueSmall: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.text,
      marginTop: 2,
    },
    meta: {
      marginTop: spacing.sm,
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
    muted: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    applyButton: {
      marginTop: spacing.sm,
    },
  });
