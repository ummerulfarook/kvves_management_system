"""
Lightweight SPA static HTTP server for frontend dist.
Serves static files and rewrites page routes to index.html.
Run: python serve_frontend.py
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 5173
DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        req_path = self.path.split('?')[0]
        file_path = os.path.join(DIST_DIR, req_path.lstrip('/'))
        
        if req_path != '/' and os.path.exists(file_path) and os.path.isfile(file_path):
            return super().do_GET()
        
        self.path = '/index.html'
        return super().do_GET()


if __name__ == '__main__':
    if not os.path.exists(DIST_DIR):
        print(f"ERROR: Frontend build directory not found at {DIST_DIR}")
        sys.exit(1)
        
    print("="*60)
    print("  KVVA Management System — Frontend Server")
    print(f"  Listening on http://localhost:{PORT}")
    print("="*60)
    
    server = HTTPServer(('0.0.0.0', PORT), SPAHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()
