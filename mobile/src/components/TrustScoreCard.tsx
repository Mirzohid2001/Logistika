import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { User } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { Card } from './Card';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';

const tierColors = (colors: AppColors): Record<string, string> => colors.trustTier;

interface TrustScoreCardProps {
  user: User;
  compact?: boolean;
}

export const TrustScoreCard: React.FC<TrustScoreCardProps> = ({ user, compact }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const score = user.trust_score;
  const tier = user.trust_tier || 'bronze';

  if (score == null) {
    return null;
  }

  const tierColor = tierColors(colors)[tier] || colors.primary;

  if (compact) {
    return (
      <View style={styles.compactCard}>
        <View style={[styles.compactScore, { borderColor: tierColor }]}>
          <Text style={[styles.compactScoreValue, { color: tierColor }]}>{score}</Text>
        </View>
        <View style={styles.compactMeta}>
          <Text style={[styles.compactTier, { color: tierColor }]}>
            {t(`features.trust.tier.${tier}`)}
          </Text>
          <Text style={styles.compactHint}>{t('profile.trustScoreHint')}</Text>
          {(user.average_rating ?? 0) > 0 && (
            <Text style={styles.compactStat}>
              ⭐ {user.average_rating?.toFixed(1)} · {user.total_ratings ?? 0}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <Card variant="soft" style={styles.card}>
      <Text style={styles.title}>{t('profile.trustScoreTitle')}</Text>
      <View style={styles.row}>
        <View style={[styles.scoreCircle, { borderColor: tierColor }]}>
          <Text style={[styles.scoreValue, { color: tierColor }]}>{score}</Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>
        <View style={styles.meta}>
          <View style={[styles.tierBadge, { backgroundColor: `${tierColor}22`, borderColor: tierColor }]}>
            <Text style={[styles.tierText, { color: tierColor }]}>
              {t(`features.trust.tier.${tier}`)}
            </Text>
          </View>
          <Text style={styles.hint}>{t('profile.trustScoreHint')}</Text>
          {(user.average_rating ?? 0) > 0 && (
            <Text style={styles.stat}>
              ⭐ {user.average_rating?.toFixed(1)} · {user.total_ratings ?? 0} {t('profile.ratingsCount')}
            </Text>
          )}
          {(user.complaints_received_count ?? 0) > 0 && (
            <Text style={styles.statWarning}>
              ⚠️ {user.complaints_received_count} {t('complaints.receivedShort')}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      marginBottom: spacing.lg,
    },
    compactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    compactScore: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.round,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactScoreValue: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.extrabold,
    },
    compactMeta: {
      flex: 1,
      gap: 2,
    },
    compactTier: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
    },
    compactHint: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    compactStat: {
      fontSize: fontSize.xs,
      color: colors.text,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
    },
    scoreCircle: {
      width: 88,
      height: 88,
      borderRadius: borderRadius.round,
      borderWidth: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    scoreValue: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.extrabold,
      lineHeight: 30,
    },
    scoreMax: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
    meta: {
      flex: 1,
      gap: spacing.xs,
    },
    tierBadge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: borderRadius.round,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    tierText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
    },
    hint: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    stat: {
      fontSize: fontSize.sm,
      color: colors.text,
      marginTop: spacing.xs,
    },
    statWarning: {
      fontSize: fontSize.sm,
      color: colors.warning,
      marginTop: 2,
    },
  });
