"""
Request validation middleware for API endpoints.
"""
import json
from typing import Optional

from django.conf import settings
from django.http import JsonResponse


class RequestValidationMiddleware:
    """
    Apply basic global request validation for write operations.

    - Enforces valid JSON body for JSON requests.
    - Normalizes malformed payload responses into a single shape.
    """

    WRITE_METHODS = {"POST", "PUT", "PATCH"}
    API_PREFIX = "/api/"
    JSON_CONTENT_TYPE = "application/json"
    FORM_CONTENT_TYPES = ("multipart/form-data", "application/x-www-form-urlencoded")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        validation_error = self._validate_request(request)
        if validation_error:
            return validation_error
        return self.get_response(request)

    def _validate_request(self, request) -> Optional[JsonResponse]:
        if request.method not in self.WRITE_METHODS:
            return None

        if not request.path.startswith(self.API_PREFIX):
            return None

        content_type = (request.content_type or "").lower()
        raw_body = request.body or b""
        has_body = bool(raw_body and raw_body.strip())

        is_json = self.JSON_CONTENT_TYPE in content_type
        is_form = any(form_type in content_type for form_type in self.FORM_CONTENT_TYPES)

        if is_json:
            if not has_body:
                return self._validation_response("Request body is required for this endpoint.")

            try:
                parsed_body = json.loads(raw_body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return self._validation_response("Invalid JSON payload.")

            if not isinstance(parsed_body, dict):
                return self._validation_response("JSON body must be an object.")

            return None

        if is_form:
            # Multipart/form-data and urlencoded requests are validated by serializers/views.
            return None

        if has_body:
            return self._validation_response("Unsupported content type for request body.")

        return None

    def _validation_response(self, message: str) -> JsonResponse:
        payload = {
            "error": "Validation error occurred.",
            "code": "validation_error",
            "field_errors": {
                "body": [message],
            },
        }
        if settings.DEBUG:
            payload["error_type"] = "RequestValidationError"
        return JsonResponse(payload, status=400)
