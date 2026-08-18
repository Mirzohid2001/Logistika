import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { vehiclesService } from '../../services/vehiclesService';
import { Vehicle } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { VehicleVerificationBanner } from '../../components/VehicleVerificationBanner';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { getMediaUrl } from '../../services/api';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { createListScreenStyles } from '../../theme/listScreenStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';

const VehiclesScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const listStyles = useMemo(() => createListScreenStyles(colors), [colors]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadVehicles = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await vehiclesService.getVehicles();
      setVehicles(data);
    } catch (error) {
      console.error('Error loading vehicles:', error);
      setVehicles([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadVehicles();
  };

  const handleDelete = (id: number) => {
    Alert.alert(t('vehicles.deleteTitle'), t('vehicles.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await vehiclesService.deleteVehicle(id);
            loadVehicles();
          } catch (error: any) {
            Alert.alert(t('common.error'), error.response?.data?.error || t('vehicles.deleteError'));
          }
        },
      },
    ]);
  };

  const renderItem = ({ item, index }: { item: Vehicle; index: number }) => {
    const photoUri = getMediaUrl(item.photo);

    return (
      <AnimatedListItem index={index}>
      <Card variant="soft">
        <View style={styles.vehicleHeader}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder} />
          )}
          <View style={listStyles.rowContent}>
            <Text style={listStyles.rowTitle}>
              {item.make} {item.model}
            </Text>
            <Text style={listStyles.rowSubtitle}>{item.number}</Text>
            <Text style={listStyles.rowMeta}>
              {t('vehicles.cargoVolume')}: {item.cargo_volume} m³
            </Text>
            <Text style={listStyles.rowMeta}>
              {t('vehicles.loadCapacity')}: {item.load_capacity} kg
              {item.body_type ? ` · ${t(`vehicles.bodyTypes.${item.body_type}`)}` : ''}
            </Text>
            {(() => {
              const status = item.verification_status ?? (item.is_verified ? 'approved' : 'not_submitted');
              if (status === 'approved') {
                return (
                  <View style={[styles.verifiedBadge, styles.statusApproved]}>
                    <Text style={styles.verifiedText}>✓ {t('driverVerification.vehicleApproved')}</Text>
                  </View>
                );
              }
              if (status === 'pending') {
                return (
                  <View style={[styles.verifiedBadge, styles.statusPending]}>
                    <Text style={styles.pendingText}>⏳ {t('driverVerification.vehiclePending')}</Text>
                  </View>
                );
              }
              if (status === 'rejected') {
                return (
                  <View style={[styles.verifiedBadge, styles.statusRejected]}>
                    <Text style={styles.rejectedText}>✗ {t('driverVerification.vehicleRejected')}</Text>
                  </View>
                );
              }
              return null;
            })()}
          </View>
        </View>
        <View style={styles.actions}>
          <Button
            title={t('common.edit')}
            onPress={() => (navigation as any).navigate('EditVehicle', { id: item.id })}
            variant="outline"
            style={styles.actionBtn}
          />
          <Button
            title={t('common.delete')}
            onPress={() => handleDelete(item.id)}
            variant="danger"
            style={styles.actionBtn}
          />
        </View>
      </Card>
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('vehicles.myVehicles')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (loadFailed) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('vehicles.myVehicles')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadVehicles}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('vehicles.myVehicles')} />
      <VehicleVerificationBanner vehicles={vehicles} />
      <FlatList
        data={vehicles}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={vehicles.length === 0 ? listStyles.emptyContainer : styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <EmptyState
            title={t('vehicles.noVehicles')}
            message={t('vehicles.noVehiclesMessage')}
          />
        }
      />
      <View style={styles.footer}>
        <Button
          title={t('vehicles.addVehicleFab')}
          onPress={() => (navigation as any).navigate('CreateVehicle')}
          variant="primary"
        />
      </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    listContainer: {
      paddingVertical: spacing.sm,
      paddingBottom: spacing.xxxl + 80,
    },
    vehicleHeader: {
      flexDirection: 'row',
      marginBottom: spacing.lg,
    },
    photo: {
      width: 100,
      height: 100,
      borderRadius: borderRadius.sm,
      marginRight: spacing.md,
      backgroundColor: colors.border,
    },
    photoPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: borderRadius.md,
      marginRight: spacing.md,
      backgroundColor: colors.primaryGlow,
    },
    verifiedBadge: {
      backgroundColor: colors.success + '20',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.sm,
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
    },
    verifiedText: {
      color: colors.success,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    statusApproved: {
      backgroundColor: colors.success + '20',
    },
    statusPending: {
      backgroundColor: colors.warning + '20',
    },
    statusRejected: {
      backgroundColor: colors.danger + '20',
    },
    pendingText: {
      color: colors.warning,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    rejectedText: {
      color: colors.danger,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    actionBtn: {
      flex: 1,
      marginBottom: 0,
    },
    footer: {
      padding: spacing.lg,
      backgroundColor: colors.backgroundSecondary,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
  });

export default VehiclesScreen;
