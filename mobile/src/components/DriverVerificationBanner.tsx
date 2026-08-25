import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { getVerificationBannerPalette } from '../theme/bannerPalette';
import { a11yLink } from '../utils/accessibility';
import { navigateRoot } from '../utils/navigationHelpers';
import { driverNeedsVerification } from '../utils/account';

type BannerVariant = 'pending' | 'rejected' | 'required';

function resolveVariant(
  verificationStatus?: string,
  requiresVerification?: boolean,
): BannerVariant | null {
  if (verificationStatus === 'pending') {return 'pending';}
  if (verificationStatus === 'rejected') {return 'rejected';}
  if (requiresVerification) {return 'required';}
  return null;
}

export const DriverVerificationBanner: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();

  const variant = user?.is_driver
    ? resolveVariant(user.verification_status, driverNeedsVerification(user))
    : null;

  if (!variant) {
    return null;
  }

  const palette = getVerificationBannerPalette(colors, variant);

  const targetRoute = variant === 'pending' ? 'DriverDocuments' : 'UploadDocuments';
  const bannerLabel = t(`driverVerification.${variant}Title`);

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}
      activeOpacity={0.85}
      onPress={() => navigateRoot(navigation, targetRoute)}
      {...a11yLink(bannerLabel)}>
      <Text style={[styles.title, { color: palette.title }]}>
        {t(`driverVerification.${variant}Title`)}
      </Text>
      <Text style={[styles.message, { color: palette.message }]}>
        {t(`driverVerification.${variant}Message`)}
      </Text>
      <Text style={styles.action}>{t(`driverVerification.${variant}Action`)} ›</Text>
    </TouchableOpacity>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    banner: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      marginBottom: spacing.xs,
    },
    message: {
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    action: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primary,
    },
  });
