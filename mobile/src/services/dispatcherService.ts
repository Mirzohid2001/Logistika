import { apiService } from './api';
import {
  Order,
  DispatcherAssignment,
  DispatcherNote,
  DispatcherDashboard,
  DispatcherStatistics,
  DispatcherMonitoring,
  DispatcherExceptionType,
  User,
} from '../types';

export const dispatcherService = {
  async getDashboard(): Promise<DispatcherDashboard> {
    return apiService.get('/dispatcher/dashboard/');
  },

  async getOrders(params?: {
    status?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<Order[]> {
    return apiService.get('/dispatcher/orders/', params);
  },

  async getOrderDetail(id: number): Promise<Order & { assignments: DispatcherAssignment[]; notes: DispatcherNote[] }> {
    return apiService.get(`/dispatcher/orders/${id}/`);
  },

  async assignDriver(orderId: number, driverId: number, notes?: string): Promise<DispatcherAssignment> {
    return apiService.post(`/dispatcher/orders/${orderId}/assign/`, {
      driver_id: driverId,
      notes: notes || '',
    });
  },

  async reassignDriver(orderId: number, driverId: number, notes?: string): Promise<DispatcherAssignment> {
    return apiService.post(`/dispatcher/orders/${orderId}/reassign/`, {
      driver_id: driverId,
      notes: notes || '',
    });
  },

  async cancelOrder(orderId: number): Promise<Order> {
    return apiService.post(`/dispatcher/orders/${orderId}/cancel/`);
  },

  async addNote(orderId: number, note: string): Promise<DispatcherNote> {
    return apiService.post(`/dispatcher/orders/${orderId}/note/`, { note });
  },

  async getDrivers(): Promise<User[]> {
    return apiService.get('/dispatcher/drivers/');
  },

  async getClients(): Promise<User[]> {
    return apiService.get('/dispatcher/clients/');
  },

  async getStatistics(params?: {
    scope?: 'my' | 'all';
    date_from?: string;
    date_to?: string;
  }): Promise<DispatcherStatistics> {
    return apiService.get('/dispatcher/statistics/', params);
  },

  async getDriverDetail(driverId: number): Promise<any> {
    return apiService.get(`/dispatcher/drivers/${driverId}/`);
  },

  async getClientDetail(clientId: number): Promise<any> {
    return apiService.get(`/dispatcher/clients/${clientId}/`);
  },

  async getOrdersMap(): Promise<Order[]> {
    return apiService.get('/dispatcher/orders/map/');
  },

  async getDriverOrders(driverId: number): Promise<Order[]> {
    return apiService.get(`/dispatcher/drivers/${driverId}/orders/`);
  },

  async getClientOrders(clientId: number): Promise<Order[]> {
    return apiService.get(`/dispatcher/clients/${clientId}/orders/`);
  },

  async getAnalytics(params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<any> {
    return apiService.get('/dispatcher/analytics/', params);
  },

  async bulkOperations(data: {
    order_ids: number[];
    action: 'assign' | 'cancel' | 'reassign';
    driver_id?: number;
    notes?: string;
  }): Promise<any> {
    return apiService.post('/dispatcher/bulk-operations/', data);
  },

  async exportData(params?: {
    format?: 'excel' | 'csv';
    date_from?: string;
    date_to?: string;
  }): Promise<any> {
    return apiService.get('/dispatcher/export/', params);
  },

  async getMonitoring(params?: {
    exception_type?: DispatcherExceptionType;
    severity?: 'low' | 'medium' | 'high';
    sort?: 'severity' | 'newest';
    delay_threshold_minutes?: number;
  }): Promise<DispatcherMonitoring> {
    return apiService.get('/dispatcher/monitoring/', params);
  },

  async acknowledgeException(orderId: number, exceptionType: DispatcherExceptionType, note?: string): Promise<any> {
    return apiService.post('/dispatcher/exceptions/ack/', {
      order_id: orderId,
      exception_type: exceptionType,
      note: note || '',
    });
  },

  async snoozeException(
    orderId: number,
    exceptionType: DispatcherExceptionType,
    minutes: number = 30,
    note?: string
  ): Promise<any> {
    return apiService.post('/dispatcher/exceptions/snooze/', {
      order_id: orderId,
      exception_type: exceptionType,
      minutes,
      note: note || '',
    });
  },

  async assignSuggestedDriver(orderId: number): Promise<DispatcherAssignment> {
    return apiService.post('/dispatcher/suggestions/assign/', {
      order_id: orderId,
    });
  },

  async getAllDriversLocations(params?: {
    min_lat?: number;
    max_lat?: number;
    min_lng?: number;
    max_lng?: number;
  }): Promise<any[]> {
    return apiService.get('/dispatcher/drivers/locations/', params);
  },

  async getAllOrdersStatus(params?: {
    status?: string;
  }): Promise<Order[]> {
    return apiService.get('/dispatcher/orders/status/', params);
  },
};
