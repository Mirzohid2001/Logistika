import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { updaterService } from '../../services/updaterService';
import { Order } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { fontSize, fontWeight } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';

const UpdaterBulkOperationsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'update_status' | 'update_location' | 'update_payment'>('update_status');
  const [statusCode, setStatusCode] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [description, setDescription] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await updaterService.getPendingUpdates();
      setOrders(data);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  const toggleOrderSelection = (orderId: number) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  const handleBulkOperation = async () => {
    if (selectedOrders.length === 0) {
      Alert.alert(t('common.error'), t('updaterLists.bulkSelectOrders'));
      return;
    }

    if (action === 'update_status' && !statusCode) {
      Alert.alert(t('common.error'), t('updaterLists.bulkEnterStatus'));
      return;
    }

    if (action === 'update_location' && (!lat || !lng)) {
      Alert.alert(t('common.error'), t('updaterLists.bulkEnterCoordinates'));
      return;
    }

    if (action === 'update_payment' && !paymentStatus) {
      Alert.alert(t('common.error'), t('updaterLists.bulkEnterPaymentStatus'));
      return;
    }

    setProcessing(true);
    try {
      const result = await updaterService.bulkOperations({
        order_ids: selectedOrders,
        action,
        status_code: statusCode || undefined,
        lat: lat ? parseFloat(lat) : undefined,
        lng: lng ? parseFloat(lng) : undefined,
        payment_status: paymentStatus || undefined,
        description: description || undefined,
      });

      const successCount = result.success?.length || 0;
      const failedCount = result.failed?.length || 0;

      Alert.alert(
        t('updaterLists.bulkResultTitle'),
        t('updaterLists.bulkResultMessage', { success: successCount, failed: failedCount }),
        [
          {
            text: t('common.ok'),
            onPress: () => {
              setSelectedOrders([]);
              loadOrders();
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('updaterLists.bulkError'));
    } finally {
      setProcessing(false);
    }
  };

  const getStatusColor = (statusCode: string) => {
    switch (statusCode) {
      case 'pending':
        return colors.primary;
      case 'in_progress':
        return colors.warning;
      case 'completed':
        return colors.success;
      case 'cancelled':
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: Order }) => {
    const isSelected = selectedOrders.includes(item.id);
    const advertisement =
      typeof item.advertisement === 'object' ? item.advertisement : null;

    return (
      <TouchableOpacity onPress={() => toggleOrderSelection(item.id)}>
        <Card style={[styles.orderCard, isSelected && styles.orderCardSelected]}>
          <View style={styles.orderHeader}>
            <View style={styles.checkbox}>
              {isSelected && (
                <MaterialIcons name="check-circle" size={24} color={colors.primary} />
              )}
              {!isSelected && (
                <MaterialIcons name="radio-button-unchecked" size={24} color={colors.textTertiary} />
              )}
            </View>
            <View style={styles.orderInfo}>
              <Text style={styles.orderId}>{t('dispatcherLists.bulkOrderLabel', { id: item.id })}</Text>
              {advertisement && (
                <Text style={styles.orderTitle} numberOfLines={1}>
                  {advertisement.title}
                </Text>
              )}
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(item.status.code) + '20' },
                ]}>
                <Text
                  style={[styles.statusText, { color: getStatusColor(item.status.code) }]}>
                  {item.status.name}
                </Text>
              </View>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader
        title={t('dispatcherOps.openBulk')}
        subtitle={t('dispatcherLists.bulkSelectAction')}
      />
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Card style={styles.actionCard}>
          <Text style={styles.cardTitle}>{t('dispatcherLists.bulkSelectAction')}</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, action === 'update_status' && styles.actionButtonActive]}
              onPress={() => setAction('update_status')}>
              <Text
                style={[styles.actionButtonText, action === 'update_status' && styles.actionButtonTextActive]}>
                {t('updaterLists.statusUpdates')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, action === 'update_location' && styles.actionButtonActive]}
              onPress={() => setAction('update_location')}>
              <Text
                style={[styles.actionButtonText, action === 'update_location' && styles.actionButtonTextActive]}>
                {t('updaterLists.locationUpdates')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, action === 'update_payment' && styles.actionButtonActive]}
              onPress={() => setAction('update_payment')}>
              <Text
                style={[styles.actionButtonText, action === 'update_payment' && styles.actionButtonTextActive]}>
                {t('updaterLists.paymentUpdates')}
              </Text>
            </TouchableOpacity>
          </View>

          {action === 'update_status' && (
            <Input
              label={t('updaterLists.bulkStatusCodeLabel')}
              value={statusCode}
              onChangeText={setStatusCode}
              placeholder={t('updaterLists.bulkStatusCodePlaceholder')}
              style={styles.input}
            />
          )}

          {action === 'update_location' && (
            <>
              <Input
                label={t('updaterLists.bulkLatLabel')}
                value={lat}
                onChangeText={setLat}
                placeholder="41.2995"
                keyboardType="numeric"
                style={styles.input}
              />
              <Input
                label={t('updaterLists.bulkLngLabel')}
                value={lng}
                onChangeText={setLng}
                placeholder="69.2401"
                keyboardType="numeric"
                style={styles.input}
              />
            </>
          )}

          {action === 'update_payment' && (
            <Input
              label={t('updaterLists.bulkPaymentStatusLabel')}
              value={paymentStatus}
              onChangeText={setPaymentStatus}
              placeholder={t('updaterLists.bulkPaymentStatusPlaceholder')}
              style={styles.input}
            />
          )}

          <Input
            label={t('updaterLists.descriptionOptional')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('updaterLists.descriptionPlaceholder')}
            multiline
            style={styles.input}
          />
        </Card>

        <View style={styles.selectedInfo}>
          <Text style={styles.selectedText}>
            {t('dispatcherOps.selectedCount', { count: selectedOrders.length })}
          </Text>
          {selectedOrders.length > 0 && (
            <TouchableOpacity onPress={() => setSelectedOrders([])}>
              <Text style={styles.clearText}>{t('dispatcherLists.bulkClear')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          scrollEnabled={false}
          ListEmptyComponent={
            <Card>
              <Text style={styles.emptyText}>{t('dispatcherLists.bulkNoOrders')}</Text>
            </Card>
          }
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={t('updaterLists.bulkExecuteUpdate', { count: selectedOrders.length })}
          onPress={handleBulkOperation}
          loading={processing}
          variant="primary"
          disabled={selectedOrders.length === 0}
        />
      </View>
    </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  actionCard: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  actionButtonActive: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  actionButtonTextActive: {
    color: colors.textLight,
  },
  input: {
    marginBottom: 12,
  },
  selectedInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  selectedText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  clearText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  orderCard: {
    marginBottom: 12,
  },
  orderCardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
  },
  orderInfo: {
    flex: 1,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  orderTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: {
    backgroundColor: colors.backgroundSecondary,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

export default UpdaterBulkOperationsScreen;
