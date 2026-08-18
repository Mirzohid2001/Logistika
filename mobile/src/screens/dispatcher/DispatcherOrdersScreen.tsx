import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { Order } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { useTranslation } from '../../hooks/useTranslation';
import { getOrderStatusColor } from '../../utils/statusColors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';

const DispatcherOrdersScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'status' | 'id'>('date');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (statusFilter) {
        params.status = statusFilter;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      if (dateFrom) {
        params.date_from = dateFrom;
      }
      if (dateTo) {
        params.date_to = dateTo;
      }
      const data = await dispatcherService.getOrders(params);

      let sortedData = [...data];
      if (sortBy === 'date') {
        sortedData.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (sortBy === 'status') {
        sortedData.sort((a, b) => a.status.code.localeCompare(b.status.code));
      } else if (sortBy === 'id') {
        sortedData.sort((a, b) => b.id - a.id);
      }

      setOrders(sortedData);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery, dateFrom, dateTo, sortBy]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      loadOrders();
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders();
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (orders.length > 0) {
      let sortedData = [...orders];
      if (sortBy === 'date') {
        sortedData.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (sortBy === 'status') {
        sortedData.sort((a, b) => a.status.code.localeCompare(b.status.code));
      } else if (sortBy === 'id') {
        sortedData.sort((a, b) => b.id - a.id);
      }
      setOrders(sortedData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading && !refreshing) {
        loadOrders();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadOrders, loading, refreshing]);

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

  const statusFilters = [
    { code: null, label: t('dispatcherLists.filterAll') },
    { code: 'active', label: t('dispatcherLists.filterActive') },
    { code: 'pending', label: t('dispatcherLists.filterPending') },
    { code: 'problematic', label: t('dispatcherLists.filterProblematic') },
  ];

  const sortOptions = [
    { value: 'date', label: t('dispatcherLists.sortDate') },
    { value: 'status', label: t('dispatcherLists.sortStatus') },
    { value: 'id', label: t('dispatcherLists.sortId') },
  ];

  const clearFilters = () => {
    setStatusFilter(null);
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setSortBy('date');
  };

  const renderItem = ({ item, index }: { item: Order; index: number }) => {
    const advertisement =
      typeof item.advertisement === 'object' ? item.advertisement : null;
    const driver = typeof item.driver === 'object' ? item.driver : null;
    const client = typeof item.client === 'object' ? item.client : null;

    return (
      <AnimatedListItem index={index}>
      <TouchableOpacity
        onPress={() =>
          (navigation as any).navigate('DispatcherOrderDetail', { id: item.id })
        }>
        <Card variant="soft">
          <View style={styles.header}>
            <Text style={styles.orderId}>
              {t('updaterLists.orderNumber', { id: item.id })}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getOrderStatusColor(item.status.code, colors) + '20' },
              ]}>
              <Text
                style={[
                  styles.statusText,
                  { color: getOrderStatusColor(item.status.code, colors) },
                ]}>
                {item.status.name}
              </Text>
            </View>
          </View>

          {advertisement && (
            <Text style={styles.title} numberOfLines={1}>
              {advertisement.title}
            </Text>
          )}

          {client && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('dispatcherLists.clientLabel')}</Text>
              <Text style={styles.value}>
                {client.first_name} {client.last_name}
              </Text>
            </View>
          )}

          {driver && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('dispatcherLists.driverLabel')}</Text>
              <Text style={styles.value}>
                {driver.first_name} {driver.last_name}
              </Text>
            </View>
          )}

          <Text style={styles.date}>{formatDate(item.created_at)}</Text>
        </Card>
      </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader
        variant="hero"
        title={t('dispatcherLists.ordersTitle')}
        subtitle={t('dispatcherLists.ordersSubtitle')}
      />
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('dispatcherLists.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(!showFilters)}>
            <MaterialIcons
              name={showFilters ? 'filter-list' : 'filter-list-off'}
              size={24}
              color={showFilters ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              const currentIndex = sortOptions.findIndex(opt => opt.value === sortBy);
              const nextIndex = (currentIndex + 1) % sortOptions.length;
              setSortBy(sortOptions[nextIndex].value as any);
            }}>
            <MaterialIcons name="sort" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.advancedFilters}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>{t('dispatcherLists.dateFrom')}</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                value={dateFrom}
                onChangeText={setDateFrom}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>{t('dispatcherLists.dateTo')}</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="YYYY-MM-DD"
                value={dateTo}
                onChangeText={setDateTo}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={clearFilters}>
              <Text style={styles.clearButtonText}>{t('dispatcherLists.clearFilters')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {sortBy !== 'date' && (
          <View style={styles.sortIndicator}>
            <Text style={styles.sortIndicatorText}>
              {t('dispatcherLists.sortBy', {
                label: sortOptions.find((opt) => opt.value === sortBy)?.label,
              })}
            </Text>
          </View>
        )}
      </View>

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
              onPress={() => {
                setStatusFilter(item.code);
              }}>
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
          contentContainerStyle={
            orders.length === 0 ? styles.emptyContainer : styles.listContainer
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
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

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  skeletonWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  searchContainer: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  filters: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  filterTextActive: {
    color: colors.textLight,
  },
  listContainer: {
    paddingVertical: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  emptyContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 8,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  date: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterButton: {
    padding: 8,
  },
  sortButton: {
    padding: 8,
  },
  advancedFilters: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    width: 100,
  },
  dateInput: {
    flex: 1,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  clearButton: {
    backgroundColor: colors.danger,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: 8,
  },
  clearButtonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  sortIndicator: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primaryGlow,
    borderRadius: borderRadius.sm,
  },
  sortIndicatorText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
});

export default DispatcherOrdersScreen;
