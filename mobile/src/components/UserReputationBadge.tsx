import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { User } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { UserRatingDetailSheet } from './UserRatingDetailSheet';

interface UserReputationBadgeProps {
  user: User | null | undefined;
  compact?: boolean;
  showDetail?: boolean;
}

export const UserReputationBadge: React.FC<UserReputationBadgeProps> = ({
  user,
  compact,
  showDetail = true,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [detailVisible, setDetailVisible] = useState(false);
  if (!user) return null;

  const hasRating = (user.average_rating ?? 0) > 0;
  const complaints = user.complaints_received_count ?? 0;
  const trustScore = user.trust_score;
  const trustTier = user.trust_tier;
  const canOpenDetail = showDetail && !!user.id;

  const trustTierColor =
    trustTier && colors.trustTier[trustTier as keyof typeof colors.trustTier]
      ? colors.trustTier[trustTier as keyof typeof colors.trustTier]
      : colors.primary;

  if (!hasRating && complaints === 0 && trustScore == null) {
    return <Text style={styles.muted}>{t('profile.noRating')}</Text>;
  }

  const content = (
    <View style={styles.row}>
      {trustScore != null && (
        <View style={[styles.trustBadge, trustTier ? { borderColor: trustTierColor } : null]}>
          <Text style={[styles.trustText, compact && styles.compact]}>
            {t(`features.trust.tier.${trustTier || 'bronze'}`)} · {trustScore}
          </Text>
        </View>
      )}
      {hasRating && (
        <Text style={[styles.rating, compact && styles.compact]}>
          ⭐ {user.average_rating?.toFixed(1)}
          {(user.total_ratings ?? 0) > 0 ? ` (${user.total_ratings})` : ''}
        </Text>
      )}
      {complaints > 0 && (
        <Text style={[styles.complaints, compact && styles.compact]}>
          ⚠️ {complaints} {t('complaints.receivedShort')}
        </Text>
      )}
      {canOpenDetail && !compact ? (
        <MaterialIcons name="info-outline" size={16} color={colors.primary} />
      ) : null}
    </View>
  );

  return (
    <>
      {canOpenDetail ? (
        <TouchableOpacity
          onPress={() => setDetailVisible(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('features.ratingDetail.title')}
          accessibilityHint={t('features.ratingDetail.tapHint')}>
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}
      <UserRatingDetailSheet
        visible={detailVisible}
        user={user}
        onClose={() => setDetailVisible(false)}
      />
    </>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    trustBadge: {
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    trustText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    rating: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '600',
    },
    complaints: {
      fontSize: 13,
      color: colors.warning,
    },
    compact: {
      fontSize: 12,
    },
    muted: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
  });
