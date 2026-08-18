import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../theme/useAppTheme';
import { fontSize, fontWeight, spacing } from '../theme';
import { a11yLiveRegion } from '../utils/accessibility';
import { flushOfflineActionQueue } from '../services/offlineActionQueue';

export const OfflineBanner = () => {
  const { isOffline } = useNetworkStatus();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (wasOfflineRef.current && !isOffline) {
      void flushOfflineActionQueue();
    }
    wasOfflineRef.current = isOffline;
  }, [isOffline]);

  if (!isOffline) {
    return null;
  }

  return (
    <View
      style={[styles.container, { paddingTop: insets.top > 0 ? insets.top : spacing.sm }]}
      {...a11yLiveRegion(t('common.offlineBanner'))}>
      <MaterialIcons name="wifi-off" size={18} color={colors.textLight} />
      <Text style={styles.text}>{t('common.offlineBanner')}</Text>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      backgroundColor: colors.danger,
    },
    text: {
      color: colors.textLight,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      textAlign: 'center',
      flexShrink: 1,
    },
  });
