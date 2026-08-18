import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { UpdateLog } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { useThemedStyles, useListScreenStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { formatDateTime } from '../../utils/formatLocale';
import { spacing, fontSize } from '../../theme';

const UpdaterLogsScreen = () => {
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const listStyles = useListScreenStyles();
  const styles = useThemedStyles(createStyles);
  const [logs, setLogs] = useState<UpdateLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await updaterService.getLogs();
      setLogs(data);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLogs();
    }, [loadLogs])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const getUpdateTypeColor = (type: string) => {
    switch (type) {
      case 'status':
        return colors.primary;
      case 'location':
        return colors.success;
      case 'payment':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const renderItem = ({ item, index }: { item: UpdateLog; index: number }) => (
    <AnimatedListItem index={index}>
    <Card variant="soft" style={styles.logCard}>
      <View style={styles.logHeader}>
        <View style={[listStyles.statusBadge, { backgroundColor: getUpdateTypeColor(item.update_type) + '20' }]}>
          <Text style={[listStyles.statusText, { color: getUpdateTypeColor(item.update_type) }]}>
            {item.update_type}
          </Text>
        </View>
        <Text style={styles.logDate}>{formatDateTime(item.created_at, currentLanguage)}</Text>
      </View>
      {item.description && <Text style={styles.logDescription}>{item.description}</Text>}
      {item.old_value && (
        <View style={styles.valueRow}>
          <Text style={styles.valueLabel}>{t('updaterLists.oldValue')}:</Text>
          <Text style={styles.valueText}>{JSON.stringify(item.old_value)}</Text>
        </View>
      )}
      {item.new_value && (
        <View style={styles.valueRow}>
          <Text style={styles.valueLabel}>{t('updaterLists.newValue')}:</Text>
          <Text style={styles.valueText}>{JSON.stringify(item.new_value)}</Text>
        </View>
      )}
    </Card>
    </AnimatedListItem>
  );

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('updaterLists.logsTitle')} />
      {loading ? (
        <View style={listStyles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
      <FlatList
        data={logs}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={logs.length === 0 ? listStyles.emptyContainer : listStyles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <EmptyState
            title={t('updaterLists.noLogs')}
            message={t('updaterLists.noLogsMessage')}
          />
        }
      />
      )}
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    logCard: {
      marginBottom: spacing.md,
    },
    logHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    logDate: {
      fontSize: fontSize.sm,
      color: colors.textTertiary,
    },
    logDescription: {
      fontSize: fontSize.md,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    valueRow: {
      marginBottom: spacing.sm,
    },
    valueLabel: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    valueText: {
      fontSize: fontSize.sm,
      color: colors.text,
      fontFamily: 'monospace',
    },
  });

export default UpdaterLogsScreen;
