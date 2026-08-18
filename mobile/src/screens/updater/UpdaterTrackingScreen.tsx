import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Platform, Linking } from 'react-native';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { Order, OrderLocationTrack } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { TrackingStatsPanel } from '../../components/TrackingStatsPanel';
import { TrackingStopHistory } from '../../components/TrackingStopHistory';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SectionHeader } from '../../components/SectionHeader';

const UpdaterTrackingScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const { id } = route.params as { id: number };
  const { t } = useTranslation();

  const [order, setOrder] = useState<Order | null>(null);
  const [tracks, setTracks] = useState<OrderLocationTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTracking = useCallback(async () => {
    try {
      const data = await updaterService.getTracking(id);
      setOrder(data.order);
      setTracks(data.tracks);
    } catch (error) {
      console.error('Error loading tracking:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTracking();
      const interval = setInterval(loadTracking, 5000);
      return () => clearInterval(interval);
    }, [loadTracking]),
  );

  const openYandexMaps = (lat: number, lng: number) => {
    const url = Platform.select({
      ios: `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=16`,
      android: `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=16`,
    });
    if (!url) {return;}
    Linking.canOpenURL(url).then((ok) => {
      Linking.openURL(ok ? url : `https://yandex.ru/maps/?pt=${lng},${lat}&z=16`);
    });
  };

  if (loading && !order) {
    return <LoadingSpinner />;
  }

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTracking(); }} />}>
        {order && (
          <>
            <Card variant="elevated" style={styles.card}>
              <SectionHeader
                title={t('updaterLists.orderNumber', { id: order.id })}
                subtitle={order.status.name}
              />
            {!!order.tracking_summary?.alert_level && !!order.tracking_summary.alert_message && (
              <View
                style={[
                  styles.alertBanner,
                  order.tracking_summary.alert_level === 'critical' ? styles.alertCritical : styles.alertWarning,
                ]}>
                <Text style={styles.alertText}>{order.tracking_summary.alert_message}</Text>
              </View>
            )}
          </Card>

          {!!order.tracking_summary && (
            <Card variant="soft" style={styles.card}>
              <SectionHeader title={t('tracking.liveStats')} />
              <TrackingStatsPanel order={order} />
            </Card>
          )}

          {order.current_location_lat != null && order.current_location_lng != null && (
            <Card variant="soft" style={styles.card}>
              <Text style={styles.cardTitle}>{t('tracking.currentLocation')}</Text>
              <Text style={styles.coords}>
                {order.current_location_lat}, {order.current_location_lng}
              </Text>
              <Button
                title={t('tracking.openInYandexMaps')}
                onPress={() => openYandexMaps(order.current_location_lat!, order.current_location_lng!)}
                variant="outline"
                style={styles.mapButton}
              />
            </Card>
          )}

          <Card variant="soft" style={styles.card}>
            <SectionHeader title={t('tracking.stopHistory')} subtitle={t('tracking.stopHistoryHint')} />
            <TrackingStopHistory tracks={tracks} />
          </Card>
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  coords: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  mapButton: {
    marginTop: spacing.xs,
  },
  alertBanner: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  alertWarning: {
    backgroundColor: colors.warningGlow,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  alertCritical: {
    backgroundColor: colors.dangerGlow,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  alertText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
});

export default UpdaterTrackingScreen;
