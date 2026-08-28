import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Linking, Settings, StyleSheet, Text, View} from 'react-native';
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

const DEMO_PASSWORD = 'demo12345';
const DEMO_ACCOUNTS = {
  client: {labelKey: 'auth.demoClient', phone: '+998901000101'},
  driver: {labelKey: 'auth.demoDriver', phone: '+998901000102'},
  dispatcher: {labelKey: 'auth.demoDispatcher', phone: '+998901000103'},
  updater: {labelKey: 'auth.demoUpdater', phone: '+998901000104'},
  fee_client: {labelKey: 'auth.demoFeeClient', phone: '+998901000105'},
  fee_driver: {labelKey: 'auth.demoFeeDriver', phone: '+998901000106'},
} as const;

type DemoRole = keyof typeof DEMO_ACCOUNTS;

const LoginScreen = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const {login} = useAuth();
  const navigation = useNavigation();
  const {t} = useTranslation();
  const { colors } = useAppTheme();
  const demoLoginInFlight = useRef(false);

  const handleDemoLogin = useCallback(async (role: DemoRole) => {
    if (!__DEV__ || demoLoginInFlight.current) {
      return;
    }

    demoLoginInFlight.current = true;
    setLoading(true);
    try {
      await login(DEMO_ACCOUNTS[role].phone, DEMO_PASSWORD);
    } catch (error: any) {
      const appError = errorService.parseError(error);
      errorService.logError(appError, { screen: 'LoginScreen', provider: 'demo', role });
      toastService.error(errorService.getUserFriendlyMessage(appError));
      demoLoginInFlight.current = false;
    } finally {
      setLoading(false);
    }
  }, [login]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const openDemoAccount = (url: string | null) => {
      const match = url?.match(/^logistika:\/\/dev-login(?:\?|\/).*?(?:role=|\/)([a-z_]+)/i);
      const role = match?.[1] as DemoRole | undefined;
      if (role && DEMO_ACCOUNTS[role]) {
        void handleDemoLogin(role);
      }
    };

    const launchRole = Settings.get('demoAutoLoginRole') as DemoRole | undefined;
    if (launchRole && DEMO_ACCOUNTS[launchRole]) {
      Settings.set({demoAutoLoginRole: ''});
      void handleDemoLogin(launchRole);
    }

    void Linking.getInitialURL().then(openDemoAccount);
    const subscription = Linking.addEventListener('url', event => openDemoAccount(event.url));
    return () => subscription.remove();
  }, [handleDemoLogin]);

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

      {__DEV__ && (
        <View style={[styles.demoPanel, {backgroundColor: colors.surfaceMuted, borderColor: colors.border}]}>
          <Text style={[styles.demoTitle, {color: colors.text}]}>{t('auth.demoLoginTitle')}</Text>
          <Text style={[styles.demoHint, {color: colors.textSecondary}]}>
            {t('auth.demoLoginHint')}
          </Text>
          <View style={styles.demoGrid}>
            {(Object.keys(DEMO_ACCOUNTS) as DemoRole[]).map(role => (
              <View key={role} style={styles.demoCell}>
                <Button
                  title={t(DEMO_ACCOUNTS[role].labelKey)}
                  onPress={() => handleDemoLogin(role)}
                  disabled={loading || telegramLoading}
                  variant={role.includes('fee') ? 'warning' : 'outline'}
                  size="sm"
                />
              </View>
            ))}
          </View>
        </View>
      )}

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
  demoPanel: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  demoTitle: {fontSize: 15, fontWeight: '700', textAlign: 'center'},
  demoHint: {fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: spacing.xs},
  demoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
    marginTop: spacing.md,
  },
  demoCell: {width: '48%'},
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
