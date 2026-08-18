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
import { advertisementsService } from '../../services/advertisementsService';
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

const ClientDashboardScreen = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const { dashboardStyles: ds } = useDashboardStyles();
  const accent = colors.warning;
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [selectedTrendDate, setSelectedTrendDate] = useState<string | null>(null);
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
      const [statisticsResult, activeResult, adsResult] = await Promise.allSettled([
        ordersService.getClientStatistics(dateFrom, dateTo),
        ordersService.getOrders({ status: 'active' }),
        advertisementsService.getMyAdvertisements(),
      ]);

      const statistics = statisticsResult.status === 'fulfilled' ? statisticsResult.value : null;
      const activeOrdersRaw = activeResult.status === 'fulfilled' ? activeResult.value : null;
      const myAdvertisementsRaw = adsResult.status === 'fulfilled' ? adsResult.value : null;

      const partialFailed =
        statisticsResult.status === 'rejected' ||
        activeResult.status === 'rejected' ||
        adsResult.status === 'rejected';

      if (!statistics && !activeOrdersRaw && !myAdvertisementsRaw) {
        setErrorMessage(t('dashboard.loadError'));
        setStats((prev: any) => prev);
        return;
      }

      setStats((prev: any) => ({
        statistics: {
          total_spent: Number(statistics?.total_spent ?? prev?.statistics?.total_spent ?? 0),
          completed_orders: Number(
            statistics?.completed_orders ?? prev?.statistics?.completed_orders ?? 0,
          ),
          spent_today: Number(statistics?.spent_today ?? prev?.statistics?.spent_today ?? 0),
          spent_month: Number(statistics?.spent_month ?? prev?.statistics?.spent_month ?? 0),
          daily_spending: (statistics?.daily_spending || prev?.statistics?.daily_spending || []).map(
            (item: any) => ({
              date: String(item.date),
              spending: Number(item.spending || 0),
            }),
          ),
        },
        activeOrders: activeOrdersRaw
          ? Array.isArray(activeOrdersRaw)
            ? activeOrdersRaw
            : activeOrdersRaw.results || []
          : prev?.activeOrders || [],
        myAdvertisements: myAdvertisementsRaw
          ? Array.isArray(myAdvertisementsRaw)
            ? myAdvertisementsRaw
            : myAdvertisementsRaw.results || []
          : prev?.myAdvertisements || [],
      }));
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

  const { statistics, activeOrders, myAdvertisements } = stats;
  const dailyTrend = statistics.daily_spending || [];
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
      <DashboardPeriodSelector
        value={periodDays}
        onChange={setPeriodDays}
        labelForDays={(days) => t('dashboard.periodDays', { count: days })}
        accentColor={accent}
      />
      <Text style={ds.updatedAtText}>
        {t('dashboard.lastUpdated')}: {formatTime(lastUpdatedAt, currentLanguage)}
      </Text>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <DashboardWelcomeCard
        title={`${t('dashboard.welcome')}, ${user?.first_name}!`}
        subtitle={t('dashboard.clientWelcome')}
        accentColor={accent}
      />
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={ds.statsGrid}>
        <DashboardStatCard
          icon="account-balance-wallet"
          iconColor={accent}
          value={formatMoney(statistics.total_spent, currentLanguage, currencySuffix)}
          label={t('dashboard.totalSpending')}
        />
        <DashboardStatCard
          icon="check-circle"
          iconColor={colors.success}
          value={String(statistics.completed_orders)}
          label={t('dashboard.completedOrders')}
        />
        <DashboardStatCard
          icon="local-shipping"
          iconColor={colors.primary}
          value={String(activeOrders.length)}
          label={t('dashboard.activeOrders')}
        />
        <DashboardStatCard
          icon="description"
          iconColor={colors.secondary}
          value={String(myAdvertisements.length)}
          label={t('dashboard.myAdvertisements')}
        />
      </View>
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Card variant="soft" style={ds.quickStatsCard}>
        <Text style={ds.cardTitle}>{t('dashboard.spendingOverview')}</Text>
        <View style={ds.quickStatsRow}>
          <View style={ds.quickStatItem}>
            <Text style={ds.quickStatLabel}>{t('dashboard.todayShort')}</Text>
            <Text style={ds.quickStatValue}>
              {formatMoney(statistics.spent_today, currentLanguage, currencySuffix)}
            </Text>
          </View>
          <View style={ds.quickStatDivider} />
          <View style={ds.quickStatItem}>
            <Text style={ds.quickStatLabel}>{t('dashboard.monthShort')}</Text>
            <Text style={ds.quickStatValue}>
              {formatMoney(statistics.spent_month, currentLanguage, currencySuffix)}
            </Text>
          </View>
        </View>
      </Card>
      </Animated.View>

      {dailyTrend.length > 0 && (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <DashboardTrendCard
            title={t('dashboard.spendingTrend', { days: periodDays })}
            items={dailyTrend.map((item: any) => ({ date: item.date, value: item.spending }))}
            selectedDate={selectedTrendDate}
            onSelectDate={setSelectedTrendDate}
            language={currentLanguage}
            accentColor={accent}
            emptyMessage={t('dashboard.trendEmpty')}
            detailText={
              selectedTrend
                ? t('dashboard.spendingOnDay', {
                    date: formatLongDate(selectedTrend.date, currentLanguage),
                    amount: formatMoney(selectedTrend.spending, currentLanguage, currencySuffix),
                  })
                : undefined
            }
            detailActionLabel={selectedTrend ? t('dashboard.ordersOnDay') : undefined}
            onDetailAction={
              selectedTrend
                ? () =>
                    (navigation as any).navigate('ClientOrders', {
                      date_from: selectedTrend.date,
                      date_to: selectedTrend.date,
                    })
                : undefined
            }
          />
        </Animated.View>
      )}

      <View style={ds.sectionHeader}>
        <Text style={ds.sectionTitle}>{t('dashboard.quickActions')}</Text>
      </View>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={ds.actions}>
        <DashboardActionButton
          icon="add-circle"
          label={t('dashboard.newAdvertisement')}
          onPress={() => (navigation as any).navigate('CreateAdvertisement')}
          accentColor={accent}
        />
        <DashboardActionButton
          icon="search"
          label={t('dashboard.searchAdvertisements')}
          onPress={() => (navigation as any).navigate('AdvertisementsList')}
          accentColor={accent}
        />
        <DashboardActionButton
          icon="list"
          label={t('dashboard.myOrders')}
          onPress={() => (navigation as any).navigate('ClientOrders')}
          accentColor={accent}
        />
        <DashboardActionButton
          icon="bar-chart"
          label={t('dashboard.detailedStatistics')}
          onPress={() => (navigation as any).navigate('Statistics')}
          variant="secondary"
          accentColor={accent}
        />
        <DashboardActionButton
          icon="analytics"
          label={t('analytics.title')}
          onPress={() => (navigation as any).navigate('AdvancedAnalytics')}
          variant="secondary"
          accentColor={accent}
        />
        <DashboardActionButton
          icon="chat"
          label={t('dashboard.openChats')}
          onPress={() => navigateMainTab(navigation as any, 'Chats')}
          variant="secondary"
          accentColor={accent}
        />
        <DashboardActionButton
          icon="replay"
          label={t('dashboard.quickReorder')}
          onPress={() =>
            (navigation as any).navigate('ClientOrders', { status: 'completed' })
          }
          variant="secondary"
          accentColor={accent}
        />
      </View>
      </Animated.View>

      {activeOrders.length > 0 && (
        <Card variant="soft" style={ds.recentCard}>
          <View style={ds.recentHeader}>
            <Text style={ds.cardTitle}>{t('dashboard.activeOrders')}</Text>
            <TouchableOpacity
              onPress={() => (navigation as any).navigate('ClientOrders')}>
              <Text style={[ds.seeAllText, { color: accent }]}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          {activeOrders.slice(0, 3).map((order: any) => (
            <TouchableOpacity
              key={order.id}
              style={ds.recentItem}
              onPress={() => (navigation as any).navigate('ClientOrderDetail', { id: order.id })}>
              <View style={ds.recentItemContent}>
                <Text style={ds.recentItemTitle}>{t('orders.title')} #{order.id}</Text>
                <Text style={ds.recentItemStatus}>{order.status?.name || order.status?.code || '—'}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {myAdvertisements.length > 0 && (
        <Card variant="soft" style={ds.recentCard}>
          <View style={ds.recentHeader}>
            <Text style={ds.cardTitle}>{t('dashboard.myAdvertisements')}</Text>
            <TouchableOpacity
              onPress={() => (navigation as any).navigate('MyAdvertisements')}>
              <Text style={[ds.seeAllText, { color: accent }]}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          {myAdvertisements.slice(0, 3).map((ad: any) => (
            <TouchableOpacity
              key={ad.id}
              style={ds.recentItem}
              onPress={() => (navigation as any).navigate('AdvertisementDetail', { id: ad.id })}>
              <View style={ds.recentItemContent}>
                <Text style={ds.recentItemTitle} numberOfLines={1}>{ad.title}</Text>
                <Text style={ds.recentItemStatus}>
                  {ad.is_closed ? t('profile.closed') : t('profile.active')}
                </Text>
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

export default ClientDashboardScreen;
