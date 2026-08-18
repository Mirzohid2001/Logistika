import { apiService } from './api';
import { Earnings } from '../types';

export interface AdvancedAnalytics {
  earnings_analysis?: {
    total_earnings: number;
    total_payments: number;
    average_per_order: number;
    daily_earnings: Array<{ date: string; earnings: number }>;
  };
  expenses_analysis?: {
    total_expenses: number;
    total_payments: number;
    average_per_order: number;
    daily_expenses: Array<{ date: string; expenses: number }>;
  };
  best_times: {
    hourly_distribution: Array<{ hour: number; count: number }>;
    best_hour: number | null;
  };
  best_routes: Array<{
    from: string;
    to: string;
    count: number;
    total_earnings?: number;
    total_cost?: number;
  }>;
}

export const userService = {
  async getEarnings(): Promise<Earnings> {
    return apiService.get('/users/earnings/');
  },

  async getAdvancedAnalytics(params?: {
    date_from?: string;
    date_to?: string;
    type?: 'driver' | 'client';
  }): Promise<AdvancedAnalytics> {
    return apiService.get('/users/analytics/', params);
  },
};
