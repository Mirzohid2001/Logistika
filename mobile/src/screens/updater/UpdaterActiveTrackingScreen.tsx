import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { Order } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { createListScreenStyles } from '../../theme/listScreenStyles';
import { getOrderStatusColor } from '../../utils/statusColors';
import { formatDateTime } from '../../utils/formatLocale';
import { TrackingQuickChips } from '../../components/TrackingQuickChips';
import { ScreenBackground } from '../../components/ScreenBackground';

const UpdaterActiveTrackingScreen = () => {
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createListScreenStyles(colors), [colors]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await updaterService.getActiveTracking();
      setOrders(data);
    } catch (error) {
      console.error('Error loading active tracking:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
      const interval = setInterval(loadOrders, 10000);
      return () => clearInterval(interval);
    }, [loadOrders])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const renderItem = ({ item }: { item: Order }) => {
    const advertisement = typeof item.advertisement === 'object' ? item.advertisement : null;
    const driver = typeof item.driver === 'object' ? item.driver : null;
    const statusColor = getOrderStatusColor(item.status.code, colors);

    return (
      <TouchableOpacity
        onPress={() => (navigation as any).navigate('UpdaterTracking', { id: item.id })}>
        <Card variant="elevated">
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{t('updaterLists.orderNumber', { id: item.id })}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{item.status.name}</Text>
            </View>
          </View>
          {advertisement && (
            <Text style={styles.rowTitle} numberOfLines={1}>
              {advertisement.title}
            </Text>
          )}
          {driver && (
            <Text style={styles.rowSubtitle}>
              {t('updaterLists.driver')}: {driver.first_name} {driver.last_name}
            </Text>
          )}
          <TrackingQuickChips
            trackingSummary={item.tracking_summary}
            estimatedEtaMinutes={item.estimated_eta_minutes}
          />
          <Text style={styles.rowMeta}>
            {formatDateTime(item.updated_at || item.created_at, currentLanguage)}
          </Text>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <ScreenBackground>
      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <EmptyState
            title={t('updaterLists.noActiveTracking')}
            message={t('updaterLists.noActiveTrackingMessage')}
          />
        }
      />
    </ScreenBackground>
  );
};

export default UpdaterActiveTrackingScreen;
