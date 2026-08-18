import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { LogistikaMap, LogistikaMarker, LogistikaPolyline } from '../../components/map';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { ordersService } from '../../services/ordersService';
import { stopActiveOrderLocationSession, startActiveOrderLocationSession } from '../../services/activeOrderLocationSession';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import Geolocation from 'react-native-geolocation-service';
import { ensureBackgroundLocationPermission } from '../../services/locationTrackingService';

// Dynamic import for QRCode to handle missing package
let QRCode: any = null;
try {
  QRCode = require('react-native-qrcode-svg').default;
} catch (error) {
  console.warn('react-native-qrcode-svg not available');
}
import { useTranslation } from '../../hooks/useTranslation';
import { Order } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { makePhoneCall } from '../../utils/phone';
import { chatService } from '../../services/chatService';
import { getMediaUrl } from '../../services/api';
import { toastService } from '../../services/toastService';
import { getApiErrorMessage, ErrorCode, AppError } from '../../services/errorService';
import { realtimeChannelService, RealtimeChannelHandle } from '../../services/realtimeChannelService';
import { getOrderTrackingWsUrl } from '../../config/realtimeConfig';
import { LOCATION_POST_INTERVAL_MS } from '../../services/locationTrackingService';
import { applyOrderRealtimePayload } from '../../utils/trackingUpdates';
import { TrackingStatsPanel } from '../../components/TrackingStatsPanel';
import { OrderDistanceCard } from '../../components/OrderDistanceCard';
import { orderHasDistanceMetrics } from '../../utils/orderDistance';
import { openYandexNavigatorToAddress } from '../../utils/navigationLinks';
import { canFinishTrip, isOrderApprovedForDriver } from '../../utils/orderRoute';
import {
  formatDisplayAddress,
  getDriverNextAction,
  shouldShowDestinationNavigation,
  shouldShowPickupNavigation,
} from '../../utils/orderWorkflow';
import { getOrderStatusColor } from '../../utils/statusColors';
import { DriverOrderWorkflowBar } from '../../components/DriverOrderWorkflowBar';
import { OrderNextActionCard } from '../../components/OrderNextActionCard';
import { UserReputationBadge } from '../../components/UserReputationBadge';
import { TrustScoreCard } from '../../components/TrustScoreCard';
import { CustodyChainPanel } from '../../components/CustodyChainPanel';
import { CustodyLogForm } from '../../components/CustodyLogForm';
import { TrackingSharePanel } from '../../components/TrackingSharePanel';
import { OrderDocumentsPanel } from '../../components/OrderDocumentsPanel';
import { SOSButton } from '../../components/SOSButton';
import { spacing } from '../../theme';
import { useThemedStyles, type AppColors } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { PostOrderFeedbackModal } from '../../components/PostOrderFeedbackModal';
import { usePostOrderFeedback } from '../../hooks/usePostOrderFeedback';
import { navigateRoot } from '../../utils/navigationHelpers';
import { handleStopAlertEvent } from '../../utils/trackingAlerts';
import { getSortedRouteStops, hydrateRouteStopCoordinates } from '../../utils/routeStops';

const OrderDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { id } = route.params as { id: number };

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverSignature, setReceiverSignature] = useState('');
  const [podNote, setPodNote] = useState('');
  const [podPhoto, setPodPhoto] = useState<{ uri: string; type?: string; fileName?: string } | null>(null);
  const [podLocation, setPodLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [podSubmitting, setPodSubmitting] = useState(false);
  const [podErrors, setPodErrors] = useState<{
    receiverName?: string;
    receiverSignature?: string;
    podLocation?: string;
    podPhoto?: string;
  }>({});
  const locationPromptShownRef = useRef(false);
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
          handleStopAlertEvent(payload, { fallbackMessage: t('tracking.longStopAlert') });
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
            payload.type === 'order_pod_submitted') &&
          Number(payload.order_id) === id
        ) {
          setOrder((prev) => applyOrderRealtimePayload(prev, payload));
          if (payload.type === 'order_status_changed') {
            if (payload.status_code === 'approved_by_client') {
              toastService.success(t('orders.clientApprovedOrder'));
            } else if (payload.message) {
              toastService.info(String(payload.message));
            }
            void loadOrder();
          }
          if (payload.type === 'order_client_payment_confirmed') {
            if (payload.client_payment_confirmed === true) {
              toastService.success(t('orders.paymentCompleteCanFinish'));
            }
            void loadOrder();
          }
          if (payload.type === 'order_client_payment_reported' && payload.client_paid_reported === true) {
            toastService.info(t('orders.clientReportedPaidToast'));
            void loadOrder();
          }
          if (payload.type === 'order_delivery_confirmed' && payload.client_delivery_confirmed === true) {
            toastService.success(t('orders.clientDeliveryConfirmedToast'));
            void loadOrder();
          }
          if (payload.type === 'order_pod_submitted') {
            void loadOrder();
          }
        }
      },
      onPoll: () => loadOrder(),
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
    } catch (error) {
      console.error('Error loading order:', error);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const promptEnableLocation = () => {
    Alert.alert(t('tracking.permissionRequiredTitle'), t('tracking.locationRequiredForOrder'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tracking.enableLocationToStart'),
        onPress: () => (navigation as any).navigate('OrderTracking', { id, autoStart: true }),
      },
    ]);
  };

  useEffect(() => {
    if (!order || locationPromptShownRef.current) {return;}
    if (order.status.code === 'approved_by_client') {
      locationPromptShownRef.current = true;
      promptEnableLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status?.code, id]);

  const handleStart = async () => {
    if (!order) {return;}
    try {
      setActionLoading(true);
      const freshOrder = await ordersService.getOrder(id);
      setOrder(freshOrder);
      if (!isOrderApprovedForDriver(freshOrder.status?.code)) {
        Alert.alert(t('orders.pending'), t('orders.waitingForClient'));
        return;
      }
    } catch (error) {
      Alert.alert(t('common.error'), getApiErrorMessage(error, t('orders.orderNotLoaded')));
      return;
    } finally {
      setActionLoading(false);
    }

    const hasLocation = await ensureBackgroundLocationPermission(t);
    if (!hasLocation) {
      return;
    }

    Alert.alert(
      t('orders.startOrder'),
      t('orders.startOrderConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('orders.startOrder'),
          onPress: async () => {
            try {
              setActionLoading(true);
              try {
                const stops = getSortedRouteStops(order?.route_stops);
                if (stops.length) {
                  await hydrateRouteStopCoordinates(id, stops, ordersService.updateRouteStop);
                } else {
                  const fetched = await ordersService.getRouteStops(id);
                  await hydrateRouteStopCoordinates(id, fetched, ordersService.updateRouteStop);
                }
              } catch {
                // Geocoding is best-effort; backend still requires coordinates.
              }
              await ordersService.startOrder(id);
              await startActiveOrderLocationSession(id, t);

              if (advertisement) {
                await openYandexNavigatorToAddress(departureCity, advertisement.departure_address);
              }

              loadOrder();
              (navigation as any).navigate('OrderTracking', { id, autoStart: true });
            } catch (error: any) {
              Alert.alert(t('common.error'), error.response?.data?.error || t('common.error'));
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkDriverPayment = async (received: boolean) => {
    if (!order) {return;}
    try {
      setActionLoading(true);
      const updated = await ordersService.markDriverPayment(order.id, received);
      setOrder(updated);
      if (received) {
        toastService.success(t('orders.driverPaymentMarkedReceived'));
      } else {
        toastService.success(t('orders.driverPaymentMarkedNotReceived'));
      }
    } catch (error: unknown) {
      Alert.alert(t('common.error'), getApiErrorMessage(error, t('common.error')));
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!order) {return;}
    if (!order?.proof_of_delivery) {
      Alert.alert(t('common.error'), t('orders.podRequiredBeforeComplete'));
      return;
    }
    Alert.alert(t('orders.completeOrder'), t('orders.completeOrderConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('orders.complete'),
        onPress: async () => {
          try {
            setActionLoading(true);
            await ordersService.completeOrder(id);
            await stopActiveOrderLocationSession();
            Alert.alert(t('common.success'), t('orders.orderCompleted'));
            loadOrder();
          } catch (error: unknown) {
            const appError = error as AppError;
            if (appError?.code === ErrorCode.PAYMENT_REQUIRED) {
              Alert.alert(t('common.error'), t('orders.markPaymentReceivedBeforeComplete'));
              return;
            }
            const message = getApiErrorMessage(error, t('errors.unknownError'));
            if (String((error as { response?: { data?: { code?: string } } })?.response?.data?.code) === 'delivery_confirmation_required') {
              Alert.alert(t('common.error'), t('orders.waitingForClientDeliveryHint'));
              return;
            }
            toastService.error(message);
            Alert.alert(t('common.error'), message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handlePickPodPhoto = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, maxWidth: 1280, maxHeight: 1280 },
      (response: ImagePickerResponse) => {
        if (response.didCancel) {return;}
        const asset = response.assets?.[0];
        if (!asset?.uri) {
          toastService.info(t('orders.podPhotoNotSelected'));
          return;
        }
        setPodPhoto({
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          fileName: asset.fileName || `pod_${Date.now()}.jpg`,
        });
      }
    );
  };

  const handleCapturePodLocation = () => {
    Geolocation.getCurrentPosition(
      (position) => {
        setPodLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setPodErrors((prev) => ({ ...prev, podLocation: undefined }));
        toastService.success(t('orders.podGeoCaptured'));
      },
      () => toastService.error(t('orders.podGeoReadError')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const validatePodFields = () => {
    const errors: typeof podErrors = {};
    if (!receiverName.trim()) {
      errors.receiverName = t('orders.podReceiverNameRequired');
    }
    if (!receiverSignature.trim()) {
      errors.receiverSignature = t('orders.podReceiverSignatureRequired');
    }
    if (!podLocation) {
      errors.podLocation = t('orders.podGeoRequired');
    }
    if (!podPhoto) {
      errors.podPhoto = t('orders.podPhotoRequired');
    }
    setPodErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitPod = async () => {
    if (!validatePodFields()) {
      const firstError =
        !receiverName.trim()
          ? t('orders.podReceiverNameRequired')
          : !receiverSignature.trim()
            ? t('orders.podReceiverSignatureRequired')
            : !podLocation
              ? t('orders.podGeoRequired')
              : t('orders.podPhotoRequired');
      toastService.info(firstError);
      return;
    }
    try {
      setPodSubmitting(true);
      const updated = await ordersService.submitProofOfDelivery(id, {
        receiver_name: receiverName.trim(),
        receiver_signature: receiverSignature.trim(),
        delivered_lat: podLocation!.lat,
        delivered_lng: podLocation!.lng,
        note: podNote.trim() || undefined,
        delivery_photo: podPhoto || undefined,
      });
      setOrder(updated);
      setPodErrors({});
      toastService.success(t('orders.podSaved'));
    } catch (error: any) {
      toastService.error(error?.response?.data?.error || t('orders.podSaveError'));
    } finally {
      setPodSubmitting(false);
    }
  };

  const handleReject = async () => {
    Alert.alert(t('orders.rejectOrder'), t('orders.rejectOrderConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('orders.rejectOrder'),
        style: 'destructive',
        onPress: async () => {
          try {
            setActionLoading(true);
            await ordersService.rejectOrder(id);
            await stopActiveOrderLocationSession();
            Alert.alert(t('common.success'), t('orders.orderRejected'));
            navigation.goBack();
          } catch (error: any) {
            Alert.alert(t('common.error'), error.response?.data?.error || t('errors.unknownError'));
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) {return t('common.notSpecified');}
    const date = new Date(dateString);
    return date.toLocaleDateString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const podReady = Boolean(receiverName.trim() && receiverSignature.trim() && podLocation && podPhoto);
  const podChecks = useMemo(
    () => [
      { key: 'name', done: Boolean(receiverName.trim()), label: t('orders.podCheckName'), required: true },
      {
        key: 'signature',
        done: Boolean(receiverSignature.trim()),
        label: t('orders.podCheckSignature'),
        required: true,
      },
      { key: 'photo', done: Boolean(podPhoto), label: t('orders.podCheckPhoto'), required: true },
      { key: 'geo', done: Boolean(podLocation), label: t('orders.podCheckGeo'), required: true },
    ],
    [receiverName, receiverSignature, podPhoto, podLocation, t]
  );

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

  const advertisement =
    typeof order.advertisement === 'object' ? order.advertisement : null;
  const client = typeof order.client === 'object' ? order.client : null;

  const departureCity =
    advertisement &&
    typeof advertisement.departure_city === 'object' &&
    advertisement.departure_city
      ? advertisement.departure_city.name
      : '';
  const destinationCity =
    advertisement &&
    typeof advertisement.destination_city === 'object' &&
    advertisement.destination_city
      ? advertisement.destination_city.name
      : '';
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

  const canStart = isOrderApprovedForDriver(order.status.code);
  const awaitingClientApproval = order.status.code === 'pending';
  const canSubmitPod = order.status.code === 'in_transit';
  const canComplete = canFinishTrip(order.status.code);
  const nextAction = getDriverNextAction(order);
  const nextActionCta =
    nextAction?.ctaKey === 'orders.start'
      ? handleStart
      : nextAction?.ctaKey === 'orders.complete'
        ? handleComplete
        : nextAction?.ctaKey === 'orders.markPaymentReceived'
          ? () => {
              void handleMarkDriverPayment(true);
            }
          : undefined;
  const canTrack =
    order.status.code === 'approved_by_client' ||
    order.status.code === 'in_progress' ||
    order.status.code === 'in_transit';

  const statusColor = getOrderStatusColor(order.status.code, colors);
  const departureAddress = advertisement
    ? formatDisplayAddress(advertisement.departure_address)
    : '';
  const destinationAddress = advertisement
    ? formatDisplayAddress(advertisement.destination_address)
    : '';
  const showPickupNav = shouldShowPickupNavigation(order.status.code);
  const showDestinationNav = shouldShowDestinationNavigation(order.status.code);

  const openYandexNavigator = async (address: string, city: string) => {
    const fullAddress = `${city}, ${address}`;
    const encodedAddress = encodeURIComponent(fullAddress);

    const url = Platform.select({
      ios: `yandexnavi://build_route?address_to=${encodedAddress}`,
      android: `yandexnavi://build_route?address_to=${encodedAddress}`,
    });

    if (url) {
      Linking.canOpenURL(url).then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          const webUrl = `https://yandex.ru/maps/?text=${encodedAddress}`;
          Linking.openURL(webUrl);
        }
      });
    } else {
      const webUrl = `https://yandex.ru/maps/?text=${encodedAddress}`;
      Linking.openURL(webUrl);
    }
  };

  const renderActions = () => (
    <View style={styles.actions}>
      {awaitingClientApproval && (
        <Card style={styles.waitingCard}>
          <Text style={styles.waitingTitle}>{t('orders.waitingForClient')}</Text>
          <Button
            title={t('orders.rejectOrder')}
            onPress={handleReject}
            loading={actionLoading}
            variant="outline"
            style={styles.actionButton}
          />
        </Card>
      )}
      {canStart && (
        <>
          <Button
            title={t('orders.start')}
            onPress={handleStart}
            loading={actionLoading}
            variant="primary"
            style={styles.actionButton}
          />
          <Button
            title={t('orders.rejectOrder')}
            onPress={handleReject}
            loading={actionLoading}
            variant="danger"
            style={styles.actionButton}
          />
        </>
      )}
      {canTrack && (
        <Button
          title={t('orders.tracking')}
          onPress={() => (navigation as any).navigate('OrderTracking', { id: order.id })}
          variant="outline"
          style={styles.actionButton}
        />
      )}
      {canSubmitPod && !order.proof_of_delivery && (
        <Card style={styles.podCard}>
          <Text style={styles.sectionTitle}>{t('orders.podTitle')}</Text>
          <Text style={styles.podHint}>{t('orders.podHint')}</Text>

          <View style={styles.podChecklist}>
            <Text style={styles.podChecklistTitle}>{t('orders.podChecklistTitle')}</Text>
            <View style={styles.podChecklistGrid}>
              {podChecks.map((item) => (
                <View key={item.key} style={styles.podCheckItem}>
                  <View
                    style={[
                      styles.podCheckDot,
                      item.done ? styles.podCheckDotDone : styles.podCheckDotPending,
                    ]}>
                    <Text style={styles.podCheckDotText}>{item.done ? '✓' : '·'}</Text>
                  </View>
                  <Text
                    style={[
                      styles.podCheckLabel,
                      item.done && styles.podCheckLabelDone,
                      !item.required && styles.podCheckLabelOptional,
                    ]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Input
            label={t('orders.podReceiverName')}
            placeholder={t('orders.podReceiverName')}
            value={receiverName}
            onChangeText={(text) => {
              setReceiverName(text);
              if (podErrors.receiverName) {
                setPodErrors((prev) => ({ ...prev, receiverName: undefined }));
              }
            }}
            error={podErrors.receiverName}
            autoCapitalize="words"
            style={styles.podField}
          />
          <Input
            label={t('orders.podReceiverSignature')}
            placeholder={t('orders.podReceiverSignature')}
            value={receiverSignature}
            onChangeText={(text) => {
              setReceiverSignature(text);
              if (podErrors.receiverSignature) {
                setPodErrors((prev) => ({ ...prev, receiverSignature: undefined }));
              }
            }}
            error={podErrors.receiverSignature}
            style={styles.podField}
          />
          <Input
            label={t('orders.podNoteOptional')}
            placeholder={t('orders.podNoteOptional')}
            value={podNote}
            onChangeText={setPodNote}
            multiline
            style={[styles.podField, styles.podNoteInput]}
          />

          <View style={styles.podButtonsRow}>
            <Button
              title={t('common.image')}
              onPress={handlePickPodPhoto}
              variant={podPhoto ? 'secondary' : 'outline'}
              style={styles.podButton}
            />
            <Button
              title={t('orders.podGeotag')}
              onPress={handleCapturePodLocation}
              variant={podLocation ? 'secondary' : 'outline'}
              style={styles.podButton}
            />
          </View>

          {podPhoto?.uri && <Image source={{ uri: podPhoto.uri }} style={styles.podPhotoPreview} />}
          {podLocation && (
            <Text style={styles.podMetaText}>
              {t('orders.podGeotag')}: {podLocation.lat.toFixed(6)}, {podLocation.lng.toFixed(6)}
            </Text>
          )}
          {podErrors.podLocation && (
            <Text style={styles.podInlineError}>{podErrors.podLocation}</Text>
          )}
          {podErrors.podPhoto && (
            <Text style={styles.podInlineError}>{podErrors.podPhoto}</Text>
          )}

          {!podReady && (
            <Text style={styles.podSubmitHint}>{t('orders.podSubmitHint')}</Text>
          )}
          <Button
            title={t('orders.podSubmit')}
            onPress={handleSubmitPod}
            loading={podSubmitting}
            variant="primary"
            disabled={!podReady || podSubmitting}
            style={styles.actionButton}
          />
        </Card>
      )}
      {['in_progress', 'in_transit'].includes(order.status.code) && (
        <Card style={styles.paymentWaitCard}>
          <Text style={styles.paymentWaitTitle}>{t('orders.driverPaymentTitle')}</Text>
          <Text style={styles.paymentWaitHint}>{t('orders.driverPaymentHint')}</Text>
          {order.total_amount !== undefined && order.total_amount > 0 && (
            <Text style={styles.paymentWaitAmount}>
              {t('orders.agreedAmount')}: {order.total_amount.toLocaleString()} so'm
            </Text>
          )}
          <Text style={styles.paymentWaitStatus}>
            {order.client_payment_confirmed === true
              ? t('orders.driverPaymentReceived')
              : order.client_payment_confirmed === false
                ? t('orders.driverPaymentNotReceived')
                : order.client_paid_reported === true
                  ? t('orders.clientReportedPaid')
                  : t('orders.driverPaymentPending')}
          </Text>
          <View style={styles.driverPaymentButtons}>
            <Button
              title={t('orders.markPaymentReceived')}
              onPress={() => {
                void handleMarkDriverPayment(true);
              }}
              loading={actionLoading}
              variant={order.client_payment_confirmed === true ? 'primary' : 'outline'}
              style={styles.driverPaymentButton}
            />
            <Button
              title={t('orders.markPaymentNotReceived')}
              onPress={() => {
                void handleMarkDriverPayment(false);
              }}
              loading={actionLoading}
              variant={order.client_payment_confirmed === false ? 'primary' : 'outline'}
              style={styles.driverPaymentButton}
            />
          </View>
        </Card>
      )}
      {canComplete && !!order.proof_of_delivery && (
        <>
          {order.client_payment_confirmed !== true && (
            <Text style={styles.completePaymentHint}>{t('orders.waitingForClientPaymentHint')}</Text>
          )}
          {order.client_delivery_confirmed !== true && (
            <Text style={styles.completePaymentHint}>{t('orders.waitingForClientDeliveryHint')}</Text>
          )}
          <Button
            title={t('orders.complete')}
            onPress={handleComplete}
            loading={actionLoading}
            variant="primary"
            disabled={
              order.client_payment_confirmed !== true ||
              order.client_delivery_confirmed !== true ||
              actionLoading
            }
            style={styles.actionButton}
          />
        </>
      )}
      {order.status.code === 'completed' && client && (
        <>
          <Button
            title={t('ratings.title')}
            onPress={() => {
              navigateRoot(navigation as any, 'Rating', { orderId: order.id });
            }}
            variant="primary"
            style={styles.actionButton}
          />
          <Button
            title={t('complaints.fileComplaint')}
            onPress={() => {
              navigateRoot(navigation as any, 'Complaint', { orderId: order.id });
            }}
            variant="outline"
            style={styles.actionButton}
          />
        </>
      )}
    </View>
  );

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader
        variant="hero"
        title={t('orders.orderNumber', { id: order.id })}
        subtitle={order.status.name}
      />
      <DriverOrderWorkflowBar statusCode={order.status.code} />
      {nextAction ? (
        <OrderNextActionCard
          action={nextAction}
          t={t}
          onPressCta={nextActionCta}
          ctaLoading={actionLoading}
        />
      ) : null}
      <OrderDistanceCard order={order} compact={order.status.code !== 'completed'} />
      {['approved_by_client', 'in_progress', 'in_transit'].includes(order.status.code) && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('features.sos.button')}</Text>
          <SOSButton orderId={order.id} disabled={!!order.active_sos} />
        </Card>
      )}
      {renderActions()}

      <Card variant="elevated" style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.orderId}>{t('orders.orderNumber', { id: order.id })}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{order.status.name}</Text>
          </View>
        </View>
        <View style={styles.metaChips}>
          <View style={styles.metaChip}>
            <MaterialIcons name="schedule" size={14} color={colors.textSecondary} />
            <Text style={styles.metaChipText}>{formatDate(order.created_at)}</Text>
          </View>
          {order.total_amount ? (
            <View style={[styles.metaChip, styles.metaChipPrimary]}>
              <MaterialIcons name="payments" size={14} color={colors.primary} />
              <Text style={[styles.metaChipText, styles.metaChipTextPrimary]}>
                {order.total_amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm
              </Text>
            </View>
          ) : null}
        </View>

        {advertisement && (
          <>
            <Text style={styles.title}>{advertisement.title}</Text>
            {advertisement.description && (
              <Text style={styles.description}>{advertisement.description}</Text>
            )}

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('orders.cargoInfo')}</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('orders.weight')}:</Text>
                <Text style={styles.infoValue}>{advertisement.weight} {t('advertisements.kg')}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('advertisements.route')}</Text>
              <View style={styles.routeContainer}>
                <View style={styles.routePoint}>
                  <View style={styles.routeDot} />
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeCity}>{departureCity}</Text>
                    {!!departureAddress && (
                      <Text style={styles.routeAddress}>{departureAddress}</Text>
                    )}
                  </View>
                </View>
                {showPickupNav && (
                  <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => openYandexNavigator(advertisement.departure_address, departureCity)}>
                    <Text style={styles.navButtonText}>{t('orders.pickup')} — {t('tracking.navigation')}</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.routeLine} />
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, styles.routeDotDestination]} />
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeCity}>{destinationCity}</Text>
                    {!!destinationAddress && (
                      <Text style={styles.routeAddress}>{destinationAddress}</Text>
                    )}
                  </View>
                </View>
                {showDestinationNav && (
                  <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => openYandexNavigator(advertisement.destination_address, destinationCity)}>
                    <Text style={styles.navButtonText}>{t('orders.destination')} — {t('tracking.navigation')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {(currentLat != null && currentLng != null) || plannedRouteCoordinates.length > 1 ? (
              <>
                <View style={styles.divider} />
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('tracking.livePreview')}</Text>
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
                      <LogistikaMarker id="pickup" coordinate={plannedRouteCoordinates[0]} color={colors.logisticsAccent} />
                    )}
                    {plannedRouteCoordinates[plannedRouteCoordinates.length - 1] && (
                      <LogistikaMarker
                        id="destination"
                        coordinate={plannedRouteCoordinates[plannedRouteCoordinates.length - 1]}
                        color={colors.success}
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
                </View>
              </>
            ) : null}
          </>
        )}

                 {client && (
                   <>
                     <View style={styles.divider} />
                     <View style={styles.section}>
                       <Text style={styles.sectionTitle}>{t('orders.client')}</Text>
                       <Text style={styles.clientName}>
                         {client.first_name} {client.last_name}
                       </Text>
                       <UserReputationBadge user={client} />
                       <TrustScoreCard user={client} compact />
                       <TouchableOpacity
                         onPress={() => {
                           makePhoneCall(client.phone);
                         }}>
                         <Text style={[styles.clientPhone, styles.phoneLink]}>{client.phone}</Text>
                       </TouchableOpacity>
                       <View style={styles.contactButtons}>
                         <Button
                           title={`📞 ${t('common.call')}`}
                           onPress={() => {
                             makePhoneCall(client.phone);
                           }}
                           variant="outline"
                           style={styles.contactButton}
                         />
                         <Button
                          title={t('orders.sendMessage')}
                           onPress={async () => {
                             try {
                               const chat = await chatService.createChat(order.id);
                              navigateRoot(navigation as any, 'ChatDetail', { id: chat.id });
                             } catch (error: any) {
                               console.error('Error creating chat:', error);
                               Alert.alert(t('common.error'), error.response?.data?.error || t('orders.createChatError'));
                             }
                           }}
                           variant="outline"
                           style={styles.contactButton}
                         />
                       </View>
                     </View>
                   </>
                 )}

                 {order.total_amount !== undefined && order.total_amount > 0 && (
                   <>
                     <View style={styles.divider} />
                     <View style={styles.section}>
                       <Text style={styles.sectionTitle}>{t('orders.agreedAmount')}</Text>
                       <View style={styles.infoRow}>
                         <Text style={styles.infoValue}>
                           {order.total_amount.toLocaleString(currentLanguage === 'ru' ? 'ru-RU' : 'uz-UZ')} so'm
                         </Text>
                       </View>
                       <Text style={styles.paymentWaitHint}>{t('orders.driverPaymentHint')}</Text>
                     </View>
                   </>
                 )}

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('orders.time')}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('advertisements.createdAt')}:</Text>
            <Text style={styles.infoValue}>{formatDate(order.created_at)}</Text>
          </View>
          {order.started_at && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('orders.startedAt')}:</Text>
              <Text style={styles.infoValue}>{formatDate(order.started_at)}</Text>
            </View>
          )}
          {order.completed_at && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('orders.completedAt')}:</Text>
              <Text style={styles.infoValue}>{formatDate(order.completed_at)}</Text>
            </View>
          )}
        </View>
      </Card>

      {!!order.proof_of_delivery && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('orders.podSaved')}</Text>
          <Text style={styles.podMetaText}>{t('orders.podReceiver')}: {order.proof_of_delivery.receiver_name}</Text>
          {!!order.proof_of_delivery.delivery_photo && (
            <Image
              source={{ uri: getMediaUrl(order.proof_of_delivery.delivery_photo) || order.proof_of_delivery.delivery_photo }}
              style={styles.podPhotoPreview}
            />
          )}
        </Card>
      )}

      {['approved_by_client', 'in_progress', 'in_transit'].includes(order.status.code) && (
        <TrackingSharePanel
          orderId={order.id}
          existingToken={order.tracking_share?.token}
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

      <CustodyChainPanel events={order.custody_events} language={currentLanguage} />

      {['approved_by_client', 'in_progress', 'in_transit'].includes(order.status.code) && (
        <CustodyLogForm
          onSubmit={async (payload) => {
            await ordersService.logCustodyEvent(order.id, payload);
            const updated = await ordersService.getOrder(order.id);
            setOrder(updated);
          }}
        />
      )}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('orders.orderQrTitle')}</Text>
        <Text style={styles.qrCodeDescription}>
          {t('orders.orderQrDescription')}
        </Text>
        <View style={styles.qrCodeContainer}>
          {QRCode ? (
            <QRCode
              value={`ORDER-${order.id}`}
              size={200}
              color={colors.text}
              backgroundColor={colors.textLight}
            />
          ) : (
            <View style={styles.qrCodePlaceholder}>
              <Text style={styles.qrCodePlaceholderText}>
                ORDER-{order.id}
              </Text>
              <Text style={styles.qrCodePlaceholderSubtext}>
                {t('orders.qrPackageMissing')}
              </Text>
            </View>
          )}
        </View>
        <Button
          title={`📷 ${t('orders.scanQr')}`}
          onPress={() => {
            (navigation as any).navigate('QRCodeScanner', { mode: 'verify', userId: user?.id });
          }}
          variant="secondary"
          style={styles.scanButton}
        />
      </Card>
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

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  card: {
    margin: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  orderId: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  routeContainer: {
    marginTop: 8,
  },
  routePoint: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginRight: 12,
    marginTop: 4,
  },
  routeDotDestination: {
    backgroundColor: colors.success,
  },
  routeInfo: {
    flex: 1,
  },
  routeCity: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  routeAddress: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginBottom: 8,
  },
  navButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  navButtonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
  miniMap: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  trackingGrid: {
    gap: 6,
  },
  trackingMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  clientPhone: {
    fontSize: 16,
    color: colors.textSecondary,
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
  actions: {
    paddingHorizontal: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 0,
  },
  podCard: {
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.primary + '22',
  },
  podHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  podChecklist: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  podChecklistTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  podChecklistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  podCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    gap: 6,
  },
  podCheckDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podCheckDotDone: {
    backgroundColor: colors.success + '22',
  },
  podCheckDotPending: {
    backgroundColor: colors.border,
  },
  podCheckDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  podCheckLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  podCheckLabelDone: {
    color: colors.text,
    fontWeight: '600',
  },
  podCheckLabelOptional: {
    fontStyle: 'italic',
  },
  podField: {
    marginBottom: 4,
  },
  podInput: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: colors.surfaceMuted,
    fontSize: 14,
    color: colors.text,
  },
  podNoteInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  podButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  podButton: {
    flex: 1,
    marginTop: 0,
  },
  podPhotoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: colors.surfaceMuted,
  },
  podMetaText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  podInlineError: {
    fontSize: 12,
    color: colors.danger,
    marginBottom: 8,
  },
  podSubmitHint: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 8,
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
    borderColor: `${colors.warning}66`,
  },
  warningText: {
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
  },
  waitingCard: {
    marginBottom: spacing.sm,
    backgroundColor: colors.warning + '15',
    borderColor: colors.warning + '40',
    borderWidth: 1,
  },
  waitingTitle: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  paymentWaitCard: {
    marginBottom: 12,
    backgroundColor: colors.warning + '12',
    borderColor: colors.warning + '40',
    borderWidth: 1,
  },
  paymentWaitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  paymentWaitHint: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  paymentWaitAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
    marginBottom: 10,
  },
  paymentWaitStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  driverPaymentButtons: {
    gap: spacing.sm,
  },
  driverPaymentButton: {
    marginTop: 0,
  },
  completePaymentHint: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
    paddingHorizontal: 4,
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
  qrCodePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    minHeight: 200,
  },
  qrCodePlaceholderText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  qrCodePlaceholderSubtext: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});

export default OrderDetailScreen;
