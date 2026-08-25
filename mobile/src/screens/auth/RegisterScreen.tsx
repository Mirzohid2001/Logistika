import React, {useState} from 'react';
import {Linking, StyleSheet, Text} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import { useTranslation } from '../../hooks/useTranslation';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AuthLayout, AuthFooter } from '../../components/auth/AuthLayout';
import { AuthRoleSelector } from '../../components/auth/AuthRoleSelector';
import { authService } from '../../services/authService';
import { errorService } from '../../services/errorService';
import { toastService } from '../../services/toastService';
import { spacing } from '../../theme';
import { useAppTheme } from '../../theme/useAppTheme';

const RegisterScreen = () => {
  const [isDriver, setIsDriver] = useState(false);
  const [companyInn, setCompanyInn] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const handleRegister = async () => {
    const inn = companyInn.replace(/\D/g, '');
    if (!isDriver && inn.length !== 9) {
      toastService.error(t('auth.innInvalid'));
      return;
    }

    setLoading(true);
    try {
      const response = await authService.startTelegramAuth({
        mode: 'register',
        is_driver: isDriver,
        company_inn: isDriver ? undefined : inn,
      });
      await Linking.openURL(response.authorization_url);
    } catch (error: any) {
      const appError = errorService.parseError(error);
      const rawCode = error?.response?.data?.code ?? error?.code;
      if (rawCode === 'inn_already_registered' || appError.fieldErrors?.company_inn) {
        toastService.error(t('auth.innAlreadyRegistered'));
      } else {
        errorService.logError(appError, { screen: 'RegisterScreen', provider: 'telegram' });
        toastService.error(errorService.getUserFriendlyMessage(appError));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.register')} subtitle={t('auth.telegramRegisterSubtitle')}>
      <AuthRoleSelector
        isDriver={isDriver}
        onChange={setIsDriver}
        clientLabel={t('profile.client')}
        driverLabel={t('profile.driver')}
      />

      {!isDriver && (
        <Input
          label={t('auth.companyInn')}
          value={companyInn}
          onChangeText={setCompanyInn}
          placeholder="123456789"
          keyboardType="number-pad"
          maxLength={9}
          autoCapitalize="none"
        />
      )}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {t('auth.telegramRegisterHint')}
      </Text>

      <Button
        title={t('auth.telegramRegister')}
        onPress={handleRegister}
        loading={loading}
        variant="primary"
        style={styles.submitButton}
      />

      <AuthFooter
        text={t('auth.alreadyHaveAccount')}
        linkText={t('auth.login')}
        onPress={() => (navigation as any).navigate('Login')}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  hint: { marginTop: spacing.md, textAlign: 'center', lineHeight: 20 },
  submitButton: { marginTop: spacing.lg },
});

export default RegisterScreen;
