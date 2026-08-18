import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { User } from '../../types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { SearchBar } from '../../components/SearchBar';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { createListScreenStyles } from '../../theme/listScreenStyles';

const DispatcherDriversListScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createListScreenStyles(colors), [colors]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDrivers = useCallback(async () => {
    try {
      setLoadError(null);
      if (!drivers.length) {setLoading(true);}
      const data = await dispatcherService.getDrivers();
      let filtered = data;

      if (searchQuery) {
        filtered = data.filter(
          (driver) =>
            driver.phone.includes(searchQuery) ||
            driver.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            driver.last_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setDrivers(filtered);
    } catch (error) {
      console.error('Error loading drivers:', error);
      setLoadError(t('dispatcherOps.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, t]);

  useFocusEffect(
    useCallback(() => {
      loadDrivers();
    }, [loadDrivers])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadDrivers();
  };

  const renderItem = ({ item, index }: { item: User; index: number }) => (
    <AnimatedListItem index={index}>
      <TouchableOpacity
        onPress={() =>
          (navigation as any).navigate('DispatcherDriverDetail', { driverId: item.id })
        }>
        <Card variant="soft">
          <View style={styles.rowHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.first_name[0]}
                {item.last_name[0]}
              </Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>
                {item.first_name} {item.last_name}
              </Text>
              <Text style={styles.rowSubtitle}>{item.phone}</Text>
              {item.average_rating !== undefined && item.average_rating > 0 && (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingValue}>⭐ {item.average_rating.toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({item.total_ratings || 0})</Text>
                </View>
              )}
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>
    </AnimatedListItem>
  );

  return (
    <ScreenBackground>
      <AppHeader
        variant="hero"
        title={t('dispatcherLists.driversTitle')}
        subtitle={t('dispatcherLists.driversSubtitle')}
      />
      <SearchBar
        placeholder={t('dispatcherLists.searchPlaceholder')}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : loadError && drivers.length === 0 ? (
        <EmptyState
          title={t('common.error')}
          message={loadError}
          actionText={t('dashboard.retry')}
          onActionPress={loadDrivers}
        />
      ) : (
        <FlatList
          data={drivers}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={drivers.length === 0 ? styles.emptyContainer : styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              title={t('dispatcherLists.noDrivers')}
              message={t('dispatcherLists.noDriversMessage')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

export default DispatcherDriversListScreen;
