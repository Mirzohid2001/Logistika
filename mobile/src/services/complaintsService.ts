import { apiService } from './api';
import { Complaint } from '../types';

export const complaintsService = {
  async createComplaint(data: {
    order_id: number;
    to_user_id: number;
    category: string;
    description: string;
  }): Promise<Complaint> {
    return apiService.post('/ratings/complaints/create/', data);
  },

  async getComplaints(params?: {
    direction?: 'filed' | 'received';
    order_id?: number;
  }): Promise<Complaint[]> {
    return apiService.get('/ratings/complaints/', params);
  },

  async getStaffComplaints(params?: { status?: string; order_id?: number }): Promise<Complaint[]> {
    return apiService.get('/ratings/complaints/staff/', params);
  },

  async resolveComplaint(
    id: number,
    data: {
      status: 'in_review' | 'resolved' | 'dismissed';
      admin_notes?: string;
      action?: 'none' | 'warn' | 'suspend_7' | 'suspend_30' | 'block';
    },
  ): Promise<Complaint> {
    return apiService.post(`/ratings/complaints/${id}/resolve/`, data);
  },
};
