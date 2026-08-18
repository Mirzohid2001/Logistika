import { apiService } from './api';
import {
  Order,
  UpdateLog,
  UpdaterDashboard,
  UpdaterStatistics,
  OrderLocationTrack,
} from '../types';

export const updaterService = {
  async getDashboard(): Promise<UpdaterDashboard> {
    return apiService.get('/updater/dashboard/');
  },

  async getPendingUpdates(): Promise<Order[]> {
    return apiService.get('/updater/pending-updates/');
  },

  async updateStatus(orderId: number, statusCode: string, description?: string): Promise<Order> {
    return apiService.post(`/updater/orders/${orderId}/update-status/`, {
      status_code: statusCode,
      description: description || '',
    });
  },

  async updateLocation(orderId: number, lat: number, lng: number, description?: string): Promise<Order> {
    return apiService.post(`/updater/orders/${orderId}/update-location/`, {
      lat,
      lng,
      description: description || '',
    });
  },

  async updatePayment(orderId: number, paymentStatus: string, description?: string): Promise<Order> {
    return apiService.post(`/updater/orders/${orderId}/update-payment/`, {
      payment_status: paymentStatus,
      description: description || '',
    });
  },

  async bulkUpdate(
    orderId: number,
    data: {
      status_code?: string;
      lat?: number;
      lng?: number;
      payment_status?: string;
      description?: string;
    }
  ): Promise<Order> {
    return apiService.post(`/updater/orders/${orderId}/bulk-update/`, data);
  },

  async getTracking(orderId: number): Promise<{ order: Order; tracks: OrderLocationTrack[] }> {
    return apiService.get(`/updater/orders/${orderId}/tracking/`);
  },

  async getActiveTracking(): Promise<Order[]> {
    return apiService.get('/updater/active-tracking/');
  },

  async getLogs(params?: {
    order_id?: number;
    update_type?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<UpdateLog[]> {
    return apiService.get('/updater/logs/', { params });
  },

  async getStatistics(): Promise<UpdaterStatistics> {
    return apiService.get('/updater/statistics/');
  },

  async getOrderHistory(params?: {
    order_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<Order[]> {
    return apiService.get('/updater/order-history/', { params });
  },

  async getPaymentMonitoring(): Promise<any[]> {
    return apiService.get('/updater/payment-monitoring/');
  },

  async getProblematicOrders(): Promise<Order[]> {
    return apiService.get('/updater/problematic-orders/');
  },

  async getLocationHistory(orderId: number): Promise<OrderLocationTrack[]> {
    return apiService.get('/updater/location-history/', { params: { order_id: orderId } });
  },

  async getAnalytics(params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<any> {
    return apiService.get('/updater/analytics/', { params });
  },

  async bulkOperations(data: {
    order_ids: number[];
    action: 'update_status' | 'update_location' | 'update_payment';
    status_code?: string;
    lat?: number;
    lng?: number;
    payment_status?: string;
    description?: string;
  }): Promise<any> {
    return apiService.post('/updater/bulk-operations/', data);
  },

  async exportData(params?: {
    format?: 'excel' | 'csv';
    date_from?: string;
    date_to?: string;
  }): Promise<any> {
    return apiService.get('/updater/export/', { params });
  },
};
