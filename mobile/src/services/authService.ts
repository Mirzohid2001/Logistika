import { apiService } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthResponse, User, DriverDocument, DriverDocumentMonitoringResponse } from '../types';
import { deviceService } from './deviceService';
import { normalizePhone } from '../utils/phone';
import { secureTokenStorage } from './secureTokenStorage';

export const authService = {
  async sendSMSCode(phone: string): Promise<{ message: string }> {
    return apiService.post('/auth/send-sms-code/', { phone: normalizePhone(phone) });
  },

  async verifySMS(phone: string, code: string): Promise<{ message: string }> {
    return apiService.post('/auth/verify-sms/', { phone: normalizePhone(phone), code });
  },

  async register(data: {
    phone: string;
    password: string;
    password_confirm: string;
    first_name: string;
    last_name: string;
    is_driver: boolean;
    sms_code?: string;
    company_inn?: string;
  }): Promise<AuthResponse> {
    const device_id = await deviceService.getDeviceId();
    const response = await apiService.post<AuthResponse>('/auth/register/', {
      ...data,
      phone: normalizePhone(data.phone),
      device_id,
    });
    await this.saveTokens(response);
    return response;
  },

  async login(phone: string, password: string): Promise<AuthResponse> {
    const device_id = await deviceService.getDeviceId();
    const response = await apiService.post<AuthResponse>('/auth/login/', {
      phone: normalizePhone(phone),
      password,
      device_id,
    });
    await this.saveTokens(response);
    return response;
  },

  async getCurrentUser(): Promise<User> {
    return apiService.get<User>('/auth/me/');
  },

  async updateProfile(data: Partial<User> & { company_inn?: string }): Promise<User> {
    return apiService.put<User>('/auth/me/', data);
  },

  async uploadAvatar(photo: { uri: string; type?: string; fileName?: string }): Promise<User> {
    const formData = new FormData();
    formData.append('avatar', {
      uri: photo.uri,
      type: photo.type || 'image/jpeg',
      name: photo.fileName || `avatar_${Date.now()}.jpg`,
    } as any);
    return apiService.put<User>('/auth/me/', formData);
  },

  async uploadDocuments(photos: any[]): Promise<any> {
    const formData = new FormData();
    photos.forEach((photo, index) => {
      formData.append('document_photos', {
        uri: photo.uri,
        type: photo.type || 'image/jpeg',
        name: photo.fileName || `document_${index}.jpg`,
      } as any);
    });
    return apiService.postFormData('/auth/upload-documents/', formData);
  },

  async getDriverDocuments(): Promise<DriverDocument[]> {
    return apiService.get<DriverDocument[]>('/auth/driver-documents/');
  },

  async getDriverDocumentMonitoring(params?: {
    days?: number;
    severity?: 'all' | 'expired' | 'soon';
    document_type?: string;
  }): Promise<DriverDocumentMonitoringResponse> {
    return apiService.get<DriverDocumentMonitoringResponse>(
      '/auth/driver-documents/monitoring/',
      params,
    );
  },

  async createDriverDocument(data: {
    document_type: DriverDocument['document_type'];
    document_number?: string;
    expires_at: string;
    issued_at?: string | null;
    vehicle?: number | null;
  }): Promise<DriverDocument> {
    return apiService.post<DriverDocument>('/auth/driver-documents/', data);
  },

  async deleteDriverDocument(id: number): Promise<void> {
    await apiService.delete(`/auth/driver-documents/${id}/`);
  },

  async updateDriverDocument(
    id: number,
    data: Partial<{
      document_type: DriverDocument['document_type'];
      document_number: string;
      expires_at: string;
      issued_at: string | null;
      vehicle: number | null;
      is_active: boolean;
    }>
  ): Promise<DriverDocument> {
    return apiService.put<DriverDocument>(`/auth/driver-documents/${id}/`, data);
  },

  async logout(): Promise<void> {
    await secureTokenStorage.clear();
    await AsyncStorage.multiRemove(['user']);
  },

  async saveTokens(response: AuthResponse): Promise<void> {
    await secureTokenStorage.setTokens(response.access, response.refresh);
    await AsyncStorage.setItem('user', JSON.stringify(response.user));
  },

  async saveUser(user: User): Promise<void> {
    await AsyncStorage.setItem('user', JSON.stringify(user));
  },

  async getStoredUser(): Promise<User | null> {
    const userStr = await AsyncStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  async isAuthenticated(): Promise<boolean> {
    return secureTokenStorage.hasTokens();
  },

  async resetPassword(data: {
    phone: string;
    new_password: string;
    new_password_confirm: string;
    sms_code?: string;
  }): Promise<{ message: string }> {
    return apiService.post('/auth/reset-password/', {
      ...data,
      phone: normalizePhone(data.phone),
    });
  },

  async bootstrapCompany(): Promise<{ company_inn: string; role: string }> {
    return apiService.post('/auth/company/bootstrap/', {});
  },

  async getCompanyMembers(): Promise<{ company_inn: string | null; company?: any; members: any[] }> {
    return apiService.get('/auth/company/members/');
  },

  async updateCompany(data: Record<string, string>): Promise<{ company: any }> {
    return apiService.patch('/auth/company/', data);
  },

  async inviteCompanyMember(phone: string): Promise<any> {
    return apiService.post('/auth/company/members/', { phone: normalizePhone(phone) });
  },

  async getPayoutRequests(): Promise<{ results: any[] }> {
    return apiService.get('/auth/payout-requests/');
  },

  async createPayoutRequest(data: { amount: number; bank_details?: string }): Promise<any> {
    return apiService.post('/auth/payout-requests/', data);
  },
};


