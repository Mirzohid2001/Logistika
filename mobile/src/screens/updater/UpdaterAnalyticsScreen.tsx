import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { UpdaterAnalytics } from '../../types';
import { Card } from '../../components/Card';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { EmptyState } from '../../components/EmptyState';
import { SectionEmptyNote } from '../../components/SectionEmptyNote';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { getChartPalette } from '../../theme/chartPalette';
import { a11yTab } from '../../utils/accessibility';

const UpdaterAnalyticsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const chartColors = [colors.primary, ...getChartPalette(colors)];
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<UpdaterAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const today = new Date();
      let date_from: string;

      if (selectedPeriod === '7d') {
        date_from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      } else if (selectedPeriod === '30d') {
        date_from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      } else {
        date_from = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }

      const data = await updaterService.getAnalytics({
        date_from,
        date_to: today.toISOString().split('T')[0],
      });
      setAnalytics(data);
      setLoadFailed(false);
    } catch (error) {
      console.error('Error loading analytics:', error);
      setLoadFailed(true);
      setAnalytics(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPeriod]);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  const renderBarChart = (data: Array<{ hour: number; count: number }>, title: string) => {
    const maxValue = Math.max(...data.map(d => d.count), 1);

    return (
      <Card style={styles.chartCard}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.chartContainer}>
          {data.map((item, index) => (
            <View key={index} style={styles.barRow}>
              <Text style={styles.barLabel}>{item.hour}:00</Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${(item.count / maxValue) * 100}%`,
                      backgroundColor: colors.success,
                    },
                  ]}
                />
                <Text style={styles.barValue}>{item.count}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>
    );
  };

  const renderPieChart = (data: { [key: string]: number }, title: string) => {
    const total = Object.values(data).reduce((sum, val) => sum + val, 0);

    return (
      <Card style={styles.chartCard}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.pieContainer}>
          {Object.entries(data).map(([key, value], index) => {
            const percentage = total > 0 ? (value / total) * 100 : 0;
            return (
              <View key={key} style={styles.pieItem}>
                <View style={[styles.pieColor, { backgroundColor: chartColors[index % chartColors.length] }]} />
                <Text style={styles.pieLabel}>{key}</Text>
                <Text style={styles.pieValue}>{value} ({percentage.toFixed(1)}%)</Text>
              </View>
            );
          })}
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (!analytics || loadFailed) {
    return (
      <ScreenBackground>
        <AppHeader
          variant="hero"
          title={t('dispatcherOps.updaterAnalyticsTitle')}
          subtitle={t('dispatcherOps.updaterAnalyticsSubtitle')}
        />
        <EmptyState
          variant="error"
          title={t('dispatcherOps.loadError')}
          actionText={t('dispatcherOps.retry')}
          onActionPress={loadAnalytics}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <AppHeader
      variant="hero"
      title={t('dispatcherOps.updaterAnalyticsTitle')}
      subtitle={t('dispatcherOps.updaterAnalyticsSubtitle')}
    />
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === '7d' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('7d')}
          {...a11yTab(t('dispatcherOps.period7d'), selectedPeriod === '7d')}>
          <Text style={[styles.periodText, selectedPeriod === '7d' && styles.periodTextActive]}>
            {t('dispatcherOps.period7d')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === '30d' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('30d')}
          {...a11yTab(t('dispatcherOps.period30d'), selectedPeriod === '30d')}>
          <Text style={[styles.periodText, selectedPeriod === '30d' && styles.periodTextActive]}>
            {t('dispatcherOps.period30d')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === '90d' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('90d')}
          {...a11yTab(t('dispatcherOps.period90d'), selectedPeriod === '90d')}>
          <Text style={[styles.periodText, selectedPeriod === '90d' && styles.periodTextActive]}>
            {t('dispatcherOps.period90d')}
          </Text>
        </TouchableOpacity>
      </View>

      <Card style={styles.statCard}>
        <Text style={styles.statTitle}>{t('dispatcherOps.overallStats')}</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>{t('dispatcherOps.ordersUpdatedLabel')}</Text>
          <Text style={styles.statValue}>{analytics.orders_updated}</Text>
        </View>
      </Card>

      {analytics.updates_by_type && Object.keys(analytics.updates_by_type).length > 0 ? (
        renderPieChart(analytics.updates_by_type, t('dispatcherOps.updatesByType'))
      ) : (
        <SectionEmptyNote title={t('dispatcherOps.updatesByType')} />
      )}

      {analytics.hourly_distribution && analytics.hourly_distribution.length > 0 ? (
        renderBarChart(analytics.hourly_distribution, t('dispatcherOps.hourlyDistribution'))
      ) : (
        <SectionEmptyNote title={t('dispatcherOps.hourlyDistribution')} />
      )}
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
  },
  periodSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodTextActive: {
    color: colors.textLight,
  },
  statCard: {
    marginBottom: 16,
  },
  statTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.success,
  },
  chartCard: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    width: 60,
    fontSize: 12,
    color: colors.textSecondary,
  },
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 4,
  },
  barValue: {
    position: 'absolute',
    right: 8,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  pieContainer: {
    gap: 12,
  },
  pieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pieColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  pieLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  pieValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

export default UpdaterAnalyticsScreen;
