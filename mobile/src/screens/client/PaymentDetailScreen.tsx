import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { paymentsService } from '../../services/paymentsService';
import { Payment, PaymentHistory } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { useTranslation } from '../../hooks/useTranslation';
import { getApiErrorMessage } from '../../services/errorService';
import { extractPaymentCheckoutUrl, isPaymentAwaitingCheckout } from '../../utils/paymentCheckout';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';

const PaymentDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: number };
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);

  const [payment, setPayment] = useState<Payment | null>(null);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [partialRefundAmount, setPartialRefundAmount] = useState('');

  useEffect(() => {
    loadPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (payment && (payment.payment_status === 'pending' || payment.payment_status === 'processing')) {
      interval = setInterval(() => {
        loadPayment();
      }, 3000);
    }

    return () => {
      if (interval) {clearInterval(interval);}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.payment_status]);

  const loadPayment = async () => {
    try {
      const data = await paymentsService.getPaymentStatus(id);
      setPayment(data);
      if (data.payment_status === 'completed' || data.payment_status === 'cancelled') {
        loadHistory();
      }
    } catch (error: any) {
      setPayment(null);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await paymentsService.getPaymentHistory(id);
      setHistory(data);
    } catch (error) {
      console.error('Error loading payment history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const executeRefund = async (amount?: number) => {
    try {
      setRefunding(true);
      await paymentsService.refundPayment(id, amount ? { amount } : undefined);
      Alert.alert(t('common.success'), t('payments.refunded'));
      setPartialRefundAmount('');
      loadPayment();
    } catch (error: unknown) {
      Alert.alert(t('common.error'), getApiErrorMessage(error, t('payments.refundError')));
    } finally {
      setRefunding(false);
    }
  };

  const handleRefund = () => {
    const refundable = payment?.refundable_amount ?? payment?.amount ?? 0;
    Alert.alert(
      t('payments.refundTitle'),
      t('payments.refundConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('payments.refundFullAction'),
          style: 'destructive',
          onPress: () => executeRefund(),
        },
        {
          text: t('payments.refundPartialAction'),
          onPress: () => {
            const parsed = parseFloat(partialRefundAmount.replace(/[^\d.]/g, ''));
            if (!parsed || parsed <= 0) {
              Alert.alert(t('common.error'), t('payments.refundAmountInvalid'));
              return;
            }
            if (parsed > refundable) {
              Alert.alert(t('common.error'), t('payments.refundAmountTooHigh', { max: refundable }));
              return;
            }
            executeRefund(parsed);
          },
        },
      ],
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) {return t('common.notSpecified');}
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'processing':
        return colors.warning;
      case 'pending':
        return colors.info;
      case 'failed':
      case 'cancelled':
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return 'check-circle';
      case 'processing':
        return 'hourglass-empty';
      case 'pending':
        return 'schedule';
      case 'failed':
      case 'cancelled':
        return 'error';
      default:
        return 'info';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return t('orders.completed');
      case 'processing':
        return t('orders.inProgress');
      case 'pending':
        return t('orders.pending');
      case 'failed':
        return t('common.error');
      case 'cancelled':
        return t('orders.cancelled');
      default:
        return status;
    }
  };

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'click':
        return 'Click';
      case 'payme':
        return 'Payme';
      case 'uzum':
        return 'Uzum';
      case 'mock':
        return t('payments.mockMethod');
      default:
        return method;
    }
  };

  if (loading && !payment) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (!payment) {
    return (
      <ScreenBackground>
        <AppHeader title={t('payments.paymentDetail')} />
        <EmptyState
          variant="error"
          title={t('payments.loadError')}
          message={t('errors.tryAgain')}
          actionText={t('payments.retry')}
          onActionPress={loadPayment}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader title={t('payments.paymentDetail')} />
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={styles.statusInfo}>
            <MaterialIcons
              name={getStatusIcon(payment.payment_status)}
              size={24}
              color={getStatusColor(payment.payment_status)}
            />
            <Text style={styles.statusLabel}>{t('orders.status')}:</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(payment.payment_status) + '20' },
            ]}>
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(payment.payment_status) },
              ]}>
              {getStatusLabel(payment.payment_status)}
            </Text>
          </View>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amount}>
            {payment.amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} {payment.currency}
          </Text>
          {payment.payment_status === 'processing' && (
            <ActivityIndicator
              size="small"
              color={colors.warning}
              style={styles.loadingIndicator}
            />
          )}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('payments.paymentDetail')}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t('payments.paymentId')}:</Text>
          <Text style={styles.value}>#{payment.id}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>{t('payments.method')}:</Text>
          <Text style={styles.value}>{getPaymentMethodName(payment.payment_method)}</Text>
        </View>

        {payment.purpose === 'order_completion_fee' && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('payments.paymentPurpose')}:</Text>
            <Text style={styles.value}>{t('payments.serviceFeePaymentLabel')}</Text>
          </View>
        )}

        {payment.transaction_id && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('payments.transactionId')}:</Text>
            <Text style={styles.value}>{payment.transaction_id}</Text>
          </View>
        )}

        {payment.order && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('payments.orderId')}:</Text>
            <Text style={styles.value}>#{payment.order}</Text>
          </View>
        )}

        {payment.created_at && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('payments.createdAt')}:</Text>
            <Text style={styles.value}>{formatDate(payment.created_at)}</Text>
          </View>
        )}

        {payment.paid_at && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('payments.paidAt')}:</Text>
            <Text style={styles.value}>{formatDate(payment.paid_at)}</Text>
          </View>
        )}

        {payment.updated_at && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('payments.updatedAt')}:</Text>
            <Text style={styles.value}>{formatDate(payment.updated_at)}</Text>
          </View>
        )}
      </Card>

      {isPaymentAwaitingCheckout(payment) && (
        <Card style={styles.noteCard}>
          <View style={styles.noteHeader}>
            <MaterialIcons name="payment" size={20} color={colors.primary} />
            <Text style={styles.noteTitle}>{t('payments.checkoutResumeTitle')}</Text>
          </View>
          <Text style={styles.noteText}>{t('payments.checkoutResumeDescription')}</Text>
          <Button
            title={t('payments.openCheckout')}
            onPress={() => {
              const url = extractPaymentCheckoutUrl(payment);
              (navigation as any).navigate('PaymentCheckout', {
                paymentId: payment.id,
                ...(url ? { checkoutUrl: url } : {}),
              });
            }}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      )}

      {payment.payment_status === 'processing' && !isPaymentAwaitingCheckout(payment) && (
        <Card style={styles.noteCard}>
          <View style={styles.noteHeader}>
            <MaterialIcons name="info" size={20} color={colors.warning} />
            <Text style={styles.noteTitle}>{t('payments.processingTitle')}</Text>
          </View>
          <Text style={styles.noteText}>
            {t('payments.processingDescription')}
          </Text>
        </Card>
      )}

      {payment.payment_status === 'pending' && !isPaymentAwaitingCheckout(payment) && (
        <Card style={styles.noteCard}>
          <View style={styles.noteHeader}>
            <MaterialIcons name="schedule" size={20} color={colors.info} />
            <Text style={styles.noteTitle}>{t('payments.pendingTitle')}</Text>
          </View>
          <Text style={styles.noteText}>
            {t('payments.pendingDescription')}
          </Text>
        </Card>
      )}

      {payment.payment_status === 'completed' &&
        !payment.is_refunded &&
        payment.purpose !== 'order_completion_fee' && (
        <Card style={styles.card}>
          <Input
            label={t('payments.refundPartialAmountLabel')}
            value={partialRefundAmount}
            onChangeText={setPartialRefundAmount}
            keyboardType="numeric"
            placeholder={
              payment.refundable_amount != null
                ? String(payment.refundable_amount)
                : String(payment.amount)
            }
          />
          <Button
            title={t('payments.refundTitle')}
            onPress={handleRefund}
            loading={refunding}
            variant="danger"
            style={styles.refundButton}
          />
        </Card>
      )}

      {payment.is_refunded && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('payments.refundedTitle')}</Text>
          {payment.refunded_at && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('payments.refundedAt')}:</Text>
              <Text style={styles.value}>{formatDate(payment.refunded_at)}</Text>
            </View>
          )}
          {payment.refund_amount && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('payments.refundedAmount')}:</Text>
              <Text style={styles.value}>
                {payment.refund_amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} {payment.currency}
              </Text>
            </View>
          )}
          {payment.refund_reason && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('common.reason')}:</Text>
              <Text style={styles.value}>{payment.refund_reason}</Text>
            </View>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('payments.history')}</Text>
          {loadingHistory ? (
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          ) : (
            history.map((item, index) => (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyStatus}>{item.status}</Text>
                  <Text style={styles.historyArrow}>→</Text>
                  <Text style={styles.historyStatusNew}>{item.status_new}</Text>
                </View>
                <Text style={styles.historyDate}>{formatDate(item.created_at)}</Text>
                {index < history.length - 1 && <View style={styles.historyDivider} />}
              </View>
            ))
          )}
        </Card>
      )}
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
  statusCard: {
    marginBottom: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    ...shadows.md,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    ...shadows.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amount: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    letterSpacing: 0.5,
  },
  loadingIndicator: {
    marginLeft: spacing.sm,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  value: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: fontWeight.semibold,
  },
  noteCard: {
    backgroundColor: colors.warning + '20',
    borderColor: colors.warning,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  noteTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.warning,
  },
  noteText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    lineHeight: 20,
  },
  refundButton: {
    marginTop: 0,
  },
  historyItem: {
    paddingVertical: spacing.md,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  historyStatus: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  historyArrow: {
    fontSize: fontSize.base,
    color: colors.textTertiary,
    marginHorizontal: spacing.sm,
  },
  historyStatusNew: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  historyDate: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  historyDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});

export default PaymentDetailScreen;
