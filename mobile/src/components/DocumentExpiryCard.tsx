import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { authService } from '../services/authService';
import { DriverDocument } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { Card } from './Card';
import { navigateRoot } from '../utils/navigationHelpers';
import { spacing, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

const SOON_DAYS = 30;

function daysUntil(dateIso: string): number {
  const expires = new Date(dateIso).getTime();
  if (!Number.isFinite(expires)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24));
}

export const DocumentExpiryCard: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [docs, setDocs] = useState<DriverDocument[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await authService.getDriverDocuments();
      setDocs(Array.isArray(data) ? data : []);
    } catch {
      setDocs([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const alerts = docs
    .filter((doc) => doc.is_active)
    .map((doc) => ({ doc, daysLeft: daysUntil(doc.expires_at) }))
    .filter((item) => item.daysLeft <= SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!alerts.length) {
    return null;
  }

  const expiredCount = alerts.filter((item) => item.daysLeft < 0).length;
  const soonCount = alerts.length - expiredCount;
  const top = alerts.slice(0, 3);
  const tone = expiredCount > 0 ? 'danger' : 'warning';
  const palette =
    tone === 'danger'
      ? { bg: `${colors.error}12`, border: colors.error, title: colors.error }
      : { bg: `${colors.warning}14`, border: colors.warning, title: colors.warning };

  return (
    <Card
      variant="soft"
      style={{
        ...styles.card,
        backgroundColor: palette.bg,
        borderColor: palette.border,
      }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => navigateRoot(navigation as any, 'DriverDocuments')}>
        <View style={styles.header}>
          <MaterialIcons
            name={expiredCount > 0 ? 'error-outline' : 'event-busy'}
            size={20}
            color={palette.title}
          />
          <Text style={[styles.title, { color: palette.title }]}>
            {t('profile.documentExpiryTitle')}
          </Text>
        </View>
        <Text style={styles.summary}>
          {expiredCount > 0
            ? t('profile.documentExpiredBlocked')
            : t('profile.documentExpirySummary', {
                expired: expiredCount,
                soon: soonCount,
              })}
        </Text>
        {top.map(({ doc, daysLeft }) => (
          <Text key={doc.id} style={styles.item} numberOfLines={1}>
            {doc.document_type_name || doc.document_type}
            {doc.document_number ? ` · ${doc.document_number}` : ''}
            {' — '}
            {daysLeft < 0
              ? t('profile.documentExpiredAgo', { days: Math.abs(daysLeft) })
              : t('profile.documentExpiresIn', { days: daysLeft })}
          </Text>
        ))}
        <Text style={styles.action}>{t('profile.openDocuments')} ›</Text>
      </TouchableOpacity>
    </Card>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      marginBottom: spacing.md,
      borderWidth: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    title: {
      flex: 1,
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
    },
    summary: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    item: {
      fontSize: fontSize.sm,
      color: colors.text,
      marginBottom: 4,
    },
    action: {
      marginTop: spacing.sm,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primary,
    },
  });
