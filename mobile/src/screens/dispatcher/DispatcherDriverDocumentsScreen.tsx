import React, { useCallback, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet, Linking } from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { authService } from '../../services/authService';
import { DriverDocumentMonitoringItem, DriverDocumentMonitoringResponse } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { createListScreenStyles } from '../../theme/listScreenStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';

type SeverityFilter = 'all' | 'expired' | 'soon';

const DispatcherDriverDocumentsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const mode = (route.params as { mode?: 'dispatcher' | 'updater' } | undefined)?.mode ?? 'dispatcher';
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const listStyles = createListScreenStyles(colors);
  const localStyles = useThemedStyles(createLocalStyles);
  const [data, setData] = useState<DriverDocumentMonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>('all');

  const severityRef = useRef(severity);
  severityRef.current = severity;

  const loadMonitoring = useCallback(async (silent = false, filter: SeverityFilter = severityRef.current) => {
    try {
      setLoadError(null);
      if (!silent) {
        setLoading(true);
      }
      const response = await authService.getDriverDocumentMonitoring({
        days: 30,
        severity: filter,
      });
      setData(response);
    } catch {
      setLoadError(t('features.driverDocsMonitor.loadError'));
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadMonitoring(false);
    }, [loadMonitoring]),
  );

  const handleFilterChange = (filter: SeverityFilter) => {
    setSeverity(filter);
    void loadMonitoring(data != null, filter);
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ');
  };

  const renderItem = ({ item, index }: { item: DriverDocumentMonitoringItem; index: number }) => (
    <AnimatedListItem index={index}>
      <Card variant="soft">
        <View style={localStyles.cardHeader}>
          <Text style={listStyles.rowTitle}>{item.driver_name || item.driver_phone}</Text>
          <View
            style={[
              listStyles.statusBadge,
              item.status === 'expired' ? localStyles.badgeDanger : localStyles.badgeWarning,
            ]}>
            <Text
              style={[
                listStyles.statusText,
                item.status === 'expired' ? localStyles.badgeDangerText : localStyles.badgeWarningText,
              ]}>
              {item.status === 'expired'
                ? t('features.driverDocsMonitor.expired')
                : t('features.driverDocsMonitor.soon')}
            </Text>
          </View>
        </View>
        <Text style={listStyles.rowSubtitle}>{item.document_type_name}</Text>
        {!!item.document_number && <Text style={listStyles.rowMeta}>№ {item.document_number}</Text>}
        {!!item.vehicle_number && (
          <Text style={listStyles.rowMeta}>
            {t('features.driverDocsMonitor.vehicle')}: {item.vehicle_number}
          </Text>
        )}
        <Text style={listStyles.rowMeta}>
          {t('features.driverDocsMonitor.expiresAt', { date: formatDate(item.expires_at) })}
        </Text>
        <Text style={localStyles.daysHint}>
          {item.days_left < 0
            ? t('features.driverDocsMonitor.daysOverdue', { count: Math.abs(item.days_left) })
            : t('features.driverDocsMonitor.daysLeft', { count: item.days_left })}
        </Text>
        <TouchableOpacity
          style={localStyles.linkButton}
          onPress={() => {
            if (mode === 'dispatcher') {
              (navigation as any).navigate('DispatcherDriverDetail', { driverId: item.driver_id });
              return;
            }
            if (item.driver_phone) {
              void Linking.openURL(`tel:${item.driver_phone}`);
            }
          }}>
          <Text style={localStyles.linkButtonText}>
            {mode === 'dispatcher'
              ? t('features.driverDocsMonitor.openDriver')
              : item.driver_phone}
          </Text>
        </TouchableOpacity>
      </Card>
    </AnimatedListItem>
  );

  const filters: SeverityFilter[] = ['all', 'expired', 'soon'];

  return (
    <ScreenBackground>
      <AppHeader
        variant="hero"
        title={t('features.driverDocsMonitor.title')}
        subtitle={t('features.driverDocsMonitor.subtitle')}
        showBack
        onBack={() => navigation.goBack()}
      />

      <View style={localStyles.filterRow}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[localStyles.filterChip, severity === filter && localStyles.filterChipActive]}
            onPress={() => handleFilterChange(filter)}>
            <Text
              style={[
                localStyles.filterChipText,
                severity === filter && localStyles.filterChipTextActive,
              ]}>
              {t(`features.driverDocsMonitor.filter.${filter}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {data && !loading ? (
        <Text style={localStyles.summaryText}>
          {t('features.driverDocsMonitor.summary', {
            total: data.count,
            expired: data.expired_count,
            soon: data.soon_count,
          })}
        </Text>
      ) : null}

      {loading && !data ? (
        <View style={listStyles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : loadError ? (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('common.retry')}
          onActionPress={() => {
            void loadMonitoring();
          }}
        />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={
            (data?.items?.length ?? 0) === 0 ? listStyles.emptyContainer : listStyles.listContainer
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadMonitoring();
              }}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t('features.driverDocsMonitor.emptyTitle')}
              message={t('features.driverDocsMonitor.emptyMessage')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

const createLocalStyles = (colors: AppColors) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    filterChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    filterChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGlow,
    },
    filterChipText: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    filterChipTextActive: {
      color: colors.primary,
      fontWeight: fontWeight.semibold,
    },
    summaryText: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    badgeDanger: {
      backgroundColor: colors.dangerGlow,
      borderColor: colors.danger,
    },
    badgeWarning: {
      backgroundColor: colors.warningGlow,
      borderColor: colors.warning,
    },
    badgeDangerText: {
      color: colors.danger,
    },
    badgeWarningText: {
      color: colors.warning,
    },
    daysHint: {
      marginTop: spacing.xs,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    linkButton: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
    },
    linkButtonText: {
      color: colors.primary,
      fontWeight: fontWeight.semibold,
      fontSize: fontSize.sm,
    },
  });

export default DispatcherDriverDocumentsScreen;
