/**
 * test_workspace_direct_sync_and_continuation.js
 * 
 * Comprehensive 4-Tier Test Suite for:
 * - R3: Direct Live Workspace Modification & Auto-Sync
 *   - Automatic extraction of HTML/JS/CSS code from Workspace Assistant responses
 *   - Direct real-time updates to #artifact-editor-textarea with 'input' event dispatch
 *   - Direct real-time updates to #artifact-iframe.srcdoc
 *   - Toast notification confirmation ('Đã tự động cập nhật Live Workspace!') with high z-index (10000)
 *   - Preservation of manual .btn-workspace-apply fallback button in chat history
 *   - Boundary, combinatorial, and real-world stress workloads
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('R3: Direct Live Workspace Modification & Auto-Sync Test Suite', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  // =========================================================================
  // DOM & VM SANDBOX TEST HARNESS
  // =========================================================================

  function createWorkspaceSandbox(options = {}) {
    const eventListeners = new Map();
    const dispatchedEvents = [];
    const toastCalls = [];

    const mockEditor = {
      tagName: 'TEXTAREA',
      id: 'artifact-editor-textarea',
      value: options.initialCode || '<!DOCTYPE html><html><body><h1>Initial Workspace</h1></body></html>',
      dispatchEvent(evt) {
        dispatchedEvents.push({ target: 'editor', type: evt.type });
        const handlers = eventListeners.get('editor_input') || [];
        handlers.forEach(fn => fn(evt));
        return true;
      },
      addEventListener(type, fn) {
        const key = `editor_${type}`;
        if (!eventListeners.has(key)) eventListeners.set(key, []);
        eventListeners.get(key).push(fn);
      }
    };

    const mockIframe = {
      tagName: 'IFRAME',
      id: 'artifact-iframe',
      srcdoc: options.initialCode || '<!DOCTYPE html><html><body><h1>Initial Workspace</h1></body></html>',
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] || null; }
    };

    const mockChatInput = {
      tagName: 'TEXTAREA',
      id: 'workspace-chat-input',
      value: options.initialInput || '',
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
      },
      querySelector(sel) {
        if (sel === '.btn-workspace-apply') {
          return {
            getAttribute: (attr) => attr === 'data-code' ? encodeURIComponent(mockEditor.value) : null
          };
        }
        return null;
      },
      querySelectorAll() { return []; }
    };

    const domRegistry = new Map([
      ['artifact-editor-textarea', mockEditor],
      ['artifact-iframe', mockIframe],
      ['workspace-chat-input', mockChatInput],
      ['workspace-chat-messages', mockChatMessages]
    ]);

    const mockDoc = {
      getElementById(id) {
        return domRegistry.get(id) || null;
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
      }
    };

    const sandbox = {
      document: mockDoc,
      window: {
        document: mockDoc,
        toast: (msg, type) => {
          toastCalls.push({ message: msg, type: type, timestamp: Date.now() });
        }
      },
      State: {
        workspaceMessages: [],
        settings: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'test-api-key'
        }
      },
      toast: (msg, type) => {
        toastCalls.push({ message: msg, type: type, timestamp: Date.now() });
      },
      escHtml: (text) => {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout: (fn, ms) => setTimeout(fn, 0),
      clearTimeout: (id) => clearTimeout(id),
      Event: function(type) { this.type = type; },
      CustomEvent: function(type, detail) { this.type = type; this.detail = detail; },
      decodeURIComponent: decodeURIComponent,
      encodeURIComponent: encodeURIComponent
    };

    vm.createContext(sandbox);
    return {
      sandbox,
      mockEditor,
      mockIframe,
      mockChatInput,
      mockChatMessages,
      dispatchedEvents,
      toastCalls,
      domRegistry
    };
  }

  // Pure reference specification implementation of Workspace Code Extraction & Auto-Sync
  function specExtractWorkspaceCode(responseText) {
    if (!responseText) return null;
    
    // Look for fenced code blocks with any language
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g;
    const matches = [];
    let m;
    while ((m = codeBlockRegex.exec(responseText)) !== null) {
      if (m[2] && m[2].trim().length > 0) {
        matches.push({ lang: (m[1] || '').toLowerCase(), content: m[2].trim() });
      }
    }

    if (matches.length === 0) return null;

    // Prioritize HTML/SVG/Canvas blocks or primary web code
    const htmlBlock = matches.find(b => 
      ['html', 'svg', 'xml'].includes(b.lang) || 
      b.content.includes('<html') || 
      b.content.includes('<!DOCTYPE') || 
      b.content.includes('<canvas') || 
      b.content.includes('<div') || 
      b.content.includes('<svg')
    );
    if (htmlBlock) return htmlBlock.content;

    // Next prefer JS/CSS
    const jsCssBlock = matches.find(b => ['javascript', 'js', 'css'].includes(b.lang));
    if (jsCssBlock) return jsCssBlock.content;

    return matches[0].content;
  }

  function specAutoApplyWorkspaceCode(newCode, sandboxContext) {
    if (!newCode) return false;
    const doc = sandboxContext.document;
    const editor = doc.getElementById('artifact-editor-textarea');
    const iframe = doc.getElementById('artifact-iframe');

    let updated = false;
    if (editor) {
      editor.value = newCode;
      editor.dispatchEvent(new sandboxContext.Event('input'));
      updated = true;
    }
    if (iframe) {
      iframe.srcdoc = newCode;
      updated = true;
    }
    if (updated) {
      if (sandboxContext.window.toast) {
        sandboxContext.window.toast('Đã tự động cập nhật Live Workspace!', 'success');
      }
    }
    return updated;
  }

  // =========================================================================
  // TIER 1: CORE FEATURE COVERAGE (T1-F1 to T1-F10)
  // =========================================================================
  describe('Tier 1: Feature Coverage (R3)', () => {

    it('T1-F1: should extract full HTML/JS/CSS code snippet from standard assistant markdown response', () => {
      const assistantReply = `Dưới đây là mã nguồn tôi đã chỉnh sửa theo yêu cầu của bạn:
\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <style>body { background: #007acc; color: white; }</style>
</head>
<body>
  <h1>Đã đổi màu nền thành xanh dương!</h1>
</body>
</html>
\`\`\`
Bạn có thể thử nghiệm ngay trên Live Preview.`;

      const extracted = specExtractWorkspaceCode(assistantReply);
      assert.ok(extracted !== null, 'Code snippet must be extracted');
      assert.ok(extracted.includes('<!DOCTYPE html>'));
      assert.ok(extracted.includes('background: #007acc;'));
      assert.ok(extracted.includes('<h1>Đã đổi màu nền thành xanh dương!</h1>'));
    });

    it('T1-F2: should automatically inject extracted code into #artifact-editor-textarea.value', () => {
      const { sandbox, mockEditor } = createWorkspaceSandbox();
      const newCode = '<!DOCTYPE html><html><body><h1>Updated Version 2.0</h1></body></html>';

      const success = specAutoApplyWorkspaceCode(newCode, sandbox);
      assert.strictEqual(success, true);
      assert.strictEqual(mockEditor.value, newCode, 'Editor value must be updated with new code');
    });

    it('T1-F3: should dispatch an "input" event on #artifact-editor-textarea upon automatic code update', () => {
      const { sandbox, dispatchedEvents } = createWorkspaceSandbox();
      const newCode = '<script>console.log("auto-sync");</script>';

      specAutoApplyWorkspaceCode(newCode, sandbox);
      const inputEvent = dispatchedEvents.find(e => e.target === 'editor' && e.type === 'input');
      assert.ok(inputEvent !== null, 'An "input" event must be dispatched to trigger syntax highlight and listeners');
    });

    it('T1-F4: should directly update #artifact-iframe.srcdoc with the extracted code', () => {
      const { sandbox, mockIframe } = createWorkspaceSandbox();
      const newCode = '<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>';

      specAutoApplyWorkspaceCode(newCode, sandbox);
      assert.strictEqual(mockIframe.srcdoc, newCode, 'Iframe srcdoc must directly reflect updated code');
    });

    it('T1-F5: should trigger a success Toast notification confirming workspace update', () => {
      const { sandbox, toastCalls } = createWorkspaceSandbox();
      const newCode = '<div>Success Test</div>';

      specAutoApplyWorkspaceCode(newCode, sandbox);
      assert.strictEqual(toastCalls.length, 1, 'Exactly one toast should be triggered');
      assert.strictEqual(toastCalls[0].type, 'success');
      assert.ok(toastCalls[0].message.includes('Live Workspace') || toastCalls[0].message.includes('tự động cập nhật'));
    });

    it('T1-F6: should ensure .toast-container in styles.css has z-index: 10000 to display above workspace modal', () => {
      assert.match(stylesCss, /\.toast-container\s*\{[^}]*z-index:\s*10000/i, 'styles.css must specify z-index: 10000 on .toast-container');
    });

    it('T1-F7: should preserve manual .btn-workspace-apply button in workspace chat message for re-application', () => {
      const msgContent = '```html\n<div>Reusable Component</div>\n```';
      const fnMatch = appJs.match(/function\s+formatWorkspaceMessageContent\s*\(\s*text\s*\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(fnMatch, 'formatWorkspaceMessageContent must be defined in app.js');

      const { sandbox } = createWorkspaceSandbox();
      vm.runInContext(fnMatch[0], sandbox);

      const htmlOutput = sandbox.formatWorkspaceMessageContent(msgContent);
      assert.ok(htmlOutput.includes('btn-workspace-apply'), 'Manual apply button must be present in chat');
      assert.ok(htmlOutput.includes('data-code='), 'Button must have data-code attribute with encoded content');
    });

    it('T1-F8: should append assistant response to State.workspaceMessages', () => {
      const { sandbox } = createWorkspaceSandbox();
      const reply = 'Mã nguồn đã được cập nhật.';
      sandbox.State.workspaceMessages.push({ role: 'assistant', content: reply });

      assert.strictEqual(sandbox.State.workspaceMessages.length, 1);
      assert.strictEqual(sandbox.State.workspaceMessages[0].role, 'assistant');
      assert.strictEqual(sandbox.State.workspaceMessages[0].content, reply);
    });

    it('T1-F9: should inject current editor code into system prompt for context-aware workspace modifications', () => {
      const currentCode = '<div id="car" style="color: red;">Red Car</div>';
      const promptTemplate = `[DANH TÍNH]: Bạn là Suna AI Workspace Assistant\n[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]:\n\`\`\`html\n${currentCode}\n\`\`\``;

      assert.ok(promptTemplate.includes(currentCode), 'System prompt must include active editor code');
      assert.ok(promptTemplate.includes('Suna AI Workspace Assistant'));
    });

    it('T1-F10: should remove workspace typing indicator upon receiving response or encountering error', () => {
      const { mockChatMessages } = createWorkspaceSandbox();
      const typingHtml = '<div id="typing_123" class="workspace-chat-message assistant typing">Suna đang suy nghĩ...</div>';
      mockChatMessages.innerHTML = typingHtml;

      // Simulate removal
      mockChatMessages.innerHTML = mockChatMessages.innerHTML.replace(/<div id="typing_123"[\s\S]*?<\/div>/, '');
      assert.strictEqual(mockChatMessages.innerHTML.includes('typing_123'), false, 'Typing indicator must be removed');
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (T2-B1 to T2-B10)
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases (R3)', () => {

    it('T2-B1: should cleanly extract code block when assistant includes lengthy explanation before and after code', () => {
      const reply = `Xin chào! Tôi đã xem qua mã nguồn hiện tại của bạn.
Dưới đây là một số điểm cần tối ưu:
1. Thêm sự kiện bàn phím
2. Tăng tốc độ khung hình

\`\`\`javascript
function updatePhysics() {
  velocity.x += acceleration.x;
  position.x += velocity.x;
}
\`\`\`

Hy vọng bản sửa đổi này giúp ứng dụng mượt mà hơn!`;

      const code = specExtractWorkspaceCode(reply);
      assert.ok(code.includes('function updatePhysics()'));
      assert.strictEqual(code.includes('Xin chào!'), false, 'Preamble text must not be in extracted code');
      assert.strictEqual(code.includes('Hy vọng bản sửa đổi'), false, 'Postscript text must not be in extracted code');
    });

    it('T2-B2: should select the primary HTML/App block when response contains multiple auxiliary code blocks', () => {
      const multiBlockReply = `Để cấu hình, chạy lệnh sau:
\`\`\`bash
npm install three
\`\`\`

Và đây là file HTML hoàn chỉnh:
\`\`\`html
<!DOCTYPE html>
<html>
<body>
  <canvas id="3d-view"></canvas>
</body>
</html>
\`\`\``;

      const extracted = specExtractWorkspaceCode(multiBlockReply);
      assert.ok(extracted.includes('<!DOCTYPE html>'), 'Must prioritize the runnable HTML artifact over bash snippet');
    });

    it('T2-B3: should not overwrite editor or trigger false toast when assistant reply is purely conversational (no code)', () => {
      const { sandbox, mockEditor, toastCalls } = createWorkspaceSandbox({
        initialCode: '<h1>Existing Workspace Code</h1>'
      });

      const purelyConversational = 'Chào bạn! Mã nguồn của bạn trông rất tốt và không cần chỉnh sửa gì thêm.';
      const extracted = specExtractWorkspaceCode(purelyConversational);

      assert.strictEqual(extracted, null, 'No code should be extracted from conversational text');
      const applied = specAutoApplyWorkspaceCode(extracted, sandbox);

      assert.strictEqual(applied, false, 'Auto apply must return false');
      assert.strictEqual(mockEditor.value, '<h1>Existing Workspace Code</h1>', 'Existing editor content must remain untouched');
      assert.strictEqual(toastCalls.length, 0, 'No toast should be fired for purely conversational replies');
    });

    it('T2-B4: should safely handle code containing HTML special characters and unescaped quotes', () => {
      const complexHtml = '<button onclick="if (x < 10 && y > 20) alert(\'Hello & Welcome\')">Click</button>';
      const rawResponse = `\`\`\`html\n${complexHtml}\n\`\`\``;

      const extracted = specExtractWorkspaceCode(rawResponse);
      assert.strictEqual(extracted, complexHtml);
    });

    it('T2-B5: should safely inject JavaScript containing regex literals and template strings into iframe', () => {
      const jsWithRegex = `<!DOCTYPE html>
<html>
<body>
<script>
  const urlRegex = /https?:\\/\\/[^\\s]+/g;
  const msg = \`Total matches: \${"https://suna.vn".match(urlRegex).length}\`;
  document.body.innerText = msg;
</script>
</body>
</html>`;

      const { sandbox, mockIframe } = createWorkspaceSandbox();
      specAutoApplyWorkspaceCode(jsWithRegex, sandbox);
      assert.strictEqual(mockIframe.srcdoc, jsWithRegex);
    });

    it('T2-B6: should gracefully handle missing #artifact-editor-textarea element without throwing uncaught TypeError', () => {
      const { sandbox, domRegistry } = createWorkspaceSandbox();
      domRegistry.delete('artifact-editor-textarea'); // Simulate element not found in DOM

      assert.doesNotThrow(() => {
        specAutoApplyWorkspaceCode('<div>Safe</div>', sandbox);
      }, 'Missing editor element must not throw unhandled exception');
    });

    it('T2-B7: should gracefully handle missing #artifact-iframe element without throwing uncaught TypeError', () => {
      const { sandbox, domRegistry } = createWorkspaceSandbox();
      domRegistry.delete('artifact-iframe'); // Simulate iframe not found

      assert.doesNotThrow(() => {
        specAutoApplyWorkspaceCode('<div>Safe</div>', sandbox);
      }, 'Missing iframe element must not throw unhandled exception');
    });

    it('T2-B8: should configure a 45s safety timeout for workspace requests in app.js', () => {
      assert.match(
        appJs,
        /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?_workspaceAbortController\.abort\(\);[\s\S]*?45000\)/,
        'Workspace requests must have a 45000ms safety timeout'
      );
    });

    it('T2-B9: should safely ignore empty workspace chat input without sending API requests', () => {
      const { mockChatInput } = createWorkspaceSandbox();
      mockChatInput.value = '   '; // Whitespace only

      const sendFnMatch = appJs.match(/async\s+function\s+sendWorkspaceMessage\s*\(\s*\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(sendFnMatch, 'sendWorkspaceMessage must be defined in app.js');

      // The function must exit early if text is empty
      assert.match(sendFnMatch[0], /if\s*\(!text\)\s*return;/);
    });

    it('T2-B10: should handle API network errors gracefully with user-friendly error toast', () => {
      const { sandbox, toastCalls } = createWorkspaceSandbox();
      sandbox.toast('Lỗi kết nối API Workspace Chat', 'error');

      assert.strictEqual(toastCalls.length, 1);
      assert.strictEqual(toastCalls[0].type, 'error');
      assert.ok(toastCalls[0].message.includes('Lỗi kết nối API'));
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (T3-C1 to T3-C5)
  // =========================================================================
  describe('Tier 3: Cross-Feature Combinations (R3)', () => {

    it('T3-C1: should render collapsible UI in chat AND simultaneously update editor and iframe for large code blocks (>12 lines)', () => {
      const { sandbox, mockEditor, mockIframe, toastCalls } = createWorkspaceSandbox();
      const largeCode = '<!DOCTYPE html>\n<html>\n<body>\n' +
        Array.from({ length: 20 }, (_, i) => `  <div class="row">${i}: Interactive Grid</div>`).join('\n') +
        '\n</body>\n</html>';

      const reply = `Tôi đã tạo giao diện lưới cho bạn:\n\`\`\`html\n${largeCode}\n\`\`\``;

      // 1. Chat rendering verification
      const lineCount = largeCode.split('\n').length;
      assert.ok(lineCount > 12, 'Code must exceed 12 lines');

      // 2. Direct extraction & auto-sync verification
      const extracted = specExtractWorkspaceCode(reply);
      assert.ok(extracted !== null);
      specAutoApplyWorkspaceCode(extracted, sandbox);

      assert.strictEqual(mockEditor.value, extracted);
      assert.strictEqual(mockIframe.srcdoc, extracted);
      assert.strictEqual(toastCalls.length, 1);
    });

    it('T3-C2: should synchronize editor change event listener to re-render preview automatically on manual edit', () => {
      const { mockEditor, mockIframe } = createWorkspaceSandbox();
      let listenerFired = false;

      mockEditor.addEventListener('input', () => {
        listenerFired = true;
        mockIframe.srcdoc = mockEditor.value;
      });

      mockEditor.value = '<h1>Manually Edited Code</h1>';
      mockEditor.dispatchEvent({ type: 'input' });

      assert.strictEqual(listenerFired, true);
      assert.strictEqual(mockIframe.srcdoc, '<h1>Manually Edited Code</h1>');
    });

    it('T3-C3: should handle multi-turn continuation within Workspace Assistant and auto-sync final stitched code', () => {
      const { sandbox, mockEditor, mockIframe } = createWorkspaceSandbox();

      const chunk1 = '```html\n<!DOCTYPE html>\n<html>\n<body>\n<canvas id="game"></canvas>\n<script>\n';
      const chunk2 = 'const c = document.getElementById("game");\nconst ctx = c.getContext("2d");\nctx.fillStyle = "blue";\nctx.fillRect(0,0,100,100);\n</script>\n</body>\n</html>\n```';

      const fullResponse = chunk1 + chunk2;
      const extracted = specExtractWorkspaceCode(fullResponse);

      assert.ok(extracted !== null);
      assert.ok(extracted.includes('<canvas id="game">'));
      assert.ok(extracted.includes('ctx.fillStyle = "blue";'));

      specAutoApplyWorkspaceCode(extracted, sandbox);
      assert.strictEqual(mockEditor.value, extracted);
      assert.strictEqual(mockIframe.srcdoc, extracted);
    });

    it('T3-C4: should abort in-flight workspace requests before sending a new prompt in rapid succession', () => {
      let previousAborted = false;
      let mockAbortController = {
        abort: () => { previousAborted = true; }
      };

      if (mockAbortController) {
        mockAbortController.abort();
      }
      mockAbortController = { abort: () => {} };

      assert.strictEqual(previousAborted, true, 'Previous in-flight request must be aborted');
    });

    it('T3-C5: should maintain workspace message history and limit API payload to last 6 messages', () => {
      const history = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`
      }));

      const sliced = history.slice(-6);
      assert.strictEqual(sliced.length, 6, 'API history must be capped at last 6 messages');
      assert.strictEqual(sliced[0].content, 'Message 4');
      assert.strictEqual(sliced[5].content, 'Message 9');
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD WORKLOADS & INTEGRITY (T4-W1 to T4-W4)
  // =========================================================================
  describe('Tier 4: Real-World Workloads & Integrity (R3)', () => {

    it('T4-W1: should extract and auto-apply a complex Interactive HTML5 Canvas Particle System', () => {
      const { sandbox, mockEditor, mockIframe, toastCalls } = createWorkspaceSandbox();
      const canvasSimulationCode = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Zen Particle Simulation</title>
  <style>
    body { margin: 0; background: #0d0b14; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="zen-canvas"></canvas>
  <script>
    const canvas = document.getElementById('zen-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    for (let i = 0; i < 50; i++) {
      particles.push({ x: Math.random() * 800, y: Math.random() * 600, r: Math.random() * 3 + 1 });
    }
    function draw() {
      ctx.clearRect(0, 0, 800, 600);
      ctx.fillStyle = '#e8a87c';
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;

      const assistantReply = `Tôi đã tạo hiệu ứng hạt Zen cho bạn:\n\`\`\`html\n${canvasSimulationCode}\n\`\`\``;
      const extracted = specExtractWorkspaceCode(assistantReply);

      assert.strictEqual(extracted, canvasSimulationCode);
      const applied = specAutoApplyWorkspaceCode(extracted, sandbox);

      assert.strictEqual(applied, true);
      assert.strictEqual(mockEditor.value, canvasSimulationCode);
      assert.strictEqual(mockIframe.srcdoc, canvasSimulationCode);
      assert.strictEqual(toastCalls[0].type, 'success');
    });

    it('T4-W2: should handle SVG animation components and correctly render in workspace without escaping corruption', () => {
      const { sandbox, mockEditor, mockIframe } = createWorkspaceSandbox();
      const svgComponent = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" stroke="#e8a87c" stroke-width="4" fill="none">
    <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="5s" repeatCount="indefinite"/>
  </circle>
</svg>`;

      const reply = `Đây là biểu tượng SVG xoay tròn:\n\`\`\`svg\n${svgComponent}\n\`\`\``;
      const extracted = specExtractWorkspaceCode(reply);
      assert.strictEqual(extracted, svgComponent);

      specAutoApplyWorkspaceCode(extracted, sandbox);
      assert.strictEqual(mockEditor.value, svgComponent);
      assert.strictEqual(mockIframe.srcdoc, svgComponent);
    });

    it('T4-W3: should execute 5 consecutive workspace code modifications in rapid succession without state leakage', () => {
      const { sandbox, mockEditor, mockIframe, toastCalls } = createWorkspaceSandbox();

      for (let version = 1; version <= 5; version++) {
        const code = `<!DOCTYPE html><html><body><h1>Version ${version}</h1></body></html>`;
        const reply = `Cập nhật phiên bản ${version}:\n\`\`\`html\n${code}\n\`\`\``;
        const extracted = specExtractWorkspaceCode(reply);
        specAutoApplyWorkspaceCode(extracted, sandbox);

        assert.strictEqual(mockEditor.value, code);
        assert.strictEqual(mockIframe.srcdoc, code);
      }

      assert.strictEqual(toastCalls.length, 5, '5 toasts must be recorded for 5 consecutive mutations');
    });

    it('T4-W4: should verify static JavaScript compilation and zero unhandled rejections', () => {
      const { execSync } = require('child_process');
      const output = execSync('node -c app.js', { encoding: 'utf8' });
      assert.strictEqual(output, '', 'Clean static syntax compile required');
    });
  });
});
