/**
 * Error handling service for consistent error management across the app.
 */

import { captureAppError } from '../config/sentry';

export enum ErrorCode {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  PERMISSION_DENIED = 'permission_denied',
  SUBSCRIPTION_REQUIRED = 'subscription_required',
  PAYMENT_REQUIRED = 'payment_required',
  SERVICE_FEE_REQUIRED = 'service_fee_required',
  DOCUMENT_EXPIRED = 'document_expired',
  RATE_LIMITED = 'rate_limited',
  VALIDATION_ERROR = 'validation_error',
  NOT_FOUND = 'not_found',
  SERVER_ERROR = 'server_error',
  UNKNOWN_ERROR = 'unknown_error',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  originalError?: any;
  statusCode?: number;
  fieldErrors?: Record<string, string[]>;
  nonFieldErrors?: string[];
}

class ErrorService {
  /**
   * Parse error from API response or network error.
   */
  parseError(error: any): AppError {
    if (
      error &&
      typeof error === 'object' &&
      typeof error.code === 'string' &&
      typeof error.message === 'string' &&
      Object.values(ErrorCode).includes(error.code as ErrorCode)
    ) {
      return error as AppError;
    }

    // Network errors (no response)
    if (!error.response) {
      if (error.code === 'ECONNREFUSED') {
        return {
          code: ErrorCode.NETWORK_ERROR,
          message: 'Backend serverga ulanib bo\'lmadi. Server ishlayotganini tekshiring.',
          originalError: error,
        };
      }

      if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        return {
          code: ErrorCode.TIMEOUT_ERROR,
          message: 'So\'rov vaqti tugadi. Internet aloqasini tekshiring.',
          originalError: error,
        };
      }

      if (error.message?.includes('Network Error') || error.isNetworkError) {
        return {
          code: ErrorCode.NETWORK_ERROR,
          message: 'Internetga ulanib bo\'lmadi. Internet aloqasini tekshiring.',
          originalError: error,
        };
      }

      return {
        code: ErrorCode.NETWORK_ERROR,
        message: error.message || 'Network xatolik yuz berdi.',
        originalError: error,
      };
    }

    // API errors (with response)
    const statusCode = error.response?.status;
    const errorData = error.response?.data || {};

    // Extract error message
    let message = 'Xatolik yuz berdi.';

    if (errorData.error) {
      message = typeof errorData.error === 'string'
        ? errorData.error
        : JSON.stringify(errorData.error);
    } else if (errorData.detail) {
      message = errorData.detail;
    } else if (errorData.message) {
      message = errorData.message;
    } else if (errorData.non_field_errors) {
      message = Array.isArray(errorData.non_field_errors)
        ? errorData.non_field_errors[0]
        : errorData.non_field_errors;
    } else if (typeof errorData === 'string') {
      message = errorData;
    }

    // Extract field errors
    const fieldErrors: Record<string, string[]> = {};
    if (errorData.field_errors) {
      Object.assign(fieldErrors, errorData.field_errors);
    } else {
      // Check for Django-style field errors
      Object.keys(errorData).forEach((key) => {
        if (key !== 'error' && key !== 'detail' && key !== 'message' && key !== 'code' && key !== 'non_field_errors') {
          const value = errorData[key];
          fieldErrors[key] = Array.isArray(value) ? value : [value];
        }
      });
    }

    // Extract non-field errors
    const nonFieldErrors: string[] = [];
    if (errorData.non_field_errors) {
      nonFieldErrors.push(...(Array.isArray(errorData.non_field_errors)
        ? errorData.non_field_errors
        : [errorData.non_field_errors]));
    }

