import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ratingsService } from '../services/ratingsService';
import { RatingStats, User } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { Button } from './Button';
import { BottomSheet } from './BottomSheet';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

interface UserRatingDetailSheetProps {
  visible: boolean;
  user: User | null | undefined;
  onClose: () => void;
}

export const UserRatingDetailSheet: React.FC<UserRatingDetailSheetProps> = ({
  visible,
  user,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [stats, setStats] = useState<RatingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadStats = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    try {
      setLoading(true);
      setError(false);
      const data = await ratingsService.getUserRatingStats(user.id);
      setStats(data);
    } catch {
      setStats(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (visible && user?.id) {
      void loadStats();
    }
    if (!visible) {
      setStats(null);
      setError(false);
    }
  }, [visible, user?.id, loadStats]);

  const distribution = stats?.rating_distribution;
  const maxCount = distribution
    ? Math.max(1, ...Object.values(distribution).map((value) => Number(value) || 0))
    : 1;

  const trustTier = user?.trust_tier;
  const trustTierColor =
    trustTier && colors.trustTier[trustTier as keyof typeof colors.trustTier]
      ? colors.trustTier[trustTier as keyof typeof colors.trustTier]
      : colors.primary;

  return (
    <BottomSheet
      visible={visible}
      title={t('features.ratingDetail.title')}
      subtitle={user ? `${user.first_name} ${user.last_name}`.trim() : undefined}
      onClose={onClose}>
      {user?.trust_score != null ? (
        <View style={[styles.trustRow, { borderColor: trustTierColor }]}>
          <Text style={styles.trustLabel}>{t('profile.trustScoreTitle')}</Text>
          <Text style={styles.trustValue}>
            {t(`features.trust.tier.${trustTier || 'bronze'}`)} · {user.trust_score}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.error}>{t('features.ratingDetail.loadError')}</Text>
          <Button title={t('common.retry')} onPress={() => void loadStats()} variant="outline" />
        </View>
      ) : stats ? (
        <>
          {stats.total_ratings === 0 ? (
            <Text style={styles.empty}>{t('features.ratingDetail.noRatings')}</Text>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryValue}>⭐ {stats.average_rating.toFixed(1)}</Text>
                <Text style={styles.summaryMeta}>
                  {t('features.ratingDetail.totalRatings', { count: stats.total_ratings })}
                </Text>
              </View>

              {(['5', '4', '3', '2', '1'] as const).map((star) => {
                const count = distribution?.[star] ?? 0;
                const widthPercent = Math.round((count / maxCount) * 100);
                return (
                  <View key={star} style={styles.barRow}>
                    <Text style={styles.barLabel}>{star}★</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${widthPercent}%` }]} />
                    </View>
                    <Text style={styles.barCount}>{count}</Text>
                  </View>
                );
              })}
            </>
          )}

          {(stats.complaints_received ?? 0) > 0 ? (
            <View style={styles.complaintsBox}>
              <Text style={styles.complaintsTitle}>{t('features.ratingDetail.complaints')}</Text>
              <Text style={styles.complaintsText}>
                {t('features.ratingDetail.complaintsSummary', {
                  total: stats.complaints_received ?? 0,
                  pending: stats.complaints_pending ?? 0,
                  review: stats.complaints_in_review ?? 0,
                })}
              </Text>
            </View>
          ) : (
            <Text style={styles.noComplaints}>{t('features.ratingDetail.noComplaints')}</Text>
          )}
        </>
      ) : null}
    </BottomSheet>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    trustRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    trustLabel: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    trustValue: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    summaryValue: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    summaryMeta: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    barLabel: {
      width: 28,
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    barTrack: {
      flex: 1,
      height: 8,
      borderRadius: borderRadius.full,
      backgroundColor: colors.backgroundSecondary,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: borderRadius.full,
    },
    barCount: {
      width: 28,
      textAlign: 'right',
      fontSize: fontSize.sm,
      color: colors.text,
    },
    complaintsBox: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: colors.warningGlow,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    complaintsTitle: {
      fontWeight: fontWeight.semibold,
      color: colors.warning,
      marginBottom: spacing.xs,
    },
    complaintsText: {
      fontSize: fontSize.sm,
      color: colors.text,
    },
    noComplaints: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    empty: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
    errorWrap: {
      gap: spacing.md,
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    error: {
      color: colors.danger,
      textAlign: 'center',
    },
  });
