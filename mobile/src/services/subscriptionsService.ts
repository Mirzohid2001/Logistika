import { apiService } from './api';
import type { SubscriptionPlan, SubscriptionPurchaseResponse, UserSubscriptionStatus } from '../types';

export const subscriptionsService = {
  async getPlans(): Promise<SubscriptionPlan[]> {
    return apiService.get('/subscriptions/plans/');
  },

  async getMyStatus(): Promise<UserSubscriptionStatus & { subscription?: unknown }> {
    return apiService.get('/subscriptions/me/');
  },

  async subscribe(planId: number, paymentMethod: 'mock' | 'click' | 'payme' | 'uzum' = 'mock'): Promise<SubscriptionPurchaseResponse> {
    return apiService.post('/subscriptions/subscribe/', {
      plan_id: planId,
      payment_method: paymentMethod,
    });
  },
};
