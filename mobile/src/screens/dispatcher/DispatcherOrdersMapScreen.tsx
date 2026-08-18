import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LogistikaMap, LogistikaMarker, LogistikaPolyline } from '../../components/map';
import { dispatcherService } from '../../services/dispatcherService';
import { Order } from '../../types';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { EmptyState } from '../../components/EmptyState';
import { AppHeader } from '../../components/AppHeader';
import { ScreenBackground } from '../../components/ScreenBackground';

import { useTranslation } from '../../hooks/useTranslation';
import { getPlannedRouteCoordinates, getSortedRouteStops, stopToLatLng } from '../../utils/routeStops';
import { regionFromBounds } from '../../utils/mapGeo';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { AppColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/useAppTheme';

const DispatcherOrdersMapScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailed(false);
      const data = await dispatcherService.getOrdersMap();
      setOrders(data);
    } catch (error) {
      console.error('Error loading orders map:', error);
      setOrders([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  if (loading) {
    return (
      <ScreenBackground>
        <LoadingSpinner />
      </ScreenBackground>
    );
  }

  if (loadFailed) {
    return (
      <ScreenBackground>
        <AppHeader title={t('dispatcherLists.mapTitle')} />
        <EmptyState
          variant="error"
          title={t('common.error')}
          message={t('dispatcherLists.mapLoadError')}
          actionText={t('common.retry')}
          onActionPress={loadOrders}
        />
      </ScreenBackground>
    );
  }

  const ordersWithLocation = orders.filter(
    (order) => order.current_location_lat && order.current_location_lng
  );

  if (ordersWithLocation.length === 0) {
    return (
      <ScreenBackground>
        <AppHeader title={t('dispatcherLists.mapTitle')} />
        <EmptyState
          title={t('dispatcherLists.noMapOrders')}
          message={t('dispatcherLists.noMapOrders')}
          actionText={t('common.retry')}
          onActionPress={loadOrders}
        />
      </ScreenBackground>
    );
  }

  const selectedOrder = selectedOrderId != null ? orders.find((o) => o.id === selectedOrderId) : null;
  const selectedStops = getSortedRouteStops(selectedOrder?.route_stops);
  const selectedPlannedRoute = selectedOrder ? getPlannedRouteCoordinates(selectedOrder) : [];

  const mapPoints = ordersWithLocation.flatMap((order) => {
    const driverLat = parseFloat(order.current_location_lat!.toString());
    const driverLng = parseFloat(order.current_location_lng!.toString());
    const stopPoints = getPlannedRouteCoordinates(order);
    return [
      { latitude: driverLat, longitude: driverLng },
      ...stopPoints,
    ];
  });

  const initialRegion =
    regionFromBounds(mapPoints) ?? {
      latitude: parseFloat(ordersWithLocation[0].current_location_lat!.toString()),
      longitude: parseFloat(ordersWithLocation[0].current_location_lng!.toString()),
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    };

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <LogistikaMap style={styles.map} region={initialRegion}>
        {ordersWithLocation.map((order) => {
          const lat = parseFloat(order.current_location_lat!.toString());
          const lng = parseFloat(order.current_location_lng!.toString());

          return (
            <LogistikaMarker
              key={order.id}
              id={`order-${order.id}`}
              coordinate={{ latitude: lat, longitude: lng }}
              color={selectedOrderId === order.id ? colors.logisticsAccent : colors.primary}
              onPress={() => setSelectedOrderId(order.id)}
            />
          );
        })}
        {selectedPlannedRoute.length > 1 && (
          <LogistikaPolyline
            id="selected-planned-route"
            coordinates={selectedPlannedRoute}
            strokeColor={colors.textTertiary}
            strokeWidth={4}
            lineDashPattern={[8, 6]}
          />
        )}
        {selectedStops.map((stop) => {
          const point = stopToLatLng(stop);
          if (!point) {return null;}
          return (
            <LogistikaMarker
              key={`stop-${stop.id}`}
              id={`stop-${stop.id}`}
              coordinate={point}
              color={stop.stop_type === 'pickup' ? colors.success : colors.logisticsAccent}
              size={12}
            />
          );
        })}
      </LogistikaMap>
      {selectedOrder ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>
            {t('dispatcherLists.orderNumber', { id: selectedOrder.id })}
            {selectedStops.length > 0
              ? ` · ${t('dispatcherLists.plannedRoutePoints', { count: selectedStops.length })}`
              : ''}
          </Text>
        </View>
      ) : null}
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
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 50,
  },
  selectionBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: colors.cardBackground + 'F2',
    borderRadius: 12,
    padding: 12,
  },
  selectionText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default DispatcherOrdersMapScreen;
