import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ratingsService } from '../services/ratingsService';
import { ordersService } from '../services/ordersService';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { AppHeader } from '../components/AppHeader';
import { ScreenBackground } from '../components/ScreenBackground';
import { SkeletonCard } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useTranslation } from '../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import type { AppColors } from '../theme/colors';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';

const RatingScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { orderId } = route.params as { orderId: number };

  const [order, setOrder] = useState<Order | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await ordersService.getOrder(orderId);
      setOrder(data);
    } catch (error) {
      console.error('Error loading order:', error);
      setOrder(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (selectedRating === 0) {
      Alert.alert(t('common.error'), t('ratings.selectRating'));
      return;
    }

    if (!order || !user) {
      Alert.alert(t('common.error'), t('ratings.incompleteData'));
      return;
    }

    const driver = typeof order.driver === 'object' ? order.driver : null;
    const client = typeof order.client === 'object' ? order.client : null;

    if (!driver || !client) {
      Alert.alert(t('common.error'), t('ratings.incompleteData'));
      return;
    }

    let toUserId: number | null = null;

    if (user.id === client.id) {
      toUserId = driver.id;
    } else if (user.id === driver.id) {
      toUserId = client.id;
    } else {
      Alert.alert(t('common.error'), t('complaints.notParticipant'));
      return;
    }

    try {
      setSubmitting(true);
      await ratingsService.createRating({
        order_id: orderId,
        to_user_id: toUserId,
        rating: selectedRating,
        comment: comment.trim() || undefined,
      });

      Alert.alert(t('common.success'), t('ratings.submitSuccess'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error.response?.data?.error || t('ratings.submitError')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('ratings.title')} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
        </View>
      </ScreenBackground>
    );
  }

  if (loadFailed || !order) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('ratings.title')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('ratings.loadError')}
          actionText={t('common.retry')}
          onActionPress={loadOrder}
        />
      </ScreenBackground>
    );
  }

  const driver = typeof order.driver === 'object' ? order.driver : null;
  const client = typeof order.client === 'object' ? order.client : null;

  let toUser = null;
  if (user) {
    if (user.id === client?.id) {
      toUser = driver;
    } else if (user.id === driver?.id) {
      toUser = client;
    }
  }

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={t('ratings.title')} />

        <Card variant="soft" style={styles.card}>
          <Text style={styles.cardTitle}>{t('ratings.orderInfo')}</Text>
          <Text style={styles.orderId}>
            {t('updaterLists.orderNumber', { id: order.id })}
          </Text>
          {toUser && (
            <Text style={styles.userName}>
              {toUser.first_name} {toUser.last_name}
            </Text>
          )}
        </Card>

        <Card variant="soft" style={styles.card}>
          <Text style={styles.cardTitle}>{t('ratings.rate')}</Text>
          <Text style={styles.label}>{t('ratings.howManyStars')}</Text>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                style={styles.starButton}
                onPress={() => setSelectedRating(star)}>
                <MaterialIcons
                  name={star <= selectedRating ? 'star' : 'star-border'}
                  size={40}
                  color={star <= selectedRating ? colors.rating : colors.border}
                />
              </TouchableOpacity>
            ))}
          </View>
          {selectedRating > 0 && (
            <Text style={styles.ratingText}>
              {t('ratings.starsCount', { count: selectedRating })}
            </Text>
          )}
        </Card>

        <Card variant="soft" style={styles.card}>
          <Text style={styles.cardTitle}>{t('ratings.commentOptional')}</Text>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder={t('ratings.commentPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            maxLength={1000}
          />
          <Text style={styles.charCount}>{comment.length}/1000</Text>
        </Card>

        <Button
          title={t('ratings.submitRating')}
          onPress={handleSubmit}
          loading={submitting}
          variant="primary"
          style={styles.submitButton}
          disabled={selectedRating === 0}
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
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  orderId: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  userName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  starButton: {
    padding: spacing.sm,
  },
  ratingText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    textAlign: 'center',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: colors.inputBackground,
  },
  charCount: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
});

export default RatingScreen;
