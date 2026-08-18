import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { errorService, AppError, ErrorCode } from './errorService';
import { authSessionService } from './authSessionService';
import { getApiBaseUrl, getMediaBaseUrl, getApiDebugInfo } from '../config/appConfig';
import { isTokenExpiringSoon } from '../utils/jwt';
import { secureTokenStorage } from './secureTokenStorage';

export const getMediaUrl = (path?: string | null): string | null => {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const base = getMediaBaseUrl().replace(/\/$/, '');
  const relative = trimmed.replace(/^\/+/, '').replace(/^media\//, '');
  return `${base}/media/${relative}`;
};

interface RetryConfig {
  retries: number;
  retryDelay: number; // milliseconds
  retryCondition?: (error: AppError) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  retries: 3,
  retryDelay: 1000, // 1 second
};

class ApiService {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;
  private refreshTokenPromise: Promise<string> | null = null;
  private readonly maxAuthRetryCount = 1;

  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
    this.client = axios.create({
      baseURL: getApiBaseUrl(),
      timeout: 60000, // 60 soniya timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('[Logistika]', getApiDebugInfo());

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      async (config) => {
        let token = await secureTokenStorage.getAccessToken();
        const language = await AsyncStorage.getItem('user-language');

        if (token && isTokenExpiringSoon(token)) {
          try {
            token = await this.refreshAccessToken();
          } catch {
            // Let the request proceed; response interceptor will handle 401.
          }
        }

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        if (language === 'uz' || language === 'ru' || language === 'en') {
          config.headers['Accept-Language'] = language;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Обработка 401 ошибки - попытка обновить токен
        if (error.response?.status === 401) {
          const currentRetryCount = originalRequest?._authRetryCount || 0;

          // Не пытаемся обновить токен для эндпоинтов авторизации
          if (
            originalRequest.url?.includes('/auth/login/') ||
            originalRequest.url?.includes('/auth/register/') ||
            originalRequest.url?.includes('/auth/refresh/')
          ) {
            return Promise.reject(error);
          }

          if (currentRetryCount >= this.maxAuthRetryCount) {
            await this.handleSessionExpired('Maximum auth retries reached');
            return Promise.reject(errorService.parseError(error));
          }

          originalRequest._authRetryCount = currentRetryCount + 1;

          try {
            const accessToken = await this.refreshAccessToken();
            if (!originalRequest.headers) {
              originalRequest.headers = {};
            }
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            await this.handleSessionExpired('Refresh token failed');
            return Promise.reject(errorService.parseError(refreshError));
          }
        }

        const appError = errorService.parseError(error);

        if (appError.code === ErrorCode.SUBSCRIPTION_REQUIRED) {
          authSessionService.emitSubscriptionRequired();
        }

        if (!errorService.isExpectedError(appError)) {
          errorService.logError(appError, {
            url: originalRequest?.url,
            method: originalRequest?.method,
            platform: Platform.OS,
          });
        }

        return Promise.reject(appError);
      }
    );
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = (async () => {
      const refreshToken = await secureTokenStorage.getRefreshToken();

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post(`${getApiBaseUrl()}/auth/refresh/`, {
        refresh: refreshToken,
      });

      const { access, refresh } = response.data as { access?: string; refresh?: string };

      if (!access) {
        throw new Error('Refresh response does not contain access token');
      }

      await secureTokenStorage.updateTokens({
        accessToken: access,
        refreshToken: refresh ?? null,
      });

      return access;
    })();

    try {
      return await this.refreshTokenPromise;
    } finally {
      this.refreshTokenPromise = null;
    }
  }

  private async handleSessionExpired(reason: string): Promise<void> {
    await secureTokenStorage.clear();
    await AsyncStorage.multiRemove(['user']);
    authSessionService.emitSessionExpired({ reason });
  }

  /**
   * Retry logic for failed requests.
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    retriesLeft: number = this.retryConfig.retries
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      const appError = errorService.parseError(error);
      
      // Check if error is retryable
      if (retriesLeft > 0 && errorService.isRetryable(appError)) {
        // Wait before retrying (exponential backoff)
        const delay = this.retryConfig.retryDelay * (this.retryConfig.retries - retriesLeft + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        
        // Retry request
        return this.retryRequest(requestFn, retriesLeft - 1);
      }
      
      // No more retries or error is not retryable
      throw appError;
    }
  }

  async get<T>(url: string, params?: any, retry: boolean = true): Promise<T> {
    const requestFn = () => this.client.get<T>(url, { params }).then((res) => res.data);
    
    if (retry) {
      return this.retryRequest(requestFn);
    }
    
    return requestFn();
  }

  async post<T>(url: string, data?: any, config?: any, retry: boolean = true): Promise<T> {
    const isFormData = data instanceof FormData;
    const requestFn = () => this.client.post<T>(url, data, {
      ...config,
      headers: isFormData
        ? {
            ...config?.headers,
            'Content-Type': undefined,
          }
        : config?.headers,
    }).then((res) => res.data);
    
    if (retry) {
      return this.retryRequest(requestFn);
    }
    
    return requestFn();
  }

  async put<T>(url: string, data?: any, retry: boolean = true): Promise<T> {
    const isFormData = data instanceof FormData;
    const requestFn = () => this.client.put<T>(url, data, {
      headers: isFormData
        ? {
            'Content-Type': undefined,
          }
        : undefined,
    }).then((res) => res.data);
    
    if (retry) {
      return this.retryRequest(requestFn);
    }
    
    return requestFn();
  }

  async patch<T>(url: string, data?: any, retry: boolean = true): Promise<T> {
    const requestFn = () => this.client.patch<T>(url, data).then((res) => res.data);

    if (retry) {
      return this.retryRequest(requestFn);
    }

    return requestFn();
  }

  async delete<T>(url: string, retry: boolean = true): Promise<T> {
    const requestFn = () => this.client.delete<T>(url).then((res) => res.data);
    
    if (retry) {
      return this.retryRequest(requestFn);
    }
    
    return requestFn();
  }

  async postFormData<T>(url: string, formData: FormData): Promise<T> {
    let token = await secureTokenStorage.getAccessToken();
    if (token && isTokenExpiringSoon(token)) {
      try {
        token = await this.refreshAccessToken();
      } catch {
        // Fall through with the existing token.
      }
    }
    const response = await axios.post<T>(`${getApiBaseUrl()}${url}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    return response.data;
  }
}

export const apiService = new ApiService();


