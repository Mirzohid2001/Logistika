import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { chatService } from '../services/chatService';
import { Chat } from '../types';
import { useAuth } from '../context/AuthContext';
import { useChatBadge } from '../context/ChatBadgeContext';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { AppHeader } from '../components/AppHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { SkeletonCard } from '../components/Skeleton';
import { getMediaUrl } from '../services/api';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import { useThemedStyles, type AppColors } from '../theme/useThemedStyles';
import { toastService } from '../services/toastService';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { useTranslation } from '../hooks/useTranslation';
import { navigateRoot } from '../utils/navigationHelpers';

const ChatListScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { refreshUnreadCount } = useChatBadge();
  const fromProfile = (route.params as { fromProfile?: boolean } | undefined)?.fromProfile;
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [_hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const initialLoadRef = useRef(false);

  const loadChats = useCallback(async (targetPage: number = 1, reset: boolean = true) => {
    if (!reset && (loadingMoreRef.current || !hasMoreRef.current)) {
      return;
    }

    try {
      setLoadError(null);
      if (reset) {
        setLoading(true);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      const response = await chatService.getChats({
        page: targetPage,
        page_size: 20,
      });
      const results = response?.results || [];
      setChats((prev) => (reset ? results : [...prev, ...results]));
      setPage(targetPage);
      const nextPageAvailable = Boolean(response?.next);
      hasMoreRef.current = nextPageAvailable;
      setHasMore(nextPageAvailable);
    } catch (error) {
      const message = t('chat.loadError');
      setLoadError(message);
      toastService.error(message);
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setRefreshing(false);
      initialLoadRef.current = false;
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      if (initialLoadRef.current) {
        return undefined;
      }
      initialLoadRef.current = true;
      hasMoreRef.current = true;
      setHasMore(true);
      setPage(1);
      void loadChats(1, true);
      void refreshUnreadCount();
      return () => {
        initialLoadRef.current = false;
      };
    }, [loadChats, refreshUnreadCount])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    hasMoreRef.current = true;
    setHasMore(true);
    setPage(1);
    void loadChats(1, true);
  };

  const handleLoadMore = () => {
    if (!loading && !loadingMore && hasMoreRef.current) {
      void loadChats(page + 1, false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) {return 'Hozir';}
    if (minutes < 60) {return `${minutes} daqiqa oldin`;}
    if (hours < 24) {return `${hours} soat oldin`;}
    if (days < 7) {return `${days} kun oldin`;}

    return date.toLocaleDateString('uz-UZ', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getOtherUser = (chat: Chat) => {
    if (user?.id === chat.client.id) {
      return chat.driver;
    }
    return chat.client;
  };

  const renderItem = ({ item, index }: { item: Chat; index: number }) => {
    const otherUser = getOtherUser(item);
    const avatarUrl = getMediaUrl(otherUser.avatar);
    const lastMessage = item.last_message;
    const isMyMessage = lastMessage && lastMessage.sender_id === user?.id;

    return (
      <AnimatedListItem index={index}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigateRoot(navigation as any, 'ChatDetail', { id: item.id })}>
        <Card
          variant="elevated"
          style={[styles.card, item.unread_count > 0 && styles.cardUnread]}>
          <View style={styles.itemContainer}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {otherUser.first_name?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}

            <View style={styles.content}>
              <View style={styles.headerRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {otherUser.first_name} {otherUser.last_name}
                </Text>
                {item.unread_count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread_count}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.orderTitle} numberOfLines={1}>
                {t('orders.orderNumber', { id: item.order.id })}: {item.order.title}
              </Text>

              {lastMessage && (
                <View style={styles.messageRow}>
                  <Text style={styles.messageText} numberOfLines={1}>
                    {isMyMessage ? 'Siz: ' : ''}{lastMessage.text}
                  </Text>
                  <View style={styles.timeWrap}>
                    <MaterialIcons name="schedule" size={12} color={styles.timeText.color} />
                    <Text style={styles.timeText}>
                      {formatDate(lastMessage.created_at)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Card>
      </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('chat.title')} subtitle={t('chat.chatList')} showBack={Boolean(fromProfile)} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('chat.title')} subtitle={t('chat.chatList')} showBack={Boolean(fromProfile)} />
      {loadError && (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('dispatcherLists.retry')}
          onActionPress={() => loadChats(1, true)}
        />
      )}
      {!loadError && (
      <FlatList
        data={chats}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={
          chats.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title={t('chat.noChats')}
            message={t('chat.noChats')}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
      />
      )}
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  listContainer: {
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  emptyContainer: {
    flex: 1,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.round,
    marginRight: spacing.md,
    backgroundColor: colors.borderLight,
    borderWidth: 2,
    borderColor: colors.primaryGlow,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.round,
    marginRight: spacing.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundSecondary,
    ...shadows.colored(colors.primary),
  },
  avatarText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textLight,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    flex: 1,
    letterSpacing: 0.2,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.round,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginLeft: spacing.sm,
    ...shadows.colored(colors.primary),
  },
  badgeText: {
    color: colors.textLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  orderTitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  timeText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },
  timeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});

export default ChatListScreen;
