import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { advertisementsService } from '../services/advertisementsService';
import { LoadFitResult } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';

interface LoadFitBadgeProps {
  advertisementId: number;
  compact?: boolean;
}

export const LoadFitBadge: React.FC<LoadFitBadgeProps> = ({ advertisementId, compact = false }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [result, setResult] = useState<LoadFitResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    advertisementsService
      .getLoadFit(advertisementId)
      .then((data) => {
        if (!cancelled) {setResult(data);}
      })
      .catch(() => {
        if (!cancelled) {setResult(null);}
      })
      .finally(() => {
        if (!cancelled) {setLoading(false);}
      });
    return () => {
      cancelled = true;
    };
  }, [advertisementId]);

  if (loading) {
    return (
      <ActivityIndicator
        size="small"
        color={colors.primary}
        style={{ marginBottom: compact ? spacing.xs : spacing.sm }}
      />
    );
  }
  if (!result) {return null;}

  const fits = result.fits;
  if (compact) {
    return (
      <View style={[styles.compactChip, fits ? styles.good : styles.bad]}>
        <Text style={styles.compactText} numberOfLines={1}>
          {fits
            ? t('features.loadFit.fits')
            : result.reason === 'no_vehicle'
              ? t('features.loadFit.noVehicle')
              : t('features.loadFit.notFits')}
          {fits && result.margin_kg != null ? ` · ${result.margin_kg} kg` : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, fits ? styles.good : styles.bad]}>
      <Text style={styles.title}>
        {fits ? t('features.loadFit.fits') : t('features.loadFit.notFits')}
      </Text>
      {result.best_vehicle && (
        <Text style={styles.meta}>
          {result.best_vehicle.make} {result.best_vehicle.model} · {result.best_vehicle.number}
          {result.margin_kg != null ? ` · ${result.margin_kg} kg` : ''}
        </Text>
      )}
      {!fits && result.reason === 'no_vehicle' && (
        <Text style={styles.meta}>{t('features.loadFit.noVehicle')}</Text>
      )}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      marginBottom: spacing.md,
      borderWidth: 1,
    },
    compactChip: {
      alignSelf: 'flex-start',
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
      borderWidth: 1,
      maxWidth: '100%',
    },
    good: {
      backgroundColor: `${colors.success}12`,
      borderColor: `${colors.success}44`,
    },
    bad: {
      backgroundColor: `${colors.error}10`,
      borderColor: `${colors.error}44`,
    },
    title: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    compactText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    meta: {
      marginTop: 4,
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
  });
