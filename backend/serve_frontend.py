"""
Lightweight SPA static HTTP server and API proxy for frontend dist.
Serves static files, rewrites page routes to index.html, and proxies /api/ requests to Django backend on port 8000.
Run: python serve_frontend.py
"""
import os
import sys
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 5173
BACKEND_URL = 'http://127.0.0.1:8000'
DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))


class SPAAndProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_proxy(self):
        target_url = f"{BACKEND_URL}{self.path}"
        headers = {k: v for k, v in self.headers.items() if k.lower() != 'host'}
        body = None
        if 'content-length' in self.headers:
            length = int(self.headers['content-length'])
            body = self.rfile.read(length)

        req = urllib.request.Request(target_url, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Proxy error: {str(e)}".encode('utf-8'))

    def do_GET(self):
        if self.path.startswith('/api/') or self.path.startswith('/media/'):
            return self.do_proxy()

        req_path = self.path.split('?')[0]
        file_path = os.path.join(DIST_DIR, req_path.lstrip('/'))
        
        if req_path != '/' and os.path.exists(file_path) and os.path.isfile(file_path):
            return super().do_GET()
        
        self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/') or self.path.startswith('/media/'):
            return self.do_proxy()
        return self.send_error(501, "Unsupported method")

    def do_PUT(self):
        return self.do_POST()

    def do_PATCH(self):
        return self.do_POST()

    def do_DELETE(self):
        return self.do_POST()


if __name__ == '__main__':
    if not os.path.exists(DIST_DIR):
        print(f"ERROR: Frontend build directory not found at {DIST_DIR}")
        sys.exit(1)
        
    print("="*60)
    print("  KVVA Management System — Frontend Server with API Proxy")
    print(f"  Listening on http://localhost:{PORT}")
    print(f"  Proxying /api/ to {BACKEND_URL}")
    print("="*60)
    
    server = HTTPServer(('0.0.0.0', PORT), SPAAndProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()
