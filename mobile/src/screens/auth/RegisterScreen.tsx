import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import {useAuth} from '../../context/AuthContext';
import {useNavigation} from '@react-navigation/native';
import { useTranslation } from '../../hooks/useTranslation';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AuthLayout, AuthFooter } from '../../components/auth/AuthLayout';
import { AuthRoleSelector } from '../../components/auth/AuthRoleSelector';
import { errorService } from '../../services/errorService';
import { toastService } from '../../services/toastService';
import { spacing } from '../../theme';
import { isValidUzPhone } from '../../utils/phone';

const RegisterScreen = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isDriver, setIsDriver] = useState(false);
  const [companyInn, setCompanyInn] = useState('');
  const [loading, setLoading] = useState(false);
  const {register} = useAuth();
  const navigation = useNavigation();
  const { t } = useTranslation();

  const handleRegister = async () => {
    if (!phone || !password || !passwordConfirm || !firstName || !lastName) {
      toastService.error(t('auth.fillAllFields'));
      return;
    }

    if (password.length < 8) {
      toastService.error(t('auth.passwordMinLength'));
      return;
    }

    if (password !== passwordConfirm) {
      toastService.error(t('auth.passwordsMismatch'));
      return;
    }

    if (!isDriver && !companyInn.trim()) {
      toastService.error(t('auth.companyInnRequired'));
      return;
    }

    if (!isValidUzPhone(phone)) {
      toastService.error(t('auth.invalidPhone'));
      return;
    }

    setLoading(true);
    try {
      await register({
        phone,
        password,
        password_confirm: passwordConfirm,
        first_name: firstName,
        last_name: lastName,
        is_driver: isDriver,
        company_inn: !isDriver ? companyInn.trim() : undefined,
      });
    } catch (error: any) {
      const rawCode = error?.response?.data?.code ?? error?.code;
      const appError = errorService.parseError(error);
      let errorMessage = errorService.getUserFriendlyMessage(appError);

      if (rawCode === 'phone_already_registered') {
        toastService.error(t('auth.phoneAlreadyRegistered'));
        return;
      }

      if (appError.fieldErrors) {
        const fieldNames: Record<string, string> = {
          phone: t('auth.phone'),
          password: t('auth.password'),
          password_confirm: t('auth.passwordConfirm'),
          first_name: t('profile.firstName'),
          last_name: t('profile.lastName'),
          company_inn: t('auth.companyInn'),
        };

        const firstFieldError = Object.keys(appError.fieldErrors)[0];
        if (firstFieldError && appError.fieldErrors[firstFieldError]) {
          const fieldLabel = fieldNames[firstFieldError] || firstFieldError;
          const fieldError = appError.fieldErrors[firstFieldError][0];
          errorMessage = `${fieldLabel}: ${fieldError}`;
        }
      }

      if (appError.code === 'phone_already_registered' || appError.fieldErrors?.phone) {
        const phoneErr = appError.fieldErrors?.phone?.[0] || '';
        if (phoneErr.includes('mavjud') || rawCode === 'phone_already_registered') {
          toastService.error(t('auth.phoneAlreadyRegistered'));
          return;
        }
      }

      errorService.logError(appError, { screen: 'RegisterScreen' });
      toastService.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.register')} subtitle={t('auth.createAccount')}>
      <Input
        label={t('profile.firstName')}
        value={firstName}
        onChangeText={setFirstName}
        placeholder={t('auth.enterFirstName')}
      />

      <Input
        label={t('profile.lastName')}
        value={lastName}
        onChangeText={setLastName}
        placeholder={t('auth.enterLastName')}
      />

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
        placeholder={t('auth.passwordMinPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
      />

      <Input
        label={t('auth.passwordConfirm')}
        value={passwordConfirm}
        onChangeText={setPasswordConfirm}
        placeholder={t('auth.enterPasswordAgain')}
        secureTextEntry
        autoCapitalize="none"
      />

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

      <Button
        title={t('auth.register')}
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
  submitButton: {
    marginTop: spacing.sm,
  },
});

export default RegisterScreen;
