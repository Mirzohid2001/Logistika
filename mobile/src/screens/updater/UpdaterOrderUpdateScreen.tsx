import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { ordersService } from '../../services/ordersService';
import { Order } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';
import { SkeletonCard } from '../../components/Skeleton';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';

const UpdaterOrderUpdateScreen = () => {
  const styles = useThemedStyles(createStyles);
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { id } = route.params as { id: number };

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateType, setUpdateType] = useState<'status' | 'location' | 'payment' | 'bulk'>('status');
  const [statusCode, setStatusCode] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await ordersService.getOrder(id);
      setOrder(data);
      if (data.status) {
        setStatusCode(data.status.code);
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('updaterLists.loadOrderError'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      if (updateType === 'status') {
        await updaterService.updateStatus(id, statusCode, description);
      } else if (updateType === 'location') {
        if (!lat || !lng) {
          Alert.alert(t('common.error'), t('updaterLists.enterCoordinates'));
          setUpdating(false);
          return;
        }
        await updaterService.updateLocation(id, parseFloat(lat), parseFloat(lng), description);
      } else if (updateType === 'payment') {
        await updaterService.updatePayment(id, paymentStatus, description);
      } else if (updateType === 'bulk') {
        const data: Record<string, unknown> = {};
        if (statusCode) {data.status_code = statusCode;}
        if (lat && lng) {
          data.lat = parseFloat(lat);
          data.lng = parseFloat(lng);
        }
        if (paymentStatus) {data.payment_status = paymentStatus;}
        if (description) {data.description = description;}
        await updaterService.bulkUpdate(id, data);
      }
      Alert.alert(t('common.success'), t('updaterLists.updateSuccess'), [
        {
          text: 'OK',
          onPress: () => {
            loadOrder();
            navigation.goBack();
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !order) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('updaterLists.updateOrderTitle')} />
        <View style={styles.skeletonWrap}>
          <SkeletonCard />
        </View>
      </ScreenBackground>
    );
  }

  const updateTypes = ['status', 'location', 'payment', 'bulk'] as const;
  const statusOptions = [
    { label: 'Pending', value: 'pending' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'In Transit', value: 'in_transit' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ];
  const paymentOptions = [
    { label: 'Pending', value: 'pending' },
    { label: 'Processing', value: 'processing' },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed', value: 'failed' },
  ];

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppHeader variant="hero" title={t('updaterLists.updateOrderTitle')} />
        <Card variant="soft" style={styles.card}>
          <Text style={styles.cardTitle}>{t('updaterLists.orderNumber', { id: order.id })}</Text>
          <Text style={styles.statusText}>
            {t('updaterLists.orderStatus', { status: order.status.name })}
          </Text>
        </Card>

        <Card variant="soft" style={styles.card}>
          <Text style={styles.cardTitle}>{t('updaterLists.updateType')}</Text>
          <View style={styles.optionsContainer}>
            {updateTypes.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.optionButton, updateType === type && styles.optionButtonActive]}
                onPress={() => setUpdateType(type)}>
                <Text style={[styles.optionText, updateType === type && styles.optionTextActive]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {(updateType === 'status' || updateType === 'bulk') && (
          <Card variant="soft" style={styles.card}>
            <Text style={styles.cardTitle}>{t('updaterLists.statusUpdates')}</Text>
            <View style={styles.optionsContainer}>
              {statusOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    statusCode === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setStatusCode(option.value)}>
                  <Text
                    style={[
                      styles.optionText,
                      statusCode === option.value && styles.optionTextActive,
                    ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {(updateType === 'location' || updateType === 'bulk') && (
          <Card variant="soft" style={styles.card}>
            <Text style={styles.cardTitle}>{t('updaterLists.locationUpdates')}</Text>
            <Input label="Latitude" value={lat} onChangeText={setLat} placeholder="41.3111" keyboardType="numeric" />
            <Input label="Longitude" value={lng} onChangeText={setLng} placeholder="69.2797" keyboardType="numeric" />
          </Card>
        )}

        {(updateType === 'payment' || updateType === 'bulk') && (
          <Card variant="soft" style={styles.card}>
            <Text style={styles.cardTitle}>{t('updaterLists.paymentUpdates')}</Text>
            <View style={styles.optionsContainer}>
              {paymentOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    paymentStatus === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setPaymentStatus(option.value)}>
                  <Text
                    style={[
                      styles.optionText,
                      paymentStatus === option.value && styles.optionTextActive,
                    ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        <Card variant="soft" style={styles.card}>
          <Input
            label={t('updaterLists.descriptionOptional')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('updaterLists.descriptionPlaceholder')}
            multiline
          />
        </Card>

        <Button
          title={t('updaterLists.update')}
          onPress={handleUpdate}
          loading={updating}
          variant="primary"
          style={styles.updateButton}
        />
      </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  scroll: { flex: 1 },
  skeletonWrap: { paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: { marginBottom: spacing.lg },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  statusText: { fontSize: fontSize.sm, color: colors.textSecondary },
  optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
  },
  optionButtonActive: { backgroundColor: colors.primary },
  optionText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.semibold },
  optionTextActive: { color: colors.textLight },
  updateButton: { marginTop: spacing.sm },
});

export default UpdaterOrderUpdateScreen;
