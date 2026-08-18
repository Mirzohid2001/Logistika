import { apiService } from './api';
import { News } from '../types';

export const newsService = {
  // Получить список новостей
  async getNews(params?: {
    page?: number;
  }): Promise<{ results: News[]; count: number; next?: string; previous?: string }> {
    return apiService.get('/news/', params);
  },

  // Получить новость по ID
  async getNewsItem(id: number): Promise<News> {
    return apiService.get(`/news/${id}/`);
  },
};
