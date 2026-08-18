import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { toastService } from '../../services/toastService';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { OrderListCard } from '../../components/OrderListCard';
import { ScreenBackground } from '../../components/ScreenBackground';
import { getOrderStatusColor } from '../../utils/statusColors';
import { getClientListHintKey } from '../../utils/orderWorkflow';

const ClientOrdersScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const dateFrom = (route.params as any)?.date_from;
  const dateTo = (route.params as any)?.date_to;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const loadOrders = useCallback(async (targetPage: number = 1, reset: boolean = true) => {
    if (!reset && (loadingMoreRef.current || !hasMoreRef.current)) {
      return;
    }

    try {
      setLoadError(null);
      if (reset) {
        setLoading(true);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      const response = await ordersService.getOrders({
        status: statusFilter || undefined,
        page: targetPage,
        page_size: 20,
        date_from: dateFrom,
        date_to: dateTo,
      });
      const results = response?.results || [];
      setOrders((prev) => (reset ? results : [...prev, ...results]));
      setPage(targetPage);
      const nextHasMore = Boolean(response?.next);
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
    } catch (error) {
      console.error('Error loading orders:', error);
      const message = t('orders.loadErrorWithRetry');
      setLoadError(message);
      toastService.error(message);
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo, statusFilter, t]);

  useFocusEffect(
    useCallback(() => {
      setHasMore(true);
      setPage(1);
      loadOrders(1, true);
    }, [loadOrders])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    setHasMore(true);
    setPage(1);
    loadOrders(1, true);
  };

  const handleLoadMore = () => {
    if (!loading && !loadingMore && hasMore) {
      loadOrders(page + 1, false);
    }
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

  const statusFilters = [
    { code: null, label: t('orders.all') },
    { code: 'pending', label: t('orders.pending') },
    { code: 'approved_by_client', label: t('orders.approved') },
    { code: 'in_progress', label: t('orders.inProgress') },
    { code: 'in_transit', label: t('orders.inTransit') },
    { code: 'completed', label: t('orders.completed') },
    { code: 'cancelled', label: t('orders.cancelled') },
  ];

  const renderItem = ({ item, index }: { item: Order; index: number }) => {
    const advertisement =
      typeof item.advertisement === 'object' ? item.advertisement : null;
    const driver = typeof item.driver === 'object' ? item.driver : null;

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
    const hintKey = getClientListHintKey(item);

    return (
      <AnimatedListItem index={index}>
        <OrderListCard
          orderLabel={t('orders.orderNumber', { id: item.id })}
          statusLabel={item.status.name}
          statusColor={getOrderStatusColor(item.status.code, colors)}
          title={advertisement?.title}
          departureCity={departureCity}
          destinationCity={destinationCity}
          actionHint={hintKey ? t(hintKey) : undefined}
          partyLabel={driver ? t('orders.driver') : undefined}
          partyName={driver ? `${driver.first_name} ${driver.last_name}` : undefined}
          dateLabel={formatDate(item.created_at)}
          onPress={() => (navigation as any).navigate('ClientOrderDetail', { id: item.id })}
        />
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('orders.title')} subtitle={t('orders.screenSubtitle')} />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('orders.title')} subtitle={t('orders.screenSubtitle')} />
      {loadError && (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('orders.retry')}
          onActionPress={() => loadOrders(1, true)}
        />
      )}
      {!loadError && (
      <>
      <View style={styles.filters}>
        <FlatList
          horizontal
          data={statusFilters}
          keyExtractor={(item) => item.code || 'all'}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                statusFilter === item.code && styles.filterChipActive,
              ]}
              onPress={() => setStatusFilter(item.code)}>
              <Text
                style={[
                  styles.filterText,
                  statusFilter === item.code && styles.filterTextActive,
                ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={
          orders.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title={t('orders.noOrders')}
            message={t('orders.noOrders')}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
      />
      </>
      )}
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  filters: {
    backgroundColor: colors.backgroundSecondary,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    backgroundColor: colors.surfaceMuted,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    minHeight: 40,
    justifyContent: 'center',
    ...shadows.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadows.colored(colors.primary),
  },
  filterText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  filterTextActive: {
    color: colors.textLight,
    fontWeight: fontWeight.bold,
  },
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
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  orderIdContainer: {
    flex: 1,
  },
  orderIdLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderId: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.text,
    letterSpacing: 0.3,
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
    width: 12,
    height: 12,
    borderRadius: borderRadius.round,
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
  routeArrow: {
    paddingHorizontal: spacing.xs,
  },
  routeArrowText: {
    fontSize: fontSize.lg,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  driverIcon: {
    fontSize: fontSize.xl,
  },
  driverDetails: {
    flex: 1,
  },
  driverLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  driverName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
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

export default ClientOrdersScreen;
