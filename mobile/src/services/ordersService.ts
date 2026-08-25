import { apiService } from './api';
import {
  Order,
  OrderLocationTrack,
  OrderRouteStop,
  PaginatedResponse,
  RouteOptimizeResult,
} from '../types';

export const ordersService = {
  normalizeCoordinate(value: number): number {
    // Backend expects Decimal(9, 6) for location updates.
    return Number(value.toFixed(6));
  },
  // Получить список заказов
  async getOrders(params?: {
    status?: string;
    page?: number;
    page_size?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<PaginatedResponse<Order>> {
    return apiService.get('/orders/', params);
  },

  // Получить заказ по ID
  async getOrder(id: number): Promise<Order> {
    return apiService.get(`/orders/${id}/`);
  },

  // Начать заказ
  async startOrder(id: number): Promise<Order> {
    return apiService.post(`/orders/${id}/start/`, {});
  },

  // Yuk olindi — manzilga yo'l (Poexali)
  async departOrder(id: number): Promise<Order> {
    return apiService.post(`/orders/${id}/depart/`, {});
  },

  // Остановить заказ
  async stopOrder(id: number): Promise<Order> {
    return apiService.post(`/orders/${id}/stop/`, {});
  },

  // Завершить заказ
  async completeOrder(id: number): Promise<Order> {
    return apiService.post(`/orders/${id}/complete/`, {});
  },

  // Отклонить заказ
  async rejectOrder(id: number): Promise<Order> {
    return apiService.post(`/orders/${id}/reject/`, {});
  },

  // Одобрить заказ клиентом
  async approveOrder(id: number): Promise<Order> {
    return apiService.post(`/orders/${id}/approve/`, {});
  },

  async declineOrder(id: number): Promise<Order> {
    return apiService.post(`/orders/${id}/decline/`, {});
  },

  async markDriverPayment(id: number, received: boolean): Promise<Order> {
    return apiService.post(`/orders/${id}/mark-driver-payment/`, { received });
  },

  async confirmClientPayment(id: number, paid: boolean): Promise<Order> {
    return apiService.post(`/orders/${id}/confirm-client-payment/`, { paid });
  },

  async confirmDelivery(id: number, received: boolean): Promise<Order> {
    return apiService.post(`/orders/${id}/confirm-delivery/`, { received });
  },

  // Получить отслеживание заказа
  async getOrderTracking(id: number, limit: number = 100): Promise<OrderLocationTrack[]> {
    return apiService.get(`/orders/${id}/track/`, { limit });
  },

  // Обновить местоположение заказа
  async updateLocation(
    id: number,
    lat: number,
    lng: number,
    appState?: 'foreground' | 'background' | 'inactive',
    motion?: { speedMps?: number | null; heading?: number | null }
  ): Promise<Order> {
    const speed =
      motion?.speedMps != null && Number.isFinite(motion.speedMps) && motion.speedMps >= 0
        ? Math.min(motion.speedMps, 80)
        : undefined;
    const headingRaw = motion?.heading;
    const heading =
      headingRaw != null && Number.isFinite(headingRaw) && headingRaw >= 0
        ? ((headingRaw % 360) + 360) % 360
        : undefined;
    return apiService.post(
      `/orders/${id}/update-location/`,
      {
        lat: this.normalizeCoordinate(lat),
        lng: this.normalizeCoordinate(lng),
        ...(appState ? { app_state: appState } : {}),
        ...(speed != null ? { speed_mps: speed } : {}),
        ...(heading != null ? { heading } : {}),
      },
      undefined,
      false,
    );
  },

  async setRoutePlan(
    id: number,
    points: Array<{ lat: number; lng: number; label?: string; address?: string }>,
    options?: {
      thresholdMeters?: number;
      pickupGeofenceRadiusMeters?: number;
      destinationGeofenceRadiusMeters?: number;
    },
  ): Promise<Order> {
    return apiService.post(`/orders/${id}/route-plan/`, {
      points,
      threshold_meters: options?.thresholdMeters ?? 500,
      pickup_geofence_radius_meters: options?.pickupGeofenceRadiusMeters ?? 300,
      destination_geofence_radius_meters: options?.destinationGeofenceRadiusMeters ?? 300,
    });
  },

  async getRouteStops(orderId: number): Promise<OrderRouteStop[]> {
    return apiService.get(`/orders/${orderId}/route-stops/`);
  },

  async addRouteStop(
    orderId: number,
    payload: {
      stop_type: 'pickup' | 'delivery';
      label?: string;
      address: string;
      lat?: number;
      lng?: number;
      sequence?: number;
      geofence_radius_meters?: number;
      notes?: string;
    }
  ): Promise<OrderRouteStop> {
    return apiService.post(`/orders/${orderId}/route-stops/`, {
      ...payload,
      ...(payload.lat != null ? { lat: this.normalizeCoordinate(payload.lat) } : {}),
      ...(payload.lng != null ? { lng: this.normalizeCoordinate(payload.lng) } : {}),
    });
  },

  async updateRouteStop(
    orderId: number,
    stopId: number,
    payload: Partial<{
      stop_type: 'pickup' | 'delivery';
      label: string;
      address: string;
      lat: number;
      lng: number;
      sequence: number;
      geofence_radius_meters: number;
      notes: string;
    }>
  ): Promise<OrderRouteStop> {
    const body = { ...payload };
    if (body.lat != null) {body.lat = this.normalizeCoordinate(body.lat);}
    if (body.lng != null) {body.lng = this.normalizeCoordinate(body.lng);}
    return apiService.patch(`/orders/${orderId}/route-stops/${stopId}/`, body);
  },

  async completeRouteStop(
    orderId: number,
    stopId: number,
    options: boolean | { skip?: boolean; skip_reason?: string; notes?: string } = false
  ): Promise<Order> {
    const payload =
      typeof options === 'boolean'
        ? { skip: options }
        : {
            skip: Boolean(options.skip),
            ...(options.skip_reason ? { skip_reason: options.skip_reason } : {}),
            ...(options.notes ? { notes: options.notes } : {}),
          };
    return apiService.post(`/orders/${orderId}/route-stops/${stopId}/complete/`, payload);
  },

  async deleteRouteStop(orderId: number, stopId: number): Promise<void> {
    await apiService.delete(`/orders/${orderId}/route-stops/${stopId}/`);
  },

  async optimizeRoute(
    orderId: number,
    preference?: 'fastest' | 'cheapest' | 'balanced' | 'no_toll'
  ): Promise<{ order: Order; optimization: RouteOptimizeResult }> {
    return apiService.post(`/orders/${orderId}/route-optimize/`, {
      ...(preference ? { preference } : {}),
    });
  },

  async submitProofOfDelivery(
    id: number,
    payload: {
      receiver_name: string;
      receiver_signature?: string;
      delivered_lat: number;
      delivered_lng: number;
      note?: string;
      delivery_photo?: { uri: string; type?: string; fileName?: string };
    }
  ): Promise<Order> {
    const formData = new FormData();
    formData.append('receiver_name', payload.receiver_name);
    if (payload.receiver_signature) {
      formData.append('receiver_signature', payload.receiver_signature);
    }
    formData.append('delivered_lat', String(this.normalizeCoordinate(payload.delivered_lat)));
    formData.append('delivered_lng', String(this.normalizeCoordinate(payload.delivered_lng)));
    if (payload.note) {
      formData.append('note', payload.note);
    }
    if (payload.delivery_photo?.uri) {
      formData.append('delivery_photo', {
        uri: payload.delivery_photo.uri,
        type: payload.delivery_photo.type || 'image/jpeg',
        name: payload.delivery_photo.fileName || `pod_${Date.now()}.jpg`,
      } as any);
    }
    return apiService.post(`/orders/${id}/proof-of-delivery/`, formData);
  },

  async classifyReturnQuality(
    id: number,
    payload: {
      quality_status: 'ok' | 'opened' | 'damaged';
      note?: string;
      photo?: { uri: string; type?: string; fileName?: string };
    }
  ): Promise<Order> {
    const formData = new FormData();
    formData.append('quality_status', payload.quality_status);
    if (payload.note) {
      formData.append('note', payload.note);
    }
    if (payload.photo?.uri) {
      formData.append('photo', {
        uri: payload.photo.uri,
        type: payload.photo.type || 'image/jpeg',
        name: payload.photo.fileName || `return_${Date.now()}.jpg`,
      } as any);
    }
    return apiService.post(`/orders/${id}/return-quality/`, formData);
  },

  async createTrackingShareLink(id: number, expiresInHours: number = 24): Promise<{
    token: string;
    expires_at: string;
    public_url: string;
  }> {
    return apiService.post(`/orders/${id}/share-link/`, {
      expires_in_hours: expiresInHours,
    });
  },

  async getPublicTrackingShare(token: string): Promise<import('../types').PublicTrackingShare> {
    return apiService.get(`/orders/share/${token}/`, undefined, false);
  },

  // Получить статистику для водителя
  async getDriverStatistics(dateFrom?: string, dateTo?: string): Promise<any> {
    const params: any = {};
    if (dateFrom) {params.date_from = dateFrom;}
    if (dateTo) {params.date_to = dateTo;}
    return apiService.get('/orders/statistics/driver/', params);
  },

  // Получить статистику для клиента
  async getClientStatistics(dateFrom?: string, dateTo?: string): Promise<any> {
    const params: any = {};
    if (dateFrom) {params.date_from = dateFrom;}
    if (dateTo) {params.date_to = dateTo;}
    return apiService.get('/orders/statistics/client/', params);
  },

  // QR kod orqali order'ni tekshirish
  async verifyOrderByQR(qrCode: string): Promise<Order> {
    return apiService.post('/orders/verify-qr/', { qr_code: qrCode });
  },

  // QR kod orqali order'ni tasdiqlash (client uchun)
  async verifyAndApproveOrderByQR(qrCode: string): Promise<Order> {
    return apiService.post('/orders/verify-qr-approve/', { qr_code: qrCode });
  },

  async triggerSOS(
    id: number,
    payload: { lat: number; lng: number; message?: string },
  ): Promise<import('../types').OrderSOSAlert> {
    return apiService.post(`/orders/${id}/sos/`, payload);
  },

  async getCustodyChain(id: number): Promise<import('../types').OrderCustodyEvent[]> {
    return apiService.get(`/orders/${id}/custody-chain/`);
  },

  async logCustodyEvent(
    id: number,
    payload: {
      event_type: string;
      note?: string;
      witness_name?: string;
      lat?: number;
      lng?: number;
      photo?: { uri: string; type?: string; fileName?: string };
    },
  ): Promise<import('../types').OrderCustodyEvent> {
    if (payload.photo?.uri) {
      const formData = new FormData();
      formData.append('event_type', payload.event_type);
      if (payload.note) {
        formData.append('note', payload.note);
      }
      if (payload.witness_name) {
        formData.append('witness_name', payload.witness_name);
      }
      if (payload.lat != null) {
        formData.append('lat', String(this.normalizeCoordinate(payload.lat)));
      }
      if (payload.lng != null) {
        formData.append('lng', String(this.normalizeCoordinate(payload.lng)));
      }
      formData.append('photo', {
        uri: payload.photo.uri,
        type: payload.photo.type || 'image/jpeg',
        name: payload.photo.fileName || `custody_${Date.now()}.jpg`,
      } as any);
      return apiService.postFormData(`/orders/${id}/custody-chain/`, formData);
    }

    return apiService.post(`/orders/${id}/custody-chain/`, {
      event_type: payload.event_type,
      note: payload.note,
      witness_name: payload.witness_name,
      lat: payload.lat != null ? this.normalizeCoordinate(payload.lat) : undefined,
      lng: payload.lng != null ? this.normalizeCoordinate(payload.lng) : undefined,
    });
  },

  async getActiveSOSAlerts(): Promise<import('../types').OrderSOSAlert[]> {
    return apiService.get('/orders/sos/active/');
  },

  async acknowledgeSOS(orderId: number): Promise<import('../types').OrderSOSAlert> {
    return apiService.post(`/orders/${orderId}/sos/acknowledge/`, {});
  },

  async resolveSOS(orderId: number): Promise<import('../types').OrderSOSAlert> {
    return apiService.post(`/orders/${orderId}/sos/resolve/`, {});
  },

  async generateOrderDocuments(orderId: number): Promise<import('../types').OrderDocument[]> {
    const result = await apiService.post<{ documents: import('../types').OrderDocument[] }>(
      `/orders/${orderId}/documents/generate/`,
      {},
    );
    return result?.documents || [];
  },

  async getOrderDocuments(orderId: number): Promise<import('../types').OrderDocument[]> {
    const result = await apiService.get<{ documents: import('../types').OrderDocument[] }>(
      `/orders/${orderId}/documents/`,
    );
    return result?.documents || [];
  },
};
