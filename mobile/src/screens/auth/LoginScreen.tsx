import React, {useState} from 'react';
import {StyleSheet, TouchableOpacity, Text} from 'react-native';
import {useAuth} from '../../context/AuthContext';
import {useNavigation} from '@react-navigation/native';
import { useTranslation } from '../../hooks/useTranslation';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AuthLayout, AuthFooter } from '../../components/auth/AuthLayout';
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
  const {login} = useAuth();
  const navigation = useNavigation();
  const {t} = useTranslation();
  const { colors } = useAppTheme();

  const handleLogin = async () => {
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
      const errorMessage = errorService.getUserFriendlyMessage(appError);
      errorService.logError(appError, { screen: 'LoginScreen' });
      toastService.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.login')} subtitle={t('auth.loginSubtitle')}>
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
        title={t('auth.login')}
        onPress={handleLogin}
        loading={loading}
        variant="primary"
        style={styles.submitButton}
      />

      <TouchableOpacity
        style={styles.forgotPassword}
        onPress={() => (navigation as any).navigate('ForgotPassword')}>
        <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>
          {t('auth.forgotPassword')}
        </Text>
      </TouchableOpacity>

      <AuthFooter
        text={t('auth.noAccount')}
        linkText={t('auth.register')}
        onPress={() => (navigation as any).navigate('Register')}
      />

      <TouchableOpacity
        style={styles.trackingLink}
        onPress={() => navigateRoot(navigation, 'OpenTrackingLink')}>
        <Text style={[styles.trackingLinkText, { color: colors.primary }]}>
          {t('tracking.publicShare.openLinkTitle')}
        </Text>
      </TouchableOpacity>
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  submitButton: {
    marginTop: spacing.md,
  },
  forgotPassword: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
  },
  trackingLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  trackingLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LoginScreen;
