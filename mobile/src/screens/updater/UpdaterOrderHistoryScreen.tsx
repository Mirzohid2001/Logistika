import React, { useState, useCallback } from 'react';
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
import { useThemedStyles, useListScreenStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { getOrderStatusColor } from '../../utils/statusColors';
import { formatDateTime } from '../../utils/formatLocale';
import { spacing, borderRadius, fontSize } from '../../theme';

const UpdaterOrderHistoryScreen = () => {
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const listStyles = useListScreenStyles();
  const styles = useThemedStyles(createStyles);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderIdFilter, setOrderIdFilter] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params: { order_id?: number } = {};
      if (orderIdFilter) {
        params.order_id = parseInt(orderIdFilter, 10);
      }
      const data = await updaterService.getOrderHistory(params);
      setOrders(data);
    } catch (error) {
      console.error('Error loading order history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderIdFilter]);

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
          onPress={() => (navigation as any).navigate('UpdaterOrderUpdate', { id: item.id })}>
          <Card variant="soft">
            <View style={listStyles.listHeader}>
              <Text style={listStyles.listTitle}>
                {t('updaterLists.orderNumber', { id: item.id })}
              </Text>
              <View style={[listStyles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[listStyles.statusText, { color: statusColor }]}>
                  {item.status.name}
                </Text>
              </View>
            </View>
            {advertisement && (
              <Text style={listStyles.rowTitle} numberOfLines={1}>
                {advertisement.title}
              </Text>
            )}
            <Text style={listStyles.rowMeta}>
              {formatDateTime(item.created_at, currentLanguage)}
            </Text>
          </Card>
        </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader
        variant="hero"
        title={t('updaterLists.historyTitle')}
        subtitle={t('updaterLists.historySubtitle')}
      />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('updaterLists.searchByOrderId')}
          value={orderIdFilter}
          onChangeText={setOrderIdFilter}
          placeholderTextColor={colors.textTertiary}
          keyboardType="numeric"
        />
      </View>
      {loading ? (
        <View style={listStyles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={
            orders.length === 0 ? listStyles.emptyContainer : listStyles.listContainer
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              title={t('updaterLists.noHistory')}
              message={t('updaterLists.noHistoryMessage')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    searchContainer: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    searchInput: {
      backgroundColor: colors.backgroundTertiary,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.sm,
      color: colors.text,
    },
  });

export default UpdaterOrderHistoryScreen;
