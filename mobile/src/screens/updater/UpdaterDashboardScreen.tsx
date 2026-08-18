import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { UpdaterDashboard } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import {
  DashboardLoading,
  DashboardEmpty,
  DashboardStatCard,
  DashboardActionButton,
  useDashboardStyles,
} from '../../components/dashboard/DashboardWidgets';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { spacing } from '../../theme';
import { useAppTheme } from '../../theme/useAppTheme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';

const UpdaterDashboardScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { dashboardStyles: ds } = useDashboardStyles();
  const styles = useThemedStyles(createLocalStyles);
  const [dashboard, setDashboard] = useState<UpdaterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      if (!dashboard) {setLoading(true);}
      const data = await updaterService.getDashboard();
      setDashboard(data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dashboard]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
      const interval = setInterval(loadDashboard, 30000);
      return () => clearInterval(interval);
    }, [loadDashboard])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  if (loading && !dashboard) {
    return <DashboardLoading />;
  }

  if (!dashboard) {
    return (
      <DashboardEmpty
        title={t('dashboard.unavailable')}
        message={t('dashboard.unavailableMessage')}
        retryLabel={t('dashboard.retry')}
        onRetry={loadDashboard}
      />
    );
  }

  return (
    <ScreenBackground>
      <ScrollView
        style={ds.screen}
        contentContainerStyle={ds.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <AppHeader variant="hero" title={t('profile.updater')} subtitle={t('updaterDashboard.pendingUpdates')} />
        <View style={styles.statsGrid}>
          <DashboardStatCard
            icon="schedule"
            iconColor={colors.warning}
            value={String(dashboard.pending_updates)}
            label={t('updaterDashboard.pendingUpdates')}
          />
          <DashboardStatCard
            icon="location-on"
            iconColor={colors.primary}
            value={String(dashboard.active_tracking)}
            label={t('updaterDashboard.activeTracking')}
          />
          <DashboardStatCard
            icon="today"
            iconColor={colors.success}
            value={String(dashboard.today_updates)}
            label={t('updaterDashboard.todayUpdates')}
          />
          <DashboardStatCard
            icon="date-range"
            iconColor={colors.secondary}
            value={String(dashboard.week_updates)}
            label={t('updaterDashboard.weekUpdates')}
          />
        </View>

        <View style={styles.actions}>
        <DashboardActionButton
          icon="list"
          label={t('updaterDashboard.pendingUpdates')}
          onPress={() => (navigation as any).navigate('UpdaterPendingUpdates')}
        />
        <DashboardActionButton
          icon="location-on"
          label={t('updaterDashboard.activeTracking')}
          onPress={() => (navigation as any).navigate('UpdaterActiveTracking')}
        />
        <DashboardActionButton
          icon="history"
          label={t('updaterDashboard.updateLogs')}
          onPress={() => (navigation as any).navigate('UpdaterLogs')}
          variant="secondary"
        />
        <DashboardActionButton
          icon="history"
          label={t('updaterDashboard.orderHistory')}
          onPress={() => (navigation as any).navigate('UpdaterOrderHistory')}
        />
        <DashboardActionButton
          icon="payment"
          label={t('updaterDashboard.paymentMonitoring')}
          onPress={() => (navigation as any).navigate('UpdaterPaymentMonitoring')}
        />
        <DashboardActionButton
          icon="warning"
          label={t('updaterDashboard.problematicOrders')}
          onPress={() => (navigation as any).navigate('UpdaterProblematicOrders')}
        />
        <DashboardActionButton
          icon="bar-chart"
          label={t('updaterDashboard.statistics')}
          onPress={() => (navigation as any).navigate('UpdaterStatistics')}
          variant="secondary"
        />
        <DashboardActionButton
          icon="description"
          label={t('features.driverDocsMonitor.title')}
          onPress={() => (navigation as any).navigate('UpdaterDriverDocuments')}
          variant="secondary"
        />
        <DashboardActionButton
          icon="report-problem"
          label={t('dispatcherDashboard.complaintsQueue')}
          onPress={() => (navigation as any).navigate('StaffComplaints')}
          accentColor={colors.danger}
        />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
};

const createLocalStyles = (_colors: AppColors) =>
  StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
});

export default UpdaterDashboardScreen;
