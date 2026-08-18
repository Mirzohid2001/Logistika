import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { newsService } from '../services/newsService';
import { News } from '../types';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { AppHeader } from '../components/AppHeader';
import { SkeletonCard } from '../components/Skeleton';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { ScreenBackground } from '../components/ScreenBackground';
import { getMediaUrl } from '../services/api';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../theme/useAppTheme';
import { createListScreenStyles } from '../theme/listScreenStyles';
import { formatLongDate } from '../utils/formatLocale';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';

const NewsListScreen = () => {
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const listStyles = useMemo(() => createListScreenStyles(colors), [colors]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadNews = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    try {
      if (!append) {setLoading(true);}
      setLoadError(null);
      const response = await newsService.getNews({ page: pageNum });
      const results = response.results || [];
      setNews((prev) => (append ? [...prev, ...results] : results));
      setHasMore(!!response.next);
    } catch (error) {
      console.error('Error loading news:', error);
      if (!append) {
        setNews([]);
        setLoadError(t('news.loadError'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNews(1, false);
      setPage(1);
    }, [loadNews])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadNews(1, false);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadNews(nextPage, true);
    }
  };

  const renderItem = ({ item, index }: { item: News; index: number }) => {
    const photoUri = getMediaUrl(item.photo);

    return (
      <AnimatedListItem index={index}>
      <TouchableOpacity onPress={() => (navigation as any).navigate('NewsDetail', { id: item.id })}>
        <Card variant="soft" style={styles.card}>
          {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} />}
          <Text style={listStyles.rowTitle}>{item.title}</Text>
          <Text style={styles.text} numberOfLines={3}>
            {item.text}
          </Text>
          <Text style={listStyles.rowMeta}>{formatLongDate(item.date, currentLanguage)}</Text>
        </Card>
      </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('news.title')} subtitle={t('news.noNewsMessage')} />
      {loading && news.length === 0 ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : loadError && news.length === 0 ? (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('common.retry')}
          onActionPress={handleRefresh}
        />
      ) : (
        <FlatList
          data={news}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={news.length === 0 ? listStyles.emptyContainer : styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState title={t('news.noNews')} message={t('news.noNewsMessage')} />
          }
        />
      )}
    </ScreenBackground>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    skeletonWrap: {
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    card: {
      marginHorizontal: spacing.lg,
      marginVertical: spacing.xs,
    },
    listContainer: {
      paddingVertical: spacing.sm,
      paddingBottom: spacing.xxxl,
    },
    photo: {
      width: '100%',
      height: 200,
      borderRadius: borderRadius.sm,
      marginBottom: spacing.md,
      backgroundColor: colors.border,
    },
    text: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: spacing.md,
      fontWeight: fontWeight.medium,
    },
  });

export default NewsListScreen;
