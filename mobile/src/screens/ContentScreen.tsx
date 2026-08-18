import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { contentService } from '../services/contentService';
import { ErrorCode } from '../services/errorService';
import { StaticContent } from '../types';
import { Card } from '../components/Card';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ScreenBackground } from '../components/ScreenBackground';
import { AppHeader } from '../components/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
const ContentScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const { t, currentLanguage } = useTranslation();
  const { type } = route.params as { type: 'public-offer' | 'disclaimer' | 'guide-clients' | 'guide-drivers' };

  const [content, setContent] = useState<StaticContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<'uz' | 'ru' | 'en'>(
    (currentLanguage as 'uz' | 'ru' | 'en') || 'uz'
  );

  useEffect(() => {
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const loadContent = async () => {
    try {
      setLoading(true);
      setError(null);
      let data: StaticContent;

      switch (type) {
        case 'public-offer':
          data = await contentService.getPublicOffer();
          break;
        case 'disclaimer':
          data = await contentService.getDisclaimer();
          break;
        case 'guide-clients':
          data = await contentService.getGuideClients();
          break;
        case 'guide-drivers':
          data = await contentService.getGuideDrivers();
          break;
        default:
          return;
      }

      setContent(data);
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined;

      if (statusCode === 404 || code === ErrorCode.NOT_FOUND) {
        setError(t('content.notAvailable'));
      } else {
        setError(t('content.loadError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'public-offer':
        return t('content.publicOffer');
      case 'disclaimer':
        return t('content.disclaimer');
      case 'guide-clients':
        return t('content.guideClients');
      case 'guide-drivers':
        return t('content.guideDrivers');
      default:
        return t('content.defaultTitle');
    }
  };

  const getContentText = () => {
    if (!content) {return '';}

    switch (language) {
      case 'uz':
        return content.content_uz;
      case 'ru':
        return content.content_ru;
      case 'en':
        return content.content_en;
      default:
        return content.content_uz;
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (error || !content) {
    return (
      <ScreenBackground>
        <AppHeader title={getTitle()} showBack />
        <EmptyState
          title={error || t('content.notFound')}
          message={t('content.loadError')}
          variant="error"
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader title={getTitle()} showBack />
      <View style={styles.container}>
        <View style={styles.languageSelector}>
          <TouchableOpacity
            style={[styles.languageButton, language === 'uz' && styles.languageButtonActive]}
            onPress={() => setLanguage('uz')}>
            <Text style={[styles.languageText, language === 'uz' && styles.languageTextActive]}>
              {t('profile.uzbek')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.languageButton, language === 'ru' && styles.languageButtonActive]}
            onPress={() => setLanguage('ru')}>
            <Text style={[styles.languageText, language === 'ru' && styles.languageTextActive]}>
              {t('profile.russian')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.languageButton, language === 'en' && styles.languageButtonActive]}
            onPress={() => setLanguage('en')}>
            <Text style={[styles.languageText, language === 'en' && styles.languageTextActive]}>
              {t('profile.english')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <Text style={styles.title}>{getTitle()}</Text>
            <Text style={styles.text}>{getContentText()}</Text>
          </Card>
        </ScrollView>
      </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  languageSelector: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  languageButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  languageButtonActive: {
    backgroundColor: colors.primary,
  },
  languageText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  languageTextActive: {
    color: colors.textLight,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default ContentScreen;
