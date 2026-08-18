import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ordersService } from '../../services/ordersService';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Card } from '../../components/Card';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  DashboardLoading,
  DashboardEmpty,
  DashboardPeriodSelector,
  DashboardStatCard,
  DashboardActionButton,
  DashboardTrendCard,
  DashboardWelcomeCard,
  useDashboardStyles,
} from '../../components/dashboard/DashboardWidgets';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { formatMoney, formatTime, formatLongDate } from '../../utils/formatLocale';
import { useAppTheme } from '../../theme/useAppTheme';
import { navigateMainTab } from '../../utils/navigationHelpers';
import { DriverVerificationBanner } from '../../components/DriverVerificationBanner';
import { VehicleVerificationBanner } from '../../components/VehicleVerificationBanner';
import { BackhaulMatchesCard } from '../../components/BackhaulMatchesCard';
import { DriverAvailabilityCard } from '../../components/DriverAvailabilityCard';
import { DocumentExpiryCard } from '../../components/DocumentExpiryCard';
import { vehiclesService } from '../../services/vehiclesService';
import { Vehicle } from '../../types';

const DriverDashboardScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const { dashboardStyles: ds } = useDashboardStyles();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [selectedTrendDate, setSelectedTrendDate] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(12))[0];

  const buildDateRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const format = (d: Date) => d.toISOString().slice(0, 10);
    return { dateFrom: format(start), dateTo: format(end) };
  };

  const loadStats = useCallback(async () => {
    try {
      if (!isBootstrapped) {
        setLoading(true);
      }
      const { dateFrom, dateTo } = buildDateRange(periodDays);
      const [statisticsResult, activeResult, completedResult, vehiclesResult] = await Promise.allSettled([
        ordersService.getDriverStatistics(dateFrom, dateTo),
        ordersService.getOrders({ status: 'active' }),
        ordersService.getOrders({ status: 'completed' }),
        vehiclesService.getVehicles(),
      ]);

      const statistics = statisticsResult.status === 'fulfilled' ? statisticsResult.value : null;
      const activeOrdersRaw = activeResult.status === 'fulfilled' ? activeResult.value : null;
      const completedOrdersRaw =
        completedResult.status === 'fulfilled' ? completedResult.value : null;
      const vehiclesData = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : null;

      const partialFailed =
        statisticsResult.status === 'rejected' ||
        activeResult.status === 'rejected' ||
        completedResult.status === 'rejected' ||
        vehiclesResult.status === 'rejected';

      if (!statistics && !activeOrdersRaw && !completedOrdersRaw) {
        setErrorMessage(t('dashboard.loadError'));
        setStats((prev: any) => prev);
        return;
      }

      setStats((prev: any) => ({
        statistics: {
          total_earnings: Number(statistics?.total_earnings ?? prev?.statistics?.total_earnings ?? 0),
          completed_orders: Number(
            statistics?.completed_orders ?? prev?.statistics?.completed_orders ?? 0,
          ),
          average_rating: Number(statistics?.average_rating ?? prev?.statistics?.average_rating ?? 0),
          earnings_today: Number(statistics?.earnings_today ?? prev?.statistics?.earnings_today ?? 0),
          earnings_month: Number(statistics?.earnings_month ?? prev?.statistics?.earnings_month ?? 0),
          daily_earnings: (statistics?.daily_earnings || prev?.statistics?.daily_earnings || []).map(
            (item: any) => ({
              date: String(item.date),
              earnings: Number(item.earnings || 0),
            }),
          ),
        },
        activeOrders: activeOrdersRaw
          ? Array.isArray(activeOrdersRaw)
            ? activeOrdersRaw
            : activeOrdersRaw.results || []
          : prev?.activeOrders || [],
        completedOrders: completedOrdersRaw
          ? Array.isArray(completedOrdersRaw)
            ? completedOrdersRaw
            : completedOrdersRaw.results || []
          : prev?.completedOrders || [],
      }));
      if (vehiclesData) {
        setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
      }
      setLastUpdatedAt(new Date().toISOString());
      setSelectedTrendDate(null);
      setErrorMessage(partialFailed ? t('dashboard.loadError') : null);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setErrorMessage(t('dashboard.loadError'));
    } finally {
      setIsBootstrapped(true);
      setLoading(false);
      setRefreshing(false);
    }
  }, [isBootstrapped, periodDays, t]);

  useFocusEffect(
    useCallback(() => {
      loadStats();

      const interval = setInterval(() => {
        loadStats();
      }, 30000);

      return () => clearInterval(interval);
    }, [loadStats])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  useEffect(() => {
    if (!loading && stats) {
      fadeAnim.setValue(0);
      slideAnim.setValue(12);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading, stats, fadeAnim, slideAnim]);

  if (loading) {
    return <DashboardLoading />;
  }
  if (!stats) {
    return (
      <DashboardEmpty
        title={t('dashboard.unavailable')}
        message={t('dashboard.unavailableMessage')}
        retryLabel={t('dashboard.retry')}
        onRetry={loadStats}
      />
    );
  }

  const { statistics, activeOrders } = stats;
  const dailyTrend = statistics.daily_earnings || [];
  const selectedTrend =
    selectedTrendDate != null ? dailyTrend.find((d: any) => d.date === selectedTrendDate) || null : null;
  const currencySuffix = t('dashboard.currencySuffix');

  return (
    <ScreenBackground>
      <ScrollView
        style={ds.screen}
        contentContainerStyle={ds.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <AppHeader variant="hero" title={t('dashboard.home')} />
        {!!errorMessage && (
          <View style={ds.warningBox}>
            <MaterialIcons name="warning-amber" size={16} color={colors.warning} />
            <Text style={ds.warningText}>{errorMessage}</Text>
          </View>
        )}
        <DriverVerificationBanner />
        <VehicleVerificationBanner vehicles={vehicles} />
        <DocumentExpiryCard />
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <DashboardWelcomeCard
            title={`${t('dashboard.welcome')}, ${user?.first_name}!`}
            subtitle={t('dashboard.driverWelcome')}
            accentColor={colors.primary}
          />
        </Animated.View>
        <DriverAvailabilityCard />
        <BackhaulMatchesCard />
        <DashboardPeriodSelector
          value={periodDays}
          onChange={setPeriodDays}
          labelForDays={(days) => t('dashboard.periodDays', { count: days })}
          accentColor={colors.primary}
        />
        <Text style={ds.updatedAtText}>
          {t('dashboard.lastUpdated')}: {formatTime(lastUpdatedAt, currentLanguage)}
        </Text>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={ds.statsGrid}>
            <DashboardStatCard
              icon="account-balance-wallet"
              iconColor={colors.primary}
              value={formatMoney(statistics.total_earnings, currentLanguage, currencySuffix)}
              label={t('dashboard.totalEarnings')}
            />
            <DashboardStatCard
              icon="check-circle"
              iconColor={colors.success}
              value={String(statistics.completed_orders)}
              label={t('dashboard.completedOrders')}
            />
            <DashboardStatCard
              icon="local-shipping"
              iconColor={colors.logisticsAccent}
              value={String(activeOrders.length)}
              label={t('dashboard.activeOrders')}
            />
            <DashboardStatCard
              icon="star"
              iconColor={colors.secondary}
              value={statistics.average_rating ? statistics.average_rating.toFixed(1) : '0.0'}
              label={t('dashboard.averageRating')}
            />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Card variant="soft" style={ds.quickStatsCard}>
            <Text style={ds.cardTitle}>{t('dashboard.earningsOverview')}</Text>
            <View style={ds.quickStatsRow}>
              <View style={ds.quickStatItem}>
                <Text style={ds.quickStatLabel}>{t('dashboard.todayShort')}</Text>
                <Text style={ds.quickStatValue}>
                  {formatMoney(statistics.earnings_today, currentLanguage, currencySuffix)}
                </Text>
              </View>
              <View style={ds.quickStatDivider} />
              <View style={ds.quickStatItem}>
                <Text style={ds.quickStatLabel}>{t('dashboard.monthShort')}</Text>
                <Text style={ds.quickStatValue}>
                  {formatMoney(statistics.earnings_month, currentLanguage, currencySuffix)}
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>

        {dailyTrend.length > 0 && (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <DashboardTrendCard
              title={t('dashboard.earningsTrend', { days: periodDays })}
              items={dailyTrend.map((item: any) => ({ date: item.date, value: item.earnings }))}
              selectedDate={selectedTrendDate}
              onSelectDate={setSelectedTrendDate}
              language={currentLanguage}
              accentColor={colors.primary}
              emptyMessage={t('dashboard.trendEmpty')}
              detailText={
                selectedTrend
                  ? t('dashboard.earningsOnDay', {
                      date: formatLongDate(selectedTrend.date, currentLanguage),
                      amount: formatMoney(selectedTrend.earnings, currentLanguage, currencySuffix),
                    })
                  : undefined
              }
              detailActionLabel={selectedTrend ? t('dashboard.ordersOnDay') : undefined}
              onDetailAction={
                selectedTrend
                  ? () =>
                      (navigation as any).navigate('Orders', {
                        filter: 'all',
                        date_from: selectedTrend.date,
                        date_to: selectedTrend.date,
                      })
                  : undefined
              }
            />
          </Animated.View>
        )}

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={ds.actions}>
            <DashboardActionButton
              icon="search"
              label={t('dashboard.searchLoads')}
              onPress={() => (navigation as any).navigate('AvailableAdvertisements')}
            />
            <DashboardActionButton
              icon="list"
              label={t('dashboard.activeOrdersList')}
              onPress={() => (navigation as any).navigate('Orders', { filter: 'active' })}
            />
            <DashboardActionButton
              icon="account-balance-wallet"
              label={t('dashboard.earnings')}
              onPress={() => (navigation as any).navigate('Earnings')}
            />
            <DashboardActionButton
              icon="bar-chart"
              label={t('dashboard.detailedStatistics')}
              onPress={() => (navigation as any).navigate('Statistics')}
              variant="secondary"
            />
            <DashboardActionButton
              icon="analytics"
              label={t('analytics.title')}
              onPress={() => (navigation as any).navigate('AdvancedAnalytics')}
              variant="secondary"
            />
            <DashboardActionButton
              icon="chat"
              label={t('dashboard.openChats')}
              onPress={() => navigateMainTab(navigation as any, 'Chats')}
              variant="secondary"
            />
          </View>
        </Animated.View>

        {activeOrders.length > 0 && (
          <Card variant="soft" style={ds.recentCard}>
            <View style={ds.recentHeader}>
              <Text style={ds.cardTitle}>{t('dashboard.activeOrders')}</Text>
              <TouchableOpacity
                onPress={() => (navigation as any).navigate('Orders', { filter: 'active' })}>
                <Text style={ds.seeAllText}>{t('dashboard.seeAll')} ›</Text>
              </TouchableOpacity>
            </View>
            {activeOrders.slice(0, 3).map((order: any) => (
              <TouchableOpacity
                key={order.id}
                style={ds.recentItem}
                onPress={() => (navigation as any).navigate('OrderDetail', { id: order.id })}>
                <View style={ds.recentItemContent}>
                  <Text style={ds.recentItemTitle}>{t('orders.title')} #{order.id}</Text>
                  <Text style={ds.recentItemStatus}>{order.status?.name || order.status?.code || '—'}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </ScrollView>
    </ScreenBackground>
  );
};

export default DriverDashboardScreen;
