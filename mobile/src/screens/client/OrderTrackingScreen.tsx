import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
  LogistikaMap,
  LogistikaPolyline,
  DriverMarker,
  RoutePin,
  MapRecenterFab,
} from '../../components/map';
import { ordersService } from '../../services/ordersService';
import { Order, OrderLocationTrack } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ScreenBackground } from '../../components/ScreenBackground';
import { Button } from '../../components/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { toastService } from '../../services/toastService';
import { realtimeChannelService, RealtimeChannelHandle } from '../../services/realtimeChannelService';
import { LOCATION_POST_INTERVAL_MS } from '../../services/locationTrackingService';
import { getOrderTrackingWsUrl } from '../../config/realtimeConfig';
import { applyOrderRealtimePayload, appendLocationTrack } from '../../utils/trackingUpdates';
import { getDriverNavPhase } from '../../utils/orderRoute';
import { resolveOrderAdvertisement } from '../../utils/orderAdvertisement';
import { regionFromBounds, regionFromCenter, type LatLng } from '../../utils/mapGeo';
import {
  bearingDegrees,
  computePresenceAgeSeconds,
  filterTrackCoordinates,
  nearestProgressOnRoute,
  presenceColor,
  presenceLevelFromAge,
  resolveDisplayHeading,
  splitRouteByProgress,
} from '../../utils/mapTracking';
import { useSmoothDriverLocation } from '../../hooks/useSmoothDriverLocation';
import { useSmoothNavCamera } from '../../hooks/useSmoothNavCamera';
import { NAV_CAMERA_PADDING } from '../../config/mapCamera';
import { TrackingStatsPanel } from '../../components/TrackingStatsPanel';
import { TrackingStopHistory } from '../../components/TrackingStopHistory';
import { RouteStopsPanel } from '../../components/RouteStopsPanel';
import { SOSAlertPanel } from '../../components/SOSAlertPanel';
import {
  TrackingBottomSheet,
  TrackingOrderSummary,
  TrackingPhaseBadge,
} from '../../components/tracking/TrackingChrome';
import { handleStopAlertEvent } from '../../utils/trackingAlerts';
import {
  getPlannedRouteCoordinates,
  getSortedRouteStops,
  getActiveRouteStop,
  routeStopsToMapCoordinates,
  stopToLatLng,
} from '../../utils/routeStops';

const DEFAULT_CENTER = regionFromCenter(41.2995, 69.2401, 0.08);

const ClientOrderTrackingScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const route = useRoute();
  const { id } = route.params as { id: number };
  const { t } = useTranslation();

  const [order, setOrder] = useState<Order | null>(null);
  const [tracks, setTracks] = useState<OrderLocationTrack[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [followDriver, setFollowDriver] = useState(true);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const channelRef = useRef<RealtimeChannelHandle | null>(null);
  const prevDriverPointRef = useRef<LatLng | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {setInitialLoading(true);}
        const [orderData, tracksData] = await Promise.all([
          ordersService.getOrder(id),
          ordersService.getOrderTracking(id),
        ]);
        const advertisement = await resolveOrderAdvertisement(orderData);
        setOrder(advertisement ? { ...orderData, advertisement } : orderData);
        setTracks(tracksData);
      } catch (error) {
        console.error('Error loading tracking data:', error);
      } finally {
        if (!silent) {setInitialLoading(false);}
      }
    },
    [id]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const tick = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    channelRef.current?.stop();
    channelRef.current = realtimeChannelService.createChannel({
      wsUrl: getOrderTrackingWsUrl(id),
      onMessage: (payload) => {
        if (payload.type === 'stop_alert' && Number(payload.order_id) === id) {
          handleStopAlertEvent(payload, { fallbackMessage: t('tracking.longStopAlertDriver') });
          loadData(true);
          return;
        }
        if (payload.type === 'route_deviation' && Number(payload.order_id) === id) {
          toastService.info(payload.message || t('tracking.routeDeviation'));
          return;
        }
        if (payload.type === 'geofence_event' && Number(payload.order_id) === id) {
          toastService.info(payload.message || t('tracking.geofenceEvent'));
          return;
        }
        if (
          (payload.type === 'location_update' ||
            payload.type === 'order_status_changed' ||
            payload.type === 'order_payment_updated' ||
            payload.type === 'route_stop_arrived' ||
            payload.type === 'route_stop_completed') &&
          Number(payload.order_id) === id
        ) {
          setOrder((prev) => applyOrderRealtimePayload(prev, payload));
          if (payload.type === 'location_update') {
            setTracks((prev) => appendLocationTrack(prev, payload));
          }
          if (payload.type === 'order_status_changed' && payload.message) {
            toastService.info(String(payload.message));
          }
          if (payload.type === 'route_stop_arrived') {
            toastService.info(t('tracking.stopArrivedLive'));
            loadData(true);
          }
          if (payload.type === 'route_stop_completed') {
            toastService.info(t('tracking.stopCompletedLive'));
            loadData(true);
          }
        }
      },
      onPoll: () => loadData(true),
      pollIntervalMs: LOCATION_POST_INTERVAL_MS,
      pollInBackground: true,
    });
    return () => {
      channelRef.current?.stop();
      channelRef.current = null;
    };
  }, [id, loadData, t]);

  const routePolyline = useMemo(() => getPlannedRouteCoordinates(order), [order]);

  const serverDriverMotion = useMemo(() => {
    if (!order?.current_location_lat || !order?.current_location_lng) {return null;}
    const lat = Number(order.current_location_lat);
    const lng = Number(order.current_location_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {return null;}
    const seenAt = order.driver_last_seen_at
      ? Date.parse(order.driver_last_seen_at)
      : Date.now();
    return {
      latitude: lat,
      longitude: lng,
      heading: order.current_heading ?? null,
      speedMps: order.current_speed_mps ?? null,
      updatedAtMs: Number.isFinite(seenAt) ? seenAt : Date.now(),
      routeProgressM: order.route_progress_m ?? null,
    };
  }, [
    order?.current_location_lat,
    order?.current_location_lng,
    order?.current_heading,
    order?.current_speed_mps,
    order?.driver_last_seen_at,
    order?.route_progress_m,
  ]);

  const smoothDriverPoint = useSmoothDriverLocation(
    serverDriverMotion,
    true,
    routePolyline.length > 1 ? routePolyline : null
  );

  const heldHeadingRef = useRef(0);
  const driverBearing = useMemo(() => {
    const stopped =
      order?.current_speed_mps != null && order.current_speed_mps < 0.6;
    let motionBearing = heldHeadingRef.current;
    if (!stopped && smoothDriverPoint) {
      const prev = prevDriverPointRef.current;
      if (prev && haversineEnough(prev, smoothDriverPoint)) {
        motionBearing = bearingDegrees(prev, smoothDriverPoint);
      } else if (tracks.length >= 2) {
        const a = parseTrack(tracks[1]);
        const b = parseTrack(tracks[0]);
        if (a && b) {motionBearing = bearingDegrees(a, b);}
      }
    }
    const next = resolveDisplayHeading(
      order?.current_heading,
      order?.current_speed_mps,
      motionBearing
    );
    heldHeadingRef.current = next;
    return next;
  }, [smoothDriverPoint, tracks, order?.current_heading, order?.current_speed_mps]);

  const navCamera = useSmoothNavCamera(
    followDriver && !!smoothDriverPoint,
    smoothDriverPoint,
    driverBearing,
    order?.current_speed_mps,
  );

  useEffect(() => {
    if (smoothDriverPoint) {
      prevDriverPointRef.current = smoothDriverPoint;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smoothDriverPoint?.latitude, smoothDriverPoint?.longitude]);

  const presenceAge = computePresenceAgeSeconds(order?.driver_last_seen_at, nowTs);
  const presenceLevel = presenceLevelFromAge(presenceAge);
  const presenceTint = presenceColor(presenceLevel, colors);
  const presenceLabel =
    presenceLevel === 'online'
      ? t('tracking.driverOnline')
      : presenceLevel === 'warning'
      ? t('tracking.driverWeakSignal')
      : presenceLevel === 'stale'
      ? t('tracking.driverStale')
      : t('tracking.driverOffline');

  if (initialLoading && !order) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (!order) {
    return null;
  }

  const advertisement = typeof order.advertisement === 'object' ? order.advertisement : null;
  const driver = typeof order.driver === 'object' ? order.driver : null;

  const plannedRouteCoordinates = routePolyline;
  const routeStops = getSortedRouteStops(order.route_stops);
  const stopRouteCoordinates = routeStopsToMapCoordinates(routeStops);
  const mapRouteCoordinates =
    plannedRouteCoordinates.length > 1 ? plannedRouteCoordinates : stopRouteCoordinates;
  const activeRouteStop = getActiveRouteStop(routeStops);

  const trackCoordinates = filterTrackCoordinates(
    [...tracks]
      .reverse()
      .map((track) => parseTrack(track))
      .filter((p): p is LatLng => p != null)
  );

  const departurePoint = mapRouteCoordinates[0] ?? null;
  const destinationPoint =
    mapRouteCoordinates.length > 1 ? mapRouteCoordinates[mapRouteCoordinates.length - 1] : null;

  const mapPoints: LatLng[] = [
    ...plannedRouteCoordinates,
    ...trackCoordinates,
    ...(smoothDriverPoint ? [smoothDriverPoint] : []),
  ];
  const overviewRegion = regionFromBounds(mapPoints, 1.4) ?? DEFAULT_CENTER;
  const followNavigation = followDriver && !!smoothDriverPoint;
  const routeProgressM =
    order?.route_progress_m ??
    (smoothDriverPoint && mapRouteCoordinates.length > 1
      ? nearestProgressOnRoute(mapRouteCoordinates, smoothDriverPoint)
      : 0);
  const { traveled: traveledRoute, remaining: remainingRoute } = splitRouteByProgress(
    mapRouteCoordinates,
    routeProgressM,
  );
  const driverMoving = (order?.current_speed_mps ?? 0) >= 0.6;
  const navPhase = getDriverNavPhase(order?.status?.code);
  const phaseLabel =
    order?.status?.code === 'in_progress'
      ? t('tracking.phaseAtPickup')
      : navPhase === 'to_pickup'
      ? t('tracking.phaseToPickup')
      : navPhase === 'to_destination'
      ? t('tracking.phaseToDestination')
      : order?.status?.code === 'completed'
      ? t('orders.completed')
      : t('tracking.title');
  const openYandexMaps = (lat: number, lng: number) => {
    const url = Platform.select({
      ios: `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=15`,
      android: `yandexmaps://maps.yandex.ru/?pt=${lng},${lat}&z=15`,
    });
    if (url) {
      Linking.canOpenURL(url).then((supported) => {
        Linking.openURL(supported ? url : `https://yandex.ru/maps/?pt=${lng},${lat}&z=15`);
      });
    }
  };

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <LogistikaMap
          style={styles.map}
          center={
            followNavigation && navCamera
              ? navCamera.center
              : followNavigation && smoothDriverPoint
                ? smoothDriverPoint
                : overviewRegion
          }
          zoomLevel={followNavigation ? navCamera?.zoom : undefined}
          latitudeDelta={followNavigation ? undefined : overviewRegion.latitudeDelta}
          heading={followNavigation ? navCamera?.heading ?? driverBearing : 0}
          pitch={followNavigation ? navCamera?.pitch ?? 56 : 0}
          padding={followNavigation ? NAV_CAMERA_PADDING : undefined}
          cameraAnimationMs={0}
          cameraFollowRegion={followNavigation}
          onUserGesture={() => setFollowDriver(false)}>
          {traveledRoute.length > 1 ? (
            <LogistikaPolyline id="traveled-route" coordinates={traveledRoute} kind="traveled" />
          ) : null}
          {remainingRoute.length > 1 ? (
            <LogistikaPolyline id="remaining-route" coordinates={remainingRoute} kind="remaining" />
          ) : mapRouteCoordinates.length > 1 ? (
            <LogistikaPolyline
              id="planned-route"
              coordinates={mapRouteCoordinates}
              kind="planned"
              lineDashPattern={[8, 6]}
            />
          ) : null}
          {mapRouteCoordinates.length < 2 && trackCoordinates.length > 1 ? (
            <LogistikaPolyline id="driver-track" coordinates={trackCoordinates} kind="track" />
          ) : null}
          {routeStops.length === 0 && departurePoint && (
            <RoutePin id="departure" coordinate={departurePoint} kind="pickup" />
          )}
          {routeStops.length === 0 && destinationPoint && (
            <RoutePin id="destination" coordinate={destinationPoint} kind="dropoff" />
          )}
          {routeStops.map((stop, index) => {
            const point = stopToLatLng(stop);
            if (!point) {return null;}
            const isActiveStop = activeRouteStop?.id === stop.id;
            const kind =
              stop.status === 'completed'
                ? 'stop'
                : isActiveStop
                  ? 'active'
                  : stop.stop_type === 'pickup'
                    ? 'pickup'
                    : 'dropoff';
            return (
              <RoutePin
                key={`stop-${stop.id}`}
                id={`stop-${stop.id}`}
                coordinate={point}
                kind={kind}
                index={index + 1}
              />
            );
          })}
          {smoothDriverPoint ? (
            <DriverMarker
              coordinate={smoothDriverPoint}
              bearing={driverBearing}
              presenceColor={presenceTint}
              moving={driverMoving}
            />
          ) : null}
        </LogistikaMap>

        <TrackingPhaseBadge label={phaseLabel} icon={navPhase === 'to_destination' ? 'flag' : 'shipping'} />
        <MapRecenterFab
          visible={!followDriver && !!smoothDriverPoint}
          label={t('tracking.followDriver')}
          onPress={() => setFollowDriver(true)}
        />

        <View style={styles.mapOverlayTop}>
          <View style={[styles.liveBadge, { backgroundColor: presenceTint + 'E6' }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>
              {t('tracking.liveTracking')}
              {presenceAge != null ? ` · ${presenceAge}s` : ''}
            </Text>
          </View>
        </View>

        {!smoothDriverPoint && (
          <View style={styles.waitingBanner}>
            <Text style={styles.waitingText}>{t('tracking.waitingForDriverLocation')}</Text>
          </View>
        )}

        {order.active_sos ? (
          <View style={styles.sosBanner}>
            <SOSAlertPanel
              alert={order.active_sos}
              driverPhone={driver?.phone}
              readOnly
              compact
            />
          </View>
        ) : null}

        <View style={styles.legendRow}>
          <LegendDot color={colors.success} label={t('tracking.mapLegendDeparture')} />
          <LegendDot color={colors.logisticsAccent} label={t('tracking.mapLegendDestination')} />
          <LegendDot color={colors.primary} label={t('tracking.mapLegendDriver')} />
        </View>

        <TrackingBottomSheet
          expanded={detailsExpanded}
          onToggleExpand={() => setDetailsExpanded((prev) => !prev)}
          expandLabel={t('common.moreDetails')}
          collapseLabel={t('common.hide')}>
          <TrackingOrderSummary
            orderId={order.id}
            title={advertisement?.title}
            subtitle={
              driver
                ? `${t('orders.driver')}: ${driver.first_name} ${driver.last_name}`
                : undefined
            }
            statusLabel={presenceLabel}
            statusColor={presenceTint}
            meta={t('tracking.updatedEvery5s')}
          />

          {routeStops.length > 0 ? (
            <RouteStopsPanel order={order} stops={routeStops} t={t} embedded />
          ) : null}

          {!!order.tracking_summary && (
            <View style={styles.statsWrap}>
              <Text style={styles.sectionLabel}>{t('tracking.liveStats')}</Text>
              <TrackingStatsPanel order={order} compact />
            </View>
          )}

          {!!order.tracking_summary?.alert_level && !!order.tracking_summary?.alert_message && (
            <View
              style={[
                styles.alertCard,
                order.tracking_summary.alert_level === 'critical'
                  ? styles.alertCardCritical
                  : styles.alertCardWarning,
              ]}>
              <Text style={styles.alertTitle}>
                {order.tracking_summary.alert_level === 'critical'
                  ? t('tracking.criticalAlert')
                  : t('tracking.warningAlert')}
              </Text>
              <Text style={styles.alertText}>{order.tracking_summary.alert_message}</Text>
            </View>
          )}

          {smoothDriverPoint ? (
            <Button
              title={t('tracking.openInYandexMaps')}
              onPress={() => openYandexMaps(smoothDriverPoint.latitude, smoothDriverPoint.longitude)}
              variant="outline"
            />
          ) : null}

          {detailsExpanded ? (
            <View style={styles.detailsBlock}>
              <Text style={styles.sectionLabel}>{t('tracking.stopHistory')}</Text>
              <Text style={styles.note}>{t('tracking.stopHistoryHint')}</Text>
              <TrackingStopHistory tracks={tracks} />
            </View>
          ) : null}
        </TrackingBottomSheet>
      </View>
    </ScreenBackground>
  );
};

function parseTrack(track: OrderLocationTrack): LatLng | null {
  const lat = typeof track.lat === 'number' ? track.lat : parseFloat(String(track.lat));
  const lng = typeof track.lng === 'number' ? track.lng : parseFloat(String(track.lng));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {return null;}
  return { latitude: lat, longitude: lng };
}

function haversineEnough(a: LatLng, b: LatLng): boolean {
  const dLat = Math.abs(a.latitude - b.latitude);
  const dLng = Math.abs(a.longitude - b.longitude);
  return dLat + dLng > 0.00001;
}

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendLabel}>{label}</Text>
  </View>
);

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  mapOverlayTop: {
    position: 'absolute',
    top: spacing.md + 44,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    zIndex: 2,
  },
  paymentBanner: {
    position: 'absolute',
    top: spacing.md + 96,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.warningGlow,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    zIndex: 2,
  },
  paymentBannerText: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    gap: spacing.xs,
    maxWidth: '58%',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textLight,
  },
  liveBadgeText: {
    color: colors.textLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
    followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  followButtonActive: {
    backgroundColor: colors.primary,
  },
  followButtonText: {
    color: colors.textLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  followButtonTextInactive: {
    color: colors.primary,
  },
  waitingBanner: {
    position: 'absolute',
    bottom: 430,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.backgroundSecondary + 'F0',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    zIndex: 2,
  },
  waitingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  sosBanner: {
    position: 'absolute',
    top: spacing.xxxl + 48,
    left: spacing.md,
    right: spacing.md,
    zIndex: 3,
  },
  legendRow: {
    position: 'absolute',
    bottom: 410,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.backgroundSecondary + 'EE',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    zIndex: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: fontWeight.semibold },
  statsWrap: { gap: spacing.xs },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  detailsBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  note: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  alertCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
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
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  alertText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
});

export default ClientOrderTrackingScreen;
