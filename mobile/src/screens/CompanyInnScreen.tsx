import React, { useState } from 'react';
import { Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { authService } from '../services/authService';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { AppHeader } from '../components/AppHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { spacing, fontSize } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { getApiErrorMessage } from '../services/errorService';
import { navigateRoot } from '../utils/navigationHelpers';
import { useNavigation } from '@react-navigation/native';

const CompanyInnScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { t } = useTranslation();
  const [inn, setInn] = useState(user?.company_inn || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const trimmed = inn.replace(/\D/g, '');
    if (trimmed.length !== 9) {
      Alert.alert(t('common.error'), t('auth.innInvalid'));
      return;
    }

    try {
      setLoading(true);
      const updated = await authService.updateProfile({ company_inn: trimmed } as any);
      updateUser(updated);
      Alert.alert(t('common.success'), t('auth.innSaved'), [
        {
          text: t('common.ok'),
          onPress: () => navigateRoot(navigation, 'Main'),
        },
      ]);
    } catch (error: unknown) {
      Alert.alert(t('common.error'), getApiErrorMessage(error, t('profile.updateError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader title={t('auth.companyInnRequiredTitle')} subtitle={t('auth.companyInnRequiredSubtitle')} />
      <Card>
        <Text style={styles.hint}>{t('auth.companyInnRequiredHint')}</Text>
        <Input
          label={t('auth.companyInn')}
          value={inn}
          onChangeText={setInn}
          keyboardType="number-pad"
          maxLength={14}
          placeholder="123456789"
        />
        <Button title={t('common.save')} onPress={handleSave} loading={loading} />
      </Card>
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});

export default CompanyInnScreen;
