import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { userService } from '../../services/userService';
import { authService } from '../../services/authService';
import { Earnings } from '../../types';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { AppHeader } from '../../components/AppHeader';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { useTranslation } from '../../hooks/useTranslation';
import { getApiErrorMessage } from '../../services/errorService';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { useThemedStyles, type AppColors } from '../../theme/useThemedStyles';

const EarningsScreen = () => {
  const { t, currentLanguage } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payouts, setPayouts] = useState<any[]>([]);

  const loadEarnings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await userService.getEarnings();
      setEarnings(data);
      const payoutData = await authService.getPayoutRequests();
      setPayouts(payoutData.results || []);
    } catch (error) {
      console.error('Error loading earnings:', error);
      setEarnings(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEarnings();
    }, [loadEarnings])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadEarnings();
  };

  const handleRequestPayout = async () => {
    const amount = Number(payoutAmount);
    if (!amount || amount <= 0) {
      return;
    }
    try {
      setPayoutLoading(true);
      await authService.createPayoutRequest({
        amount,
        bank_details: bankDetails.trim(),
      });
      setPayoutAmount('');
      setBankDetails('');
      await loadEarnings();
      Alert.alert(t('common.success'), t('payout.requestSuccess'));
    } catch (error: any) {
      Alert.alert(t('common.error'), getApiErrorMessage(error, t('payout.requestFailed')));
    } finally {
      setPayoutLoading(false);
    }
  };

  const formatMoney = (amount: number) =>
    `${amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} ${t('dashboard.currencySuffix')}`;

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dashboard.earnings')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (!earnings) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dashboard.earnings')} />
        <EmptyState
          variant="error"
          title={t('dispatcherLists.loadError')}
          message={t('errors.tryAgain')}
          actionText={t('dispatcherLists.retry')}
          onActionPress={loadEarnings}
        />
      </ScreenBackground>
    );
  }

  const avgOrder =
    (earnings.settled_orders ?? earnings.completed_orders) > 0
      ? earnings.total_earnings / (earnings.settled_orders ?? earnings.completed_orders)
      : 0;

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <AppHeader variant="hero" title={t('dashboard.earnings')} subtitle={t('statistics.title')} />
        <Card variant="elevated" style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('statistics.totalEarnings')}</Text>
          <Text style={styles.summaryAmount}>{formatMoney(earnings.total_earnings)}</Text>
          <Text style={styles.disclaimer}>{t('payout.earningsDisclaimer')}</Text>
        </Card>

        <Card variant="soft" style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('payout.availableBalance')}</Text>
            <Text style={styles.statValue}>{formatMoney(earnings.available_balance ?? 0)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('payout.reservedBalance')}</Text>
            <Text style={styles.statValue}>{formatMoney(earnings.reserved_payouts ?? 0)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('statistics.completedOrders')}</Text>
            <Text style={styles.statValue}>{earnings.settled_orders ?? earnings.completed_orders}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('statistics.averageOrder')}</Text>
            <Text style={styles.statValue}>{formatMoney(avgOrder)}</Text>
          </View>
        </Card>

        <Card variant="soft" style={styles.payoutCard}>
          <Text style={styles.payoutTitle}>{t('payout.requestTitle')}</Text>
          <Input
            label={t('payout.amount')}
            value={payoutAmount}
            onChangeText={setPayoutAmount}
            keyboardType="numeric"
            placeholder="1000000"
          />
          <Input
            label={t('payout.bankDetails')}
            value={bankDetails}
            onChangeText={setBankDetails}
            placeholder={t('payout.bankDetailsPlaceholder')}
          />
          <Button
            title={t('payout.requestAction')}
            onPress={() => void handleRequestPayout()}
            loading={payoutLoading}
            variant="primary"
          />
          {payouts.length > 0 && (
            <View style={styles.payoutHistory}>
              <Text style={styles.payoutHistoryTitle}>{t('payout.historyTitle')}</Text>
              {payouts.slice(0, 5).map((item) => (
                <View key={item.id} style={styles.payoutHistoryItemWrap}>
                  <Text style={styles.payoutHistoryItem}>
                    {formatMoney(item.amount)} — {item.status}
                  </Text>
                  {!!item.admin_note?.trim() && (
                    <Text style={styles.payoutAdminNote}>
                      {t('payout.adminNote')}: {item.admin_note.trim()}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
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
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 24,
  },
  summaryCard: {
    backgroundColor: colors.primary,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.colored(colors.primary),
  },
  summaryTitle: {
    fontSize: fontSize.base,
    color: colors.textLight,
    opacity: 0.95,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  summaryAmount: {
    fontSize: fontSize.huge,
    fontWeight: fontWeight.extrabold,
    color: colors.textLight,
    letterSpacing: -0.5,
  },
  disclaimer: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textLight,
    opacity: 0.85,
    lineHeight: 18,
  },
  statsCard: {
    marginBottom: spacing.lg,
  },
  statItem: {
    paddingVertical: spacing.md,
  },
  statLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm,
  },
  payoutCard: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  payoutTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  payoutHistory: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  payoutHistoryTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  payoutHistoryItem: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  payoutHistoryItemWrap: {
    marginBottom: spacing.sm,
  },
  payoutAdminNote: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    lineHeight: 16,
  },
});

export default EarningsScreen;
