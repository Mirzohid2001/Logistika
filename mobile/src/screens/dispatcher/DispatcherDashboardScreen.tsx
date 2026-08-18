import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { DispatcherDashboard } from '../../types';
import { Card } from '../../components/Card';
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
import { spacing, fontSize, fontWeight } from '../../theme';
import { useAppTheme } from '../../theme/useAppTheme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { navigateMainTab } from '../../utils/navigationHelpers';

const DispatcherDashboardScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { dashboardStyles: ds } = useDashboardStyles();
  const styles = useThemedStyles(createLocalStyles);
  const [dashboard, setDashboard] = useState<DispatcherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(12))[0];

  const loadDashboard = useCallback(async () => {
    try {
      if (!dashboard) {setLoading(true);}
      const data = await dispatcherService.getDashboard();
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

  useEffect(() => {
    if (!loading && dashboard) {
      fadeAnim.setValue(0);
      slideAnim.setValue(12);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start();
    }
  }, [loading, dashboard, fadeAnim, slideAnim]);

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
        <AppHeader
          variant="hero"
          title={t('profile.dispatcher')}
          subtitle={t('dispatcherDashboard.totalOrders')}
        />
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.statsGrid}>
            <DashboardStatCard
              icon="shopping-cart"
              iconColor={colors.primary}
              value={String(dashboard.total_orders)}
              label={t('dispatcherDashboard.totalOrders')}
            />
            <DashboardStatCard
              icon="local-shipping"
              iconColor={colors.success}
              value={String(dashboard.active_orders)}
              label={t('dispatcherDashboard.activeOrders')}
            />
            <DashboardStatCard
              icon="schedule"
              iconColor={colors.warning}
              value={String(dashboard.pending_orders)}
              label={t('dispatcherDashboard.pendingOrders')}
            />
            <DashboardStatCard
              icon="warning"
              iconColor={colors.danger}
              value={String(dashboard.problematic_orders)}
              label={t('dispatcherDashboard.problematicOrders')}
            />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Card variant="soft" style={styles.actionCard}>
          <Text style={styles.actionCardTitle}>{t('dispatcherDashboard.todayTasks')}</Text>
          <View style={styles.actionRow}>
            <Text style={styles.actionLabel}>{t('dispatcherDashboard.todayAssignments')}</Text>
            <Text style={styles.actionValue}>{dashboard.today_assignments}</Text>
          </View>
          <View style={styles.actionRow}>
            <Text style={styles.actionLabel}>{t('dispatcherDashboard.myAssignments')}</Text>
            <Text style={styles.actionValue}>{dashboard.my_assignments}</Text>
          </View>
        </Card>
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.actions}>
          <DashboardActionButton
            icon="list"
            label={t('dispatcherDashboard.allOrders')}
            onPress={() => (navigation as any).navigate('DispatcherOrders')}
          />
          <DashboardActionButton
            icon="people"
            label={t('dispatcherDashboard.drivers')}
            onPress={() => (navigation as any).navigate('DispatcherDriversList')}
          />
          <DashboardActionButton
            icon="person"
            label={t('dispatcherDashboard.clients')}
            onPress={() => (navigation as any).navigate('DispatcherClientsList')}
          />
          <DashboardActionButton
            icon="map"
            label={t('dispatcherDashboard.showOnMap')}
            onPress={() => (navigation as any).navigate('DispatcherOrdersMap')}
          />
          <DashboardActionButton
            icon="bar-chart"
            label={t('dispatcherDashboard.statistics')}
            onPress={() => (navigation as any).navigate('DispatcherStatistics')}
            variant="secondary"
          />
          <DashboardActionButton
            icon="description"
            label={t('features.driverDocsMonitor.title')}
            onPress={() => (navigation as any).navigate('DispatcherDriverDocuments')}
            variant="secondary"
          />
          <DashboardActionButton
            icon="visibility"
            label={t('dispatcherDashboard.realtimeMonitoring')}
            onPress={() => (navigation as any).navigate('DispatcherMonitoring')}
            accentColor={colors.secondary}
          />
          <DashboardActionButton
            icon="report-problem"
            label={t('dispatcherDashboard.complaintsQueue')}
            onPress={() => (navigation as any).navigate('StaffComplaints')}
            accentColor={colors.danger}
          />
          <DashboardActionButton
            icon="chat"
            label={t('dashboard.openChats')}
            onPress={() => navigateMainTab(navigation as any, 'Chats')}
            variant="secondary"
          />
        </View>
      </Animated.View>
      </ScrollView>
    </ScreenBackground>
  );
};

const createLocalStyles = (colors: AppColors) =>
  StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  actionCard: {
    marginBottom: spacing.lg,
  },
  actionCardTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  actionLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  actionValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  actions: {
    gap: spacing.md,
  },
});

export default DispatcherDashboardScreen;
