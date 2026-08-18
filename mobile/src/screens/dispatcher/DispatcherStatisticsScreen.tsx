import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { DispatcherStatistics } from '../../types';
import { Card } from '../../components/Card';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { useTranslation } from '../../hooks/useTranslation';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';

const DispatcherStatisticsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [statistics, setStatistics] = useState<DispatcherStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [scope, setScope] = useState<'my' | 'all'>('my');
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);

  const buildDateRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const format = (d: Date) => d.toISOString().slice(0, 10);
    return { date_from: format(start), date_to: format(end) };
  };

  const loadStatistics = useCallback(async () => {
    try {
      if (!statistics) {
        setLoading(true);
      }
      setErrorMessage(null);
      const { date_from, date_to } = buildDateRange(periodDays);
      const raw = await dispatcherService.getStatistics({ scope, date_from, date_to });
      const normalized: DispatcherStatistics = {
        total_assignments: Number(raw?.total_assignments || 0),
        today_assignments: Number(raw?.today_assignments || 0),
        week_assignments: Number(raw?.week_assignments || 0),
        month_assignments: Number(raw?.month_assignments || 0),
        completed_assignments: Number(raw?.completed_assignments || 0),
        active_assignments: Number(raw?.active_assignments || 0),
        daily_assignments: (raw?.daily_assignments || []).map((d: any) => ({
          date: String(d.date),
          count: Number(d.count || 0),
        })),
        monthly_assignments: (raw?.monthly_assignments || []).map((d: any) => ({
          month: String(d.month),
          count: Number(d.count || 0),
        })),
        status_distribution: raw?.status_distribution || {},
      };
      setStatistics(normalized);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('Error loading statistics:', error);
      setErrorMessage(t('dispatcherOps.statsLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays, scope, statistics]);

  useFocusEffect(
    useCallback(() => {
      setRefreshing(true);
      loadStatistics();
    }, [loadStatistics])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadStatistics();
  };

  const safeStats = statistics || {
    total_assignments: 0,
    today_assignments: 0,
    week_assignments: 0,
    month_assignments: 0,
    completed_assignments: 0,
    active_assignments: 0,
    daily_assignments: [],
    monthly_assignments: [],
    status_distribution: {},
  };
  const daily = safeStats.daily_assignments || [];
  const maxDailyValue = Math.max(...daily.map((d) => d.count), 1);
  const completionRate = safeStats.total_assignments
    ? Math.round((safeStats.completed_assignments / safeStats.total_assignments) * 100)
    : 0;
  const activeRate = safeStats.total_assignments
    ? Math.round((safeStats.active_assignments / safeStats.total_assignments) * 100)
    : 0;
  const weekVsMonthRate = safeStats.month_assignments
    ? Math.round((safeStats.week_assignments / safeStats.month_assignments) * 100)
    : 0;
  const statusItems = useMemo(
    () => [
      { key: 'assigned', label: t('dispatcherOps.statusAssigned'), color: colors.primary },
      { key: 'reassigned', label: t('dispatcherOps.statusReassigned'), color: colors.secondary },
      { key: 'completed', label: t('dispatcherOps.completed'), color: colors.success },
      { key: 'cancelled', label: t('dispatcherOps.statusCancelled'), color: colors.danger },
    ],
    [t, colors]
  );
  const statusMax = Math.max(
    ...statusItems.map((item) => Number((safeStats.status_distribution || {})[item.key] || 0)),
    1
  );
  const topDay = daily.length
    ? daily.reduce((acc, item) => (item.count > acc.count ? item : acc), daily[0])
    : null;

  if (loading) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (!statistics && errorMessage) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dispatcherOps.statisticsTitle')} />
        <EmptyState
          variant="error"
          title={t('dispatcherOps.loadError')}
          message={errorMessage}
          actionText={t('dispatcherOps.retry')}
          onActionPress={loadStatistics}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <AppHeader
        variant="hero"
        title={t('dispatcherOps.statisticsTitle')}
        subtitle={
          lastUpdatedAt
            ? t('dispatcherOps.lastUpdatedTime', {
                time: new Date(lastUpdatedAt).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : t('dispatcherOps.lastUpdatedUnknown')
        }
      />
      <View style={styles.scopeToggleRow}>
        <TouchableOpacity
          style={[styles.scopeToggleChip, scope === 'my' && styles.scopeToggleChipActive]}
          onPress={() => setScope('my')}>
          <Text style={[styles.scopeToggleText, scope === 'my' && styles.scopeToggleTextActive]}>
            {t('dispatcherOps.scopeMyStats')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scopeToggleChip, scope === 'all' && styles.scopeToggleChipActive]}
          onPress={() => setScope('all')}>
          <Text style={[styles.scopeToggleText, scope === 'all' && styles.scopeToggleTextActive]}>
            {t('dispatcherOps.scopeAllStats')}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.scopeToggleRow}>
        {[7, 30, 90].map((days) => (
          <TouchableOpacity
            key={`period-${days}`}
            style={[styles.scopeToggleChip, periodDays === days && styles.scopeToggleChipActive]}
            onPress={() => setPeriodDays(days as 7 | 30 | 90)}>
            <Text style={[styles.scopeToggleText, periodDays === days && styles.scopeToggleTextActive]}>
              {t('dispatcherOps.periodDays', { days })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {errorMessage && (
        <View style={styles.inlineWarning}>
          <MaterialIcons name="warning-amber" size={16} color={colors.warning} />
          <Text style={styles.inlineWarningText}>{errorMessage}</Text>
        </View>
      )}
      <View style={styles.kpiGrid}>
        <Card style={styles.statCard}>
          <View style={styles.statRow}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.primaryGlow }]}>
              <MaterialIcons name="assignment" size={20} color={colors.primary} />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statValue}>{safeStats.total_assignments}</Text>
              <Text style={styles.statLabel}>{t('dispatcherOps.totalAssignments')}</Text>
            </View>
          </View>
        </Card>
        <Card style={styles.statCard}>
          <View style={styles.statRow}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.successGlow }]}>
              <MaterialIcons name="check-circle" size={20} color={colors.success} />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statValue}>{safeStats.completed_assignments}</Text>
              <Text style={styles.statLabel}>{t('dispatcherOps.completedAssignments')}</Text>
            </View>
          </View>
        </Card>
      </View>
      <View style={styles.kpiGrid}>
        <Card style={styles.statCard}>
          <View style={styles.statRow}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.warningGlow }]}>
              <MaterialIcons name="schedule" size={20} color={colors.warning} />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statValue}>{safeStats.active_assignments}</Text>
              <Text style={styles.statLabel}>{t('dispatcherOps.activeAssignments')}</Text>
            </View>
          </View>
        </Card>
        <Card style={styles.statCard}>
          <View style={styles.statRow}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.secondaryGlow }]}>
              <MaterialIcons name="trending-up" size={20} color={colors.secondary} />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statValue}>{completionRate}%</Text>
              <Text style={styles.statLabel}>{t('dispatcherOps.completionRate')}</Text>
            </View>
          </View>
        </Card>
      </View>

      <Card style={styles.periodCard}>
        <Text style={styles.periodTitle}>{t('dispatcherOps.byPeriod')}</Text>
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>{t('dispatcherOps.today')}:</Text>
          <Text style={styles.periodValue}>{safeStats.today_assignments}</Text>
        </View>
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>{t('dispatcherOps.week')}:</Text>
          <Text style={styles.periodValue}>{safeStats.week_assignments}</Text>
        </View>
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>{t('dispatcherOps.month')}:</Text>
          <Text style={styles.periodValue}>{safeStats.month_assignments}</Text>
        </View>
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>{t('dispatcherOps.activeShare')}:</Text>
          <Text style={styles.periodValue}>{activeRate}%</Text>
        </View>
        <View style={styles.periodRow}>
          <Text style={styles.periodLabel}>{t('dispatcherOps.weekMonthRatio')}:</Text>
          <Text style={styles.periodValue}>{weekVsMonthRate}%</Text>
        </View>
      </Card>

      <Card style={styles.periodCard}>
        <Text style={styles.periodTitle}>{t('dispatcherOps.statusDistribution')}</Text>
        {statusItems.map((item) => {
          const value = Number((safeStats.status_distribution || {})[item.key] || 0);
          return (
            <View key={item.key} style={styles.distRow}>
              <Text style={styles.distLabel}>{item.label}</Text>
              <View style={styles.distBarTrack}>
                <View
                  style={[
                    styles.distBarFill,
                    {
                      width: `${(value / statusMax) * 100}%`,
                      backgroundColor: item.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.distValue}>{value}</Text>
            </View>
          );
        })}
      </Card>

      {daily.length > 0 && (
        <Card style={styles.chartCard}>
          <Text style={styles.chartTitle}>{t('dispatcherOps.dailyDistribution', { days: periodDays })}</Text>
          <View style={styles.chartContainer}>
            {daily.map((item, index) => {
              return (
                <View key={index} style={styles.barRow}>
                  <Text style={styles.barLabel}>{new Date(item.date).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })}</Text>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${(item.count / maxDailyValue) * 100}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                    <Text style={styles.barValue}>{item.count}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {topDay && (
            <Text style={styles.chartHint}>
              {t('dispatcherOps.topDayHint', {
                date: new Date(topDay.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                count: topDay.count,
              })}
            </Text>
          )}
        </Card>
      )}
      {safeStats.total_assignments === 0 && (
        <Card style={styles.emptyCard}>
          <MaterialIcons name="insights" size={28} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>{t('dispatcherOps.emptyStats')}</Text>
          <Text style={styles.emptyText}>
            {t('dispatcherOps.emptyStatsDesc')}
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => (navigation as any).navigate('DispatcherOrders')}>
            <Text style={styles.emptyButtonText}>{t('dispatcherOps.goToOrders')}</Text>
          </TouchableOpacity>
        </Card>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => (navigation as any).navigate('DispatcherAnalytics')}>
          <MaterialIcons name="bar-chart" size={24} color={colors.primary} />
          <Text style={styles.actionButtonText}>{t('dispatcherOps.openAnalytics')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => (navigation as any).navigate('DispatcherBulkOperations')}>
          <MaterialIcons name="select-all" size={24} color={colors.primary} />
          <Text style={styles.actionButtonText}>{t('dispatcherOps.openBulk')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => (navigation as any).navigate('DispatcherExport')}>
          <MaterialIcons name="file-download" size={24} color={colors.primary} />
          <Text style={styles.actionButtonText}>{t('dispatcherOps.openExport')}</Text>
        </TouchableOpacity>
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
    paddingBottom: 28,
  },
  headerInfo: {
    marginBottom: 10,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  inlineWarning: {
    marginBottom: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.warningGlow,
    borderWidth: 1,
    borderColor: colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineWarningText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
  },
  scopeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  scopeToggleChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeToggleChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scopeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  scopeToggleTextActive: {
    color: colors.textLight,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    marginBottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statInfo: {
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  periodCard: {
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  periodTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  periodLabel: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  periodValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  distLabel: {
    width: 110,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  distBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    borderRadius: 8,
  },
  distValue: {
    width: 26,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  chartCard: {
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  chartContainer: {
    gap: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  barLabel: {
    width: 80,
    fontSize: 12,
    color: colors.textTertiary,
  },
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 8,
  },
  barValue: {
    position: 'absolute',
    right: 8,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  chartHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  emptyCard: {
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 14,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyButton: {
    marginTop: 12,
    backgroundColor: colors.primaryGlow,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textLight,
  },
});

export default DispatcherStatisticsScreen;
