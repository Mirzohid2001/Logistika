import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { advertisementsService } from '../services/advertisementsService';
import { BackhaulMatchesResponse } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { Card } from './Card';
import { formatMoney } from '../utils/formatLocale';

export const BackhaulMatchesCard: React.FC = () => {
  const { t, currentLanguage } = useTranslation();
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(createStyles);
  const [data, setData] = useState<BackhaulMatchesResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await advertisementsService.getBackhaulMatches();
      setData(response);
    } catch {
      setData(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!data?.available || !data.matches?.length) {
    return null;
  }

  return (
    <Card variant="soft" style={styles.card}>
      <Text style={styles.title}>{t('features.backhaul.title')}</Text>
      <Text style={styles.subtitle}>{t('features.backhaul.subtitle')}</Text>
      {data.matches.slice(0, 3).map((match) => (
        <TouchableOpacity
          key={match.advertisement_id}
          style={styles.item}
          onPress={() =>
            navigation.navigate('AdvertisementDetail', { id: match.advertisement_id })
          }>
          <View style={styles.itemHeader}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {match.title}
            </Text>
            <Text style={styles.score}>{match.match_score}%</Text>
          </View>
          <Text style={styles.route}>
            {match.departure_city} → {match.destination_city}
          </Text>
          <Text style={styles.meta}>
            {match.weight} kg
            {match.proposed_cost
              ? ` · ${formatMoney(match.proposed_cost, currentLanguage, t('dashboard.currencySuffix'))}`
              : ''}
          </Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => navigation.navigate('DriverMatches')}>
        <Text style={styles.link}>{t('features.backhaul.viewAll')}</Text>
      </TouchableOpacity>
    </Card>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
    },
    subtitle: {
      marginTop: 4,
      marginBottom: spacing.sm,
      fontSize: fontSize.sm,
      color: colors.textSecondary,
    },
    item: {
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    itemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    itemTitle: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    score: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: colors.success,
      backgroundColor: `${colors.success}18`,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    route: {
      marginTop: 2,
      fontSize: fontSize.sm,
      color: colors.primary,
    },
    meta: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
    link: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primary,
    },
  });
