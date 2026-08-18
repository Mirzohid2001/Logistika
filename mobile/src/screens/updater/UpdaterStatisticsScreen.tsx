import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { updaterService } from '../../services/updaterService';
import { UpdaterStatistics } from '../../types';
import { Card } from '../../components/Card';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

const UpdaterStatisticsScreen = () => {
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [statistics, setStatistics] = useState<UpdaterStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatistics = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await updaterService.getStatistics();
      setStatistics(data);
    } catch (error) {
      console.error('Error loading statistics:', error);
      setLoadFailed(true);
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

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('updaterLists.statisticsTitle')} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </ScreenBackground>
    );
  }

  if (loadFailed || !statistics) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('updaterLists.statisticsTitle')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadStatistics}
        />
      </ScreenBackground>
    );
  }

  const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <AppHeader variant="hero" title={t('updaterLists.statisticsTitle')} />
        <Card variant="elevated" style={styles.statCard}>
          <View style={styles.statRow}>
            <MaterialIcons name="update" size={32} color={colors.primary} />
            <View style={styles.statInfo}>
              <Text style={styles.statValue}>{statistics.total_updates}</Text>
              <Text style={styles.statLabel}>{t('updaterLists.totalUpdates')}</Text>
            </View>
          </View>
        </Card>

        <Card variant="soft" style={styles.periodCard}>
          <Text style={styles.sectionTitle}>{t('updaterLists.byPeriod')}</Text>
          <View style={styles.periodRow}>
            <Text style={styles.periodLabel}>{t('updaterLists.today')}:</Text>
            <Text style={styles.periodValue}>{statistics.today_updates}</Text>
          </View>
          <View style={styles.periodRow}>
            <Text style={styles.periodLabel}>{t('updaterLists.week')}:</Text>
            <Text style={styles.periodValue}>{statistics.week_updates}</Text>
          </View>
          <View style={styles.periodRow}>
            <Text style={styles.periodLabel}>{t('updaterLists.month')}:</Text>
            <Text style={styles.periodValue}>{statistics.month_updates}</Text>
          </View>
        </Card>

        <Card variant="soft" style={styles.typeCard}>
          <Text style={styles.sectionTitle}>{t('updaterLists.byType')}</Text>
          <View style={styles.typeRow}>
            <MaterialIcons name="swap-horiz" size={24} color={colors.primary} />
            <Text style={styles.typeLabel}>{t('updaterLists.statusUpdates')}:</Text>
            <Text style={styles.typeValue}>{statistics.status_updates}</Text>
          </View>
          <View style={styles.typeRow}>
            <MaterialIcons name="location-on" size={24} color={colors.success} />
            <Text style={styles.typeLabel}>{t('updaterLists.locationUpdates')}:</Text>
            <Text style={styles.typeValue}>{statistics.location_updates}</Text>
          </View>
          <View style={styles.typeRow}>
            <MaterialIcons name="payment" size={24} color={colors.warning} />
            <Text style={styles.typeLabel}>{t('updaterLists.paymentUpdates')}:</Text>
            <Text style={styles.typeValue}>{statistics.payment_updates}</Text>
          </View>
        </Card>

        {statistics.daily_updates && statistics.daily_updates.length > 0 ? (
          <Card variant="soft" style={styles.chartCard}>
            <Text style={styles.sectionTitle}>{t('updaterLists.dailyChart')}</Text>
            <View style={styles.chartContainer}>
              {statistics.daily_updates.map((item, index) => {
                const maxValue = Math.max(...statistics.daily_updates!.map((d) => d.count), 1);
                return (
                  <View key={index} style={styles.barRow}>
                    <Text style={styles.barLabel}>
                      {new Date(item.date).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
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
                );
              })}
            </View>
          </Card>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => (navigation as any).navigate('UpdaterAnalytics')}>
            <MaterialIcons name="bar-chart" size={24} color={colors.primary} />
            <Text style={styles.actionButtonText}>{t('analytics.title')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  scroll: { flex: 1 },
  skeletonWrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  content: { paddingBottom: spacing.xxxl },
  statCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  statInfo: { flex: 1 },
  statValue: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  statLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  periodCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  typeCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  chartCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  periodLabel: { fontSize: fontSize.base, color: colors.textSecondary },
  periodValue: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text },
  typeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  typeLabel: { fontSize: fontSize.base, color: colors.textSecondary, flex: 1 },
  typeValue: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text },
  chartContainer: { gap: spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  barLabel: { width: 80, fontSize: fontSize.xs, color: colors.textSecondary },
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: borderRadius.sm },
  barValue: {
    position: 'absolute',
    right: spacing.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  actions: { gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  actionButtonText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.primary },
  });

export default UpdaterStatisticsScreen;
