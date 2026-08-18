import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ScreenBackground } from '../components/ScreenBackground';
import { AppHeader } from '../components/AppHeader';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { parseTrackingShareToken } from '../utils/shareTrackingLink';
import { toastService } from '../services/toastService';

const OpenTrackingLinkScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const [linkInput, setLinkInput] = useState('');

  const handleOpen = (rawValue?: string) => {
    const token = parseTrackingShareToken(rawValue ?? linkInput);
    if (!token) {
      toastService.error(t('tracking.publicShare.invalidLink'));
      return;
    }
    (navigation as any).navigate('PublicTrackingShare', { token });
  };

  const handlePaste = async () => {
    const clipboardText = await Clipboard.getString();
    if (!clipboardText?.trim()) {
      toastService.info(t('tracking.publicShare.clipboardEmpty'));
      return;
    }
    setLinkInput(clipboardText.trim());
    const token = parseTrackingShareToken(clipboardText);
    if (token) {
      handleOpen(clipboardText);
    }
  };

  return (
    <ScreenBackground>
      <AppHeader
        variant="hero"
        title={t('tracking.publicShare.openLinkTitle')}
        subtitle={t('tracking.publicShare.openLinkSubtitle')}
        showBack
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Input
            label={t('tracking.publicShare.linkLabel')}
            value={linkInput}
            onChangeText={setLinkInput}
            placeholder={t('tracking.publicShare.linkPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => handleOpen()}
          />
          <TouchableOpacity style={styles.pasteButton} onPress={() => void handlePaste()}>
            <Text style={styles.pasteButtonText}>{t('tracking.publicShare.pasteFromClipboard')}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>{t('tracking.publicShare.linkHint')}</Text>
          <Button
            title={t('tracking.publicShare.openViewer')}
            onPress={() => handleOpen()}
            variant="primary"
            disabled={!linkInput.trim()}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    content: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    hint: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    pasteButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    pasteButtonText: {
      color: colors.primary,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
  });

export default OpenTrackingLinkScreen;
