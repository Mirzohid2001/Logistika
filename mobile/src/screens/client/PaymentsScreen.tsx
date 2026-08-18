import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { paymentsService } from '../../services/paymentsService';
import { Payment } from '../../types';
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
import { ScreenBackground } from '../../components/ScreenBackground';
import { useTranslation } from '../../hooks/useTranslation';

const PaymentsScreen = () => {
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [_hasMore, setHasMore] = useState(true);
  const [_loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const fetchIdRef = useRef(0);

  const loadPayments = useCallback(async (targetPage: number = 1, reset: boolean = true) => {
    if (!reset && (loadingMoreRef.current || !hasMoreRef.current)) {
      return;
    }

    const fetchId = ++fetchIdRef.current;

    try {
      setLoadError(null);
      if (reset) {
        setLoading(true);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      const response = await paymentsService.getMyPayments({
        status: statusFilter || undefined,
        page: targetPage,
        page_size: 20,
      });

      if (fetchId !== fetchIdRef.current) {
        return;
      }

      const results = response?.results || [];
      setPayments((prev) => (reset ? results : [...prev, ...results]));
      setPage(targetPage);
      const nextHasMore = Boolean(response?.next);
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
    } catch (error) {
      if (fetchId !== fetchIdRef.current) {
        return;
      }
      console.error('Error loading payments:', error);
      const message = t('payments.loadErrorWithRetry');
      setLoadError(message);
      toastService.error(message);
    } finally {
      if (fetchId !== fetchIdRef.current) {
        return;
      }
      loadingMoreRef.current = false;
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [statusFilter, t]);

  const loadPaymentsRef = useRef(loadPayments);
  loadPaymentsRef.current = loadPayments;

  const statusFilterInitializedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      hasMoreRef.current = true;
      setHasMore(true);
      setPage(1);
      loadPaymentsRef.current(1, true);
    }, [])
  );

  useEffect(() => {
    if (!statusFilterInitializedRef.current) {
      statusFilterInitializedRef.current = true;
      return;
    }
    hasMoreRef.current = true;
    setHasMore(true);
    setPage(1);
    loadPayments(1, true);
  }, [statusFilter, loadPayments]);

  const handleRefresh = () => {
    setRefreshing(true);
    hasMoreRef.current = true;
    setHasMore(true);
    setPage(1);
    loadPayments(1, true);
  };

  const handleLoadMore = () => {
    if (!loading && !loadingMoreRef.current && hasMoreRef.current) {
      loadPayments(page + 1, false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) {return t('common.notSpecified');}
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'processing':
        return colors.warning;
      case 'pending':
        return colors.info;
      case 'failed':
      case 'cancelled':
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return 'check-circle';
      case 'processing':
        return 'hourglass-empty';
      case 'pending':
        return 'schedule';
      case 'failed':
      case 'cancelled':
        return 'error';
      default:
        return 'info';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return t('orders.completed');
      case 'processing':
        return t('payments.processingStatus');
      case 'pending':
        return t('orders.pending');
      case 'failed':
        return t('common.error');
      case 'cancelled':
        return t('orders.cancelled');
      default:
        return status;
    }
  };

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'click':
        return 'Click';
      case 'payme':
        return 'Payme';
      case 'uzum':
        return 'Uzum';
      default:
        return method;
    }
  };

  const statusFilters = [
    { code: null, label: t('orders.all') },
    { code: 'pending', label: t('orders.pending') },
    { code: 'processing', label: t('payments.processingStatus') },
    { code: 'completed', label: t('orders.completed') },
    { code: 'failed', label: t('common.error') },
  ];

  const renderItem = ({ item, index }: { item: Payment; index: number }) => {
    return (
      <AnimatedListItem index={index}>
      <TouchableOpacity
        onPress={() =>
          (navigation as any).navigate('PaymentDetail', { id: item.id })
        }>
        <Card>
          <View style={styles.header}>
            <View style={styles.amountContainer}>
              <Text style={styles.amount}>
                {item.amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} {item.currency}
              </Text>
              <Text style={styles.method}>{getPaymentMethodName(item.payment_method)}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(item.payment_status) + '20' },
              ]}>
              <MaterialIcons
                name={getStatusIcon(item.payment_status)}
                size={14}
                color={getStatusColor(item.payment_status)}
                style={styles.statusIcon}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: getStatusColor(item.payment_status) },
                ]}>
                {getStatusLabel(item.payment_status)}
              </Text>
            </View>
          </View>
          {item.created_at && (
            <Text style={styles.date}>{formatDate(item.created_at)}</Text>
          )}
          {item.order && (
            <Text style={styles.orderId}>{t('payments.orderId')} #{item.order}</Text>
          )}
        </Card>
      </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
      <View style={styles.container}>
        <AppHeader title={t('payments.title')} subtitle={t('payments.screenSubtitle')} />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <AppHeader title={t('payments.title')} subtitle={t('payments.screenSubtitle')} />
      {loadError && (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('payments.retry')}
          onActionPress={() => loadPayments(1, true)}
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
        data={payments}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={
          payments.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title={t('payments.noPayments')}
            message={t('payments.noPaymentsYet')}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
      />
      </>
      )}
    </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  filters: {
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    backgroundColor: colors.backgroundTertiary,
    marginRight: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    paddingVertical: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  amountContainer: {
    flex: 1,
  },
  amount: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
    letterSpacing: 0.3,
  },
  method: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    gap: spacing.xs,
    ...shadows.sm,
  },
  statusIcon: {
    marginRight: spacing.xs / 2,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  orderId: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
});

export default PaymentsScreen;
