import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { subscriptionsService } from '../services/subscriptionsService';
import { SubscriptionPlan } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AppHeader } from '../components/AppHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { toastService } from '../services/toastService';
import { getApiErrorMessage } from '../services/errorService';

const SubscriptionPaywallScreen = () => {
  const navigation = useNavigation();
  const styles = useThemedStyles(createStyles);
  const { user, logout, refreshUser } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasingPlanId, setPurchasingPlanId] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mock' | 'click' | 'payme' | 'uzum'>(
    __DEV__ ? 'mock' : 'click',
  );

  const loadPlans = useCallback(async (silent = false) => {
    try {
      if (!silent) {setLoading(true);}
      setLoadFailed(false);
      const data = await subscriptionsService.getPlans();
      setPlans(data);
    } catch (error) {
      setLoadFailed(true);
      setPlans([]);
      toastService.error(getApiErrorMessage(error, t('subscriptions.loadError')));
    } finally {
      if (!silent) {setLoading(false);}
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    loadPlans(false);
  }, [loadPlans]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPlans(true);
    refreshUser();
  };

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    try {
      setPurchasingPlanId(plan.id);
      const result = await subscriptionsService.subscribe(plan.id, paymentMethod);
      if (result.checkout_required && result.payment?.id) {
        (navigation as any).navigate('PaymentCheckout', {
          paymentId: result.payment.id,
          mode: 'subscription',
        });
        return;
      }
      await refreshUser();
      toastService.success(t('subscriptions.purchaseSuccess'));
    } catch (error) {
      toastService.error(getApiErrorMessage(error, t('subscriptions.purchaseError')));
    } finally {
      setPurchasingPlanId(null);
    }
  };

  const paymentMethods: Array<{ id: typeof paymentMethod; label: string }> = [
    { id: 'click', label: 'Click' },
    { id: 'payme', label: 'Payme' },
    { id: 'uzum', label: 'Uzum' },
    ...(__DEV__ ? [{ id: 'mock' as const, label: t('payments.mockMethod') }] : []),
  ];

  const trial = user?.subscription?.trial ?? user?.account?.trial;
  const trialRemaining = trial?.remaining ?? 0;
  const trialMessage =
    trialRemaining > 0
      ? t('subscriptions.trialRemaining', { count: trialRemaining })
      : trial?.disabled && trial?.disabled_reason
        ? t(`subscriptions.trialDisabled.${trial.disabled_reason}`, {
            defaultValue: t('subscriptions.trialExhausted'),
          })
        : t('subscriptions.trialExhausted');

  const formatPrice = (amount: number, currency: string) => {
    const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';
    return `${Number(amount).toLocaleString(locale)} ${currency === 'UZS' ? "so'm" : currency}`;
  };

  if (loading && plans.length === 0) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (loadFailed && plans.length === 0) {
    return (
      <ScreenBackground>
        <AppHeader title={t('subscriptions.title')} subtitle={t('subscriptions.headerHint')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('subscriptions.loadError')}
          actionText={t('common.retry')}
          onActionPress={() => {
            void loadPlans(false);
          }}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <AppHeader title={t('subscriptions.title')} subtitle={t('subscriptions.headerHint')} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <Text style={styles.subtitle}>{t('subscriptions.subtitle')}</Text>
        <View
          style={[
            styles.trialBanner,
            trialRemaining > 0 ? styles.trialBannerActive : styles.trialBannerInactive,
          ]}>
          <Text
            style={[
              styles.trialBannerText,
              trialRemaining > 0 ? styles.trialBannerTextActive : styles.trialBannerTextInactive,
            ]}>
            {trialMessage}
          </Text>
        </View>
        {user && (
          <Text style={styles.greeting}>
            {user.first_name} {user.last_name}
          </Text>
        )}

        <Text style={styles.methodLabel}>{t('payments.selectMethod')}</Text>
        <View style={styles.methodRow}>
          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[styles.methodChip, paymentMethod === method.id && styles.methodChipActive]}
              onPress={() => setPaymentMethod(method.id)}>
              <Text
                style={[
                  styles.methodChipText,
                  paymentMethod === method.id && styles.methodChipTextActive,
                ]}>
                {method.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {plans.map((plan) => {
          const showIntro = plan.intro_eligible && plan.discount_percent > 0;
          const displayPrice = showIntro ? plan.your_price : plan.regular_price ?? plan.price;

          return (
          <Card key={plan.id} style={styles.planCard}>
            <Text style={styles.planName}>{plan.name}</Text>
            {!!plan.description && <Text style={styles.planDescription}>{plan.description}</Text>}
            {showIntro && (
              <View style={styles.introBadge}>
                <Text style={styles.introBadgeText}>
                  {t('subscriptions.introBadge', { percent: plan.discount_percent })}
                </Text>
              </View>
            )}
            <View style={styles.priceRow}>
              {showIntro && (
                <Text style={styles.planPriceOld}>
                  {formatPrice(plan.regular_price ?? plan.price, plan.currency)}
                </Text>
              )}
              <Text style={styles.planPrice}>{formatPrice(displayPrice, plan.currency)}</Text>
            </View>
            {showIntro && (
              <Text style={styles.introHint}>{t('subscriptions.introHint')}</Text>
            )}
            <Text style={styles.planDuration}>
              {t('subscriptions.durationDays', { count: plan.duration_days })}
            </Text>
            <Button
              title={t('subscriptions.subscribe')}
              onPress={() => handleSubscribe(plan)}
              loading={purchasingPlanId === plan.id}
              variant="primary"
              style={styles.subscribeButton}
            />
          </Card>
          );
        })}

        {plans.length === 0 && <Text style={styles.emptyText}>{t('subscriptions.noPlans')}</Text>}

        <Button title={t('profile.logout')} onPress={logout} variant="outline" style={styles.logoutButton} />
      </ScrollView>
    </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  trialBanner: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  trialBannerActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  trialBannerInactive: {
    backgroundColor: colors.warningGlow,
    borderColor: colors.warning,
  },
  trialBannerText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  trialBannerTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  trialBannerTextInactive: {
    color: colors.warning,
  },
  greeting: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  methodLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  methodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  methodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  methodChipTextActive: {
    color: colors.textLight,
    fontWeight: fontWeight.semibold,
  },
  planCard: { marginBottom: spacing.md },
  planName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  planDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  introBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  introBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.success,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  planPriceOld: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  planPrice: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  introHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  planDuration: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  subscribeButton: { marginTop: spacing.xs },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.xl,
  },
  logoutButton: { marginTop: spacing.lg },
});

export default SubscriptionPaywallScreen;
