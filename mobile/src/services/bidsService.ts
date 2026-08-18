import { apiService } from './api';
import { Bid } from '../types';

export const bidsService = {
  // Создать предложение
  async createBid(data: {
    advertisement: number;
    proposed_amount: number;
  }): Promise<Bid> {
    return apiService.post('/bids/', data);
  },

  // Получить мои предложения
  async getMyBids(): Promise<Bid[]> {
    return apiService.get('/bids/my/');
  },

  // Получить предложения для объявления
  async getAdvertisementBids(advertisementId: number, params?: { sort?: 'trust' | 'date' }): Promise<Bid[]> {
    return apiService.get(`/bids/advertisement/${advertisementId}/`, params);
  },

  // Принять цену предложения
  async acceptPrice(id: number): Promise<{ bid: Bid; order_id: number }> {
    return apiService.post(`/bids/${id}/accept-price/`, {});
  },

  // Отклонить предложение
  async reject(id: number): Promise<Bid> {
    return apiService.post(`/bids/${id}/reject/`, {});
  },

  // Сделать встречное предложение
  async counterOffer(id: number, amount: number): Promise<Bid> {
    return apiService.post(`/bids/${id}/counter-offer/`, { amount });
  },

  async agreeToCounter(id: number): Promise<Bid> {
    return apiService.post(`/bids/${id}/agree-counter/`, {});
  },
};
