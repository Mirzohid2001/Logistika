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
import { useTranslation } from '../hooks/useTranslation';
import { ratingsService, ReviewsStatistics, ReviewsRecommendations } from '../services/ratingsService';
import { Rating } from '../types';
import { Card } from '../components/Card';
import { AppHeader } from '../components/AppHeader';
import { SkeletonCard } from '../components/Skeleton';
import { ScreenBackground } from '../components/ScreenBackground';
import { EmptyState } from '../components/EmptyState';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

const ReviewsHistoryScreen = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [reviews, setReviews] = useState<Rating[]>([]);
  const [statistics, setStatistics] = useState<ReviewsStatistics | null>(null);
  const [recommendations, setRecommendations] = useState<ReviewsRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'statistics' | 'recommendations'>('all');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const [reviewsData, statsData, recsData] = await Promise.all([
        ratingsService.getReviewsHistory(),
        ratingsService.getReviewsStatistics(),
        ratingsService.getReviewsRecommendations(),
      ]);
      setReviews(reviewsData);
      setStatistics(statsData);
      setRecommendations(recsData);
    } catch (error) {
      console.error('Error loading reviews history:', error);
      setLoadFailed(true);
      setReviews([]);
      setStatistics(null);
      setRecommendations(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <MaterialIcons
            key={star}
            name={star <= rating ? 'star' : 'star-border'}
            size={16}
            color={star <= rating ? colors.rating : colors.border}
          />
        ))}
      </View>
    );
  };

  const renderAllReviews = () => {
    if (reviews.length === 0) {
      return (
        <EmptyState title={t('reviews.noReviews')} />
      );
    }

    return (
      <View>
        {reviews.map((review) => (
          <Card key={review.id} style={styles.card}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewUserInfo}>
                <Text style={styles.reviewUserName}>
                  {review.from_user.first_name} {review.from_user.last_name}
                </Text>
                <Text style={styles.reviewDate}>
                  {new Date(review.created_at).toLocaleDateString('uz-UZ')}
                </Text>
              </View>
              {renderStars(review.rating)}
            </View>
            {review.comment && (
              <Text style={styles.reviewComment}>{review.comment}</Text>
            )}
            <View style={styles.reviewOrderInfo}>
              <MaterialIcons name="local-shipping" size={16} color={colors.textSecondary} />
              <Text style={styles.reviewOrderText}>
                {t('reviews.order')} #{typeof review.order === 'number' ? review.order : review.order.id}
              </Text>
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const renderStatistics = () => {
    if (!statistics) {
      return (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadData}
        />
      );
    }

    return (
      <View>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('reviews.receivedRatings')}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('reviews.averageRating')}</Text>
              <Text style={styles.statValue}>{statistics.received.average_rating.toFixed(1)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('reviews.totalRatings')}</Text>
              <Text style={styles.statValue}>{statistics.received.total_ratings}</Text>
            </View>
          </View>
          <View style={styles.distributionContainer}>
            <Text style={styles.distributionTitle}>{t('reviews.ratingDistribution')}</Text>
            {([5, 4, 3, 2, 1] as const).map((star) => (
              <View key={star} style={styles.distributionRow}>
                <View style={styles.distributionStars}>
                  {renderStars(star)}
                </View>
                <View style={styles.distributionBarContainer}>
                  <View
                    style={[
                      styles.distributionBar,
                      {
                        width: `${(statistics.received.rating_distribution[String(star) as keyof typeof statistics.received.rating_distribution] / Math.max(statistics.received.total_ratings, 1)) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.distributionCount}>
                  {statistics.received.rating_distribution[String(star) as keyof typeof statistics.received.rating_distribution]}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('reviews.givenRatings')}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('reviews.averageRating')}</Text>
              <Text style={styles.statValue}>{statistics.given.average_rating.toFixed(1)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('reviews.totalRatings')}</Text>
              <Text style={styles.statValue}>{statistics.given.total_ratings}</Text>
            </View>
          </View>
        </Card>

        {statistics.monthly_statistics.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('reviews.monthlyStatistics')}</Text>
            <View style={styles.barChart}>
              {statistics.monthly_statistics.map((item) => {
                const maxCount = Math.max(...statistics.monthly_statistics.map(m => m.count));
                const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                return (
                  <View key={item.month} style={styles.barItem}>
                    <View style={[styles.bar, { height: `${height}%` }]} />
                    <Text style={styles.barLabel}>{item.month.split('-')[1]}</Text>
                    <Text style={styles.barValue}>{item.count}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}
      </View>
    );
  };

  const renderRecommendations = () => {
    if (!recommendations) {
      return (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadData}
        />
      );
    }

    return (
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('reviews.recommendations')}</Text>
        <View style={styles.currentStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('reviews.averageRating')}</Text>
            <Text style={styles.statValue}>{recommendations.current_stats.average_rating.toFixed(1)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('reviews.totalRatings')}</Text>
            <Text style={styles.statValue}>{recommendations.current_stats.total_ratings}</Text>
          </View>
        </View>
        <View style={styles.recommendationsList}>
          {recommendations.recommendations.map((rec, index) => (
            <View key={index} style={styles.recommendationItem}>
              <MaterialIcons name="lightbulb" size={20} color={colors.warning} />
              <Text style={styles.recommendationText}>{rec}</Text>
            </View>
          ))}
        </View>
      </Card>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('reviews.historyTitle')} />
      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : loadFailed ? (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadData}
        />
      ) : (
        <>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            {t('reviews.allReviews')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'statistics' && styles.tabActive]}
          onPress={() => setActiveTab('statistics')}
        >
          <Text style={[styles.tabText, activeTab === 'statistics' && styles.tabTextActive]}>
            {t('reviews.statistics')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recommendations' && styles.tabActive]}
          onPress={() => setActiveTab('recommendations')}
        >
          <Text style={[styles.tabText, activeTab === 'recommendations' && styles.tabTextActive]}>
            {t('reviews.recommendations')}
          </Text>
        </TouchableOpacity>
      </View>
        <ScrollView
          style={styles.scrollView}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={styles.content}>
            {activeTab === 'all' && renderAllReviews()}
            {activeTab === 'statistics' && renderStatistics()}
            {activeTab === 'recommendations' && renderRecommendations()}
          </View>
        </ScrollView>
        </>
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
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
    letterSpacing: 0.3,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  reviewUserInfo: {
    flex: 1,
  },
  reviewUserName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  reviewDate: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  reviewComment: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  reviewOrderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  reviewOrderText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.xxxl,
    fontWeight: fontWeight.medium,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  distributionContainer: {
    marginTop: spacing.lg,
  },
  distributionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: 0.2,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  distributionStars: {
    width: 90,
  },
  distributionBarContainer: {
    flex: 1,
    height: 10,
    backgroundColor: colors.borderLight,
    borderRadius: borderRadius.sm,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  distributionBar: {
    height: '100%',
    backgroundColor: colors.rating,
    borderRadius: borderRadius.sm,
  },
  distributionCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    width: 35,
    textAlign: 'right',
    fontWeight: fontWeight.semibold,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    paddingHorizontal: 8,
  },
  barItem: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  bar: {
    width: '100%',
    backgroundColor: colors.success,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    minHeight: 4,
  },
  barLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  barValue: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  currentStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  recommendationsList: {
    marginTop: spacing.sm,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  recommendationText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginLeft: spacing.sm,
    fontWeight: fontWeight.medium,
  },
});

export default ReviewsHistoryScreen;
