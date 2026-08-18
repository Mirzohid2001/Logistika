import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { advertisementsService } from '../../services/advertisementsService';
import { locationsService } from '../../services/locationsService';
import { useTranslation } from '../../hooks/useTranslation';
import { Advertisement, Country, City } from '../../types';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { AdvertisementBrowseCard } from '../../components/AdvertisementBrowseCard';

const AdvertisementsListScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [advertisements, setAdvertisements] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'price'>('date');
  const [sortOrder, setSortOrder] = useState<'new' | 'old' | 'cheap' | 'expensive'>('new');
  const [_countries, setCountries] = useState<Country[]>([]);
  const [departureCities, setDepartureCities] = useState<City[]>([]);
  const [destinationCities, setDestinationCities] = useState<City[]>([]);
  const [selectedDepartureCity, setSelectedDepartureCity] = useState<number | null>(null);
  const [selectedDestinationCity, setSelectedDestinationCity] = useState<number | null>(null);
  const [weightMin, setWeightMin] = useState('');
  const [weightMax, setWeightMax] = useState('');

  useEffect(() => {
    loadCountries();
    loadAllCities();
  }, []);

  const loadCountries = async () => {
    try {
      const data = await locationsService.getCountries();
      setCountries(data);
    } catch (error) {
      console.error('Error loading countries:', error);
    }
  };

  const loadAllCities = async () => {
    try {
      const countries = await locationsService.getCountries();
      const allCitiesNested = await Promise.all(countries.map((country) => locationsService.getCities(country.id)));
      const allCities = allCitiesNested.flat();
      setDepartureCities(allCities);
      setDestinationCities(allCities);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const loadAdvertisements = useCallback(async (
    pageNum: number = 1,
    refresh: boolean = false,
    override?: {
      searchQuery?: string;
      selectedDepartureCity?: number | null;
      selectedDestinationCity?: number | null;
      weightMin?: string;
      weightMax?: string;
    }
  ) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else if (pageNum === 1) {
        setLoading(true);
      }

      const q = override?.searchQuery ?? searchQuery;
      const dep = override?.selectedDepartureCity ?? selectedDepartureCity;
      const dest = override?.selectedDestinationCity ?? selectedDestinationCity;
      const wMin = override?.weightMin ?? weightMin;
      const wMax = override?.weightMax ?? weightMax;

      const params: any = {
        is_closed: false,
      };

      if (dep) {
        params.city_from = dep;
      }
      if (dest) {
        params.city_to = dest;
      }
      if (wMin) {
        params.weight_min = parseFloat(wMin);
      }
      if (wMax) {
        params.weight_max = parseFloat(wMax);
      }
      if (sortBy === 'date') {
        params.date = sortOrder === 'new' ? 'new' : 'old';
      }
      if (sortBy === 'price') {
        params.price = sortOrder === 'cheap' ? 'cheap' : 'expensive';
      }

      const response = await advertisementsService.getAdvertisements(params);

      const results = Array.isArray(response) ? response : response.results || [];
      const hasMorePages = Array.isArray(response) ? false : !!response.next;

      let filteredResults = results;
      if (q.trim()) {
        filteredResults = results.filter((item: Advertisement) =>
          item.title?.toLowerCase().includes(q.toLowerCase())
        );
      }

      if (pageNum === 1) {
        setAdvertisements(filteredResults);
      } else {
        setAdvertisements((prev) => [...prev, ...filteredResults]);
      }

      setHasMore(hasMorePages);
    } catch (error) {
      console.error('Error loading advertisements:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDepartureCity, selectedDestinationCity, weightMin, weightMax, sortBy, sortOrder, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      const params = (route.params || {}) as {
        filters?: {
          search?: string;
          city_from?: number | null;
          city_to?: number | null;
          weight_min?: number | null;
          weight_max?: number | null;
        };
      };
      if (!params.filters) {
        return;
      }
      const nextQuery = params.filters.search || '';
      const nextDeparture = params.filters.city_from ?? null;
      const nextDestination = params.filters.city_to ?? null;
      const nextWeightMin =
        params.filters.weight_min != null ? String(params.filters.weight_min) : '';
      const nextWeightMax =
        params.filters.weight_max != null ? String(params.filters.weight_max) : '';
      setSearchQuery(nextQuery);
      setSelectedDepartureCity(nextDeparture);
      setSelectedDestinationCity(nextDestination);
      setWeightMin(nextWeightMin);
      setWeightMax(nextWeightMax);
      setPage(1);
      void loadAdvertisements(1, false, {
        searchQuery: nextQuery,
        selectedDepartureCity: nextDeparture,
        selectedDestinationCity: nextDestination,
        weightMin: nextWeightMin,
        weightMax: nextWeightMax,
      });
      (navigation as any).setParams?.({ filters: undefined });
    }, [route.params, navigation, loadAdvertisements])
  );

  useEffect(() => {
    loadAdvertisements(1);
  }, [loadAdvertisements]);


  const handleRefresh = () => {
    setPage(1);
    loadAdvertisements(1, true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore && advertisements.length > 0) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadAdvertisements(nextPage);
    }
  };

  const handleApplyFilters = () => {
    setPage(1);
    setShowFilters(false);
    loadAdvertisements(1);
  };

  const handleClearFilters = () => {
    setSelectedDepartureCity(null);
    setSelectedDestinationCity(null);
    setWeightMin('');
    setWeightMax('');
    setSortBy('date');
    setSortOrder('new');
    setSearchQuery('');
    setPage(1);
    loadAdvertisements(1);
  };

  const formatPrice = (price?: number) => {
    if (!price) {return t('advertisements.priceNegotiable');}
    return `${price.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderItem = ({ item, index }: { item: Advertisement; index: number }) => {
    return (
      <AnimatedListItem index={index}>
        <AdvertisementBrowseCard
          item={item}
          onPress={() => (navigation as any).navigate('AdvertisementDetail', { id: item.id })}
          dateText={formatDate(item.created_at)}
          priceText={formatPrice(item.proposed_cost)}
        />
      </AnimatedListItem>
    );
  };

  const listHeaderActions = (
    <View style={styles.headerButtons}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => navigation.navigate('MyAdvertisements' as never)}
        accessibilityRole="button"
        accessibilityLabel={t('advertisements.myAdvertisements')}>
        <MaterialIcons name="description" size={22} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => navigation.navigate('ClientOrders' as never)}
        accessibilityRole="button"
        accessibilityLabel={t('orders.myOrders')}>
        <MaterialIcons name="local-shipping" size={22} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

  if (loading && advertisements.length === 0) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('advertisements.title')} right={listHeaderActions} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  const hasActiveFilters = Boolean(
    selectedDepartureCity ||
    selectedDestinationCity ||
    weightMin ||
    weightMax ||
    sortBy !== 'date' ||
    sortOrder !== 'new' ||
    searchQuery.trim() !== ''
  );

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('advertisements.title')} right={listHeaderActions} />
      <View style={styles.searchBar}>
        <View style={styles.searchInputContainer}>
          <MaterialIcons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('advertisements.searchPlaceholder')}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setPage(1);
            }}
            placeholderTextColor={colors.textTertiary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setPage(1);
              }}
              style={styles.clearButton}>
              <MaterialIcons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
          onPress={() => setShowFilters(true)}>
          <MaterialIcons
            name="tune"
            size={20}
            color={hasActiveFilters ? colors.textLight : colors.primary}
          />
          {hasActiveFilters && <View style={styles.filterBadge} />}
        </TouchableOpacity>
      </View>

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
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={true}
        removeClippedSubviews={false}
        ListEmptyComponent={
          <EmptyState
            title={t('advertisements.noAdvertisementsFound')}
            message={t('advertisements.noAdvertisementsMessage')}
          />
        }
        ListFooterComponent={
          hasMore && advertisements.length > 0 ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => (navigation as any).navigate('CreateAdvertisement')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={showFilters}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilters(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('advertisements.filter')}</Text>
              <TouchableOpacity
                onPress={() => setShowFilters(false)}
                style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('advertisements.route')}</Text>
                <View style={styles.filterRow}>
                  <View style={styles.filterHalf}>
                    <Text style={styles.filterLabel}>{t('advertisements.from')}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.cityScroll}>
                      {departureCities.map((city) => (
                        <TouchableOpacity
                          key={city.id}
                          style={[
                            styles.cityChip,
                            selectedDepartureCity === city.id && styles.cityChipActive,
                          ]}
                          onPress={() =>
                            setSelectedDepartureCity(
                              selectedDepartureCity === city.id ? null : city.id
                            )
                          }>
                          <Text
                            style={[
                              styles.cityChipText,
                              selectedDepartureCity === city.id && styles.cityChipTextActive,
                            ]}>
                            {city.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <View style={styles.filterHalf}>
                    <Text style={styles.filterLabel}>{t('advertisements.to')}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.cityScroll}>
                      {destinationCities.map((city) => (
                        <TouchableOpacity
                          key={city.id}
                          style={[
                            styles.cityChip,
                            selectedDestinationCity === city.id && styles.cityChipActive,
                          ]}
                          onPress={() =>
                            setSelectedDestinationCity(
                              selectedDestinationCity === city.id ? null : city.id
                            )
                          }>
                          <Text
                            style={[
                              styles.cityChipText,
                              selectedDestinationCity === city.id && styles.cityChipTextActive,
                            ]}>
                            {city.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('advertisements.weight')}</Text>
                <View style={styles.filterRow}>
                  <View style={styles.filterHalf}>
                    <TextInput
                      style={styles.filterInput}
                      placeholder={t('advertisements.min')}
                      value={weightMin}
                      onChangeText={setWeightMin}
                      keyboardType="numeric"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                  <View style={styles.filterHalf}>
                    <TextInput
                      style={styles.filterInput}
                      placeholder={t('advertisements.max')}
                      value={weightMax}
                      onChangeText={setWeightMax}
                      keyboardType="numeric"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('advertisements.sort')}</Text>
                <View style={styles.sortOptions}>
                  <TouchableOpacity
                    style={[
                      styles.sortOption,
                      sortBy === 'date' && styles.sortOptionActive,
                    ]}
                    onPress={() => {
                      setSortBy('date');
                      setSortOrder('new');
                    }}>
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === 'date' && styles.sortOptionTextActive,
                      ]}>
                      {t('advertisements.sortByDate')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.sortOption,
                      sortBy === 'price' && styles.sortOptionActive,
                    ]}
                    onPress={() => {
                      setSortBy('price');
                      setSortOrder('cheap');
                    }}>
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === 'price' && styles.sortOptionTextActive,
                      ]}>
                      {t('advertisements.sortByPrice')}
                    </Text>
                  </TouchableOpacity>
                </View>
                {sortBy === 'date' && (
                  <View style={styles.sortOrderOptions}>
                    <TouchableOpacity
                      style={[
                        styles.sortOrderOption,
                        sortOrder === 'new' && styles.sortOrderOptionActive,
                      ]}
                      onPress={() => setSortOrder('new')}>
                      <Text
                        style={[
                          styles.sortOrderOptionText,
                          sortOrder === 'new' && styles.sortOrderOptionTextActive,
                        ]}>
                        {t('advertisements.new')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.sortOrderOption,
                        sortOrder === 'old' && styles.sortOrderOptionActive,
                      ]}
                      onPress={() => setSortOrder('old')}>
                      <Text
                        style={[
                          styles.sortOrderOptionText,
                          sortOrder === 'old' && styles.sortOrderOptionTextActive,
                        ]}>
                        {t('advertisements.old')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {sortBy === 'price' && (
                  <View style={styles.sortOrderOptions}>
                    <TouchableOpacity
                      style={[
                        styles.sortOrderOption,
                        sortOrder === 'cheap' && styles.sortOrderOptionActive,
                      ]}
                      onPress={() => setSortOrder('cheap')}>
                      <Text
                        style={[
                          styles.sortOrderOptionText,
                          sortOrder === 'cheap' && styles.sortOrderOptionTextActive,
                        ]}>
                        {t('advertisements.cheap')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.sortOrderOption,
                        sortOrder === 'expensive' && styles.sortOrderOptionActive,
                      ]}
                      onPress={() => setSortOrder('expensive')}>
                      <Text
                        style={[
                          styles.sortOrderOptionText,
                          sortOrder === 'expensive' && styles.sortOrderOptionTextActive,
                        ]}>
                        {t('advertisements.expensive')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                title={t('advertisements.clear')}
                onPress={handleClearFilters}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title={t('advertisements.apply')}
                onPress={handleApplyFilters}
                variant="primary"
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
    lineHeight: 24,
    letterSpacing: 0.2,
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
  fragileTag: {
    backgroundColor: colors.warningGlow,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: `${colors.warning}66`,
  },
  fragileText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.warning,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    letterSpacing: 0.3,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: 90,
    width: 64,
    height: 64,
    borderRadius: borderRadius.round,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.colored(colors.primary),
  },
  fabText: {
    color: colors.textLight,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.normal,
    lineHeight: 36,
  },
  searchBar: {
    flexDirection: 'row',
    padding: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
    ...shadows.sm,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchIcon: {
    fontSize: fontSize.lg,
    marginRight: spacing.sm,
    color: colors.textSecondary,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.text,
    paddingVertical: spacing.md,
    fontWeight: fontWeight.medium,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearButtonText: {
    fontSize: fontSize.lg,
    color: colors.textTertiary,
    fontWeight: fontWeight.bold,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    position: 'relative',
    ...shadows.sm,
  },
  filterButtonActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
  },
  filterBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 10,
    height: 10,
    borderRadius: borderRadius.round,
    backgroundColor: colors.danger,
    ...shadows.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
    ...shadows.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.round,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  modalCloseText: {
    fontSize: fontSize.lg,
    color: colors.textTertiary,
    fontWeight: fontWeight.bold,
  },
  modalBody: {
    padding: spacing.xl,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  filterHalf: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  cityScroll: {
    flexDirection: 'row',
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  cityChipActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  cityChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  cityChipTextActive: {
    color: colors.primary,
  },
  filterInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.backgroundSecondary,
    color: colors.text,
  },
  sortOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sortOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  sortOptionActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortOptionTextActive: {
    color: colors.primary,
  },
  sortOrderOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  sortOrderOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  sortOrderOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortOrderOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortOrderOptionTextActive: {
    color: colors.textLight,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    marginBottom: 0,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AdvertisementsListScreen;
