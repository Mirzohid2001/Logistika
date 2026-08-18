import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { Payment } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { createListScreenStyles } from '../../theme/listScreenStyles';
import { formatDateTime } from '../../utils/formatLocale';

const UpdaterPaymentMonitoringScreen = () => {
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createListScreenStyles(colors), [colors]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await updaterService.getPaymentMonitoring();
      setPayments(data);
    } catch (error) {
      console.error('Error loading payment monitoring:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPayments();
    }, [loadPayments])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadPayments();
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'processing':
        return colors.warning;
      case 'failed':
      case 'cancelled':
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  const renderItem = ({ item, index }: { item: Payment; index: number }) => {
    const statusColor = getPaymentStatusColor(item.payment_status);
    const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';

    return (
      <AnimatedListItem index={index}>
        <Card variant="soft">
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>
              {t('updaterLists.paymentNumber', { id: item.id })}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {item.payment_status}
              </Text>
            </View>
          </View>
          <View style={localStyles.row}>
            <Text style={styles.rowSubtitle}>{t('updaterLists.amount')}:</Text>
            <Text style={styles.rowTitle}>
              {item.amount.toLocaleString(locale)} {item.currency}
            </Text>
          </View>
          <View style={localStyles.row}>
            <Text style={styles.rowSubtitle}>{t('updaterLists.paymentMethod')}:</Text>
            <Text style={styles.rowTitle}>{item.payment_method}</Text>
          </View>
          {item.created_at ? (
            <Text style={styles.rowMeta}>{formatDateTime(item.created_at, currentLanguage)}</Text>
          ) : null}
        </Card>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('updaterLists.paymentMonitoringTitle')} />
      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={payments}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={
            payments.length === 0 ? styles.emptyContainer : styles.listContainer
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              title={t('updaterLists.noPayments')}
              message={t('updaterLists.noPaymentsMessage')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

const localStyles = {
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 4,
  },
};

export default UpdaterPaymentMonitoringScreen;
