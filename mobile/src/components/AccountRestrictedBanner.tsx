import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { User } from '../types';

type AccountRestrictedBannerProps = {
  user: User | null;
};

export const AccountRestrictedBanner: React.FC<AccountRestrictedBannerProps> = ({ user }) => {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  if (!user) {
    return null;
  }

  const suspendedUntil = user.suspended_until ? new Date(user.suspended_until) : null;
  const isSuspended = suspendedUntil && suspendedUntil > new Date();

  if (!user.is_blocked && !isSuspended) {
    return null;
  }

  const title = user.is_blocked
    ? t('accountRestriction.blockedTitle')
    : t('accountRestriction.suspendedTitle');
  const message = user.is_blocked
    ? t('accountRestriction.blockedMessage')
    : t('accountRestriction.suspendedMessage', {
        date: suspendedUntil?.toLocaleString(),
      });

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    banner: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.danger + '18',
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.danger,
      marginBottom: spacing.xs,
    },
    message: {
      fontSize: fontSize.sm,
      color: colors.text,
      lineHeight: 20,
    },
  });
