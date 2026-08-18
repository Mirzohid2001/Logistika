"""
Error handling utilities and logging.
"""
import logging
import traceback
from django.conf import settings
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import Throttled as DRFThrottled, AuthenticationFailed, NotAuthenticated
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.db import DatabaseError as DjangoDatabaseError
from django.core.exceptions import ValidationError as DjangoValidationError
from .exceptions import BaseAPIException

logger = logging.getLogger(__name__)

def _extract_primary_message(data):
    if not isinstance(data, dict):
        return str(data)

    if data.get('detail'):
        return data.get('detail')
    if data.get('error'):
        return data.get('error')
    if data.get('non_field_errors'):
        non_field = data.get('non_field_errors')
        if isinstance(non_field, list) and non_field:
            return str(non_field[0])
        return str(non_field)

    for key, value in data.items():
        if key in ['detail', 'code', 'non_field_errors']:
            continue
        if isinstance(value, list) and value:
            return str(value[0])
        return str(value)

    return 'An error occurred.'


def get_error_response(error, request=None, include_traceback=False):
    """
    Format error response in a consistent way.
    
    Args:
        error: Exception instance
        request: Request object (optional)
        include_traceback: Whether to include traceback in response (only in DEBUG mode)
    
    Returns:
        dict: Formatted error response
    """
    error_data = {
        'error': str(error),
        'code': getattr(error, 'default_code', 'error'),
    }
    
    # Add traceback only in DEBUG mode and if requested
    if settings.DEBUG and include_traceback:
        error_data['traceback'] = traceback.format_exc()
    
    # Add error type for debugging
    if settings.DEBUG:
        error_data['error_type'] = type(error).__name__
    
    return error_data


def log_error(error, request=None, context=None):
    """
    Log error with context information.
    
    Args:
        error: Exception instance
        request: Request object (optional)
        context: Additional context dict (optional)
    """
    error_message = f"Error: {type(error).__name__}: {str(error)}"
    
    # Add request information if available
    if request:
        error_message += f" | Path: {request.path} | Method: {request.method}"
        if hasattr(request, 'user') and request.user.is_authenticated:
            error_message += f" | User: {request.user.id}"
    
    # Add context if provided
    if context:
        error_message += f" | Context: {context}"
    
    # Log with appropriate level
    if isinstance(
        error,
        (
            BaseAPIException,
            DjangoValidationError,
            DRFThrottled,
            AuthenticationFailed,
            NotAuthenticated,
            InvalidToken,
            TokenError,
        ),
    ):
        logger.warning(error_message)
    else:
        logger.error(error_message, exc_info=True)


def custom_exception_handler(exc, context):
    """
    Custom exception handler for DRF.
    This handles all exceptions and returns consistent error responses.
    
    Args:
        exc: Exception instance
        context: Context dict with request, view, etc.
    
    Returns:
        Response: Formatted error response
    """
    request = context.get('request')
    
    # Handle custom API exceptions
    if isinstance(exc, BaseAPIException):
        log_error(exc, request)
        detail = exc.detail
        if isinstance(detail, dict):
            field_errors = {}
            for key, value in detail.items():
                if isinstance(value, list):
                    field_errors[key] = [str(item) for item in value]
                else:
                    field_errors[key] = [str(value)]
            error_data = {
                'error': _extract_primary_message(detail),
                'code': getattr(exc, 'default_code', 'validation_error'),
            }
            if field_errors:
                error_data['field_errors'] = field_errors
                phone_errors = field_errors.get('phone', [])
                if any('mavjud' in msg or 'already' in msg.lower() for msg in phone_errors):
                    error_data['error'] = phone_errors[0]
                    error_data['code'] = 'phone_already_registered'
        else:
            error_data = {
                'error': str(detail),
                'code': getattr(exc, 'default_code', 'error'),
            }
            if settings.DEBUG:
                error_data['error_type'] = type(exc).__name__
        return Response(error_data, status=exc.status_code)
    
    # Handle Django validation errors
    if isinstance(exc, DjangoValidationError):
        log_error(exc, request)
        return Response(
            {
                'error': 'Validation error occurred.',
                'code': 'validation_error',
                'details': exc.message_dict if hasattr(exc, 'message_dict') else str(exc),
            },
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Handle database errors
    if isinstance(exc, DjangoDatabaseError):
        log_error(exc, request, context={'error_type': 'database'})
        error_message = 'Database error occurred.'
        if settings.DEBUG:
            error_message = str(exc)
        return Response(
            {
                'error': error_message,
                'code': 'database_error',
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    # Use default DRF exception handler for other exceptions
    response = exception_handler(exc, context)
    
    if response is not None:
        # Log the error
        log_error(exc, request)
        
        raw_data = response.data if isinstance(response.data, dict) else {'detail': response.data}

        # Format response consistently
        error_data = {
            'error': _extract_primary_message(raw_data),
            'code': raw_data.get('code', 'validation_error' if response.status_code == 400 else 'error'),
        }

        if response.status_code == 429:
            error_data['code'] = 'throttled'
            error_data['error'] = 'Juda ko\'p so\'rov yuborildi. Biroz kutib qayta urinib ko\'ring.'
        
        # Add non-field errors if present
        if 'non_field_errors' in raw_data:
            error_data['non_field_errors'] = raw_data['non_field_errors']
        
        # Add field errors if present
        if isinstance(raw_data, dict) and any(key not in ['detail', 'code', 'non_field_errors', 'error'] for key in raw_data.keys()):
            field_errors = {k: v for k, v in raw_data.items() if k not in ['detail', 'code', 'non_field_errors', 'error']}
            if field_errors:
                error_data['field_errors'] = field_errors
        
        response.data = error_data
    else:
        # Handle unexpected exceptions
        log_error(exc, request, context={'error_type': 'unexpected'})
        error_message = 'An unexpected error occurred.'
        if settings.DEBUG:
            error_message = str(exc)
            error_data = {
                'error': error_message,
                'code': 'unexpected_error',
                'traceback': traceback.format_exc(),
            }
        else:
            error_data = {
                'error': error_message,
                'code': 'unexpected_error',
            }
        
        response = Response(error_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    return response
