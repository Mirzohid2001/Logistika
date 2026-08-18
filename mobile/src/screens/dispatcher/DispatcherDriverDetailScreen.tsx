import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { DriverDetail, Vehicle } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { makePhoneCall } from '../../utils/phone';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';

const DispatcherDriverDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { driverId } = route.params as { driverId: number };

  const [driverDetail, setDriverDetail] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    loadDriverDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

  const loadDriverDetail = async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await dispatcherService.getDriverDetail(driverId);
      setDriverDetail(data);
    } catch (error: any) {
      console.error('Error loading driver detail:', error);
      setDriverDetail(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dispatcherLists.driverDetailTitle')} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
        </View>
      </ScreenBackground>
    );
  }

  if (loadFailed || !driverDetail) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dispatcherLists.driverDetailTitle')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('dispatcherOps.loadError')}
          actionText={t('common.retry')}
          onActionPress={loadDriverDetail}
        />
      </ScreenBackground>
    );
  }

  const { driver, vehicles, completed_orders, active_orders, total_assignments } = driverDetail;

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={t('dispatcherLists.driverDetailTitle')} />
        <Card variant="elevated" style={styles.profileCard}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {driver.first_name[0]}
              {driver.last_name[0]}
            </Text>
          </View>
          <Text style={styles.name}>
            {driver.first_name} {driver.last_name}
          </Text>
          <Text style={styles.phone}>{driver.phone}</Text>
          {driver.email ? <Text style={styles.email}>{driver.email}</Text> : null}
          {driver.average_rating !== undefined && driver.average_rating > 0 && (
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingValue}>⭐ {driver.average_rating.toFixed(1)}</Text>
              <Text style={styles.ratingCount}>
                ({driver.total_ratings || 0} {t('profile.ratingsCount')})
              </Text>
            </View>
          )}
        </Card>

        <Card variant="soft" style={styles.statsCard}>
          <Text style={styles.cardTitle}>{t('dispatcherLists.statistics')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{completed_orders}</Text>
              <Text style={styles.statLabel}>{t('dispatcherLists.completedOrders')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{active_orders}</Text>
              <Text style={styles.statLabel}>{t('dispatcherLists.activeOrdersCount')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{total_assignments}</Text>
              <Text style={styles.statLabel}>{t('dispatcherLists.totalAssignments')}</Text>
            </View>
          </View>
        </Card>

        {vehicles && vehicles.length > 0 ? (
          <Card variant="soft" style={styles.card}>
            <Text style={styles.cardTitle}>{t('dispatcherLists.vehicles')}</Text>
            {vehicles.map((vehicle: Vehicle) => (
              <View key={vehicle.id} style={styles.vehicleItem}>
                <Text style={styles.vehicleName}>
                  {vehicle.make} {vehicle.model}
                </Text>
                <Text style={styles.vehicleNumber}>{vehicle.number}</Text>
                <Text style={styles.vehicleCapacity}>
                  {t('dispatcherLists.vehicleLoad', {
                    load: vehicle.load_capacity,
                    volume: vehicle.cargo_volume,
                  })}
                </Text>
                {vehicle.is_verified ? (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓ {t('profile.verified')}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button
            title={t('dispatcherLists.call')}
            onPress={() => makePhoneCall(driver.phone)}
            variant="primary"
          />
          <Button
            title={t('dispatcherLists.viewOrders')}
            onPress={() => (navigation as any).navigate('DispatcherDriverOrders', { driverId })}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  scroll: { flex: 1 },
  skeletonWrap: { paddingHorizontal: spacing.lg },
  content: { paddingBottom: spacing.xxxl },
  profileCard: { alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: { color: colors.textLight, fontSize: fontSize.xxxl, fontWeight: fontWeight.bold },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  phone: { fontSize: fontSize.base, color: colors.textSecondary, marginBottom: spacing.xs },
  email: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  ratingContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  ratingValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  ratingCount: { fontSize: fontSize.sm, color: colors.textSecondary },
  statsCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  vehicleItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  vehicleName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  vehicleNumber: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  vehicleCapacity: { fontSize: fontSize.sm, color: colors.textSecondary },
  verifiedBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.success,
    borderRadius: borderRadius.sm,
  },
  verifiedText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textLight },
  actions: { gap: spacing.md, paddingHorizontal: spacing.lg },
});

export default DispatcherDriverDetailScreen;
