import React, { useState, useCallback, useMemo } from 'react';
import { Text, FlatList, TouchableOpacity, RefreshControl, View } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
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

const DispatcherClientOrdersScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createListScreenStyles(colors), [colors]);
  const { clientId } = route.params as { clientId: number };

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dispatcherService.getClientOrders(clientId);
      setOrders(data);
    } catch (error) {
      console.error('Error loading client orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
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
          onPress={() => (navigation as any).navigate('DispatcherOrderDetail', { id: item.id })}>
          <Card variant="soft">
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>
                {t('updaterLists.orderNumber', { id: item.id })}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>{item.status.name}</Text>
              </View>
            </View>
            {advertisement ? (
              <Text style={styles.rowTitle} numberOfLines={1}>
                {advertisement.title}
              </Text>
            ) : null}
            <Text style={styles.rowMeta}>{formatDateTime(item.created_at, currentLanguage)}</Text>
          </Card>
        </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('dispatcherLists.clientOrdersTitle')} />
      {loading ? (
        <SkeletonCard />
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              title={t('dispatcherLists.noOrders')}
              message={t('dispatcherLists.noOrdersMessage')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

export default DispatcherClientOrdersScreen;
