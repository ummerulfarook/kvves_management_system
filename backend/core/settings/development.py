"""
Development settings for KVVA Management System.
Uses SQLite for easy local development without PostgreSQL dependency.
Switch to production.py when deploying with PostgreSQL.
"""

from .base import *

DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '*']

# SQLite for development / local client deployments
db_file = BASE_DIR / 'db.sqlite3'
root_db_file = BASE_DIR.parent / 'db.sqlite3'

if root_db_file.exists():
    if not db_file.exists() or (db_file.stat().st_size < 50000 and root_db_file.stat().st_size > db_file.stat().st_size):
        db_file = root_db_file

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': db_file,
    }
}

CORS_ALLOW_ALL_ORIGINS = True

# Django Debug
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
