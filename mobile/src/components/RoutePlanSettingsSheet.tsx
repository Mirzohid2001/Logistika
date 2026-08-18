import React, { useEffect, useMemo, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { Order } from '../types';
import { Input } from './Input';
import { Button } from './Button';
import { BottomSheet } from './BottomSheet';
import { useTranslation } from '../hooks/useTranslation';
import { fontSize } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { getPlannedRouteCoordinates } from '../utils/routeStops';

interface RoutePlanSettingsSheetProps {
  visible: boolean;
  order: Order | null;
  loading?: boolean;
  onClose: () => void;
  onSave: (payload: {
    thresholdMeters: number;
    pickupGeofenceRadiusMeters: number;
    destinationGeofenceRadiusMeters: number;
  }) => Promise<void>;
}

function parseMeters(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(5000, Math.max(50, parsed));
}

export const RoutePlanSettingsSheet: React.FC<RoutePlanSettingsSheetProps> = ({
  visible,
  order,
  loading = false,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const [threshold, setThreshold] = useState('500');
  const [pickupRadius, setPickupRadius] = useState('300');
  const [destinationRadius, setDestinationRadius] = useState('300');

  const pointCount = useMemo(() => {
    if (!order) {
      return 0;
    }
    return getPlannedRouteCoordinates(order).length;
  }, [order]);

  useEffect(() => {
    if (!visible || !order) {
      return;
    }
    setThreshold(String(order.route_deviation_threshold_meters ?? 500));
    setPickupRadius(String(order.pickup_geofence_radius_meters ?? 300));
    setDestinationRadius(String(order.destination_geofence_radius_meters ?? 300));
  }, [visible, order]);

  const handleSave = async () => {
    await onSave({
      thresholdMeters: parseMeters(threshold, 500),
      pickupGeofenceRadiusMeters: parseMeters(pickupRadius, 300),
      destinationGeofenceRadiusMeters: parseMeters(destinationRadius, 300),
    });
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('tracking.routePlan.title')}
      subtitle={t('tracking.routePlan.hint', { count: pointCount })}
      onClose={onClose}>
      <Text style={styles.rangeHint}>{t('tracking.routePlan.rangeHint')}</Text>

      <Input
        label={t('tracking.routePlan.deviationThreshold')}
        value={threshold}
        onChangeText={setThreshold}
        placeholder="500"
        keyboardType="numeric"
      />
      <Input
        label={t('tracking.routePlan.pickupGeofence')}
        value={pickupRadius}
        onChangeText={setPickupRadius}
        placeholder="300"
        keyboardType="numeric"
      />
      <Input
        label={t('tracking.routePlan.destinationGeofence')}
        value={destinationRadius}
        onChangeText={setDestinationRadius}
        placeholder="300"
        keyboardType="numeric"
      />

      <Button
        title={t('common.save')}
        onPress={() => {
          void handleSave();
        }}
        loading={loading}
        variant="primary"
      />
    </BottomSheet>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    rangeHint: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      lineHeight: 18,
    },
  });
