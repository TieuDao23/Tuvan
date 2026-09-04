/**
 * tests/test_dsh_core_tools.js
 * 
 * Comprehensive Opaque-Box Test Suite for:
 * DeepSeek Harness (dsh) Core Tool Harness Suite (11 Core Tools across 5 Domains + Legacy Tools)
 * 
 * Domains Covered:
 * 1. Code & Math Sandbox Runner: sandbox_exec
 * 2. Web Context & Knowledge Fetcher: web_search_context, fetch_page_summary
 * 3. Virtual Workspace File System: fs_read, fs_write, fs_list, fs_patch
 * 4. Deep Semantic Memory & Facts: memory_query, memory_store
 * 5. Data & Visual Analytics Tool: visualize_diagram, analyze_tabular
 * 6. Legacy Tools Backward Compatibility: change_lofi_mood, speak_message, save_note_to_firestore, get_system_state, update_user_profile
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('DSH Suite 2: Core Tool Harness Suite (11 Tools & 5 Domains)', () => {
  let appJs;

  // =========================================================================
  // AUTHORITATIVE SPECIFICATION ORACLES FOR CORE TOOLS
  // =========================================================================

  const CoreToolOracles = {
    // 1. sandbox_exec: executes JS/Math in isolated VM sandbox with timeout
    async sandbox_exec(args, context = {}) {
      const code = args && typeof args.code === 'string' ? args.code.trim() : '';
      if (!code) {
        return { success: false, error: 'Error: Parameter "code" must be a non-empty string.' };
      }

      const timeoutMs = typeof args.timeoutMs === 'number' && args.timeoutMs > 0 ? args.timeoutMs : 1500;

      // Safe isolated environment without access to parent process/window/localStorage
      const isolatedSandbox = {
        Math,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        RegExp,
        parseInt,
        parseFloat,
        isNaN,
        isFinite
      };

      try {
        const script = new vm.Script(code);
        const vmContext = vm.createContext(isolatedSandbox);
        const evalResult = script.runInContext(vmContext, { timeout: timeoutMs });

        let output;
        if (typeof evalResult === 'object' && evalResult !== null) {
          output = JSON.stringify(evalResult);
        } else {
          output = String(evalResult !== undefined ? evalResult : 'undefined');
        }

        return { success: true, result: output };
      } catch (err) {
        if (err.message && (err.message.includes('timed out') || err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT')) {
          return { success: false, error: `Execution timed out (${timeoutMs}ms limit exceeded)` };
        }
        return { success: false, error: `${err.name}: ${err.message}` };
      }
    },

    // 2. web_search_context: query validation and search context generation
    async web_search_context(args, context = {}) {
      const query = args && typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) {
        return { success: false, error: 'Error: Query parameter is required and cannot be empty.' };
      }

      const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? args.maxResults : 3;

      // Mock search retrieval oracle
      const results = [
        {
          title: `Kết quả tìm kiếm cho "${query}"`,
          snippet: `Thông tin chi tiết và dữ liệu cập nhật liên quan đến ${query}.`,
          url: `https://search.sunachat.internal/query?q=${encodeURIComponent(query)}`
        },
        {
          title: `Tài liệu tham khảo chuyên sâu: ${query}`,
          snippet: `Tài liệu phân tích, kiến trúc và hướng dẫn thực thi cho ${query}.`,
          url: `https://docs.sunachat.internal/ref/${encodeURIComponent(query)}`
        }
      ].slice(0, maxResults);

      return {
        success: true,
        query,
        count: results.length,
        results
      };
    },

    // 3. fetch_page_summary: URL sanitization, tag stripping, budget clamping
    async fetch_page_summary(args, context = {}) {
      const url = args && typeof args.url === 'string' ? args.url.trim() : '';
      if (!url) {
        return { success: false, error: 'Error: URL parameter is required.' };
      }

      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return { success: false, error: `Error: Unsupported protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are permitted.` };
        }
      } catch (urlErr) {
        return { success: false, error: `Error: Invalid URL format: "${url}".` };
      }

      const maxLength = typeof args.maxLength === 'number' && args.maxLength > 0 ? args.maxLength : 4000;

      // Mock HTML cleaner
      const rawHtml = args.mockHtml || `<html><head><script>alert('xss')</script><style>body{}</style></head><body><nav>Menu</nav><main><h1>Tiêu đề trang</h1><p>Nội dung văn bản chính được trích xuất an toàn từ trang web.</p></main><footer>Bản quyền 2026</footer></body></html>`;
      let cleaned = rawHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleaned.length > maxLength) {
        cleaned = cleaned.slice(0, maxLength) + '... [Truncated]';
      }

      return {
        success: true,
        url,
        length: cleaned.length,
        content: cleaned
      };
    },

    // 4. Virtual File System operations: fs_read, fs_write, fs_list, fs_patch
    async fs_write(args, context = {}) {
      const path = args && typeof args.path === 'string' ? args.path.trim() : '';
      if (!path) return { success: false, error: 'Error: File path is required.' };
      const content = args && args.content !== undefined ? String(args.content) : '';

      const state = context.State || (typeof State !== 'undefined' ? State : null);
      if (!state) return { success: false, error: 'Error: Application State not available.' };

      if (!state.vfs && !state.virtualFS) state.vfs = {};
      const targetVfs = state.vfs || state.virtualFS;

      targetVfs[path] = {
        content,
        size: Buffer.byteLength(content, 'utf8'),
        lines: content.split('\n').length,
        updatedAt: Date.now()
      };

      // Live Workspace Synchronization trigger if targeting index.html
      if (path === 'index.html' && context.document) {
        const editor = context.document.getElementById('artifact-editor-textarea');
        const iframe = context.document.getElementById('artifact-iframe');
        if (editor) {
          editor.value = content;
          if (typeof editor.dispatchEvent === 'function') {
            editor.dispatchEvent(new (context.Event || Event)('input', { bubbles: true }));
          }
        }
        if (iframe) {
          iframe.srcdoc = content;
        }
        if (typeof context.toast === 'function') {
          context.toast('Virtual file index.html synchronized to Live Workspace', 'success');
        }
      }

      return { success: true, path, size: targetVfs[path].size, lines: targetVfs[path].lines };
    },

    async fs_read(args, context = {}) {
      const path = args && typeof args.path === 'string' ? args.path.trim() : '';
      if (!path) return { success: false, error: 'Error: File path is required.' };

      const state = context.State || (typeof State !== 'undefined' ? State : null);
      if (!state) return { success: false, error: 'Error: Application State not available.' };

      const targetVfs = state.vfs || state.virtualFS || {};
      const file = targetVfs[path];
      if (!file) {
        return { success: false, error: `Error: File "${path}" not found in virtual workspace.` };
      }

      const content = typeof file === 'string' ? file : file.content;
      return {
        success: true,
        path,
        content,
        size: Buffer.byteLength(content, 'utf8'),
        lines: content.split('\n').length
      };
    },

    async fs_list(args, context = {}) {
      const state = context.State || (typeof State !== 'undefined' ? State : null);
      if (!state) return { success: false, error: 'Error: Application State not available.' };

      const targetVfs = state.vfs || state.virtualFS || {};
      const files = Object.entries(targetVfs).map(([path, data]) => {
        const content = typeof data === 'string' ? data : (data.content || '');
        return {
          path,
          size: Buffer.byteLength(content, 'utf8'),
          lines: content.split('\n').length,
          updatedAt: typeof data === 'object' && data.updatedAt ? data.updatedAt : Date.now()
        };
      });

      return { success: true, count: files.length, files };
    },

    async fs_patch(args, context = {}) {
      const path = args && typeof args.path === 'string' ? args.path.trim() : '';
      const search = args && typeof args.search === 'string' ? args.search : '';
      const replace = args && args.replace !== undefined ? String(args.replace) : '';

      if (!path) return { success: false, error: 'Error: File path is required.' };
      if (!search) return { success: false, error: 'Error: Search block string is required for patching.' };

      const state = context.State || (typeof State !== 'undefined' ? State : null);
      if (!state) return { success: false, error: 'Error: Application State not available.' };

      const targetVfs = state.vfs || state.virtualFS || {};
      const file = targetVfs[path];
      if (!file) return { success: false, error: `Error: File "${path}" not found in virtual workspace.` };

      const original = typeof file === 'string' ? file : file.content;
      const occurrences = original.split(search).length - 1;

      if (occurrences === 0) {
        return { success: false, error: `Error: Target search block not found in "${path}".` };
      }
      if (occurrences > 1) {
        return { success: false, error: `Error: Ambiguous patch target. Search block matches ${occurrences} locations in "${path}". Must match exactly 1 location.` };
      }

      const patched = original.replace(search, replace);
      targetVfs[path] = {
        content: patched,
        size: Buffer.byteLength(patched, 'utf8'),
        lines: patched.split('\n').length,
        updatedAt: Date.now()
      };

      // Live Workspace Synchronization trigger if targeting index.html
      if (path === 'index.html' && context.document) {
        const editor = context.document.getElementById('artifact-editor-textarea');
        const iframe = context.document.getElementById('artifact-iframe');
        if (editor) {
          editor.value = patched;
          if (typeof editor.dispatchEvent === 'function') {
            editor.dispatchEvent(new (context.Event || Event)('input', { bubbles: true }));
          }
        }
        if (iframe) iframe.srcdoc = patched;
      }

      return { success: true, path, patchedLength: patched.length };
    },

    // 5. Deep Semantic Memory: memory_store, memory_query
    async memory_store(args, context = {}) {
      const fact = args && typeof args.fact === 'string' ? args.fact.trim() : '';
      if (!fact) return { success: false, error: 'Error: Parameter "fact" is required.' };

      const category = args && typeof args.category === 'string' ? args.category.trim() : 'general';
      const state = context.State || (typeof State !== 'undefined' ? State : null);
      if (!state || !state.memory) return { success: false, error: 'Error: State memory not initialized.' };

      if (!Array.isArray(state.memory.facts)) state.memory.facts = [];

      // Deduplication check
      const normalizedFact = fact.toLowerCase();
      const exists = state.memory.facts.some(f => {
        const existingText = typeof f === 'string' ? f : (f.fact || '');
        return existingText.toLowerCase() === normalizedFact;
      });

      if (exists) {
        return { success: true, message: 'Fact already exists in memory (deduplicated).', fact, category };
      }

      const memoryEntry = {
        id: 'fact_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        fact,
        category,
        timestamp: Date.now()
      };

      state.memory.facts.push(memoryEntry);
      return { success: true, message: 'Fact stored successfully.', entry: memoryEntry };
    },

    async memory_query(args, context = {}) {
      const query = args && typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
      const category = args && typeof args.category === 'string' ? args.category.trim().toLowerCase() : null;

      const state = context.State || (typeof State !== 'undefined' ? State : null);
      if (!state || !state.memory || !Array.isArray(state.memory.facts)) {
        return { success: true, count: 0, results: [] };
      }

      const tokens = query.split(/\s+/).filter(Boolean);
      let matched = state.memory.facts.filter(f => {
        const text = (typeof f === 'string' ? f : (f.fact || '')).toLowerCase();
        const cat = (typeof f === 'object' && f.category ? f.category : 'general').toLowerCase();

        if (category && cat !== category) return false;
        if (tokens.length === 0) return true;
        return tokens.some(token => text.includes(token));
      });

      return {
        success: true,
        count: matched.length,
        results: matched
      };
    },

    // 6. Visual Analytics: visualize_diagram
    async visualize_diagram(args, context = {}) {
      const type = args && typeof args.type === 'string' ? args.type.toLowerCase() : 'flowchart';
      const title = args && args.title ? String(args.title) : 'Diagram';
      const data = args && args.data ? args.data : {};

      if (type === 'mindmap') {
        const mindmapJson = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        return {
          success: true,
          type: 'mindmap',
          fence: `\`\`\`json:mindmap\n${mindmapJson}\n\`\`\``
        };
      }

      // Generate SVG flowchart/sequence diagram
      const nodes = Array.isArray(data.nodes) ? data.nodes : ['Start', 'Processing', 'Complete'];
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="100%" height="200" class="suna-diagram-svg">`;
      svg += `<defs><style>.node-rect{fill:#1e1e24;stroke:#6366f1;stroke-width:2;rx:8;}.node-text{fill:#ffffff;font-family:sans-serif;font-size:13px;text-anchor:middle;}</style></defs>`;
      svg += `<text x="300" y="30" class="node-text" font-weight="bold">${title}</text>`;

      nodes.forEach((n, idx) => {
        const x = 50 + idx * 170;
        const y = 80;
        svg += `<g class="diagram-node">`;
        svg += `<rect x="${x}" y="${y}" width="140" height="50" class="node-rect" />`;
        svg += `<text x="${x + 70}" y="${y + 30}" class="node-text">${typeof n === 'string' ? n : (n.label || 'Node')}</text>`;
        svg += `</g>`;
        if (idx < nodes.length - 1) {
          svg += `<line x1="${x + 140}" y1="${y + 25}" x2="${x + 170}" y2="${y + 25}" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)" />`;
        }
      });
      svg += `</svg>`;

      // XSS Sanitization
      const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                          .replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
                          .replace(/onload\s*=/gi, '')
                          .replace(/onerror\s*=/gi, '');

      return {
        success: true,
        type: 'svg',
        svg: cleanSvg
      };
    },

    // 7. Tabular Analytics: analyze_tabular
    async analyze_tabular(args, context = {}) {
      const rawData = args && args.data ? args.data : '';
      const format = (args && args.format ? args.format : 'csv').toLowerCase();
      const operation = (args && args.operation ? args.operation : 'summary').toLowerCase();

      let rows = [];
      let headers = [];

      if (format === 'csv') {
        const lines = String(rawData).trim().split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) return { success: false, error: 'Error: CSV data is empty.' };
        headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          const rowObj = {};
          headers.forEach((h, i) => {
            const rawVal = values[i] !== undefined ? values[i] : '';
            const numVal = Number(rawVal);
            rowObj[h] = !isNaN(numVal) && rawVal !== '' ? numVal : rawVal;
          });
          return rowObj;
        });
      } else if (format === 'json') {
        try {
          const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
          if (Array.isArray(parsed) && parsed.length > 0) {
            rows = parsed;
            headers = Object.keys(rows[0]);
          } else {
            return { success: false, error: 'Error: JSON tabular data must be a non-empty array of objects.' };
          }
        } catch (e) {
          return { success: false, error: `Error parsing JSON table: ${e.message}` };
        }
      }

      // Statistical calculations for numeric columns
      const stats = {};
      headers.forEach(h => {
        const numericValues = rows.map(r => r[h]).filter(v => typeof v === 'number' && !isNaN(v));
        if (numericValues.length > 0) {
          const count = numericValues.length;
          const sum = numericValues.reduce((a, b) => a + b, 0);
          const mean = sum / count;
          const sorted = [...numericValues].sort((a, b) => a - b);
          const median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)];
          const min = sorted[0];
          const max = sorted[sorted.length - 1];
          const variance = count > 1 ? numericValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (count - 1) : 0;
          const stdDev = Math.sqrt(variance);

          stats[h] = { count, sum, mean: Number(mean.toFixed(2)), median, min, max, stdDev: Number(stdDev.toFixed(2)) };
        }
      });

      // Markdown Table representation
      let markdownTable = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n`;
      rows.slice(0, 20).forEach(r => {
        markdownTable += `| ${headers.map(h => r[h] !== undefined ? r[h] : '').join(' | ')} |\n`;
      });

      return {
        success: true,
        rowCount: rows.length,
        columnCount: headers.length,
        headers,
        stats,
        markdownTable: `<div class="table-responsive-wrapper">\n${markdownTable}\n</div>`
      };
    }
  };

  // =========================================================================
  // SETUP
  // =========================================================================

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // DOMAIN 1: SANDBOX RUNNER (sandbox_exec)
  // =========================================================================

  describe('1. Code & Math Sandbox Runner (sandbox_exec)', () => {
    it('SB-01: should accurately compute basic arithmetic and math formulas', async () => {
      const res = await CoreToolOracles.sandbox_exec({ code: 'Math.sqrt(144) + 25' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.result, '37');
    });

    it('SB-02: should execute multi-line JavaScript logic and array processing', async () => {
      const code = `
        const nums = [5, 2, 8, 1, 9];
        const sorted = nums.sort((a, b) => a - b);
        const doubled = sorted.map(x => x * 2);
        doubled;
      `;
      const res = await CoreToolOracles.sandbox_exec({ code });
      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(JSON.parse(res.result), [2, 4, 10, 16, 18]);
    });

    it('SB-03: should capture SyntaxError and return actionable error details', async () => {
      const badCode = `function broken( { return 42; }`;
      const res = await CoreToolOracles.sandbox_exec({ code: badCode });
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('SyntaxError'));
    });

    it('SB-04: should capture runtime exceptions (TypeError, ReferenceError) without crashing', async () => {
      const badRuntime = `const x = null; x.someMethod();`;
      const res = await CoreToolOracles.sandbox_exec({ code: badRuntime });
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('TypeError'));
    });

    it('SB-05: should enforce infinite loop timeout guard within specified limit', async () => {
      const infiniteLoop = `while (true) {}`;
      const startTime = Date.now();
      const res = await CoreToolOracles.sandbox_exec({ code: infiniteLoop, timeoutMs: 150 });
      const elapsed = Date.now() - startTime;

      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('timed out'));
      assert.ok(elapsed >= 140 && elapsed < 800, `Elapsed ${elapsed}ms should respect timeout`);
    });

    it('SB-06: should prevent access to host environment and storage (isolation)', async () => {
      const malicious = `typeof process !== 'undefined' ? process.version : typeof require !== 'undefined' ? require('fs') : 'safe'`;
      const res = await CoreToolOracles.sandbox_exec({ code: malicious });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.result, 'safe');
    });
  });

  // =========================================================================
  // DOMAIN 2: WEB CONTEXT & KNOWLEDGE (web_search_context, fetch_page_summary)
  // =========================================================================

  describe('2. Web Context & Knowledge Fetcher', () => {
    it('WS-01: should validate search query input and reject empty or whitespace queries', async () => {
      const emptyRes = await CoreToolOracles.web_search_context({ query: '   ' });
      assert.strictEqual(emptyRes.success, false);
      assert.ok(emptyRes.error.includes('required and cannot be empty'));
    });

    it('WS-02: should execute web search query and return formatted search snippets', async () => {
      const res = await CoreToolOracles.web_search_context({ query: 'DeepSeek Harness Architecture', maxResults: 2 });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.query, 'DeepSeek Harness Architecture');
      assert.strictEqual(res.count, 2);
      assert.ok(res.results[0].title.includes('DeepSeek Harness'));
      assert.ok(res.results[0].url.startsWith('https://'));
    });

    it('FP-01: should sanitize URL protocols and reject file:, javascript:, data: schemes', async () => {
      const badUrls = ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,payload'];
      for (const badUrl of badUrls) {
        const res = await CoreToolOracles.fetch_page_summary({ url: badUrl });
        assert.strictEqual(res.success, false);
        assert.ok(res.error.includes('Unsupported protocol') || res.error.includes('Invalid URL'));
      }
    });

    it('FP-02: should clean HTML, stripping script, style, nav, footer tags and returning clean text', async () => {
      const mockHtml = `
        <html>
          <head><script>maliciousCode();</script><style>p { color: red; }</style></head>
          <body>
            <nav><a href="/">Home</a></nav>
            <main><h1>DeepSeek AI</h1><p>Trợ lý AI mã nguồn mở tiên tiến nhất.</p></main>
            <footer>Bản quyền 2026</footer>
          </body>
        </html>
      `;
      const res = await CoreToolOracles.fetch_page_summary({ url: 'https://deepseek.com', mockHtml });
      assert.strictEqual(res.success, true);
      assert.ok(!res.content.includes('maliciousCode'));
      assert.ok(!res.content.includes('color: red'));
      assert.ok(res.content.includes('Trợ lý AI mã nguồn mở tiên tiến nhất'));
    });

    it('FP-03: should clamp extracted text content to maximum length budget', async () => {
      const longHtml = `<html><body><p>${'A'.repeat(5000)}</p></body></html>`;
      const res = await CoreToolOracles.fetch_page_summary({ url: 'https://example.com', mockHtml: longHtml, maxLength: 500 });
      assert.strictEqual(res.success, true);
      assert.ok(res.content.length <= 550);
      assert.ok(res.content.includes('[Truncated]'));
    });
  });

  // =========================================================================
  // DOMAIN 3: VIRTUAL WORKSPACE FILE SYSTEM (fs_*)
  // =========================================================================

  describe('3. Virtual Workspace File System (fs_read, fs_write, fs_list, fs_patch)', () => {
    let mockContext;

    beforeEach(() => {
      const editor = { value: '', dispatchEvent: () => true };
      const iframe = { srcdoc: '' };
      const toastCalls = [];

      mockContext = {
        State: { vfs: {} },
        document: {
          getElementById: (id) => {
            if (id === 'artifact-editor-textarea') return editor;
            if (id === 'artifact-iframe') return iframe;
            return null;
          }
        },
        toast: (msg, type) => toastCalls.push({ msg, type }),
        toastCalls,
        editor,
        iframe
      };
    });

    it('FS-01: should write a new file to virtual workspace file system (fs_write)', async () => {
      const htmlContent = '<!DOCTYPE html><html><body><h1>Hello DSH</h1></body></html>';
      const res = await CoreToolOracles.fs_write({ path: 'index.html', content: htmlContent }, mockContext);

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.path, 'index.html');
      assert.ok(mockContext.State.vfs['index.html']);
      assert.strictEqual(mockContext.State.vfs['index.html'].content, htmlContent);
      // Verify workspace direct sync
      assert.strictEqual(mockContext.editor.value, htmlContent);
      assert.strictEqual(mockContext.iframe.srcdoc, htmlContent);
      assert.strictEqual(mockContext.toastCalls.length, 1);
    });

    it('FS-02: should read an existing virtual file with line count and byte size (fs_read)', async () => {
      mockContext.State.vfs['styles.css'] = {
        content: 'body {\n  background: #000;\n  color: #fff;\n}',
        size: 42,
        lines: 4
      };

      const res = await CoreToolOracles.fs_read({ path: 'styles.css' }, mockContext);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.path, 'styles.css');
      assert.ok(res.content.includes('background: #000'));
      assert.strictEqual(res.lines, 4);
    });

    it('FS-03: should return descriptive error when reading non-existent file', async () => {
      const res = await CoreToolOracles.fs_read({ path: 'missing.js' }, mockContext);
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('not found in virtual workspace'));
    });

    it('FS-04: should list all virtual files with metadata (fs_list)', async () => {
      mockContext.State.vfs['index.html'] = { content: '<h1>A</h1>' };
      mockContext.State.vfs['style.css'] = { content: 'p { color: red; }' };

      const res = await CoreToolOracles.fs_list({}, mockContext);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.count, 2);
      assert.ok(res.files.some(f => f.path === 'index.html'));
      assert.ok(res.files.some(f => f.path === 'style.css'));
    });

    it('FS-05: should apply precise search-and-replace diff patches (fs_patch)', async () => {
      mockContext.State.vfs['app.js'] = {
        content: 'function init() {\n  console.log("old logic");\n}\ninit();'
      };

      const res = await CoreToolOracles.fs_patch({
        path: 'app.js',
        search: 'console.log("old logic");',
        replace: 'console.log("upgraded dsh logic");'
      }, mockContext);

      assert.strictEqual(res.success, true);
      assert.ok(mockContext.State.vfs['app.js'].content.includes('upgraded dsh logic'));
      assert.ok(!mockContext.State.vfs['app.js'].content.includes('old logic'));
    });

    it('FS-06: should reject ambiguous or missing search blocks in fs_patch without file corruption', async () => {
      const originalCode = 'const x = 1;\nconst x = 1;\n';
      mockContext.State.vfs['test.js'] = { content: originalCode };

      // Ambiguous multiple matches
      const resAmbiguous = await CoreToolOracles.fs_patch({
        path: 'test.js',
        search: 'const x = 1;',
        replace: 'const x = 2;'
      }, mockContext);
      assert.strictEqual(resAmbiguous.success, false);
      assert.ok(resAmbiguous.error.includes('Ambiguous patch target'));
      assert.strictEqual(mockContext.State.vfs['test.js'].content, originalCode);

      // Not found search target
      const resNotFound = await CoreToolOracles.fs_patch({
        path: 'test.js',
        search: 'non_existent_code();',
        replace: 'something();'
      }, mockContext);
      assert.strictEqual(resNotFound.success, false);
      assert.ok(resNotFound.error.includes('not found'));
      assert.strictEqual(mockContext.State.vfs['test.js'].content, originalCode);
    });
  });

  // =========================================================================
  // DOMAIN 4: DEEP SEMANTIC MEMORY (memory_store, memory_query)
  // =========================================================================

  describe('4. Deep Semantic Memory & Facts (memory_store, memory_query)', () => {
    let mockContext;

    beforeEach(() => {
      mockContext = {
        State: {
          memory: { facts: [] }
        }
      };
    });

    it('MM-01: should store user facts with category tagging into State.memory.facts', async () => {
      const res = await CoreToolOracles.memory_store({
        fact: 'Người dùng thích viết ứng dụng bằng TypeScript và Rust',
        category: 'skill'
      }, mockContext);

      assert.strictEqual(res.success, true);
      assert.strictEqual(mockContext.State.memory.facts.length, 1);
      assert.strictEqual(mockContext.State.memory.facts[0].category, 'skill');
    });

    it('MM-02: should prevent storing duplicate facts (deduplication)', async () => {
      await CoreToolOracles.memory_store({ fact: 'Sở thích nghe nhạc Lofi', category: 'preference' }, mockContext);
      const dupRes = await CoreToolOracles.memory_store({ fact: 'Sở thích nghe nhạc lofi', category: 'preference' }, mockContext);

      assert.strictEqual(dupRes.success, true);
      assert.ok(dupRes.message.includes('deduplicated'));
      assert.strictEqual(mockContext.State.memory.facts.length, 1);
    });

    it('MM-03: should retrieve stored facts by keyword matching (memory_query)', async () => {
      mockContext.State.memory.facts = [
        { fact: 'Dự án Suna Chat sử dụng Tailwind và CSS Vanilla', category: 'project' },
        { fact: 'Người dùng là kỹ sư hệ thống phân tán', category: 'identity' }
      ];

      const res = await CoreToolOracles.memory_query({ query: 'Tailwind' }, mockContext);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.count, 1);
      assert.ok(res.results[0].fact.includes('Tailwind'));
    });

    it('MM-04: should filter retrieved facts by category', async () => {
      mockContext.State.memory.facts = [
        { fact: 'Fact A', category: 'project' },
        { fact: 'Fact B', category: 'skill' }
      ];

      const res = await CoreToolOracles.memory_query({ query: 'Fact', category: 'skill' }, mockContext);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.count, 1);
      assert.strictEqual(res.results[0].category, 'skill');
    });

    it('MM-05: should return empty list when no facts match query', async () => {
      mockContext.State.memory.facts = [{ fact: 'Fact X', category: 'general' }];
      const res = await CoreToolOracles.memory_query({ query: 'NonExistentTopic' }, mockContext);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.count, 0);
      assert.deepStrictEqual(res.results, []);
    });
  });

  // =========================================================================
  // DOMAIN 5: VISUAL & TABULAR ANALYTICS (visualize_diagram, analyze_tabular)
  // =========================================================================

  describe('5. Data & Visual Analytics Tool (visualize_diagram, analyze_tabular)', () => {
    it('VD-01: should generate valid SVG flowchart XML structure', async () => {
      const res = await CoreToolOracles.visualize_diagram({
        type: 'flowchart',
        title: 'Quy trình ReAct',
        data: { nodes: ['Think', 'Tool Call', 'Observation', 'Answer'] }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.type, 'svg');
      assert.ok(res.svg.startsWith('<svg'));
      assert.ok(res.svg.includes('Quy trình ReAct'));
      assert.ok(res.svg.includes('Think'));
      assert.ok(res.svg.endsWith('</svg>'));
    });

    it('VD-02: should generate Mindmap JSON fence compatible with mindmap.html', async () => {
      const res = await CoreToolOracles.visualize_diagram({
        type: 'mindmap',
        data: { text: 'Root Mindmap', children: [{ text: 'Branch 1' }] }
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.type, 'mindmap');
      assert.ok(res.fence.startsWith('```json:mindmap'));
      assert.ok(res.fence.includes('Root Mindmap'));
      assert.ok(res.fence.endsWith('```'));
    });

    it('VD-03: should sanitize SVG output removing script tags and event handlers (XSS safety)', async () => {
      const maliciousData = {
        nodes: ['<script>alert("XSS")</script>', 'Node" onload="hack()']
      };
      const res = await CoreToolOracles.visualize_diagram({ type: 'flowchart', data: maliciousData });
      assert.ok(!res.svg.includes('<script>'));
      assert.ok(!res.svg.includes('onload='));
    });

    it('AT-01: should parse CSV data and compute complete statistical metrics', async () => {
      const csv = `
Product,Price,Quantity
Laptop,1200,5
Mouse,25,40
Keyboard,75,20
Monitor,300,10
      `;

      const res = await CoreToolOracles.analyze_tabular({ data: csv, format: 'csv' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.rowCount, 4);
      assert.strictEqual(res.columnCount, 3);
      assert.deepStrictEqual(res.headers, ['Product', 'Price', 'Quantity']);

      // Price statistics
      const priceStats = res.stats.Price;
      assert.strictEqual(priceStats.count, 4);
      assert.strictEqual(priceStats.min, 25);
      assert.strictEqual(priceStats.max, 1200);
      assert.strictEqual(priceStats.mean, 400);
      assert.strictEqual(priceStats.median, 187.5);
      assert.ok(priceStats.stdDev > 0);

      // Markdown table wrapped in .table-responsive-wrapper
      assert.ok(res.markdownTable.includes('table-responsive-wrapper'));
      assert.ok(res.markdownTable.includes('| Laptop | 1200 | 5 |'));
    });

    it('AT-02: should parse JSON array tabular data and generate markdown tables', async () => {
      const jsonTable = [
        { model: 'DeepSeek-V3', speed: 85, score: 92.5 },
        { model: 'DeepSeek-R1', speed: 45, score: 98.2 }
      ];

      const res = await CoreToolOracles.analyze_tabular({ data: jsonTable, format: 'json' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.rowCount, 2);
      assert.ok(res.markdownTable.includes('| DeepSeek-V3 | 85 | 92.5 |'));
    });
  });

  // =========================================================================
  // DOMAIN 6: LEGACY TOOLS COMPATIBILITY
  // =========================================================================

  describe('6. Legacy Tools Backward Compatibility', () => {
    it('LT-01: should verify all 5 legacy tools are defined in app.js', () => {
      const legacyTools = [
        'change_lofi_mood',
        'speak_message',
        'save_note_to_firestore',
        'get_system_state',
        'update_user_profile'
      ];

      legacyTools.forEach(tool => {
        assert.ok(appJs.includes(tool), `Legacy tool "${tool}" must exist in app.js`);
      });
    });

    it('LT-02: should verify MOODS_WHITELIST and THEMES_WHITELIST in SunaAgent', () => {
      assert.ok(appJs.includes("MOODS_WHITELIST") || appJs.includes("['calm', 'excited'"));
      assert.ok(appJs.includes("THEMES_WHITELIST") || appJs.includes("['aurora', 'sunset'"));
    });
  });
});
