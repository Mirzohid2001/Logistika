import React, { useCallback, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppHeader } from '../../components/AppHeader';
import { Card } from '../../components/Card';
import { ScreenBackground } from '../../components/ScreenBackground';
import { advertisementsService } from '../../services/advertisementsService';
import { DriverMatch, DriverMatchesResponse } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { formatMoney } from '../../utils/formatLocale';
import { spacing, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

const DriverMatchesScreen = () => {
  const { t, currentLanguage } = useTranslation();
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(createStyles);
  const [data, setData] = useState<DriverMatchesResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await advertisementsService.getDriverMatches());
    } catch {
      setData(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const renderMatch = (match: DriverMatch) => {
    const reasons = (match.reasons || [match.match_reason || 'open_load'])
      .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0)
      .map((reason) => t(`matching.reasons.${reason}`, { defaultValue: reason }));

    return (
      <TouchableOpacity
        key={match.advertisement_id}
        onPress={() => navigation.navigate('AdvertisementDetail', { id: match.advertisement_id })}>
        <Card style={styles.item}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{match.title || t('matching.feed.title')}</Text>
            <Text style={styles.score}>{Number(match.match_score || 0)}%</Text>
          </View>
          <Text style={styles.route}>
            {match.departure_city || '—'} → {match.destination_city || '—'}
          </Text>
          <Text style={styles.meta}>
            {Number(match.weight || 0)} kg
            {match.proposed_cost
              ? ` · ${formatMoney(Number(match.proposed_cost), currentLanguage, t('dashboard.currencySuffix'))}`
              : ''}
          </Text>
          {reasons.length ? <Text style={styles.reasons}>{reasons.join(' · ')}</Text> : null}
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('matching.feed.title')} subtitle={t('matching.feed.subtitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        {(data?.matches || []).length === 0 ? (
          <Text style={styles.empty}>{t('matching.feed.empty')}</Text>
        ) : (
          data?.matches.map(renderMatch)
        )}
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: any) => ({
  content: { padding: spacing.lg, gap: spacing.sm },
  item: { marginBottom: spacing.sm },
  header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  score: { color: colors.success, fontWeight: fontWeight.bold },
  route: { marginTop: 4, color: colors.primary },
  meta: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.sm },
  reasons: { marginTop: 4, color: colors.textSecondary, fontSize: fontSize.xs },
  empty: { color: colors.textSecondary },
});

export default DriverMatchesScreen;
