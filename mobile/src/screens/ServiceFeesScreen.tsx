import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ScreenBackground } from '../components/ScreenBackground';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { getApiErrorMessage } from '../services/errorService';
import { paymentsService } from '../services/paymentsService';
import { toastService } from '../services/toastService';
import { borderRadius, fontSize, fontWeight, spacing } from '../theme';
import type { AppColors } from '../theme/colors';
import { useAppTheme } from '../theme/useAppTheme';
import { useThemedStyles } from '../theme/useThemedStyles';
import type { OrderCompletionFee, OrderCompletionFeeSummary } from '../types';
import { isPaymentAwaitingCheckout } from '../utils/paymentCheckout';

type PaymentMethod = 'click' | 'payme' | 'uzum' | 'mock';

const ServiceFeesScreen = () => {
  const navigation = useNavigation();
  const { refreshUser } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [fees, setFees] = useState<OrderCompletionFee[]>([]);
  const [summary, setSummary] = useState<OrderCompletionFeeSummary | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('click');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFees = useCallback(async (silent = false) => {
    try {
      if (!silent) {setLoading(true);}
      setLoadError(null);
      const result = await paymentsService.getCompletionFees('pending');
      setFees(result.results || []);
      setSummary(result.summary);
      if (!result.summary.required) {
        await refreshUser({ force: true });
      }
    } catch (error) {
      setLoadError(getApiErrorMessage(error, t('payments.serviceFeeLoadError')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshUser, t]);

  useFocusEffect(
    useCallback(() => {
      void loadFees();
    }, [loadFees]),
  );

  const handlePay = async (fee: OrderCompletionFee) => {
    try {
      setPayingId(fee.id);
      const payment = await paymentsService.payCompletionFee(fee.id, paymentMethod);
      if (payment.payment_status === 'completed') {
        toastService.success(t('payments.serviceFeePaid'));
        await refreshUser({ force: true });
        await loadFees(true);
        return;
      }
      if (isPaymentAwaitingCheckout(payment)) {
        (navigation as any).navigate('PaymentCheckout', {
          paymentId: payment.id,
          mode: 'service_fee',
        });
        return;
      }
      (navigation as any).navigate('PaymentDetail', { id: payment.id });
    } catch (error) {
      Alert.alert(
        t('common.error'),
        getApiErrorMessage(error, t('payments.serviceFeePayError')),
      );
    } finally {
      setPayingId(null);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    const locale = currentLanguage === 'ru' ? 'ru-RU' : currentLanguage === 'en' ? 'en-US' : 'uz-UZ';
    const suffix = currency === 'UZS' ? "so'm" : currency === 'USD' ? '$' : currency;
    return `${Number(amount).toLocaleString(locale)} ${suffix}`;
  };

  const methods: Array<{ id: PaymentMethod; label: string }> = [
    { id: 'click', label: 'Click' },
    { id: 'payme', label: 'Payme' },
    { id: 'uzum', label: 'Uzum' },
    ...(__DEV__ ? [{ id: 'mock' as const, label: t('payments.mockMethod') }] : []),
  ];

  if (loading && !summary) {
    return (
      <ScreenBackground>
        <AppHeader title={t('payments.serviceFeeTitle')} />
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (loadError && !summary) {
    return (
      <ScreenBackground>
        <AppHeader title={t('payments.serviceFeeTitle')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={loadError}
          actionText={t('payments.retry')}
          onActionPress={() => void loadFees()}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadFees(true);
            }}
          />
        }>
        <AppHeader title={t('payments.serviceFeeTitle')} />

        <Card variant="soft" style={styles.noticeCard}>
          <View style={styles.noticeIcon}>
            <MaterialIcons name="lock-clock" size={28} color={colors.warning} />
          </View>
          <View style={styles.noticeText}>
            <Text style={styles.noticeTitle}>{t('payments.serviceFeeRequiredTitle')}</Text>
            <Text style={styles.noticeDescription}>{t('payments.serviceFeeRequiredDescription')}</Text>
          </View>
        </Card>

        {fees.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{t('payments.selectMethod')}</Text>
            <View style={styles.methods}>
              {methods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.methodChip,
                    paymentMethod === method.id && styles.methodChipActive,
                  ]}
                  onPress={() => setPaymentMethod(method.id)}>
                  <Text
                    style={[
                      styles.methodText,
                      paymentMethod === method.id && styles.methodTextActive,
                    ]}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>
              {t('payments.serviceFeePendingCount', { count: summary?.pending_count || fees.length })}
            </Text>
            {fees.map((fee) => (
              <Card key={fee.id} style={styles.feeCard}>
                <View style={styles.feeHeader}>
                  <View>
                    <Text style={styles.orderLabel}>
                      {t('payments.serviceFeeForOrder', { order: fee.order })}
                    </Text>
                    <Text style={styles.roleLabel}>
                      {fee.role === 'client'
                        ? t('payments.serviceFeeClientRole')
                        : t('payments.serviceFeeDriverRole')}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{formatAmount(fee.amount, fee.currency)}</Text>
                </View>
                <Button
                  title={t('payments.serviceFeePayAction')}
                  onPress={() => void handlePay(fee)}
                  loading={payingId === fee.id}
                  disabled={payingId !== null}
                />
              </Card>
            ))}
          </>
        ) : (
          <Card style={styles.clearCard}>
            <MaterialIcons name="check-circle" size={42} color={colors.success} />
            <Text style={styles.clearTitle}>{t('payments.serviceFeeClearTitle')}</Text>
            <Text style={styles.clearDescription}>{t('payments.serviceFeeClearDescription')}</Text>
            <Button
              title={t('payments.serviceFeeContinue')}
              onPress={() => (navigation as any).navigate('Main')}
            />
          </Card>
        )}
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  noticeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noticeIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: `${colors.warning}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  noticeText: {
    flex: 1,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  noticeDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  methods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  methodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  methodChipActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}14`,
  },
  methodText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  methodTextActive: {
    color: colors.primary,
  },
  feeCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  orderLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  roleLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  amount: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  clearCard: {
    marginHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  clearTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  clearDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ServiceFeesScreen;
