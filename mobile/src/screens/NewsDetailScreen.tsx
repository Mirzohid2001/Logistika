import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { newsService } from '../services/newsService';
import { News } from '../types';
import { Card } from '../components/Card';
import { AppHeader } from '../components/AppHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { SkeletonCard } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { getMediaUrl } from '../services/api';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../theme/useAppTheme';
import { formatLongDate } from '../utils/formatLocale';
import { spacing, fontSize, fontWeight } from '../theme';

const NewsDetailScreen = () => {
  const route = useRoute();
  const { id } = route.params as { id: number };
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadNews = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await newsService.getNewsItem(id);
      setNews(data);
    } catch (error) {
      console.error('Error loading news:', error);
      setNews(null);
      setLoadError(t('news.loadError'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('news.title')} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
        </View>
      </ScreenBackground>
    );
  }

  if (loadError || !news) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('news.title')} showBack />
        <EmptyState
          title={t('common.error')}
          message={loadError || t('news.loadError')}
          actionText={t('dashboard.retry')}
          onActionPress={loadNews}
        />
      </ScreenBackground>
    );
  }

  const photoUri = getMediaUrl(news.photo);

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={news.title} subtitle={formatLongDate(news.date, currentLanguage)} />
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}
        <Card variant="soft" style={styles.card}>
          <Text style={styles.text}>{news.text}</Text>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingBottom: spacing.xxxl,
    },
    skeletonWrap: {
      paddingHorizontal: spacing.lg,
    },
    photo: {
      width: '100%',
      height: 250,
      backgroundColor: colors.border,
      marginBottom: spacing.lg,
    },
    card: {
      marginHorizontal: spacing.lg,
    },
    text: {
      fontSize: fontSize.md,
      color: colors.text,
      lineHeight: 24,
      fontWeight: fontWeight.medium,
    },
  });

export default NewsDetailScreen;
