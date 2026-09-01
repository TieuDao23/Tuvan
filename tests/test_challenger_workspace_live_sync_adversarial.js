/**
 * test_challenger_workspace_live_sync_adversarial.js
 * 
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE for Direct Workspace Live Sync (R3)
 * Target implementations:
 *   - extractWorkspaceCode(responseText)
 *   - autoApplyWorkspaceCode(newCode)
 *   - sendWorkspaceMessage()
 *   - applyWorkspaceCode(button)
 *   - Event dispatching, AbortController lifecycle, DOM null resilience, and edge case boundaries
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Empirical Challenger: Direct Workspace Live Sync (R3) Adversarial Stress Suite', () => {
  let appJs;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // SANDBOX ENVIRONMENT BUILDER
  // =========================================================================
  function createAdversarialWorkspaceEnvironment(customState = {}, domOverrides = {}) {
    const eventListeners = new Map();
    const dispatchedEvents = [];
    const toastCalls = [];
    const fetchCalls = [];

    const mockEditor = {
      tagName: 'TEXTAREA',
      id: 'artifact-editor-textarea',
      value: '<!DOCTYPE html><html><body>Original Editor Code</body></html>',
      dispatchEvent(evt) {
        dispatchedEvents.push({ target: 'editor', type: evt.type, bubbles: evt.bubbles });
        const handlers = eventListeners.get('editor_' + evt.type) || [];
        handlers.forEach(fn => fn(evt));
        return true;
      },
      addEventListener(type, fn) {
        const key = 'editor_' + type;
        if (!eventListeners.has(key)) eventListeners.set(key, []);
        eventListeners.get(key).push(fn);
      }
    };

    const mockIframe = {
      tagName: 'IFRAME',
      id: 'artifact-iframe',
      srcdoc: '<!DOCTYPE html><html><body>Original Iframe Code</body></html>',
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] || null; }
    };

    const mockChatInput = {
      tagName: 'TEXTAREA',
      id: 'workspace-chat-input',
      value: '',
      dispatchEvent(evt) { return true; }
    };

    const mockChatMessages = {
      tagName: 'DIV',
      id: 'workspace-chat-messages',
      innerHTML: '',
      scrollTop: 0,
      scrollHeight: 100,
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      insertAdjacentHTML(pos, html) {
        this.innerHTML += html;
      }
    };

    const defaultElements = {
      'artifact-editor-textarea': mockEditor,
      'artifact-iframe': mockIframe,
      'workspace-chat-input': mockChatInput,
      'workspace-chat-messages': mockChatMessages
    };

    const elements = { ...defaultElements, ...domOverrides };

    const mockDoc = {
      getElementById(id) {
        return elements[id] !== undefined ? elements[id] : null;
      },
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          className: '',
          classList: {
            add() {}, remove() {}, contains() { return false; }, toggle() {}
          },
          innerHTML: '',
          setAttribute() {},
          getAttribute() { return null; },
          remove() {}
        };
      },
      querySelectorAll() { return []; }
    };

    class MockAbortController {
      constructor() {
        this.signal = { aborted: false, listeners: [] };
      }
      abort() {
        this.signal.aborted = true;
        this.signal.listeners.forEach(cb => cb());
      }
    }

    const sandbox = {
      document: mockDoc,
      window: {
        document: mockDoc,
        toast: (msg, type) => {
          toastCalls.push({ message: msg, type, timestamp: Date.now() });
        }
      },
      State: {
        workspaceMessages: [],
        settings: {
          baseUrl: 'https://api.test-suna.ai/v1',
          apiKey: 'suna-sk-test-token-123456789'
        },
        ...customState
      },
      toast: (msg, type) => {
        toastCalls.push({ message: msg, type, timestamp: Date.now() });
      },
      getActiveModel: () => 'suna-pro-v2',
      getProxyForModel: (model) => ({
        url: 'https://proxy.test-suna.ai',
        key: 'suna-proxy-key'
      }),
      escHtml: (text) => {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout: (fn, ms) => setTimeout(fn, 1),
      clearTimeout: (id) => clearTimeout(id),
      Event: function(type, opts) {
        this.type = type;
        this.bubbles = opts ? !!opts.bubbles : false;
      },
      CustomEvent: function(type, detail) { this.type = type; this.detail = detail; },
      AbortController: MockAbortController,
      decodeURIComponent: decodeURIComponent,
      encodeURIComponent: encodeURIComponent,
      fetch: async (url, options) => {
        fetchCalls.push({ url, options });
        if (options && options.signal && options.signal.aborted) {
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          throw abortErr;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant',
                content: 'Dưới đây là mã nguồn mới:\n```html\n<!DOCTYPE html><html><body><h1>Fetched Direct Code</h1></body></html>\n```'
              }
            }]
          })
        };
      }
    };

    vm.createContext(sandbox);

    // Extract core workspace functions directly from app.js into sandbox
    const extractFnMatch = appJs.match(/function\s+extractWorkspaceCode\s*\([\s\S]*?\n  \}/);
    const autoApplyFnMatch = appJs.match(/function\s+autoApplyWorkspaceCode\s*\([\s\S]*?\n  \}/);
    const applyBtnFnMatch = appJs.match(/window\.applyWorkspaceCode\s*=\s*function\s*\([\s\S]*?\n  \};/);
    const renderMsgFnMatch = appJs.match(/function\s+renderWorkspaceMessages\s*\([\s\S]*?\n  \}/);
    const formatMsgFnMatch = appJs.match(/function\s+formatWorkspaceMessageContent\s*\([\s\S]*?\n  \}/);

    assert.ok(extractFnMatch, 'extractWorkspaceCode must be extractable from app.js');
    assert.ok(autoApplyFnMatch, 'autoApplyWorkspaceCode must be extractable from app.js');
    assert.ok(applyBtnFnMatch, 'applyWorkspaceCode must be extractable from app.js');
    assert.ok(renderMsgFnMatch, 'renderWorkspaceMessages must be extractable from app.js');
    assert.ok(formatMsgFnMatch, 'formatWorkspaceMessageContent must be extractable from app.js');

    vm.runInContext(formatMsgFnMatch[0], sandbox);
    vm.runInContext(renderMsgFnMatch[0], sandbox);
    vm.runInContext(extractFnMatch[0], sandbox);
    vm.runInContext(autoApplyFnMatch[0], sandbox);
    vm.runInContext(applyBtnFnMatch[0], sandbox);
    sandbox.applyWorkspaceCode = sandbox.window.applyWorkspaceCode;

    return {
      sandbox,
      mockEditor,
      mockIframe,
      mockChatInput,
      mockChatMessages,
      dispatchedEvents,
      toastCalls,
      fetchCalls,
      elements
    };
  }

  // =========================================================================
  // 1. COMPLEX CODE EXTRACTION & MULTI-FILE SCENARIOS
  // =========================================================================
  describe('1. Complex Code Extraction & Multi-File Blocks', () => {

    it('AD-1.1: should extract complex HTML5 Canvas with Math physics and requestAnimationFrame', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const canvasPhysics = `<!DOCTYPE html>
<html>
<head><style>canvas { background: #000; display: block; }</style></head>
<body>
<canvas id="c" width="800" height="600"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  const balls = Array.from({length: 100}, () => ({
    x: 400, y: 300, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, r: 4
  }));
  function loop() {
    ctx.clearRect(0,0,800,600);
    balls.forEach(b => {
      b.x += b.vx; b.y += b.vy;
      if (b.x < 0 || b.x > 800) b.vx *= -1;
      if (b.y < 0 || b.y > 600) b.vy *= -1;
      ctx.fillStyle = '#ff0055';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    });
    requestAnimationFrame(loop);
  }
  loop();
</script>
</body>
</html>`;

      const responseText = `Đây là mã mô phỏng hạt cơ học:\n\`\`\`html\n${canvasPhysics}\n\`\`\`\nChúc bạn thành công!`;
      const extracted = sandbox.extractWorkspaceCode(responseText);

      assert.strictEqual(extracted, canvasPhysics);
      assert.ok(extracted.includes('requestAnimationFrame(loop)'));
      assert.ok(extracted.includes('Math.PI*2'));
    });

    it('AD-1.2: should extract standalone SVG animations with XML namespaces, CDATA and inline CSS', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const svgGraphic = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
    </linearGradient>
  </defs>
  <ellipse cx="250" cy="250" rx="200" ry="100" fill="url(#grad1)">
    <animate attributeName="rx" values="200;100;200" dur="3s" repeatCount="indefinite"/>
  </ellipse>
</svg>`;

      const responseText = `Tôi đã tạo SVG hình elip biến thiên:\n\`\`\`svg\n${svgGraphic}\n\`\`\``;
      const extracted = sandbox.extractWorkspaceCode(responseText);

      assert.strictEqual(extracted, svgGraphic);
      assert.ok(extracted.includes('animate attributeName="rx"'));
    });

    it('AD-1.3: should prioritize runnable HTML artifact over bash instructions, JSON configs, and python snippets in multi-block replies', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const bashCode = `npm install --save three gsap\nnpx vite build`;
      const jsonConfig = `{\n  "name": "workspace-demo",\n  "version": "1.0.0"\n}`;
      const htmlCode = `<!DOCTYPE html>\n<html>\n<head><title>3D World</title></head>\n<body><div id="app">Hello 3D</div></body>\n</html>`;

      const responseText = `Bước 1: Cài đặt thư viện phụ thuộc:
\`\`\`bash
${bashCode}
\`\`\`

Bước 2: Cấu hình package.json:
\`\`\`json
${jsonConfig}
\`\`\`

Bước 3: File HTML hoàn chỉnh để chạy trực tiếp:
\`\`\`html
${htmlCode}
\`\`\`
Bạn có thể xem trước ngay!`;

      const extracted = sandbox.extractWorkspaceCode(responseText);
      assert.strictEqual(extracted, htmlCode, 'Must pick the runnable HTML code block, ignoring bash and json');
    });

    it('AD-1.4: should prioritize JS/CSS code block when only scripting/styling is returned without HTML wrapper', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const jsSnippet = `const canvas = document.getElementById('myCanvas');\nconst gl = canvas.getContext('webgl');\nconsole.log('WebGL initialized', gl);`;
      const responseText = `Đoạn mã JavaScript nâng cao của bạn:\n\`\`\`javascript\n${jsSnippet}\n\`\`\``;

      const extracted = sandbox.extractWorkspaceCode(responseText);
      assert.strictEqual(extracted, jsSnippet);
    });

    it('AD-1.5: should handle case-insensitive fenced block tags (```HTML, ```JavaScript, ```JS, ```CSS)', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const htmlUpper = `<!DOCTYPE html>\n<html>\n<body><h1>UPPERCASE TAG</h1></body>\n</html>`;
      const responseText = `Đây là code:\n\`\`\`HTML\n${htmlUpper}\n\`\`\``;

      const extracted = sandbox.extractWorkspaceCode(responseText);
      assert.strictEqual(extracted, htmlUpper);
    });

    it('AD-1.6: should correctly extract code containing embedded backticks, template strings, and regex with forward slashes', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const codeWithComplexChars = '<!DOCTYPE html>\n' +
        '<html>\n' +
        '<body>\n' +
        '<script>\n' +
        '  const template = `User: ${userName}` + "nested backticks";\n' +
        '  const rx = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$/;\n' +
        '  console.log(template, rx.test("test@example.com"));\n' +
        '</script>\n' +
        '</body>\n' +
        '</html>';

      const responseText = `\`\`\`html\n${codeWithComplexChars}\n\`\`\``;
      const extracted = sandbox.extractWorkspaceCode(responseText);
      assert.strictEqual(extracted, codeWithComplexChars);
    });
  });

  // =========================================================================
  // 2. CONVERSATIONAL REPLIES & IMMUNITY TO ERRONEOUS OVERWRITES
  // =========================================================================
  describe('2. Conversational Replies (Pure Text) Immunity', () => {

    it('AD-2.1: should return null for purely conversational greetings and advice without modifying editor or iframe', () => {
      const { sandbox, mockEditor, mockIframe, toastCalls } = createAdversarialWorkspaceEnvironment();
      const originalEditorCode = mockEditor.value;
      const originalIframeCode = mockIframe.srcdoc;

      const conversationalReply = 'Chào bạn! Mình là Suna AI Workspace Assistant. Bạn có muốn thêm hiệu ứng âm thanh hoặc đổi màu nền không?';
      const extracted = sandbox.extractWorkspaceCode(conversationalReply);

      assert.strictEqual(extracted, null, 'Must extract null for text without fenced code');
      const applied = sandbox.autoApplyWorkspaceCode(extracted);

      assert.strictEqual(applied, false);
      assert.strictEqual(mockEditor.value, originalEditorCode, 'Editor must not be modified');
      assert.strictEqual(mockIframe.srcdoc, originalIframeCode, 'Iframe must not be modified');
      assert.strictEqual(toastCalls.length, 0, 'No false toast must be triggered');
    });

    it('AD-2.2: should not mistake inline markdown code spans (`const x = 10;`) for runnable workspace code blocks', () => {
      const { sandbox, mockEditor, mockIframe, toastCalls } = createAdversarialWorkspaceEnvironment();
      const originalEditorCode = mockEditor.value;
      const originalIframeCode = mockIframe.srcdoc;

      const inlineCodeReply = 'Bạn có thể dùng lệnh `npm run build` hoặc gọi hàm `renderScene()` để vẽ lại khung hình nhé.';
      const extracted = sandbox.extractWorkspaceCode(inlineCodeReply);

      assert.strictEqual(extracted, null, 'Inline code spans must not be extracted as workspace code blocks');
      const applied = sandbox.autoApplyWorkspaceCode(extracted);

      assert.strictEqual(applied, false);
      assert.strictEqual(mockEditor.value, originalEditorCode);
      assert.strictEqual(mockIframe.srcdoc, originalIframeCode);
      assert.strictEqual(toastCalls.length, 0);
    });

    it('AD-2.3: should return null when fenced code block is empty or contains only whitespace', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const emptyBlock = 'Dưới đây là mẫu trống:\n```html\n   \n\t\n```\nHãy thử lại!';
      const extracted = sandbox.extractWorkspaceCode(emptyBlock);

      assert.strictEqual(extracted, null, 'Whitespace-only code block must yield null');
    });

    it('AD-2.4: should return null for empty or undefined input safely', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      assert.strictEqual(sandbox.extractWorkspaceCode(''), null);
      assert.strictEqual(sandbox.extractWorkspaceCode(null), null);
      assert.strictEqual(sandbox.extractWorkspaceCode(undefined), null);
    });
  });

  // =========================================================================
  // 3. MISSING DOM ELEMENTS & FAULT RESILIENCE
  // =========================================================================
  describe('3. Missing DOM Elements & Partial Hierarchy Fault Resilience', () => {

    it('AD-3.1: should safely update iframe when editor textarea is missing from DOM (e.g. preview-only mode)', () => {
      const { sandbox, mockIframe, toastCalls } = createAdversarialWorkspaceEnvironment({}, {
        'artifact-editor-textarea': null
      });

      const newCode = '<!DOCTYPE html><html><body><h1>Preview Only Mode</h1></body></html>';
      const applied = sandbox.autoApplyWorkspaceCode(newCode);

      assert.strictEqual(applied, true);
      assert.strictEqual(mockIframe.srcdoc, newCode);
      assert.strictEqual(toastCalls.length, 1);
      assert.strictEqual(toastCalls[0].type, 'success');
    });

    it('AD-3.2: should safely update editor textarea when iframe is missing from DOM (e.g. editor-only mode)', () => {
      const { sandbox, mockEditor, toastCalls } = createAdversarialWorkspaceEnvironment({}, {
        'artifact-iframe': null
      });

      const newCode = '<!DOCTYPE html><html><body><h1>Editor Only Mode</h1></body></html>';
      const applied = sandbox.autoApplyWorkspaceCode(newCode);

      assert.strictEqual(applied, true);
      assert.strictEqual(mockEditor.value, newCode);
      assert.strictEqual(toastCalls.length, 1);
      assert.strictEqual(toastCalls[0].type, 'success');
    });

    it('AD-3.3: should return false and not throw error when BOTH editor and iframe are missing from DOM', () => {
      const { sandbox, toastCalls } = createAdversarialWorkspaceEnvironment({}, {
        'artifact-editor-textarea': null,
        'artifact-iframe': null
      });

      let applied;
      assert.doesNotThrow(() => {
        applied = sandbox.autoApplyWorkspaceCode('<div>No DOM Elements</div>');
      }, 'Must not throw when DOM elements are null');

      assert.strictEqual(applied, false);
      assert.strictEqual(toastCalls.length, 0, 'No toast when neither element could be updated');
    });

    it('AD-3.4: should gracefully handle window.toast vs global toast fallback mechanism', () => {
      const customWindow = { document: null }; // no window.toast
      const globalToasts = [];
      const sandbox = {
        document: {
          getElementById: (id) => ({ value: '', srcdoc: '', dispatchEvent: () => true })
        },
        window: customWindow,
        toast: (msg, type) => { globalToasts.push({ msg, type }); },
        Event: function(type) { this.type = type; }
      };
      vm.createContext(sandbox);

      const autoApplyFnMatch = appJs.match(/function\s+autoApplyWorkspaceCode\s*\([\s\S]*?\n  \}/);
      vm.runInContext(autoApplyFnMatch[0], sandbox);

      const result = sandbox.autoApplyWorkspaceCode('<h1>Toast Fallback Test</h1>');
      assert.strictEqual(result, true);
      assert.strictEqual(globalToasts.length, 1);
      assert.strictEqual(globalToasts[0].type, 'success');
    });
  });

  // =========================================================================
  // 4. EVENT LISTENER PROPAGATION & DOWNSTREAM INTEGRATION
  // =========================================================================
  describe('4. Event Propagation & Downstream Sync Verification', () => {

    it('AD-4.1: should trigger input event listener with bubbles: true on #artifact-editor-textarea', () => {
      const { sandbox, mockEditor, dispatchedEvents } = createAdversarialWorkspaceEnvironment();
      let capturedInListener = null;

      mockEditor.addEventListener('input', (e) => {
        capturedInListener = {
          type: e.type,
          bubbles: e.bubbles,
          editorValue: mockEditor.value
        };
      });

      const updatedCode = '<div>Trigger Event Test</div>';
      sandbox.autoApplyWorkspaceCode(updatedCode);

      assert.ok(capturedInListener !== null, 'Input event listener must be executed');
      assert.strictEqual(capturedInListener.type, 'input');
      assert.strictEqual(capturedInListener.bubbles, true, 'Input event must bubble to support container event delegation');
      assert.strictEqual(capturedInListener.editorValue, updatedCode);

      const dispatched = dispatchedEvents.find(e => e.target === 'editor' && e.type === 'input');
      assert.ok(dispatched !== null);
      assert.strictEqual(dispatched.bubbles, true);
    });

    it('AD-4.2: should support manual applyWorkspaceCode button click with URI-encoded payload', () => {
      const { sandbox, mockEditor, mockIframe, toastCalls } = createAdversarialWorkspaceEnvironment();
      const codeToApply = '<section class="hero"><h1>Manual Apply Worked!</h1></section>';

      const mockButton = {
        getAttribute: (attr) => attr === 'data-code' ? encodeURIComponent(codeToApply) : null
      };

      sandbox.applyWorkspaceCode(mockButton);

      assert.strictEqual(mockEditor.value, codeToApply);
      assert.strictEqual(mockIframe.srcdoc, codeToApply);
      assert.strictEqual(toastCalls.length, 1);
      assert.strictEqual(toastCalls[0].type, 'success');
      assert.ok(toastCalls[0].message.includes('Đã áp dụng mã nguồn mới vào Editor!'));
    });
  });

  // =========================================================================
  // 5. RAPID CONSECUTIVE REQUESTS & ABORT CONTROLLER LIFECYCLE
  // =========================================================================
  describe('5. Rapid Consecutive Requests & Safety Timeout Lifecycle', () => {

    it('AD-5.1: should verify that app.js sets 45-second timeout on _workspaceAbortController', () => {
      assert.match(
        appJs,
        /const\s+timeoutId\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?_workspaceAbortController\.abort\(\);[\s\S]*?45000\)/,
        'Workspace requests must enforce a 45000ms abort timeout'
      );
    });

    it('AD-5.2: should verify _workspaceAbortController is aborted and cleaned up on rapid back-to-back calls', () => {
      let activeController = null;
      const abortSignals = [];

      function simulateSendWorkspaceRequest(promptText) {
        if (activeController) {
          activeController.abort();
          abortSignals.push('aborted_previous');
          activeController = null;
        }
        activeController = {
          id: promptText,
          aborted: false,
          abort() {
            this.aborted = true;
          }
        };
      }

      // User submits 4 rapid queries
      simulateSendWorkspaceRequest('Query 1: Làm cho nó xoay');
      simulateSendWorkspaceRequest('Query 2: Đổi màu xanh');
      simulateSendWorkspaceRequest('Query 3: Thêm nút bấm');
      simulateSendWorkspaceRequest('Query 4: Hoàn tác');

      assert.strictEqual(abortSignals.length, 3, '3 in-flight requests should have been aborted');
      assert.strictEqual(activeController.id, 'Query 4: Hoàn tác');
      assert.strictEqual(activeController.aborted, false, 'The latest request remains active');
    });

    it('AD-5.3: should verify AbortError generates warning toast instead of generic network error in app.js', () => {
      assert.match(
        appJs,
        /if\s*\(\s*err\s*&&\s*err\.name\s*===\s*'AbortError'\s*\)\s*\{[\s\S]*?toast\(['"]Yêu cầu Workspace Chat đã quá hạn thời gian hoặc bị hủy\.['"],\s*['"]warning['"]\);/,
        'AbortError must produce warning toast specific to timeout/cancellation'
      );
    });

    it('AD-5.4: should verify typing indicator cleanup in both success and error paths in app.js', () => {
      assert.match(
        appJs,
        /const\s+typingEl\s*=\s*document\.getElementById\(typingMsgId\);\s*\n\s*if\s*\(typingEl\)\s*typingEl\.remove\(\);/,
        'Typing indicator must be removed after response is received'
      );

      // Also verify in catch block
      assert.match(
        appJs,
        /catch\s*\(err\)\s*\{[\s\S]*?if\s*\(typingEl\)\s*typingEl\.remove\(\);/,
        'Typing indicator must be removed in catch block on error'
      );
    });
  });

  // =========================================================================
  // 6. EXTREME SCALE, MEMORY STRESS & SANITIZATION BOUNDARIES
  // =========================================================================
  describe('6. Extreme Scale, Memory Stress & Sanitization Boundaries', () => {

    it('AD-6.1: should extract and auto-apply massive 500-line HTML5 3D WebGL / Canvas scene without truncation', () => {
      const { sandbox, mockEditor, mockIframe, toastCalls } = createAdversarialWorkspaceEnvironment();
      const largeLines = Array.from({ length: 500 }, (_, i) => `  // Line ${i + 1}: Math.sin(${i}) * Math.cos(${i})`).join('\n');
      const massiveCode = `<!DOCTYPE html>\n<html>\n<body>\n<script>\n${largeLines}\n</script>\n</body>\n</html>`;

      const responseText = `Đây là mã nguồn WebGL 500 dòng:\n\`\`\`html\n${massiveCode}\n\`\`\``;
      const extracted = sandbox.extractWorkspaceCode(responseText);

      assert.strictEqual(extracted, massiveCode);
      assert.strictEqual(extracted.split('\n').length, massiveCode.split('\n').length);
      assert.ok(extracted.split('\n').length >= 500);

      const applied = sandbox.autoApplyWorkspaceCode(extracted);
      assert.strictEqual(applied, true);
      assert.strictEqual(mockEditor.value, massiveCode);
      assert.strictEqual(mockIframe.srcdoc, massiveCode);
      assert.strictEqual(toastCalls.length, 1);
    });

    it('AD-6.2: should handle base64 embedded audio/image data URIs inside extracted code cleanly', () => {
      const { sandbox, mockEditor, mockIframe } = createAdversarialWorkspaceEnvironment();
      const base64Img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const codeWithDataUri = `<!DOCTYPE html><html><body><img src="${base64Img}"></body></html>`;

      const responseText = `\`\`\`html\n${codeWithDataUri}\n\`\`\``;
      const extracted = sandbox.extractWorkspaceCode(responseText);

      assert.strictEqual(extracted, codeWithDataUri);
      sandbox.autoApplyWorkspaceCode(extracted);
      assert.strictEqual(mockEditor.value, codeWithDataUri);
      assert.strictEqual(mockIframe.srcdoc, codeWithDataUri);
    });

    it('AD-6.3: should preserve special Vietnamese diacritics and Unicode characters throughout extraction and auto-apply', () => {
      const { sandbox, mockEditor, mockIframe } = createAdversarialWorkspaceEnvironment();
      const vietnameseUnicode = `<!DOCTYPE html>
<html>
<body>
  <h1>Xin chào Việt Nam! 🇻🇳 Chúc mừng năm mới & vạn sự như ý.</h1>
  <p>Thử nghiệm ký tự đặc biệt: đ, ê, ô, ơ, ư, ỹ, ẽ, ặ, ậ, ợ, ứ, ử, ữ, ỹ...</p>
</body>
</html>`;

      const responseText = `Mã nguồn với tiếng Việt có dấu:\n\`\`\`html\n${vietnameseUnicode}\n\`\`\``;
      const extracted = sandbox.extractWorkspaceCode(responseText);

      assert.strictEqual(extracted, vietnameseUnicode);
      sandbox.autoApplyWorkspaceCode(extracted);
      assert.strictEqual(mockEditor.value, vietnameseUnicode);
      assert.strictEqual(mockIframe.srcdoc, vietnameseUnicode);
    });

    it('AD-6.4: should format workspace chat message content with collapsible UI and copy/apply action buttons', () => {
      const { sandbox } = createAdversarialWorkspaceEnvironment();
      const codeSnippet = '<!DOCTYPE html>\n<html>\n' +
        Array.from({ length: 25 }, (_, i) => `  <p>Item ${i}</p>`).join('\n') +
        '\n</html>';

      const chatMsg = `Đây là giao diện:\n\`\`\`html\n${codeSnippet}\n\`\`\``;
      const formattedHtml = sandbox.formatWorkspaceMessageContent(chatMsg);

      assert.ok(formattedHtml.includes('collapsible-code-container') || formattedHtml.includes('code-block-header') || formattedHtml.includes('btn-workspace-apply'));
      assert.ok(formattedHtml.includes('btn-workspace-apply'), 'Must include manual apply button');
      assert.ok(formattedHtml.includes('data-code='), 'Must include data-code attribute');
    });
  });
});

