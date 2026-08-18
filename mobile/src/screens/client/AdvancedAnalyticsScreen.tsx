import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../../hooks/useTranslation';
import { userService, AdvancedAnalytics } from '../../services/userService';
import { Card } from '../../components/Card';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { EmptyState } from '../../components/EmptyState';
import { SectionEmptyNote } from '../../components/SectionEmptyNote';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

const AdvancedAnalyticsScreen = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [analytics, setAnalytics] = useState<AdvancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, _setDateFrom] = useState<string>('');
  const [dateTo, _setDateTo] = useState<string>('');

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const params: any = { type: 'client' };
      if (dateFrom) {params.date_from = dateFrom;}
      if (dateTo) {params.date_to = dateTo;}
      const data = await userService.getAdvancedAnalytics(params);
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
      setLoadFailed(true);
      setAnalytics(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  const formatPrice = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + ' so\'m';
  };

  const renderExpensesAnalysis = () => {
    if (!analytics?.expenses_analysis) {
      return <SectionEmptyNote title={t('analytics.expensesAnalysis')} />;
    }

    const { expenses_analysis } = analytics;

    return (
      <Card variant="soft" style={styles.card}>
        <Text style={styles.cardTitle}>{t('analytics.expensesAnalysis')}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('analytics.totalExpenses')}</Text>
            <Text style={styles.statValue}>{formatPrice(expenses_analysis.total_expenses)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('analytics.totalPayments')}</Text>
            <Text style={styles.statValue}>{expenses_analysis.total_payments}</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('analytics.averagePerOrder')}</Text>
            <Text style={styles.statValue}>{formatPrice(expenses_analysis.average_per_order)}</Text>
          </View>
        </View>
        {expenses_analysis.daily_expenses.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>{t('analytics.dailyExpenses')}</Text>
            <View style={styles.barChart}>
              {expenses_analysis.daily_expenses.map((item, index) => {
                const maxExpenses = Math.max(...expenses_analysis.daily_expenses.map(e => e.expenses));
                const height = maxExpenses > 0 ? (item.expenses / maxExpenses) * 100 : 0;
                return (
                  <View key={index} style={styles.barItem}>
                    <View style={[styles.bar, { height: `${height}%`, backgroundColor: colors.danger }]} />
                    <Text style={styles.barLabel}>{new Date(item.date).getDate()}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </Card>
    );
  };

  const renderBestTimes = () => {
    if (!analytics?.best_times) {
      return <SectionEmptyNote title={t('analytics.bestTimes')} />;
    }

    const { best_times } = analytics;

    return (
      <Card variant="soft" style={styles.card}>
        <Text style={styles.cardTitle}>{t('analytics.bestTimes')}</Text>
        {best_times.best_hour !== null && (
          <View style={styles.bestTimeBadge}>
            <MaterialIcons name="schedule" size={20} color={colors.success} />
            <Text style={styles.bestTimeText}>
              {t('analytics.bestHour')}: {best_times.best_hour}:00
            </Text>
          </View>
        )}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>{t('analytics.hourlyDistribution')}</Text>
          <View style={styles.barChart}>
            {best_times.hourly_distribution.map((item) => {
              const maxCount = Math.max(...best_times.hourly_distribution.map(h => h.count));
              const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              return (
                <View key={item.hour} style={styles.barItem}>
                  <View style={[styles.bar, { height: `${height}%`, backgroundColor: colors.secondary }]} />
                  <Text style={styles.barLabel}>{item.hour}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </Card>
    );
  };

  const renderBestRoutes = () => {
    if (!analytics?.best_routes || analytics.best_routes.length === 0) {
      return <SectionEmptyNote title={t('analytics.bestRoutes')} />;
    }

    return (
      <Card variant="soft" style={styles.card}>
        <Text style={styles.cardTitle}>{t('analytics.bestRoutes')}</Text>
        {analytics.best_routes.map((route, index) => (
          <View key={index} style={styles.routeItem}>
            <View style={styles.routeInfo}>
              <View style={styles.routePath}>
                <View style={styles.routeDot} />
                <Text style={styles.routeCity}>{route.from}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePath}>
                <View style={[styles.routeDot, styles.routeDotDestination]} />
                <Text style={styles.routeCity}>{route.to}</Text>
              </View>
            </View>
            <View style={styles.routeStats}>
              <Text style={styles.routeCount}>{route.count} {t('analytics.orders')}</Text>
              {route.total_cost && (
                <Text style={styles.routeAmount}>{formatPrice(route.total_cost)}</Text>
              )}
            </View>
          </View>
        ))}
      </Card>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('analytics.title')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (loadFailed || !analytics) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('analytics.title')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadAnalytics}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.content}>
        <AppHeader variant="hero" title={t('analytics.title')} />
        {renderExpensesAnalysis()}
        {renderBestTimes()}
        {renderBestRoutes()}
      </View>
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    marginRight: 8,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  chartContainer: {
    marginTop: 20,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    paddingHorizontal: 8,
  },
  barItem: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  bar: {
    width: '100%',
    backgroundColor: colors.success,
    borderRadius: 4,
    marginBottom: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  bestTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successGlow,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  bestTimeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.success,
    marginLeft: 8,
  },
  routeItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  routeInfo: {
    marginBottom: 8,
  },
  routePath: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 8,
  },
  routeDotDestination: {
    backgroundColor: colors.success,
  },
  routeCity: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  routeLine: {
    width: 2,
    height: 12,
    backgroundColor: colors.border,
    marginLeft: 3,
    marginBottom: 4,
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeCount: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  routeAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});

export default AdvancedAnalyticsScreen;
