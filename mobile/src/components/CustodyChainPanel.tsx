import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { OrderCustodyEvent } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { getMediaUrl } from '../services/api';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { formatTime } from '../utils/formatLocale';

interface CustodyChainPanelProps {
  events?: OrderCustodyEvent[];
  language: string;
}

export const CustodyChainPanel: React.FC<CustodyChainPanelProps> = ({ events, language }) => {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  if (!events?.length) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('features.custody.title')}</Text>
      <Text style={styles.subtitle}>{t('features.custody.subtitle')}</Text>
      {events.map((event, index) => {
        const photoUri = event.photo_url ? getMediaUrl(event.photo_url) || event.photo_url : null;
        const hasGps = event.lat != null && event.lng != null;
        return (
          <View key={event.id} style={styles.row}>
            <View style={styles.timeline}>
              <View style={[styles.dot, index === events.length - 1 && styles.dotActive]} />
              {index < events.length - 1 && <View style={styles.line} />}
            </View>
            <View style={styles.content}>
              <Text style={styles.eventType}>{t(`features.custody.events.${event.event_type}`)}</Text>
              <Text style={styles.meta}>
                {event.actor_name}
                {event.witness_name ? ` · ${event.witness_name}` : ''}
              </Text>
              {hasGps ? (
                <Text style={styles.gps}>
                  GPS: {Number(event.lat).toFixed(5)}, {Number(event.lng).toFixed(5)}
                </Text>
              ) : null}
              {!!event.note && <Text style={styles.note}>{event.note}</Text>}
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}
              <Text style={styles.time}>{formatTime(event.created_at, language)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
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
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    timeline: {
      width: 16,
      alignItems: 'center',
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.textTertiary,
      marginTop: 4,
    },
    dotActive: {
      backgroundColor: colors.primary,
    },
    line: {
      flex: 1,
      width: 2,
      backgroundColor: colors.border,
      marginTop: 2,
      minHeight: 28,
    },
    content: {
      flex: 1,
      paddingBottom: spacing.sm,
    },
    eventType: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.text,
    },
    meta: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.textSecondary,
    },
    gps: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
    note: {
      marginTop: 2,
      fontSize: fontSize.sm,
      color: colors.text,
    },
    photo: {
      marginTop: spacing.xs,
      width: '100%',
      height: 120,
      borderRadius: borderRadius.md,
      backgroundColor: colors.background,
    },
    time: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
  });
