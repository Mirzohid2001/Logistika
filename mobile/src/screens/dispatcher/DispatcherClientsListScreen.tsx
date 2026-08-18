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

const DispatcherClientsListScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createListScreenStyles(colors), [colors]);
  const [clients, setClients] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await dispatcherService.getClients();
      let filtered = data;

      if (searchQuery) {
        filtered = data.filter(
          (client) =>
            client.phone.includes(searchQuery) ||
            client.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            client.last_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setClients(filtered);
    } catch (error) {
      console.error('Error loading clients:', error);
      setClients([]);
      setLoadError(t('dispatcherOps.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadClients();
    }, [loadClients])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadClients();
  };

  const renderItem = ({ item, index }: { item: User; index: number }) => (
    <AnimatedListItem index={index}>
      <TouchableOpacity
        onPress={() =>
          (navigation as any).navigate('DispatcherClientDetail', { clientId: item.id })
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
        title={t('dispatcherLists.clientsTitle')}
        subtitle={t('dispatcherLists.clientsSubtitle')}
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
      ) : loadError && clients.length === 0 ? (
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('common.retry')}
          onActionPress={loadClients}
        />
      ) : (
        <FlatList
          data={clients}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={clients.length === 0 ? styles.emptyContainer : styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <EmptyState
              title={t('dispatcherLists.noClients')}
              message={t('dispatcherLists.noClientsMessage')}
            />
          }
        />
      )}
    </ScreenBackground>
  );
};

export default DispatcherClientsListScreen;
