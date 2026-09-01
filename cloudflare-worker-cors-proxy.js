/**
 * Cloudflare Worker - Suna Chat CORS Reverse Proxy (HARDENED)
 * Resolves CORS Preflight (OPTIONS 403) and streams SSE chat completions.
 * Free & 1-click deployable to Cloudflare Workers (https://workers.cloudflare.com)
 *
 * ============================ SECURITY NOTES ============================
 * Bản gốc của worker này là một OPEN PROXY: nó nhận ?target=<bất kỳ URL nào>
 * rồi forward NGUYÊN VẸN header Authorization của client sang đó. Hệ quả:
 *
 *   1) Credential exfiltration — bất kỳ ai biết URL worker của bạn đều có thể
 *      gọi https://<worker>/v1/chat/completions?target=https://attacker.tld
 *      và worker sẽ gửi API key của người dùng tới máy chủ của kẻ tấn công.
 *   2) SSRF — target có thể trỏ vào 127.0.0.1, 169.254.169.254 (metadata),
 *      10.x/172.16.x/192.168.x, hoặc scheme file:/gopher:.
 *   3) Open relay — worker của bạn trở thành proxy miễn phí cho người khác,
 *      đốt quota Cloudflare và gắn IP/danh tiếng của bạn vào traffic lạ.
 *   4) Access-Control-Allow-Origin: '*' cộng với việc forward mọi header
 *      khiến bất kỳ website nào cũng script được worker này.
 *
 * Bản hardened dưới đây khắc phục bằng 4 lớp:
 *   - ALLOWED_TARGETS  : whitelist host đích (bắt buộc)
 *   - ALLOWED_ORIGINS  : whitelist Origin được phép gọi worker
 *   - Header allowlist : chỉ forward đúng những header cần thiết
 *   - Scheme guard     : chỉ cho phép https:
 *
 * CÁCH DÙNG: sửa 2 mảng cấu hình bên dưới cho đúng domain của bạn.
 * Nếu để ALLOWED_ORIGINS = [] thì worker chấp nhận mọi origin (tiện khi test
 * local, nhưng NÊN điền domain thật khi deploy public).
 * ========================================================================
 */

// --- CẤU HÌNH: sửa cho đúng môi trường của bạn -------------------------------

// Chỉ những host này được đặt làm ?target=. Bắt buộc, không được để rỗng.
const ALLOWED_TARGETS = [
  'api.justwoker.icu',
  'catiecli.sukaka.top',
];

// Chỉ những Origin này được gọi worker. Để [] = cho phép tất cả (không khuyến nghị khi public).
const ALLOWED_ORIGINS = [
  // 'https://your-suna-domain.pages.dev',
  // 'http://127.0.0.1:8791',
];

// Chỉ forward những header thật sự cần cho OpenAI-compatible API.
const FORWARD_HEADER_ALLOWLIST = [
  'authorization',
  'content-type',
  'accept',
  'x-api-key',
  'anthropic-version',
  'openai-organization',
];

const DEFAULT_TARGET = 'https://' + ALLOWED_TARGETS[0] + '/v1';

// ---------------------------------------------------------------------------

function pickAllowOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.length === 0) return '*';
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}

function buildCorsHeaders(requestOrigin) {
  const allowOrigin = pickAllowOrigin(requestOrigin);
  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': FORWARD_HEADER_ALLOWLIST.join(', '),
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  // Khi echo lại một origin cụ thể thì mới có ý nghĩa cho credentials.
  if (allowOrigin !== '*') headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}

function jsonError(message, status, corsHeaders) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export default {
  async fetch(request) {
    const requestOrigin = request.headers.get('Origin');
    const corsHeaders = buildCorsHeaders(requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Chỉ cho phép GET/POST — chặn PUT/DELETE/PATCH đi xuyên proxy.
    if (request.method !== 'GET' && request.method !== 'POST') {
      return jsonError('Method not allowed', 405, corsHeaders);
    }

    // Chặn origin lạ (chỉ khi đã cấu hình whitelist).
    if (ALLOWED_ORIGINS.length > 0 && requestOrigin && !ALLOWED_ORIGINS.includes(requestOrigin)) {
      return jsonError('Origin not allowed', 403, corsHeaders);
    }

    const url = new URL(request.url);
    let targetBase = (url.searchParams.get('target') || DEFAULT_TARGET).replace(/\/+$/, '');

    // Bắt buộc phải là URL tuyệt đối, hợp lệ.
    let targetBaseUrl;
    try {
      targetBaseUrl = new URL(targetBase);
    } catch {
      return jsonError('Invalid target URL', 400, corsHeaders);
    }

    // Chỉ https — chặn http:, file:, gopher:, data:, ...
    if (targetBaseUrl.protocol !== 'https:') {
      return jsonError('Only https targets are allowed', 400, corsHeaders);
    }

    // WHITELIST host — đây là lớp chặn credential-exfiltration và SSRF.
    if (!ALLOWED_TARGETS.includes(targetBaseUrl.hostname)) {
      return jsonError('Target host not in allowlist', 403, corsHeaders);
    }

    // Ghép subpath, tránh nhân đôi /v1.
    const subPath = url.pathname.replace(/^\/+/, '');
    const base = targetBaseUrl.origin + targetBaseUrl.pathname.replace(/\/+$/, '');
    const finalUrlStr = (subPath.startsWith('v1/') && base.endsWith('/v1'))
      ? base.slice(0, -3) + '/' + subPath
      : base + '/' + subPath;

    let targetUrl;
    try {
      targetUrl = new URL(finalUrlStr);
    } catch {
      return jsonError('Invalid resolved URL', 400, corsHeaders);
    }

    // Kiểm tra lại sau khi ghép, phòng path traversal đổi host.
    if (!ALLOWED_TARGETS.includes(targetUrl.hostname) || targetUrl.protocol !== 'https:') {
      return jsonError('Resolved target rejected', 403, corsHeaders);
    }

    // Copy query params trừ 'target'.
    url.searchParams.forEach((value, key) => {
      if (key !== 'target') targetUrl.searchParams.set(key, value);
    });

    // CHỈ forward header trong allowlist — không bê nguyên header client sang.
    const proxyHeaders = new Headers();
    for (const name of FORWARD_HEADER_ALLOWLIST) {
      const v = request.headers.get(name);
      if (v) proxyHeaders.set(name, v);
    }

    try {
      const upstream = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: proxyHeaders,
        body: request.method === 'POST' ? request.body : undefined,
        redirect: 'manual', // KHÔNG follow redirect: chặn redirect ra host ngoài allowlist
      });

      // Nếu upstream redirect, không đi theo — trả lỗi rõ ràng.
      if (upstream.status >= 300 && upstream.status < 400) {
        return jsonError('Upstream redirect blocked', 502, corsHeaders);
      }

      const responseHeaders = new Headers(upstream.headers);
      // Không rò rỉ header set-cookie của upstream về client.
      responseHeaders.delete('set-cookie');
      Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return jsonError(err && err.message ? err.message : 'Upstream fetch failed', 502, corsHeaders);
    }
  },
};
