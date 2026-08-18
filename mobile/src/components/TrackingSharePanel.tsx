import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Share } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import { Button } from './Button';
import { Card } from './Card';
import { ordersService } from '../services/ordersService';
import { useTranslation } from '../hooks/useTranslation';
import { buildTrackingShareMessage, parseTrackingShareToken } from '../utils/shareTrackingLink';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

type TrackingSharePanelProps = {
  orderId: number;
  existingToken?: string | null;
  title?: string;
};

export const TrackingSharePanel: React.FC<TrackingSharePanelProps> = ({
  orderId,
  existingToken,
  title,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [shareLoading, setShareLoading] = useState(false);
  const [shareExpiresInHours, setShareExpiresInHours] = useState<6 | 24 | 72>(24);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);
  const [lastShareToken, setLastShareToken] = useState<string | null>(existingToken || null);

  const createLink = async () => {
    const result = await ordersService.createTrackingShareLink(orderId, shareExpiresInHours);
    setLastShareUrl(result.public_url);
    setLastShareToken(result.token);
    return result;
  };

  const handleShare = async () => {
    try {
      setShareLoading(true);
      const result = await createLink();
      await Share.share({
        message: buildTrackingShareMessage(orderId, result.token, result.public_url, {
          orderTitle: t('orders.title'),
          shareHint: t('tracking.shareEtaMessage'),
          appHint: t('tracking.publicShare.appLinkHint'),
        }),
        url: result.public_url,
      });
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.response?.data?.error || t('tracking.shareLinkCreateError'));
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      setShareLoading(true);
      const result = await createLink();
      Clipboard.setString(
        buildTrackingShareMessage(orderId, result.token, result.public_url, {
          orderTitle: t('orders.title'),
          shareHint: t('tracking.shareEtaMessage'),
          appHint: t('tracking.publicShare.appLinkHint'),
        }),
      );
      Alert.alert(t('common.success'), t('tracking.shareLinkCopied'));
    } catch (error: any) {
      Alert.alert(t('common.error'), error?.response?.data?.error || t('tracking.shareLinkCopyError'));
    } finally {
      setShareLoading(false);
    }
  };

  const openPublicViewer = () => {
    const resolved = parseTrackingShareToken(lastShareToken || existingToken || '');
    if (!resolved) {
      Alert.alert(t('common.error'), t('tracking.publicShare.invalidLink'));
      return;
    }
    (navigation as any).navigate('PublicTrackingShare', { token: resolved });
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title || t('tracking.shareEtaLink')}</Text>
      <Text style={styles.hint}>{t('tracking.shareEtaMessage')}</Text>
      <View style={styles.etaChipRow}>
        {([6, 24, 72] as const).map((hours) => (
          <TouchableOpacity
            key={`eta-${hours}`}
            style={[styles.etaChip, shareExpiresInHours === hours && styles.etaChipActive]}
            onPress={() => setShareExpiresInHours(hours)}>
            <Text style={[styles.etaChipText, shareExpiresInHours === hours && styles.etaChipTextActive]}>
              {hours}h
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Button
        title={t('tracking.shareEtaLink')}
        onPress={handleShare}
        loading={shareLoading}
        variant="outline"
        style={styles.button}
      />
      <Button
        title={t('tracking.copyLink')}
        onPress={handleCopy}
        loading={shareLoading}
        variant="outline"
        style={styles.button}
      />
      <Button
        title={t('tracking.publicShare.openInApp')}
        onPress={openPublicViewer}
        variant="primary"
        style={styles.button}
      />
      {!!lastShareUrl && <Text style={styles.lastLinkText}>{lastShareUrl}</Text>}
    </Card>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      marginTop: spacing.md,
    },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    hint: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      lineHeight: 20,
    },
    etaChipRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: spacing.sm,
    },
    etaChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    etaChipActive: {
      backgroundColor: colors.primaryGlow,
      borderColor: colors.primary,
    },
    etaChipText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: fontWeight.semibold,
    },
    etaChipTextActive: {
      color: colors.primary,
    },
    button: {
      marginTop: spacing.sm,
    },
    lastLinkText: {
      marginTop: spacing.sm,
      fontSize: fontSize.xs,
      color: colors.textTertiary,
    },
  });
