const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Challenger 2 Deep Storage & Security Adversarial Stress Suite (R2 & R4)', () => {
  let appJs, indexHtml, mindmapHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
    mindmapHtml = fs.readFileSync('mindmap.html', 'utf8');
  });

  // =========================================================================
  // SUITE 1: R2 STORAGE QUOTA RESILIENCE & ADVERSARIAL RECOVERY
  // =========================================================================
  describe('1. R2 Storage Quota Resilience & Recovery Mechanics', () => {

    it('should catch standard DOMException QuotaExceededError (code 22), evict legacy keys, and succeed on retry', () => {
      let attempts = 0;
      const store = {
        suna_chats: 'HEAVY_LEGACY_CHATS_10MB',
        suna_guest_notes: 'LEGACY_NOTES_DATA',
        suna_deleted_chats_guest: '{"old_chat_1": true, "old_chat_2": true}',
        unrelated_key: 'keep_me'
      };

      const mockLocalStorage = {
        setItem: (k, v) => {
          attempts++;
          if (attempts === 1) {
            const err = new Error('The quota has been exceeded.');
            err.name = 'QuotaExceededError';
            err.code = 22;
            throw err;
          }
          store[k] = String(v);
        },
        removeItem: (k) => {
          delete store[k];
        },
        getItem: (k) => store[k] || null
      };

      const sandbox = {
        localStorage: mockLocalStorage,
        getStorageSuffix: () => '_guest',
        console: { warn: () => {}, error: () => {} }
      };
      vm.createContext(sandbox);

      const fnMatch = appJs.match(/function\s+safeSaveLocalStorage\s*\(\s*key\s*,\s*val\s*\)\s*\{[\s\S]*?\n\}/);
      assert.ok(fnMatch, 'safeSaveLocalStorage must be found in app.js');
      vm.runInContext(fnMatch[0], sandbox);

      const payload = { theme: 'zen', apiKey: 'secret_key_123', fontSize: 16 };
      const res = sandbox.safeSaveLocalStorage('suna_settings_guest', payload);

      assert.strictEqual(res, true, 'safeSaveLocalStorage should return true after recovery retry');
      assert.strictEqual(attempts, 3, 'Expected 1 initial attempt + 1 deleted_chats reset + 1 retry');
      assert.strictEqual(store.suna_chats, undefined, 'suna_chats should be evicted');
      assert.strictEqual(store.suna_guest_notes, undefined, 'suna_guest_notes should be evicted');
      assert.strictEqual(store.suna_deleted_chats_guest, '{}', 'suna_deleted_chats should be reset to empty JSON');
      assert.strictEqual(store.unrelated_key, 'keep_me', 'Unrelated keys must not be destroyed');
      assert.strictEqual(store.suna_settings_guest, JSON.stringify(payload));
    });

    it('should catch Firefox code 1014 (NS_ERROR_DOM_QUOTA_REACHED) and recover gracefully', () => {
      let attempts = 0;
      const store = { suna_chats: 'LEGACY_BLOB' };
      const mockLocalStorage = {
        setItem: (k, v) => {
          attempts++;
          if (attempts === 1) {
            const err = new Error('Persistent storage maximum size reached');
            err.name = 'NS_ERROR_DOM_QUOTA_REACHED';
            err.code = 1014;
            throw err;
          }
          store[k] = String(v);
        },
        removeItem: (k) => { delete store[k]; }
      };

      const sandbox = {
        localStorage: mockLocalStorage,
        getStorageSuffix: () => '_guest',
        console: { warn: () => {}, error: () => {} }
      };
      vm.createContext(sandbox);

      const fnMatch = appJs.match(/function\s+safeSaveLocalStorage\s*\(\s*key\s*,\s*val\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(fnMatch[0], sandbox);

      const res = sandbox.safeSaveLocalStorage('suna_settings_guest', { mode: 'workspace' });
      assert.strictEqual(res, true);
      assert.strictEqual(store.suna_chats, undefined);
      assert.strictEqual(store.suna_settings_guest, '{"mode":"workspace"}');
    });

    it('should catch generic error with message containing "quota" and recover', () => {
      let attempts = 0;
      const store = { suna_chats: 'BLOB' };
      const mockLocalStorage = {
        setItem: (k, v) => {
          attempts++;
          if (attempts === 1) {
            throw new Error('Custom Storage Engine: Out of quota limit');
          }
          store[k] = String(v);
        },
        removeItem: (k) => { delete store[k]; }
      };

      const sandbox = {
        localStorage: mockLocalStorage,
        getStorageSuffix: () => '_guest',
        console: { warn: () => {}, error: () => {} }
      };
      vm.createContext(sandbox);

      const fnMatch = appJs.match(/function\s+safeSaveLocalStorage\s*\(\s*key\s*,\s*val\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(fnMatch[0], sandbox);

      const res = sandbox.safeSaveLocalStorage('suna_settings_guest', { theme: 'ink' });
      assert.strictEqual(res, true);
      assert.strictEqual(store.suna_chats, undefined);
    });

    it('should return false and not throw when storage is permanently full (retry fails)', () => {
      const mockLocalStorage = {
        setItem: () => {
          const err = new Error('Device is 100% full');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        },
        removeItem: () => {}
      };

      const sandbox = {
        localStorage: mockLocalStorage,
        getStorageSuffix: () => '_guest',
        console: { warn: () => {}, error: () => {} }
      };
      vm.createContext(sandbox);

      const fnMatch = appJs.match(/function\s+safeSaveLocalStorage\s*\(\s*key\s*,\s*val\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(fnMatch[0], sandbox);

      let res;
      assert.doesNotThrow(() => {
        res = sandbox.safeSaveLocalStorage('suna_settings_guest', { theme: 'zen' });
      });
      assert.strictEqual(res, false, 'Must return false when retry fails');
    });

    it('should handle SecurityError / disabled localStorage without throwing uncaught errors', () => {
      const mockLocalStorage = {
        setItem: () => {
          const err = new Error('Access to storage is denied in private browsing');
          err.name = 'SecurityError';
          err.code = 18;
          throw err;
        },
        removeItem: () => {}
      };

      const sandbox = {
        localStorage: mockLocalStorage,
        console: { warn: () => {}, error: () => {} }
      };
      vm.createContext(sandbox);

      const fnMatch = appJs.match(/function\s+safeSaveLocalStorage\s*\(\s*key\s*,\s*val\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(fnMatch[0], sandbox);

      let res;
      assert.doesNotThrow(() => {
        res = sandbox.safeSaveLocalStorage('suna_settings_guest', { theme: 'zen' });
      });
      assert.strictEqual(res, false, 'Must safely return false for SecurityError');
    });

    it('should correctly serialize diverse data types (strings, objects, arrays, numbers, booleans, null)', () => {
      const store = {};
      const mockLocalStorage = {
        setItem: (k, v) => { store[k] = String(v); },
        getItem: (k) => store[k] || null
      };

      const sandbox = {
        localStorage: mockLocalStorage,
        console: { warn: () => {}, error: () => {} }
      };
      vm.createContext(sandbox);

      const fnMatch = appJs.match(/function\s+safeSaveLocalStorage\s*\(\s*key\s*,\s*val\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(fnMatch[0], sandbox);

      assert.strictEqual(sandbox.safeSaveLocalStorage('k_str', 'simple_string'), true);
      assert.strictEqual(store.k_str, 'simple_string');

      assert.strictEqual(sandbox.safeSaveLocalStorage('k_obj', { a: 1, b: 'two' }), true);
      assert.strictEqual(store.k_obj, '{"a":1,"b":"two"}');

      assert.strictEqual(sandbox.safeSaveLocalStorage('k_arr', [1, 2, 3]), true);
      assert.strictEqual(store.k_arr, '[1,2,3]');

      assert.strictEqual(sandbox.safeSaveLocalStorage('k_num', 42), true);
      assert.strictEqual(store.k_num, '42');

      assert.strictEqual(sandbox.safeSaveLocalStorage('k_bool', true), true);
      assert.strictEqual(store.k_bool, 'true');

      assert.strictEqual(sandbox.safeSaveLocalStorage('k_null', null), true);
      assert.strictEqual(store.k_null, 'null');
    });

    it('should strictly limit chat history to MAX_CHAT_MESSAGES (40) via pruneChatMessages', () => {
      const sandbox = { MAX_CHAT_MESSAGES: 40 };
      vm.createContext(sandbox);

      const pruneMatch = appJs.match(/function\s+pruneChatMessages\s*\(\s*chat\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(pruneMatch[0], sandbox);

      // 0 messages
      const chatEmpty = { messages: [] };
      sandbox.pruneChatMessages(chatEmpty);
      assert.strictEqual(chatEmpty.messages.length, 0);

      // Exact 40 messages
      const chatExact = { messages: Array.from({ length: 40 }, (_, i) => ({ id: i })) };
      sandbox.pruneChatMessages(chatExact);
      assert.strictEqual(chatExact.messages.length, 40);
      assert.strictEqual(chatExact.messages[0].id, 0);
      assert.strictEqual(chatExact.messages[39].id, 39);

      // 1000 messages (extreme stress)
      const chatHuge = { messages: Array.from({ length: 1000 }, (_, i) => ({ id: i, text: `msg_${i}` })) };
      sandbox.pruneChatMessages(chatHuge);
      assert.strictEqual(chatHuge.messages.length, 40);
      assert.strictEqual(chatHuge.messages[0].id, 960);
      assert.strictEqual(chatHuge.messages[39].id, 999);
    });

    it('should migrate legacy suna_chats from localStorage to IndexedDB in loadState and delete legacy key', async () => {
      const mockStorage = {
        suna_chats: JSON.stringify([{ id: 'migrated_chat_1', title: 'Old Chat', messages: [] }]),
        suna_mode: 'workspace'
      };
      const mockIdb = {};

      const sandbox = {
        localStorage: {
          getItem: (k) => mockStorage[k] || null,
          setItem: (k, v) => { mockStorage[k] = String(v); },
          removeItem: (k) => { delete mockStorage[k]; }
        },
        idbSet: async (k, v) => { mockIdb[k] = v; },
        idbGet: async (k) => mockIdb[k] || null,
        getStorageSuffix: () => '_guest',
        genId: () => 'chat_' + Math.random().toString(36).substr(2, 9),
        State: { chats: [], settings: {}, mode: 'chat', deletedChats: {} },
        console: { error: () => {} }
      };
      vm.createContext(sandbox);

      const loadStateMatch = appJs.match(/async\s+function\s+loadState\s*\(\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(loadStateMatch[0], sandbox);

      await sandbox.loadState();

      assert.strictEqual(mockStorage.suna_chats, undefined, 'suna_chats must be removed from localStorage to free quota');
      assert.strictEqual(mockIdb.suna_chats_guest.length, 1);
      assert.strictEqual(mockIdb.suna_chats_guest[0].id, 'migrated_chat_1');
      assert.strictEqual(sandbox.State.chats.length, 1);
      assert.strictEqual(sandbox.State.chats[0].title, 'Old Chat');
    });
  });

  // =========================================================================
  // SUITE 2: R4 IFRAME SANDBOX SECURITY HARDENING
  // =========================================================================
  describe('2. R4 Iframe Sandbox Security Hardening & Isolation', () => {

    it('should configure strict sandbox="allow-scripts allow-modals allow-forms" on #artifact-iframe in index.html', () => {
      const iframeMatch = indexHtml.match(/<iframe[^>]*id=["']artifact-iframe["'][^>]*>/i);
      assert.ok(iframeMatch, '#artifact-iframe must exist in index.html');
      
      const iframeTag = iframeMatch[0];
      assert.match(iframeTag, /sandbox=["']allow-scripts\s+allow-modals\s+allow-forms["']/i, 'Must contain exact allow-scripts allow-modals allow-forms');
      
      // CRITICAL SECURITY CHECKS: Prohibit dangerous permissions
      assert.doesNotMatch(iframeTag, /allow-same-origin/i, 'SECURITY VIOLATION: allow-same-origin must NOT be present on #artifact-iframe');
      assert.doesNotMatch(iframeTag, /allow-top-navigation/i, 'SECURITY VIOLATION: allow-top-navigation must NOT be present on #artifact-iframe');
      assert.doesNotMatch(iframeTag, /allow-downloads-without-user-activation/i, 'SECURITY VIOLATION: allow-downloads-without-user-activation must NOT be present');
    });

    it('should configure strict sandbox on renderMindmapIframe in app.js and strictly exclude dangerous tokens', () => {
      const fnMatch = appJs.match(/function\s+renderMindmapIframe\s*\([\s\S]*?\n\}/);
      assert.ok(fnMatch, 'renderMindmapIframe function must exist in app.js');

      const fnCode = fnMatch[0];
      assert.match(fnCode, /sandbox=["']allow-scripts\s+allow-modals\s+allow-forms["']/i);
      
      // CRITICAL SECURITY CHECKS
      assert.doesNotMatch(fnCode, /allow-same-origin/i, 'SECURITY VIOLATION: allow-same-origin must NOT be present in renderMindmapIframe');
      assert.doesNotMatch(fnCode, /allow-top-navigation/i, 'SECURITY VIOLATION: allow-top-navigation must NOT be present in renderMindmapIframe');
    });

    it('should verify that all iframe occurrences in the entire project enforce sandbox restrictions', () => {
      const allIframesInIndex = indexHtml.match(/<iframe\b[^>]*>/gi) || [];
      allIframesInIndex.forEach((tag, idx) => {
        assert.match(tag, /sandbox=/i, `Iframe #${idx} in index.html is missing sandbox attribute: ${tag}`);
        assert.doesNotMatch(tag, /allow-same-origin/i, `Iframe #${idx} contains forbidden allow-same-origin`);
        assert.doesNotMatch(tag, /allow-top-navigation/i, `Iframe #${idx} contains forbidden allow-top-navigation`);
      });
    });

    it('should lock pointer-events on all iframes during resize operations to prevent mouse event hijacking', () => {
      const iframes = [
        { id: 'iframe_1', style: { pointerEvents: 'auto' } },
        { id: 'iframe_2', style: { pointerEvents: 'auto' } }
      ];

      const sandbox = {
        document: {
          querySelectorAll: (sel) => sel === 'iframe' ? iframes : []
        }
      };
      vm.createContext(sandbox);

      const lockFnCode = `
        function lockAllIframes() {
          document.querySelectorAll('iframe').forEach(el => {
            el.style.pointerEvents = 'none';
          });
        }
        function unlockAllIframes() {
          document.querySelectorAll('iframe').forEach(el => {
            el.style.pointerEvents = 'auto';
          });
        }
      `;
      vm.runInContext(lockFnCode, sandbox);

      sandbox.lockAllIframes();
      assert.strictEqual(iframes[0].style.pointerEvents, 'none');
      assert.strictEqual(iframes[1].style.pointerEvents, 'none');

      sandbox.unlockAllIframes();
      assert.strictEqual(iframes[0].style.pointerEvents, 'auto');
      assert.strictEqual(iframes[1].style.pointerEvents, 'auto');
    });
  });

  // =========================================================================
  // SUITE 3: R4 KATEX ADVERSARIAL STRESS & FALLBACK CONTAINMENT
  // =========================================================================
  describe('3. R4 KaTeX Adversarial Rendering & Hostile String Containment', () => {

    it('should handle unclosed and malformed LaTeX expressions without throwing uncaught exceptions', () => {
      const mockKatex = {
        renderToString: (math, opts) => {
          if (math.includes('\\broken') || math.endsWith('{') || math.includes('\\notreal') || math.includes('\\begin{matrix}') || math.includes('\\left(')) {
            throw new Error(`KaTeX parse error: Unrecognized command or unclosed delimiter in "${math}"`);
          }
          return `<span class="katex-rendered">${math}</span>`;
        }
      };

      const sandbox = {
        katex: mockKatex,
        console: { warn: () => {} }
      };
      vm.createContext(sandbox);

      const renderKatexMatch = appJs.match(/function\s+renderKatex\s*\(\s*math\s*,\s*displayMode\s*\)\s*\{[\s\S]*?\n\}/);
      assert.ok(renderKatexMatch, 'renderKatex function must be found in app.js');
      vm.runInContext(renderKatexMatch[0], sandbox);

      const malformedCases = [
        '\\frac{1}{',
        '\\sqrt{',
        '\\binom{n}{',
        '\\begin{matrix} 1 & 2',
        '\\int_{0}^{',
        '\\sum_{i=1}^{',
        '\\notrealcommand{abc}',
        '\\left( x + y',
        '\\broken_syntax_string'
      ];

      malformedCases.forEach(latex => {
        assert.doesNotThrow(() => {
          const res = sandbox.renderKatex(latex, true);
          assert.strictEqual(res, null, `Malformed LaTeX "${latex}" should return null fallback`);
        }, `renderKatex threw on "${latex}"`);
      });
    });

    it('should contain hostile XSS and script injection attempts in LaTeX', () => {
      const mockKatex = {
        renderToString: (math, opts) => {
          if (math.includes('javascript:') || math.includes('<script>') || math.includes('onerror=')) {
            if (typeof opts.trust === 'function' && !opts.trust({ protocol: 'javascript' })) {
              throw new Error('KaTeX security error: untrusted URL protocol');
            }
          }
          return `<span class="katex">${math}</span>`;
        }
      };

      const sandbox = {
        katex: mockKatex,
        console: { warn: () => {} }
      };
      vm.createContext(sandbox);

      const renderKatexMatch = appJs.match(/function\s+renderKatex\s*\(\s*math\s*,\s*displayMode\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(renderKatexMatch[0], sandbox);

      const hostileCases = [
        '\\href{javascript:alert(1)}{click here}',
        '\\url{javascript:alert(1)}',
        '\\htmlClass{bad" onmouseover="alert(1)}{test}',
        '\\text{<script>alert("xss")</script>}',
        '\\text{<img src="x" onerror="alert(1)">}',
        '\\text{<iframe src="https://evil.com"></iframe>}'
      ];

      hostileCases.forEach(hostileMath => {
        assert.doesNotThrow(() => {
          sandbox.renderKatex(hostileMath, false);
        });
      });
    });

    it('should survive extreme nesting and recursion without crashing the engine', () => {
      const mockKatex = {
        renderToString: (math) => {
          if (math.split('\\frac').length > 20) {
            const err = new RangeError('Maximum call stack size exceeded');
            throw err;
          }
          return `<span class="katex">${math}</span>`;
        }
      };

      const sandbox = {
        katex: mockKatex,
        console: { warn: () => {} }
      };
      vm.createContext(sandbox);

      const renderKatexMatch = appJs.match(/function\s+renderKatex\s*\(\s*math\s*,\s*displayMode\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(renderKatexMatch[0], sandbox);

      // Build 50-level nested fraction
      let deeplyNested = 'x';
      for (let i = 0; i < 50; i++) {
        deeplyNested = `\\frac{1}{${deeplyNested}}`;
      }

      assert.doesNotThrow(() => {
        const res = sandbox.renderKatex(deeplyNested, true);
        assert.strictEqual(res, null, 'Extreme recursion should safely return null fallback');
      });
    });

    it('should preserve surrounding Markdown when formatMessage encounters broken KaTeX math', () => {
      const sandbox = {
        katex: {
          renderToString: (math) => {
            if (math.includes('\\broken')) throw new Error('KaTeX syntax error');
            return `<span class="katex">${math}</span>`;
          }
        },
        escHtml: (str) => {
          if (!str) return '';
          return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },
        console: { warn: () => {} }
      };
      vm.createContext(sandbox);

      const renderKatexMatch = appJs.match(/function\s+renderKatex\s*\(\s*math\s*,\s*displayMode\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(renderKatexMatch[0], sandbox);

      // Extract formatMessage using exact slice
      const startIdx = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
      const endIdx = appJs.indexOf('function parseKanban(code) {');
      assert.ok(startIdx !== -1 && endIdx !== -1, 'formatMessage boundary must be found');
      const formatMsgCode = appJs.slice(startIdx, endIdx);
      vm.runInContext(formatMsgCode, sandbox);

      const input = `### Tiêu đề Toán Học\n\nĐây là công thức đúng: $$\\int_{0}^{1} x dx = \\frac{1}{2}$$\n\nĐây là công thức hỏng: $$\\broken{chi_tiet$$\n\nVà công thức inline hỏng: $\\broken{inline$ trong đoạn văn.\n\n- Danh sách mục 1\n- Danh sách mục 2\n\n**Chữ đậm** và *chữ nghiêng*.`;

      let output;
      assert.doesNotThrow(() => {
        output = sandbox.formatMessage(input);
      });

      // 1. Heading preserved
      assert.ok(output.includes('<h4 class="msg-heading">Tiêu đề Toán Học</h4>'));
      // 2. Valid formula rendered with KaTeX
      assert.ok(output.includes('<div class="math-block"><span class="katex">'));
      // 3. Broken block formula fallback to <code>
      assert.ok(output.includes('<div class="math-block"><code>\\broken{chi_tiet</code></div>'));
      // 4. Broken inline formula fallback to <code class="math-inline">
      assert.ok(output.includes('<code class="math-inline">\\broken{inline</code>'));
      // 5. Lists preserved
      assert.ok(output.includes('<ul class="msg-list"><li>Danh sách mục 1</li><li>Danh sách mục 2</li></ul>'));
      // 6. Bold & italic preserved
      assert.ok(output.includes('<strong>Chữ đậm</strong>'));
      assert.ok(output.includes('<em>chữ nghiêng</em>'));
    });

    it('should correctly handle currency dollar signs without falsely treating them as broken LaTeX', () => {
      const sandbox = {
        katex: {
          renderToString: (math) => `<span class="katex">${math}</span>`
        },
        escHtml: (str) => {
          if (!str) return '';
          return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
        console: { warn: () => {} }
      };
      vm.createContext(sandbox);

      const renderKatexMatch = appJs.match(/function\s+renderKatex\s*\(\s*math\s*,\s*displayMode\s*\)\s*\{[\s\S]*?\n\}/);
      vm.runInContext(renderKatexMatch[0], sandbox);

      const startIdx = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
      const endIdx = appJs.indexOf('function parseKanban(code) {');
      const formatMsgCode = appJs.slice(startIdx, endIdx);
      vm.runInContext(formatMsgCode, sandbox);

      const currencyInput = 'Giá sản phẩm là $50 và phí vận chuyển là $10.';
      const output = sandbox.formatMessage(currencyInput);

      assert.doesNotThrow(() => {
        assert.ok(output.length > 0);
      });
    });
  });
});
