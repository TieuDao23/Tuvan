const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

console.log('==================================================================');
console.log('>>> FORENSIC AUDIT: EMPIRICAL VERIFICATION & STRESS TESTS (M1) <<<');
console.log('==================================================================');

const appJs = fs.readFileSync('app.js', 'utf8');
const stylesCss = fs.readFileSync('styles.css', 'utf8');

// =========================================================================
// 1. FORBIDDEN PATTERN & FACADE DETECTION
// =========================================================================
console.log('\n[Phase 1] Prohibited Pattern & Facade Detection...');

const suspiciousPatterns = [
  { name: 'Hardcoded test pass string', regex: /return\s+['"](?:pass|ok)['"];/i },
  { name: 'Hardcoded line badge mock', regex: /return\s+['"]<span class="code-line-badge">15 dòng<\/span>['"]/ },
  { name: 'Hardcoded test ID dispatch branch', regex: /if\s*\(\s*text\.includes\(['"]T1-F['"]\)/ },
  { name: 'Global test mock object', regex: /window\.__TEST_MOCK__/ }
];

let facadeViolations = 0;
for (const p of suspiciousPatterns) {
  if (p.regex.test(appJs)) {
    console.error(`  [-] VIOLATION: Found suspicious pattern "${p.name}"`);
    facadeViolations++;
  }
}
assert.strictEqual(facadeViolations, 0, 'No suspicious facade patterns must exist');
console.log('  [+] Clean: Zero hardcoded test mocks, bypasses, or facade stubs detected.');

// =========================================================================
// 2. DYNAMIC CODE FORMATTING & LINE CALCULATION FIDELITY
// =========================================================================
console.log('\n[Phase 2] Dynamic Line Calculation & Escaping Fidelity...');

const startIdx = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
const endIdx = appJs.indexOf('function parseKanban(code) {');
assert(startIdx !== -1 && endIdx !== -1, 'formatMessage must exist in app.js');

const sandbox = {
  escHtml: (t) => t ? t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '',
  renderKatex: () => '',
  renderMindmapIframe: () => '',
  parseKanban: () => '',
  window: {},
  document: { createElement: () => ({}) },
  encodeURIComponent: encodeURIComponent
};
vm.createContext(sandbox);
vm.runInContext(appJs.slice(startIdx, endIdx), sandbox);

// Test 2.1: Empty code block
const outEmpty = sandbox.formatMessage('```javascript\n```');
assert(outEmpty.includes('0 dòng'), 'Empty block must report 0 dòng');
assert(!outEmpty.includes('is-collapsible'), 'Empty block must not be collapsible');

// Test 2.2: 12 lines boundary (not collapsible)
const code12 = Array.from({length: 12}, (_, i) => `const row_${i} = ${i};`).join('\n');
const out12 = sandbox.formatMessage('```javascript\n' + code12 + '\n```');
assert(!out12.includes('is-collapsible'), '12 lines boundary must NOT be collapsible');
assert(out12.includes('12 dòng'), 'Must display exact 12 dòng');

// Test 2.3: 13 lines boundary (is collapsible)
const code13 = Array.from({length: 13}, (_, i) => `const row_${i} = ${i};`).join('\n');
const out13 = sandbox.formatMessage('```javascript\n' + code13 + '\n```');
assert(out13.includes('is-collapsible collapsed'), '13 lines boundary MUST be collapsible collapsed');
assert(out13.includes('13 dòng'), 'Must display exact 13 dòng');
assert(out13.includes('btn-toggle-code'), 'Must have btn-toggle-code');
assert(out13.includes('code-collapse-overlay'), 'Must have code-collapse-overlay');

// Test 2.4: 500 lines large code block
const code500 = Array.from({length: 500}, (_, i) => `// Line ${i}: doTask(${i});`).join('\n');
const out500 = sandbox.formatMessage('```python\n' + code500 + '\n```');
assert(out500.includes('500 dòng'), 'Must dynamically calculate 500 dòng');
assert(out500.includes('is-collapsible collapsed'), 'Large block must be collapsed');

// Test 2.5: Line endings CRLF, CR, LF
const crlfCode = 'line1\r\nline2\r\nline3\r\nline4\r\nline5\r\nline6\r\nline7\r\nline8\r\nline9\r\nline10\r\nline11\r\nline12\r\nline13\r\nline14';
const outCrlf = sandbox.formatMessage('```text\n' + crlfCode + '\n```');
assert(outCrlf.includes('14 dòng'), 'CRLF line endings must be accurately parsed as 14 lines');

// Test 2.6: XSS & HTML escaping in data-code and code display
const xssCode = '<script>alert("XSS & test > 10 < 20");</script>\n"quotes" & \'single\'\n' + Array.from({length: 12}, (_, i) => `// ${i}`).join('\n');
const outXss = sandbox.formatMessage('```html\n' + xssCode + '\n```');
assert(outXss.includes('&lt;script&gt;alert(&quot;XSS &amp; test &gt; 10 &lt; 20&quot;);&lt;/script&gt;'), 'HTML must be escaped in pre code');
const copyDataMatch = outXss.match(/btn-copy-code[^>]*data-code="([^"]+)"/);
assert(copyDataMatch, 'Must have encoded data-code');
assert.strictEqual(decodeURIComponent(copyDataMatch[1]).trim(), xssCode.trim(), 'Decoded data-code must exactly preserve raw unescaped code string');

console.log('  [+] Clean: Dynamic line counting, CRLF handling, and data-code preservation verified across all scales (0, 12, 13, 500 lines).');

// =========================================================================
// 3. THINKING ACCORDION PARSING & STREAMING STATES
// =========================================================================
console.log('\n[Phase 3] Thinking Accordion Tag Parsing & Streaming Logic...');

// Test 3.1: Closed thinking tag (case-insensitive)
const thoughtClosed = sandbox.formatMessage('<thought>\nPhân tích bài toán:\n- Bước 1\n- Bước 2\n- Bước 3\n</thought>\nĐây là câu trả lời.');
assert(thoughtClosed.includes('thinking-block-wrapper is-collapsed'), 'Closed thought must have is-collapsed');
assert(thoughtClosed.includes('4 dòng suy luận'), 'Must calculate 4 lines of thought');
assert(thoughtClosed.includes('Quá trình suy nghĩ'), 'Must have default badge text');
assert(thoughtClosed.includes('style="display: none;"'), 'Closed body must be hidden');
assert(thoughtClosed.includes('Đây là câu trả lời.'), 'Preserves outer message');

// Test 3.2: Open streaming thinking tag
const thoughtStreaming = sandbox.formatMessage('<think>Đang tổng hợp dữ liệu...', true);
assert(thoughtStreaming.includes('thinking-block-wrapper is-streaming is-open'), 'Streaming thought must be open');
assert(thoughtStreaming.includes('is-pulsing'), 'Streaming badge must have pulsing animation');
assert(thoughtStreaming.includes('Đang suy nghĩ...'), 'Streaming badge text');
assert(thoughtStreaming.includes('style="display: block;"'), 'Streaming body must be visible');

// Test 3.3: Open non-streaming thinking tag (truncated thought)
const thoughtTruncated = sandbox.formatMessage('<think>Suy nghĩ dang dở nhưng stream đã tắt', false);
assert(thoughtTruncated.includes('thinking-block-wrapper is-collapsed'), 'Truncated thought without stream active should be collapsed');

console.log('  [+] Clean: Thinking block parsing behaves authentically in both closed, streaming, and truncated modes.');

// =========================================================================
// 4. REAL DOM EVENT HANDLERS EXECUTION
// =========================================================================
console.log('\n[Phase 4] Dynamic DOM Event Handlers Execution Simulation...');

// Create a realistic DOM environment
function createMockDomTree(htmlString) {
  const nodeMap = new Map();
  let idCounter = 1;

  function makeNode(tag = 'div') {
    const node = {
      _id: idCounter++,
      tagName: tag.toUpperCase(),
      className: '',
      classList: {
        _set: new Set(),
        add(...names) { names.forEach(n => n.split(/\s+/).forEach(c => c && this._set.add(c))); this._sync(); },
        remove(...names) { names.forEach(n => n.split(/\s+/).forEach(c => c && this._set.delete(c))); this._sync(); },
        contains(n) { return this._set.has(n); },
        toggle(n) {
          if (this._set.has(n)) { this._set.delete(n); this._sync(); return false; }
          this._set.add(n); this._sync(); return true;
        },
        _sync() { node.className = Array.from(this._set).join(' '); }
      },
      attributes: new Map(),
      setAttribute(k, v) { this.attributes.set(k, String(v)); },
      getAttribute(k) { return this.attributes.get(k) || null; },
      hasAttribute(k) { return this.attributes.has(k); },
      children: [],
      parentElement: null,
      style: {},
      innerHTML: '',
      textContent: '',
      title: '',
      closest(selector) {
        let curr = this;
        while (curr) {
          if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) return curr;
          if (curr.tagName.toLowerCase() === selector.toLowerCase()) return curr;
          curr = curr.parentElement;
        }
        return null;
      },
      querySelector(selector) {
        const parts = selector.split(',').map(s => s.trim());
        for (const child of this.children) {
          for (const sel of parts) {
            if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) return child;
            if (child.tagName.toLowerCase() === sel.toLowerCase()) return child;
          }
          const nested = child.querySelector(selector);
          if (nested) return nested;
        }
        return null;
      },
      querySelectorAll(selector) {
        const res = [];
        for (const child of this.children) {
          if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) res.push(child);
          res.push(...child.querySelectorAll(selector));
        }
        return res;
      }
    };
    return node;
  }

  // Build minimal hierarchy for Code Block Wrapper
  const wrapper = makeNode('div');
  wrapper.classList.add('code-block-wrapper', 'is-collapsible', 'collapsed');

  const header = makeNode('div');
  header.classList.add('code-block-header');
  wrapper.children.push(header);
  header.parentElement = wrapper;

  const btnCopy = makeNode('button');
  btnCopy.classList.add('btn-copy-code');
  btnCopy.setAttribute('data-code', encodeURIComponent('console.log("Copied from test!");'));
  const copyIcon = makeNode('span');
  copyIcon.classList.add('material-icons-round');
  copyIcon.textContent = 'content_copy';
  btnCopy.children.push(copyIcon);
  copyIcon.parentElement = btnCopy;
  wrapper.children.push(btnCopy);
  btnCopy.parentElement = wrapper;

  const pre = makeNode('pre');
  const codeEl = makeNode('code');
  codeEl.textContent = 'console.log("Copied from test!");';
  pre.children.push(codeEl);
  codeEl.parentElement = pre;
  wrapper.children.push(pre);
  pre.parentElement = wrapper;

  const overlay = makeNode('div');
  overlay.classList.add('code-fade-overlay', 'code-collapse-overlay');
  wrapper.children.push(overlay);
  overlay.parentElement = wrapper;

  const btnToggle = makeNode('button');
  btnToggle.classList.add('btn-code-collapse-toggle', 'btn-toggle-code');
  btnToggle.innerHTML = '<span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span>';
  wrapper.children.push(btnToggle);
  btnToggle.parentElement = wrapper;

  const btnArtifact = makeNode('button');
  btnArtifact.classList.add('btn-preview-artifact');
  wrapper.children.push(btnArtifact);
  btnArtifact.parentElement = wrapper;

  // Build minimal hierarchy for Thinking Block Wrapper
  const thinkingWrapper = makeNode('div');
  thinkingWrapper.classList.add('thinking-block-wrapper', 'is-collapsed');

  const thinkingHeader = makeNode('div');
  thinkingHeader.classList.add('thinking-header');
  thinkingHeader.setAttribute('aria-expanded', 'false');

  const thinkingToggleIcon = makeNode('span');
  thinkingToggleIcon.classList.add('material-icons-round', 'thinking-toggle-icon');
  thinkingToggleIcon.textContent = 'expand_more';
  thinkingHeader.children.push(thinkingToggleIcon);
  thinkingToggleIcon.parentElement = thinkingHeader;

  thinkingWrapper.children.push(thinkingHeader);
  thinkingHeader.parentElement = thinkingWrapper;

  const thinkingBody = makeNode('div');
  thinkingBody.classList.add('thinking-body');
  thinkingBody.style.display = 'none';
  thinkingWrapper.children.push(thinkingBody);
  thinkingBody.parentElement = thinkingWrapper;

  return { wrapper, btnToggle, overlay, btnCopy, btnArtifact, thinkingWrapper, thinkingHeader, thinkingToggleIcon, thinkingBody };
}

// Load handlers into VM with DOM mock
const dom = createMockDomTree();
let copiedClipboardText = null;
let openedArtifactContent = null;
let toastMessage = null;

const handlerSandbox = {
  window: {},
  copyText: (text) => { copiedClipboardText = text; },
  toast: (msg, type) => { toastMessage = { msg, type }; },
  setTimeout: (fn, delay) => { fn(); },
  decodeURIComponent: decodeURIComponent
};
handlerSandbox.window.openArtifact = (content) => { openedArtifactContent = content; };

vm.createContext(handlerSandbox);

// Extract handler implementations from app.js
const toggleCodeFn = appJs.slice(appJs.indexOf('function toggleCodeBlock(btnOrOverlay) {'), appJs.indexOf('window.toggleCodeBlock = toggleCodeBlock;'));
const toggleThinkingFn = appJs.slice(appJs.indexOf('function toggleThinkingBlock(headerEl) {'), appJs.indexOf('window.toggleThinkingBlock = toggleThinkingBlock;'));
const copyCodeFn = appJs.slice(appJs.indexOf('window.copyCodeBlock = function(button) {'), appJs.indexOf('window.openArtifactFromCodeBlock = function(button) {'));
const openArtifactFn = appJs.slice(appJs.indexOf('window.openArtifactFromCodeBlock = function(button) {'), appJs.indexOf('window.readAloudMessage = function(idx) {'));

vm.runInContext(toggleCodeFn + '\n' + toggleThinkingFn + '\n' + copyCodeFn + '\n' + openArtifactFn, handlerSandbox);

// Test 4.1: toggleCodeBlock via Toggle Button
assert.strictEqual(dom.wrapper.classList.contains('collapsed'), true);
handlerSandbox.toggleCodeBlock(dom.btnToggle);
assert.strictEqual(dom.wrapper.classList.contains('is-expanded'), true, 'Wrapper must gain is-expanded');
assert.strictEqual(dom.wrapper.classList.contains('collapsed'), false, 'Wrapper must lose collapsed');
assert.ok(dom.btnToggle.innerHTML.includes('Thu gọn'), 'Toggle button text must say Thu gọn');
assert.ok(dom.btnToggle.innerHTML.includes('unfold_less'), 'Toggle icon must change to unfold_less');

// Toggle back
handlerSandbox.toggleCodeBlock(dom.btnToggle);
assert.strictEqual(dom.wrapper.classList.contains('is-expanded'), false);
assert.strictEqual(dom.wrapper.classList.contains('collapsed'), true);
assert.ok(dom.btnToggle.innerHTML.includes('Mở rộng mã nguồn'));
assert.ok(dom.btnToggle.innerHTML.includes('unfold_more'));

// Test 4.2: toggleCodeBlock via Fade Overlay
handlerSandbox.toggleCodeBlock(dom.overlay);
assert.strictEqual(dom.wrapper.classList.contains('is-expanded'), true, 'Overlay click must expand block');

// Test 4.3: copyCodeBlock from collapsed or expanded state
handlerSandbox.window.copyCodeBlock(dom.btnCopy);
assert.strictEqual(copiedClipboardText, 'console.log("Copied from test!");', 'copyCodeBlock must copy exact decoded content');

// Test 4.4: openArtifactFromCodeBlock
handlerSandbox.window.openArtifactFromCodeBlock(dom.btnArtifact);
assert.strictEqual(openedArtifactContent, 'console.log("Copied from test!");', 'openArtifactFromCodeBlock must pass full code to window.openArtifact');

// Test 4.5: toggleThinkingBlock
assert.strictEqual(dom.thinkingWrapper.classList.contains('is-collapsed'), true);
handlerSandbox.toggleThinkingBlock(dom.thinkingHeader);
assert.strictEqual(dom.thinkingWrapper.classList.contains('is-open'), true, 'Thinking wrapper must open');
assert.strictEqual(dom.thinkingBody.style.display, 'block', 'Thinking body style display must be block');
assert.strictEqual(dom.thinkingToggleIcon.textContent, 'expand_less', 'Toggle icon must be expand_less');
assert.strictEqual(dom.thinkingHeader.getAttribute('aria-expanded'), 'true');

handlerSandbox.toggleThinkingBlock(dom.thinkingHeader);
assert.strictEqual(dom.thinkingWrapper.classList.contains('is-collapsed'), true, 'Thinking wrapper must collapse');
assert.strictEqual(dom.thinkingBody.style.display, 'none', 'Thinking body style display must be none');
assert.strictEqual(dom.thinkingToggleIcon.textContent, 'expand_more', 'Toggle icon must be expand_more');
assert.strictEqual(dom.thinkingHeader.getAttribute('aria-expanded'), 'false');

console.log('  [+] Clean: Dynamic DOM event handlers toggle classes, update icons, aria attributes, clipboard, and artifact modal faithfully.');

// =========================================================================
// 5. CSS RULES & VISUAL HYGIENE
// =========================================================================
console.log('\n[Phase 5] CSS Rules, Transitions, and Hygiene...');

assert.ok(stylesCss.includes('max-height: 260px;'), 'CSS must define max-height 260px for collapsed code block');
assert.ok(stylesCss.includes('max-height: 10000px;'), 'CSS must define max-height for expanded code block');
assert.ok(stylesCss.includes('cubic-bezier(0.2, 0.8, 0.2, 1)'), 'CSS must use smooth cubic-bezier curve');
assert.ok(stylesCss.includes('thinking-badge-pulse'), 'CSS must define thinking-badge-pulse keyframe');
assert.ok(stylesCss.includes('body.light-mode .code-block-wrapper'), 'CSS must provide light-mode styling for code blocks');

console.log('  [+] Clean: CSS rules adhere to high-end Zen design with proper transitions and light mode support.');

// =========================================================================
// 6. MULTI-BLOCK & PLACEHOLDER COLLISION STRESS TESTING
// =========================================================================
console.log('\n[Phase 6] Multi-Block & Markdown Placeholder Integrity Stress Testing...');

const multiBlockMessage = `
Dưới đây là 3 khối mã nguồn và 1 khối suy nghĩ:
<think>
Suy luận bước 1
Suy luận bước 2
</think>

Khối 1 (ngắn - 4 dòng):
\`\`\`javascript
const a = 1;
const b = 2;
const c = a + b;
console.log(c);
\`\`\`

Khối 2 (dài - 16 dòng):
\`\`\`html
` + Array.from({length: 16}, (_, i) => `<p>Item ${i}</p>`).join('\n') + `
\`\`\`

Khối 3 (trung bình - 8 dòng):
\`\`\`css
.card {
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  color: #333;
  margin-bottom: 12px;
}
\`\`\`
`;

const multiFormatted = sandbox.formatMessage(multiBlockMessage);

// Verify that thinking block is parsed
assert.ok(multiFormatted.includes('thinking-block-wrapper is-collapsed'), 'Thinking block must be parsed');
assert.ok(multiFormatted.includes('2 dòng suy luận'), 'Thinking block line count');

// Verify Block 1: NOT collapsible, 4 dòng
assert.ok(multiFormatted.includes('4 dòng'), 'Block 1 must have 4 dòng badge');

// Verify Block 2: IS collapsible, 16 dòng
assert.ok(multiFormatted.includes('16 dòng'), 'Block 2 must have 16 dòng badge');

// Verify Block 3: NOT collapsible, 8 dòng
assert.ok(multiFormatted.includes('8 dòng'), 'Block 3 must have 8 dòng badge');

// Verify only 1 is-collapsible block was created
const collapsibleCount = (multiFormatted.match(/class="code-block-wrapper is-collapsible collapsed"/g) || []).length;
assert.strictEqual(collapsibleCount, 1, 'Exactly one block (the 16-line block) must be collapsible');

// Verify no leftover placeholders in output
assert.strictEqual(/%%SUNA_PLACEHOLDER_\d+%%/.test(multiFormatted), false, 'No unreplaced placeholder tokens should remain');

console.log('  [+] Clean: Multi-block messages resolve independently without token collision or placeholder leaks.');

console.log('\n==================================================================');
console.log('>>> VERDICT: 100% CLEAN — ZERO INTEGRITY VIOLATIONS DETECTED <<<');
console.log('==================================================================\n');
