import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { complaintsService } from '../services/complaintsService';
import { ordersService } from '../services/ordersService';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { AppHeader } from '../components/AppHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { SkeletonCard } from '../components/Skeleton';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
const CATEGORIES = ['payment', 'behavior', 'cargo_damage', 'communication', 'other'] as const;

const ComplaintScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { orderId } = route.params as { orderId: number };

  const [order, setOrder] = useState<Order | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('other');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await ordersService.getOrder(orderId);
      setOrder(data);
    } catch {
      Alert.alert(t('common.error'), t('orders.orderNotLoaded'));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (description.trim().length < 10) {
      Alert.alert(t('common.error'), t('complaints.descriptionMin'));
      return;
    }
    if (!order || !user) {return;}

    const driver = typeof order.driver === 'object' ? order.driver : null;
    const client = typeof order.client === 'object' ? order.client : null;
    if (!driver || !client) {
      Alert.alert(t('common.error'), t('orders.orderNotLoaded'));
      return;
    }

    let toUserId: number | null = null;
    if (user.id === client.id) {toUserId = driver.id;}
    else if (user.id === driver.id) {toUserId = client.id;}
    else {
      Alert.alert(t('common.error'), t('complaints.notParticipant'));
      return;
    }

    try {
      setSubmitting(true);
      await complaintsService.createComplaint({
        order_id: orderId,
        to_user_id: toUserId,
        category,
        description: description.trim(),
      });
      Alert.alert(t('common.success'), t('complaints.submitted'));
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !order) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('complaints.title')} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
        </View>
      </ScreenBackground>
    );
  }

  const opponent =
    user?.id === (typeof order.client === 'object' ? order.client.id : order.client)
      ? typeof order.driver === 'object'
        ? order.driver
        : null
      : typeof order.client === 'object'
        ? order.client
        : null;

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={t('complaints.title')} subtitle={t('complaints.hint')} />
        <Card variant="soft" style={styles.card}>
        <Text style={styles.title}>{t('complaints.title')}</Text>
        <Text style={styles.subtitle}>
          {t('complaints.orderLabel')} #{order.id}
          {opponent ? ` — ${opponent.first_name} ${opponent.last_name}` : ''}
        </Text>
        <Text style={styles.hint}>{t('complaints.hint')}</Text>
      </Card>

      <Card variant="soft" style={styles.card}>
        <Text style={styles.label}>{t('complaints.category')}</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.categoryChip, category === item && styles.categoryChipActive]}
              onPress={() => setCategory(item)}>
              <Text
                style={[
                  styles.categoryChipText,
                  category === item && styles.categoryChipTextActive,
                ]}>
                {t(`complaints.categories.${item}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{t('complaints.description')}</Text>
        <TextInput
          style={styles.input}
          multiline
          numberOfLines={5}
          value={description}
          onChangeText={setDescription}
          placeholder={t('complaints.descriptionPlaceholder')}
          textAlignVertical="top"
        />
      </Card>

      <Button
        title={t('complaints.submit')}
        onPress={handleSubmit}
        loading={submitting}
        variant="primary"
      />
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  scroll: {
    flex: 1,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  card: {
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  categoryChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  categoryChipText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 120,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.backgroundSecondary,
  },
});

export default ComplaintScreen;
