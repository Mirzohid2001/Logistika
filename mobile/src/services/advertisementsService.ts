import { apiService } from './api';
import { Advertisement, FavoriteAdvertisement, SavedSearch } from '../types';

export const advertisementsService = {
  // Получить список объявлений
  async getAdvertisements(params?: {
    departure_country?: number;
    departure_city?: number;
    destination_country?: number;
    destination_city?: number;
    city_from?: number;
    city_to?: number;
    country_from?: number;
    country_to?: number;
    weight_min?: number;
    weight_max?: number;
    cost_min?: number;
    cost_max?: number;
    search?: string;
    date?: 'new' | 'old';
    price?: 'cheap' | 'expensive';
    trust?: 'high' | 'low';
    nearby?: boolean;
    is_closed?: boolean;
    page?: number;
  }): Promise<{ results: Advertisement[]; count: number; next?: string; previous?: string } | Advertisement[]> {
    const queryParams: any = {};
    if (params) {
      if (params.city_from) {queryParams.city_from = params.city_from;}
      if (params.city_to) {queryParams.city_to = params.city_to;}
      if (params.country_from) {queryParams.country_from = params.country_from;}
      if (params.country_to) {queryParams.country_to = params.country_to;}
      if (params.departure_city) {queryParams.departure_city = params.departure_city;}
      if (params.destination_city) {queryParams.destination_city = params.destination_city;}
      if (params.departure_country) {queryParams.departure_country = params.departure_country;}
      if (params.destination_country) {queryParams.destination_country = params.destination_country;}
      if (params.weight_min) {queryParams.weight_min = params.weight_min;}
      if (params.weight_max) {queryParams.weight_max = params.weight_max;}
      if (params.cost_min) {queryParams.cost_min = params.cost_min;}
      if (params.cost_max) {queryParams.cost_max = params.cost_max;}
      if (params.search) {queryParams.search = params.search;}
      if (params.date) {queryParams.date = params.date;}
      if (params.price) {queryParams.price = params.price;}
      if (params.trust) {queryParams.trust = params.trust;}
      if (params.nearby) {queryParams.nearby = '1';}
      if (params.is_closed !== undefined) {queryParams.is_closed = params.is_closed;}
      if (params.page) {queryParams.page = params.page;}
    }
    const response = await apiService.get<any>('/advertisements/', queryParams);
    // Если ответ - массив, оборачиваем в формат с results
    if (Array.isArray(response)) {
      return {
        results: response,
        count: response.length,
      };
    }
    // Если ответ уже в формате с results
    return response;
  },

  // Получить мои объявления
  async getMyAdvertisements(): Promise<Advertisement[]> {
    return apiService.get('/advertisements/my/');
  },

  // Получить объявление по ID
  async getAdvertisement(id: number): Promise<Advertisement> {
    return apiService.get(`/advertisements/${id}/`);
  },

  // Создать объявление
  async createAdvertisement(data: {
    photo?: any;
    title_ru: string;
    title_en?: string;
    title_uz?: string;
    description_ru: string;
    description_en?: string;
    description_uz?: string;
    proposed_cost?: number;
    weight: number;
    cargo_category?: string;
    volume_m3?: number;
    units_count?: number;
    pickup_window_start?: string;
    pickup_window_end?: string;
    delivery_deadline?: string;
    contact_name?: string;
    contact_phone?: string;
    receiver_name?: string;
    receiver_phone?: string;
    special_requirements?: string[];
    required_body_type?: string;
    requires_adr?: boolean;
    requires_reefer?: boolean;
    is_heavy?: boolean;
    route_preference?: string;
    route_stops?: Array<{
      sequence: number;
      stop_type: 'pickup' | 'delivery';
      label?: string;
      address: string;
      lat?: number;
      lng?: number;
    }>;
    departure_address: string;
    departure_city: number;
    destination_address: string;
    destination_city: number;
  }): Promise<Advertisement> {
    if (data.photo) {
      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        if (key === 'photo') {
          formData.append('photo', {
            uri: data.photo.uri,
            type: data.photo.type || 'image/jpeg',
            name: data.photo.fileName || 'photo.jpg',
          } as any);
        } else {
          const value = (data as any)[key];
          if (value !== undefined && value !== null) {
            if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, String(value));
            }
          }
        }
      });
      return apiService.postFormData('/advertisements/', formData);
    }
    return apiService.post('/advertisements/', data);
  },

  // Обновить объявление
  async updateAdvertisement(id: number, data: Partial<{
    photo?: any;
    title_ru?: string;
    title_en?: string;
    title_uz?: string;
    description_ru?: string;
    description_en?: string;
    description_uz?: string;
    proposed_cost?: number;
    weight?: number;
    cargo_category?: string;
    volume_m3?: number;
    units_count?: number;
    pickup_window_start?: string;
    pickup_window_end?: string;
    delivery_deadline?: string;
    contact_name?: string;
    contact_phone?: string;
    receiver_name?: string;
    receiver_phone?: string;
    special_requirements?: string[];
    required_body_type?: string;
    requires_adr?: boolean;
    requires_reefer?: boolean;
    is_heavy?: boolean;
    route_preference?: string;
    route_stops?: any[];
    is_fragile?: boolean;
    delivery_time?: string;
    departure_address?: string;
    departure_country?: number;
    departure_city?: number;
    destination_address?: string;
    destination_country?: number;
    destination_city?: number;
    is_closed?: boolean;
  }>): Promise<Advertisement> {
    if (data.photo) {
      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        if (key === 'photo') {
          formData.append('photo', {
            uri: data.photo.uri,
            type: data.photo.type || 'image/jpeg',
            name: data.photo.fileName || 'photo.jpg',
          } as any);
        } else {
          const value = (data as any)[key];
          if (value !== undefined && value !== null) {
            if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
              formData.append(key, JSON.stringify(value));
            } else {
              formData.append(key, String(value));
            }
          }
        }
      });
      return apiService.postFormData(`/advertisements/${id}/`, formData);
    }
    return apiService.put(`/advertisements/${id}/`, data);
  },

  // Удалить объявление
  async deleteAdvertisement(id: number): Promise<void> {
    return apiService.delete(`/advertisements/${id}/`);
  },

  // Принять объявление (для водителя)
  async acceptAdvertisement(id: number): Promise<any> {
    return apiService.post(`/advertisements/${id}/accept/`, {});
  },

  // Получить список избранных объявлений
  async getFavorites(): Promise<FavoriteAdvertisement[]> {
    return apiService.get('/advertisements/favorites/');
  },

  // Добавить в избранное
  async addToFavorites(id: number): Promise<FavoriteAdvertisement> {
    return apiService.post(`/advertisements/${id}/favorite/`, {});
  },

  // Удалить из избранного
  async removeFromFavorites(id: number): Promise<void> {
    return apiService.delete(`/advertisements/favorites/${id}/`);
  },

  // Получить список сохраненных поисков
  async getSavedSearches(): Promise<SavedSearch[]> {
    return apiService.get('/advertisements/saved-searches/');
  },

  // Создать сохраненный поиск
  async createSavedSearch(data: {
    name: string;
    query?: string;
    departure_city?: number;
    destination_city?: number;
    min_weight?: number;
    max_weight?: number;
    min_cost?: number;
    max_cost?: number;
    filters?: any;
    alerts_enabled?: boolean;
  }): Promise<SavedSearch> {
    return apiService.post('/advertisements/saved-searches/create/', data);
  },

  // Получить сохраненный поиск
  async getSavedSearch(id: number): Promise<SavedSearch> {
    return apiService.get(`/advertisements/saved-searches/${id}/`);
  },

  // Обновить сохраненный поиск
  async updateSavedSearch(id: number, data: Partial<SavedSearch>): Promise<SavedSearch> {
    return apiService.put(`/advertisements/saved-searches/${id}/`, data);
  },

  // Удалить сохраненный поиск
  async deleteSavedSearch(id: number): Promise<void> {
    return apiService.delete(`/advertisements/saved-searches/${id}/`);
  },

  // Применить сохраненный поиск
  async applySavedSearch(id: number): Promise<Advertisement[]> {
    return apiService.get(`/advertisements/saved-searches/${id}/apply/`);
  },

  async getPriceInsight(params: {
    from_city: number;
    to_city: number;
    weight?: number;
  }): Promise<import('../types').PriceInsight> {
    return apiService.get('/advertisements/price-insight/', params);
  },

  async getBackhaulMatches(limit?: number): Promise<import('../types').BackhaulMatchesResponse> {
    return apiService.get('/advertisements/backhaul-matches/', limit ? { limit } : undefined);
  },

  async getDriverMatches(limit?: number): Promise<import('../types').DriverMatchesResponse> {
    return apiService.get('/advertisements/for-driver/', limit ? { limit } : undefined);
  },

  async getAvailability(): Promise<import('../types').DriverAvailability> {
    return apiService.get('/advertisements/driver/availability/');
  },

  async updateAvailability(data: {
    status?: string;
    available_from?: string | null;
    current_city?: number | null;
    note?: string;
  }): Promise<import('../types').DriverAvailability> {
    return apiService.patch('/advertisements/driver/availability/', data);
  },

  async getLanes(): Promise<{ lanes: import('../types').DriverLane[] }> {
    return apiService.get('/advertisements/driver/lanes/');
  },

  async createLane(data: {
    departure_city: number;
    destination_city: number;
    weekdays?: number[];
    include_backhaul?: boolean;
    time_from_hour?: number | null;
    time_to_hour?: number | null;
  }): Promise<import('../types').DriverLane> {
    return apiService.post('/advertisements/driver/lanes/', data);
  },

  async updateLane(
    id: number,
    data: {
      weekdays?: number[];
      include_backhaul?: boolean;
      is_active?: boolean;
      time_from_hour?: number | null;
      time_to_hour?: number | null;
    },
  ): Promise<import('../types').DriverLane> {
    return apiService.patch(`/advertisements/driver/lanes/${id}/`, data);
  },

  async deleteLane(id: number): Promise<void> {
    return apiService.delete(`/advertisements/driver/lanes/${id}/`);
  },

  async getTripEstimate(advertisementId: number, amount?: number): Promise<import('../types').TripProfitEstimate> {
    return apiService.get(`/advertisements/${advertisementId}/trip-estimate/`, amount ? { amount } : undefined);
  },

  async getLoadFit(advertisementId: number): Promise<import('../types').LoadFitResult> {
    return apiService.get(`/advertisements/${advertisementId}/load-fit/`);
  },

  async reorderFromOrder(orderId: number): Promise<Advertisement> {
    return apiService.post(`/advertisements/reorder-from-order/${orderId}/`, {});
  },

  async getRouteHealth(params: {
    from_city: number;
    to_city: number;
    weight?: number;
  }): Promise<import('../types').RouteHealthInsight> {
    return apiService.get('/advertisements/route-health/', params);
  },

  async getDuplicateRisk(params: {
    from_city: number;
    to_city: number;
    weight?: number;
    proposed_cost?: number;
  }): Promise<import('../types').DuplicateRiskInsight> {
    return apiService.get('/advertisements/duplicate-risk/', params);
  },
};
