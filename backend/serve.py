"""
Production WSGI server entry-point using Waitress.
Run: python serve.py
"""

import os
from waitress import serve

# Read .env file manually to detect DEBUG mode and set default settings module
try:
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            env_content = f.read()
        if 'DEBUG=True' in env_content.replace(' ', ''):
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.development')
            print("Detected DEBUG=True in .env. Using development settings.")
        else:
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')
    else:
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')
except Exception:
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.production')

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()

if __name__ == '__main__':
    print("="*60)
    print("  KVVA Management System — Production Server")
    print("  Listening on http://0.0.0.0:8000")
    print("="*60)
    serve(application, host='0.0.0.0', port=8000, threads=4)
