import React, {useState} from 'react';
import {StyleSheet, TouchableOpacity, Text} from 'react-native';
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

const ForgotPasswordScreen = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const handleReset = async () => {
    if (!phone || !password || !passwordConfirm) {
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

    setLoading(true);
    try {
      await authService.resetPassword({
        phone,
        new_password: password,
        new_password_confirm: passwordConfirm,
        sms_code: smsCode.trim() || undefined,
      });
      toastService.success(t('auth.resetPasswordSuccess'));
      (navigation as any).navigate('Login');
    } catch (error: any) {
      toastService.error(errorService.getUserFriendlyMessage(errorService.parseError(error)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.resetPasswordTitle')} subtitle={t('auth.resetPasswordSubtitle')}>
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
      <Input
        label={t('auth.smsCodeOptional')}
        value={smsCode}
        onChangeText={setSmsCode}
        placeholder="123456"
        keyboardType="number-pad"
        autoCapitalize="none"
      />
      <Button
        title={t('auth.resetPasswordAction')}
        onPress={handleReset}
        loading={loading}
        variant="primary"
        style={styles.submitButton}
      />
      <TouchableOpacity onPress={() => (navigation as any).navigate('Login')}>
        <Text style={[styles.backLink, { color: colors.primary }]}>{t('auth.backToLogin')}</Text>
      </TouchableOpacity>
      <AuthFooter
        text={t('auth.noAccount')}
        linkText={t('auth.register')}
        onPress={() => (navigation as any).navigate('Register')}
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  submitButton: {
    marginTop: spacing.sm,
  },
  backLink: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
