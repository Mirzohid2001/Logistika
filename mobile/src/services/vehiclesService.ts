import { apiService } from './api';
import { Vehicle } from '../types';

export const vehiclesService = {
  // Получить список транспортных средств
  async getVehicles(): Promise<Vehicle[]> {
    return apiService.get('/users/vehicles/');
  },

  // Получить транспортное средство по ID
  async getVehicle(id: number): Promise<Vehicle> {
    return apiService.get(`/users/vehicles/${id}/`);
  },

  // Создать транспортное средство
  async createVehicle(data: {
    make: string;
    model: string;
    number: string;
    photo?: any;
    document_photos?: any[];
    cargo_volume: number;
    load_capacity: number;
    body_type?: string;
    has_adr?: boolean;
    is_reefer?: boolean;
    is_heavy_haul?: boolean;
  }): Promise<Vehicle> {
    if (data.photo || (data.document_photos && data.document_photos.length > 0)) {
      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        if (key === 'photo' && data.photo) {
          formData.append('photo', {
            uri: data.photo.uri,
            type: data.photo.type || 'image/jpeg',
            name: data.photo.fileName || 'vehicle.jpg',
          } as any);
        } else if (key === 'document_photos' && data.document_photos) {
          data.document_photos.forEach((doc) => {
            formData.append('document_photos', {
              uri: doc.uri,
              type: doc.type || 'image/jpeg',
              name: doc.fileName || 'document.jpg',
            } as any);
          });
        } else if (key !== 'document_photos') {
          const value = (data as any)[key];
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        }
      });
      return apiService.postFormData('/users/vehicles/', formData);
    }
    return apiService.post('/users/vehicles/', data);
  },

  // Обновить транспортное средство
  async updateVehicle(id: number, data: Partial<{
    make?: string;
    model?: string;
    number?: string;
    photo?: any;
    document_photos?: any[];
    cargo_volume?: number;
    load_capacity?: number;
    body_type?: string;
    has_adr?: boolean;
    is_reefer?: boolean;
    is_heavy_haul?: boolean;
  }>): Promise<Vehicle> {
    if (data.photo || (data.document_photos && data.document_photos.length > 0)) {
      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        if (key === 'photo' && data.photo) {
          formData.append('photo', {
            uri: data.photo.uri,
            type: data.photo.type || 'image/jpeg',
            name: data.photo.fileName || 'vehicle.jpg',
          } as any);
        } else if (key === 'document_photos' && data.document_photos) {
          data.document_photos.forEach((doc) => {
            formData.append('document_photos', {
              uri: doc.uri,
              type: doc.type || 'image/jpeg',
              name: doc.fileName || 'document.jpg',
            } as any);
          });
        } else if (key !== 'document_photos') {
          const value = (data as any)[key];
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        }
      });
      return apiService.postFormData(`/users/vehicles/${id}/`, formData);
    }
    return apiService.put(`/users/vehicles/${id}/`, data);
  },

  // Удалить транспортное средство
  async deleteVehicle(id: number): Promise<void> {
    return apiService.delete(`/users/vehicles/${id}/`);
  },
};
