#!/usr/bin/env python3
"""SPA-aware dev server: serves index.html for all unknown paths."""
import os
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 5501


class SPAHandler(SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        # For any 404, fall back to index.html so the SPA can handle routing.
        if code == 404 and self.path != '/index.html':
            self.path = '/index.html'
            return self.do_GET()
        super().send_error(code, message, explain)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('', PORT), SPAHandler)
    print(f'Serving on http://localhost:{PORT}')
    server.serve_forever()
