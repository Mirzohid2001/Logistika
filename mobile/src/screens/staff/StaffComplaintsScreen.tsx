import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { complaintsService } from '../../services/complaintsService';
import { Complaint } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { ScreenBackground } from '../../components/ScreenBackground';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { a11yButton } from '../../utils/accessibility';

type StatusFilter = 'all' | 'pending' | 'in_review' | 'resolved' | 'dismissed';

const STATUS_FILTERS: StatusFilter[] = ['all', 'pending', 'in_review', 'resolved', 'dismissed'];

const StaffComplaintsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t, currentLanguage } = useTranslation();
  const navigation = useNavigation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadComplaints = useCallback(async () => {
    try {
      setLoadError(null);
      const params = statusFilter === 'all' ? undefined : { status: statusFilter };
      const data = await complaintsService.getStaffComplaints(params);
      setComplaints(data);
    } catch (error) {
      console.error('Error loading staff complaints:', error);
      setLoadError(t('complaints.staff.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, t]);

  useFocusEffect(
    useCallback(() => {
      loadComplaints();
    }, [loadComplaints]),
  );

  useEffect(() => {
    setLoading(true);
    loadComplaints();
  }, [statusFilter, loadComplaints]);

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

  const filterLabel = (filter: StatusFilter) => {
    switch (filter) {
      case 'all':
        return t('complaints.staff.filterAll');
      case 'pending':
        return t('complaints.staff.filterPending');
      case 'in_review':
        return t('complaints.staff.filterInReview');
      case 'resolved':
        return t('complaints.staff.filterResolved');
      case 'dismissed':
        return t('complaints.staff.filterDismissed');
    }
  };

  const renderItem = ({ item, index }: { item: Complaint; index: number }) => (
    <AnimatedListItem index={index}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() =>
          (navigation as any).navigate('StaffComplaintDetail', { complaint: item })
        }
        {...a11yButton(
          `${t('complaints.orderLabel')} ${item.order_id}`,
          t('complaints.staff.detailTitle'),
        )}>
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
          <Text style={styles.userLine}>
            {t('complaints.staff.filedBy')}: {item.from_user?.first_name} {item.from_user?.last_name}
          </Text>
          <Text style={styles.userLine}>
            {t('complaints.staff.againstUser')}: {item.to_user?.first_name} {item.to_user?.last_name}
          </Text>
          <Text style={styles.description} numberOfLines={3}>
            {item.description}
          </Text>
          <Text style={styles.date}>{formatDate(item.created_at)}</Text>
        </Card>
      </TouchableOpacity>
    </AnimatedListItem>
  );

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('complaints.staff.queueTitle')} showBack />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersScroll}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterChip, statusFilter === filter && styles.filterChipActive]}
            onPress={() => setStatusFilter(filter)}
            {...a11yButton(filterLabel(filter))}>
            <Text style={[styles.filterText, statusFilter === filter && styles.filterTextActive]}>
              {filterLabel(filter)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : loadError ? (
        <EmptyState
          title={t('common.error')}
          message={loadError}
          actionText={t('dashboard.retry')}
          onActionPress={() => {
            setLoading(true);
            loadComplaints();
          }}
        />
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
              title={t('complaints.staff.queueEmpty')}
              message={t('complaints.staff.queueEmptyMessage')}
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
    filtersScroll: {
      maxHeight: 48,
      marginBottom: spacing.md,
    },
    filters: {
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      alignItems: 'center',
    },
    filterChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      fontWeight: fontWeight.medium,
    },
    filterTextActive: {
      color: colors.textLight,
      fontWeight: fontWeight.semibold,
    },
    card: {
      marginHorizontal: spacing.lg,
      marginVertical: spacing.xs,
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
    date: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
  });

export default StaffComplaintsScreen;
