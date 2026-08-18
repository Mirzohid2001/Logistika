import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { LogistikaMap, LogistikaMarker, LogistikaPolyline } from '../../components/map';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { ordersService } from '../../services/ordersService';
import { advertisementsService } from '../../services/advertisementsService';

import { chatService } from '../../services/chatService';
import { useTranslation } from '../../hooks/useTranslation';
import { Order } from '../../types';
import { UserReputationBadge } from '../../components/UserReputationBadge';
import { TrustScoreCard } from '../../components/TrustScoreCard';
import { CustodyChainPanel } from '../../components/CustodyChainPanel';
import { TrackingSharePanel } from '../../components/TrackingSharePanel';
import { OrderDocumentsPanel } from '../../components/OrderDocumentsPanel';
import { SOSAlertPanel } from '../../components/SOSAlertPanel';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { toastService } from '../../services/toastService';
import { getMediaUrl } from '../../services/api';
import { getApiErrorMessage } from '../../services/errorService';
import { makePhoneCall } from '../../utils/phone';
import { getOrderStatusColor } from '../../utils/statusColors';
import { realtimeChannelService, RealtimeChannelHandle } from '../../services/realtimeChannelService';
import { getOrderTrackingWsUrl } from '../../config/realtimeConfig';
import { LOCATION_POST_INTERVAL_MS } from '../../services/locationTrackingService';
import { applyOrderRealtimePayload } from '../../utils/trackingUpdates';
import { spacing } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';
import { PostOrderFeedbackModal } from '../../components/PostOrderFeedbackModal';
import { usePostOrderFeedback } from '../../hooks/usePostOrderFeedback';
import { navigateRoot, navigateRoleStack } from '../../utils/navigationHelpers';
import { TrackingStatsPanel } from '../../components/TrackingStatsPanel';
import { OrderDistanceCard } from '../../components/OrderDistanceCard';
import { orderHasDistanceMetrics } from '../../utils/orderDistance';
import { DriverOrderWorkflowBar } from '../../components/DriverOrderWorkflowBar';
import { OrderNextActionCard } from '../../components/OrderNextActionCard';
import { getClientNextAction } from '../../utils/orderWorkflow';
import { handleStopAlertEvent } from '../../utils/trackingAlerts';
import { enqueueOfflineAction, isOfflineError } from '../../services/offlineActionQueue';

const ClientOrderDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = route.params as { id: number };

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reorderLoading, setReorderLoading] = useState(false);
  const channelRef = useRef<RealtimeChannelHandle | null>(null);
  const {
    feedbackVisible,
    counterparty,
    dismissFeedback,
    openRate,
    openComplaint,
  } = usePostOrderFeedback(order);

  useFocusEffect(
    useCallback(() => {
      loadOrder();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])
  );

  useEffect(() => {
    channelRef.current?.stop();
    channelRef.current = realtimeChannelService.createChannel({
      wsUrl: getOrderTrackingWsUrl(id),
      onMessage: (payload) => {
        if (payload.type === 'stop_alert' && Number(payload.order_id) === id) {
          handleStopAlertEvent(payload, { fallbackMessage: t('tracking.longStopAlertDriver') });
          loadOrder();
          return;
        }
        if (
          (payload.type === 'location_update' ||
            payload.type === 'order_status_changed' ||
            payload.type === 'order_payment_updated' ||
            payload.type === 'order_client_payment_confirmed' ||
            payload.type === 'order_client_payment_reported' ||
            payload.type === 'order_delivery_confirmed' ||
            payload.type === 'order_pod_submitted' ||
            payload.type === 'route_stop_arrived' ||
            payload.type === 'route_stop_completed') &&
          Number(payload.order_id) === id
        ) {
          setOrder((prev) => applyOrderRealtimePayload(prev, payload));
          if (payload.type === 'order_client_payment_confirmed') {
            if (payload.client_payment_confirmed === false) {
              toastService.info(t('orders.clientPaymentStatusNotReceived'));
            }
            void loadOrder();
          }
          if (payload.type === 'order_delivery_confirmed' && payload.client_delivery_confirmed === true) {
            toastService.success(t('orders.clientDeliveryConfirmed'));
            void loadOrder();
          }
          if (payload.type === 'order_pod_submitted') {
            toastService.info(t('orders.clientDeliveryConfirmHint'));
            void loadOrder();
          }
          if (payload.type === 'order_status_changed' && payload.message) {
            toastService.info(String(payload.message));
          }
          if (payload.type === 'route_stop_arrived' || payload.type === 'route_stop_completed') {
            loadOrder();
          }
        }
      },
      onPoll: () => {
        loadOrder();
      },
      pollIntervalMs: LOCATION_POST_INTERVAL_MS,
    });
    return () => {
      channelRef.current?.stop();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await ordersService.getOrder(id);
      setOrder(data);
    } catch (error: any) {
      console.error('Error loading order:', error);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleReorder = async () => {
    try {
      setReorderLoading(true);
      const ad = await advertisementsService.reorderFromOrder(id);
      toastService.success(t('features.reorder.success'));
      navigateRoleStack(navigation, 'ClientStack', 'AdvertisementDetail', { id: ad.id });
    } catch (error: any) {
      toastService.error(error?.message || t('features.reorder.failed'));
    } finally {
      setReorderLoading(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!order) {
      return;
    }
    setActionLoading(true);
    try {
      const updated = await ordersService.confirmDelivery(order.id, true);
      setOrder(updated);
      toastService.success(t('orders.clientDeliveryConfirmed'));
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('common.error')));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmClientPayment = async (paid: boolean) => {
    if (!order) {
      return;
    }
    setActionLoading(true);
    try {
      const updated = await ordersService.confirmClientPayment(order.id, paid);
      setOrder(updated);
      toastService.success(
        paid ? t('orders.clientPaymentReportedSuccess') : t('orders.clientPaymentReportedCancelled'),
      );
    } catch (error: any) {
      if (isOfflineError(error)) {
        await enqueueOfflineAction('confirm_client_payment', { orderId: order.id, paid });
        setOrder({
          ...order,
          client_paid_reported: paid,
          client_paid_reported_at: new Date().toISOString(),
        });
        toastService.info(t('offline.queuedAction'));
        return;
      }
      toastService.error(error?.response?.data?.error || t('common.error'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('orders.title')} />
        <SkeletonCard />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (!order) {
    return (
      <ScreenBackground>
        <AppHeader variant="hero" title={t('orders.title')} />
        <EmptyState
          variant="error"
          title={t('orders.loadError')}
          message={t('errors.tryAgain')}
          actionText={t('dispatcherLists.retry')}
          onActionPress={loadOrder}
        />
      </ScreenBackground>
    );
  }

  const statusColor = getOrderStatusColor(order.status.code, colors);

  const advertisement =
    typeof order.advertisement === 'object' ? order.advertisement : null;
  const driver = typeof order.driver === 'object' ? order.driver : null;
  const currentLat =
    order.current_location_lat != null
      ? (typeof order.current_location_lat === 'number'
          ? order.current_location_lat
          : parseFloat(String(order.current_location_lat)))
      : null;
  const currentLng =
    order.current_location_lng != null
      ? (typeof order.current_location_lng === 'number'
          ? order.current_location_lng
          : parseFloat(String(order.current_location_lng)))
      : null;
  const plannedRouteCoordinates = (order.planned_route_points || [])
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
    .map((point) => ({
      latitude: point.lat,
      longitude: point.lng,
    }));
  const nextAction = getClientNextAction(order);
  const handleNextActionCta = () => {
    if (nextAction?.ctaKey === 'orders.clientDeliveryConfirmButton') {
      void handleConfirmDelivery();
      return;
    }
    if (nextAction?.ctaKey === 'payments.payRemaining') {
      navigateRoot(navigation, 'CreatePayment', { orderId: order.id });
      return;
    }
    if (nextAction?.ctaKey === 'orders.clientPaymentReportPaid') {
      void handleConfirmClientPayment(true);
      return;
    }
    if (nextAction?.ctaKey !== 'orders.approveOrder') {
      return;
    }
    Alert.alert(
      t('orders.approveOrder'),
      t('orders.approveOrderConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('orders.approveOrder'),
          onPress: async () => {
            try {
              setActionLoading(true);
              const updated = await ordersService.approveOrder(order.id);
              setOrder(updated);
              Alert.alert(t('common.success'), t('orders.orderApproved'));
            } catch (error: any) {
              Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader
        variant="hero"
        title={t('orders.orderNumber', { id: order.id })}
        subtitle={order.status.name}
      />
      {order.active_sos && (
        <SOSAlertPanel
          alert={order.active_sos}
          driverPhone={driver?.phone}
          readOnly
        />
      )}
      {nextAction ? (
        <OrderNextActionCard
          action={nextAction}
          t={t}
          onPressCta={nextAction.ctaKey ? handleNextActionCta : undefined}
          onPressSecondaryCta={
            nextAction.secondaryCtaKey === 'orders.clientPaymentReportPaid'
              ? () => {
                  void handleConfirmClientPayment(true);
                }
              : undefined
          }
          ctaLoading={actionLoading}
        />
      ) : null}
      <Card variant="elevated" style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusLabel}>{t('orders.status')}:</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + '20' },
            ]}>
            <Text
              style={[styles.statusText, { color: statusColor }]}>
              {order.status.name}
            </Text>
          </View>
        </View>
        <Text style={styles.orderId}>{t('orders.title')} #{order.id}</Text>
        <View style={styles.metaChips}>
          <View style={styles.metaChip}>
            <MaterialIcons name="schedule" size={14} color={colors.textSecondary} />
            <Text style={styles.metaChipText}>{formatDate(order.created_at)}</Text>
          </View>
          {advertisement?.proposed_cost ? (
            <View style={[styles.metaChip, styles.metaChipPrimary]}>
              <MaterialIcons name="payments" size={14} color={colors.primary} />
              <Text style={[styles.metaChipText, styles.metaChipTextPrimary]}>
                {advertisement.proposed_cost.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.date}>{t('payments.createdAt')}: {formatDate(order.created_at)}</Text>
        {order.started_at && (
          <Text style={styles.date}>{t('tracking.start')}: {formatDate(order.started_at)}</Text>
        )}
        {order.completed_at && (
          <Text style={styles.date}>{t('orders.completed')}: {formatDate(order.completed_at)}</Text>
        )}
        {order.status.code === 'completed' && (
          <Button
            title={t('features.reorder.button')}
            onPress={handleReorder}
            loading={reorderLoading}
            variant="outline"
            style={{ marginTop: spacing.sm }}
          />
        )}
      </Card>

      {['pending', 'approved_by_client', 'in_progress', 'in_transit', 'completed'].includes(
        order.status.code,
      ) && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.journeyTitle')}</Text>
          <DriverOrderWorkflowBar statusCode={order.status.code} />
          <Text style={styles.journeyHint}>{t(`orders.journeyHint.${order.status.code}`)}</Text>
          <OrderDistanceCard order={order} compact={order.status.code !== 'completed'} />
        </Card>
      )}

      {advertisement && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.advertisementInfo')}</Text>
          <Text style={styles.title}>{advertisement.title}</Text>
          {advertisement.description && (
            <Text style={styles.description}>{advertisement.description}</Text>
          )}

          {advertisement.photo && (
            <View style={styles.photoContainer}>
              <Text style={styles.label}>{t('common.image')}:</Text>
              <Text style={styles.photoText}>{t('common.available')}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('orders.weight')}:</Text>
              <Text style={styles.value}>{advertisement.weight} {t('advertisements.kg')}</Text>
          </View>

          {advertisement.proposed_cost && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('orders.price')}:</Text>
              <Text style={styles.value}>
                {advertisement.proposed_cost.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm
              </Text>
            </View>
          )}

          <View style={styles.route}>
            <Text style={styles.label}>{t('tracking.route')}:</Text>
            <Text style={styles.routeText}>
              {typeof advertisement.departure_city === 'object'
                ? advertisement.departure_city.name
                : ''}{' '}
              →{' '}
              {typeof advertisement.destination_city === 'object'
                ? advertisement.destination_city.name
                : ''}
            </Text>
            <Text style={styles.address}>{advertisement.departure_address}</Text>
            <Text style={styles.address}>→ {advertisement.destination_address}</Text>
          </View>
        </Card>
      )}

      {driver && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.driver')} {t('orders.orderDetail').toLowerCase()}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('profile.firstName')}:</Text>
            <Text style={styles.value}>
              {driver.first_name} {driver.last_name}
            </Text>
          </View>
          <UserReputationBadge user={driver} />
          <TrustScoreCard user={driver} compact />
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('orders.phone')}:</Text>
            <TouchableOpacity
              onPress={() => {
                makePhoneCall(driver.phone);
              }}>
              <Text style={[styles.value, styles.phoneLink]}>{driver.phone}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.contactButtons}>
            <Button
              title={t('common.call')}
              onPress={() => {
                makePhoneCall(driver.phone);
              }}
              variant="outline"
              style={styles.contactButton}
            />
            <Button
              title={t('orders.sendMessageButton')}
              onPress={async () => {
                try {
                  const chat = await chatService.createChat(order.id);
                  navigateRoot(navigation, 'ChatDetail', { id: chat.id });
                } catch (error: any) {
                  console.error('Error creating chat:', error);
                  Alert.alert(t('common.error'), error.response?.data?.error || t('orders.createChatError'));
                }
              }}
              variant="outline"
              style={styles.contactButton}
            />
          </View>
        </Card>
      )}

      {!!order.tracking_summary?.alert_level && !!order.tracking_summary?.alert_message && (
        <Card
          style={[
            styles.card,
            order.tracking_summary.alert_level === 'critical' ? styles.alertCardCritical : styles.alertCardWarning,
          ]}>
          <Text style={styles.alertTitle}>
            {order.tracking_summary.alert_level === 'critical' ? t('tracking.criticalAlert') : t('tracking.warningAlert')}
          </Text>
          <Text style={styles.alertText}>{order.tracking_summary.alert_message}</Text>
        </Card>
      )}

      {(currentLat != null && currentLng != null) || plannedRouteCoordinates.length > 1 ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('tracking.livePreview')}</Text>
          <LogistikaMap
            style={styles.miniMap}
            scrollEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            zoomEnabled={false}
            center={{
              latitude: currentLat ?? plannedRouteCoordinates[0]?.latitude ?? 41.3111,
              longitude: currentLng ?? plannedRouteCoordinates[0]?.longitude ?? 69.2797,
            }}
            latitudeDelta={0.12}>
            {plannedRouteCoordinates.length > 1 && (
              <LogistikaPolyline
                id="planned-route"
                coordinates={plannedRouteCoordinates}
                strokeColor={colors.textTertiary}
                strokeWidth={4}
                lineDashPattern={[8, 6]}
              />
            )}
            {plannedRouteCoordinates[0] && (
              <LogistikaMarker id="pickup" coordinate={plannedRouteCoordinates[0]} color={colors.success} />
            )}
            {plannedRouteCoordinates[plannedRouteCoordinates.length - 1] && (
              <LogistikaMarker
                id="destination"
                coordinate={plannedRouteCoordinates[plannedRouteCoordinates.length - 1]}
                color={colors.logisticsAccent}
              />
            )}
            {currentLat != null && currentLng != null && (
              <LogistikaMarker
                id="driver"
                coordinate={{ latitude: currentLat, longitude: currentLng }}
                color={colors.primary}
              />
            )}
          </LogistikaMap>
          {orderHasDistanceMetrics(order) && <TrackingStatsPanel order={order} compact />}
          {['approved_by_client', 'in_progress', 'in_transit'].includes(order.status.code) && (
            <Button
              title={t('tracking.viewFullTracking')}
              onPress={() => navigateRoleStack(navigation, 'ClientStack', 'ClientOrderTracking', { id: order.id })}
              variant="primary"
              style={styles.trackingButton}
            />
          )}
        </Card>
      ) : null}

      {(['approved_by_client', 'in_progress', 'in_transit'].includes(order.status.code) ||
        (order.current_location_lat && order.current_location_lng)) && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.driverLocation')}</Text>
          {order.current_location_lat && order.current_location_lng ? (
            <>
              <Text style={styles.value}>
                {order.current_location_lat}, {order.current_location_lng}
              </Text>
              <Text style={styles.note}>
                {t('orders.driverLocationRealTime')}
              </Text>
            </>
          ) : (
            <Text style={styles.note}>
              {t('orders.driverNotStarted')}
            </Text>
          )}
          <Button
            title={t('orders.tracking')}
            onPress={() =>
              (navigation as any).navigate('ClientOrderTracking', { id: order.id })
            }
            variant="primary"
            style={styles.trackButton}
          />
        </Card>
      )}

      {(['approved_by_client', 'in_progress', 'in_transit'].includes(order.status.code) ||
        (order.current_location_lat && order.current_location_lng)) && (
        <TrackingSharePanel
          orderId={order.id}
          existingToken={order.tracking_share?.token}
          title={t('tracking.shareEtaLink')}
        />
      )}

      {(order.status.code === 'completed' ||
        order.status.code === 'in_transit' ||
        order.status.code === 'in_progress' ||
        (order.documents && order.documents.length > 0)) && (
        <OrderDocumentsPanel
          orderId={order.id}
          documents={order.documents}
          onDocumentsChange={(documents) =>
            setOrder((prev) => (prev ? { ...prev, documents } : prev))
          }
        />
      )}

      {order.status.code === 'pending' && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.approveOrder')}</Text>
          <Text style={styles.approveText}>
            {t('orders.approveOrderMessage')}
          </Text>
          <Button
            title={t('orders.approveOrder')}
            loading={actionLoading}
            onPress={async () => {
              Alert.alert(
                t('orders.approveOrder'),
                t('orders.approveOrderConfirm'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('orders.approveOrder'),
                    onPress: async () => {
                      try {
                        setActionLoading(true);
                        const updated = await ordersService.approveOrder(order.id);
                        setOrder(updated);
                        Alert.alert(t('common.success'), t('orders.orderApproved'));
                      } catch (error: any) {
                        Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
                      } finally {
                        setActionLoading(false);
                      }
                    },
                  },
                ]
              );
            }}
            variant="primary"
            style={styles.approveButton}
          />
          <Button
            title={t('orders.scanQrApprove')}
            onPress={() => (navigation as any).navigate('QRCodeScanner', { mode: 'approve' })}
            variant="outline"
            style={styles.approveButton}
          />
          <Button
            title={t('orders.declineOrder')}
            loading={actionLoading}
            onPress={async () => {
              Alert.alert(
                t('orders.declineOrder'),
                t('orders.declineOrderConfirm'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('orders.declineOrder'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        setActionLoading(true);
                        const updated = await ordersService.declineOrder(order.id);
                        setOrder(updated);
                        Alert.alert(t('common.success'), t('orders.orderDeclined'));
                      } catch (error: any) {
                        Alert.alert(t('common.error'), error.message || error.response?.data?.error || t('common.error'));
                      } finally {
                        setActionLoading(false);
                      }
                    },
                  },
                ],
              );
            }}
            variant="outline"
            style={styles.declineButton}
          />
        </Card>
      )}

      {!!order.proof_of_delivery && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.podTitle')}</Text>
          <Text style={styles.podMetaText}>
            {t('orders.podReceiver')}: {order.proof_of_delivery.receiver_name}
          </Text>
          <Text style={styles.podMetaText}>
            {t('orders.podGeotag')}: {order.proof_of_delivery.delivered_lat.toFixed(6)},{' '}
            {order.proof_of_delivery.delivered_lng.toFixed(6)}
          </Text>
          <Text style={styles.podMetaText}>
            {t('orders.time')}: {formatDate(order.proof_of_delivery.delivered_at)}
          </Text>
          {!!order.proof_of_delivery.note && (
            <Text style={styles.podMetaText}>{order.proof_of_delivery.note}</Text>
          )}
          {!!order.proof_of_delivery.delivery_photo && (
            <Image
              source={{
                uri: getMediaUrl(order.proof_of_delivery.delivery_photo) || order.proof_of_delivery.delivery_photo,
              }}
              style={styles.podPhotoPreview}
            />
          )}
          {order.status.code === 'in_transit' && (
            <>
              <Text style={styles.podMetaText}>
                {order.client_delivery_confirmed === true
                  ? t('orders.clientDeliveryConfirmed')
                  : t('orders.clientDeliveryConfirmHint')}
              </Text>
              {order.client_delivery_confirmed !== true && (
                <Button
                  title={t('orders.clientDeliveryConfirmButton')}
                  onPress={() => {
                    void handleConfirmDelivery();
                  }}
                  loading={actionLoading}
                  variant="primary"
                  style={styles.approveButton}
                />
              )}
            </>
          )}
        </Card>
      )}

      <CustodyChainPanel events={order.custody_events} language={currentLanguage} />

      {driver && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('ratings.title')} / {t('complaints.title')}</Text>
          {order.status.code === 'completed' && (
            <>
              <Text style={styles.approveText}>{t('orders.orderCompletedMessage')}</Text>
              <Button
                title={`⭐ ${t('ratings.title')}`}
                onPress={() => {
                  navigateRoot(navigation, 'Rating', { orderId: order.id });
                }}
                variant="primary"
                style={styles.approveButton}
              />
            </>
          )}
          {['in_progress', 'in_transit', 'completed'].includes(order.status.code) && (
          <Button
            title={t('complaints.fileComplaint')}
            onPress={() => {
              navigateRoot(navigation, 'Complaint', { orderId: order.id });
            }}
            variant="outline"
            style={styles.approveButton}
          />
          )}
        </Card>
      )}

      <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('chat.title')}</Text>
        <Button
          title={t('orders.sendMessageButton')}
          onPress={async () => {
            try {
              const chat = await chatService.createChat(order.id);
              navigateRoot(navigation, 'ChatDetail', { id: chat.id });
            } catch (error: any) {
              console.error('Error creating chat:', error);
              Alert.alert(t('common.error'), error.response?.data?.error || t('orders.createChatError'));
            }
          }}
          variant="primary"
          style={styles.chatButton}
        />
      </Card>

      {['in_progress', 'in_transit', 'completed'].includes(order.status.code) && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('orders.clientPaymentStatusTitle')}</Text>
          <Text style={styles.offlinePaymentHint}>{t('orders.clientPaymentStatusHint')}</Text>
          {order.total_amount !== undefined && order.total_amount > 0 && (
            <View style={styles.paymentSummaryRow}>
              <Text style={styles.paymentSummaryLabel}>{t('orders.agreedAmount')}:</Text>
              <Text style={styles.paymentSummaryValue}>
                {order.total_amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm
              </Text>
            </View>
          )}
          <Text style={styles.offlinePaymentStatus}>
            {order.client_payment_confirmed === true
              ? t('orders.clientPaymentStatusReceived')
              : order.client_payment_confirmed === false
                ? t('orders.clientPaymentStatusNotReceived')
                : order.client_paid_reported === true
                  ? t('orders.clientPaymentStatusReported')
                  : t('orders.clientPaymentStatusPending')}
          </Text>
          {['in_progress', 'in_transit'].includes(order.status.code) && (
            <View style={styles.offlinePaymentButtons}>
              {(order.remaining_amount ?? 0) > 0 && !order.is_fully_paid && (
                <Button
                  title={t('payments.payRemaining')}
                  onPress={() => {
                    navigateRoot(navigation, 'CreatePayment', { orderId: order.id });
                  }}
                  variant="primary"
                  style={styles.offlinePaymentButton}
                />
              )}
              <Button
                title={t('orders.clientPaymentReportPaid')}
                onPress={() => {
                  void handleConfirmClientPayment(true);
                }}
                loading={actionLoading}
                variant={order.client_paid_reported === true ? 'primary' : 'outline'}
                style={styles.offlinePaymentButton}
              />
              <Button
                title={t('orders.openChatToPay')}
                onPress={async () => {
                  try {
                    const chat = await chatService.createChat(order.id);
                    navigateRoot(navigation, 'ChatDetail', { id: chat.id });
                  } catch (error: any) {
                    toastService.error(error?.response?.data?.error || t('orders.createChatError'));
                  }
                }}
                variant="outline"
                style={styles.offlinePaymentButton}
              />
              <Button
                title={t('payments.myPayments')}
                onPress={() => {
                  navigateRoot(navigation, 'Payments', { orderId: order.id });
                }}
                variant="outline"
                style={styles.offlinePaymentButton}
              />
            </View>
          )}
        </Card>
      )}
      <PostOrderFeedbackModal
        visible={feedbackVisible}
        counterparty={counterparty}
        onRate={openRate}
        onComplaint={openComplaint}
        onDismiss={dismissFeedback}
      />
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
    paddingBottom: spacing.xxxl + 24,
  },
  statusCard: {
    marginBottom: 16,
    backgroundColor: colors.backgroundSecondary,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  orderId: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.backgroundTertiary,
  },
  metaChipPrimary: {
    backgroundColor: colors.primaryGlow,
  },
  metaChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metaChipTextPrimary: {
    color: colors.primary,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  journeyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  photoContainer: {
    marginBottom: 16,
  },
  photoText: {
    fontSize: 14,
    color: colors.primary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  value: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  route: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  routeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  trackButton: {
    marginTop: 12,
  },
  etaChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  etaChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  etaChipActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  etaChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  etaChipTextActive: {
    color: colors.primary,
  },
  lastLinkText: {
    marginTop: 8,
    fontSize: 11,
    color: colors.textTertiary,
  },
  paymentItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  paymentStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentMethod: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  paymentDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  paymentButton: {
    marginTop: 16,
  },
  paymentUrgentCard: {
    backgroundColor: colors.warningGlow,
    borderColor: `${colors.warning}66`,
    borderWidth: 1,
  },
  paymentUrgentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.warning,
    marginBottom: 8,
  },
  paymentUrgentHint: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  approveText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  approveButton: {
    marginTop: 0,
  },
  declineButton: {
    marginTop: spacing.sm,
  },
  note: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  miniMap: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 12,
  },
  trackingButton: {
    marginTop: spacing.sm,
  },
  trackingGrid: {
    gap: 6,
  },
  trackingMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  alertCardWarning: {
    backgroundColor: colors.warningGlow,
    borderWidth: 1,
    borderColor: `${colors.warning}66`,
  },
  alertCardCritical: {
    backgroundColor: colors.dangerGlow,
    borderWidth: 1,
    borderColor: `${colors.danger}66`,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 6,
  },
  alertText: {
    fontSize: 14,
    color: colors.danger,
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  chatButton: {
    marginTop: 12,
  },
  phoneLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  contactButton: {
    flex: 1,
    marginTop: 0,
  },
  paymentSummary: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  paymentSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentSummaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  paymentSummaryValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '700',
  },
  paidAmount: {
    color: colors.success,
  },
  remainingAmount: {
    color: colors.danger,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  warningBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.warningGlow,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningText: {
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
  },
  paymentsListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 12,
  },
  qrCodeSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  qrCodeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  qrCodeDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  qrCodeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scanButton: {
    marginTop: 0,
  },
  podPhotoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginTop: 12,
    backgroundColor: colors.border,
  },
  podMetaText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 6,
  },
  offlinePaymentHint: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  offlinePaymentStatus: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginVertical: 12,
  },
  offlinePaymentButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  offlinePaymentButton: {
    flex: 1,
  },
});

export default ClientOrderDetailScreen;
