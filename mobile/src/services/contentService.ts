import { apiService } from './api';
import { StaticContent } from '../types';

export const contentService = {
  async getPublicOffer(): Promise<StaticContent> {
    return apiService.get('/content/public-offer/');
  },

  async getDisclaimer(): Promise<StaticContent> {
    return apiService.get('/content/disclaimer/');
  },

  async getGuideClients(): Promise<StaticContent> {
    return apiService.get('/content/guide-clients/');
  },

  async getGuideDrivers(): Promise<StaticContent> {
    return apiService.get('/content/guide-drivers/');
  },
};
