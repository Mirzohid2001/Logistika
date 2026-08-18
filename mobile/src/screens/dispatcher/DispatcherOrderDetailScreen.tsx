import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Linking,
  Image,
  Platform,
  TextInput,
  Vibration,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { dispatcherService } from '../../services/dispatcherService';
import { ordersService } from '../../services/ordersService';
import { chatService } from '../../services/chatService';
import { Order, DispatcherAssignment, DispatcherNote } from '../../types';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { SkeletonCard } from '../../components/Skeleton';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { getOrderStatusColor } from '../../utils/statusColors';
import { EmptyState } from '../../components/EmptyState';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { makePhoneCall } from '../../utils/phone';
import { toastService } from '../../services/toastService';
import { getMediaUrl } from '../../services/api';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';

import { useTranslation } from '../../hooks/useTranslation';
import { TrackingStatsPanel } from '../../components/TrackingStatsPanel';
import { OrderDistanceCard } from '../../components/OrderDistanceCard';
import { orderHasDistanceMetrics } from '../../utils/orderDistance';
import { RouteStopsPanel } from '../../components/RouteStopsPanel';
import { SOSAlertPanel } from '../../components/SOSAlertPanel';
import { CustodyChainPanel } from '../../components/CustodyChainPanel';
import { TrackingSharePanel } from '../../components/TrackingSharePanel';
import { OrderDocumentsPanel } from '../../components/OrderDocumentsPanel';
import { getSortedRouteStops } from '../../utils/routeStops';
import { OrderRouteStop } from '../../types';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';

const DispatcherOrderDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { t, currentLanguage } = useTranslation();
  const { id } = route.params as { id: number };

  const [order, setOrder] = useState<Order & { assignments: DispatcherAssignment[]; notes: DispatcherNote[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sectionRefreshing, setSectionRefreshing] = useState(false);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnStatus, setReturnStatus] = useState<'ok' | 'opened' | 'damaged'>('ok');
  const [returnNote, setReturnNote] = useState('');
  const [returnPhoto, setReturnPhoto] = useState<{ uri: string; type?: string; fileName?: string } | null>(null);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [actionDoneLabel, setActionDoneLabel] = useState<string | null>(null);
  const [routeStops, setRouteStops] = useState<OrderRouteStop[]>([]);

  const flashActionDone = (label: string) => {
    setActionDoneLabel(label);
    setTimeout(() => {
      setActionDoneLabel((prev) => (prev === label ? null : prev));
    }, 2500);
  };

  useEffect(() => {
    loadOrder();

    const interval = setInterval(() => {
      loadOrder();
    }, 15000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadOrder = async (initial: boolean = false) => {
    try {
      if (initial || !order) {
        setLoading(true);
      } else {
        setSectionRefreshing(true);
      }
      setLoadError(null);
      const data = await dispatcherService.getOrderDetail(id);
      let stops = getSortedRouteStops(data.route_stops);
      if (!stops.length) {
        try {
          stops = await ordersService.getRouteStops(id);
        } catch {
          stops = [];
        }
      }
      setRouteStops(stops);
      setOrder({ ...data, route_stops: stops });
    } catch (error: any) {
      const message = error.response?.data?.error || t('dispatcherOrderDetail.loadError');
      setLoadError(message);
      toastService.error(message);
    } finally {
      setLoading(false);
      setSectionRefreshing(false);
    }
  };

  const handleAssign = () => {
    (navigation as any).navigate('DispatcherAssign', { orderId: id, isReassign: false });
  };

  const handleReassign = () => {
    (navigation as any).navigate('DispatcherAssign', { orderId: id, isReassign: true });
  };

  const handleAddNote = () => {
    setNoteText('');
    setNoteModalVisible(true);
  };

  const handleSaveNote = async () => {
    if (!noteText || noteText.trim() === '') {
      Alert.alert(t('common.error'), t('dispatcherLists.orderEnterReminder'));
      return;
    }
    setAddingNote(true);
    try {
      await dispatcherService.addNote(id, noteText);
      Vibration.vibrate(20);
      toastService.success(t('dispatcherOrderDetail.noteAdded'));
      flashActionDone('Completed: Note');
      setNoteModalVisible(false);
      setNoteText('');
      loadOrder();
    } catch (error: any) {
      Vibration.vibrate(120);
      toastService.error(error.response?.data?.error || 'Xatolik yuz berdi');
      Alert.alert(t('common.error'), error.response?.data?.error || t('dispatcherLists.bulkError'));
    } finally {
      setAddingNote(false);
    }
  };

  const handleCancel = async () => {
    Alert.alert(
      t('dispatcherLists.orderCancelTitle'),
      t('dispatcherLists.orderCancelConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('dispatcherLists.orderCancelTitle'),
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatcherService.cancelOrder(id);
              Vibration.vibrate(20);
              toastService.success(t('dispatcherOrderDetail.orderCancelled'));
              flashActionDone('Completed: Cancel');
              loadOrder();
            } catch (error: any) {
              Vibration.vibrate(120);
              toastService.error(error.response?.data?.error || 'Xatolik yuz berdi');
              Alert.alert(t('common.error'), error.response?.data?.error || t('dispatcherLists.bulkError'));
            }
          },
        },
      ]
    );
  };

  const handlePickReturnPhoto = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, maxWidth: 1280, maxHeight: 1280 },
      (response: ImagePickerResponse) => {
        if (response.didCancel) {return;}
        const asset = response.assets?.[0];
        if (!asset?.uri) {
          return;
        }
        setReturnPhoto({
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          fileName: asset.fileName || `return_${Date.now()}.jpg`,
        });
      }
    );
  };

  const handleSaveReturnQuality = async () => {
    try {
      setReturnSubmitting(true);
      await ordersService.classifyReturnQuality(id, {
        quality_status: returnStatus,
        note: returnNote.trim() || undefined,
        photo: returnPhoto || undefined,
      });
      toastService.success('Return quality saqlandi');
      Vibration.vibrate(20);
      flashActionDone('Completed: Return quality');
      setReturnModalVisible(false);
      setReturnNote('');
      setReturnPhoto(null);
      await loadOrder();
    } catch (error: any) {
      Vibration.vibrate(120);
      toastService.error(error?.response?.data?.error || 'Return quality saqlanmadi');
      Alert.alert(t('common.error'), error?.response?.data?.error || t('dispatcherLists.orderReturnQualityError'));
    } finally {
      setReturnSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('uz-UZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openMapsAtLocation = (lat: number, lng: number) => {
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const appleMapsUrl = `http://maps.apple.com/?ll=${lat},${lng}`;
    const fallbackWebUrl = `https://maps.google.com/?q=${lat},${lng}`;

    const nativeUrl = Platform.OS === 'ios' ? appleMapsUrl : googleMapsUrl;
    Linking.canOpenURL(nativeUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(nativeUrl);
        }
        return Linking.openURL(fallbackWebUrl);
      })
      .catch(() => {
        Linking.openURL(fallbackWebUrl);
      });
  };

  if (loading) {
    return (
      <ScreenBackground>
        <AppHeader
          variant="hero"
          title={t('dispatcherLists.orderDetailTitle')}
          subtitle={t('dispatcherLists.orderDetailSubtitle')}
        />
        <SkeletonCard />
      </ScreenBackground>
    );
  }

  if (loadError && !order) {
    return (
      <ScreenBackground>
        <AppHeader
          variant="hero"
          title={t('dispatcherLists.orderDetailTitle')}
          subtitle={t('dispatcherLists.orderDetailSubtitle')}
        />
        <EmptyState
          variant="error"
          title={t('dispatcherLists.loadError')}
          message={loadError}
          actionText={t('dispatcherLists.retry')}
          onActionPress={() => loadOrder(true)}
        />
      </ScreenBackground>
    );
  }

  if (!order) {
    return (
      <ScreenBackground>
        <AppHeader
          variant="hero"
          title={t('dispatcherLists.orderDetailTitle')}
          subtitle={t('dispatcherLists.orderDetailSubtitle')}
        />
        <EmptyState
          variant="error"
          title={t('dispatcherLists.loadError')}
          message={t('errors.tryAgain')}
          actionText={t('dispatcherLists.retry')}
          onActionPress={() => loadOrder(true)}
        />
      </ScreenBackground>
    );
  }

  const advertisement =
    typeof order.advertisement === 'object' ? order.advertisement : null;
  const driver = typeof order.driver === 'object' ? order.driver : null;
  const client = typeof order.client === 'object' ? order.client : null;

  return (
    <ScreenBackground>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader
        variant="hero"
        title={t('dispatcherLists.orderDetailTitle')}
        subtitle={t('dispatcherLists.orderDetailSubtitle')}
      />
      {sectionRefreshing ? (
        <Text style={styles.refreshingText}>{t('dispatcherLists.refreshing')}</Text>
      ) : null}
      {actionDoneLabel && (
        <View style={styles.actionDoneBadge}>
          <MaterialIcons name="check-circle" size={14} color={colors.success} />
          <Text style={styles.actionDoneText}>{actionDoneLabel}</Text>
        </View>
      )}
      {order.active_sos && (
        <SOSAlertPanel
          alert={order.active_sos}
          driverPhone={driver?.phone}
          onUpdated={(updated) => {
            setOrder((prev) => (prev ? { ...prev, active_sos: updated || undefined } : prev));
            if (!updated) {
              flashActionDone(t('features.sos.dispatcher.resolved'));
            }
          }}
        />
      )}
      {order.custody_events && order.custody_events.length > 0 && (
        <CustodyChainPanel events={order.custody_events} language={currentLanguage} />
      )}
      {!!order.tracking_summary?.alert_level && !!order.tracking_summary.alert_message && (
        <Card
          style={[
            styles.card,
            order.tracking_summary.alert_level === 'critical' ? styles.alertCardCritical : styles.alertCardWarning,
          ]}>
          <Text style={styles.alertTitle}>
            {order.tracking_summary.alert_level === 'critical'
              ? t('tracking.criticalAlert')
              : t('tracking.warningAlert')}
          </Text>
          <Text style={styles.alertText}>{order.tracking_summary.alert_message}</Text>
        </Card>
      )}

      <OrderDistanceCard order={order} />

      {orderHasDistanceMetrics(order) && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('tracking.liveStats')}</Text>
          <TrackingStatsPanel order={order} />
          <Button
            title={t('tracking.viewOnMap')}
            onPress={() => (navigation as any).navigate('DispatcherMonitoring')}
            variant="outline"
            style={styles.trackingNavBtn}
          />
        </Card>
      )}

      {routeStops.length > 0 && (
        <Card style={styles.card}>
          <RouteStopsPanel order={order} stops={routeStops} t={t} />
          <Button
            title={t('dispatcherLists.viewRouteOnMap')}
            onPress={() => (navigation as any).navigate('DispatcherMonitoring')}
            variant="outline"
            style={styles.trackingNavBtn}
          />
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

      <Card style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusLabel}>{t('dispatcherOps.statusLabel')}:</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getOrderStatusColor(order.status.code, colors) + '20' },
            ]}>
            <Text
              style={[
                styles.statusText,
                { color: getOrderStatusColor(order.status.code, colors) },
              ]}>
              {order.status.name}
            </Text>
          </View>
        </View>
        <Text style={styles.orderId}>{t('dispatcherLists.orderNumber', { id: order.id })}</Text>
        <Text style={styles.date}>{t('dispatcherOps.createdAtLabel')} {formatDate(order.created_at)}</Text>
      </Card>

      {advertisement && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('dispatcherOps.advertisementInfo')}</Text>
          <Text style={styles.title}>{advertisement.title}</Text>
          {advertisement.description && (
            <Text style={styles.description}>{advertisement.description}</Text>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.label}>{t('dispatcherOps.weight')}:</Text>
            <Text style={styles.value}>{advertisement.weight} kg</Text>
          </View>
          {advertisement.proposed_cost && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>{t('dispatcherOps.price')}:</Text>
              <Text style={styles.value}>
                {advertisement.proposed_cost.toLocaleString('uz-UZ')} so'm
              </Text>
            </View>
          )}
        </Card>
      )}

      {client && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('dispatcherOps.clientInfo')}</Text>
          <Text style={styles.value}>
            {client.first_name} {client.last_name}
          </Text>
          <Text style={styles.value}>{client.phone}</Text>
        </Card>
      )}

      {driver && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('dispatcherOps.driverInfo')}</Text>
          <Text style={styles.value}>
            {driver.first_name} {driver.last_name}
          </Text>
          <Text style={styles.value}>{driver.phone}</Text>
        </Card>
      )}

      {order.proof_of_delivery && (
        <Card style={styles.podCard}>
          <View style={styles.podHeader}>
            <View style={styles.podBadge}>
              <MaterialIcons name="verified" size={16} color={colors.success} />
              <Text style={styles.podBadgeText}>POD VERIFIED</Text>
            </View>
            <Text style={styles.podTime}>{formatDate(order.proof_of_delivery.delivered_at)}</Text>
          </View>
          <Text style={styles.cardTitle}>Proof of Delivery</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Qabul qiluvchi:</Text>
            <Text style={styles.value}>{order.proof_of_delivery.receiver_name}</Text>
          </View>
          {!!order.proof_of_delivery.receiver_signature && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Imzo:</Text>
              <Text style={styles.value}>{order.proof_of_delivery.receiver_signature}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.label}>Geotag:</Text>
            <Text style={styles.value}>
              {order.proof_of_delivery.delivered_lat.toFixed(6)}, {order.proof_of_delivery.delivered_lng.toFixed(6)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.podMapButton}
            onPress={() =>
              openMapsAtLocation(
                order.proof_of_delivery!.delivered_lat,
                order.proof_of_delivery!.delivered_lng
              )
            }>
            <MaterialIcons name="map" size={16} color={colors.primary} />
            <Text style={styles.podMapButtonText}>Open in Maps</Text>
          </TouchableOpacity>
          {!!order.proof_of_delivery.note && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Izoh:</Text>
              <Text style={styles.value}>{order.proof_of_delivery.note}</Text>
            </View>
          )}
          {!!order.proof_of_delivery.delivery_photo && (
            <Image
              source={{
                uri:
                  getMediaUrl(order.proof_of_delivery.delivery_photo) ||
                  order.proof_of_delivery.delivery_photo,
              }}
              style={styles.podPhoto}
              resizeMode="cover"
            />
          )}
        </Card>
      )}

      <Card style={styles.card}>
        <View style={styles.returnHeader}>
          <Text style={styles.cardTitle}>{t('dispatcherOrderDetail.returnsQuality')}</Text>
          <TouchableOpacity style={styles.returnActionBtn} onPress={() => setReturnModalVisible(true)}>
            <Text style={styles.returnActionText}>
              {order.return_quality ? t('dispatcherOrderDetail.update') : t('dispatcherOrderDetail.classify')}
            </Text>
          </TouchableOpacity>
        </View>
        {order.return_quality ? (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Status:</Text>
              <Text style={styles.value}>{order.return_quality.quality_status.toUpperCase()}</Text>
            </View>
            {!!order.return_quality.note && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Izoh:</Text>
                <Text style={styles.value}>{order.return_quality.note}</Text>
              </View>
            )}
            {!!order.return_quality.photo && (
              <Image
                source={{ uri: getMediaUrl(order.return_quality.photo) || order.return_quality.photo }}
                style={styles.podPhoto}
                resizeMode="cover"
              />
            )}
          </>
        ) : (
          <Text style={styles.value}>Hali klassifikatsiya qilinmagan</Text>
        )}
      </Card>

      {order.assignments && order.assignments.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('dispatcherOps.assignments')}</Text>
          {order.assignments.map((assignment) => (
            <View key={assignment.id} style={styles.assignmentItem}>
              <Text style={styles.assignmentStatus}>{assignment.status}</Text>
              {assignment.assigned_driver && (
                <Text style={styles.assignmentDriver}>
                  {t('dispatcherOps.driverColon')} {assignment.assigned_driver.first_name}{' '}
                  {assignment.assigned_driver.last_name}
                </Text>
              )}
              <Text style={styles.assignmentDate}>
                {formatDate(assignment.assigned_at)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {order.notes && order.notes.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('dispatcherOps.notes')}</Text>
          {order.notes.map((note) => (
            <View key={note.id} style={styles.noteItem}>
              <Text style={styles.noteText}>{note.note}</Text>
              <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
            </View>
          ))}
        </Card>
      )}

      {(driver || client) && (
        <Card style={styles.quickActionsCard}>
          <Text style={styles.quickActionsTitle}>{t('dispatcherOps.quickActions')}</Text>
          <View style={styles.quickActionsRow}>
            {driver && (
              <>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => makePhoneCall(driver.phone)}>
                  <MaterialIcons name="phone" size={24} color={colors.primary} />
                  <Text style={styles.quickActionText}>{t('dispatcherOps.driver')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={async () => {
                    try {
                      const chat = await chatService.createChat(order.id);
                      (navigation as any).navigate('ChatDetail', { id: chat.id });
                    } catch (error: any) {
                      Alert.alert(t('common.error'), error.response?.data?.error || t('dispatcherLists.orderCreateChatError'));
                    }
                  }}>
                  <MaterialIcons name="chat" size={24} color={colors.success} />
                  <Text style={styles.quickActionText}>{t('dispatcherOps.chat')}</Text>
                </TouchableOpacity>
              </>
            )}
            {client && (
              <>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => makePhoneCall(client.phone)}>
                  <MaterialIcons name="phone" size={24} color={colors.warning} />
                  <Text style={styles.quickActionText}>{t('dispatcherOps.client')}</Text>
                </TouchableOpacity>
                {driver && (
                  <TouchableOpacity
                    style={styles.quickActionButton}
                    onPress={() => {
                      (navigation as any).navigate('DispatcherDriverDetail', { driverId: driver.id });
                    }}>
                    <MaterialIcons name="person" size={24} color={colors.secondary} />
                    <Text style={styles.quickActionText}>{t('dispatcherOps.profile')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </Card>
      )}

      <View style={styles.actions}>
        {!driver ? (
          <Button
            title={t('dispatcherOps.assignDriver')}
            onPress={handleAssign}
            variant="primary"
            style={styles.actionButton}
          />
        ) : (
          <Button
            title={t('dispatcherOps.reassignDriver')}
            onPress={handleReassign}
            variant="primary"
            style={styles.actionButton}
          />
        )}
        {order.status.code !== 'completed' && order.status.code !== 'cancelled' && (
          <>
            <Button
              title={t('dispatcherOps.addNote')}
              onPress={handleAddNote}
              variant="secondary"
              style={styles.actionButton}
            />
            <Button
              title="Bekor qilish"
              onPress={handleCancel}
              variant="danger"
              style={styles.actionButton}
            />
          </>
        )}
      </View>

      <Modal
        visible={noteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNoteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('dispatcherOps.addNote')}</Text>
            <Input
              label={t('dispatcherOrderDetail.noteLabel')}
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t('dispatcherOrderDetail.notePlaceholder')}
              multiline
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Button
                title="Bekor qilish"
                onPress={() => {
                  setNoteModalVisible(false);
                  setNoteText('');
                }}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Qo'shish"
                onPress={handleSaveNote}
                loading={addingNote}
                variant="primary"
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={returnModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReturnModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('dispatcherOrderDetail.returnsClassifyTitle')}</Text>
            <View style={styles.returnChips}>
              {(['ok', 'opened', 'damaged'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.returnChip, returnStatus === status && styles.returnChipActive]}
                  onPress={() => setReturnStatus(status)}>
                  <Text style={[styles.returnChipText, returnStatus === status && styles.returnChipTextActive]}>
                    {status.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.returnNoteInput}
              placeholder="Izoh"
              value={returnNote}
              onChangeText={setReturnNote}
              multiline
            />
            <TouchableOpacity style={styles.podMapButton} onPress={handlePickReturnPhoto}>
              <MaterialIcons name="photo-camera" size={16} color={colors.primary} />
              <Text style={styles.podMapButtonText}>{t('dispatcherOrderDetail.pickPhoto')}</Text>
            </TouchableOpacity>
            {!!returnPhoto?.uri && <Image source={{ uri: returnPhoto.uri }} style={styles.podPhoto} />}
            <View style={styles.modalActions}>
              <Button
                title="Bekor qilish"
                onPress={() => setReturnModalVisible(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title="Saqlash"
                onPress={handleSaveReturnQuality}
                loading={returnSubmitting}
                variant="primary"
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 20,
  },
  refreshingText: {
    paddingHorizontal: 16,
    marginBottom: 8,
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  actionDoneBadge: {
    marginHorizontal: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successGlow,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionDoneText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
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
  card: {
    marginBottom: 16,
  },
  podCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.successGlow,
    backgroundColor: colors.successGlow,
  },
  podHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  podBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successGlow,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  podBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.2,
  },
  podTime: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  podPhoto: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: colors.border,
  },
  podMapButton: {
    marginTop: 4,
    marginBottom: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.primaryGlow,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  podMapButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  alertCardWarning: {
    backgroundColor: colors.warningGlow,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  alertCardCritical: {
    backgroundColor: colors.dangerGlow,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  alertText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  trackingNavBtn: {
    marginTop: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
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
  assignmentItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  assignmentStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  assignmentDriver: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  assignmentDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  noteItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  noteText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  noteDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  quickActionsCard: {
    marginBottom: 16,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 10,
    gap: 8,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  actions: {
    paddingHorizontal: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  modalInput: {
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  returnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  returnActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primaryGlow,
  },
  returnActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  returnChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  returnChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.backgroundTertiary,
  },
  returnChipActive: {
    backgroundColor: colors.primaryGlow,
  },
  returnChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  returnChipTextActive: {
    color: colors.primary,
  },
  returnNoteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
});

export default DispatcherOrderDetailScreen;
