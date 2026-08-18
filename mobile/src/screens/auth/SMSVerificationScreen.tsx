import React, {useState} from 'react';
import {Alert} from 'react-native';
import {authService} from '../../services/authService';
import { useTranslation } from '../../hooks/useTranslation';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { errorService } from '../../services/errorService';

const SMSVerificationScreen = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const { t } = useTranslation();

  const handleSendCode = async () => {
    if (!phone) {
      Alert.alert(t('common.error'), t('auth.phoneRequired'));
      return;
    }

    setLoading(true);
    try {
      await authService.sendSMSCode(phone);
      setCodeSent(true);
      Alert.alert(t('common.success'), t('auth.smsSent'));
    } catch (error: any) {
      const appError = errorService.parseError(error);
      Alert.alert(t('common.error'), errorService.getUserFriendlyMessage(appError) || t('auth.smsSendError'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!phone || !code) {
      Alert.alert(t('common.error'), t('auth.enterPhoneAndCode'));
      return;
    }

    setLoading(true);
    try {
      await authService.verifySMS(phone, code);
      Alert.alert(t('common.success'), t('auth.verifySuccess'));
    } catch (error: any) {
      const appError = errorService.parseError(error);
      Alert.alert(t('common.error'), errorService.getUserFriendlyMessage(appError) || t('auth.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('auth.smsVerification')} subtitle={t('auth.verifySMS')}>
      <Input
        label={t('auth.phone')}
        value={phone}
        onChangeText={setPhone}
        placeholder="+998901234567"
        keyboardType="phone-pad"
        autoCapitalize="none"
        editable={!codeSent}
      />

      {codeSent && (
        <Input
          label={t('auth.smsCode')}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
        />
      )}

      <Button
        title={codeSent ? t('auth.verifySMS') : t('auth.sendSMS')}
        onPress={codeSent ? handleVerify : handleSendCode}
        loading={loading}
        variant="primary"
      />
    </AuthLayout>
  );
};

export default SMSVerificationScreen;
