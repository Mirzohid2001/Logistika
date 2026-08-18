import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Vibration,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { User } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { toastService } from '../../services/toastService';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';

const DispatcherAssignScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { orderId, isReassign } = route.params as { orderId: number; isReassign?: boolean };

  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [actionDone, setActionDone] = useState(false);

  const loadDrivers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dispatcherService.getDrivers();
      setDrivers(data);
    } catch (error) {
      console.error('Error loading drivers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDrivers();
    }, [loadDrivers])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadDrivers();
  };

  const handleAssign = async () => {
    if (!selectedDriver) {
      Alert.alert(t('common.error'), t('dispatcherLists.selectDriver'));
      return;
    }

    setAssigning(true);
    try {
      if (isReassign) {
        await dispatcherService.reassignDriver(orderId, selectedDriver, notes);
        Vibration.vibrate(20);
        toastService.success(t('dispatcherLists.reassignSuccess'));
        setActionDone(true);
        setTimeout(() => setActionDone(false), 2500);
        Alert.alert(t('common.success'), t('dispatcherLists.reassignSuccess'), [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        await dispatcherService.assignDriver(orderId, selectedDriver, notes);
        Vibration.vibrate(20);
        toastService.success(t('dispatcherLists.assignSuccess'));
        setActionDone(true);
        setTimeout(() => setActionDone(false), 2500);
        Alert.alert(t('common.success'), t('dispatcherLists.assignSuccess'), [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (error: any) {
      Vibration.vibrate(120);
      const message = error.response?.data?.error || t('common.error');
      toastService.error(message);
      Alert.alert(t('common.error'), message);
    } finally {
      setAssigning(false);
    }
  };

  const renderDriver = ({ item, index }: { item: User; index: number }) => {
    const isSelected = selectedDriver === item.id;

    return (
      <AnimatedListItem index={index}>
        <TouchableOpacity onPress={() => setSelectedDriver(item.id)}>
          <Card variant="soft" style={[styles.driverCard, isSelected && styles.driverCardSelected]}>
            <View style={styles.driverHeader}>
              <Text style={styles.driverName}>
                {item.first_name} {item.last_name}
              </Text>
              {isSelected ? (
                <Text style={styles.selectedBadge}>✓ {t('dispatcherLists.selectedDriver')}</Text>
              ) : null}
            </View>
            <Text style={styles.driverPhone}>{item.phone}</Text>
            {item.average_rating !== undefined ? (
              <View style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>{t('dispatcherLists.ratingLabel')}</Text>
                <Text style={styles.ratingValue}>
                  ⭐ {item.average_rating.toFixed(1)} ({item.total_ratings || 0})
                </Text>
              </View>
            ) : null}
          </Card>
        </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader
        variant="hero"
        title={isReassign ? t('dispatcherLists.reassignTitle') : t('dispatcherLists.assignTitle')}
        subtitle={t('updaterLists.orderNumber', { id: orderId })}
      />
      <View style={styles.inputContainer}>
        <Input
          label={t('dispatcherLists.assignNotes')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('dispatcherLists.assignNotesPlaceholder')}
          multiline
        />
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={drivers}
          renderItem={renderDriver}
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

      <View style={styles.footer}>
        {actionDone ? (
          <View style={styles.actionDoneBadge}>
            <Text style={styles.actionDoneText}>{t('common.success')}</Text>
          </View>
        ) : null}
        <Button
          title={isReassign ? t('dispatcherLists.reassign') : t('dispatcherLists.assign')}
          onPress={handleAssign}
          loading={assigning}
          variant="primary"
          disabled={!selectedDriver}
        />
      </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  inputContainer: {
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  skeletonWrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  listContainer: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  emptyContainer: { flexGrow: 1 },
  driverCard: { marginBottom: spacing.md },
  driverCardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  driverName: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.text },
  selectedBadge: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  driverPhone: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginRight: spacing.sm },
  ratingValue: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  footer: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionDoneBadge: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
    backgroundColor: colors.successGlow,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionDoneText: { color: colors.success, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
});

export default DispatcherAssignScreen;
