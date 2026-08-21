"""
Utility functions for the accounts app.
"""

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Returns consistent error format:
    { "error": true, "message": "...", "details": {...} }
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_message = 'An error occurred.'
        details = {}

        if isinstance(response.data, dict):
            if 'detail' in response.data:
                error_message = str(response.data['detail'])
            elif 'non_field_errors' in response.data:
                error_message = str(response.data['non_field_errors'][0])
            else:
                # Collect field-level errors
                details = response.data
                first_key = next(iter(details), None)
                if first_key:
                    first_val = details[first_key]
                    if isinstance(first_val, list):
                        error_message = f"{first_key}: {first_val[0]}"
                    else:
                        error_message = str(first_val)
        elif isinstance(response.data, list):
            error_message = str(response.data[0])

        response.data = {
            'error': True,
            'message': error_message,
            'details': details,
        }

    return response


def get_client_ip(request):
    """Extract client IP from request headers."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def get_local_today():
    """Returns today's date in current local timezone (Asia/Kolkata)."""
    from django.utils import timezone
    return timezone.localtime(timezone.now()).date()
