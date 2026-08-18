import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { advertisementsService } from '../../services/advertisementsService';
import { Advertisement } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { Button } from '../../components/Button';
import { getMediaUrl } from '../../services/api';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useTranslation } from '../../hooks/useTranslation';

const MyAdvertisementsScreen = () => {
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const [advertisements, setAdvertisements] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAdvertisements = useCallback(async () => {
    try {
      setLoading(true);
      const data = await advertisementsService.getMyAdvertisements();
      const results = Array.isArray(data) ? data : [];
      setAdvertisements(results);
    } catch (error: any) {
      console.error('Error loading my advertisements:', error);
      if (error.response?.status !== 404) {
        Alert.alert(t('common.error'), t('advertisements.myAdsLoadError'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      loadAdvertisements();
    }, [loadAdvertisements])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadAdvertisements();
  };

  const formatPrice = (price?: number) => {
    if (!price) {return t('advertisements.priceNegotiable');}
    return `${price.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm`;
  };

  const renderItem = ({ item, index }: { item: Advertisement; index: number }) => {
    const departureCity =
      typeof item.departure_city === 'object' && item.departure_city
        ? item.departure_city.name
        : '';
    const destinationCity =
      typeof item.destination_city === 'object' && item.destination_city
        ? item.destination_city.name
        : '';

    const photoUri = getMediaUrl(item.photo);

    return (
      <AnimatedListItem index={index}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() =>
          (navigation as any).navigate('AdvertisementDetail', { id: item.id })
        }>
        <Card variant="soft" style={styles.card}>
          <View style={styles.itemHeader}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderIcon}>📦</Text>
              </View>
            )}
            <View style={styles.itemContent}>
              <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title || t('advertisements.noTitle')}
                </Text>
                {item.is_closed && (
                  <View style={styles.closedBadge}>
                    <Text style={styles.closedText}>{t('profile.closed')}</Text>
                  </View>
                )}
              </View>
              <View style={styles.routeContainer}>
                <View style={styles.routePoint}>
                  <View style={styles.routeDot} />
                  <Text style={styles.routeCity}>{departureCity || '...'}</Text>
                </View>
                <View style={styles.routeArrow}>
                  <Text style={styles.routeArrowText}>→</Text>
                </View>
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, styles.routeDotDest]} />
                  <Text style={styles.routeCity}>{destinationCity || '...'}</Text>
                </View>
              </View>
              <View style={styles.detailsRow}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailIcon}>⚖️</Text>
                  <Text style={styles.detailText}>{item.weight || 0} {t('advertisements.kg')}</Text>
                </View>
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.price}>{formatPrice(item.proposed_cost)}</Text>
              </View>
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
        <AppHeader variant="hero" title={t('advertisements.myAdvertisements')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('advertisements.myAdvertisements')} />
      <FlatList
        data={advertisements}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={
          advertisements.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title={t('advertisements.noMyAdvertisements')}
            message={t('advertisements.noMyAdvertisementsMessage')}
          />
        }
      />
      <View style={styles.fabContainer}>
        <Button
          title={t('advertisements.newAdvertisementCta')}
          onPress={() => navigation.navigate('CreateAdvertisement' as never)}
          variant="primary"
        />
      </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  listContainer: {
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxxl + 80,
  },
  emptyContainer: {
    flex: 1,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    marginRight: spacing.lg,
    backgroundColor: colors.borderLight,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    marginRight: spacing.lg,
    backgroundColor: colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  photoPlaceholderIcon: {
    fontSize: 40,
    color: colors.primary,
  },
  itemContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  closedBadge: {
    backgroundColor: colors.dangerGlow,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  closedText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: fontWeight.semibold,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.round,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  routeDotDest: {
    backgroundColor: colors.success,
  },
  routeCity: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  routeArrow: {
    marginHorizontal: spacing.sm,
  },
  routeArrowText: {
    fontSize: fontSize.base,
    color: colors.textTertiary,
    fontWeight: fontWeight.normal,
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
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
  },
  detailIcon: {
    fontSize: fontSize.md,
    marginRight: spacing.xs,
    color: colors.textSecondary,
  },
  detailText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    letterSpacing: 0.3,
  },
  fabContainer: {
    padding: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    ...shadows.floating,
  },
});

export default MyAdvertisementsScreen;
