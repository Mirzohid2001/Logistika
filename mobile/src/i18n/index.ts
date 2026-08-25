import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import uz from './locales/uz.json';
import ru from './locales/ru.json';
import en from './locales/en.json';

const LANGUAGE_DETECTOR = {
  type: 'languageDetector' as const,
  async: true,
  detect: async (callback: (lng: string) => void) => {
    try {
      const savedLanguage = await AsyncStorage.getItem('user-language');
      if (savedLanguage && (savedLanguage === 'uz' || savedLanguage === 'ru' || savedLanguage === 'en')) {
        callback(savedLanguage);
        return;
      }

      callback('uz');
    } catch (error) {
      callback('uz');
    }
  },
  init: () => {},
  cacheUserLanguage: async (language: string) => {
    try {
      await AsyncStorage.setItem('user-language', language);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  },
};

i18n
  .use(LANGUAGE_DETECTOR)
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources: {
      uz: {
        translation: uz,
      },
      ru: {
        translation: ru,
      },
      en: {
        translation: en,
      },
    },
    fallbackLng: {
      en: ['uz'],
      ru: ['uz'],
      default: ['uz'],
    },
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
