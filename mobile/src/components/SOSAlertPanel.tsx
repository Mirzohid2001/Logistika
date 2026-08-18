import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { OrderSOSAlert } from '../types';
import { ordersService } from '../services/ordersService';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { a11yButton } from '../utils/accessibility';
import { toastService } from '../services/toastService';
import { makePhoneCall } from '../utils/phone';

interface SOSAlertPanelProps {
  alert: OrderSOSAlert;
  driverPhone?: string | null;
  onUpdated?: (alert: OrderSOSAlert | null) => void;
  compact?: boolean;
  readOnly?: boolean;
}

export const SOSAlertPanel: React.FC<SOSAlertPanelProps> = ({
  alert,
  driverPhone,
  onUpdated,
  compact,
  readOnly = false,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState<'ack' | 'resolve' | null>(null);

  const handleAcknowledge = async () => {
    setLoading('ack');
    try {
      const updated = await ordersService.acknowledgeSOS(alert.order);
      onUpdated?.(updated);
      toastService.success(t('features.sos.dispatcher.acknowledged'));
    } catch {
      toastService.error(t('features.sos.failed'));
    } finally {
      setLoading(null);
    }
  };

  const handleResolve = async () => {
    setLoading('resolve');
    try {
      const updated = await ordersService.resolveSOS(alert.order);
      onUpdated?.(updated.status === 'resolved' ? null : updated);
      toastService.success(t('features.sos.dispatcher.resolved'));
    } catch {
      toastService.error(t('features.sos.failed'));
    } finally {
      setLoading(null);
    }
  };

  const openMap = () => {
    const url = Platform.select({
      ios: `maps:0,0?q=${alert.lat},${alert.lng}`,
      android: `geo:${alert.lat},${alert.lng}?q=${alert.lat},${alert.lng}`,
    });
    if (url) Linking.openURL(url).catch(() => undefined);
  };

  const isActive = alert.status === 'active';

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="sos" size={22} color={colors.surface} />
        <Text style={styles.title}>
          {readOnly ? t('features.sos.client.title') : t('features.sos.dispatcher.title')}
        </Text>
        <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeAck]}>
          <Text style={styles.badgeText}>
            {isActive ? t('features.sos.dispatcher.statusActive') : t('features.sos.dispatcher.statusAck')}
          </Text>
        </View>
      </View>
      <Text style={styles.orderText}>
        {t('features.sos.dispatcher.order', { id: alert.order })}
      </Text>
      {!!alert.driver_name && <Text style={styles.meta}>{alert.driver_name}</Text>}
      {!!alert.message && <Text style={styles.message}>{alert.message}</Text>}
      {readOnly && (
        <Text style={styles.meta}>{t('features.sos.client.hint')}</Text>
      )}
      <Text style={styles.coords}>
        {Number(alert.lat).toFixed(5)}, {Number(alert.lng).toFixed(5)}
      </Text>
      <View style={styles.actions}>
        {driverPhone ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => makePhoneCall(driverPhone)} {...a11yButton(t('common.call'))}>
            <MaterialIcons name="phone" size={16} color={colors.primary} />
            <Text style={styles.actionText}>{t('common.call')}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.actionBtn} onPress={openMap} {...a11yButton(t('features.sos.dispatcher.openMap'))}>
          <MaterialIcons name="map" size={16} color={colors.primary} />
          <Text style={styles.actionText}>{t('features.sos.dispatcher.openMap')}</Text>
        </TouchableOpacity>
        {!readOnly && isActive ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.primaryBtn, loading === 'ack' && styles.disabled]}
            disabled={loading !== null}
            onPress={handleAcknowledge}
            {...a11yButton(t('features.sos.dispatcher.acknowledge'))}>
            <Text style={styles.primaryBtnText}>{t('features.sos.dispatcher.acknowledge')}</Text>
          </TouchableOpacity>
        ) : null}
        {!readOnly && !isActive ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.resolveBtn, loading === 'resolve' && styles.disabled]}
            disabled={loading !== null}
            onPress={handleResolve}
            {...a11yButton(t('features.sos.dispatcher.resolve'))}>
            <Text style={styles.resolveBtnText}>{t('features.sos.dispatcher.resolve')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardCompact: {
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  badge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeActive: {
    backgroundColor: `${colors.textLight}33`,
  },
  badgeAck: {
    backgroundColor: `${colors.text}22`,
  },
  badgeText: {
    color: colors.surface,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  orderText: {
    marginTop: spacing.xs,
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    marginTop: 2,
    color: `${colors.textLight}CC`,
    fontSize: fontSize.sm,
  },
  message: {
    marginTop: spacing.xs,
    color: colors.surface,
    fontSize: fontSize.sm,
  },
  coords: {
    marginTop: 4,
    color: `${colors.textLight}AA`,
    fontSize: fontSize.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  primaryBtn: {
    backgroundColor: `${colors.textLight}22`,
    borderWidth: 1,
    borderColor: `${colors.textLight}55`,
  },
  primaryBtnText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  resolveBtn: {
    backgroundColor: colors.success,
  },
  resolveBtnText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  disabled: {
    opacity: 0.6,
  },
});
