import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { ClientDetail, Order } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { makePhoneCall } from '../../utils/phone';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';

const DispatcherClientDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { clientId } = route.params as { clientId: number };

  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    loadClientDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const loadClientDetail = async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await dispatcherService.getClientDetail(clientId);
      setClientDetail(data);
    } catch (error: any) {
      console.error('Error loading client detail:', error);
      setClientDetail(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dispatcherLists.clientDetailTitle')} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
        </View>
      </ScreenBackground>
    );
  }

  if (loadFailed || !clientDetail) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('dispatcherLists.clientDetailTitle')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('dispatcherOps.loadError')}
          actionText={t('common.retry')}
          onActionPress={loadClientDetail}
        />
      </ScreenBackground>
    );
  }

  const { client, total_orders, completed_orders, active_orders, total_spent, recent_orders } =
    clientDetail;
  const locale = currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ';

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={t('dispatcherLists.clientDetailTitle')} />
        <Card variant="elevated" style={styles.profileCard}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {client.first_name[0]}
              {client.last_name[0]}
            </Text>
          </View>
          <Text style={styles.name}>
            {client.first_name} {client.last_name}
          </Text>
          <Text style={styles.phone}>{client.phone}</Text>
          {client.email ? <Text style={styles.email}>{client.email}</Text> : null}
        </Card>

        <Card variant="soft" style={styles.statsCard}>
          <Text style={styles.cardTitle}>{t('dispatcherLists.statistics')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{total_orders}</Text>
              <Text style={styles.statLabel}>{t('dispatcherLists.totalOrdersCount')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{completed_orders}</Text>
              <Text style={styles.statLabel}>{t('dispatcherLists.completedShort')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{active_orders}</Text>
              <Text style={styles.statLabel}>{t('dispatcherLists.activeShort')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{total_spent.toLocaleString(locale)}</Text>
              <Text style={styles.statLabel}>{t('dispatcherLists.totalSpent')}</Text>
            </View>
          </View>
        </Card>

        {recent_orders && recent_orders.length > 0 ? (
          <Card variant="soft" style={styles.card}>
            <Text style={styles.cardTitle}>{t('dispatcherLists.recentOrders')}</Text>
            {recent_orders.map((order: Order) => {
              const advertisement =
                typeof order.advertisement === 'object' ? order.advertisement : null;
              return (
                <TouchableOpacity
                  key={order.id}
                  onPress={() =>
                    (navigation as any).navigate('DispatcherOrderDetail', { id: order.id })
                  }>
                  <View style={styles.orderItem}>
                    <Text style={styles.orderId}>
                      {t('updaterLists.orderNumber', { id: order.id })}
                    </Text>
                    {advertisement ? (
                      <Text style={styles.orderTitle} numberOfLines={1}>
                        {advertisement.title}
                      </Text>
                    ) : null}
                    <Text style={styles.orderStatus}>{order.status.name}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button
            title={t('dispatcherLists.call')}
            onPress={() => makePhoneCall(client.phone)}
            variant="primary"
          />
          <Button
            title={t('dispatcherLists.viewAllOrders')}
            onPress={() => (navigation as any).navigate('DispatcherClientOrders', { clientId })}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  scroll: { flex: 1 },
  skeletonWrap: { paddingHorizontal: spacing.lg },
  content: { paddingBottom: spacing.xxxl },
  profileCard: { alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: { color: colors.textLight, fontSize: fontSize.xxxl, fontWeight: fontWeight.bold },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  phone: { fontSize: fontSize.base, color: colors.textSecondary, marginBottom: spacing.xs },
  email: { fontSize: fontSize.sm, color: colors.textSecondary },
  statsCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  orderItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  orderId: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  orderTitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  orderStatus: { fontSize: fontSize.xs, color: colors.textTertiary },
  actions: { gap: spacing.md, paddingHorizontal: spacing.lg },
});

export default DispatcherClientDetailScreen;
