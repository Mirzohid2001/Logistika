import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { Order } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { createListScreenStyles } from '../../theme/listScreenStyles';
import { getOrderStatusColor } from '../../utils/statusColors';
import { formatDateTime } from '../../utils/formatLocale';

const UpdaterPendingUpdatesScreen = () => {
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
      const data = await updaterService.getPendingUpdates();
      setOrders(data);
    } catch (error) {
      console.error('Error loading pending updates:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
      const interval = setInterval(loadOrders, 20000);
      return () => clearInterval(interval);
    }, [loadOrders])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const renderItem = ({ item, index }: { item: Order; index: number }) => {
    const advertisement = typeof item.advertisement === 'object' ? item.advertisement : null;
    const statusColor = getOrderStatusColor(item.status.code, colors);

    return (
      <AnimatedListItem index={index}>
        <TouchableOpacity
          onPress={() => (navigation as any).navigate('UpdaterOrderUpdate', { id: item.id })}>
          <Card variant="soft">
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>
                {t('updaterLists.orderNumber', { id: item.id })}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{item.status.name}</Text>
              </View>
            </View>
            {advertisement && (
              <Text style={styles.rowTitle} numberOfLines={1}>
                {advertisement.title}
              </Text>
            )}
            <Text style={styles.rowMeta}>{formatDateTime(item.created_at, currentLanguage)}</Text>
          </Card>
        </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('updaterLists.pendingTitle')} />
      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              title={t('updaterLists.noPendingUpdates')}
              message={t('updaterLists.allUpdated')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

export default UpdaterPendingUpdatesScreen;
