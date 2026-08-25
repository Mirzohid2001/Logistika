import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Alert,
  Linking,
  Vibration,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LogistikaMap, LogistikaMarker, LogistikaPolyline } from '../../components/map';
import type { MapRegion } from '../../utils/mapGeo';
import { dispatcherService } from '../../services/dispatcherService';
import { ordersService } from '../../services/ordersService';
import { toastService } from '../../services/toastService';
import { Card } from '../../components/Card';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { DispatcherMonitoring, DispatcherExceptionType, Order, OrderRouteStop, OrderSOSAlert } from '../../types';
import { RouteStopsPanel } from '../../components/RouteStopsPanel';
import { SOSAlertPanel } from '../../components/SOSAlertPanel';
import { getPlannedRouteCoordinates, getSortedRouteStops, stopToLatLng } from '../../utils/routeStops';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppTheme } from '../../theme/useAppTheme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { ScreenBackground } from '../../components/ScreenBackground';
import { AppHeader } from '../../components/AppHeader';
import { EmptyState } from '../../components/EmptyState';
import { createDispatcherMonitoringStyles } from './dispatcherMonitoringStyles';
import { realtimeChannelService, RealtimeChannelHandle } from '../../services/realtimeChannelService';
import { TrackingStatsPanel } from '../../components/TrackingStatsPanel';
import { TrackingQuickChips } from '../../components/TrackingQuickChips';
import { handleStopAlertEvent } from '../../utils/trackingAlerts';
import { getDispatcherTrackingWsUrl } from '../../config/realtimeConfig';
import { useSmoothFleetLocations } from '../../hooks/useSmoothFleetLocations';
import { resolveDisplayHeading } from '../../utils/mapTracking';

const { height } = Dimensions.get('window');
const LOCATION_FLUSH_MS = 200;

interface DriverLocation {
  driver: {
    id: number;
    first_name: string;
    last_name: string;
    phone: string;
  };
  order: {
    id: number;
    status: {
      code: string;
      name: string;
    };
  } | null;
  location: {
    lat: number;
    lng: number;
  } | null;
  vehicle: any;
  location_updated_at?: string | null;
  driver_last_seen_at?: string | null;
  driver_app_state?: string | null;
  speed_mps?: number | null;
  heading?: number | null;
  route_progress_m?: number | null;
  driver_presence?: {
    status: 'online' | 'offline' | string;
    stale_level: 'online' | 'warning' | 'stale' | 'offline' | string;
    age_seconds?: number | null;
  } | null;
  tracking_summary?: Order['tracking_summary'];
  estimated_eta_minutes?: number | null;
}

interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

type DriverPresenceLevel = 'online' | 'warning' | 'stale' | 'offline';

function resolveDriverPresenceLevel(driver: DriverLocation, nowTs: number): DriverPresenceLevel {
  const backendLevel = driver.driver_presence?.stale_level;
  if (
    backendLevel === 'online' ||
    backendLevel === 'warning' ||
    backendLevel === 'stale' ||
    backendLevel === 'offline'
  ) {
    return backendLevel;
  }
  const seenAt = driver.driver_last_seen_at || driver.location_updated_at;
  if (!seenAt) {
    return 'offline';
  }
  const ageSec = Math.max(0, Math.floor((nowTs - new Date(seenAt).getTime()) / 1000));
  if (ageSec <= 30) {return 'online';}
  if (ageSec <= 60) {return 'warning';}
  if (ageSec <= 180) {return 'stale';}
  return 'offline';
}

function resolveDriverPresenceAgeSeconds(driver: DriverLocation, nowTs: number): number | null {
  if (driver.driver_presence?.age_seconds != null) {
    return Math.max(0, Math.floor(Number(driver.driver_presence.age_seconds)));
  }
  const seenAt = driver.driver_last_seen_at || driver.location_updated_at;
  if (!seenAt) {
    return null;
  }
  return Math.max(0, Math.floor((nowTs - new Date(seenAt).getTime()) / 1000));
}

const DispatcherMonitoringScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useThemedStyles((c) => createDispatcherMonitoringStyles(c, height));
  const [monitoring, setMonitoring] = useState<DispatcherMonitoring | null>(null);
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [autoFollowMap, setAutoFollowMap] = useState(true);
  const [mapRegion, setMapRegion] = useState<MapRegion>({
    latitude: 41.2995,
    longitude: 69.2401,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });
  const [lastLiveUpdateAt, setLastLiveUpdateAt] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedRouteStops, setSelectedRouteStops] = useState<OrderRouteStop[]>([]);
  const [selectedPlannedRoute, setSelectedPlannedRoute] = useState<RoutePoint[]>([]);
  const [selectedRouteCoords, setSelectedRouteCoords] = useState<RoutePoint[]>([]);
  const [routePlaybackSpeed, setRoutePlaybackSpeed] = useState<1 | 2>(1);
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);
  const [performanceMode, setPerformanceMode] = useState(true);
  const channelRef = useRef<RealtimeChannelHandle | null>(null);
  const mapRegionRef = useRef<MapRegion>(mapRegion);
  const playbackRef = useRef<NodeJS.Timeout | null>(null);
  const [exceptionTypeFilter, setExceptionTypeFilter] = useState<'all' | DispatcherExceptionType>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [sortMode, setSortMode] = useState<'severity' | 'newest'>('severity');
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [actionSuccessKey, setActionSuccessKey] = useState<string | null>(null);
  const [delayThresholdMinutes, setDelayThresholdMinutes] = useState<60 | 120 | 180>(120);
  const [routeDeviationLive, setRouteDeviationLive] = useState<{
    orderId: number;
    driverId: number;
    distanceMeters: number;
    thresholdMeters: number;
    updatedAt: string;
  } | null>(null);
  const [activeSosAlerts, setActiveSosAlerts] = useState<OrderSOSAlert[]>([]);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const monitoringLoadInFlightRef = useRef(false);
  const wsConnectedRef = useRef(false);
  const pendingLocationUpdatesRef = useRef<
    Map<
      number,
      {
        lat: number;
        lng: number;
        status_code?: string;
        updated_at?: string;
        speed_mps?: number | null;
        heading?: number | null;
        route_progress_m?: number | null;
        tracking_summary?: Order['tracking_summary'];
        estimated_eta_minutes?: number | null;
        driver_presence?: DriverLocation['driver_presence'];
      }
    >
  >(new Map());
  const flushLocationUpdatesRef = useRef<NodeJS.Timeout | null>(null);
  const headingByDriverRef = useRef<Record<number, number>>({});

  useEffect(() => {
    mapRegionRef.current = mapRegion;
  }, [mapRegion]);

  useEffect(() => {
    wsConnectedRef.current = isWsConnected;
  }, [isWsConnected]);

  useEffect(() => {
    const tick = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const fleetTargets = useMemo(
    () =>
      drivers
        .filter((d) => d.location)
        .map((d) => {
          const seenAt = d.driver_last_seen_at || d.location_updated_at;
          const updatedAtMs = seenAt ? Date.parse(seenAt) : Date.now();
          return {
            driverId: d.driver.id,
            latitude: d.location!.lat,
            longitude: d.location!.lng,
            speedMps: d.speed_mps ?? null,
            heading: d.heading ?? null,
            routeProgressM: d.route_progress_m ?? null,
            updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now(),
          };
        }),
    [drivers]
  );
  const smoothDisplayById = useSmoothFleetLocations(fleetTargets, viewMode === 'map');

  const loadMonitoring = useCallback(async () => {
    if (monitoringLoadInFlightRef.current) {
      return;
    }
    monitoringLoadInFlightRef.current = true;
    try {
      if (!isBootstrapped) {
        setLoading(true);
      }
      const [monitoringData, driversData, sosAlerts] = await Promise.all([
        dispatcherService.getMonitoring({
          exception_type: exceptionTypeFilter !== 'all' ? exceptionTypeFilter : undefined,
          severity: severityFilter !== 'all' ? severityFilter : undefined,
          sort: sortMode,
          delay_threshold_minutes: delayThresholdMinutes,
        }),
        dispatcherService.getAllDriversLocations({
          min_lat: mapRegionRef.current.latitude - mapRegionRef.current.latitudeDelta,
          max_lat: mapRegionRef.current.latitude + mapRegionRef.current.latitudeDelta,
          min_lng: mapRegionRef.current.longitude - mapRegionRef.current.longitudeDelta,
          max_lng: mapRegionRef.current.longitude + mapRegionRef.current.longitudeDelta,
        }),
        ordersService.getActiveSOSAlerts().catch(() => []),
      ]);
      setMonitoring(monitoringData);
      setDrivers(driversData);
      setActiveSosAlerts(sosAlerts);
      setLoadFailed(false);
      setLastLiveUpdateAt(new Date().toISOString());

      if (autoFollowMap) {
        const nextRegion = getRegionFromDrivers(driversData);
        setMapRegion(nextRegion);
      }
    } catch (error) {
      console.error('Error loading monitoring:', error);
      setLoadFailed(true);
    } finally {
      monitoringLoadInFlightRef.current = false;
      setIsBootstrapped(true);
      setLoading(false);
      setRefreshing(false);
    }
  }, [exceptionTypeFilter, severityFilter, sortMode, delayThresholdMinutes, isBootstrapped, autoFollowMap]);

  const flushBufferedLocationUpdates = useCallback(() => {
    const updates = pendingLocationUpdatesRef.current;
    if (!updates.size) {
      return;
    }
    setDrivers((prevDrivers) => {
      let hasChanges = false;
      const nextDrivers = prevDrivers.map((d) => {
        const update = updates.get(d.driver.id);
        if (!update) {
          return d;
        }
        hasChanges = true;
        const nextHeading = resolveDisplayHeading(
          update.heading,
          update.speed_mps,
          headingByDriverRef.current[d.driver.id] ?? d.heading ?? 0
        );
        headingByDriverRef.current[d.driver.id] = nextHeading;
        return {
          ...d,
          order: d.order
            ? {
                ...d.order,
                status: {
                  ...d.order.status,
                  code: update.status_code || d.order.status.code,
                },
              }
            : d.order,
          // Store authoritative target; visual smoothing happens in useSmoothFleetLocations.
          location: { lat: Number(update.lat), lng: Number(update.lng) },
          location_updated_at: update.updated_at || d.location_updated_at,
          driver_last_seen_at: update.updated_at || d.driver_last_seen_at,
          speed_mps: update.speed_mps !== undefined ? update.speed_mps : d.speed_mps,
          heading: nextHeading,
          route_progress_m:
            update.route_progress_m !== undefined ? update.route_progress_m : d.route_progress_m,
          driver_presence: update.driver_presence ?? {
            status: 'online',
            stale_level: 'online',
            age_seconds: 0,
          },
          tracking_summary: update.tracking_summary ?? d.tracking_summary,
          estimated_eta_minutes:
            update.estimated_eta_minutes !== undefined
              ? update.estimated_eta_minutes
              : d.estimated_eta_minutes,
        };
      });
      updates.clear();
      if (hasChanges && autoFollowMap) {
        setMapRegion(getRegionFromDrivers(nextDrivers));
      }
      return hasChanges ? nextDrivers : prevDrivers;
    });
  }, [autoFollowMap]);

  const loadOrderRoute = useCallback(async (orderId: number) => {
    try {
      const [tracks, orderDetail] = await Promise.all([
        ordersService.getOrderTracking(orderId),
        dispatcherService.getOrderDetail(orderId).catch(() => ordersService.getOrder(orderId)),
      ]);
      const coords = [...tracks]
        .reverse()
        .map((track) => ({
          latitude: Number(track.lat),
          longitude: Number(track.lng),
        }))
        .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

      let stops = getSortedRouteStops(orderDetail.route_stops);
      if (!stops.length) {
        try {
          stops = await ordersService.getRouteStops(orderId);
        } catch {
          stops = [];
        }
      }

      const enrichedOrder: Order = { ...orderDetail, route_stops: stops };
      const planned = getPlannedRouteCoordinates(enrichedOrder).map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      }));

      setSelectedOrderId(orderId);
      setSelectedOrder(enrichedOrder);
      setSelectedRouteStops(stops);
      setSelectedPlannedRoute(planned);
      setSelectedRouteCoords(coords);
      setPlaybackIndex(null);
    } catch (error) {
      console.error('Error loading route:', error);
      setSelectedOrderId(orderId);
      setSelectedOrder(null);
      setSelectedRouteStops([]);
      setSelectedPlannedRoute([]);
      setSelectedRouteCoords([]);
    }
  }, []);

  const stopPlayback = () => {
    if (playbackRef.current) {
      clearInterval(playbackRef.current);
      playbackRef.current = null;
    }
    setPlaybackIndex(null);
  };

  const startPlayback = () => {
    if (selectedRouteCoords.length < 2) {
      return;
    }
    stopPlayback();
    setPlaybackIndex(0);
    const stepMs = routePlaybackSpeed === 2 ? 500 : 1000;
    playbackRef.current = setInterval(() => {
      setPlaybackIndex((prev) => {
        const next = (prev ?? 0) + 1;
        if (next >= selectedRouteCoords.length) {
          stopPlayback();
          return null;
        }
        if (autoFollowMap) {
          const pt = selectedRouteCoords[next];
          setMapRegion((region) => ({
            ...region,
            latitude: pt.latitude,
            longitude: pt.longitude,
          }));
        }
        return next;
      });
    }, stepMs);
  };

  useFocusEffect(
    useCallback(() => {
      loadMonitoring();

      flushLocationUpdatesRef.current = setInterval(() => {
        flushBufferedLocationUpdates();
      }, LOCATION_FLUSH_MS);

      channelRef.current?.stop();
      channelRef.current = realtimeChannelService.createChannel({
        wsUrl: getDispatcherTrackingWsUrl(),
        onConnected: () => setIsWsConnected(true),
        onDisconnected: () => setIsWsConnected(false),
        onPoll: loadMonitoring,
        pollIntervalMs: 5000,
        onMessage: (payload) => {
          if (payload.type === 'driver_sos') {
            Vibration.vibrate(800);
            const orderId = Number(payload.order_id);
            toastService.error(t('features.sos.dispatcher.incoming', { id: orderId }));
            if (Number.isFinite(orderId)) {
              setSelectedOrderId(orderId);
              loadOrderRoute(orderId);
            }
            setActiveSosAlerts((prev) => {
              const nextAlert: OrderSOSAlert = {
                id: Date.now(),
                order: orderId,
                driver: Number(payload.driver_id),
                lat: Number(payload.lat),
                lng: Number(payload.lng),
                message: String(payload.message || ''),
                status: String(payload.status || 'active'),
                created_at: String(payload.updated_at || new Date().toISOString()),
              };
              const filtered = prev.filter((item) => item.order !== orderId);
              return [nextAlert, ...filtered];
            });
            loadMonitoring();
            return;
          }
          if (payload.type === 'stop_alert') {
            handleStopAlertEvent(payload, { vibrate: true });
            const orderId = Number(payload.order_id);
            if (Number.isFinite(orderId)) {
              setSelectedOrderId(orderId);
              loadOrderRoute(orderId);
            }
            loadMonitoring();
            return;
          }
          if (payload.type === 'route_deviation') {
            const distance = Number(payload.distance_meters || 0);
            const threshold = Number(payload.threshold_meters || 0);
            setRouteDeviationLive({
              orderId: Number(payload.order_id),
              driverId: Number(payload.driver_id),
              distanceMeters: distance,
              thresholdMeters: threshold,
              updatedAt: payload.updated_at || new Date().toISOString(),
            });
            toastService.error(
              t('dispatcherMonitoring.routeDeviationToast', {
                orderId: payload.order_id,
                distance: Math.round(distance),
                threshold: Math.round(threshold),
              }),
            );
            return;
          }
          if (payload.type === 'geofence_event') {
            const eventType = String(payload.event || '');
            const label =
              eventType === 'pickup_enter'
                ? t('dispatcherMonitoring.geofencePickupEnter')
                : eventType === 'pickup_exit'
                ? t('dispatcherMonitoring.geofencePickupExit')
                : eventType === 'destination_enter'
                ? t('dispatcherMonitoring.geofenceDestinationEnter')
                : eventType === 'destination_exit'
                ? t('dispatcherMonitoring.geofenceDestinationExit')
                : t('dispatcherMonitoring.geofenceGeneric');
            toastService.info(t('dispatcherMonitoring.geofenceToast', { label, orderId: payload.order_id }));
            return;
          }
          if (payload.type !== 'location_update') {
            return;
          }
          pendingLocationUpdatesRef.current.set(Number(payload.driver_id), {
            lat: Number(payload.lat),
            lng: Number(payload.lng),
            status_code: payload.status_code,
            updated_at: payload.driver_last_seen_at || payload.updated_at,
            speed_mps:
              payload.speed_mps != null && Number.isFinite(Number(payload.speed_mps))
                ? Number(payload.speed_mps)
                : null,
            heading:
              payload.heading != null && Number.isFinite(Number(payload.heading))
                ? Number(payload.heading)
                : null,
            route_progress_m:
              payload.route_progress_m != null && Number.isFinite(Number(payload.route_progress_m))
                ? Number(payload.route_progress_m)
                : null,
            tracking_summary: payload.tracking_summary as Order['tracking_summary'],
            estimated_eta_minutes:
              payload.estimated_eta_minutes != null ? Number(payload.estimated_eta_minutes) : undefined,
            driver_presence: payload.driver_presence as DriverLocation['driver_presence'],
          });
          setLastLiveUpdateAt(payload.updated_at || new Date().toISOString());
        },
      });

      return () => {
        setIsWsConnected(false);
        if (flushLocationUpdatesRef.current) {
          clearInterval(flushLocationUpdatesRef.current);
          flushLocationUpdatesRef.current = null;
        }
        flushBufferedLocationUpdates();
        stopPlayback();
        channelRef.current?.stop();
        channelRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flushBufferedLocationUpdates, loadMonitoring])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadMonitoring();
  };

  const handleAcknowledgeException = async (orderId: number, exceptionType: DispatcherExceptionType) => {
    const key = `ack-${exceptionType}-${orderId}`;
    try {
      setActionLoadingKey(key);
      await dispatcherService.acknowledgeException(orderId, exceptionType);
      setActionSuccessKey(key);
      setTimeout(() => setActionSuccessKey((prev) => (prev === key ? null : prev)), 2500);
      Vibration.vibrate(20);
      toastService.success(t('dispatcherMonitoring.exceptionAckSuccess', { orderId }));
      await loadMonitoring();
    } catch (error) {
      Alert.alert(t('common.error'), t('dispatcherLists.monitoringAckError'));
      Vibration.vibrate(120);
      toastService.error(t('dispatcherMonitoring.exceptionAckError', { orderId }));
    } finally {
      setActionLoadingKey(null);
    }
  };

  const logPlaybookAction = async (orderId: number, message: string) => {
    try {
      await dispatcherService.addNote(orderId, `[Control Tower] ${message}`);
    } catch (_error) {
      // Silent fail: action itself should not fail because note logging failed.
    }
  };

  const handleSnoozeException = async (orderId: number, exceptionType: DispatcherExceptionType) => {
    const key = `snooze-${exceptionType}-${orderId}`;
    try {
      setActionLoadingKey(key);
      await dispatcherService.snoozeException(orderId, exceptionType, 30);
      await logPlaybookAction(orderId, `${exceptionType} 30 daqiqaga kechiktirildi`);
      setActionSuccessKey(key);
      setTimeout(() => setActionSuccessKey((prev) => (prev === key ? null : prev)), 2500);
      Vibration.vibrate(20);
      toastService.info(t('dispatcherMonitoring.exceptionSnoozeSuccess', { orderId }));
      await loadMonitoring();
    } catch (error) {
      Alert.alert(t('common.error'), t('dispatcherLists.monitoringSnoozeError'));
      Vibration.vibrate(120);
      toastService.error(t('dispatcherMonitoring.exceptionSnoozeError', { orderId }));
    } finally {
      setActionLoadingKey(null);
    }
  };

  const handleAssignSuggested = async (orderId: number) => {
    const key = `suggested-${orderId}`;
    try {
      setActionLoadingKey(key);
      await dispatcherService.assignSuggestedDriver(orderId);
      await logPlaybookAction(orderId, 'zaxira tavsiya qilingan haydovchi tayinlandi');
      setActionSuccessKey(key);
      setTimeout(() => setActionSuccessKey((prev) => (prev === key ? null : prev)), 2500);
      Vibration.vibrate(20);
      toastService.success(t('dispatcherMonitoring.assignSuggestedSuccess', { orderId }));
      Alert.alert(t('common.success'), t('dispatcherLists.monitoringAssignSuccess', { orderId }));
      await loadMonitoring();
    } catch (error) {
      Alert.alert(t('common.error'), t('dispatcherLists.monitoringAssignError'));
      Vibration.vibrate(120);
      toastService.error(t('dispatcherMonitoring.assignSuggestedError', { orderId }));
    } finally {
      setActionLoadingKey(null);
    }
  };

  const handleCallDriver = async (orderId: number, phone?: string | null) => {
    const key = `call-${orderId}`;
    if (!phone) {
      Alert.alert(t('dispatcherLists.monitoringNoInfoTitle'), t('dispatcherLists.monitoringNoPhone'));
      return;
    }
    const telUrl = `tel:${phone}`;
    try {
      const supported = await Linking.canOpenURL(telUrl);
      if (!supported) {
        Alert.alert(t('common.error'), t('dispatcherLists.monitoringCallUnavailable'));
        return;
      }
      await Linking.openURL(telUrl);
      await logPlaybookAction(orderId, `haydovchiga qo‘ng‘iroq qilindi: ${phone}`);
      setActionSuccessKey(key);
      setTimeout(() => setActionSuccessKey((prev) => (prev === key ? null : prev)), 2500);
      Vibration.vibrate(20);
      toastService.info(t('dispatcherMonitoring.callStarted', { phone }));
    } catch (_error) {
      Alert.alert(t('common.error'), t('dispatcherLists.monitoringCallError'));
      Vibration.vibrate(120);
      toastService.error(t('dispatcherMonitoring.callFailed'));
    }
  };

  const getStatusColor = (statusCode: string) => {
    switch (statusCode) {
      case 'pending':
      case 'new':
        return colors.status.pending;
      case 'in_progress':
      case 'approved_by_client':
        return colors.warning;
      case 'in_transit':
        return colors.primary;
      case 'completed':
        return colors.success;
      case 'cancelled':
      case 'rejected':
      case 'stopped':
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  const getMarkerColor = (driver: DriverLocation) => {
    const level = resolveDriverPresenceLevel(driver, nowTs);
    if (level === 'offline') {
      return colors.textTertiary;
    }
    if (level === 'stale') {
      return colors.danger;
    }
    if (level === 'warning') {
      return colors.warning;
    }
    return getStatusColor(driver.order?.status.code || '');
  };

  const getPresenceBadge = (driver: DriverLocation) => {
    const level = resolveDriverPresenceLevel(driver, nowTs);
    const ageSec = resolveDriverPresenceAgeSeconds(driver, nowTs);
    const ageLabel = ageSec != null ? ` (${ageSec}s)` : '';
    switch (level) {
      case 'online':
        return { label: `${t('dispatcherMonitoring.presence.online')}${ageLabel}`, color: colors.success };
      case 'warning':
        return { label: `${t('dispatcherMonitoring.presence.warning')}${ageLabel}`, color: colors.warning };
      case 'stale':
        return { label: `${t('dispatcherMonitoring.presence.stale')}${ageLabel}`, color: colors.danger };
      default:
        return { label: `${t('dispatcherMonitoring.presence.offline')}${ageLabel}`, color: colors.textTertiary };
    }
  };

  const getRegionFromDrivers = (driversSource: DriverLocation[]) => {
    const locations = driversSource
      .filter(d => d.location)
      .map(d => d.location!);

    if (locations.length === 0) {
      return {
        latitude: 41.2995,
        longitude: 69.2401,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };
    }

    const lats = locations.map(l => l.lat);
    const lngs = locations.map(l => l.lng);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.1),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.1),
    };
  };

  const toRad = (v: number) => (v * Math.PI) / 180;
  const distanceKm = (a: RoutePoint, b: RoutePoint) => {
    const earth = 6371;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    return earth * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  };

  const getSegmentColor = (a: RoutePoint, b: RoutePoint) => {
    if (!a.timestamp || !b.timestamp) {
      return colors.textTertiary;
    }
    const deltaSec = Math.max(
      1,
      Math.floor((new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) / 1000)
    );
    if (deltaSec > 300) {
      return colors.danger;
    }
    const speedKmh = (distanceKm(a, b) / deltaSec) * 3600;
    if (speedKmh >= 60) {
      return colors.success;
    }
    if (speedKmh >= 20) {
      return colors.info;
    }
    return colors.warning;
  };

  const clusterDrivers = (items: DriverLocation[]) => {
    const latStep = Math.max(mapRegion.latitudeDelta / 8, 0.01);
    const lngStep = Math.max(mapRegion.longitudeDelta / 8, 0.01);
    const buckets = new Map<string, DriverLocation[]>();
    items.forEach((d) => {
      if (!d.location) {
        return;
      }
      const latIdx = Math.floor(d.location.lat / latStep);
      const lngIdx = Math.floor(d.location.lng / lngStep);
      const key = `${latIdx}:${lngIdx}`;
      const arr = buckets.get(key) || [];
      arr.push(d);
      buckets.set(key, arr);
    });
    return Array.from(buckets.values()).map((group) => {
      if (group.length === 1) {
        return { type: 'single' as const, driver: group[0] };
      }
      const center = group.reduce(
        (acc, d) => ({
          lat: acc.lat + (d.location?.lat || 0),
          lng: acc.lng + (d.location?.lng || 0),
        }),
        { lat: 0, lng: 0 }
      );
      return {
        type: 'cluster' as const,
        count: group.length,
        drivers: group,
        location: {
          lat: center.lat / group.length,
          lng: center.lng / group.length,
        },
      };
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (loadFailed || !monitoring) {
    return (
      <ScreenBackground>
        <AppHeader
          variant="hero"
          title={t('dispatcherLists.monitoringControlCenterTitle')}
          subtitle={t('dispatcherLists.monitoringControlCenterSubtitle')}
        />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('common.loadFailed')}
          actionText={t('common.retry')}
          onActionPress={loadMonitoring}
        />
      </ScreenBackground>
    );
  }

  const driversWithLocations = drivers
    .filter((d) => d.location)
    .map((d) => {
      const smooth = smoothDisplayById[d.driver.id];
      if (!smooth) {
        return d;
      }
      return {
        ...d,
        location: { lat: smooth.latitude, lng: smooth.longitude },
      };
    });
  const visibleDrivers = performanceMode && driversWithLocations.length > 60
    ? driversWithLocations.slice(0, 60)
    : driversWithLocations;
  const clusteredDrivers = clusterDrivers(visibleDrivers);
  const hiddenDriversCount = Math.max(0, driversWithLocations.length - visibleDrivers.length);
  const selectedDriver = selectedOrderId != null ? drivers.find((d) => d.order?.id === selectedOrderId) : null;
  const selectedOrderForStats: Order | null =
    selectedDriver?.order && selectedDriver.tracking_summary
      ? ({
          id: selectedDriver.order.id,
          tracking_summary: selectedDriver.tracking_summary,
          estimated_eta_minutes: selectedDriver.estimated_eta_minutes,
        } as Order)
      : null;

  const liveSecondsAgo = lastLiveUpdateAt
    ? Math.max(0, Math.floor((nowTs - new Date(lastLiveUpdateAt).getTime()) / 1000))
    : null;
  const hasActiveFilters =
    exceptionTypeFilter !== 'all' ||
    severityFilter !== 'all' ||
    sortMode !== 'severity' ||
    delayThresholdMinutes !== 120;
  const exceptionStatItems = [
    { label: t('dispatcherLists.monitoringExceptionStale'), value: monitoring.exceptions_by_type?.stale_location || 0 },
    { label: t('dispatcherLists.monitoringExceptionDelayed'), value: monitoring.exceptions_by_type?.delayed_pending || 0 },
    { label: t('dispatcherLists.monitoringExceptionProblem'), value: monitoring.exceptions_by_type?.problematic_status || 0 },
    { label: t('dispatcherLists.monitoringExceptionRoute'), value: monitoring.exceptions_by_type?.route_deviation || 0 },
  ];

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.header}
        contentContainerStyle={styles.headerContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <AppHeader
          variant="hero"
          title={t('dispatcherLists.monitoringControlCenterTitle')}
          subtitle={t('dispatcherLists.monitoringControlCenterSubtitle')}
        />
        <View style={styles.healthRow}>
          <View style={[styles.healthPill, isWsConnected ? styles.healthPillGood : styles.healthPillBad]}>
            <View style={[styles.healthDot, isWsConnected ? styles.wsDotOnline : styles.wsDotOffline]} />
            <Text style={[styles.healthPillText, isWsConnected ? styles.healthPillTextGood : styles.healthPillTextBad]}>
              {isWsConnected ? t('dispatcherLists.monitoringConnectionGood') : t('dispatcherLists.monitoringConnectionLost')}
            </Text>
          </View>
          <View style={styles.healthPillNeutral}>
            <MaterialIcons name="schedule" size={14} color={colors.textSecondary} />
            <Text style={styles.healthPillTextNeutral}>
              {liveSecondsAgo !== null
                ? t('dispatcherLists.monitoringUpdatedAgo', { seconds: liveSecondsAgo })
                : t('dispatcherLists.monitoringUpdatedUnknown')}
            </Text>
          </View>
        </View>
        {activeSosAlerts.length > 0 && (
          <View style={styles.sosSection}>
            {activeSosAlerts.map((alert) => {
              const driver = drivers.find((item) => item.order?.id === alert.order);
              return (
                <SOSAlertPanel
                  key={`sos-${alert.id}-${alert.order}`}
                  alert={alert}
                  driverPhone={driver?.driver?.phone}
                  compact
                  onUpdated={(updated) => {
                    if (!updated || updated.status === 'resolved') {
                      setActiveSosAlerts((prev) => prev.filter((item) => item.order !== alert.order));
                    } else {
                      setActiveSosAlerts((prev) =>
                        prev.map((item) => (item.order === alert.order ? updated : item)),
                      );
                    }
                    loadMonitoring();
                  }}
                />
              );
            })}
          </View>
        )}
        <View style={styles.statsRow}>
          <Card variant="elevated" style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.primaryGlow }]}>
              <MaterialIcons name="people" size={20} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>{monitoring.total_active_drivers}</Text>
            <Text style={styles.statLabel}>{t('dispatcherLists.monitoringActiveDrivers')}</Text>
          </Card>
          <Card variant="elevated" style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.successGlow }]}>
              <MaterialIcons name="local-shipping" size={20} color={colors.success} />
            </View>
            <Text style={styles.statValue}>{monitoring.total_orders}</Text>
            <Text style={styles.statLabel}>{t('dispatcherLists.monitoringTotalOrders')}</Text>
          </Card>
        </View>
        <Card variant="soft" style={styles.exceptionsCard}>
          <View style={styles.exceptionsHeader}>
            <MaterialIcons name="description" size={20} color={colors.warning} />
            <Text style={styles.exceptionsTitle}>{t('dispatcherLists.monitoringDocumentExpiry')}</Text>
            <Text style={[styles.exceptionsCount, { color: colors.warning }]}>
              {monitoring.document_expiry_alerts?.count || 0}
            </Text>
          </View>
          <Text style={styles.exceptionsSubtext}>
            {t('dispatcherLists.monitoringDocumentExpirySummary', {
              expired: monitoring.document_expiry_alerts?.expired_count || 0,
              soon: monitoring.document_expiry_alerts?.expiring_soon_count || 0,
            })}
          </Text>
        </Card>

        <Card variant="soft" style={styles.exceptionsCard}>
          <View style={styles.exceptionsHeader}>
            <MaterialIcons name="warning-amber" size={20} color={colors.danger} />
            <Text style={styles.exceptionsTitle}>{t('dispatcherLists.monitoringExceptionsTitle')}</Text>
            <Text style={styles.exceptionsCount}>{monitoring.exceptions_count || 0}</Text>
          </View>
          <View style={styles.metricRow}>
            {exceptionStatItems.map((item) => (
              <View key={item.label} style={styles.metricChip}>
                <Text style={styles.metricChipValue}>{item.value}</Text>
                <Text style={styles.metricChipLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.filterSectionTitle}>{t('dispatcherLists.monitoringSortFilterTitle')}</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, sortMode === 'severity' && styles.filterChipActive]}
              onPress={() => setSortMode('severity')}>
              <Text style={[styles.filterChipText, sortMode === 'severity' && styles.filterChipTextActive]}>
                {t('dispatcherLists.monitoringSortSeverity')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, sortMode === 'newest' && styles.filterChipActive]}
              onPress={() => setSortMode('newest')}>
              <Text style={[styles.filterChipText, sortMode === 'newest' && styles.filterChipTextActive]}>
                {t('dispatcherLists.monitoringSortNewest')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, severityFilter === 'all' && styles.filterChipActive]}
              onPress={() => setSeverityFilter('all')}>
              <Text style={[styles.filterChipText, severityFilter === 'all' && styles.filterChipTextActive]}>
                {t('dispatcherLists.monitoringFilterAll')}
              </Text>
            </TouchableOpacity>
            {(['high', 'medium', 'low'] as const).map((severity) => (
              <TouchableOpacity
                key={severity}
                style={[styles.filterChip, severityFilter === severity && styles.filterChipActive]}
                onPress={() => setSeverityFilter(severity)}>
                <Text style={[styles.filterChipText, severityFilter === severity && styles.filterChipTextActive]}>
                  {severity === 'high'
                    ? t('dispatcherLists.monitoringSeverityHigh')
                    : severity === 'medium'
                      ? t('dispatcherLists.monitoringSeverityMedium')
                      : t('dispatcherLists.monitoringSeverityLow')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterSectionTitle}>{t('dispatcherLists.monitoringExceptionTypeTitle')}</Text>
          <View style={styles.filterRow}>
            {(['all', 'stale_location', 'delayed_pending', 'problematic_status', 'route_deviation'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.filterChip, exceptionTypeFilter === type && styles.filterChipActive]}
                onPress={() => setExceptionTypeFilter(type)}>
                <Text style={[styles.filterChipText, exceptionTypeFilter === type && styles.filterChipTextActive]}>
                  {type === 'all'
                    ? t('dispatcherLists.monitoringFilterAll')
                    : type === 'stale_location'
                      ? t('dispatcherLists.monitoringExceptionStale')
                      : type === 'delayed_pending'
                        ? t('dispatcherLists.monitoringExceptionDelayed')
                        : type === 'route_deviation'
                          ? t('dispatcherLists.monitoringExceptionRoute')
                          : t('dispatcherLists.monitoringExceptionProblem')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.filterSectionTitle}>{t('dispatcherLists.monitoringDelayThresholdTitle')}</Text>
          <View style={styles.filterRow}>
            {[60, 120, 180].map((minutes) => (
              <TouchableOpacity
                key={`delay-${minutes}`}
                style={[styles.filterChip, delayThresholdMinutes === minutes && styles.filterChipActive]}
                onPress={() => setDelayThresholdMinutes(minutes as 60 | 120 | 180)}>
                <Text
                  style={[
                    styles.filterChipText,
                    delayThresholdMinutes === minutes && styles.filterChipTextActive,
                  ]}>
                  {t('dispatcherLists.monitoringDelayThreshold', { minutes })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.resetFiltersButton}
              onPress={() => {
                setExceptionTypeFilter('all');
                setSeverityFilter('all');
                setSortMode('severity');
                setDelayThresholdMinutes(120);
              }}>
              <MaterialIcons name="restart-alt" size={14} color={colors.primary} />
              <Text style={styles.resetFiltersText}>{t('dispatcherLists.monitoringResetFilters')}</Text>
            </TouchableOpacity>
          )}
        </Card>
        <Card variant="soft" style={styles.exceptionsCard}>
          <View style={styles.exceptionsHeader}>
            <MaterialIcons name="crisis-alert" size={20} color={colors.danger} />
            <Text style={styles.exceptionsTitle}>{t('dispatcherLists.monitoringSlaPanelTitle')}</Text>
            <Text style={[styles.exceptionsCount, { color: colors.danger }]}>
              {monitoring.sla_breach_risk_panel?.count || 0}
            </Text>
          </View>
          <Text style={styles.exceptionsSubtext}>
            {t('dispatcherLists.monitoringSlaSummary', {
              high: monitoring.sla_breach_risk_panel?.summary?.high || 0,
              medium: monitoring.sla_breach_risk_panel?.summary?.medium || 0,
              low: monitoring.sla_breach_risk_panel?.summary?.low || 0,
            })}
          </Text>
        </Card>
        {routeDeviationLive && (
          <TouchableOpacity
            style={styles.routeDeviationBanner}
            onPress={() => (navigation as any).navigate('DispatcherOrderDetail', { id: routeDeviationLive.orderId })}>
            <MaterialIcons name="alt-route" size={18} color={colors.danger} />
            <Text style={styles.routeDeviationBannerText}>
              {t('dispatcherLists.monitoringRouteDeviation', {
                orderId: routeDeviationLive.orderId,
                distance: Math.round(routeDeviationLive.distanceMeters),
              })}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.viewModeButtons}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'map' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('map')}>
            <MaterialIcons name="map" size={20} color={viewMode === 'map' ? colors.textLight : colors.textTertiary} />
            <Text style={[styles.viewModeText, viewMode === 'map' && styles.viewModeTextActive]}>
              {t('dispatcherLists.monitoringMapView')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('list')}>
            <MaterialIcons name="list" size={20} color={viewMode === 'list' ? colors.textLight : colors.textTertiary} />
            <Text style={[styles.viewModeText, viewMode === 'list' && styles.viewModeTextActive]}>
              {t('dispatcherLists.monitoringListView')}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.liveBar}>
          <Text style={styles.liveText}>
            {liveSecondsAgo !== null
              ? t('dispatcherLists.monitoringLiveAgo', { seconds: liveSecondsAgo })
              : t('dispatcherLists.monitoringLiveUnknown')}
          </Text>
          <View style={[styles.wsBadge, isWsConnected ? styles.wsBadgeOnline : styles.wsBadgeOffline]}>
            <View style={[styles.wsDot, isWsConnected ? styles.wsDotOnline : styles.wsDotOffline]} />
            <Text style={[styles.wsBadgeText, isWsConnected ? styles.wsBadgeTextOnline : styles.wsBadgeTextOffline]}>
              {isWsConnected ? t('dispatcherLists.monitoringWsConnected') : t('dispatcherLists.monitoringWsDisconnected')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.followButton, autoFollowMap && styles.followButtonActive]}
            onPress={() => {
              const next = !autoFollowMap;
              setAutoFollowMap(next);
              if (next) {
                setMapRegion(getRegionFromDrivers(drivers));
              }
            }}>
            <MaterialIcons name="my-location" size={14} color={autoFollowMap ? colors.textLight : colors.textSecondary} />
            <Text style={[styles.followButtonText, autoFollowMap && styles.followButtonTextActive]}>
              {t('dispatcherLists.monitoringFollow')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.followButton, performanceMode && styles.followButtonActive]}
            onPress={() => setPerformanceMode((prev) => !prev)}>
            <MaterialIcons name="speed" size={14} color={performanceMode ? colors.textLight : colors.textSecondary} />
            <Text style={[styles.followButtonText, performanceMode && styles.followButtonTextActive]}>
              {t('dispatcherLists.monitoringPerformance')}
            </Text>
          </TouchableOpacity>
        </View>
        {selectedOrderId !== null && (selectedOrderForStats || selectedOrder) && (
          <Card variant="elevated" style={styles.selectedStatsCard}>
            <Text style={styles.selectedStatsTitle}>
              {t('dispatcherLists.orderNumber', { id: selectedOrderId })}
            </Text>
            {selectedOrderForStats ? <TrackingStatsPanel order={selectedOrderForStats} compact /> : null}
            {selectedOrder && selectedRouteStops.length > 0 ? (
              <RouteStopsPanel order={selectedOrder} stops={selectedRouteStops} t={t} />
            ) : null}
            {selectedPlannedRoute.length > 1 ? (
              <Text style={styles.liveText}>
                {t('dispatcherLists.plannedRoutePoints', { count: selectedPlannedRoute.length })}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.openOrderBtn}
              onPress={() => (navigation as any).navigate('DispatcherOrderDetail', { id: selectedOrderId })}>
              <Text style={styles.openOrderBtnText}>{t('dispatcherLists.viewOrderDetail')}</Text>
            </TouchableOpacity>
          </Card>
        )}
        {selectedOrderId !== null && (
          <View style={styles.liveBar}>
            <Text style={styles.liveText}>{t('dispatcherLists.monitoringRouteLabel', { id: selectedOrderId })}</Text>
            <View style={styles.routeControlsRow}>
              <TouchableOpacity
                style={[styles.followButton, routePlaybackSpeed === 1 && styles.followButtonActive]}
                onPress={() => setRoutePlaybackSpeed(1)}>
                <Text style={[styles.followButtonText, routePlaybackSpeed === 1 && styles.followButtonTextActive]}>
                  1x
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.followButton, routePlaybackSpeed === 2 && styles.followButtonActive]}
                onPress={() => setRoutePlaybackSpeed(2)}>
                <Text style={[styles.followButtonText, routePlaybackSpeed === 2 && styles.followButtonTextActive]}>
                  2x
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.followButton} onPress={startPlayback}>
                <Text style={styles.followButtonText}>{t('dispatcherLists.monitoringPlaybackStart')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.followButton} onPress={stopPlayback}>
                <Text style={styles.followButtonText}>{t('dispatcherLists.monitoringPlaybackStop')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {hiddenDriversCount > 0 && (
          <Text style={styles.liveText}>
            {t('dispatcherLists.monitoringPerformanceHidden', { count: hiddenDriversCount })}
          </Text>
        )}
      </ScrollView>

      {viewMode === 'map' ? (
        <LogistikaMap
          style={styles.map}
          region={mapRegion}
          cameraAnimationMs={autoFollowMap ? 160 : 0}
          onRegionChangeComplete={(region) => {
            if (!autoFollowMap) {
              setMapRegion(region);
            }
          }}>
          {clusteredDrivers.map((item, idx) => {
            if (item.type === 'single') {
              const driver = item.driver;
              const bearing = resolveDisplayHeading(
                driver.heading,
                driver.speed_mps,
                headingByDriverRef.current[driver.driver.id] ?? 0
              );
              return (
                <LogistikaMarker
                  key={driver.driver.id}
                  id={`driver-${driver.driver.id}`}
                  coordinate={{
                    latitude: driver.location!.lat,
                    longitude: driver.location!.lng,
                  }}
                  onPress={() => {
                    if (driver.order?.id) {
                      loadOrderRoute(driver.order.id);
                    }
                  }}>
                  <View
                    style={[
                      styles.markerContainer,
                      {
                        backgroundColor: getMarkerColor(driver) + 'CC',
                        transform: [{ rotate: `${bearing}deg` }],
                      },
                    ]}>
                    <MaterialIcons name="local-shipping" size={24} color={colors.textLight} />
                  </View>
                </LogistikaMarker>
              );
            }
            return (
              <LogistikaMarker
                key={`cluster-${idx}`}
                id={`cluster-${idx}`}
                coordinate={{ latitude: item.location.lat, longitude: item.location.lng }}
                onPress={() => {
                  setMapRegion((r) => ({
                    ...r,
                    latitude: item.location.lat,
                    longitude: item.location.lng,
                    latitudeDelta: Math.max(r.latitudeDelta / 2, 0.02),
                    longitudeDelta: Math.max(r.longitudeDelta / 2, 0.02),
                  }));
                }}>
                <View style={[styles.markerContainer, { backgroundColor: colors.overlay }]}>
                  <Text style={styles.clusterCountText}>{item.count}</Text>
                </View>
              </LogistikaMarker>
            );
          })}
          {selectedPlannedRoute.length > 1 && (
            <LogistikaPolyline
              id="planned-multi-stop-route"
              coordinates={selectedPlannedRoute}
              strokeColor={colors.textTertiary}
              strokeWidth={4}
              lineDashPattern={[8, 6]}
            />
          )}
          {selectedRouteStops.map((stop) => {
            const point = stopToLatLng(stop);
            if (!point) {return null;}
            return (
              <LogistikaMarker
                key={`route-stop-${stop.id}`}
                id={`route-stop-${stop.id}`}
                coordinate={point}
                color={stop.stop_type === 'pickup' ? colors.success : colors.logisticsAccent}
                size={12}
              />
            );
          })}
          {selectedRouteCoords.length > 1 &&
            selectedRouteCoords.slice(1).map((point, idx) => {
              const start = selectedRouteCoords[idx];
              const end = point;
              return (
                <LogistikaPolyline
                  key={`seg-${idx}`}
                  id={`route-seg-${idx}`}
                  coordinates={[
                    { latitude: start.latitude, longitude: start.longitude },
                    { latitude: end.latitude, longitude: end.longitude },
                  ]}
                  strokeColor={getSegmentColor(start, end)}
                  strokeWidth={4}
                />
              );
            })}
          {playbackIndex !== null && selectedRouteCoords[playbackIndex] && (
            <LogistikaMarker
              id="playback-marker"
              coordinate={selectedRouteCoords[playbackIndex]}
              color={colors.text}>
              <View style={[styles.markerContainer, { backgroundColor: colors.overlay }]}>
                <MaterialIcons name="play-arrow" size={22} color={colors.textLight} />
              </View>
            </LogistikaMarker>
          )}
        </LogistikaMap>
      ) : (
        <ScrollView
          style={styles.listView}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
          {Object.entries(monitoring.orders_by_status || {}).map(([statusCode, statusData]: [string, any]) => (
            <Card key={statusCode} variant="soft" style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <View
                  style={[
                    styles.statusIndicator,
                    { backgroundColor: getStatusColor(statusCode) },
                  ]}
                />
                <Text style={styles.statusName}>{statusData.name}</Text>
                <Text style={styles.statusCount}>{statusData.count}</Text>
              </View>
            </Card>
          ))}

          <Card variant="soft" style={styles.driversCard}>
            <Text style={styles.cardTitle}>{t('dispatcherLists.monitoringDriverLocations')}</Text>
            {driversWithLocations.map((driver) => (
              <TouchableOpacity
                key={driver.driver.id}
                style={styles.driverItem}
                onPress={() =>
                  (navigation as any).navigate('DispatcherDriverDetail', { driverId: driver.driver.id })
                }>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>
                    {driver.driver.first_name} {driver.driver.last_name}
                  </Text>
                  <Text style={styles.driverPhone}>{driver.driver.phone}</Text>
                  <View style={[styles.orderBadge, { backgroundColor: `${getPresenceBadge(driver).color}20` }]}>
                    <Text style={[styles.orderBadgeText, { color: getPresenceBadge(driver).color }]}>
                      {getPresenceBadge(driver).label}
                    </Text>
                  </View>
                  {driver.order && (
                    <View
                      style={[
                        styles.orderBadge,
                        { backgroundColor: getStatusColor(driver.order.status.code) + '20' },
                      ]}>
                      <Text
                        style={[
                          styles.orderBadgeText,
                          { color: getStatusColor(driver.order.status.code) },
                        ]}>
                        {t('dispatcherLists.monitoringOrderStatus', {
                          id: driver.order.id,
                          status: driver.order.status.name,
                        })}
                      </Text>
                    </View>
                  )}
                  <TrackingQuickChips
                    trackingSummary={driver.tracking_summary}
                    estimatedEtaMinutes={driver.estimated_eta_minutes}
                  />
                </View>
                <MaterialIcons name="chevron-right" size={24} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
            {driversWithLocations.length === 0 && (
              <Text style={styles.emptyText}>{t('dispatcherLists.monitoringNoDriverLocations')}</Text>
            )}
            {performanceMode && driversWithLocations.length > 60 && (
              <Text style={styles.helperText}>{t('dispatcherLists.monitoringClusterOptimized')}</Text>
            )}
          </Card>

          {monitoring.priority_recommendations && monitoring.priority_recommendations.length > 0 && (
            <Card variant="soft" style={styles.driversCard}>
              <Text style={styles.cardTitle}>{t('dispatcherLists.monitoringSuggestedDrivers')}</Text>
              {monitoring.priority_recommendations.slice(0, 8).map((item, idx) => (
                <View key={`suggested-${item.order_id}-${idx}`} style={styles.suggestedItem}>
                  <View style={styles.suggestedInfo}>
                    <TouchableOpacity onPress={() => (navigation as any).navigate('DispatcherOrderDetail', { id: item.order_id })}>
                      <Text style={styles.exceptionTitle}>{t('dispatcherLists.orderNumber', { id: item.order_id })}</Text>
                    </TouchableOpacity>
                    <Text style={styles.exceptionText}>
                      Xavf: {item.eta_risk.toUpperCase()} | Ball: {item.priority_score}
                    </Text>
                    {item.suggested_driver ? (
                      <Text style={styles.suggestedDriverText}>
                        {item.suggested_driver.driver_name} ({item.suggested_driver.driver_phone}) - {item.suggested_driver.vehicle_number}
                      </Text>
                    ) : (
                      <Text style={styles.suggestedDriverText}>{t('dispatcherLists.monitoringNoSuggestedDriver')}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.exceptionActionBtn,
                      (!item.suggested_driver || actionLoadingKey === `suggested-${item.order_id}`) && styles.exceptionActionBtnDisabled,
                    ]}
                    disabled={!item.suggested_driver || actionLoadingKey === `suggested-${item.order_id}`}
                    onPress={() => handleAssignSuggested(item.order_id)}>
                    <Text style={styles.exceptionActionText}>{t('dispatcherLists.monitoringAssign')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}
          {monitoring.incident_playbook?.items && monitoring.incident_playbook.items.length > 0 && (
            <Card variant="soft" style={styles.driversCard}>
              <Text style={styles.cardTitle}>{t('dispatcherLists.monitoringAutoEscalationTitle')}</Text>
              {monitoring.incident_playbook.items.slice(0, 8).map((item, index) => (
                <View key={`incident-${item.order_id}-${index}`} style={styles.suggestedItem}>
                  <View style={styles.suggestedInfo}>
                    <TouchableOpacity onPress={() => (navigation as any).navigate('DispatcherOrderDetail', { id: item.order_id })}>
                      <Text style={styles.exceptionTitle}>{t('dispatcherLists.orderNumber', { id: item.order_id })}</Text>
                    </TouchableOpacity>
                    <Text style={styles.exceptionText}>
                      Kechikish: {item.delay_minutes}m (chegara {item.threshold_minutes}m) | Eskalatsiya: {item.escalation_level}
                    </Text>
                    {item.fallback_driver ? (
                      <Text style={styles.suggestedDriverText}>
                        Zaxira: {item.fallback_driver.driver_name} ({item.fallback_driver.driver_phone})
                      </Text>
                    ) : (
                      <Text style={styles.suggestedDriverText}>{t('dispatcherLists.monitoringNoBackupDriver')}</Text>
                    )}
                    {item.recommended_actions && item.recommended_actions.length > 0 && (
                      <View style={styles.recommendedActionsWrap}>
                        {item.recommended_actions.map((action, actionIndex) => (
                          <View key={`rec-${item.order_id}-${actionIndex}`} style={styles.recommendedActionItem}>
                            <MaterialIcons name="check-circle-outline" size={14} color={colors.primary} />
                            <Text style={styles.recommendedActionText}>{action}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={styles.quickActionsRow}>
                      <TouchableOpacity
                        style={styles.exceptionActionBtn}
                        onPress={() =>
                          handleCallDriver(item.order_id, item.fallback_driver?.driver_phone || null)
                        }>
                        <Text style={styles.exceptionActionText}>{t('dispatcherLists.monitoringCallDriver')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.exceptionActionBtn,
                          actionLoadingKey === `snooze-delayed_pending-${item.order_id}` && styles.exceptionActionBtnDisabled,
                        ]}
                        disabled={actionLoadingKey === `snooze-delayed_pending-${item.order_id}`}
                        onPress={() => handleSnoozeException(item.order_id, 'delayed_pending')}>
                        <Text style={styles.exceptionActionText}>{t('dispatcherLists.monitoringSnooze30')}</Text>
                      </TouchableOpacity>
                    </View>
                    {(actionSuccessKey === `call-${item.order_id}` ||
                      actionSuccessKey === `snooze-delayed_pending-${item.order_id}` ||
                      actionSuccessKey === `suggested-${item.order_id}`) && (
                      <View style={styles.actionDoneBadge}>
                        <MaterialIcons name="check-circle" size={14} color={colors.success} />
                        <Text style={styles.actionDoneText}>{t('dispatcherLists.monitoringDone')}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.exceptionActionBtn,
                      (!item.fallback_driver || actionLoadingKey === `suggested-${item.order_id}`) && styles.exceptionActionBtnDisabled,
                    ]}
                    disabled={!item.fallback_driver || actionLoadingKey === `suggested-${item.order_id}`}
                    onPress={() => handleAssignSuggested(item.order_id)}>
                    <Text style={styles.exceptionActionText}>{t('dispatcherLists.monitoringAssignBackup')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}

          {monitoring.exceptions && monitoring.exceptions.length > 0 && (
            <Card variant="soft" style={styles.driversCard}>
              <Text style={styles.cardTitle}>{t('dispatcherLists.monitoringMainExceptions')}</Text>
              {monitoring.exceptions.slice(0, 10).map((item, index) => (
                <View
                  key={`${item.type}-${item.order_id}-${index}`}
                  style={styles.exceptionItem}>
                  <View style={styles.exceptionIconWrap}>
                    <MaterialIcons
                      name={item.severity === 'high' ? 'error-outline' : 'warning-amber'}
                      size={18}
                      color={item.severity === 'high' ? colors.danger : colors.warning}
                    />
                  </View>
                  <View style={styles.exceptionInfo}>
                    <TouchableOpacity onPress={() => (navigation as any).navigate('DispatcherOrderDetail', { id: item.order_id })}>
                      <Text style={styles.exceptionTitle}>{t('dispatcherLists.orderNumber', { id: item.order_id })}</Text>
                    </TouchableOpacity>
                    <Text style={styles.exceptionText}>{item.message}</Text>
                    <View style={styles.exceptionActions}>
                      <TouchableOpacity
                        style={[
                          styles.exceptionActionBtn,
                          actionLoadingKey === `ack-${item.type}-${item.order_id}` && styles.exceptionActionBtnDisabled,
                        ]}
                        disabled={actionLoadingKey === `ack-${item.type}-${item.order_id}`}
                        onPress={() =>
                          handleAcknowledgeException(item.order_id, item.type as DispatcherExceptionType)
                        }>
                        <Text style={styles.exceptionActionText}>{t('dispatcherLists.monitoringAcknowledge')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.exceptionActionBtn,
                          actionLoadingKey === `snooze-${item.type}-${item.order_id}` && styles.exceptionActionBtnDisabled,
                        ]}
                        disabled={actionLoadingKey === `snooze-${item.type}-${item.order_id}`}
                        onPress={() =>
                          handleSnoozeException(item.order_id, item.type as DispatcherExceptionType)
                        }>
                        <Text style={styles.exceptionActionText}>{t('dispatcherLists.monitoringSnooze30')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => (navigation as any).navigate('DispatcherOrderDetail', { id: item.order_id })}>
                    <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}
          {(!monitoring.exceptions || monitoring.exceptions.length === 0) && (
            <Card variant="soft" style={styles.driversCard}>
              <Text style={styles.cardTitle}>{t('dispatcherLists.monitoringMainExceptions')}</Text>
              <Text style={styles.helperText}>{t('dispatcherLists.monitoringNoExceptionsStable')}</Text>
            </Card>
          )}
        </ScrollView>
      )}
    </ScreenBackground>
  );
};


export default DispatcherMonitoringScreen;
