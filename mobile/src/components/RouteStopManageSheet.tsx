import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import type { OrderRouteStop } from '../types';
import { Input } from './Input';
import { Button } from './Button';
import { BottomSheet } from './BottomSheet';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { getSortedRouteStops } from '../utils/routeStops';

interface RouteStopManageSheetProps {
  visible: boolean;
  stops: OrderRouteStop[];
  loading?: boolean;
  onClose: () => void;
  onAddStop: (payload: { address: string; label?: string; stop_type: 'pickup' | 'delivery' }) => Promise<void>;
  onUpdateStop: (
    stopId: number,
    payload: {
      address?: string;
      label?: string;
      lat?: number;
      lng?: number;
      geofence_radius_meters?: number;
    },
  ) => Promise<void>;
  onDeleteStop: (stopId: number) => Promise<void>;
}

export const RouteStopManageSheet: React.FC<RouteStopManageSheetProps> = ({
  visible,
  stops,
  loading = false,
  onClose,
  onAddStop,
  onUpdateStop,
  onDeleteStop,
}) => {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [stopType, setStopType] = useState<'pickup' | 'delivery'>('delivery');
  const [editingStop, setEditingStop] = useState<OrderRouteStop | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editGeofence, setEditGeofence] = useState('150');
  const [locating, setLocating] = useState(false);
  const sorted = getSortedRouteStops(stops);

  useEffect(() => {
    if (!visible) {
      setEditingStop(null);
      setAddress('');
      setLabel('');
    }
  }, [visible]);

  const openEdit = (stop: OrderRouteStop) => {
    if (stop.status !== 'pending') {
      return;
    }
    setEditingStop(stop);
    setEditAddress(stop.address || '');
    setEditLabel(stop.label || '');
    setEditLat(stop.lat != null ? String(stop.lat) : '');
    setEditLng(stop.lng != null ? String(stop.lng) : '');
    setEditGeofence(String(stop.geofence_radius_meters ?? 150));
  };

  const fillCurrentLocation = async () => {
    try {
      setLocating(true);
      const granted = await Geolocation.requestAuthorization('whenInUse');
      if (granted !== 'granted') {
        Alert.alert(t('chat.permissionRequiredTitle'), t('chat.locationPermissionRequired'));
        return;
      }
      const position = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      });
      setEditLat(position.coords.latitude.toFixed(6));
      setEditLng(position.coords.longitude.toFixed(6));
    } catch {
      Alert.alert(t('common.error'), t('tracking.routeStopManage.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const handleAdd = async () => {
    if (!address.trim()) {
      Alert.alert(t('common.error'), t('tracking.routeStopManage.addressRequired'));
      return;
    }
    await onAddStop({
      address: address.trim(),
      label: label.trim() || undefined,
      stop_type: stopType,
    });
    setAddress('');
    setLabel('');
  };

  const handleUpdate = async () => {
    if (!editingStop) {
      return;
    }
    if (!editAddress.trim()) {
      Alert.alert(t('common.error'), t('tracking.routeStopManage.addressRequired'));
      return;
    }
    const lat = editLat.trim() ? Number.parseFloat(editLat) : undefined;
    const lng = editLng.trim() ? Number.parseFloat(editLng) : undefined;
    const geofence = editGeofence.trim() ? Number.parseInt(editGeofence, 10) : undefined;
    if ((editLat.trim() && Number.isNaN(lat)) || (editLng.trim() && Number.isNaN(lng))) {
      Alert.alert(t('common.error'), t('tracking.routeStopManage.invalidCoordinates'));
      return;
    }
    await onUpdateStop(editingStop.id, {
      address: editAddress.trim(),
      label: editLabel.trim() || undefined,
      ...(lat != null && !Number.isNaN(lat) ? { lat } : {}),
      ...(lng != null && !Number.isNaN(lng) ? { lng } : {}),
      ...(geofence != null && !Number.isNaN(geofence) ? { geofence_radius_meters: geofence } : {}),
    });
    setEditingStop(null);
  };

  const confirmDelete = (stop: OrderRouteStop) => {
    if (sorted.length <= 2) {
      Alert.alert(t('common.error'), t('tracking.routeStopManage.minStops'));
      return;
    }
    Alert.alert(
      t('tracking.routeStopManage.deleteTitle'),
      t('tracking.routeStopManage.deleteConfirm', { label: stop.label || stop.address }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void onDeleteStop(stop.id);
            if (editingStop?.id === stop.id) {
              setEditingStop(null);
            }
          },
        },
      ],
    );
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('tracking.routeStopManage.title')}
      subtitle={t('tracking.routeStopManage.subtitle', { count: sorted.length })}
      onClose={onClose}>
      <Text style={styles.sectionTitle}>{t('tracking.routeStopManage.currentStops')}</Text>
      {sorted.map((stop) => (
        <View key={stop.id} style={styles.stopRow}>
          <TouchableOpacity style={styles.stopInfo} onPress={() => openEdit(stop)}>
            <Text style={styles.stopLabel}>
              #{stop.sequence} · {t(`tracking.stopType.${stop.stop_type}`)}
              {stop.status !== 'pending' ? ` · ${t(`tracking.stopStatus.${stop.status}`)}` : ''}
            </Text>
            <Text style={styles.stopAddress} numberOfLines={2}>
              {stop.label || stop.address}
            </Text>
            {stop.lat != null && stop.lng != null ? (
              <Text style={styles.coords}>
                {Number(stop.lat).toFixed(5)}, {Number(stop.lng).toFixed(5)}
              </Text>
            ) : (
              <Text style={styles.coordsMuted}>{t('tracking.routeStopManage.noCoordinates')}</Text>
            )}
          </TouchableOpacity>
          {stop.status === 'pending' && sorted.length > 2 ? (
            <TouchableOpacity onPress={() => confirmDelete(stop)} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {editingStop ? (
        <>
          <Text style={styles.sectionTitle}>{t('tracking.routeStopManage.editStop')}</Text>
          <Input label={t('tracking.routeStopManage.addressLabel')} value={editAddress} onChangeText={setEditAddress} />
          <Input label={t('tracking.routeStopManage.labelLabel')} value={editLabel} onChangeText={setEditLabel} />
          <View style={styles.coordsRow}>
            <View style={styles.coordField}>
              <Input
                label={t('tracking.routeStopManage.latLabel')}
                value={editLat}
                onChangeText={setEditLat}
                keyboardType="numeric"
                placeholder="41.3111"
              />
            </View>
            <View style={styles.coordField}>
              <Input
                label={t('tracking.routeStopManage.lngLabel')}
                value={editLng}
                onChangeText={setEditLng}
                keyboardType="numeric"
                placeholder="69.2797"
              />
            </View>
          </View>
          <Button
            title={t('tracking.routeStopManage.useCurrentLocation')}
            onPress={() => void fillCurrentLocation()}
            loading={locating}
            variant="outline"
          />
          <Input
            label={t('tracking.routeStopManage.geofenceLabel')}
            value={editGeofence}
            onChangeText={setEditGeofence}
            keyboardType="numeric"
            placeholder="150"
          />
          <View style={styles.editActions}>
            <Button
              title={t('common.cancel')}
              onPress={() => setEditingStop(null)}
              variant="outline"
              style={styles.editActionBtn}
            />
            <Button
              title={t('common.save')}
              onPress={() => void handleUpdate()}
              loading={loading}
              variant="primary"
              style={styles.editActionBtn}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>{t('tracking.routeStopManage.addStop')}</Text>
      <View style={styles.typeRow}>
        {(['pickup', 'delivery'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeChip, stopType === type && styles.typeChipActive]}
            onPress={() => setStopType(type)}>
            <Text style={[styles.typeChipText, stopType === type && styles.typeChipTextActive]}>
              {t(`tracking.stopType.${type}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Input
        label={t('tracking.routeStopManage.addressLabel')}
        value={address}
        onChangeText={setAddress}
        placeholder={t('tracking.routeStopManage.addressPlaceholder')}
      />
      <Input
        label={t('tracking.routeStopManage.labelLabel')}
        value={label}
        onChangeText={setLabel}
        placeholder={t('tracking.routeStopManage.labelPlaceholder')}
      />
      <Button
        title={t('tracking.routeStopManage.addAction')}
        onPress={() => void handleAdd()}
        loading={loading}
        variant="primary"
      />
    </BottomSheet>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    sectionTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stopInfo: {
      flex: 1,
    },
    stopLabel: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    stopAddress: {
      fontSize: fontSize.sm,
      color: colors.text,
      fontWeight: fontWeight.medium,
    },
    coords: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
    coordsMuted: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.warning,
    },
    deleteBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    deleteText: {
      color: colors.danger,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    typeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    typeChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGlow,
    },
    typeChipText: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    typeChipTextActive: {
      color: colors.primary,
      fontWeight: fontWeight.semibold,
    },
    coordsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    coordField: {
      flex: 1,
    },
    editActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    editActionBtn: {
      flex: 1,
    },
  });
