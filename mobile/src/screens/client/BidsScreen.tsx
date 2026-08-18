import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { bidsService } from '../../services/bidsService';
import { Bid } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { getBidStatusStyle } from '../../utils/statusColors';
import { getApiErrorMessage } from '../../services/errorService';
import { UserReputationBadge } from '../../components/UserReputationBadge';
import { TrustScoreCard } from '../../components/TrustScoreCard';

const BidsScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { advertisementId } = route.params as { advertisementId: number };

  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [counterAmounts, setCounterAmounts] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadBids();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advertisementId]);

  const loadBids = useCallback(async () => {
    try {
      setLoadError(null);
      setLoading(true);
      const data = await bidsService.getAdvertisementBids(advertisementId, { sort: 'trust' });
      setBids(data);
    } catch (error) {
      console.error('Error loading bids:', error);
      setLoadError(t('bids.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advertisementId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBids();
  };

  const handleAccept = async (bid: Bid) => {
    const driver = bid.driver_user;
    const driverName = driver
      ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || driver.phone
      : '';
    const tierKey = driver?.trust_tier || 'bronze';
    const confirmMessage =
      driver?.trust_score != null
        ? t('bids.acceptConfirmWithTrust', {
            name: driverName,
            score: driver.trust_score,
            tier: t(`features.trust.tier.${tierKey}`),
          })
        : t('bids.acceptConfirm');

    Alert.alert(t('bids.acceptTitle'), confirmMessage, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('bids.acceptAction'),
        onPress: async () => {
          try {
            setActionLoading(bid.id);
            const result = await bidsService.acceptPrice(bid.id);
            Alert.alert(t('common.success'), t('bids.acceptSuccess'), [
              {
                text: t('common.ok'),
                onPress: () => {
                  (navigation as any).navigate('ClientOrderDetail', { id: result.order_id });
                },
              },
            ]);
          } catch (error: unknown) {
            Alert.alert(t('common.error'), getApiErrorMessage(error, t('errors.unknownError')));
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleReject = async (bidId: number) => {
    Alert.alert(t('bids.rejectTitle'), t('bids.rejectConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('bids.rejectAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            setActionLoading(bidId);
            await bidsService.reject(bidId);
            loadBids();
          } catch (error: unknown) {
            Alert.alert(t('common.error'), getApiErrorMessage(error, t('errors.unknownError')));
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleCounterOffer = async (bidId: number) => {
    const rawAmount = counterAmounts[bidId]?.trim();
    const amount = rawAmount ? parseFloat(rawAmount.replace(/\s/g, '')) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(t('common.error'), t('bids.counterOfferInvalid'));
      return;
    }

    try {
      setActionLoading(bidId);
      await bidsService.counterOffer(bidId, amount);
      setCounterAmounts((prev) => ({ ...prev, [bidId]: '' }));
      loadBids();
      Alert.alert(t('common.success'), t('bids.counterOfferSent'));
    } catch (error: unknown) {
      Alert.alert(t('common.error'), getApiErrorMessage(error, t('errors.unknownError')));
    } finally {
      setActionLoading(null);
    }
  };

  const formatPrice = (amount?: string) => {
    if (!amount) {return t('bids.noPrice');}
    return `${parseFloat(amount).toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = ({ item, index }: { item: Bid; index: number }) => {
    const isLoading = actionLoading === item.id;
    const statusStyle = getBidStatusStyle(item, colors);
    const waitingDriver =
      item.last_counter_by === 'client' && !item.is_driver_agreed_to_amount;
    const isOpen = !item.is_rejected_by_client && !item.is_accepted_by_client && !item.is_rejected_by_driver;
    const canAccept = isOpen && !waitingDriver;
    const canReject = isOpen;
    const canCounter = isOpen;

    return (
      <AnimatedListItem index={index}>
      <Card variant="soft">
        <View style={styles.bidHeader}>
          <View style={styles.bidInfo}>
            {item.driver_user && (
              <View style={styles.driverRow}>
                <Text style={styles.driverName}>
                  {item.driver_user.first_name} {item.driver_user.last_name}
                </Text>
                <UserReputationBadge user={item.driver_user} />
              </View>
            )}
            {item.driver_user ? <TrustScoreCard user={item.driver_user} compact /> : null}
            <Text style={styles.bidAmount}>{formatPrice(item.current_amount)}</Text>
            <Text style={styles.bidDate}>{formatDate(item.created_at)}</Text>
          </View>
          {(item.is_accepted_by_client || item.is_rejected_by_client) && (
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.color }]}>
                {t(`bids.status.${statusStyle.key}`)}
              </Text>
            </View>
          )}
        </View>

        {waitingDriver && (
          <Text style={styles.waitingHint}>{t('bids.waitingDriverResponse')}</Text>
        )}

        {item.proposed_amounts && item.proposed_amounts.length > 0 && (
          <View style={styles.history}>
            <Text style={styles.historyTitle}>{t('bids.historyTitle')}</Text>
            {item.proposed_amounts.map((proposal, index) => (
              <View key={index} style={styles.historyItem}>
                <Text style={styles.historyAmount}>
                  {formatPrice(proposal.amount)} ({proposal.by === 'driver' ? t('orders.driver') : t('orders.client')})
                </Text>
              </View>
            ))}
          </View>
        )}

        {canCounter && (
          <View style={styles.counterSection}>
            <Text style={styles.counterLabel}>{t('bids.counterOffer')}</Text>
            <TextInput
              style={styles.counterInput}
              placeholder={t('bids.counterOfferPlaceholder')}
              keyboardType="numeric"
              value={counterAmounts[item.id] || ''}
              onChangeText={(text) => setCounterAmounts((prev) => ({ ...prev, [item.id]: text }))}
            />
            <Button
              title={t('bids.counterOfferAction')}
              onPress={() => handleCounterOffer(item.id)}
              loading={isLoading}
              variant="secondary"
              style={styles.counterButton}
            />
          </View>
        )}

        {(canAccept || canReject) && (
          <View style={styles.actions}>
            {canAccept && (
              <Button
                title={t('bids.acceptAction')}
                onPress={() => handleAccept(item)}
                loading={isLoading}
                variant="primary"
                style={styles.actionButton}
              />
            )}
            {canReject && (
              <Button
                title={t('bids.rejectAction')}
                onPress={() => handleReject(item.id)}
                loading={isLoading}
                variant="outline"
                style={styles.actionButton}
              />
            )}
          </View>
        )}
      </Card>
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('bids.title')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (loadError && bids.length === 0) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('bids.title')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('common.retry')}
          onActionPress={() => {
            void loadBids();
          }}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('bids.title')} />
      <FlatList
        data={bids}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={
          bids.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title={t('bids.noBids')}
            message={t('bids.noBidsForAd')}
          />
        }
      />
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  listContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 24,
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
  },
  bidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bidInfo: {
    flex: 1,
  },
  driverRow: {
    marginBottom: spacing.xs,
  },
  driverName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  bidAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  bidDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  waitingHint: {
    fontSize: fontSize.sm,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  history: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  historyItem: {
    marginBottom: 4,
  },
  historyAmount: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  counterSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  counterLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  counterInput: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  counterButton: {
    marginBottom: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    marginBottom: 0,
  },
});

export default BidsScreen;
