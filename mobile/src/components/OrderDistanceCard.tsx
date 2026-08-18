import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from '../hooks/useTranslation';
import type { Order } from '../types';
import { getOrderDistanceInfo } from '../utils/orderDistance';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

interface OrderDistanceCardProps {
  order: Order;
  compact?: boolean;
}

export const OrderDistanceCard: React.FC<OrderDistanceCardProps> = ({ order, compact }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const distance = getOrderDistanceInfo(order);
  if (!distance) return null;

  const rows = [
    distance.planned_distance_km != null && distance.planned_distance_km > 0
      ? {
          icon: 'map',
          label: t('tracking.plannedDistance'),
          value: `${distance.planned_distance_km} km`,
        }
      : null,
    distance.tracked_distance_km != null && distance.tracked_distance_km > 0
      ? {
          icon: 'route',
          label: distance.is_final ? t('tracking.trackedDistanceFinal') : t('tracking.trackedDistance'),
          value: `${distance.tracked_distance_km} km`,
        }
      : null,
    distance.loaded_distance_km != null && distance.loaded_distance_km > 0
      ? {
          icon: 'local-shipping',
          label: t('tracking.loadedDistance'),
          value: `${distance.loaded_distance_km} km`,
        }
      : null,
    distance.deadhead_distance_km != null && distance.deadhead_distance_km > 0
      ? {
          icon: 'directions-car',
          label: t('tracking.deadheadDistance'),
          value: `${distance.deadhead_distance_km} km`,
        }
      : null,
    distance.distance_delta_km != null && !compact && Math.abs(distance.distance_delta_km) >= 0.1
      ? {
          icon: 'compare-arrows',
          label: t('tracking.distanceDelta'),
          value: `${distance.distance_delta_km > 0 ? '+' : ''}${distance.distance_delta_km} km`,
        }
      : null,
  ].filter(Boolean) as Array<{ icon: string; label: string; value: string }>;

  if (!rows.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('tracking.distanceTitle')}</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <MaterialIcons name={row.icon} size={18} color={colors.primary} />
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
      <Text style={styles.note}>{t('tracking.distanceInfoOnly')}</Text>
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.sm,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.backgroundSecondary,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    label: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    value: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    note: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      lineHeight: 16,
    },
  });
