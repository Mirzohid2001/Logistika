import { apiService } from './api';
import { Payment, PaymentHistory, PaginatedResponse } from '../types';

export const paymentsService = {
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
};
