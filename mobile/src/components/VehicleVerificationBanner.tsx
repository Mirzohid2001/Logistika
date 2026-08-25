import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { getVerificationBannerPalette } from '../theme/bannerPalette';
import { navigateRoleStack } from '../utils/navigationHelpers';
import { a11yLink } from '../utils/accessibility';
import { Vehicle } from '../types';

type VehicleVerificationBannerProps = {
  vehicles: Vehicle[];
};

export const VehicleVerificationBanner: React.FC<VehicleVerificationBannerProps> = ({ vehicles }) => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();

  const pendingCount = vehicles.filter((v) => v.verification_status === 'pending').length;
  const rejectedCount = vehicles.filter((v) => v.verification_status === 'rejected').length;

  if (pendingCount === 0 && rejectedCount === 0) {
    return null;
  }

  const variant = rejectedCount > 0 ? 'rejected' : 'pending';
  const count = variant === 'rejected' ? rejectedCount : pendingCount;
  const palette = getVerificationBannerPalette(colors, variant);
  const bannerLabel = t(`driverVerification.vehicle${variant === 'pending' ? 'Pending' : 'Rejected'}Title`);

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}
      activeOpacity={0.85}
      onPress={() => {
        const rejected = vehicles.find((v) => v.verification_status === 'rejected');
        if (rejected) {
          navigateRoleStack(navigation, 'DriverStack', 'EditVehicle', { id: rejected.id });
          return;
        }
        const pending = vehicles.find((v) => v.verification_status === 'pending');
        if (pending) {
          navigateRoleStack(navigation, 'DriverStack', 'EditVehicle', { id: pending.id });
          return;
        }
        navigateRoleStack(navigation, 'DriverStack', 'Vehicles');
      }}
      {...a11yLink(bannerLabel)}>
      <Text style={[styles.title, { color: palette.title }]}>
        {t(`driverVerification.vehicle${variant === 'pending' ? 'Pending' : 'Rejected'}Title`)}
      </Text>
      <Text style={[styles.message, { color: palette.message }]}>
        {t(`driverVerification.vehicle${variant === 'pending' ? 'Pending' : 'Rejected'}Message`, { count })}
      </Text>
      <Text style={styles.action}>{t('driverVerification.requiredAction')} ›</Text>
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
