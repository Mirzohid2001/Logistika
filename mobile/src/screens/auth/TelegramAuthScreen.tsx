import React, {useEffect, useRef} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {AuthLayout} from '../../components/auth/AuthLayout';
import {useAuth} from '../../context/AuthContext';
import {useTranslation} from '../../hooks/useTranslation';
import {errorService} from '../../services/errorService';
import {toastService} from '../../services/toastService';
import {spacing} from '../../theme';
import {useAppTheme} from '../../theme/useAppTheme';

const TelegramAuthScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {completeTelegramAuth} = useAuth();
  const {t} = useTranslation();
  const {colors} = useAppTheme();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) {return;}
    handled.current = true;

    const ticket = String(route.params?.ticket || '');
    const callbackError = String(route.params?.error || '');

    if (callbackError) {
      const messageKey = callbackError === 'account_not_found'
        ? 'auth.telegramAccountNotFound'
        : callbackError === 'telegram_cancelled'
          ? 'auth.telegramCancelled'
          : callbackError === 'phone_not_shared'
            ? 'auth.telegramPhoneRequired'
            : 'auth.telegramVerificationFailed';
      toastService.error(t(messageKey));
      navigation.replace(callbackError === 'account_not_found' ? 'Register' : 'Login');
      return;
    }

    if (!ticket) {
      toastService.error(t('auth.telegramVerificationFailed'));
      navigation.replace('Login');
      return;
    }

    void completeTelegramAuth(ticket).catch((error: any) => {
      const appError = errorService.parseError(error);
      errorService.logError(appError, {screen: 'TelegramAuthScreen'});
      toastService.error(t('auth.telegramSessionExpired'));
      navigation.replace('Login');
    });
  }, [completeTelegramAuth, navigation, route.params, t]);

  return (
    <AuthLayout title={t('auth.telegramOpening')} subtitle={t('auth.telegramOpeningHint')}>
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.text, {color: colors.textSecondary}]}>
          {t('common.loading')}
        </Text>
      </View>
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  loader: {alignItems: 'center', paddingVertical: spacing.xl},
  text: {marginTop: spacing.md, textAlign: 'center'},
});

export default TelegramAuthScreen;
