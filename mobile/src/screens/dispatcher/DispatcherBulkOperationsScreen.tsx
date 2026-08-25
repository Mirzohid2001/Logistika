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
import { dispatcherService } from '../../services/dispatcherService';
import { Order } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';

const DispatcherBulkOperationsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'assign' | 'cancel' | 'reassign'>('assign');
  const [driverId, setDriverId] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dispatcherService.getOrders({ status: 'active' });
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
      Alert.alert(t('common.error'), t('dispatcherLists.bulkSelectOrders'));
      return;
    }

    if ((action === 'assign' || action === 'reassign') && !driverId) {
      Alert.alert(t('common.error'), t('dispatcherLists.bulkEnterDriverId'));
      return;
    }

    setProcessing(true);
    try {
      const result = await dispatcherService.bulkOperations({
        order_ids: selectedOrders,
        action,
        driver_id: driverId ? parseInt(driverId, 10) : undefined,
        notes: notes || undefined,
      });

      const successCount = result.success?.length || 0;
      const failedCount = result.failed?.length || 0;

      Alert.alert(
        t('dispatcherLists.bulkResultTitle'),
        t('dispatcherLists.bulkResultMessage', { success: successCount, failed: failedCount }),
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
      Alert.alert(t('common.error'), error.response?.data?.error || t('dispatcherLists.bulkError'));
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
              style={[styles.actionButton, action === 'assign' && styles.actionButtonActive]}
              onPress={() => setAction('assign')}>
              <Text
                style={[styles.actionButtonText, action === 'assign' && styles.actionButtonTextActive]}>
                {t('dispatcherOps.bulkAssign')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, action === 'cancel' && styles.actionButtonActive]}
              onPress={() => setAction('cancel')}>
              <Text
                style={[styles.actionButtonText, action === 'cancel' && styles.actionButtonTextActive]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, action === 'reassign' && styles.actionButtonActive]}
              onPress={() => setAction('reassign')}>
              <Text
                style={[styles.actionButtonText, action === 'reassign' && styles.actionButtonTextActive]}>
                {t('dispatcherOps.bulkReassign')}
              </Text>
            </TouchableOpacity>
          </View>

          {(action === 'assign' || action === 'reassign') && (
            <Input
              label={t('dispatcherOps.driverIdLabel')}
              value={driverId}
              onChangeText={setDriverId}
              placeholder={t('dispatcherOps.driverIdPlaceholder')}
              keyboardType="numeric"
              style={styles.input}
            />
          )}

          <Input
            label={t('dispatcherOps.notesOptional')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('dispatcherOps.notesPlaceholder')}
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
          title={
            action === 'assign'
              ? t('dispatcherOps.bulkExecuteAssign', { count: selectedOrders.length })
              : action === 'cancel'
                ? t('dispatcherOps.bulkExecuteCancel', { count: selectedOrders.length })
                : t('dispatcherOps.bulkExecuteReassign', { count: selectedOrders.length })
          }
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
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
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

export default DispatcherBulkOperationsScreen;
