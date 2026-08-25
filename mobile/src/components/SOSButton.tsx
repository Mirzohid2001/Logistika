import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { ordersService } from '../services/ordersService';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { toastService } from '../services/toastService';

interface SOSButtonProps {
  orderId: number;
  disabled?: boolean;
}

export const SOSButton: React.FC<SOSButtonProps> = ({ orderId, disabled }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handlePress = () => {
    if (loading || disabled) {return;}
    setLoading(true);
    Geolocation.getCurrentPosition(
      async (position) => {
        try {
          await ordersService.triggerSOS(orderId, {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            message: t('features.sos.defaultMessage'),
          });
          setSent(true);
          toastService.success(t('features.sos.sent'));
        } catch {
          toastService.error(t('features.sos.failed'));
        } finally {
          setLoading(false);
        }
      },
      () => {
        toastService.error(t('features.sos.locationRequired'));
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  return (
    <TouchableOpacity
      style={[styles.button, (disabled || sent) && styles.buttonMuted]}
      onPress={handlePress}
      disabled={loading || disabled || sent}>
      {loading ? (
        <ActivityIndicator color={colors.surface} />
      ) : (
        <Text style={styles.text}>{sent ? t('features.sos.active') : t('features.sos.button')}</Text>
      )}
    </TouchableOpacity>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  button: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonMuted: {
    opacity: 0.75,
  },
  text: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
