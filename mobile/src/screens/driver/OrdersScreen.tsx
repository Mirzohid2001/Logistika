import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { ordersService } from '../../services/ordersService';
import { useTranslation } from '../../hooks/useTranslation';
import { Order } from '../../types';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles, type AppColors } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { OrderListCard } from '../../components/OrderListCard';
import { getOrderStatusColor } from '../../utils/statusColors';
import { getDriverListHintKey, sortOrdersByWorkflowPriority } from '../../utils/orderWorkflow';

const OrdersScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const filter = (route.params as any)?.filter || 'all';
  const dateFrom = (route.params as any)?.date_from;
  const dateTo = (route.params as any)?.date_to;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getTitle = () => {
    switch (filter) {
      case 'active':
        return t('orders.activeOrders');
      case 'completed':
        return t('orders.orderHistory');
      default:
        return t('orders.title');
    }
  };

  const getEmptyMessage = () => {
    switch (filter) {
      case 'active':
        return t('orders.noActiveOrders');
      case 'completed':
        return t('orders.noCompletedOrders');
      default:
        return t('orders.noOrders');
    }
  };

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filter === 'active') {
        params.status = 'active';
      } else if (filter === 'completed') {
        params.status = 'history';
      }
      if (dateFrom) {
        params.date_from = dateFrom;
      }
      if (dateTo) {
        params.date_to = dateTo;
      }
      const response = await ordersService.getOrders(params);
      const results = Array.isArray(response) ? response : response.results || [];

      let filteredResults = results;
      if (filter === 'active') {
        filteredResults = results.filter(
          (order: Order) =>
            !['completed', 'cancelled', 'rejected', 'stopped'].includes(order.status.code)
        );
      } else if (filter === 'completed') {
        filteredResults = results.filter(
          (order: Order) =>
            ['completed', 'cancelled', 'rejected', 'stopped'].includes(order.status.code)
        );
      }

      setOrders(sortOrdersByWorkflowPriority(filteredResults));
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo, filter]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item, index }: { item: Order; index: number }) => {
    const statusColor = getOrderStatusColor(item.status.code, colors);
    const actionHintKey = getDriverListHintKey(item.status.code, item);
    const advertisement =
      typeof item.advertisement === 'object' ? item.advertisement : null;
    const client = typeof item.client === 'object' ? item.client : null;

    const departureCity =
      advertisement &&
      typeof advertisement.departure_city === 'object' &&
      advertisement.departure_city
        ? advertisement.departure_city.name
        : '';
    const destinationCity =
      advertisement &&
      typeof advertisement.destination_city === 'object' &&
      advertisement.destination_city
        ? advertisement.destination_city.name
        : '';

    return (
      <AnimatedListItem index={index}>
        <OrderListCard
          orderLabel={t('orders.orderNumber', { id: item.id })}
          statusLabel={item.status.name}
          statusColor={statusColor}
          title={advertisement?.title}
          departureCity={departureCity}
          destinationCity={destinationCity}
          actionHint={actionHintKey ? t(actionHintKey) : undefined}
          partyLabel={client ? t('orders.client') : undefined}
          partyName={client ? `${client.first_name} ${client.last_name}` : undefined}
          dateLabel={formatDate(item.created_at)}
          onPress={() => (navigation as any).navigate('OrderDetail', { id: item.id })}
        />
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={getTitle()} subtitle={t('orders.screenSubtitle')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={getTitle()} subtitle={t('orders.screenSubtitle')} />
      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={
          orders.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title={getTitle()}
            message={getEmptyMessage()}
          />
        }
      />
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  listContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 24,
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
  },
  orderCard: {
    marginBottom: 0,
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  orderId: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.round,
  },
  routeDotPickup: {
    backgroundColor: colors.logisticsAccent,
  },
  routeDotDest: {
    backgroundColor: colors.success,
  },
  routeCity: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  routeArrowText: {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.xs,
  },
  actionHint: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  clientInline: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  chevron: {
    fontSize: fontSize.xl,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
});

export default OrdersScreen;
