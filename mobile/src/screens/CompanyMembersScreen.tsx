import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppHeader } from '../components/AppHeader';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ScreenBackground } from '../components/ScreenBackground';
import { useTranslation } from '../hooks/useTranslation';
import { authService } from '../services/authService';
import { toastService } from '../services/toastService';
import { spacing } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';

const CompanyMembersScreen = () => {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const [members, setMembers] = useState<any[]>([]);
  const [companyInn, setCompanyInn] = useState<string | null>(null);
  const [legal, setLegal] = useState({
    name: '',
    address: '',
    phone: '',
    director_name: '',
    bank_name: '',
    bank_account: '',
    mfo: '',
    oked: '',
  });
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [savingLegal, setSavingLegal] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      await authService.bootstrapCompany();
      const data = await authService.getCompanyMembers();
      setMembers(data.members || []);
      setCompanyInn(data.company_inn || null);
      if (data.company) {
        setLegal({
          name: data.company.name || '',
          address: data.company.address || '',
          phone: data.company.phone || '',
          director_name: data.company.director_name || '',
          bank_name: data.company.bank_name || '',
          bank_account: data.company.bank_account || '',
          mfo: data.company.mfo || '',
          oked: data.company.oked || '',
        });
      }
    } catch (error) {
      console.error(error);
      toastService.error(t('company.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadMembers();
    }, [loadMembers]),
  );

  const handleInvite = async () => {
    if (!phone.trim()) {
      toastService.error(t('auth.phoneRequired'));
      return;
    }
    try {
      setInviting(true);
      await authService.inviteCompanyMember(phone.trim());
      setPhone('');
      toastService.success(t('company.inviteSuccess'));
      await loadMembers();
    } catch (error: any) {
      toastService.error(error?.response?.data?.error || t('company.inviteError'));
    } finally {
      setInviting(false);
    }
  };

  const handleSaveLegal = async () => {
    try {
      setSavingLegal(true);
      await authService.updateCompany(legal);
      toastService.success(t('company.saveLegalSuccess'));
    } catch (error: any) {
      toastService.error(error?.response?.data?.error || t('company.saveLegalError'));
    } finally {
      setSavingLegal(false);
    }
  };

  return (
    <ScreenBackground>
      <AppHeader variant="hero" title={t('company.title')} subtitle={companyInn || undefined} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('company.legalTitle')}</Text>
          <Text style={styles.meta}>{t('company.legalHint')}</Text>
          <Input label={t('company.name')} value={legal.name} onChangeText={(value) => setLegal((prev) => ({ ...prev, name: value }))} />
          <Input label={t('company.address')} value={legal.address} onChangeText={(value) => setLegal((prev) => ({ ...prev, address: value }))} />
          <Input label={t('company.phone')} value={legal.phone} onChangeText={(value) => setLegal((prev) => ({ ...prev, phone: value }))} keyboardType="phone-pad" />
          <Input label={t('company.director')} value={legal.director_name} onChangeText={(value) => setLegal((prev) => ({ ...prev, director_name: value }))} />
          <Input label={t('company.bankName')} value={legal.bank_name} onChangeText={(value) => setLegal((prev) => ({ ...prev, bank_name: value }))} />
          <Input label={t('company.bankAccount')} value={legal.bank_account} onChangeText={(value) => setLegal((prev) => ({ ...prev, bank_account: value }))} />
          <Input label={t('company.mfo')} value={legal.mfo} onChangeText={(value) => setLegal((prev) => ({ ...prev, mfo: value }))} keyboardType="number-pad" />
          <Input label={t('company.oked')} value={legal.oked} onChangeText={(value) => setLegal((prev) => ({ ...prev, oked: value }))} />
          <Button
            title={t('company.saveLegal')}
            onPress={() => void handleSaveLegal()}
            loading={savingLegal}
            variant="primary"
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('company.inviteMember')}</Text>
          <Input
            label={t('auth.phone')}
            value={phone}
            onChangeText={setPhone}
            placeholder="+998901234567"
            keyboardType="phone-pad"
          />
          <Button
            title={t('company.inviteAction')}
            onPress={() => void handleInvite()}
            loading={inviting}
            variant="primary"
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('company.membersTitle')}</Text>
          {loading ? (
            <Text style={styles.meta}>{t('common.loading')}</Text>
          ) : members.length === 0 ? (
            <Text style={styles.meta}>{t('company.noMembers')}</Text>
          ) : (
            members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <Text style={styles.memberName}>
                  {member.user?.first_name} {member.user?.last_name}
                </Text>
                <Text style={styles.meta}>{member.user?.phone}</Text>
                <Text style={styles.role}>{member.role}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    card: {
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    memberRow: {
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    memberName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    meta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    role: {
      fontSize: 12,
      color: colors.primary,
      marginTop: 2,
    },
  });

export default CompanyMembersScreen;
