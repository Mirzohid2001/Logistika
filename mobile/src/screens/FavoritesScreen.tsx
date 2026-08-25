import React, { useState, useCallback } from 'react';
import { StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { advertisementsService } from '../services/advertisementsService';
import { FavoriteAdvertisement, Advertisement } from '../types';
import { EmptyState } from '../components/EmptyState';
import { AppHeader } from '../components/AppHeader';
import { SkeletonCard } from '../components/Skeleton';
import { ScreenBackground } from '../components/ScreenBackground';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { AdvertisementBrowseCard } from '../components/AdvertisementBrowseCard';

const FavoritesScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const [favorites, setFavorites] = useState<FavoriteAdvertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await advertisementsService.getFavorites();
      setFavorites(data);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setFavorites([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

  const handleRemoveFavorite = async (id: number) => {
    try {
      await advertisementsService.removeFromFavorites(id);
      loadFavorites();
    } catch (error) {
      console.error('Error removing favorite:', error);
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) {return t('advertisements.priceNegotiable');}
    return `${price.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} ${t('dashboard.currencySuffix')}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
    });
  };

  const renderItem = ({ item, index }: { item: FavoriteAdvertisement; index: number }) => {
    const advertisement: Advertisement =
      typeof item.advertisement === 'object' ? item.advertisement : ({} as Advertisement);

    return (
      <AnimatedListItem index={index}>
        <AdvertisementBrowseCard
          item={advertisement}
          onPress={() => (navigation as any).navigate('AdvertisementDetail', { id: advertisement.id })}
          onToggleFavorite={() => handleRemoveFavorite(item.id)}
          showFavorite
          dateText={formatDate(advertisement.created_at || '')}
          priceText={formatPrice(advertisement.proposed_cost)}
        />
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('favorites.title')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (loadFailed) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('favorites.title')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadFavorites}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('favorites.title')} />
      <FlatList
        data={favorites}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={
          favorites.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <EmptyState
            title={t('favorites.noFavorites')}
            message={t('favorites.noFavoritesMessage')}
          />
        }
      />
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  listContainer: {
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxxl + 24,
  },
  emptyContainer: { flex: 1 },
  card: { marginHorizontal: spacing.lg, marginVertical: spacing.xs },
  itemHeader: { flexDirection: 'row' },
  photo: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
    marginRight: spacing.lg,
    backgroundColor: colors.borderLight,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
    marginRight: spacing.lg,
    backgroundColor: colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderIcon: { fontSize: 40 },
  itemContent: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    lineHeight: 24,
    marginRight: spacing.sm,
  },
  favoriteButton: {
    padding: spacing.sm,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIcon: { fontSize: 24 },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  routePoint: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.logisticsAccent,
  },
  routeDotDest: { backgroundColor: colors.success },
  routeCity: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  routeArrowText: {
    fontSize: fontSize.base,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  detailIcon: { fontSize: fontSize.sm, marginRight: spacing.xs },
  detailText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  date: { fontSize: fontSize.sm, color: colors.textTertiary, fontWeight: fontWeight.medium },
  price: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.primary },
});

export default FavoritesScreen;
