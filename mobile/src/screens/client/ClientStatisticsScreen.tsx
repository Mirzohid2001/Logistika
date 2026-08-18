import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ordersService } from '../../services/ordersService';
import { ClientStatistics } from '../../types';
import { Card } from '../../components/Card';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';

const { width } = Dimensions.get('window');

const ClientStatisticsScreen = () => {
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [statistics, setStatistics] = useState<ClientStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatistics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await ordersService.getClientStatistics();
      setStatistics(data);
    } catch (error) {
      console.error('Error loading statistics:', error);
      setStatistics(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStatistics();
    }, [loadStatistics])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadStatistics();
  };

  const formatMoney = (amount: number) =>
    `${amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} ${t('dashboard.currencySuffix')}`;

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('statistics.title')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (!statistics) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('statistics.title')} />
        <EmptyState
          variant="error"
          title={t('dispatcherLists.loadError')}
          message={t('errors.tryAgain')}
          actionText={t('dispatcherLists.retry')}
          onActionPress={loadStatistics}
        />
      </ScreenBackground>
    );
  }

  const maxDailySpending = Math.max(...statistics.daily_spending.map((d) => d.spending), 1);
  const maxMonthlySpending = Math.max(...statistics.monthly_spending.map((m) => m.spending), 1);

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <AppHeader variant="hero" title={t('statistics.title')} subtitle={t('statistics.spending')} />
        <Card variant="elevated" style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('statistics.totalSpending')}</Text>
          <Text style={styles.summaryAmount}>{formatMoney(statistics.total_spent)}</Text>
        </Card>

        <Card variant="soft" style={styles.statsCard}>
          <Text style={styles.cardTitle}>{t('statistics.spending')}</Text>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('statistics.today')}</Text>
              <Text style={styles.statValue}>{formatMoney(statistics.spent_today)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('statistics.thisWeek')}</Text>
              <Text style={styles.statValue}>{formatMoney(statistics.spent_week)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('statistics.thisMonth')}</Text>
              <Text style={styles.statValue}>{formatMoney(statistics.spent_month)}</Text>
            </View>
          </View>
        </Card>

        <Card variant="soft" style={styles.statsCard}>
          <Text style={styles.cardTitle}>{t('statistics.ordersSection')}</Text>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('orders.all')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{statistics.total_orders}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('orders.completed')}</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {statistics.completed_orders}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('dashboard.activeOrders')}</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {statistics.active_orders}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('statistics.averageOrder')}</Text>
            <Text style={styles.statValue}>{formatMoney(statistics.avg_order_cost)}</Text>
          </View>
        </Card>

        {statistics.daily_spending.length > 0 && (
          <Card variant="soft" style={styles.statsCard}>
            <Text style={styles.cardTitle}>{t('statistics.dailySpending7')}</Text>
            <View style={styles.chartContainer}>
              {statistics.daily_spending.map((item, index) => {
                const date = new Date(item.date);
                const dayName = date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
                  weekday: 'short',
                });
                const height = maxDailySpending > 0 ? (item.spending / maxDailySpending) * 150 : 0;

                return (
                  <View key={index} style={styles.barContainer}>
                    <View style={[styles.bar, { height: Math.max(height, 5) }]} />
                    <Text style={styles.barLabel}>{dayName}</Text>
                    <Text style={styles.barValue}>{(item.spending / 1000).toFixed(0)}k</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {statistics.monthly_spending.length > 0 && (
          <Card variant="soft" style={styles.statsCard}>
            <Text style={styles.cardTitle}>{t('statistics.monthlySpending6')}</Text>
            <View style={styles.chartContainer}>
              {statistics.monthly_spending.map((item, index) => {
                const monthIndex = parseInt(item.month.split('-')[1], 10) - 1;
                const label =
                  monthIndex >= 0
                    ? new Date(2024, monthIndex, 1).toLocaleDateString(
                        currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ',
                        { month: 'short' },
                      )
                    : item.month.split('-')[1];
                const height = maxMonthlySpending > 0 ? (item.spending / maxMonthlySpending) * 150 : 0;

                return (
                  <View key={index} style={styles.barContainer}>
                    <View style={[styles.bar, styles.barSpending, { height: Math.max(height, 5) }]} />
                    <Text style={styles.barLabel}>{label}</Text>
                    <Text style={styles.barValue}>{(item.spending / 1000000).toFixed(1)}M</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 24,
  },
  summaryCard: {
    backgroundColor: colors.warning,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.colored(colors.warning),
  },
  summaryTitle: {
    fontSize: fontSize.base,
    color: colors.textLight,
    opacity: 0.95,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  summaryAmount: {
    fontSize: fontSize.huge,
    fontWeight: fontWeight.extrabold,
    color: colors.textLight,
    letterSpacing: -0.5,
  },
  statsCard: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textAlign: 'center',
    fontWeight: fontWeight.semibold,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 200,
    paddingVertical: spacing.lg,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: (width - 80) / 7,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  barSpending: {
    backgroundColor: colors.warning,
  },
  barLabel: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  barValue: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
});

export default ClientStatisticsScreen;
