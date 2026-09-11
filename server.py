# Suna Chat 2.0 - Local Server & Zero-CORS API Proxy
# Built-in lightweight server supporting static files and reverse proxying

import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import sys
import os
import json
import mimetypes

DEFAULT_PORT = 8080
FORWARD_HEADERS = [
    'authorization', 'content-type', 'accept', 'x-api-key',
    'x-goog-api-key', 'x-goog-api-client', 'anthropic-version',
    'openai-organization', 'http-referer', 'x-title'
]

class SunaProxyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'proxy': True}).encode('utf-8'))
            return

        if self.path.startswith('/api/proxy') or self.path.startswith('/proxy'):
            self.handle_proxy('GET')
            return

        super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/proxy') or self.path.startswith('/proxy'):
            self.handle_proxy('POST')
            return

        self.send_error(404, 'Endpoint Not Found')

    def handle_proxy(self, method):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        target_param = params.get('target', [''])[0].strip()

        if not target_param:
            self.send_error(400, 'Missing target query parameter')
            return

        target_base = target_param.rstrip('/')
        path_after = parsed.path
        for prefix in ['/api/proxy', '/proxy']:
            if path_after.startswith(prefix):
                path_after = path_after[len(prefix):]
                break

        sub_path = path_after.lstrip('/')
        if sub_path.startswith('v1/') and target_base.endswith('/v1'):
            final_url = target_base[:-3] + '/' + sub_path
        elif sub_path:
            final_url = target_base + '/' + sub_path
        else:
            final_url = target_base

        # Re-attach query params excluding target
        extra_query = [(k, v) for k, vlist in params.items() if k != 'target' for v in vlist]
        if extra_query:
            sep = '&' if '?' in final_url else '?'
            final_url += sep + urllib.parse.urlencode(extra_query)

        # Read body if POST
        body = None
        if method == 'POST':
            content_len = int(self.headers.get('Content-Length', 0))
            if content_len > 0:
                body = self.rfile.read(content_len)

        # Build upstream request
        req = urllib.request.Request(final_url, data=body, method=method)
        for h in FORWARD_HEADERS:
            val = self.headers.get(h)
            if val:
                req.add_header(h, val)

        # Standard User-Agent if not provided
        if not self.headers.get('User-Agent'):
            req.add_header('User-Agent', 'SunaChat-LocalProxy/2.0')

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                resp_headers = dict(resp.getheaders())
                for k, v in resp_headers.items():
                    if k.lower() not in ['transfer-encoding', 'content-length', 'access-control-allow-origin']:
                        self.send_header(k, v)
                self.end_headers()

                # Stream response
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except urllib.error.HTTPError as he:
            self.send_response(he.code)
            for k, v in he.headers.items():
                if k.lower() not in ['transfer-encoding', 'content-length', 'access-control-allow-origin']:
                    self.send_header(k, v)
            self.end_headers()
            err_body = he.read()
            if err_body:
                self.wfile.write(err_body)
        except Exception as ex:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Proxy failed: ' + str(ex)}).encode('utf-8'))

def run():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    handler = SunaProxyHandler
    max_attempts = 10
    httpd = None
    for attempt in range(max_attempts):
        try:
            httpd = socketserver.TCPServer(('0.0.0.0', port), handler)
            break
        except OSError:
            print(f'[INFO] Port {port} is occupied, trying port {port + 1}...')
            port += 1

    if not httpd:
        print('[ERROR] Could not bind to any available port.')
        sys.exit(1)

    print(f'=======================================================')
    print(f'   🌸 SUNA CHAT 2.0 ZERO-CORS SERVER IS RUNNING 🌸    ')
    print(f'=======================================================')
    print(f'  🖥️  Local: http://localhost:{port}')
    print(f'  ⚡  Built-in Proxy: http://localhost:{port}/api/proxy')
    print(f'  ⛔  Press Ctrl + C to stop.')
    print(f'=======================================================')

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n[INFO] Server stopped.')
        httpd.server_close()

if __name__ == '__main__':
    run()