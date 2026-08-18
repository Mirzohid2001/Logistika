import { apiService } from './api';
import { Rating, RatingStats } from '../types';

export interface ReviewsStatistics {
  received: {
    average_rating: number;
    total_ratings: number;
    rating_distribution: {
      '5': number;
      '4': number;
      '3': number;
      '2': number;
      '1': number;
    };
  };
  given: {
    average_rating: number;
    total_ratings: number;
  };
  monthly_statistics: Array<{
    month: string;
    count: number;
    average: number;
  }>;
}

export interface ReviewsRecommendations {
  recommendations: string[];
  current_stats: {
    average_rating: number;
    total_ratings: number;
    low_ratings_count: number;
    low_rating_percentage: number;
  };
}

export const ratingsService = {
  async createRating(data: {
    order_id: number;
    to_user_id: number;
    rating: number;
    comment?: string;
  }): Promise<Rating> {
    return apiService.post('/ratings/create/', data);
  },

  async getRatings(params?: {
    user_id?: number;
    order_id?: number;
  }): Promise<Rating[]> {
    return apiService.get('/ratings/', params);
  },

  async getRating(id: number): Promise<Rating> {
    return apiService.get(`/ratings/${id}/`);
  },

  async getUserRatingStats(userId: number): Promise<RatingStats> {
    return apiService.get(`/ratings/user/${userId}/stats/`);
  },

  async getReviewsHistory(params?: {
    user_id?: number;
    date_from?: string;
    date_to?: string;
    rating?: number;
  }): Promise<Rating[]> {
    return apiService.get('/ratings/history/', params);
  },

  async getReviewsStatistics(userId?: number): Promise<ReviewsStatistics> {
    return apiService.get('/ratings/statistics/', userId ? { user_id: userId } : undefined);
  },

  async getReviewsRecommendations(): Promise<ReviewsRecommendations> {
    return apiService.get('/ratings/recommendations/');
  },
};
