import { apiService } from './api';
import { Country, City, PaginatedResponse } from '../types';

function normalizeList<T>(data: T[] | PaginatedResponse<T> | null | undefined): T[] {
  if (!data) {return [];}
  if (Array.isArray(data)) {return data;}
  if (Array.isArray(data.results)) {return data.results;}
  return [];
}

export const locationsService = {
  async getCountries(search?: string): Promise<Country[]> {
    const params = search?.trim() ? { q: search.trim() } : undefined;
    const data = await apiService.get<Country[] | PaginatedResponse<Country>>(
      '/locations/countries/',
      params,
    );
    return normalizeList(data);
  },

  async getCities(countryId: number, search?: string): Promise<City[]> {
    const params: Record<string, string | number> = { country_id: countryId };
    if (search?.trim()) {
      params.q = search.trim();
    }
    const data = await apiService.get<City[] | PaginatedResponse<City>>('/locations/cities/', params);
    return normalizeList(data);
  },

  async getNearestCity(
    lat: number,
    lng: number,
    opts?: { countryId?: number; maxKm?: number },
  ): Promise<{
    id: number;
    name: string;
    distance_km: number;
    country_id?: number;
  }> {
    const params: Record<string, string | number> = { lat, lng };
    if (opts?.countryId) {params.country_id = opts.countryId;}
    if (opts?.maxKm) {params.max_km = opts.maxKm;}
    return apiService.get('/locations/nearest-city/', params);
  },
};
