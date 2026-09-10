import { apiService } from './api';
import {
  OrderCompletionFeeListResponse,
  OrderCompletionFeeSummary,
  Payment,
  PaymentHistory,
  PaginatedResponse,
  AccountBalancesResponse,
} from '../types';

export const paymentsService = {
  async getBalances(role: 'client' | 'driver'): Promise<AccountBalancesResponse> {
    return apiService.get('/payments/balances/', { role });
  },

  async topUpBalance(data: {
    balance_type: 'order' | 'commission';
    amount: number;
    currency: 'UZS' | 'USD';
    payment_method: 'click' | 'payme' | 'uzum' | 'mock';
  }): Promise<Payment> {
    return apiService.post('/payments/balances/top-up/', data);
  },

  // Создать платеж
  async createPayment(data: {
    order_id?: number;
    amount: number;
    currency?: string;
    payment_method: string;
  }): Promise<Payment> {
    return apiService.post('/payments/create/', data);
  },

  // Получить мои платежи
  async getMyPayments(params?: {
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Payment>> {
    return apiService.get('/payments/my/', params);
  },

  // Получить статус платежа
  async getPaymentStatus(id: number): Promise<Payment> {
    return apiService.get(`/payments/${id}/status/`);
  },

  // Получить платежи для заказа
  async getOrderPayments(orderId: number): Promise<Payment[]> {
    return apiService.get(`/payments/order/${orderId}/`);
  },

  // Получить историю платежа
  async getPaymentHistory(id: number): Promise<PaymentHistory[]> {
    return apiService.get(`/payments/${id}/history/`);
  },

  // Возврат платежа
  async refundPayment(id: number, data?: { reason?: string; amount?: number }): Promise<Payment> {
    return apiService.post(`/payments/${id}/refund/`, data || {});
  },

  async getCompletionFees(status: 'pending' | 'paid' | 'waived' | 'all' = 'pending'): Promise<OrderCompletionFeeListResponse> {
    return apiService.get('/payments/completion-fees/', { status });
  },

  async getCompletionFeeSummary(): Promise<OrderCompletionFeeSummary> {
    return apiService.get('/payments/completion-fees/summary/');
  },

  async payCompletionFee(id: number, paymentMethod: 'click' | 'payme' | 'uzum' | 'mock'): Promise<Payment> {
    return apiService.post(`/payments/completion-fees/${id}/pay/`, {
      payment_method: paymentMethod,
    });
  },
};
