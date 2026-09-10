import React, { useCallback, useMemo, useState } from 'react';
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
import { Input } from '../components/Input';
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
import type { AccountBalancesResponse } from '../types';
import { isPaymentAwaitingCheckout } from '../utils/paymentCheckout';

type BalanceType = 'order' | 'commission';
type Currency = 'UZS' | 'USD';
type PaymentMethod = 'click' | 'payme' | 'uzum' | 'mock';

const BalancesScreen = () => {
  const navigation = useNavigation();
  const { user, activeMarketplaceRole } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const isClient = activeMarketplaceRole === 'client' || (!activeMarketplaceRole && !!user?.is_client);
  const [data, setData] = useState<AccountBalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceType, setBalanceType] = useState<BalanceType>(isClient ? 'order' : 'commission');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('click');

  const loadBalances = useCallback(async (silent = false) => {
    try {
      if (!silent) {setLoading(true);}
      setError(null);
      setData(await paymentsService.getBalances(isClient ? 'client' : 'driver'));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t('balances.loadError')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isClient, t]);

  useFocusEffect(useCallback(() => {
    void loadBalances();
  }, [loadBalances]));

  const visibleBalances = useMemo(
    () => data?.balances.filter(item => isClient || item.type === 'commission') || [],
    [data, isClient],
  );
  const formatAmount = (value: number, targetCurrency: string) => {
    const locale = currentLanguage === 'ru' ? 'ru-RU' : currentLanguage === 'en' ? 'en-US' : 'uz-UZ';
    const suffix = targetCurrency === 'UZS' ? "so'm" : '$';
    return `${Number(value).toLocaleString(locale, { maximumFractionDigits: 2 })} ${suffix}`;
  };

  const handleTopUp = async () => {
    const parsed = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert(t('common.error'), t('balances.invalidAmount'));
      return;
    }
    try {
      setSubmitting(true);
      const payment = await paymentsService.topUpBalance({
        balance_type: balanceType,
        amount: parsed,
        currency,
        payment_method: paymentMethod,
      });
      if (payment.payment_status === 'completed') {
        setAmount('');
        toastService.success(t('balances.topUpSuccess'));
        await loadBalances(true);
      } else if (isPaymentAwaitingCheckout(payment)) {
        (navigation as any).navigate('PaymentCheckout', {
          paymentId: payment.id,
          mode: 'balance',
        });
      } else {
        (navigation as any).navigate('PaymentDetail', { id: payment.id });
      }
    } catch (topUpError) {
      Alert.alert(t('common.error'), getApiErrorMessage(topUpError, t('balances.topUpError')));
    } finally {
      setSubmitting(false);
    }
  };

  const methods: PaymentMethod[] = [
    'click',
    'payme',
    'uzum',
    ...(__DEV__ ? ['mock' as const] : []),
  ];

  if (loading && !data) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('balances.title')} />
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (error && !data) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('balances.title')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={error}
          actionText={t('common.retry')}
          onActionPress={() => void loadBalances()}
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
              void loadBalances(true);
            }}
          />
        }>
        <AppHeader
          variant="hero"
          title={t('balances.title')}
          subtitle={isClient ? t('balances.clientSubtitle') : t('balances.driverSubtitle')}
        />

        <View style={styles.currencySwitchSection}>
          <Text style={styles.currencySwitchLabel}>{t('balances.displayCurrency')}</Text>
          <View style={styles.currencySwitch}>
            {(data?.supported_currencies || ['UZS', 'USD']).map(item => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.currencySwitchOption,
                  currency === item && styles.currencySwitchOptionActive,
                ]}
                onPress={() => setCurrency(item)}>
                <Text style={[
                  styles.currencySwitchText,
                  currency === item && styles.currencySwitchTextActive,
                ]}>
                  {item === 'UZS' ? "UZS · so'm" : 'USD · $'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.balanceGrid}>
          {visibleBalances.map(item => {
            const displayed = item.display[currency];
            return (
              <Card key={item.type} variant="soft" style={styles.balanceCard}>
                <View style={styles.balanceIcon}>
                  <MaterialIcons
                    name={item.type === 'order' ? 'local-shipping' : 'percent'}
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.balanceLabel}>
                  {item.type === 'order' ? t('balances.orderBalance') : t('balances.commissionBalance')}
                </Text>
                <Text style={styles.balanceValue}>{formatAmount(displayed.available, currency)}</Text>
                {displayed.reserved > 0 && (
                  <Text style={styles.reservedText}>
                    {t('balances.reserved')}: {formatAmount(displayed.reserved, currency)}
                  </Text>
                )}
              </Card>
            );
          })}
        </View>

        {data?.commission.enabled && (
          <Card style={styles.infoCard}>
            <MaterialIcons name="verified" size={22} color={colors.success} />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>{t('balances.commissionPerOrder')}</Text>
              <Text style={styles.infoValue}>
                {formatAmount(data.commission.display[currency], currency)}
              </Text>
            </View>
          </Card>
        )}

        <Card variant="elevated" style={styles.topUpCard}>
          <Text style={styles.sectionTitle}>{t('balances.topUp')}</Text>
          {isClient && (
            <View style={styles.chips}>
              {(['order', 'commission'] as BalanceType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, balanceType === type && styles.chipActive]}
                  onPress={() => {
                    setBalanceType(type);
                  }}>
                  <Text style={[styles.chipText, balanceType === type && styles.chipTextActive]}>
                    {type === 'order' ? t('balances.forOrders') : t('balances.forCommission')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.chips}>
            {(data?.supported_currencies || ['UZS', 'USD']).map(item => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, currency === item && styles.chipActive]}
                onPress={() => setCurrency(item)}>
                <Text style={[styles.chipText, currency === item && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {currency === 'USD' && data?.top_up_exchange && (
            <Text style={styles.exchangeHint}>
              {t('balances.usdChargeHint', {
                rate: formatAmount(data.top_up_exchange.usd_to_uzs, 'UZS'),
              })}
            </Text>
          )}

          <Input
            label={t('balances.amount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={currency === 'UZS' ? '10 000 000' : '1 000'}
          />

          <Text style={styles.methodLabel}>{t('payments.paymentMethodLabel')}</Text>
          <View style={styles.chips}>
            {methods.map(method => (
              <TouchableOpacity
                key={method}
                style={[styles.chip, paymentMethod === method && styles.chipActive]}
                onPress={() => setPaymentMethod(method)}>
                <Text style={[styles.chipText, paymentMethod === method && styles.chipTextActive]}>
                  {method === 'mock' ? t('payments.mockMethod') : method.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            title={t('balances.continueTopUp')}
            onPress={() => void handleTopUp()}
            loading={submitting}
          />
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) => StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  balanceGrid: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  currencySwitchSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  currencySwitchLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  currencySwitch: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencySwitchOption: {
    flex: 1,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
  },
  currencySwitchOptionActive: {
    backgroundColor: colors.primary,
  },
  currencySwitchText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  currencySwitchTextActive: {
    color: colors.onPrimary,
    fontWeight: fontWeight.bold,
  },
  balanceCard: {
    marginBottom: 0,
  },
  balanceIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  balanceLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  balanceValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  reservedText: {
    color: colors.warning,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    marginLeft: spacing.md,
  },
  infoTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  infoValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  topUpCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBackground,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  chipTextActive: {
    color: colors.primary,
  },
  methodLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  exchangeHint: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});

export default BalancesScreen;
