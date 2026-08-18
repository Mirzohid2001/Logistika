import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { advertisementsService } from '../../services/advertisementsService';
import { Advertisement } from '../../types';
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
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';

const AdvertisementDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const { id } = route.params as { id: number };

  const [advertisement, setAdvertisement] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadAdvertisement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadAdvertisement = async () => {
    try {
      setLoading(true);
      const data = await advertisementsService.getAdvertisement(id);
      setAdvertisement(data);
    } catch (error) {
      console.error('Error loading advertisement:', error);
      setAdvertisement(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('advertisements.deleteTitle'),
      t('advertisements.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              await advertisementsService.deleteAdvertisement(id);
              Alert.alert(t('common.success'), t('advertisements.deletedSuccess'), [
                { text: t('common.ok'), onPress: () => navigation.goBack() },
              ]);
            } catch (error: any) {
              Alert.alert(t('common.error'), error.response?.data?.error || t('advertisements.deleteError'));
            } finally {
              setActionLoading(false);
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  const advertisementClientId =
    typeof advertisement.client === 'object' && advertisement.client
      ? advertisement.client.id
      : advertisement.client;
  const isOwner = user?.id === advertisementClientId;

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader variant="hero" title={advertisement.title || t('advertisements.advertisementDetail')} />
      {photoUri && (
        <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
      )}

      <Card variant="elevated" style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{advertisement.title}</Text>
          {advertisement.is_closed && (
            <View style={styles.closedBadge}>
              <Text style={styles.closedText}>{t('profile.closed')}</Text>
            </View>
          )}
        </View>

        <View style={styles.metaChips}>
          <View style={styles.metaChip}>
            <MaterialIcons name="schedule" size={14} color={colors.textSecondary} />
            <Text style={styles.metaChipText}>{formatDate(advertisement.created_at)}</Text>
          </View>
          <View style={[styles.metaChip, styles.metaChipPrimary]}>
            <MaterialIcons name="payments" size={14} color={colors.primary} />
            <Text style={[styles.metaChipText, styles.metaChipTextPrimary]}>
              {formatPrice(advertisement.proposed_cost)}
            </Text>
          </View>
        </View>

        {advertisement.description && (
          <Text style={styles.description}>{advertisement.description}</Text>
        )}

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('orders.cargoInfo')}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('orders.weight')}:</Text>
            <Text style={styles.infoValue}>{advertisement.weight} {t('advertisements.kg')}</Text>
          </View>
          {(advertisement.volume_m3 != null || advertisement.units_count != null) && (
            <>
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
            </>
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
          <Text style={styles.sectionTitle}>{t('advertisements.price')}</Text>
          <Text style={styles.price}>{formatPrice(advertisement.proposed_cost)}</Text>
        </View>

        <View style={styles.divider} />

        {(advertisement.contact_phone ||
          (typeof advertisement.client === 'object' && advertisement.client?.phone) ||
          advertisement.receiver_phone) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('orders.phone')}</Text>
            {advertisement.contact_phone ? (
              <Text style={styles.phone}>{advertisement.contact_phone}</Text>
            ) : typeof advertisement.client === 'object' && advertisement.client?.phone ? (
              <Text style={styles.phone}>{advertisement.client.phone}</Text>
            ) : null}
            {advertisement.receiver_phone ? (
              <Text style={styles.phoneMeta}>
                {t('advertisementsCreate.fields.receiverPhone')}: {advertisement.receiver_phone}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.date}>{t('advertisements.createdAt')}: {formatDate(advertisement.created_at)}</Text>
      </Card>

      {isOwner && (
        <View style={styles.actions}>
          <Button
            title={t('bids.title')}
            onPress={() => (navigation as any).navigate('Bids', { advertisementId: id })}
            variant="primary"
            style={styles.actionButton}
          />
          {!advertisement.is_closed && (
            <Button
              title={t('advertisements.editAdvertisement')}
              onPress={() =>
                (navigation as any).navigate('CreateAdvertisement', { id, mode: 'edit' })
              }
              variant="outline"
              style={styles.actionButton}
            />
          )}
          <Button
            title={t('common.delete')}
            onPress={handleDelete}
            variant="danger"
            loading={actionLoading}
            style={styles.actionButton}
          />
        </View>
      )}
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
    paddingBottom: spacing.xxxl + 24,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  closedBadge: {
    backgroundColor: colors.dangerGlow,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
  },
  closedText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: spacing.md,
    marginBottom: 16,
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
  metaChipPrimary: {
    backgroundColor: colors.primaryGlow,
  },
  metaChipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  metaChipTextPrimary: {
    color: colors.primary,
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
  phone: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  phoneMeta: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  date: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 0,
  },
});

export default AdvertisementDetailScreen;
