import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  AppState,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  LogistikaMap,
  LogistikaPolyline,
  DriverMarker,
  RoutePin,
  MapRecenterFab,
  MapSpeedHud,
} from '../../components/map';
import { ordersService } from '../../services/ordersService';
import {
  getLastLocationAccess,
  resolveLocationAccess,
  subscribeLocationAccess,
  flushLocationQueue,
  LOCATION_POST_INTERVAL_MS,
} from '../../services/locationTrackingService';
import {
  startActiveOrderLocationSession,
  stopActiveOrderLocationSessionIfOrder,
  subscribeActiveOrderLocation,
  getActiveOrderLocationFix,
  type ActiveLocationFix,
} from '../../services/activeOrderLocationSession';
import { getOrderTrackingWsUrl } from '../../config/realtimeConfig';
import {
  filterTrackCoordinates,
  nearestProgressOnRoute,
  resolveDisplayHeading,
  splitRouteByProgress,
} from '../../utils/mapTracking';
import { downsamplePolyline } from '../../utils/liveTrackingPerf';
import { useSmoothDriverLocation } from '../../hooks/useSmoothDriverLocation';
import { useSmoothNavCamera } from '../../hooks/useSmoothNavCamera';
import { NAV_CAMERA_PADDING } from '../../config/mapCamera';
import { regionFromBounds, regionFromCenter, type LatLng } from '../../utils/mapGeo';
import {
  canDepartToDestination,
  canFinishTrip,
  canMutateRouteStops,
  canStartTrip,
  canPostLocationUpdates,
  ensureOrderRoutePlan,
  getActiveNavigationTarget,
  getDriverNavPhase,
  getEffectiveRouteEndpoints,
  resolveFallbackRouteEndpoints,
  routePointsToEndpoints,
  type OrderRouteEndpoints,
} from '../../utils/orderRoute';
import { openYandexNavigatorToAddress, openYandexNavigatorToPoint } from '../../utils/navigationLinks';
import { getEmbeddedAdvertisement, resolveOrderAdvertisement } from '../../utils/orderAdvertisement';
import { applyOrderRealtimePayload, appendLocationTrack } from '../../utils/trackingUpdates';
import { Advertisement, Order, OrderLocationTrack, OrderRouteStop } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ScreenBackground } from '../../components/ScreenBackground';
import { Button } from '../../components/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme';
import type { AppColors } from '../../theme/colors';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useAppTheme } from '../../theme/useAppTheme';
import { toastService } from '../../services/toastService';
import { getApiErrorMessage } from '../../services/errorService';
import { realtimeChannelService, RealtimeChannelHandle } from '../../services/realtimeChannelService';
import { TrackingStatsPanel } from '../../components/TrackingStatsPanel';
import { TrackingStopHistory } from '../../components/TrackingStopHistory';
import { RouteStopsPanel } from '../../components/RouteStopsPanel';
import { RouteStopManageSheet } from '../../components/RouteStopManageSheet';
import { RoutePlanSettingsSheet } from '../../components/RoutePlanSettingsSheet';
import { SOSButton } from '../../components/SOSButton';
import {
  TrackingBottomSheet,
  TrackingOrderSummary,
  TrackingPhaseBadge,
  TrackingTripActionBar,
} from '../../components/tracking/TrackingChrome';
import { handleStopAlertEvent } from '../../utils/trackingAlerts';
import {
  getPlannedRouteCoordinates,
  getSortedRouteStops,
  getActiveRouteStop,
  hydrateRouteStopCoordinates,
  routeStopsToMapCoordinates,
  stopToLatLng,
} from '../../utils/routeStops';

const OrderTrackingScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: number; autoStart?: boolean };
  const { t, currentLanguage } = useTranslation();

  const [order, setOrder] = useState<Order | null>(null);
  const [tracks, setTracks] = useState<OrderLocationTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<ActiveLocationFix | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [followCamera, setFollowCamera] = useState(true);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const heldHeadingRef = useRef(0);
  const [routeEndpoints, setRouteEndpoints] = useState<OrderRouteEndpoints | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [routeStops, setRouteStops] = useState<OrderRouteStop[]>([]);
  const [optimizingRoute, setOptimizingRoute] = useState(false);
  const [stopActionLoading, setStopActionLoading] = useState(false);
  const [stopManageVisible, setStopManageVisible] = useState(false);
  const [stopManageLoading, setStopManageLoading] = useState(false);
  const [routePlanVisible, setRoutePlanVisible] = useState(false);
  const [routePlanLoading, setRoutePlanLoading] = useState(false);
  const [advertisement, setAdvertisement] = useState<Advertisement | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [backgroundLocationGranted, setBackgroundLocationGranted] = useState(
    () => getLastLocationAccess().background,
  );
  const channelRef = useRef<RealtimeChannelHandle | null>(null);

  useEffect(() => {
    setOrder(null);
    setRouteStops([]);
    setTracks([]);
    setLoading(true);

    const init = async () => {
      const access = await resolveLocationAccess(t);
      setLocationGranted(access.foreground);
      setBackgroundLocationGranted(access.background);
      if (!access.foreground) {
        setTrackingActive(false);
      }
      const existingFix = getActiveOrderLocationFix();
      if (existingFix) {
        setCurrentLocation(existingFix);
      }
      await flushLocationQueue();
      await loadOrder();
      await loadTracking();
    };
    init();
    const unsubscribeLocation = subscribeActiveOrderLocation((fix) => {
      setCurrentLocation(fix);
    });
    const unsubscribeAccess = subscribeLocationAccess((access) => {
      setLocationGranted(access.foreground);
      setBackgroundLocationGranted(access.background);
    });
    return () => {
      unsubscribeLocation();
      unsubscribeAccess();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t]);

  useEffect(() => {
    channelRef.current?.stop();
    channelRef.current = realtimeChannelService.createChannel({
      wsUrl: getOrderTrackingWsUrl(id),
      onMessage: (payload) => {
        if (payload.type === 'stop_alert' && Number(payload.order_id) === id) {
          handleStopAlertEvent(payload, { fallbackMessage: t('tracking.longStopAlert') });
          loadOrder();
          loadTracking();
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
          if (payload.type === 'order_payment_updated') {
            toastService.info(t('orders.paymentUpdated'));
          }
          if (payload.type === 'route_stop_arrived' || payload.type === 'route_stop_completed') {
            loadOrder();
            loadTracking();
          }
        }
      },
      onPoll: async () => {
        await loadOrder();
        await loadTracking();
      },
      pollIntervalMs: LOCATION_POST_INTERVAL_MS,
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        flushLocationQueue().catch(() => undefined);
        void resolveLocationAccess(t).then((access) => {
          setLocationGranted(access.foreground);
          setBackgroundLocationGranted(access.background);
        });
      }
    });

    return () => {
      appStateSub.remove();
      channelRef.current?.stop();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t]);

  useEffect(() => {
    if (trackingActive && locationGranted) {
      void startActiveOrderLocationSession(id, t).then((ok) => {
        setLocationGranted(ok);
        setBackgroundLocationGranted(getLastLocationAccess().background);
        if (!ok) {
          setTrackingActive(false);
        }
      });
      return;
    }
    void stopActiveOrderLocationSessionIfOrder(id);
  }, [trackingActive, locationGranted, id, t]);

  const syncRouteStops = async (orderData: Order) => {
    let stops = getSortedRouteStops(orderData.route_stops);
    if (!stops.length) {
      try {
        stops = await ordersService.getRouteStops(id);
      } catch {
        stops = [];
      }
    }
    if (stops.length) {
      try {
        stops = await hydrateRouteStopCoordinates(id, stops, ordersService.updateRouteStop);
      } catch {
        // Geocoding is best-effort for map/optimization.
      }
    }
    setRouteStops(stops);
    return stops;
  };

  const loadOrder = async () => {
    try {
      const data = await ordersService.getOrder(id);
      const resolvedAd = await resolveOrderAdvertisement(data);
      const stops = await syncRouteStops(data);
      const enrichedOrder = {
        ...data,
        ...(resolvedAd && typeof data.advertisement !== 'object' ? { advertisement: resolvedAd } : {}),
        route_stops: stops,
      };
      setOrder(enrichedOrder);
      setAdvertisement(resolvedAd);
      const fromServer = routePointsToEndpoints(enrichedOrder.planned_route_points);
      if (fromServer) {
        setRouteEndpoints(fromServer);
      } else if (resolvedAd) {
        const fallback = resolveFallbackRouteEndpoints(resolvedAd);
        if (fallback) {setRouteEndpoints(fallback);}
        const endpoints = await ensureOrderRoutePlan(id, enrichedOrder, resolvedAd);
        if (endpoints) {setRouteEndpoints(endpoints);}
      }
      setTrackingActive(canPostLocationUpdates(data.status?.code));
    } catch (error) {
      console.error('Error loading order:', error);
      setRouteStops([]);
    }
  };

  const loadTracking = async () => {
    try {
      const data = await ordersService.getOrderTracking(id);
      setTracks(data);
    } catch (error) {
      console.error('Error loading tracking:', error);
    } finally {
      setLoading(false);
    }
  };

  const embeddedAdvertisement = advertisement ?? getEmbeddedAdvertisement(order);
  const departureCity =
    embeddedAdvertisement &&
    typeof embeddedAdvertisement.departure_city === 'object' &&
    embeddedAdvertisement.departure_city
      ? embeddedAdvertisement.departure_city.name
      : '';
  const destinationCity =
    embeddedAdvertisement &&
    typeof embeddedAdvertisement.destination_city === 'object' &&
    embeddedAdvertisement.destination_city
      ? embeddedAdvertisement.destination_city.name
      : '';

  const effectiveEndpoints = getEffectiveRouteEndpoints(embeddedAdvertisement, routeEndpoints, order);
  const navPhase = getDriverNavPhase(order?.status?.code);
  const activeTarget = getActiveNavigationTarget(navPhase, effectiveEndpoints, order);

  const handleOptimizeRoute = async () => {
    try {
      setOptimizingRoute(true);
      const preference =
        embeddedAdvertisement?.route_preference === 'fastest' ||
        embeddedAdvertisement?.route_preference === 'cheapest' ||
        embeddedAdvertisement?.route_preference === 'no_toll'
          ? embeddedAdvertisement.route_preference
          : 'balanced';
      const result = await ordersService.optimizeRoute(id, preference);
      setOrder(result.order);
      setRouteStops(getSortedRouteStops(result.order.route_stops));
      const endpoints = routePointsToEndpoints(result.order.planned_route_points);
      if (endpoints) {setRouteEndpoints(endpoints);}
      toastService.success(t('tracking.routeOptimized'));
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('tracking.routeOptimizeError')));
    } finally {
      setOptimizingRoute(false);
    }
  };

  const handleCompleteRouteStop = async (stop: OrderRouteStop) => {
    try {
      setStopActionLoading(true);
      const updated = await ordersService.completeRouteStop(id, stop.id);
      setOrder(updated);
      setRouteStops(getSortedRouteStops(updated.route_stops));
      const wasPickup = stop.stop_type === 'pickup';
      if (wasPickup && updated.status?.code === 'in_transit') {
        toastService.success(t('orders.departedToDestination'));
        setTrackingActive(true);
      } else {
        toastService.success(t('tracking.stopCompleted'));
      }
      await loadOrder();
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('errors.unknownError')));
    } finally {
      setStopActionLoading(false);
    }
  };

  const submitSkipRouteStop = async (
    stop: OrderRouteStop,
    skipReason: 'warehouse_closed' | 'customer_absent' | 'access_denied',
  ) => {
    try {
      setStopActionLoading(true);
      const updated = await ordersService.completeRouteStop(id, stop.id, {
        skip: true,
        skip_reason: skipReason,
      });
      setOrder(updated);
      setRouteStops(getSortedRouteStops(updated.route_stops));
      toastService.success(t('tracking.stopSkipped'));
      await loadOrder();
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('errors.unknownError')));
    } finally {
      setStopActionLoading(false);
    }
  };

  const handleSkipRouteStop = (stop: OrderRouteStop) => {
    Alert.alert(
      t('tracking.skipStopTitle'),
      t('tracking.skipStopConfirm', { label: stop.label || stop.address }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('tracking.skipReason.warehouse_closed'),
          onPress: () => {
            void submitSkipRouteStop(stop, 'warehouse_closed');
          },
        },
        {
          text: t('tracking.skipReason.customer_absent'),
          onPress: () => {
            void submitSkipRouteStop(stop, 'customer_absent');
          },
        },
        {
          text: t('tracking.skipReason.access_denied'),
          onPress: () => {
            void submitSkipRouteStop(stop, 'access_denied');
          },
        },
      ],
    );
  };

  const handleAddRouteStop = async (payload: {
    address: string;
    label?: string;
    stop_type: 'pickup' | 'delivery';
  }) => {
    try {
      setStopManageLoading(true);
      const stop = await ordersService.addRouteStop(id, payload);
      const refreshed = await ordersService.getRouteStops(id);
      setRouteStops(getSortedRouteStops(refreshed));
      toastService.success(t('tracking.routeStopManage.added', { label: stop.label || stop.address }));
      await loadOrder();
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('tracking.routeStopManage.addFailed')));
    } finally {
      setStopManageLoading(false);
    }
  };

  const handleDeleteRouteStop = async (stopId: number) => {
    try {
      setStopManageLoading(true);
      await ordersService.deleteRouteStop(id, stopId);
      const refreshed = await ordersService.getRouteStops(id);
      setRouteStops(getSortedRouteStops(refreshed));
      toastService.success(t('tracking.routeStopManage.deleted'));
      await loadOrder();
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('tracking.routeStopManage.deleteFailed')));
    } finally {
      setStopManageLoading(false);
    }
  };

  const handleUpdateRouteStop = async (
    stopId: number,
    payload: {
      address?: string;
      label?: string;
      lat?: number;
      lng?: number;
      geofence_radius_meters?: number;
    },
  ) => {
    try {
      setStopManageLoading(true);
      await ordersService.updateRouteStop(id, stopId, payload);
      const refreshed = await ordersService.getRouteStops(id);
      setRouteStops(getSortedRouteStops(refreshed));
      toastService.success(t('tracking.routeStopManage.updated'));
      await loadOrder();
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('tracking.routeStopManage.updateFailed')));
    } finally {
      setStopManageLoading(false);
    }
  };

  const handleSaveRoutePlan = async (payload: {
    thresholdMeters: number;
    pickupGeofenceRadiusMeters: number;
    destinationGeofenceRadiusMeters: number;
  }) => {
    if (!order) {
      return;
    }
    const points =
      order.planned_route_points?.filter((point) => point.lat != null && point.lng != null).map((point) => ({
        lat: Number(point.lat),
        lng: Number(point.lng),
        label: point.label,
        address: point.address,
      })) ?? [];
    if (points.length < 2) {
      toastService.error(t('tracking.routePlan.notEnoughPoints'));
      return;
    }
    try {
      setRoutePlanLoading(true);
      const updated = await ordersService.setRoutePlan(id, points, {
        thresholdMeters: payload.thresholdMeters,
        pickupGeofenceRadiusMeters: payload.pickupGeofenceRadiusMeters,
        destinationGeofenceRadiusMeters: payload.destinationGeofenceRadiusMeters,
      });
      setOrder(updated);
      toastService.success(t('tracking.routePlan.saved'));
      setRoutePlanVisible(false);
    } catch (error: unknown) {
      toastService.error(getApiErrorMessage(error, t('tracking.routePlan.saveFailed')));
    } finally {
      setRoutePlanLoading(false);
    }
  };

  const navigateToRouteStop = async (stop: OrderRouteStop) => {
    const point = stopToLatLng(stop);
    if (point) {
      await openYandexNavigatorToPoint(point, '', stop.address);
      return;
    }
    await openYandexNavigatorToAddress('', stop.address);
  };

  const navigateToDestination = async () => {
    if (!embeddedAdvertisement) {return;}
    if (effectiveEndpoints?.destination) {
      await openYandexNavigatorToPoint(
        effectiveEndpoints.destination,
        destinationCity,
        embeddedAdvertisement.destination_address,
      );
      return;
    }
    await openYandexNavigatorToAddress(destinationCity, embeddedAdvertisement.destination_address);
  };

  const openActiveNavigation = async () => {
    if (!embeddedAdvertisement) {return;}
    const isPickup = navPhase === 'to_pickup';
    const city = isPickup ? departureCity : destinationCity;
    const address = isPickup
      ? embeddedAdvertisement.departure_address
      : embeddedAdvertisement.destination_address;
    const point = isPickup ? effectiveEndpoints?.departure : effectiveEndpoints?.destination;
    if (point) {
      await openYandexNavigatorToPoint(point, city, address);
      return;
    }
    await openYandexNavigatorToAddress(city, address);
  };

  const runDepartTrip = async () => {
    const activeAd = embeddedAdvertisement ?? (await resolveOrderAdvertisement(order));
    if (!activeAd) {
      toastService.error(t('orders.orderNotLoaded'));
      await loadOrder();
      return;
    }
    if (!embeddedAdvertisement) {
      setAdvertisement(activeAd);
    }
    try {
      setActionLoading(true);
      const updated = await ordersService.departOrder(id);
      const updatedAd = await resolveOrderAdvertisement(updated);
      setOrder(updatedAd ? { ...updated, advertisement: updatedAd } : updated);
      if (updatedAd) {setAdvertisement(updatedAd);}
      setTrackingActive(true);
      try {
        await navigateToDestination();
      } catch {
        toastService.info(t('tracking.openInYandexMaps'));
      }
      await loadOrder();
      toastService.success(t('orders.departedToDestination'));
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, t('errors.unknownError'));
      toastService.error(message);
      Alert.alert(t('common.error'), message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartTrip = () => {
    void (async () => {
      const activeAd = embeddedAdvertisement ?? (await resolveOrderAdvertisement(order));
      if (!activeAd) {
        toastService.error(t('orders.orderNotLoaded'));
        await loadOrder();
        return;
      }
      Alert.alert(t('orders.startOrder'), t('orders.startOrderConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('orders.startOrder'),
        onPress: () => {
          void (async () => {
            try {
              setActionLoading(true);
              const updated = await ordersService.startOrder(id);
              const updatedAd = await resolveOrderAdvertisement(updated);
              setOrder(updatedAd ? { ...updated, advertisement: updatedAd } : updated);
              if (updatedAd) {setAdvertisement(updatedAd);}
              setTrackingActive(true);
              void startActiveOrderLocationSession(id, t);
              if (effectiveEndpoints?.departure) {
                await openYandexNavigatorToPoint(
                  effectiveEndpoints.departure,
                  departureCity,
                  activeAd.departure_address,
                );
              } else {
                await openYandexNavigatorToAddress(departureCity, activeAd.departure_address);
              }
              await loadOrder();
              toastService.success(t('orders.orderStarted'));
            } catch (error: unknown) {
              const message = getApiErrorMessage(error, t('errors.unknownError'));
              toastService.error(message);
              Alert.alert(t('common.error'), message);
            } finally {
              setActionLoading(false);
            }
          })();
        },
      },
    ]);
    })();
  };

  const handleFinishTrip = () => {
    if (order && !order.proof_of_delivery) {
      Alert.alert(t('common.error'), t('orders.podRequiredBeforeComplete'));
      (navigation as any).navigate('OrderDetail', { id });
      return;
    }
    (navigation as any).navigate('OrderDetail', { id });
  };

  const handleDepartTrip = () => {
    void runDepartTrip();
  };

  const plannedPolyline = useMemo(() => getPlannedRouteCoordinates(order), [order]);

  const driverMotion = useMemo(() => {
    if (currentLocation) {
      const point = { latitude: currentLocation.lat, longitude: currentLocation.lng };
      const progress =
        order?.route_progress_m ??
        (plannedPolyline.length > 1 ? nearestProgressOnRoute(plannedPolyline, point) : null);
      return {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        heading: currentLocation.heading ?? null,
        speedMps: currentLocation.speedMps ?? null,
        updatedAtMs: currentLocation.updatedAtMs ?? Date.now(),
        routeProgressM: progress,
      };
    }
    const lastTrack = tracks[0];
    if (!lastTrack) {
      return null;
    }
    const latitude = typeof lastTrack.lat === 'number' ? lastTrack.lat : parseFloat(String(lastTrack.lat));
    const longitude = typeof lastTrack.lng === 'number' ? lastTrack.lng : parseFloat(String(lastTrack.lng));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      latitude,
      longitude,
      heading: order?.current_heading ?? null,
      speedMps: order?.current_speed_mps ?? null,
      updatedAtMs: Date.now(),
      routeProgressM: order?.route_progress_m ?? null,
    };
  }, [
    currentLocation,
    tracks,
    order?.route_progress_m,
    order?.current_heading,
    order?.current_speed_mps,
    plannedPolyline,
  ]);

  const smoothDriverPoint = useSmoothDriverLocation(
    driverMotion,
    true,
    plannedPolyline.length > 1 ? plannedPolyline : null,
  );

  const displayHeading = resolveDisplayHeading(
    driverMotion?.heading,
    driverMotion?.speedMps,
    heldHeadingRef.current,
  );
  heldHeadingRef.current = displayHeading;

  const navCamera = useSmoothNavCamera(
    followCamera && !!smoothDriverPoint,
    smoothDriverPoint,
    displayHeading,
    driverMotion?.speedMps,
  );

  if (loading && !order) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (!order) {
    return (
      <ScreenBackground>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('orders.orderNotLoaded')}</Text>
          <Button
            title={t('common.refresh')}
            onPress={() => {
              setLoading(true);
              void loadOrder().finally(() => loadTracking());
            }}
            variant="primary"
            style={styles.navButton}
          />
        </View>
      </ScreenBackground>
    );
  }

  const plannedRouteCoordinates = getPlannedRouteCoordinates(order);
  const stopRouteCoordinates = routeStopsToMapCoordinates(routeStops);
  const fallbackRouteCoordinates =
    plannedRouteCoordinates.length > 1
      ? plannedRouteCoordinates
      : stopRouteCoordinates.length > 1
      ? stopRouteCoordinates
      : effectiveEndpoints != null
      ? [effectiveEndpoints.departure, effectiveEndpoints.destination]
      : [];
  const mapRouteCoordinates =
    plannedRouteCoordinates.length > 1
      ? plannedRouteCoordinates
      : stopRouteCoordinates.length > 1
      ? stopRouteCoordinates
      : fallbackRouteCoordinates;

  const coordinates = downsamplePolyline(
    filterTrackCoordinates(
    tracks
      .map((track) => ({
        latitude: typeof track.lat === 'number' ? track.lat : parseFloat(String(track.lat)),
        longitude: typeof track.lng === 'number' ? track.lng : parseFloat(String(track.lng)),
      }))
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .reverse(),
    ),
  );

  const lastTrack = tracks.length > 0 ? tracks[0] : null;
  const driverPoint: LatLng | null = smoothDriverPoint;

  const mapBoundsPoints: LatLng[] = [...mapRouteCoordinates];
  if (driverPoint) {mapBoundsPoints.push(driverPoint);}
  const mapRegion =
    regionFromBounds(mapBoundsPoints) ?? regionFromCenter(41.3111, 69.2797, 0.12);

  const driverBearing = displayHeading;
  const driverMoving = (driverMotion?.speedMps ?? 0) >= 0.6;
  const followNavigation = followCamera && !!driverPoint;
  const routeProgressM =
    driverMotion?.routeProgressM ??
    (driverPoint && mapRouteCoordinates.length > 1
      ? nearestProgressOnRoute(mapRouteCoordinates, driverPoint)
      : 0);
  const { traveled: traveledRoute, remaining: remainingRoute } = splitRouteByProgress(
    mapRouteCoordinates,
    routeProgressM,
  );

  const activeRouteStop = getActiveRouteStop(routeStops);
  const activeStopPoint = activeRouteStop ? stopToLatLng(activeRouteStop) : null;
  const activeLegCoordinates =
    driverPoint && activeStopPoint
      ? [driverPoint, activeStopPoint]
      : driverPoint && activeTarget
      ? [driverPoint, activeTarget]
      : [];

  const isMandatoryTracking =
    order?.status?.code === 'in_progress' || order?.status?.code === 'in_transit';
  const locationMeta = [
    isMandatoryTracking
      ? t('tracking.locationSharingMandatory')
      : `${t('tracking.locationSharing')}: ${trackingActive ? t('tracking.locationSharingOn') : t('tracking.locationSharingOff')}`,
    trackingActive && locationGranted && !backgroundLocationGranted
      ? t('tracking.backgroundLocationLimited')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const pickupArrived = routeStops.some(
    (stop) => stop.stop_type === 'pickup' && stop.status === 'arrived',
  );
  const canDepart = canDepartToDestination(order?.status?.code, routeStops);

  const phaseLabel =
    order?.status?.code === 'in_progress'
      ? pickupArrived
        ? t('tracking.phaseAtPickup')
        : t('tracking.phaseToPickup')
      : navPhase === 'to_pickup'
      ? t('tracking.phaseToPickup')
      : navPhase === 'to_destination'
      ? t('tracking.phaseToDestination')
      : t('tracking.title');

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <LogistikaMap
        style={styles.map}
        center={
          followNavigation && navCamera
            ? navCamera.center
            : followNavigation && driverPoint
              ? driverPoint
              : mapRegion
        }
        zoomLevel={followNavigation ? navCamera?.zoom : undefined}
        latitudeDelta={followNavigation ? undefined : mapRegion.latitudeDelta}
        heading={followNavigation ? navCamera?.heading ?? driverBearing : 0}
        pitch={followNavigation ? navCamera?.pitch ?? 56 : 0}
        padding={followNavigation ? NAV_CAMERA_PADDING : undefined}
        cameraAnimationMs={followNavigation ? 0 : 0}
        cameraFollowRegion={followNavigation}
        onTouchStart={() => {
          if (followNavigation) {
            setFollowCamera(false);
          }
        }}
        onUserGesture={() => setFollowCamera(false)}>
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
            lineDashPattern={[10, 8]}
          />
        ) : null}
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
              label={isActiveStop ? t('tracking.activeStopLabel') : undefined}
            />
          );
        })}
        {remainingRoute.length < 2 && activeLegCoordinates.length === 2 && (
          <LogistikaPolyline
            id="active-leg"
            coordinates={activeLegCoordinates}
            strokeColor={navPhase === 'to_destination' ? colors.logisticsAccent : colors.primary}
            kind="remaining"
          />
        )}
        {mapRouteCoordinates.length < 2 && coordinates.length > 1 && (
          <LogistikaPolyline
            id="driver-track"
            coordinates={coordinates}
            kind="track"
          />
        )}
        {routeStops.length === 0 && effectiveEndpoints?.departure && (
          <RoutePin id="departure" coordinate={effectiveEndpoints.departure} kind="pickup" />
        )}
        {routeStops.length === 0 && effectiveEndpoints?.destination && (
          <RoutePin id="destination" coordinate={effectiveEndpoints.destination} kind="dropoff" />
        )}
        {driverPoint && (
          <DriverMarker coordinate={driverPoint} bearing={driverBearing} moving={driverMoving} />
        )}
      </LogistikaMap>

      <TrackingPhaseBadge label={phaseLabel} icon={navPhase === 'to_destination' ? 'flag' : 'shipping'} />
      <MapSpeedHud
        visible={driverMoving}
        kmh={(driverMotion?.speedMps ?? 0) * 3.6}
        unitLabel={t('tracking.kmh')}
      />
      <MapRecenterFab
        visible={!followCamera && !!driverPoint}
        label={t('tracking.followMe')}
        onPress={() => setFollowCamera(true)}
      />

      <TrackingBottomSheet
        expanded={detailsExpanded}
        onToggleExpand={() => setDetailsExpanded((prev) => !prev)}
        expandLabel={t('common.moreDetails')}
        collapseLabel={t('common.hide')}>
        <TrackingOrderSummary
          orderId={order.id}
          title={embeddedAdvertisement?.title}
          subtitle={
            embeddedAdvertisement
              ? `${departureCity} → ${destinationCity}`
              : undefined
          }
          statusLabel={phaseLabel}
          statusColor={colors.primary}
          meta={locationMeta}
        />

        {(canStartTrip(order.status?.code) ||
          canDepart ||
          canFinishTrip(order.status?.code)) && (
          <TrackingTripActionBar
            hint={canFinishTrip(order.status?.code) ? t('tracking.finishDeliveryHint') : undefined}>
            {canStartTrip(order.status?.code) ? (
              <Button
                title={t('orders.startOrder')}
                onPress={handleStartTrip}
                loading={actionLoading}
                variant="primary"
              />
            ) : null}
            {canDepart ? (
              <Button
                title={t('orders.poexali')}
                onPress={handleDepartTrip}
                loading={actionLoading}
                disabled={actionLoading}
                variant="primary"
              />
            ) : null}
            {canFinishTrip(order.status?.code) ? (
              <Button
                title={t('tracking.finishDelivery')}
                onPress={handleFinishTrip}
                variant="success"
              />
            ) : null}
          </TrackingTripActionBar>
        )}

        {routeStops.length > 0 ? (
          <>
            <RouteStopsPanel
              order={order}
              stops={routeStops}
              t={t}
              embedded
              showDriverActions
              optimizing={optimizingRoute}
              actionLoading={stopActionLoading}
              onOptimize={handleOptimizeRoute}
              onCompleteStop={handleCompleteRouteStop}
              onSkipStop={handleSkipRouteStop}
              onNavigateStop={navigateToRouteStop}
              onManageStops={
                canMutateRouteStops(order.status?.code)
                  ? () => setStopManageVisible(true)
                  : undefined
              }
              onOpenSettings={
                canMutateRouteStops(order.status?.code)
                  ? () => setRoutePlanVisible(true)
                  : undefined
              }
            />
            <RouteStopManageSheet
              visible={stopManageVisible}
              stops={routeStops}
              loading={stopManageLoading}
              onClose={() => setStopManageVisible(false)}
              onAddStop={handleAddRouteStop}
              onUpdateStop={handleUpdateRouteStop}
              onDeleteStop={handleDeleteRouteStop}
            />
            <RoutePlanSettingsSheet
              visible={routePlanVisible}
              order={order}
              loading={routePlanLoading}
              onClose={() => setRoutePlanVisible(false)}
              onSave={handleSaveRoutePlan}
            />
          </>
        ) : embeddedAdvertisement ? (
          <View style={styles.routeOverview}>
            <Text style={styles.routeOverviewTitle}>{t('tracking.routeOverview')}</Text>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, styles.routeDotDeparture]} />
              <View style={styles.routeTextWrap}>
                <Text style={styles.routeCity}>{departureCity}</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {embeddedAdvertisement.departure_address}
                </Text>
              </View>
            </View>
            <View style={styles.routeConnector} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, styles.routeDotDestination]} />
              <View style={styles.routeTextWrap}>
                <Text style={styles.routeCity}>{destinationCity}</Text>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {embeddedAdvertisement.destination_address}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {!!order.tracking_summary && (
          <View style={styles.statsPanelWrap}>
            <TrackingStatsPanel order={order} compact />
          </View>
        )}

        {activeTarget && routeStops.length === 0 ? (
          <Button
            title={t('tracking.openNavigation')}
            onPress={openActiveNavigation}
            variant="outline"
            style={styles.navButton}
          />
        ) : null}

        {detailsExpanded ? (
          <View style={styles.detailsBlock}>
            {!isMandatoryTracking ? (
              <View style={styles.toggleContainer}>
                <Text style={styles.toggleLabel}>{t('tracking.locationSharing')}</Text>
                <Button
                  title={trackingActive ? t('tracking.stop') : t('tracking.start')}
                  onPress={() => setTrackingActive(!trackingActive)}
                  variant={trackingActive ? 'danger' : 'outline'}
                  size="sm"
                  style={styles.toggleButton}
                />
              </View>
            ) : null}
            {currentLocation ? (
              <Text style={styles.infoText}>
                {t('tracking.latitude')}: {currentLocation.lat.toFixed(6)} · {t('tracking.longitude')}:{' '}
                {currentLocation.lng.toFixed(6)}
              </Text>
            ) : null}
            {lastTrack ? (
              <Text style={styles.infoText}>
                {t('tracking.lastUpdate')}:{' '}
                {new Date(lastTrack.timestamp).toLocaleTimeString(
                  currentLanguage === 'ru' ? 'ru-RU' : currentLanguage === 'en' ? 'en-US' : 'uz-UZ',
                )}
              </Text>
            ) : null}
            <Text style={styles.infoText}>
              {t('tracking.totalPoints')}: {tracks.length}
            </Text>
            <View style={styles.stopHistoryWrap}>
              <Text style={styles.stopHistoryTitle}>{t('tracking.stopHistory')}</Text>
              <Text style={styles.stopHistoryHint}>{t('tracking.stopHistoryHint')}</Text>
              <TrackingStopHistory tracks={tracks} maxItems={5} />
            </View>
          </View>
        ) : null}
        {order && ['in_progress', 'in_transit'].includes(order.status?.code || '') && (
          <SOSButton orderId={order.id} disabled={!!order.active_sos} />
        )}
      </TrackingBottomSheet>
    </View>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  phaseBadge: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  phaseBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  routeOverview: {
    marginBottom: spacing.md,
  },
  routeOverviewTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  routeDotDeparture: {
    backgroundColor: colors.success,
  },
  routeDotDestination: {
    backgroundColor: colors.logisticsAccent,
  },
  routeConnector: {
    width: 2,
    height: 14,
    backgroundColor: colors.border,
    marginLeft: 4,
    marginVertical: 2,
  },
  routeTextWrap: {
    flex: 1,
  },
  routeCity: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  routeAddress: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  statsPanelWrap: {
    marginTop: spacing.xs,
  },
  detailsBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  stopHistoryWrap: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  stopHistoryTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  stopHistoryHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  primaryAction: {
    marginBottom: spacing.sm,
  },
  finishHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  paymentWarning: {
    fontSize: fontSize.sm,
    color: colors.warning,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  etaText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  infoCardCollapsed: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    maxHeight: 340,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 380,
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  bottomSheetExpanded: {
    maxHeight: 520,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    paddingBottom: spacing.lg,
  },
  infoCardInner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  infoCardExpanded: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  infoTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  toggleButton: {
    marginLeft: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mandatoryText: {
    fontSize: fontSize.xs,
    color: colors.warning,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  intervalHint: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  expandText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  navButtons: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  navButton: {
    marginTop: 0,
    marginBottom: 0,
  },
  emptyCard: {
    margin: 16,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default OrderTrackingScreen;
