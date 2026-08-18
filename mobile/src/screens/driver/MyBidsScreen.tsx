import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { bidsService } from '../../services/bidsService';
import { useTranslation } from '../../hooks/useTranslation';
import { Bid } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles, type AppColors } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { getBidStatusStyle } from '../../utils/statusColors';
import { getApiErrorMessage } from '../../services/errorService';
import { promptDocumentExpiredError } from '../../utils/marketplaceGate';

const MyBidsScreen = () => {
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [counterAmounts, setCounterAmounts] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBids = useCallback(async () => {
    try {
      setLoadError(null);
      if (!bids.length) {setLoading(true);}
      const data = await bidsService.getMyBids();
      setBids(data);
    } catch (error) {
      console.error('Error loading bids:', error);
      setLoadError(t('bids.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, bids.length]);

  useFocusEffect(
    useCallback(() => {
      loadBids();
    }, [loadBids])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadBids();
  };

  const handleAgreeToCounter = (bidId: number) => {
    Alert.alert(t('bids.agreeCounterTitle'), t('bids.agreeCounterConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('bids.agreeCounterAction'),
        onPress: async () => {
          try {
            setActionLoading(bidId);
            await bidsService.agreeToCounter(bidId);
            Alert.alert(t('common.success'), t('bids.agreeCounterSuccess'));
            loadBids();
          } catch (error: unknown) {
            if (
              promptDocumentExpiredError(error, {
                t,
                navigation: navigation as any,
              })
            ) {
              return;
            }
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
      if (
        promptDocumentExpiredError(error, {
          t,
          navigation: navigation as any,
        })
      ) {
        return;
      }
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
    const status = getBidStatusStyle(item, colors);
    const statusLabel = t(`bids.status.${status.key}`);
    const canAgree =
      item.can_agree_to_counter_by_driver ||
      (item.last_counter_by === 'client' && !item.is_driver_agreed_to_amount);
    const canCounter = !!item.can_counter_by_driver;
    const isActionLoading = actionLoading === item.id;
    const advertisement =
      typeof item.advertisement === 'object'
        ? (item.advertisement as any)
        : null;

    const departureCity =
      advertisement &&
      typeof advertisement.departure_city === 'object' &&
      advertisement.departure_city
        ? advertisement.departure_city.name
        : '';
    const destinationCity =
      advertisement &&
      typeof advertisement.destination_city === 'object' &&
      advertisement.destination_city
        ? advertisement.destination_city.name
        : '';

    return (
      <AnimatedListItem index={index}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            const adId = advertisement?.id ?? (item.advertisement as number);
            (navigation as any).navigate('AdvertisementDetail', { id: adId });
          }}>
          <Card variant="soft" style={styles.bidCard}>
            <View style={styles.bidHeader}>
              <View style={styles.bidIdContainer}>
                <Text style={styles.bidIdLabel}>{t('bids.title')}</Text>
                <Text style={styles.bidId}>#{item.id}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.color }]}>{statusLabel}</Text>
              </View>
            </View>

            {advertisement && (
              <>
                <Text style={styles.adTitle} numberOfLines={2}>
                  {advertisement.title}
                </Text>
                {(departureCity || destinationCity) && (
                  <View style={styles.route}>
                    <View style={styles.routePoint}>
                      <View style={[styles.routeDot, { backgroundColor: colors.logisticsAccent }]} />
                      <Text style={styles.routeCity}>{departureCity || '...'}</Text>
                    </View>
                    <MaterialIcons name="east" size={18} color={colors.textTertiary} />
                    <View style={styles.routePoint}>
                      <View style={[styles.routeDot, styles.routeDotDest]} />
                      <Text style={styles.routeCity}>{destinationCity || '...'}</Text>
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={styles.bidAmountContainer}>
              <Text style={styles.bidAmountLabel}>{t('bids.proposedPrice')}</Text>
              <Text style={styles.bidAmount}>{formatPrice(item.current_amount)}</Text>
            </View>

            {canAgree && (
              <Button
                title={t('bids.agreeCounterAction')}
                onPress={() => handleAgreeToCounter(item.id)}
                loading={isActionLoading}
                style={styles.agreeButton}
              />
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
                  loading={isActionLoading}
                  variant="outline"
                />
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.bidDate}>{formatDate(item.created_at)}</Text>
              <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
            </View>
          </Card>
        </TouchableOpacity>
      </AnimatedListItem>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('bids.myBids')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (loadError && bids.length === 0) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('bids.myBids')} />
        <EmptyState
          title={t('common.error')}
          message={loadError}
          actionText={t('dashboard.retry')}
          onActionPress={loadBids}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('bids.myBids')} />
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
            message={t('bids.noBidsMessage')}
          />
        }
      />
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  listContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 24,
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
  },
  bidCard: {
    marginBottom: 0,
  },
  bidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bidIdContainer: {
    flex: 1,
  },
  bidIdLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bidId: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.text,
    letterSpacing: -0.2,
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
  adTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeDotDest: {
    backgroundColor: colors.success,
  },
  routeCity: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  routeArrowText: {
    fontSize: fontSize.lg,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  bidAmountContainer: {
    padding: spacing.md,
    backgroundColor: colors.primaryGlow,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  bidAmountLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bidAmount: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
    letterSpacing: -0.3,
  },
  agreeButton: {
    marginBottom: spacing.md,
  },
  counterSection: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  counterLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  counterInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  bidDate: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  chevron: {
    fontSize: fontSize.xl,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
});

export default MyBidsScreen;
