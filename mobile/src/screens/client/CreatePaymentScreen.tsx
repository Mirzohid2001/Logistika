import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { paymentsService } from '../../services/paymentsService';
import { ordersService } from '../../services/ordersService';
import { Order } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { getApiErrorMessage } from '../../services/errorService';
import { isPaymentAwaitingCheckout } from '../../utils/paymentCheckout';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';

const CreatePaymentScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { orderId } = (route.params as { orderId?: number }) || {};

  const [order, setOrder] = useState<Order | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'click' | 'payme' | 'uzum' | 'mock' | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);

  useEffect(() => {
    if (orderId) {
      loadOrder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoadingOrder(true);
      const data = await ordersService.getOrder(orderId!);
      setOrder(data);

      if (data.remaining_amount !== undefined && data.remaining_amount > 0) {
        setAmount(data.remaining_amount.toString());
      } else {
        const advertisement = typeof data.advertisement === 'object' ? data.advertisement : null;
        if (advertisement?.proposed_cost) {
          setAmount(advertisement.proposed_cost.toString());
        }
      }
    } catch (error) {
      console.error('Error loading order:', error);
    } finally {
      setLoadingOrder(false);
    }
  };

  const paymentMethods = useMemo(
    () => [
      { id: 'click' as const, name: 'Click', icon: 'credit-card', color: colors.paymentProvider.click },
      { id: 'payme' as const, name: 'Payme', icon: 'payment', color: colors.paymentProvider.payme },
      { id: 'uzum' as const, name: 'Uzum', icon: 'account-balance-wallet', color: colors.paymentProvider.uzum },
      ...(__DEV__
        ? [{ id: 'mock' as const, name: t('payments.mockMethod'), icon: 'science', color: colors.textTertiary }]
        : []),
    ],
    [colors, t],
  );

  const formatAmount = (value: string) => {
    // Faqat raqamlar va nuqta qoldirish
    const cleaned = value.replace(/[^\d.]/g, '');
    // Bir nechta nuqta bo'lmasligi uchun
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  };

  const handleAmountChange = (value: string) => {
    const formatted = formatAmount(value);
    setAmount(formatted);
  };

  const handleSubmit = async () => {
    // Validation
    if (!amount.trim()) {
      Alert.alert(t('common.error'), t('payments.enterAmount'));
      return;
    }

    if (!paymentMethod) {
      Alert.alert(t('common.error'), t('payments.selectMethod'));
      return;
    }

    const amountNum = parseFloat(amount.replace(/\s/g, ''));
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert(t('common.error'), t('payments.invalidAmount'));
      return;
    }

    // Minimum summa tekshiruvi
    if (amountNum < 1000) {
      Alert.alert(t('common.error'), t('payments.minAmount'));
      return;
    }

    // Maximum summa tekshiruvi (100 million)
    if (amountNum > 100000000) {
      Alert.alert(t('common.error'), t('payments.maxAmount'));
      return;
    }

    // Qoldiq summa tekshiruvi (agar order bo'lsa)
    if (order && order.remaining_amount !== undefined && order.remaining_amount > 0) {
      if (amountNum > order.remaining_amount) {
        Alert.alert(t('common.error'), t('payments.exceedsRemaining'));
        return;
      }
    }

    setLoading(true);
    try {
      const payment = await paymentsService.createPayment({
        order_id: orderId,
        amount: amountNum,
        currency: 'UZS',
        payment_method: paymentMethod,
      });

      if (isPaymentAwaitingCheckout(payment)) {
        (navigation as any).navigate('PaymentCheckout', { paymentId: payment.id, mode: 'order' });
        return;
      }

      const done =
        payment.payment_status === 'completed' || payment.payment_status === 'failed' || payment.payment_status === 'cancelled';
      const message = done ? t('payments.paymentCreatedCompleted') : t('payments.paymentCreatedPending');

      Alert.alert(t('common.success'), message, [
        {
          text: t('common.ok'),
          onPress: () => {
            if (!done) {
              (navigation as any).navigate('PaymentDetail', { id: payment.id });
              return;
            }
            if (orderId) {
              navigation.goBack();
            } else {
              (navigation as any).navigate('PaymentDetail', { id: payment.id });
            }
          },
        },
      ]);
    } catch (error: unknown) {
      Alert.alert(t('common.error'), getApiErrorMessage(error, t('payments.createPaymentError')));
    } finally {
      setLoading(false);
    }
  };

  if (loadingOrder) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  const advertisement = order && typeof order.advertisement === 'object' ? order.advertisement : null;
  const driver = order && typeof order.driver === 'object' ? order.driver : null;

  return (
    <ScreenBackground>
      <AppHeader title={t('payments.createPayment')} subtitle={t('payments.paymentInfoTitle')} />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {order && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('payments.orderInfoTitle')}</Text>
          <View style={styles.orderInfo}>
            <Text style={styles.orderLabel}>{t('payments.orderIdLabel')}:</Text>
            <Text style={styles.orderValue}>#{order.id}</Text>
          </View>
          {advertisement && (
            <>
              <View style={styles.orderInfo}>
                <Text style={styles.orderLabel}>{t('payments.advertisementLabel')}:</Text>
                <Text style={styles.orderValue}>{advertisement.title}</Text>
              </View>
              {order.total_amount !== undefined && (
                <>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderLabel}>{t('payments.totalAmount')}:</Text>
                    <Text style={styles.orderValue}>
                      {order.total_amount.toLocaleString('uz-UZ')} so'm
                    </Text>
                  </View>
                  {order.paid_amount !== undefined && (
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderLabel}>{t('payments.paidAmount')}:</Text>
                      <Text style={[styles.orderValue, { color: colors.success }]}>
                        {order.paid_amount.toLocaleString('uz-UZ')} so'm
                      </Text>
                    </View>
                  )}
                  {order.remaining_amount !== undefined && order.remaining_amount > 0 && (
                    <View style={[styles.orderInfo, styles.orderInfoWarning]}>
                      <Text style={styles.orderLabel}>{t('payments.remainingAmount')}:</Text>
                      <Text style={[styles.orderValue, { color: colors.danger }]}>
                        {order.remaining_amount.toLocaleString('uz-UZ')} so'm
                      </Text>
                    </View>
                  )}
                </>
              )}
            </>
          )}
          {driver && (
            <View style={styles.orderInfo}>
              <Text style={styles.orderLabel}>{t('dispatcherOps.driver')}:</Text>
              <Text style={styles.orderValue}>
                {driver.first_name} {driver.last_name}
              </Text>
            </View>
          )}
        </Card>
      )}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('payments.paymentInfoTitle')}</Text>

        {!order && orderId && (
          <View style={styles.orderInfo}>
            <Text style={styles.orderLabel}>{t('payments.orderIdLabel')}:</Text>
            <Text style={styles.orderValue}>#{orderId}</Text>
          </View>
        )}

        <Input
          label={t('payments.amountLabel')}
          value={amount}
          onChangeText={handleAmountChange}
          placeholder={t('payments.amountPlaceholder')}
          keyboardType="numeric"
          error={amount && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) ? t('payments.invalidAmount') : undefined}
        />

        {order && order.remaining_amount !== undefined && order.remaining_amount > 0 && (
          <View style={styles.remainingInfo}>
            <MaterialIcons name="info-outline" size={16} color={colors.warning} />
            <Text style={styles.remainingText}>
              {t('payments.remainingHint', { amount: order.remaining_amount.toLocaleString('uz-UZ') })}
            </Text>
          </View>
        )}

        <Text style={styles.label}>{t('payments.paymentMethodLabel')}</Text>
        <View style={styles.methodsContainer}>
          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.methodCard,
                paymentMethod === method.id && [
                  styles.methodCardActive,
                  { borderColor: method.color },
                ],
              ]}
              onPress={() => setPaymentMethod(method.id as 'click' | 'payme' | 'uzum' | 'mock')}
              activeOpacity={0.7}>
              <View
                style={[
                  styles.methodIconContainer,
                  paymentMethod === method.id && { backgroundColor: method.color + '20' },
                ]}>
                <MaterialIcons
                  name={method.icon}
                  size={32}
                  color={paymentMethod === method.id ? method.color : colors.textSecondary}
                />
              </View>
              <Text
                style={[
                  styles.methodName,
                  paymentMethod === method.id && [
                    styles.methodNameActive,
                    { color: method.color },
                  ],
                ]}>
                {method.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Button
        title={t('payments.createPayment')}
        onPress={handleSubmit}
        loading={loading}
        variant="primary"
        style={styles.submitButton}
      />
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  orderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  orderInfoWarning: {
    backgroundColor: colors.warning + '20',
  },
  orderLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  orderValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  remainingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.warning + '20',
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  remainingText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  methodsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  methodCard: {
    flex: 1,
    minWidth: '30%',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.sm,
  },
  methodCardActive: {
    backgroundColor: colors.backgroundSecondary,
    ...shadows.md,
  },
  methodIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.round,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  methodName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  methodNameActive: {
    fontWeight: fontWeight.bold,
  },
  submitButton: {
    marginTop: spacing.md,
  },
});

export default CreatePaymentScreen;
