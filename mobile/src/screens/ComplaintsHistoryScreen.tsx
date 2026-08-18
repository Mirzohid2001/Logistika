import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { complaintsService } from '../services/complaintsService';
import { Complaint } from '../types';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { AppHeader } from '../components/AppHeader';
import { SkeletonCard } from '../components/Skeleton';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { ScreenBackground } from '../components/ScreenBackground';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

const ComplaintsHistoryScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t, currentLanguage } = useTranslation();
  const [direction, setDirection] = useState<'filed' | 'received'>('filed');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadComplaints = useCallback(async () => {
    try {
      const data = await complaintsService.getComplaints({ direction });
      setComplaints(data);
    } catch (error) {
      console.error('Error loading complaints:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [direction]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadComplaints();
    }, [loadComplaints])
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return colors.success;
      case 'dismissed':
        return colors.textTertiary;
      case 'in_review':
        return colors.warning;
      default:
        return colors.danger;
    }
  };

  const renderItem = ({ item, index }: { item: Complaint; index: number }) => {
    const otherUser = direction === 'filed' ? item.to_user : item.from_user;
    return (
      <AnimatedListItem index={index}>
      <Card variant="soft" style={styles.card}>
        <View style={styles.itemHeader}>
          <Text style={styles.orderLabel}>
            {t('complaints.orderLabel')} #{item.order_id}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor(item.status)}22` }]}>
            <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
              {item.status_display || item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.category}>
          {item.category_display || t(`complaints.categories.${item.category}`)}
        </Text>
        {otherUser && (
          <Text style={styles.userLine}>
            {direction === 'filed' ? t('complaints.against') : t('complaints.from')}:{' '}
            {otherUser.first_name} {otherUser.last_name}
          </Text>
        )}
        <Text style={styles.description} numberOfLines={4}>
          {item.description}
        </Text>
        {!!item.admin_notes?.trim() && (
          <View style={styles.adminNotesBox}>
            <Text style={styles.adminNotesLabel}>{t('complaints.staff.adminNotes')}</Text>
            <Text style={styles.adminNotesText}>{item.admin_notes.trim()}</Text>
          </View>
        )}
        <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      </Card>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('complaints.historyTitle')} />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, direction === 'filed' && styles.tabActive]}
          onPress={() => setDirection('filed')}>
          <Text style={[styles.tabText, direction === 'filed' && styles.tabTextActive]}>
            {t('complaints.myFiled')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, direction === 'received' && styles.tabActive]}
          onPress={() => setDirection('received')}>
          <Text style={[styles.tabText, direction === 'received' && styles.tabTextActive]}>
            {t('complaints.myReceived')}
          </Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={complaints.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadComplaints();
              }}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t('complaints.historyEmpty')}
              message={t('complaints.historyEmptyMessage')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  skeletonWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  tabTextActive: {
    color: colors.textLight,
    fontWeight: fontWeight.semibold,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  orderLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  category: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  userLine: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  adminNotesBox: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  adminNotesLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: 4,
  },
  adminNotesText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  date: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
});

export default ComplaintsHistoryScreen;
