import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Advertisement } from '../types';
import { Card } from './Card';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles, type AppColors } from '../theme/useThemedStyles';
import { borderRadius, fontSize, fontWeight, spacing } from '../theme';
import { getMediaUrl } from '../services/api';
import { UserReputationBadge } from './UserReputationBadge';
import { LoadFitBadge } from './LoadFitBadge';

type Props = {
  item: Advertisement;
  onPress: () => void;
  priceText: string;
  dateText: string;
  onToggleFavorite?: () => void;
  showFavorite?: boolean;
  showClientMeta?: boolean;
  showLoadFit?: boolean;
};

export const AdvertisementBrowseCard: React.FC<Props> = ({
  item,
  onPress,
  priceText,
  dateText,
  onToggleFavorite,
  showFavorite = false,
  showClientMeta = false,
  showLoadFit = false,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const departureCity =
    typeof item.departure_city === 'object' && item.departure_city ? item.departure_city.name : '...';
  const destinationCity =
    typeof item.destination_city === 'object' && item.destination_city ? item.destination_city.name : '...';
  const photoUri = getMediaUrl(item.photo);

  return (
    <TouchableOpacity activeOpacity={0.76} onPress={onPress}>
      <Card variant="elevated" style={styles.card} padding="md">
        <View style={styles.cardSignal} />
        <View style={styles.headerRow}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <MaterialIcons name="inventory-2" size={24} color={colors.primary} />
            </View>
          )}
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title || t('advertisements.noTitle')}
              </Text>
              {showFavorite ? (
                <TouchableOpacity
                  onPress={onToggleFavorite}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.favoriteButton}>
                  <MaterialIcons
                    name={item.is_favorite ? 'favorite' : 'favorite-border'}
                    size={20}
                    color={item.is_favorite ? colors.favorite : colors.textTertiary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.routeRow}>
              <View style={styles.routePill}>
                <View style={styles.routeDot} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {departureCity}
                </Text>
              </View>
              <MaterialIcons name="east" size={18} color={colors.textTertiary} />
              <View style={styles.routePill}>
                <View style={[styles.routeDot, styles.routeDotDest]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {destinationCity}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <MaterialIcons name="scale" size={14} color={colors.textSecondary} />
                <Text style={styles.metaText}>
                  {item.weight || 0} {t('advertisements.kg')}
                </Text>
              </View>
              {item.is_fragile ? (
                <View style={[styles.metaChip, styles.fragileChip]}>
                  <MaterialIcons name="warning-amber" size={14} color={colors.warning} />
                  <Text style={[styles.metaText, { color: colors.warning }]}>
                    {t('advertisements.fragileShort')}
                  </Text>
                </View>
              ) : null}
            </View>

            {showClientMeta && item.client_user ? (
              <View style={styles.clientRow}>
                <Text style={styles.clientName} numberOfLines={1}>
                  {item.client_user.first_name} {item.client_user.last_name}
                </Text>
                <UserReputationBadge user={item.client_user} compact />
              </View>
            ) : null}

            {showLoadFit ? (
              <View style={styles.loadFitRow}>
                <LoadFitBadge advertisementId={item.id} compact />
              </View>
            ) : null}

            <View style={styles.footerRow}>
              <Text style={styles.date}>{dateText}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price} numberOfLines={1}>
                  {priceText}
                </Text>
                <View style={styles.openButton}>
                  <MaterialIcons name="east" size={16} color={colors.onPrimary} />
                </View>
              </View>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      marginVertical: spacing.xs,
      borderColor: `${colors.primary}2E`,
      position: 'relative',
    },
    cardSignal: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: 3,
      backgroundColor: colors.primary,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    photo: {
      width: 72,
      height: 72,
      borderRadius: borderRadius.md,
      marginRight: spacing.md,
      backgroundColor: colors.borderLight,
    },
    photoPlaceholder: {
      width: 72,
      height: 72,
      borderRadius: borderRadius.md,
      marginRight: spacing.md,
      backgroundColor: colors.primaryGlow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
      minHeight: 72,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      fontSize: fontSize.base,
      fontWeight: fontWeight.bold,
      color: colors.text,
      lineHeight: 21,
    },
    favoriteButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    routePill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
    },
    routeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    routeDotDest: {
      backgroundColor: colors.success,
    },
    routeText: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      fontWeight: fontWeight.semibold,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: borderRadius.round,
      backgroundColor: colors.backgroundTertiary,
    },
    fragileChip: {
      backgroundColor: colors.warningGlow,
    },
    metaText: {
      fontSize: fontSize.xs,
      color: colors.textSecondary,
      fontWeight: fontWeight.semibold,
    },
    clientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    clientName: {
      flex: 1,
      fontSize: fontSize.sm,
      color: colors.text,
      fontWeight: fontWeight.medium,
    },
    loadFitRow: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    date: {
      fontSize: fontSize.xs,
      color: colors.textTertiary,
      fontWeight: fontWeight.medium,
    },
    price: {
      textAlign: 'right',
      fontSize: fontSize.md,
      color: colors.primary,
      fontWeight: fontWeight.bold,
      maxWidth: 130,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    openButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
