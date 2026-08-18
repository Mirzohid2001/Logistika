import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { advertisementsService } from '../services/advertisementsService';
import { SavedSearch } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { AppHeader } from '../components/AppHeader';
import { SkeletonCard } from '../components/Skeleton';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { ScreenBackground } from '../components/ScreenBackground';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../context/AuthContext';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { navigateRoleStack } from '../utils/navigationHelpers';

const SavedSearchesScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { activeMarketplaceRole } = useAuth();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSavedSearches = useCallback(async () => {
    try {
      const data = await advertisementsService.getSavedSearches();
      setSavedSearches(data);
    } catch (error) {
      console.error('Error loading saved searches:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSavedSearches();
    }, [loadSavedSearches])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadSavedSearches();
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      t('savedSearches.deleteTitle'),
      t('savedSearches.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await advertisementsService.deleteSavedSearch(id);
              loadSavedSearches();
            } catch (error) {
              console.error('Error deleting saved search:', error);
              Alert.alert(t('common.error'), t('savedSearches.deleteError'));
            }
          },
        },
      ]
    );
  };

  const handleApply = async (search: SavedSearch) => {
    try {
      const filters = {
        search: search.query || '',
        city_from:
          typeof search.departure_city === 'object' && search.departure_city
            ? search.departure_city.id
            : search.departure_city || null,
        city_to:
          typeof search.destination_city === 'object' && search.destination_city
            ? search.destination_city.id
            : search.destination_city || null,
        weight_min: search.min_weight ?? null,
        weight_max: search.max_weight ?? null,
        cost_min: search.min_cost ?? null,
        cost_max: search.max_cost ?? null,
        savedSearchId: search.id,
      };

      if (activeMarketplaceRole === 'driver') {
        navigateRoleStack(navigation as any, 'DriverStack', 'AvailableAdvertisements', {
          filters,
        });
        return;
      }

      navigateRoleStack(navigation as any, 'ClientStack', 'AdvertisementsList', {
        filters,
      });
    } catch (error) {
      console.error('Error applying saved search:', error);
      Alert.alert(t('common.error'), t('savedSearches.applyError'));
    }
  };

  const handleToggleAlerts = async (search: SavedSearch) => {
    const nextValue = !search.alerts_enabled;
    try {
      await advertisementsService.updateSavedSearch(search.id, { alerts_enabled: nextValue });
      setSavedSearches((prev) =>
        prev.map((item) => (item.id === search.id ? { ...item, alerts_enabled: nextValue } : item))
      );
    } catch (error) {
      console.error('Error updating saved search alerts:', error);
      Alert.alert(t('common.error'), t('savedSearches.alertsUpdateError'));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderItem = ({ item, index }: { item: SavedSearch; index: number }) => (
    <AnimatedListItem index={index}>
      <Card variant="soft" style={styles.card}>
        <Text style={styles.name}>{item.name}</Text>
        <View style={styles.details}>
          {item.query ? (
            <View style={styles.detailChip}>
              <MaterialIcons name="search" size={14} color={colors.textSecondary} />
              <Text style={styles.detailChipText}>{item.query}</Text>
            </View>
          ) : null}
          {typeof item.departure_city === 'object' && item.departure_city ? (
            <View style={styles.detailChip}>
              <MaterialIcons name="place" size={14} color={colors.primary} />
              <Text style={styles.detailChipText}>{item.departure_city.name}</Text>
            </View>
          ) : null}
          {typeof item.destination_city === 'object' && item.destination_city ? (
            <View style={styles.detailChip}>
              <MaterialIcons name="arrow-forward" size={14} color={colors.secondary} />
              <Text style={styles.detailChipText}>{item.destination_city.name}</Text>
            </View>
          ) : null}
          {item.min_weight ? (
            <View style={styles.detailChip}>
              <Text style={styles.detailChipText}>{item.min_weight} kg min</Text>
            </View>
          ) : null}
          {item.max_weight ? (
            <View style={styles.detailChip}>
              <Text style={styles.detailChipText}>{item.max_weight} kg max</Text>
            </View>
          ) : null}
          {item.min_cost ? (
            <View style={styles.detailChip}>
              <Text style={styles.detailChipText}>
                {item.min_cost.toLocaleString()} {t('statistics.currencySuffix')} min
              </Text>
            </View>
          ) : null}
          {item.max_cost ? (
            <View style={styles.detailChip}>
              <Text style={styles.detailChipText}>
                {item.max_cost.toLocaleString()} {t('statistics.currencySuffix')} max
              </Text>
            </View>
          ) : null}
          {item.alerts_enabled ? (
            <View style={[styles.detailChip, styles.alertChip]}>
              <MaterialIcons name="notifications-active" size={14} color={colors.primary} />
              <Text style={[styles.detailChipText, styles.alertChipText]}>
                {t('savedSearches.alertsOn')}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.alertsRow}>
          <Text style={styles.alertsLabel}>{t('savedSearches.alertsToggle')}</Text>
          <Switch
            value={!!item.alerts_enabled}
            onValueChange={() => handleToggleAlerts(item)}
            trackColor={{ false: colors.borderLight, true: colors.primaryLight }}
            thumbColor={item.alerts_enabled ? colors.primary : colors.textTertiary}
          />
        </View>
        <Text style={styles.date}>
          {t('savedSearches.created')}: {formatDate(item.created_at)}
        </Text>
        <View style={styles.actions}>
          <Button
            title={t('savedSearches.apply')}
            onPress={() => handleApply(item)}
            variant="primary"
            style={styles.applyButton}
          />
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <MaterialIcons name="delete-outline" size={20} color={colors.textLight} />
            <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </AnimatedListItem>
  );

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('savedSearches.title')} subtitle={t('savedSearches.subtitle')} />
      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={savedSearches}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={
            savedSearches.length === 0 ? styles.emptyContainer : styles.listContainer
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              title={t('savedSearches.emptyTitle')}
              message={t('savedSearches.emptyMessage')}
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
  listContainer: {
    paddingVertical: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  name: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  detailChipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  alertChip: {
    backgroundColor: colors.primaryGlow,
  },
  alertChipText: {
    color: colors.primary,
  },
  alertsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  alertsLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  date: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  applyButton: {
    flex: 1,
    marginBottom: 0,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.danger,
  },
  deleteButtonText: {
    color: colors.textLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});

export default SavedSearchesScreen;