    // Determine error code based on status
    let code: ErrorCode = ErrorCode.UNKNOWN_ERROR;
    if (errorData.code === 'subscription_required') {
      code = ErrorCode.SUBSCRIPTION_REQUIRED;
    } else if (errorData.code === 'payment_required') {
      code = ErrorCode.PAYMENT_REQUIRED;
    } else if (errorData.code === 'service_fee_required') {
      code = ErrorCode.SERVICE_FEE_REQUIRED;
    } else if (errorData.code === 'document_expired') {
      code = ErrorCode.DOCUMENT_EXPIRED;
    } else if (errorData.code === 'phone_already_registered') {
      code = ErrorCode.VALIDATION_ERROR;
    } else {switch (statusCode) {
      case 400:
        code = ErrorCode.VALIDATION_ERROR;
        break;
      case 429:
        code = ErrorCode.RATE_LIMITED;
        break;
      case 401:
        code = ErrorCode.AUTHENTICATION_ERROR;
        break;
      case 403:
        code = ErrorCode.PERMISSION_DENIED;
        break;
      case 404:
        code = ErrorCode.NOT_FOUND;
        break;
      case 500:
      case 502:
      case 503:
        code = ErrorCode.SERVER_ERROR;
        break;
      default:
        if (errorData.code) {
          // Try to map backend error code to frontend error code
          const codeMap: Record<string, ErrorCode> = {
            'validation_error': ErrorCode.VALIDATION_ERROR,
            'authentication_failed': ErrorCode.AUTHENTICATION_ERROR,
            'permission_denied': ErrorCode.PERMISSION_DENIED,
            'throttled': ErrorCode.RATE_LIMITED,
            'not_found': ErrorCode.NOT_FOUND,
            'network_error': ErrorCode.NETWORK_ERROR,
            'timeout_error': ErrorCode.TIMEOUT_ERROR,
            'payment_required': ErrorCode.PAYMENT_REQUIRED,
            'service_fee_required': ErrorCode.SERVICE_FEE_REQUIRED,
            'document_expired': ErrorCode.DOCUMENT_EXPIRED,
            'delivery_confirmation_required': ErrorCode.VALIDATION_ERROR,
            'location_updates_not_allowed': ErrorCode.VALIDATION_ERROR,
            'subscription_required': ErrorCode.SUBSCRIPTION_REQUIRED,
          };
          code = codeMap[errorData.code] || ErrorCode.UNKNOWN_ERROR;
        }
    }}

    if (code === ErrorCode.RATE_LIMITED) {
      message = 'Juda ko\'p so\'rov yuborildi. Biroz kutib qayta urinib ko\'ring.';
    }

    return {
      code,
      message,
      originalError: error,
      statusCode,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      nonFieldErrors: nonFieldErrors.length > 0 ? nonFieldErrors : undefined,
    };
  }

  /**
   * Get user-friendly error message.
   */
  getUserFriendlyMessage(error: AppError): string {
    // Return the parsed message (already user-friendly)
    return error.message;
  }

  /**
   * Expected business-state errors (not bugs) — should not trigger red error overlay.
   */
  isExpectedError(error: AppError): boolean {
    return (
      error.code === ErrorCode.SUBSCRIPTION_REQUIRED ||
      error.code === ErrorCode.PAYMENT_REQUIRED ||
      error.code === ErrorCode.SERVICE_FEE_REQUIRED ||
      error.code === ErrorCode.DOCUMENT_EXPIRED ||
      error.code === ErrorCode.VALIDATION_ERROR ||
      error.code === ErrorCode.PERMISSION_DENIED ||
      error.code === ErrorCode.AUTHENTICATION_ERROR ||
      error.code === ErrorCode.RATE_LIMITED ||
      error.code === ErrorCode.NOT_FOUND
    );
  }

  /**
   * Log error for debugging.
   */
  logError(error: AppError, context?: Record<string, any>): void {
    if (this.isExpectedError(error)) {
      return;
    }
    const logData = {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      fieldErrors: error.fieldErrors,
      nonFieldErrors: error.nonFieldErrors,
      context,
      timestamp: new Date().toISOString(),
    };

    // In development, log full error details
    if (__DEV__) {
      const isClientError = typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500;
      if (isClientError) {
        // Avoid console.warn — React Native LogBox shows it as a yellow bar to the driver.
        return;
      }
      console.error('Error occurred:', logData);
      if (error.originalError) {
        console.error('Original error:', error.originalError);
      }
    } else {
      // In production, log only essential information
      console.error('Error:', {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    if (!__DEV__) {
      captureAppError(error.originalError || error, logData);
    }
  }

  /**
   * Check if error is retryable.
   */
  isRetryable(error: AppError): boolean {
    return (
      error.code === ErrorCode.NETWORK_ERROR ||
      error.code === ErrorCode.TIMEOUT_ERROR ||
      error.code === ErrorCode.SERVER_ERROR
    );
  }
}

export const errorService = new ErrorService();

/** AppError (api interceptor) yoki Axios javobidan foydalanuvchiga xabar. */
export function getApiErrorMessage(error: unknown, fallback = 'Xatolik yuz berdi.'): string {
  if (!error) {return fallback;}
  if (typeof error === 'string') {return error;}
  if (typeof error !== 'object') {return fallback;}

  const e = error as AppError & {
    response?: { data?: { error?: string; message?: string; detail?: string; code?: string } };
  };

  if (e.code === ErrorCode.PAYMENT_REQUIRED && e.message) {return e.message;}
  if (e.message && e.message !== 'Network Error') {return e.message;}
  if (typeof e.response?.data?.error === 'string') {return e.response.data.error;}
  if (typeof e.response?.data?.message === 'string') {return e.response.data.message;}
  if (typeof e.response?.data?.detail === 'string') {return e.response.data.detail;}

  return fallback;
}
