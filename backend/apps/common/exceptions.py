"""
Custom exception classes for the application.
"""
from rest_framework import status
from rest_framework.exceptions import APIException


class BaseAPIException(APIException):
    """Base exception class for all custom API exceptions."""
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = 'An error occurred.'
    default_code = 'error'

    def __init__(self, detail=None, code=None, status_code=None):
        if status_code is not None:
            self.status_code = status_code
        if detail is not None:
            self.detail = detail
        if code is not None:
            self.default_code = code
        super().__init__(detail, code)


class ValidationError(BaseAPIException):
    """Exception for validation errors."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Validation error occurred.'
    default_code = 'validation_error'


class NotFoundError(BaseAPIException):
    """Exception for not found errors."""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = 'Resource not found.'
    default_code = 'not_found'


class PermissionDeniedError(BaseAPIException):
    """Exception for permission denied errors."""
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'Permission denied.'
    default_code = 'permission_denied'


class AuthenticationError(BaseAPIException):
    """Exception for authentication errors."""
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = 'Authentication failed.'
    default_code = 'authentication_failed'


class PaymentError(BaseAPIException):
    """Exception for payment-related errors."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Payment error occurred.'
    default_code = 'payment_error'


class ExternalServiceError(BaseAPIException):
    """Exception for external service errors (SMS, Payment gateways, etc.)."""
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = 'External service error occurred.'
    default_code = 'external_service_error'


class DatabaseError(BaseAPIException):
    """Exception for database errors."""
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = 'Database error occurred.'
    default_code = 'database_error'
