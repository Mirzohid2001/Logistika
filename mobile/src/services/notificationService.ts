import { apiService } from './api';
import { NotificationPreferences } from '../types';

export interface Notification {
  id: number;
  user: number;
  order?: any;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export const notificationService = {
  async getNotifications(params?: {
    is_read?: boolean;
    type?: string;
  }): Promise<Notification[] | { results: Notification[] }> {
    return apiService.get('/notifications/', params);
  },

  async getNotification(id: number): Promise<Notification> {
    return apiService.get(`/notifications/${id}/`);
  },

  async markAsRead(notificationIds: number[]): Promise<any> {
    return apiService.post('/notifications/mark-read/', {
      notification_ids: notificationIds,
    });
  },

  async markAllAsRead(): Promise<any> {
    return apiService.post('/notifications/mark-all-read/');
  },

  async getUnreadCount(): Promise<{ unread_count: number }> {
    return apiService.get('/notifications/unread-count/');
  },

  async deleteNotification(id: number): Promise<any> {
    return apiService.delete(`/notifications/${id}/delete/`);
  },

  async getPreferences(): Promise<NotificationPreferences> {
    return apiService.get('/notifications/preferences/');
  },

  async updatePreferences(
    payload: Partial<NotificationPreferences> & {
      types?: Record<string, Partial<{ push_enabled: boolean; in_app_enabled: boolean }>>;
    }
  ): Promise<NotificationPreferences> {
    return apiService.patch('/notifications/preferences/', payload);
  },
};
