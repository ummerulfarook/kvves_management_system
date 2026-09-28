"""
Development settings for KVVA Management System.
Uses SQLite for easy local development without PostgreSQL dependency.
Switch to production.py when deploying with PostgreSQL.
"""

from .base import *

DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '*']

# SQLite for development / local client deployments
# Automatically picks the real database file even if Windows hid the extension (e.g. db.sqlite3.sqlite3, db.sqlite3.db)
possible_dbs = [
    BASE_DIR / 'db.sqlite3',
    BASE_DIR / 'db.sqlite3.sqlite3',
    BASE_DIR / 'db.sqlite3.db',
    BASE_DIR / 'db.db',
    BASE_DIR.parent / 'db.sqlite3',
    BASE_DIR.parent / 'db.sqlite3.sqlite3',
    BASE_DIR.parent / 'db.sqlite3.db',
]

db_file = BASE_DIR / 'db.sqlite3'
best_db = None
max_size = 0

for p in possible_dbs:
    try:
        if p.exists() and p.is_file():
            sz = p.stat().st_size
            if sz > max_size:
                max_size = sz
                best_db = p
    except Exception:
        pass

if best_db and max_size > 50000:
    db_file = best_db

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
