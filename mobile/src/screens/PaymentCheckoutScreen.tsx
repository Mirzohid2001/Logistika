import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { paymentsService } from '../services/paymentsService';
import { Payment } from '../types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { ScreenBackground } from '../components/ScreenBackground';
import { AppHeader } from '../components/AppHeader';
import { useTranslation } from '../hooks/useTranslation';
import { extractPaymentCheckoutUrl } from '../utils/paymentCheckout';
import { getApiErrorMessage } from '../services/errorService';
import { toastService } from '../services/toastService';
import { useAuth } from '../context/AuthContext';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

type CheckoutMode = 'order' | 'subscription' | 'service_fee';

const PaymentCheckoutScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { refreshUser } = useAuth();
  const { paymentId, mode = 'order' } = route.params as {
    paymentId: number;
    mode?: CheckoutMode;
  };

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPayment = useCallback(async (silent = false) => {
    try {
      if (!silent) {setLoadError(null);}
      const data = await paymentsService.getPaymentStatus(paymentId);
      setPayment(data);

      if (data.payment_status === 'completed') {
        if (mode === 'subscription' || mode === 'service_fee') {
          await refreshUser({ force: true });
        }
        toastService.success(
          mode === 'subscription'
            ? t('subscriptions.purchaseSuccess')
            : mode === 'service_fee'
              ? t('payments.serviceFeePaid')
              : t('payments.paymentCreatedCompleted'),
        );
        if (mode === 'subscription') {
          (navigation as any).navigate('Main');
        } else if (mode === 'service_fee') {
          (navigation as any).navigate('ServiceFees');
        } else {
          navigation.goBack();
        }
      } else if (data.payment_status === 'failed' || data.payment_status === 'cancelled') {
        Alert.alert(t('common.error'), t('payments.checkoutFailed'));
      }
    } catch (error) {
      setLoadError(getApiErrorMessage(error, t('payments.loadError')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [paymentId, mode, navigation, t, refreshUser]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  useEffect(() => {
    if (!payment) {return undefined;}
    const pending =
      payment.payment_status === 'pending' || payment.payment_status === 'processing';
    if (!pending) {return undefined;}

    const interval = setInterval(() => {
      loadPayment(true);
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.payment_status, loadPayment]);

  const checkoutUrl = extractPaymentCheckoutUrl(payment);

  const openCheckout = async () => {
    if (!checkoutUrl) {
      Alert.alert(t('common.error'), t('payments.checkoutUrlMissing'));
      return;
    }
    const canOpen = await Linking.canOpenURL(checkoutUrl);
    if (!canOpen) {
      Alert.alert(t('common.error'), t('payments.checkoutOpenError'));
      return;
    }
    await Linking.openURL(checkoutUrl);
  };

  const formatAmount = (amount: number, currency: string) => {
    const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';
    return `${Number(amount).toLocaleString(locale)} ${currency === 'UZS' ? "so'm" : currency}`;
  };

  if (loading && !payment) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (loadError && !payment) {
    return (
      <ScreenBackground>
        <AppHeader title={t('payments.checkoutTitle')} showBack />
        <EmptyState
          title={t('common.error')}
          message={loadError}
          actionText={t('dashboard.retry')}
          onActionPress={() => {
            setLoading(true);
            loadPayment();
          }}
        />
      </ScreenBackground>
    );
  }

  if (!payment) {
    return null;
  }

  return (
    <ScreenBackground>
      <AppHeader title={t('payments.checkoutTitle')} showBack />
      <View style={styles.content}>
        <Card variant="soft" style={styles.card}>
          <Text style={styles.amount}>{formatAmount(payment.amount, payment.currency)}</Text>
          <Text style={styles.method}>
            {t('payments.methodLabel')}: {payment.payment_method.toUpperCase()}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: `${colors.warning}22` }]}>
            <Text style={[styles.statusText, { color: colors.warning }]}>
              {payment.payment_status}
            </Text>
          </View>
        </Card>

        <Text style={styles.hint}>{t('payments.checkoutHint')}</Text>

        <Button
          title={t('payments.openCheckout')}
          onPress={openCheckout}
          disabled={!checkoutUrl}
          style={styles.button}
        />
        <Button
          title={t('payments.checkStatus')}
          variant="outline"
          loading={refreshing}
          onPress={() => {
            setRefreshing(true);
            loadPayment(true);
          }}
          style={styles.button}
        />
        {!checkoutUrl && (
          <Text style={styles.note}>{t('payments.checkoutUrlMissing')}</Text>
        )}
      </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
    },
    card: {
      marginBottom: spacing.lg,
      alignItems: 'center',
    },
    amount: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.bold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    method: {
      fontSize: fontSize.md,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    statusBadge: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    statusText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      textTransform: 'capitalize',
    },
    hint: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.lg,
    },
    button: {
      marginBottom: spacing.md,
    },
    note: {
      fontSize: fontSize.sm,
      color: colors.danger,
      textAlign: 'center',
    },
  });

export default PaymentCheckoutScreen;
