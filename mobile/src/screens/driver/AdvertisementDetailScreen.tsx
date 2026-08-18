import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { advertisementsService } from '../../services/advertisementsService';
import { bidsService } from '../../services/bidsService';
import { Advertisement, Bid } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { getMediaUrl } from '../../services/api';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles, type AppColors } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { UserReputationBadge } from '../../components/UserReputationBadge';
import { TrustScoreCard } from '../../components/TrustScoreCard';
import { PriceInsightCard } from '../../components/PriceInsightCard';
import { TripProfitCard } from '../../components/TripProfitCard';
import { LoadFitBadge } from '../../components/LoadFitBadge';
import { DriverVerificationBanner } from '../../components/DriverVerificationBanner';
import { navigateMainTab, navigateRoleStack, navigateRoot } from '../../utils/navigationHelpers';
import { getApiErrorMessage } from '../../services/errorService';
import { promptDocumentExpiredError, promptMarketplaceGateError } from '../../utils/marketplaceGate';
import { enqueueOfflineAction, isOfflineError } from '../../services/offlineActionQueue';
import { toastService } from '../../services/toastService';

const AdvertisementDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = route.params as { id: number };

  const [advertisement, setAdvertisement] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [proposedAmount, setProposedAmount] = useState('');
  const [activeBid, setActiveBid] = useState<Bid | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  const getCityId = (city: Advertisement['departure_city'] | Advertisement['destination_city']) =>
    city && typeof city === 'object' && 'id' in city ? city.id : null;

  useEffect(() => {
    loadAdvertisement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadAdvertisement = async () => {
    try {
      setLoading(true);
      const data = await advertisementsService.getAdvertisement(id);
      setAdvertisement(data);
      if (data.proposed_cost) {
        setProposedAmount(data.proposed_cost.toString());
      }
      checkFavorite();
      try {
        const myBids = await bidsService.getMyBids();
        const bid = myBids.find((item) => {
          const advertisementRef = item.advertisement as any;
          const adId =
            typeof advertisementRef === 'object' && advertisementRef
              ? advertisementRef.id
              : advertisementRef;
          return adId === id && !item.is_rejected_by_client && !item.is_rejected_by_driver && !item.is_accepted_by_client;
        });
        setActiveBid(bid || null);
      } catch {
        setActiveBid(null);
      }
    } catch (error) {
      console.error('Error loading advertisement:', error);
      setAdvertisement(null);
    } finally {
      setLoading(false);
    }
  };

  const checkFavorite = async () => {
    try {
      const favorites = await advertisementsService.getFavorites();
      const favorite = favorites.find((f) => f.advertisement.id === id);
      setIsFavorite(!!favorite);
    } catch (error) {
      console.error('Error checking favorite:', error);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      setFavoriteLoading(true);
      if (isFavorite) {
        const favorites = await advertisementsService.getFavorites();
        const favorite = favorites.find((f) => f.advertisement.id === id);
        if (favorite) {
          await advertisementsService.removeFromFavorites(favorite.id);
        }
        setIsFavorite(false);
      } else {
        try {
          await advertisementsService.addToFavorites(id);
          setIsFavorite(true);
        } catch (error: any) {
          if (error.response?.status === 400 && error.response?.data?.error === 'Already in favorites') {
            setIsFavorite(true);
            return;
          }
          throw error;
        }
      }
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      Alert.alert(t('common.error'), error.response?.data?.error || t('advertisements.favoriteError'));
    } finally {
      setFavoriteLoading(false);
    }
  };

  const checkVerification = (): boolean => {
    if (!user?.is_verified) {
      Alert.alert(
        t('advertisements.verificationRequiredTitle'),
        t('advertisements.verificationRequiredMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('advertisements.goToProfile'),
            onPress: () => navigateMainTab(navigation as any, 'Profile'),
          },
        ]
      );
      return false;
    }
    if (user?.has_expired_documents) {
      Alert.alert(
        t('driverVerification.documentsExpiredTitle'),
        t('driverVerification.documentsExpiredMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.openDocuments'),
            onPress: () => navigateRoot(navigation as any, 'DriverDocuments'),
          },
        ]
      );
      return false;
    }
    return true;
  };

  const handleCreateBid = async () => {
    if (submitting) {
      return;
    }
    if (!proposedAmount || parseFloat(proposedAmount) <= 0) {
      Alert.alert(t('common.error'), t('advertisements.enterPrice'));
      return;
    }

    if (!checkVerification()) {
      return;
    }

    const amount = parseFloat(proposedAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('common.error'), t('advertisements.enterPrice'));
      return;
    }

    try {
      setSubmitting(true);
      await bidsService.createBid({
        advertisement: id,
        proposed_amount: amount,
      });
      Alert.alert(t('common.success'), t('advertisements.bidSent'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      if (isOfflineError(error)) {
        await enqueueOfflineAction('create_bid', {
          advertisement: id,
          proposed_amount: amount,
        });
        toastService.info(t('offline.queuedAction'));
        return;
      }
      const errorMessage = error.response?.data?.error || t('advertisements.bidError');
      if (errorMessage?.toLowerCase?.().includes('already have an active bid')) {
        Alert.alert(t('advertisements.activeBidExistsTitle'), t('advertisements.activeBidExistsMessage'), [
          { text: t('common.close'), style: 'cancel' },
          { text: t('advertisements.goToMyBids'), onPress: () => navigateRoleStack(navigation as any, 'DriverStack', 'MyBids') },
        ]);
      } else if (
        promptDocumentExpiredError(error, {
          t,
          navigation: navigation as any,
        })
      ) {
        // handled
      } else if (
        promptMarketplaceGateError(error, {
          t,
          navigation: navigation as any,
        })
      ) {
        // handled
      } else if (error.response?.status === 403 || error.response?.status === 400) {
        Alert.alert(t('advertisements.verificationRequiredTitle'), errorMessage, [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('advertisements.goToProfile'),
            onPress: () => navigateMainTab(navigation as any, 'Profile'),
          },
        ]);
      } else {
        Alert.alert(t('common.error'), errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAgreeToCounter = () => {
    if (!activeBid) {
      return;
    }
    Alert.alert(t('bids.agreeCounterTitle'), t('bids.agreeCounterConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('bids.agreeCounterAction'),
        onPress: async () => {
          try {
            setSubmitting(true);
            await bidsService.agreeToCounter(activeBid.id);
            Alert.alert(t('common.success'), t('bids.agreeCounterSuccess'));
            loadAdvertisement();
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
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleAcceptAdvertisement = async () => {
    if (!checkVerification()) {
      return;
    }

    Alert.alert(
      t('advertisements.acceptTitle'),
      t('advertisements.acceptConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('advertisements.acceptAction'),
          onPress: async () => {
            try {
              setSubmitting(true);
              const response = await advertisementsService.acceptAdvertisement(id);
              const orderId = response?.order?.id || response?.order_id;

              Alert.alert(t('common.success'), t('advertisements.acceptSuccess'), [
                {
                  text: t('advertisements.goToOrder'),
                  onPress: () => {
                    navigation.goBack();
                    if (orderId) {
                      setTimeout(() => {
                        (navigation as any).navigate('OrderDetail', { id: orderId });
                      }, 300);
                    }
                  },
                },
                { text: t('common.ok'), style: 'cancel', onPress: () => navigation.goBack() },
              ]);
            } catch (error: any) {
              const errorMessage = error.response?.data?.error || t('advertisements.acceptError');
              if (
                promptDocumentExpiredError(error, {
                  t,
                  navigation: navigation as any,
                })
              ) {
                // handled
              } else if (
                promptMarketplaceGateError(error, {
                  t,
                  navigation: navigation as any,
                })
              ) {
                // handled
              } else if (error.response?.status === 403 || error.response?.status === 400) {
                Alert.alert(t('advertisements.verificationRequiredTitle'), errorMessage, [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('advertisements.goToProfile'),
                    onPress: () => navigateMainTab(navigation as any, 'Profile'),
                  },
                ]);
              } else {
                Alert.alert(t('common.error'), errorMessage);
              }
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const formatPrice = (price?: number) => {
    if (!price) {return t('advertisements.priceNegotiable');}
    return `${price.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm`;
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('advertisements.advertisementDetail')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (!advertisement) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('advertisements.advertisementDetail')} />
        <EmptyState
          variant="error"
          title={t('advertisements.advertisementNotLoaded')}
          message={t('errors.tryAgain')}
          actionText={t('dispatcherLists.retry')}
          onActionPress={loadAdvertisement}
        />
      </ScreenBackground>
    );
  }

  const departureCity =
    typeof advertisement.departure_city === 'object' && advertisement.departure_city
      ? advertisement.departure_city.name
      : '';
  const destinationCity =
    typeof advertisement.destination_city === 'object' && advertisement.destination_city
      ? advertisement.destination_city.name
      : '';

  const photoUri = getMediaUrl(advertisement.photo);

  if (advertisement.is_closed) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('advertisements.advertisementDetail')} />
        <Card variant="soft" style={styles.closedCard}>
          <Text style={styles.closedText}>{t('advertisements.closedAdvertisement')}</Text>
        </Card>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader variant="hero" title={advertisement.title || t('advertisements.advertisementDetail')} />
      <DriverVerificationBanner />
      {photoUri && (
        <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
      )}

      <Card variant="elevated" style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{advertisement.title}</Text>
          <TouchableOpacity
            onPress={handleToggleFavorite}
            style={styles.favoriteButton}
            disabled={favoriteLoading}>
            <MaterialIcons
              name={isFavorite ? 'favorite' : 'favorite-border'}
              size={22}
              color={isFavorite ? colors.favorite : colors.textTertiary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.metaChips}>
          <View style={styles.metaChip}>
            <MaterialIcons name="payments" size={14} color={colors.primary} />
            <Text style={[styles.metaChipText, styles.metaChipTextPrimary]}>
              {formatPrice(advertisement.proposed_cost)}
            </Text>
          </View>
          <View style={styles.metaChip}>
            <MaterialIcons name="scale" size={14} color={colors.textSecondary} />
            <Text style={styles.metaChipText}>
              {advertisement.weight} {t('advertisements.kg')}
            </Text>
          </View>
        </View>

        {advertisement.description && (
          <Text style={styles.description}>{advertisement.description}</Text>
        )}

        {advertisement.client_user && (
          <View style={styles.clientReputation}>
            <Text style={styles.clientReputationLabel}>{t('advertisements.clientReputation')}</Text>
            <Text style={styles.clientName}>
              {advertisement.client_user.first_name} {advertisement.client_user.last_name}
            </Text>
            <UserReputationBadge user={advertisement.client_user} />
            <TrustScoreCard user={advertisement.client_user} compact />
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('orders.cargoInfo')}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('orders.weight')}:</Text>
            <Text style={styles.infoValue}>{advertisement.weight} {t('advertisements.kg')}</Text>
          </View>
          {advertisement.volume_m3 != null && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('orders.volume')}:</Text>
              <Text style={styles.infoValue}>{advertisement.volume_m3} m³</Text>
            </View>
          )}
          {advertisement.units_count != null && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('advertisementsCreate.fields.unitsCount')}:</Text>
              <Text style={styles.infoValue}>{advertisement.units_count}</Text>
            </View>
          )}
          {advertisement.is_fragile && (
            <View style={styles.fragileBadge}>
              <MaterialIcons name="warning-amber" size={16} color={colors.warning} />
              <Text style={styles.fragileText}>{t('advertisements.fragileCargo')}</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('advertisements.route')}</Text>
          <View style={styles.routeContainer}>
            <View style={styles.routePoint}>
              <View style={styles.routeDot} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeCity}>{departureCity}</Text>
                <Text style={styles.routeAddress}>{advertisement.departure_address}</Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, styles.routeDotDestination]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeCity}>{destinationCity}</Text>
                <Text style={styles.routeAddress}>{advertisement.destination_address}</Text>
              </View>
            </View>
          </View>
          {Array.isArray(advertisement.route_stops) && advertisement.route_stops.length > 2 && (
            <View style={styles.stopsList}>
              <Text style={styles.stopsTitle}>{t('orders.routeStopsTitle')}</Text>
              {[...advertisement.route_stops]
                .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
                .map((stop, index) => (
                  <Text key={`${stop.sequence || index}-${stop.address || index}`} style={styles.stopItem}>
                    {index + 1}. {stop.label || stop.address || `#${index + 1}`}
                    {stop.address && stop.label ? ` — ${stop.address}` : ''}
                  </Text>
                ))}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('advertisements.proposedPriceTitle')}</Text>
          <Text style={styles.price}>{formatPrice(advertisement.proposed_cost)}</Text>
        </View>
      </Card>

      <Card variant="soft" style={styles.bidCard}>
        <LoadFitBadge advertisementId={advertisement.id} />
        <PriceInsightCard
          fromCityId={getCityId(advertisement.departure_city)}
          toCityId={getCityId(advertisement.destination_city)}
          weight={String(advertisement.weight)}
        />
        <TripProfitCard advertisementId={advertisement.id} amount={proposedAmount} />
        {activeBid &&
          (activeBid.can_agree_to_counter_by_driver ||
            (activeBid.last_counter_by === 'client' && !activeBid.is_driver_agreed_to_amount)) && (
          <Button
            title={t('bids.agreeCounterAction')}
            onPress={handleAgreeToCounter}
            loading={submitting}
            variant="secondary"
            style={styles.agreeButton}
          />
        )}
        <Text style={styles.bidTitle}>{t('advertisements.enterYourBid')}</Text>
        <TextInput
          style={styles.input}
          value={proposedAmount}
          onChangeText={setProposedAmount}
          placeholder={t('advertisements.pricePlaceholder')}
          keyboardType="numeric"
          placeholderTextColor={colors.textTertiary}
        />
        <Button
          title={t('advertisements.submitBid')}
          onPress={handleCreateBid}
          loading={submitting}
          variant="primary"
          style={styles.bidButton}
        />
        <Button
          title={t('advertisements.acceptTitle')}
          onPress={handleAcceptAdvertisement}
          loading={submitting}
          variant="outline"
          style={styles.acceptButton}
        />
      </Card>
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  photo: {
    width: '100%',
    height: 250,
    backgroundColor: colors.border,
  },
  card: {
    margin: 16,
    marginTop: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginRight: 12,
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    backgroundColor: colors.backgroundTertiary,
  },
  metaChipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  metaChipTextPrimary: {
    color: colors.primary,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: spacing.md,
    marginBottom: 16,
  },
  clientReputation: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  clientReputationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fragileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningGlow,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  fragileText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  routeContainer: {
    marginTop: 8,
  },
  routePoint: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginRight: 12,
    marginTop: 4,
  },
  routeDotDestination: {
    backgroundColor: colors.success,
  },
  routeInfo: {
    flex: 1,
  },
  routeCity: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  routeAddress: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  stopsList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stopsTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  stopItem: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginBottom: 8,
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  bidCard: {
    margin: 16,
    marginTop: 0,
  },
  bidTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  bidButton: {
    marginBottom: 12,
  },
  agreeButton: {
    marginBottom: 12,
  },
  acceptButton: {
    marginBottom: 0,
  },
  closedCard: {
    margin: 16,
  },
  closedText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default AdvertisementDetailScreen;
