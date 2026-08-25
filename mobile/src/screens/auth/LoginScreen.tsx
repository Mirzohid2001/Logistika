import React, {useState} from 'react';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {useAuth} from '../../context/AuthContext';
import {useNavigation} from '@react-navigation/native';
import { useTranslation } from '../../hooks/useTranslation';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AuthLayout, AuthFooter } from '../../components/auth/AuthLayout';
import { authService } from '../../services/authService';
import { errorService } from '../../services/errorService';
import { toastService } from '../../services/toastService';
import { spacing } from '../../theme';
import { useAppTheme } from '../../theme/useAppTheme';
import { isValidUzPhone } from '../../utils/phone';
import { navigateRoot } from '../../utils/navigationHelpers';

const LoginScreen = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const {login} = useAuth();
  const navigation = useNavigation();
  const {t} = useTranslation();
  const { colors } = useAppTheme();

  const handleTelegramLogin = async () => {
    setTelegramLoading(true);
    try {
      const response = await authService.startTelegramAuth({ mode: 'login' });
      await Linking.openURL(response.authorization_url);
    } catch (error: any) {
      const appError = errorService.parseError(error);
      errorService.logError(appError, { screen: 'LoginScreen', provider: 'telegram' });
      toastService.error(errorService.getUserFriendlyMessage(appError));
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleLegacyLogin = async () => {
    if (!phone || !password) {
      toastService.error(t('auth.fillAllFields'));
      return;
    }
    if (!isValidUzPhone(phone)) {
      toastService.error(t('auth.invalidPhone'));
      return;
    }

    setLoading(true);
    try {
      await login(phone, password);
    } catch (error: any) {
      const appError = errorService.parseError(error);
      errorService.logError(appError, { screen: 'LoginScreen', provider: 'legacy' });
      toastService.error(errorService.getUserFriendlyMessage(appError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.login')} subtitle={t('auth.telegramLoginSubtitle')}>
      <Button
        title={t('auth.telegramLogin')}
        onPress={handleTelegramLogin}
        loading={telegramLoading}
        disabled={loading}
        variant="primary"
        style={styles.telegramButton}
      />

      <Text style={[styles.telegramHint, { color: colors.textSecondary }]}>
        {t('auth.telegramShareHint')}
      </Text>

      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.legacyTitle, { color: colors.textSecondary }]}>
          {t('auth.legacyLogin')}
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>

      <Input
        label={t('auth.phone')}
        value={phone}
        onChangeText={setPhone}
        placeholder="+998901234567"
        keyboardType="phone-pad"
        autoCapitalize="none"
      />

      <Input
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.password')}
        secureTextEntry
        autoCapitalize="none"
      />

      <Button
        title={t('auth.legacyLoginAction')}
        onPress={handleLegacyLogin}
        loading={loading}
        disabled={telegramLoading}
        variant="outline"
        style={styles.submitButton}
      />

      <AuthFooter
        text={t('auth.noAccount')}
        linkText={t('auth.register')}
        onPress={() => (navigation as any).navigate('Register')}
      />

      <Text
        style={[styles.trackingLinkText, { color: colors.primary }]}
        onPress={() => navigateRoot(navigation, 'OpenTrackingLink')}>
        {t('tracking.publicShare.openLinkTitle')}
      </Text>
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  telegramButton: { marginTop: spacing.xs },
  telegramHint: { marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xl },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  legacyTitle: { marginHorizontal: spacing.sm, fontSize: 12, textAlign: 'center' },
  submitButton: { marginTop: spacing.md },
  trackingLinkText: {
    marginTop: spacing.lg,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default LoginScreen;
