import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService } from '../services/notificationService';
import { Notification } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotificationBadge } from '../context/NotificationBadgeContext';
import { getPrimaryRole, navigateFromNotification } from '../utils/notificationNavigation';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { AppHeader } from '../components/AppHeader';
import { SkeletonCard } from '../components/Skeleton';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { SegmentedFilter } from '../components/SegmentedFilter';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import { useThemedStyles, type AppColors } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { toastService } from '../services/toastService';
import { ScreenBackground } from '../components/ScreenBackground';

const NotificationsScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const role = getPrimaryRole(user);
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { setUnreadCount, refreshUnreadCount } = useNotificationBadge();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [unreadCount, setLocalUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      setLoadError(null);
      if (!refreshing) {
        setLoading(true);
      }
      const params: { is_read?: boolean } = {};
      if (filter === 'unread') {
        params.is_read = false;
      }
      const data = await notificationService.getNotifications(params);
      const normalized = Array.isArray(data) ? data : (data as { results?: Notification[] })?.results || [];
      setNotifications(normalized);

      const countData = await notificationService.getUnreadCount();
      const count = countData.unread_count ?? 0;
      setLocalUnreadCount(count);
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading notifications:', error);
      const message = t('notifications.loadError');
      setLoadError(message);
      toastService.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, refreshing, setUnreadCount, t]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      refreshUnreadCount();
    }, [loadNotifications, refreshUnreadCount]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await notificationService.markAsRead([notificationId]);
      loadNotifications();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      loadNotifications();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
    }
  };

  const handleDelete = async (notificationId: number) => {
    Alert.alert(t('notifications.deleteTitle'), t('notifications.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await notificationService.deleteNotification(notificationId);
            loadNotifications();
          } catch (error: any) {
            Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
          }
        },
      },
    ]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';

    if (minutes < 1) {return t('notifications.justNow');}
    if (minutes < 60) {return t('notifications.minutesAgo', { count: minutes });}
    if (hours < 24) {return t('notifications.hoursAgo', { count: hours });}
    if (days < 7) {return t('notifications.daysAgo', { count: days });}
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_created':
      case 'order_accepted':
      case 'order_approved':
        return 'check-circle';
      case 'order_started':
      case 'order_in_transit':
        return 'play-circle';
      case 'order_completed':
        return 'done-all';
      case 'stop_alert':
      case 'route_deviation':
        return 'warning';
      case 'geofence_event':
        return 'place';
      case 'order_cancelled':
        return 'cancel';
      case 'payment_received':
        return 'payment';
      case 'driver_assigned':
        return 'person';
      case 'message_received':
        return 'chat';
      case 'rating_received':
        return 'star';
      case 'bid_received':
        return 'local-offer';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'order_completed':
      case 'order_in_transit':
        return colors.success;
      case 'order_cancelled':
        return colors.danger;
      case 'stop_alert':
      case 'route_deviation':
        return colors.warning;
      case 'payment_received':
        return colors.warning;
      case 'message_received':
        return colors.primary;
      default:
        return colors.secondary;
    }
  };

  const renderItem = ({ item, index }: { item: Notification; index: number }) => (
    <AnimatedListItem index={index}>
      <TouchableOpacity
        activeOpacity={0.7}
        accessibilityRole="button"
        onPress={() => {
          if (!item.is_read) {
            handleMarkAsRead(item.id);
          }
          navigateFromNotification(navigation as any, item, role);
        }}
        onLongPress={() => handleDelete(item.id)}>
        <Card variant="elevated" style={[styles.notificationCard, !item.is_read && styles.unreadCard]}>
          <View style={styles.notificationHeader}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: getNotificationColor(item.notification_type) + '20' },
              ]}>
              <MaterialIcons
                name={getNotificationIcon(item.notification_type)}
                size={24}
                color={getNotificationColor(item.notification_type)}
              />
            </View>
            <View style={styles.notificationContent}>
              <Text style={[styles.title, !item.is_read && styles.titleBold]}>
                {item.notification_type === 'stop_alert'
                  ? t('notifications.stopAlert')
                  : item.notification_type === 'route_deviation'
                    ? t('notifications.routeDeviation')
                    : item.title}
              </Text>
              <Text style={styles.message} numberOfLines={2}>
                {item.message}
              </Text>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
            {!item.is_read && <View style={styles.unreadDot} />}
          </View>
        </Card>
      </TouchableOpacity>
    </AnimatedListItem>
  );

  return (
    <ScreenBackground style={{ paddingBottom: insets.bottom }}>
      <AppHeader variant="hero" title={t('notifications.title')} subtitle={t('notifications.deleteHint')} />
      <TouchableOpacity
        style={styles.settingsLink}
        onPress={() => (navigation as any).navigate('NotificationSettings')}>
        <MaterialIcons name="settings" size={18} color={colors.primary} />
        <Text style={styles.settingsLinkText}>{t('notificationSettings.title')}</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <SegmentedFilter
          value={filter}
          options={[
            { key: 'all', label: t('notifications.all') },
            { key: 'unread', label: `${t('notifications.unread')} (${unreadCount})` },
          ]}
          onChange={(key) => setFilter(key as 'all' | 'unread')}
          accentColor={colors.primary}
        />
        {unreadCount > 0 && (
          <TouchableOpacity style={[styles.markAllButton, { marginHorizontal: spacing.lg }]} onPress={handleMarkAllAsRead}>
            <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.skeletonContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={
            notifications.length === 0 ? styles.emptyContainer : styles.listContainer
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              variant={loadError ? 'error' : 'empty'}
              title={loadError || (filter === 'unread' ? t('notifications.noUnreadNotifications') : t('notifications.noNotifications'))}
              message={loadError ? undefined : undefined}
              actionText={loadError ? t('notifications.retry') : undefined}
              onActionPress={loadError ? loadNotifications : undefined}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  header: {
    paddingBottom: spacing.sm,
  },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  settingsLinkText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  markAllButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.round,
    backgroundColor: colors.primaryGlow,
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${colors.primary}22`,
  },
  markAllText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  skeletonContainer: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  listContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 24,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  notificationCard: {
    marginBottom: spacing.md,
  },
  unreadCard: {
    backgroundColor: colors.primaryGlow,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    ...shadows.sm,
  },
  notificationContent: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  titleBold: {
    fontWeight: fontWeight.extrabold,
  },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
});

export default NotificationsScreen;
