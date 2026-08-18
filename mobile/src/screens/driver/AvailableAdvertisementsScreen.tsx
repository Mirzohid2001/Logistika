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
  Switch,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { advertisementsService } from '../../services/advertisementsService';
import { locationsService } from '../../services/locationsService';
import { useTranslation } from '../../hooks/useTranslation';
import { Advertisement, City, SavedSearch } from '../../types';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { Button } from '../../components/Button';
import { spacing, fontSize } from '../../theme';
import { useThemedStyles, type AppColors } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { DriverVerificationBanner } from '../../components/DriverVerificationBanner';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { AdvertisementBrowseCard } from '../../components/AdvertisementBrowseCard';

type BrowseFilters = {
  search?: string;
  city_from?: number | null;
  city_to?: number | null;
  weight_min?: number | null;
  weight_max?: number | null;
  cost_min?: number | null;
  cost_max?: number | null;
  savedSearchId?: number;
};

const AvailableAdvertisementsScreen = () => {
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
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'nearby' | 'trust'>('nearby');
  const [sortOrder, setSortOrder] = useState<'new' | 'old' | 'cheap' | 'expensive'>('new');
  const [departureCities, setDepartureCities] = useState<City[]>([]);
  const [destinationCities, setDestinationCities] = useState<City[]>([]);
  const [selectedDepartureCity, setSelectedDepartureCity] = useState<number | null>(null);
  const [selectedDestinationCity, setSelectedDestinationCity] = useState<number | null>(null);
  const [weightMin, setWeightMin] = useState('');
  const [weightMax, setWeightMax] = useState('');
  const [costMin, setCostMin] = useState('');
  const [costMax, setCostMax] = useState('');
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchAlertsEnabled, setSaveSearchAlertsEnabled] = useState(true);
  const [showSavedSearches, setShowSavedSearches] = useState(false);

  useEffect(() => {
    loadAllCities();
  }, []);

  const applyBrowseFilters = useCallback((filters?: BrowseFilters | null) => {
    if (!filters) {
      return null;
    }
    const nextQuery = filters.search || '';
    const nextDeparture = filters.city_from ?? null;
    const nextDestination = filters.city_to ?? null;
    const nextWeightMin = filters.weight_min != null ? String(filters.weight_min) : '';
    const nextWeightMax = filters.weight_max != null ? String(filters.weight_max) : '';
    const nextCostMin = filters.cost_min != null ? String(filters.cost_min) : '';
    const nextCostMax = filters.cost_max != null ? String(filters.cost_max) : '';
    setSearchQuery(nextQuery);
    setSelectedDepartureCity(nextDeparture);
    setSelectedDestinationCity(nextDestination);
    setWeightMin(nextWeightMin);
    setWeightMax(nextWeightMax);
    setCostMin(nextCostMin);
    setCostMax(nextCostMax);
    return {
      searchQuery: nextQuery,
      selectedDepartureCity: nextDeparture,
      selectedDestinationCity: nextDestination,
      weightMin: nextWeightMin,
      weightMax: nextWeightMax,
      costMin: nextCostMin,
      costMax: nextCostMax,
    };
  }, []);

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

  const loadAdvertisements = useCallback(
    async (
      pageNum: number = 1,
      refresh: boolean = false,
      override?: {
        searchQuery?: string;
        selectedDepartureCity?: number | null;
        selectedDestinationCity?: number | null;
        weightMin?: string;
        weightMax?: string;
        costMin?: string;
        costMax?: string;
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
        const cMin = override?.costMin ?? costMin;
        const cMax = override?.costMax ?? costMax;

        const params: any = {
          is_closed: false,
        };

        if (q.trim()) {
          params.search = q.trim();
        }
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
        if (cMin) {
          params.cost_min = parseFloat(cMin);
        }
        if (cMax) {
          params.cost_max = parseFloat(cMax);
        }
        if (sortBy === 'date') {
          params.date = sortOrder === 'new' ? 'new' : 'old';
        }
        if (sortBy === 'price') {
          params.price = sortOrder === 'cheap' ? 'cheap' : 'expensive';
        }
        if (sortBy === 'nearby') {
          params.nearby = true;
        }
        if (sortBy === 'trust') {
          params.trust = 'high';
        }

        const response = await advertisementsService.getAdvertisements(params);

        const results = Array.isArray(response) ? response : response.results || [];
        const hasMorePages = Array.isArray(response) ? false : !!response.next;

        if (pageNum === 1) {
          setAdvertisements(results);
        } else {
          setAdvertisements((prev) => [...prev, ...results]);
        }

        setHasMore(hasMorePages);
      } catch (error) {
        console.error('Error loading advertisements:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      selectedDepartureCity,
      selectedDestinationCity,
      weightMin,
      weightMax,
      costMin,
      costMax,
      sortBy,
      sortOrder,
      searchQuery,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      const params = (route.params || {}) as { filters?: BrowseFilters };
      if (params.filters) {
        const override = applyBrowseFilters(params.filters);
        setPage(1);
        void loadAdvertisements(1, false, override || undefined);
        (navigation as any).setParams?.({ filters: undefined });
      }
    }, [route.params, applyBrowseFilters, navigation, loadAdvertisements])
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
    setCostMin('');
    setCostMax('');
    setSortBy('nearby');
    setSortOrder('new');
    setSearchQuery('');
    setPage(1);
    loadAdvertisements(1);
  };

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) {
      return;
    }
    try {
      await advertisementsService.createSavedSearch({
        name: saveSearchName.trim(),
        query: searchQuery.trim() || undefined,
        departure_city: selectedDepartureCity || undefined,
        destination_city: selectedDestinationCity || undefined,
        min_weight: weightMin ? parseFloat(weightMin) : undefined,
        max_weight: weightMax ? parseFloat(weightMax) : undefined,
        min_cost: costMin ? parseFloat(costMin) : undefined,
        max_cost: costMax ? parseFloat(costMax) : undefined,
        alerts_enabled: saveSearchAlertsEnabled,
      });
      setShowSaveSearchModal(false);
      setSaveSearchName('');
    } catch (error: any) {
      console.error('Error saving search:', error);
    }
  };

  const handleApplySavedSearch = async (savedSearch: SavedSearch) => {
    try {
      const override = applyBrowseFilters({
        search: savedSearch.query || '',
        city_from:
          typeof savedSearch.departure_city === 'object' && savedSearch.departure_city
            ? savedSearch.departure_city.id
            : savedSearch.departure_city || null,
        city_to:
          typeof savedSearch.destination_city === 'object' && savedSearch.destination_city
            ? savedSearch.destination_city.id
            : savedSearch.destination_city || null,
        weight_min: savedSearch.min_weight ?? null,
        weight_max: savedSearch.max_weight ?? null,
        cost_min: savedSearch.min_cost ?? null,
        cost_max: savedSearch.max_cost ?? null,
      });
      setShowSavedSearches(false);
      setPage(1);
      await loadAdvertisements(1, false, override || undefined);
    } catch (error) {
      console.error('Error applying saved search:', error);
    }
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
    });
  };

  const handleToggleFavorite = async (item: Advertisement, e: any) => {
    e.stopPropagation();
    try {
      if (item.is_favorite) {
        const favorites = await advertisementsService.getFavorites();
        const favorite = favorites.find((f) => f.advertisement.id === item.id);
        if (favorite) {
          await advertisementsService.removeFromFavorites(favorite.id);
        }
      } else {
        try {
          await advertisementsService.addToFavorites(item.id);
        } catch (error: any) {
          if (error.response?.status === 400 && error.response?.data?.error === 'Already in favorites') {
            loadAdvertisements(1, true);
            return;
          }
          throw error;
        }
      }
      loadAdvertisements(1, true);
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
    }
  };

  const renderItem = ({ item, index }: { item: Advertisement; index: number }) => {
    return (
      <AnimatedListItem index={index}>
        <AdvertisementBrowseCard
          item={item}
          onPress={() => (navigation as any).navigate('AdvertisementDetail', { id: item.id })}
          onToggleFavorite={() => handleToggleFavorite(item, { stopPropagation: () => undefined })}
          showFavorite
          showClientMeta
          showLoadFit
          dateText={formatDate(item.created_at)}
          priceText={formatPrice(item.proposed_cost)}
        />
      </AnimatedListItem>
    );
  };

  if (loading && advertisements.length === 0) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dashboard.searchLoads')} />
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
    sortBy !== 'nearby' ||
    (sortBy !== 'nearby' && sortOrder !== 'new') ||
    searchQuery.trim() !== ''
  );

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('dashboard.searchLoads')} />
      <DriverVerificationBanner />
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
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowSavedSearches(true)}>
          <MaterialIcons name="bookmark" size={20} color={colors.primary} />
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
            title={t('advertisements.noAdvertisements')}
            message={t('advertisements.noAdvertisementsMessage')}
          />
        }
        ListFooterComponent={
          hasMore && advertisements.length > 0 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
      />

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
                <Text style={styles.filterSectionTitle}>{t('advertisements.price')}</Text>
                <View style={styles.filterRow}>
                  <View style={styles.filterHalf}>
                    <TextInput
                      style={styles.filterInput}
                      placeholder={t('advertisements.min')}
                      value={costMin}
                      onChangeText={setCostMin}
                      keyboardType="numeric"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                  <View style={styles.filterHalf}>
                    <TextInput
                      style={styles.filterInput}
                      placeholder={t('advertisements.max')}
                      value={costMax}
                      onChangeText={setCostMax}
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
                      sortBy === 'nearby' && styles.sortOptionActive,
                    ]}
                    onPress={() => {
                      setSortBy('nearby');
                      setSortOrder('new');
                    }}>
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === 'nearby' && styles.sortOptionTextActive,
                      ]}>
                      {t('advertisements.sortByNearby')}
                    </Text>
                  </TouchableOpacity>
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
                  <TouchableOpacity
                    style={[
                      styles.sortOption,
                      sortBy === 'trust' && styles.sortOptionActive,
                    ]}
                    onPress={() => setSortBy('trust')}>
                    <Text
                      style={[
                        styles.sortOptionText,
                        sortBy === 'trust' && styles.sortOptionTextActive,
                      ]}>
                      {t('advertisements.sortByTrust', { defaultValue: 'Ishonch' })}
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
              {hasActiveFilters && (
                <Button
                  title={t('advertisements.save')}
                  onPress={() => {
                    setShowFilters(false);
                    setShowSaveSearchModal(true);
                  }}
                  variant="outline"
                  style={styles.modalButton}
                />
              )}
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

      <Modal
        visible={showSaveSearchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSaveSearchModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('advertisements.saveSearch')}</Text>
              <TouchableOpacity
                onPress={() => setShowSaveSearchModal(false)}
                style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.filterLabel}>{t('advertisements.searchName')}</Text>
              <TextInput
                style={styles.filterInput}
                placeholder={t('advertisements.enterSearchName')}
                value={saveSearchName}
                onChangeText={setSaveSearchName}
                placeholderTextColor={colors.textTertiary}
              />
              <View style={styles.alertsRow}>
                <Text style={styles.filterLabel}>{t('advertisements.enableAlerts')}</Text>
                <Switch
                  value={saveSearchAlertsEnabled}
                  onValueChange={setSaveSearchAlertsEnabled}
                  trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
                  thumbColor={saveSearchAlertsEnabled ? colors.primary : colors.textTertiary}
                />
              </View>
            </View>
            <View style={styles.modalFooter}>
              <Button
                title={t('advertisements.cancel')}
                onPress={() => {
                  setShowSaveSearchModal(false);
                  setSaveSearchName('');
                }}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title={t('advertisements.save')}
                onPress={handleSaveSearch}
                variant="primary"
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <SavedSearchesModal
        visible={showSavedSearches}
        onClose={() => setShowSavedSearches(false)}
        onApply={handleApplySavedSearch}
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
  emptyContainer: {
    flex: 1,
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  itemHeader: {
    flexDirection: 'row',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 16,
    backgroundColor: colors.backgroundTertiary,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 16,
    backgroundColor: colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderIcon: {
    fontSize: 40,
  },
  itemContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 24,
    marginRight: 8,
  },
  favoriteButton: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIcon: {
    fontSize: 24,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 10,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  routeDotDest: {
    backgroundColor: colors.success,
  },
  routeCity: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  routeArrow: {
    marginHorizontal: 8,
  },
  routeArrowText: {
    fontSize: 16,
    color: colors.textTertiary,
    fontWeight: '300',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  detailText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  fragileTag: {
    backgroundColor: colors.warningGlow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fragileText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.warning,
  },
  clientReputation: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  clientName: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  date: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  footerLoader: {
    padding: 20,
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    fontSize: 18,
    color: colors.textTertiary,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  filterButtonActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 20,
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: colors.textTertiary,
  },
  modalBody: {
    padding: 20,
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
  alertsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
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
  emptyText: {
    fontSize: 16,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 40,
  },
  savedSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savedSearchContent: {
    flex: 1,
  },
  savedSearchName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  savedSearchDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  savedSearchDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 12,
  },
  deleteButtonText: {
    fontSize: 20,
  },
});

const SavedSearchesModal = ({
  visible,
  onClose,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (search: SavedSearch) => void;
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadSavedSearches();
    }
  }, [visible]);

  const loadSavedSearches = async () => {
    try {
      setLoading(true);
      const searches = await advertisementsService.getSavedSearches();
      setSavedSearches(searches);
    } catch (error) {
      console.error('Error loading saved searches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await advertisementsService.deleteSavedSearch(id);
      loadSavedSearches();
    } catch (error) {
      console.error('Error deleting saved search:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('advertisements.savedSearches')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : savedSearches.length === 0 ? (
              <Text style={styles.emptyText}>{t('advertisements.noSavedSearches')}</Text>
            ) : (
              savedSearches.map((search) => (
                <View key={search.id} style={styles.savedSearchItem}>
                  <TouchableOpacity
                    style={styles.savedSearchContent}
                    onPress={() => onApply(search)}>
                    <Text style={styles.savedSearchName}>{search.name}</Text>
                    <View style={styles.savedSearchDetails}>
                      {search.query && (
                        <Text style={styles.savedSearchDetail}>🔍 {search.query}</Text>
                      )}
                      {typeof search.departure_city === 'object' && search.departure_city && (
                        <Text style={styles.savedSearchDetail}>
                          📍 {search.departure_city.name}
                        </Text>
                      )}
                      {typeof search.destination_city === 'object' && search.destination_city && (
                        <Text style={styles.savedSearchDetail}>
                          → {search.destination_city.name}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(search.id)}
                    style={styles.deleteButton}>
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default AvailableAdvertisementsScreen;
