# Suna Chat 2.0 - loopback-only static server and constrained API proxy.

import http.server
import ipaddress
import json
import socket
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PORT = 8080
MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024
FORWARD_HEADERS = [
    'authorization', 'content-type', 'accept', 'x-api-key',
    'x-goog-api-key', 'x-goog-api-client', 'anthropic-version',
    'openai-organization', 'http-referer', 'x-title'
]
RESPONSE_HEADERS_BLOCKLIST = {
    'access-control-allow-origin', 'connection', 'content-length',
    'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'set-cookie', 'te', 'trailer', 'transfer-encoding', 'upgrade'
}


def _is_public_address(address):
    ip = ipaddress.ip_address(address.split('%', 1)[0])
    return ip.is_global


def _validate_public_https_url(raw_url):
    try:
        parsed = urllib.parse.urlsplit(raw_url)
        port = parsed.port
    except (TypeError, ValueError) as exc:
        raise ValueError('Invalid target URL') from exc

    if parsed.scheme.lower() != 'https' or not parsed.hostname:
        raise ValueError('Only public HTTPS targets are allowed')
    if parsed.username or parsed.password:
        raise ValueError('Credentials in target URLs are not allowed')
    if port not in (None, 443):
        raise ValueError('Only HTTPS port 443 is allowed')

    hostname = parsed.hostname.rstrip('.').lower()
    if hostname == 'localhost' or hostname.endswith('.localhost'):
        raise ValueError('Local targets are not allowed')

    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(hostname, port or 443, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise ValueError('Target host could not be resolved') from exc
    if not addresses or any(not _is_public_address(address) for address in addresses):
        raise ValueError('Private, reserved, or local targets are not allowed')

    return parsed


def resolve_proxy_target(request_path, server_address):
    parsed_request = urllib.parse.urlsplit(request_path)
    params = urllib.parse.parse_qs(parsed_request.query, keep_blank_values=True)
    target_param = params.get('target', [''])[0].strip()
    if not target_param:
        raise ValueError('Missing target query parameter')

    base = _validate_public_https_url(target_param.rstrip('/'))
    path_after = parsed_request.path
    for prefix in ('/api/proxy', '/proxy'):
        if path_after.startswith(prefix):
            path_after = path_after[len(prefix):]
            break

    sub_path = path_after.lstrip('/')
    base_path = base.path.rstrip('/')
    if sub_path.startswith('v1/') and base_path.endswith('/v1'):
        final_path = base_path[:-3] + '/' + sub_path
    elif sub_path:
        final_path = base_path + '/' + sub_path
    else:
        final_path = base_path or '/'

    extra_query = [
        (key, value)
        for key, values in params.items()
        if key != 'target'
        for value in values
    ]
    final_url = urllib.parse.urlunsplit((
        'https', base.netloc, final_path,
        urllib.parse.urlencode(extra_query), ''
    ))
    _validate_public_https_url(final_url)
    return final_url


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Automatic upstream redirects are disabled/blocked to prevent SSRF bypass."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, 'Upstream redirect blocked', headers, fp)


PROXY_OPENER = urllib.request.build_opener(NoRedirectHandler)


class SunaProxyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/health':
            self._send_json(200, {'status': 'ok', 'proxy': True})
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

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def handle_proxy(self, method):
        try:
            final_url = resolve_proxy_target(self.path, self.server.server_address)
        except ValueError as exc:
            self._send_json(403, {'error': str(exc)})
            return

        body = None
        if method == 'POST':
            try:
                content_len = int(self.headers.get('Content-Length', 0))
            except ValueError:
                self._send_json(400, {'error': 'Invalid Content-Length'})
                return
            if content_len < 0 or content_len > MAX_REQUEST_BODY_BYTES:
                self._send_json(413, {'error': 'Request body is too large'})
                return
            if content_len:
                body = self.rfile.read(content_len)

        request = urllib.request.Request(final_url, data=body, method=method)
        for header in FORWARD_HEADERS:
            value = self.headers.get(header)
            if value:
                request.add_header(header, value)
        request.add_header('User-Agent', self.headers.get('User-Agent', 'SunaChat-LocalProxy/2.0'))

        try:
            with PROXY_OPENER.open(request, timeout=120) as response:
                self._stream_upstream(response, response.status)
        except urllib.error.HTTPError as exc:
            if 300 <= exc.code < 400:
                self._send_json(502, {'error': 'Upstream redirect blocked'})
            else:
                self._stream_upstream(exc, exc.code)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            self._send_json(502, {'error': 'Proxy request failed', 'detail': str(exc)})

    def _stream_upstream(self, response, status):
        self.send_response(status)
        for key, value in response.headers.items():
            if key.lower() not in RESPONSE_HEADERS_BLOCKLIST:
                self.send_header(key, value)
        self.end_headers()
        try:
            while True:
                chunk = response.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass


class SunaThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def run():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    httpd = None
    for _ in range(10):
        try:
            httpd = SunaThreadingServer(('127.0.0.1', port), SunaProxyHandler)
            break
        except OSError:
            print(f'[INFO] Port {port} is occupied, trying port {port + 1}...')
            port += 1

    if not httpd:
        print('[ERROR] Could not bind to any available port.')
        sys.exit(1)

    print('=======================================================')
    print('   SUNA CHAT 2.0 LOCAL ZERO-CORS SERVER IS RUNNING')
    print('=======================================================')
    print(f'  Local: http://localhost:{port}')
    print(f'  Built-in Proxy: http://localhost:{port}/api/proxy')
    print('  Security: loopback-only; public HTTPS upstreams only')
    print('  Press Ctrl + C to stop.')
    print('=======================================================')

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n[INFO] Server stopped.')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    run()
