const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP_SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function extractMethod(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Missing method: ${signature}`);
  const bodyStart = source.indexOf('{', start + signature.length);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated method: ${signature}`);
}

function loadWebSearchMethod(performWebSearch) {
  const methodSource = extractMethod(APP_SOURCE, 'async web_search_context(args, context = {})');
  const sandbox = { window: { performWebSearch }, URL, encodeURIComponent };
  return vm.runInNewContext(`({ ${methodSource} })`, sandbox).web_search_context;
}

function runPython(script) {
  const result = spawnSync('python', ['-c', script], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10000
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

describe('Web Search truthfulness and local proxy security regressions', () => {
  it('normalizes the live string result into structured tool results', async () => {
    const search = loadWebSearchMethod(async () =>
      'Tiêu đề: Example A\nURL: https://example.com/a\nTrích dẫn: Alpha\n\n' +
      'Tiêu đề: Example B\nURL: https://example.com/b\nTrích dẫn: Beta'
    );

    const result = await search({ query: 'example', maxResults: 1 });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(result.results)), [
      { title: 'Example A', url: 'https://example.com/a', snippet: 'Alpha' }
    ]);
  });

  it('reports live search failure instead of fabricating internal URLs', async () => {
    const search = loadWebSearchMethod(async () => null);
    const result = await search({ query: 'unavailable search' });

    assert.strictEqual(result.success, false);
    assert.match(result.error, /search|result|available/i);
    assert.ok(!JSON.stringify(result).includes('sunachat.internal'));
  });

  it('accepts only public HTTPS targets and blocks private or self targets', () => {
    const output = runPython(String.raw`
import json
from unittest.mock import patch
import server

cases = {}
with patch('server.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))]):
    cases['public'] = server.resolve_proxy_target(
        '/api/proxy/chat/completions?target=https%3A%2F%2Fapi.example.test%2Fv1',
        ('127.0.0.1', 8080),
    )

for name, target in {
    'loopback': 'http://127.0.0.1:8080/v1',
    'localhost': 'https://localhost/v1',
    'metadata': 'http://169.254.169.254/latest',
    'private': 'https://10.0.0.2/v1',
    'plain_http': 'http://api.example.test/v1',
}.items():
    request_path = '/api/proxy/chat/completions?target=' + __import__('urllib.parse').parse.quote(target, safe='')
    try:
        server.resolve_proxy_target(request_path, ('127.0.0.1', 8080))
        cases[name] = 'allowed'
    except ValueError:
        cases[name] = 'blocked'

print(json.dumps(cases))
`);

    assert.strictEqual(output.public, 'https://api.example.test/v1/chat/completions');
    for (const name of ['loopback', 'localhost', 'metadata', 'private', 'plain_http']) {
      assert.strictEqual(output[name], 'blocked', `${name} must be blocked`);
    }
  });

  it('uses a threaded loopback server and disables automatic upstream redirects', () => {
    const source = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
    assert.match(source, /ThreadingTCPServer/);
    assert.match(source, /HTTPRedirectHandler/);
    assert.match(source, /redirect[^\n]*(blocked|disabled)|blocked[^\n]*redirect/i);
    assert.match(source, /\(['"]127\.0\.0\.1['"],\s*port\)/);
  });
});
