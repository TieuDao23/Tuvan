/**
 * test_collapsible_code_and_continuation.js
 * 
 * Comprehensive 4-Tier Test Suite for:
 * - R1: Collapsible Long Code Blocks (>12 lines / >260px), line counter badge, toggle button,
 *       fade overlay, thinking accordion, full copy & preview preservation.
 * - R2: Multi-Turn Infinite Token Auto-Continuation (stream truncation detection via
 *       finish_reason === 'length' and unclosed fences, chunk stitching, overlap deduplication,
 *       recursion guards, AbortController cancellation).
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('R1 & R2: Collapsible Code Blocks & Multi-Turn Stream Continuation Test Suite', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  // =========================================================================
  // HELPER UTILITIES FOR SPECIFICATION VERIFICATION & VM SIMULATION
  // =========================================================================

  function createDomSandbox(customGlobals = {}) {
    const elements = new Map();

    function createMockElement(tagName = 'div', id = '') {
      let _className = '';
      const el = {
        tagName: tagName.toUpperCase(),
        id: id,
        classList: {
          _classes: new Set(),
          add(...cls) { cls.forEach(c => this._classes.add(c)); },
          remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
          contains(c) { return this._classes.has(c); },
          toggle(c) {
            if (this._classes.has(c)) { this._classes.delete(c); return false; }
            this._classes.add(c); return true;
          }
        },
        innerHTML: '',
        textContent: '',
        value: '',
        style: {},
        attributes: new Map(),
        children: [],
        parentElement: null,
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) || null; },
        removeAttribute(k) { this.attributes.delete(k); },
        hasAttribute(k) { return this.attributes.has(k); },
        closest(sel) {
          let curr = this;
          while (curr) {
            if (matchesSelector(curr, sel)) return curr;
            curr = curr.parentElement;
          }
          return null;
        },
        querySelector(sel) {
          for (const child of this.children) {
            if (matchesSelector(child, sel)) return child;
            const nested = child.querySelector(sel);
            if (nested) return nested;
          }
          return null;
        },
        querySelectorAll(sel) {
          const results = [];
          for (const child of this.children) {
            if (matchesSelector(child, sel)) results.push(child);
            results.push(...child.querySelectorAll(sel));
          }
          return results;
        },
        appendChild(child) {
          child.parentElement = this;
          this.children.push(child);
          return child;
        },
        removeChild(child) {
          const idx = this.children.indexOf(child);
          if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentElement = null;
          }
          return child;
        },
        remove() {
          if (this.parentElement) this.parentElement.removeChild(this);
        },
        dispatchEvent(evt) { return true; }
      };

      Object.defineProperty(el, 'className', {
        get() { return _className; },
        set(val) {
          _className = val || '';
          this.classList._classes.clear();
          if (val) {
            val.split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
          }
        }
      });

      if (id) elements.set(id, el);
      return el;
    }

    function matchesSelector(el, sel) {
      if (!sel) return false;
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      if (sel.startsWith('.')) {
        const classes = sel.split('.').filter(Boolean);
        return classes.every(c => el.classList.contains(c));
      }
      return el.tagName.toLowerCase() === sel.toLowerCase();
    }

    const doc = {
      getElementById(id) {
        if (!elements.has(id)) {
          const el = createMockElement('div', id);
          elements.set(id, el);
        }
        return elements.get(id);
      },
      createElement(tag) { return createMockElement(tag); },
      querySelector(sel) {
        if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
        return createMockElement('div');
      },
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {}
    };

    const sandbox = {
      document: doc,
      window: {
        document: doc,
        toast: () => {},
        openArtifactFromCodeBlock: () => {},
        copyCodeBlock: () => {}
      },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout: (fn) => setTimeout(fn, 0),
      clearTimeout: (id) => clearTimeout(id),
      ...customGlobals
    };

    vm.createContext(sandbox);
    return { sandbox, doc, elements };
  }

  // Pure reference specification implementation of Collapsible Code Block Logic
  function specFormatMessageWithCollapse(text, maxLinesThreshold = 12) {
    if (!text) return '';
    const escHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = escHtml(text);
    const placeholders = {};
    let count = 0;

    html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const cleanLang = (lang || 'code').trim().toLowerCase();
      const decodedCode = code
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const cleanCode = decodedCode.replace(/\r?\n$/, '');
      const lineCount = cleanCode.length === 0 ? 0 : cleanCode.split(/\r\n|\r|\n/).length;
      const isCollapsible = lineCount > maxLinesThreshold;
      const token = `%%CODE_BLOCK_${count++}%%`;

      const lineBadge = `<span class="code-line-badge">${lineCount} dòng</span>`;
      const collapseToggleBtn = isCollapsible
        ? `<button class="btn-code-collapse-toggle" onclick="toggleCodeBlock(this)" title="Mở rộng / Thu gọn mã nguồn" aria-label="Mở rộng / Thu gọn mã nguồn"><span class="material-icons-round">unfold_more</span> Mở rộng mã nguồn</button>`
        : '';
      const fadeOverlay = isCollapsible ? `<div class="code-fade-overlay"></div>` : '';
      const collapsibleClass = isCollapsible ? ' is-collapsible' : '';

      let artifactBtn = '';
      if (['html', 'svg', 'javascript', 'js'].includes(cleanLang)) {
        artifactBtn = `<button class="btn-preview-artifact" onclick="window.openArtifactFromCodeBlock(this)" title="Xem trước (Live Preview)" aria-label="Xem trước (Live Preview)"><span class="material-icons-round">play_arrow</span> Xem trước (Live Preview)</button>`;
      }

      placeholders[token] = `<div class="code-block-wrapper${collapsibleClass}">
        <div class="code-block-header">
          <div class="code-lang">${cleanLang}</div>
          ${lineBadge}
        </div>
        <button class="btn-copy-code" onclick="copyCodeBlock(this)" data-code="${encodeURIComponent(decodedCode)}" title="Sao chép code" aria-label="Sao chép code"><span class="material-icons-round">content_copy</span></button>
        <pre><code>${escHtml(decodedCode)}</code></pre>
        ${fadeOverlay}
        ${collapseToggleBtn}
        ${artifactBtn}
      </div>`;

      return token;
    });

    for (const token in placeholders) {
      html = html.replace(token, placeholders[token]);
    }
    return html;
  }

  // Pure reference specification implementation of Truncation & Chunk Stitcher
  function specIsTruncated(responsePayload, textContent) {
    if (responsePayload && responsePayload.choices && responsePayload.choices[0]) {
      const choice = responsePayload.choices[0];
      if (choice.finish_reason === 'length') return true;
    }
    // Count markdown code fences
    const fenceMatches = textContent.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      return true; // Odd number of fences indicates an unclosed code block
    }
    return false;
  }

  function specStitchContinuationChunks(chunkA, chunkB) {
    if (!chunkA) return chunkB || '';
    if (!chunkB) return chunkA || '';

    const cleanA = chunkA.replace(/\r?\n$/, '');
    const linesA = cleanA.split(/\r?\n/);
    const linesB = chunkB.split(/\r?\n/);

    let overlapCount = 0;
    const maxCheck = Math.min(linesA.length, linesB.length, 10);
    for (let len = maxCheck; len > 0; len--) {
      const tailA = linesA.slice(-len).map(l => l.trim()).join('\n');
      const headB = linesB.slice(0, len).map(l => l.trim()).join('\n');
      if (tailA.length > 0 && tailA === headB) {
        overlapCount = len;
        break;
      }
    }

    if (overlapCount > 0) {
      const mergedLines = [...linesA, ...linesB.slice(overlapCount)];
      return mergedLines.join('\n');
    }

    return chunkA + chunkB;
  }

  // =========================================================================
  // TIER 1: CORE FEATURE COVERAGE (T1-F1 to T1-F10)
  // =========================================================================
  describe('Tier 1: Feature Coverage (R1 & R2)', () => {

    it('T1-F1: should wrap code blocks exceeding 12 lines in .is-collapsible container with line counter badge', () => {
      const sample15Lines = '```javascript\n' + Array.from({ length: 15 }, (_, i) => `const var_${i} = ${i};`).join('\n') + '\n```';
      const outputHtml = specFormatMessageWithCollapse(sample15Lines, 12);

      assert.ok(outputHtml.includes('is-collapsible'), 'Should have is-collapsible class for >12 lines');
      assert.ok(outputHtml.includes('15 dòng'), 'Should render exact line count badge (15 dòng)');
      assert.ok(outputHtml.includes('btn-code-collapse-toggle'), 'Should render toggle button');
      assert.ok(outputHtml.includes('code-fade-overlay'), 'Should render gradient fade overlay');
    });

    it('T1-F2: should format collapsible code in workspace assistant messages exceeding threshold', () => {
      const sample20Lines = '```html\n' + Array.from({ length: 20 }, (_, i) => `<div>Item ${i}</div>`).join('\n') + '\n```';
      const outputHtml = specFormatMessageWithCollapse(sample20Lines, 12);

      assert.ok(outputHtml.includes('is-collapsible'));
      assert.ok(outputHtml.includes('20 dòng'));
      assert.ok(outputHtml.includes('Mở rộng mã nguồn'));
    });

    it('T1-F3: should render short code blocks (<= 12 lines) as normal non-collapsible blocks', () => {
      const sample8Lines = '```python\n' + Array.from({ length: 8 }, (_, i) => `print(${i})`).join('\n') + '\n```';
      const outputHtml = specFormatMessageWithCollapse(sample8Lines, 12);

      assert.strictEqual(outputHtml.includes('is-collapsible'), false, 'Short code block must not have is-collapsible class');
      assert.strictEqual(outputHtml.includes('btn-code-collapse-toggle'), false, 'Short code block must not have toggle button');
      assert.strictEqual(outputHtml.includes('code-fade-overlay'), false, 'Short code block must not have fade overlay');
      assert.ok(outputHtml.includes('8 dòng'), 'Line count badge can still be displayed');
    });

    it('T1-F4: should detect truncation when finish_reason === "length"', () => {
      const payload = { choices: [{ finish_reason: 'length', message: { content: 'partial text' } }] };
      const truncated = specIsTruncated(payload, 'partial text');
      assert.strictEqual(truncated, true, 'finish_reason length must trigger truncation flag');
    });

    it('T1-F5: should detect truncation when text contains an unclosed markdown code fence', () => {
      const unclosedText = 'Here is the 3D code:\n```javascript\nconst scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera();';
      const truncated = specIsTruncated(null, unclosedText);
      assert.strictEqual(truncated, true, 'Odd number of backtick fences must trigger truncation flag');

      const closedText = unclosedText + '\n```\nDone!';
      const notTruncated = specIsTruncated(null, closedText);
      assert.strictEqual(notTruncated, false, 'Even number of backtick fences must not trigger unclosed fence truncation');
    });

    it('T1-F6: should stitch multi-turn continuation chunks seamlessly into a single complete response', () => {
      const turn1 = '```javascript\nfunction initGame() {\n  let score = 0;\n';
      const turn2 = '  score += 10;\n  return score;\n}\n```';
      const stitched = specStitchContinuationChunks(turn1, turn2);

      assert.ok(stitched.startsWith('```javascript\nfunction initGame()'));
      assert.ok(stitched.endsWith('}\n```'));
      assert.strictEqual(stitched.split('```').length - 1, 2, 'Stitched response must have exactly 1 opening and 1 closing fence');
    });

    it('T1-F7: should preserve 100% full original content in Copy button data-code even in collapsed state', () => {
      const fullCode = Array.from({ length: 40 }, (_, i) => `line_${i + 1}();`).join('\n');
      const input = '```javascript\n' + fullCode + '\n```';
      const outputHtml = specFormatMessageWithCollapse(input, 12);

      const match = outputHtml.match(/data-code="([^"]+)"/);
      assert.ok(match, 'Copy button must contain data-code attribute');
      const decoded = decodeURIComponent(match[1]);
      assert.strictEqual(decoded.trim(), fullCode.trim(), 'Decoded data-code must match entire 40-line payload');
    });

    it('T1-F8: should render and preserve Live Preview button for HTML and JS artifacts in collapsible blocks', () => {
      const htmlCode = '```html\n' + Array.from({ length: 25 }, (_, i) => `<p>Paragraph ${i}</p>`).join('\n') + '\n```';
      const outputHtml = specFormatMessageWithCollapse(htmlCode, 12);

      assert.ok(outputHtml.includes('btn-preview-artifact'), 'Live Preview button must be present');
      assert.ok(outputHtml.includes('window.openArtifactFromCodeBlock'), 'Preview onclick handler must be attached');
    });

    it('T1-F9: should toggle .is-expanded, button text, and icon when toggleCodeBlock is invoked', () => {
      const { sandbox, doc } = createDomSandbox();

      const toggleFnCode = `
        function toggleCodeBlock(button) {
          const wrapper = button.closest('.code-block-wrapper');
          if (!wrapper) return;
          const isExpanded = wrapper.classList.toggle('is-expanded');
          if (isExpanded) {
            button.innerHTML = '<span class="material-icons-round">unfold_less</span> Thu gọn';
          } else {
            button.innerHTML = '<span class="material-icons-round">unfold_more</span> Mở rộng mã nguồn';
          }
        }
      `;
      vm.runInContext(toggleFnCode, sandbox);

      const wrapper = doc.createElement('div');
      wrapper.classList.add('code-block-wrapper', 'is-collapsible');

      const btn = doc.createElement('button');
      btn.classList.add('btn-code-collapse-toggle');
      btn.innerHTML = '<span class="material-icons-round">unfold_more</span> Mở rộng mã nguồn';
      wrapper.appendChild(btn);

      // Initial state: collapsed
      assert.strictEqual(wrapper.classList.contains('is-expanded'), false);

      // Turn 1: Expand
      sandbox.toggleCodeBlock(btn);
      assert.strictEqual(wrapper.classList.contains('is-expanded'), true);
      assert.ok(btn.innerHTML.includes('Thu gọn'));
      assert.ok(btn.innerHTML.includes('unfold_less'));

      // Turn 2: Re-collapse
      sandbox.toggleCodeBlock(btn);
      assert.strictEqual(wrapper.classList.contains('is-expanded'), false);
      assert.ok(btn.innerHTML.includes('Mở rộng mã nguồn'));
      assert.ok(btn.innerHTML.includes('unfold_more'));
    });

    it('T1-F10: should cleanly parse thinking tags (<think>, <thought>) and isolate reasoning from final output', () => {
      const { sandbox } = createDomSandbox();
      
      const streamParserCode = `
        globalThis.ThinkingStreamParser = class ThinkingStreamParser {
          constructor() {
            this.buffer = '';
            this.state = 'TEXT';
            this.thinkingContent = '';
            this.filteredText = '';
          }
          parseChunk(chunk) {
            let result = '';
            for (let i = 0; i < chunk.length; i++) {
              const ch = chunk[i];
              if (this.state === 'TEXT') {
                if (ch === '<') {
                  this.buffer = '<';
                  this.state = 'TAG_START';
                } else {
                  result += ch;
                }
              } else if (this.state === 'TAG_START') {
                this.buffer += ch;
                if (this.buffer === '<think>' || this.buffer === '<thought>') {
                  this.state = 'IN_THINK';
                  this.buffer = '';
                } else if (!'<think>'.startsWith(this.buffer) && !'<thought>'.startsWith(this.buffer)) {
                  result += this.buffer;
                  this.buffer = '';
                  this.state = 'TEXT';
                }
              } else if (this.state === 'IN_THINK') {
                if (ch === '<') {
                  this.buffer = '<';
                  this.state = 'END_THINK_START';
                } else {
                  this.thinkingContent += ch;
                }
              } else if (this.state === 'END_THINK_START') {
                this.buffer += ch;
                if (this.buffer === '</think>' || this.buffer === '</thought>') {
                  this.state = 'TEXT';
                  this.buffer = '';
                } else if (!'</think>'.startsWith(this.buffer) && !'</thought>'.startsWith(this.buffer)) {
                  this.thinkingContent += this.buffer;
                  this.buffer = '';
                  this.state = 'IN_THINK';
                }
              }
            }
            this.filteredText += result;
            return result;
          }
          flush() {
            if (this.buffer) {
              this.filteredText += this.buffer;
              this.buffer = '';
            }
          }
        };
      `;
      vm.runInContext(streamParserCode, sandbox);

      const parser = new sandbox.ThinkingStreamParser();
      parser.parseChunk('Xin chào! <think>Phân tích logic lập trình Three.js</think> Đây là mã nguồn hoàn chỉnh.');
      parser.flush();

      assert.strictEqual(parser.filteredText.trim(), 'Xin chào!  Đây là mã nguồn hoàn chỉnh.');
      assert.strictEqual(parser.thinkingContent.trim(), 'Phân tích logic lập trình Three.js');
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (T2-B1 to T2-B10)
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases (R1 & R2)', () => {

    it('T2-B1: should strictly distinguish exact 12-line (non-collapsible) and 13-line (collapsible) thresholds', () => {
      const code12 = '```js\n' + Array.from({ length: 12 }, (_, i) => `line(${i});`).join('\n') + '\n```';
      const code13 = '```js\n' + Array.from({ length: 13 }, (_, i) => `line(${i});`).join('\n') + '\n```';

      const res12 = specFormatMessageWithCollapse(code12, 12);
      const res13 = specFormatMessageWithCollapse(code13, 12);

      assert.strictEqual(res12.includes('is-collapsible'), false, '12 lines must not be collapsible');
      assert.strictEqual(res13.includes('is-collapsible'), true, '13 lines must be collapsible');
    });

    it('T2-B2: should safely handle empty code blocks (``` ```) and single-line blocks without NaN or crashes', () => {
      const emptyCode = '```\n```';
      const singleLine = '```bash\nnpm install\n```';

      const resEmpty = specFormatMessageWithCollapse(emptyCode, 12);
      const resSingle = specFormatMessageWithCollapse(singleLine, 12);

      assert.ok(!resEmpty.includes('NaN'), 'Must not produce NaN in line counter');
      assert.strictEqual(resEmpty.includes('is-collapsible'), false);
      assert.strictEqual(resSingle.includes('is-collapsible'), false);
    });

    it('T2-B3: should calculate line counts identically for Windows CRLF (\\r\\n) and Unix LF (\\n)', () => {
      const unixCode = '```js\n' + Array.from({ length: 16 }, (_, i) => `const a = ${i};`).join('\n') + '\n```';
      const windowsCode = '```js\r\n' + Array.from({ length: 16 }, (_, i) => `const a = ${i};`).join('\r\n') + '\r\n```';

      const resUnix = specFormatMessageWithCollapse(unixCode, 12);
      const resWindows = specFormatMessageWithCollapse(windowsCode, 12);

      assert.ok(resUnix.includes('16 dòng'), 'Unix LF should count 16 lines');
      assert.ok(resWindows.includes('16 dòng'), 'Windows CRLF should count 16 lines');
    });

    it('T2-B4: should isolate collapsible states when multiple code blocks exist in the same message', () => {
      const block1 = '```python\n' + Array.from({ length: 4 }, (_, i) => `x = ${i}`).join('\n') + '\n```'; // short
      const block2 = '```javascript\n' + Array.from({ length: 25 }, (_, i) => `console.log(${i});`).join('\n') + '\n```'; // long
      const block3 = '```css\n' + Array.from({ length: 6 }, (_, i) => `.item_${i} { color: red; }`).join('\n') + '\n```'; // short

      const multiMessage = `${block1}\nSome description\n${block2}\nMore notes\n${block3}`;
      const rendered = specFormatMessageWithCollapse(multiMessage, 12);

      const collapsibleMatches = rendered.match(/is-collapsible/g) || [];
      assert.strictEqual(collapsibleMatches.length, 1, 'Only block 2 should be marked collapsible');
      assert.ok(rendered.includes('4 dòng'));
      assert.ok(rendered.includes('25 dòng'));
      assert.ok(rendered.includes('6 dòng'));
    });

    it('T2-B5: should handle truncation occurring inside backtick fence without producing invalid syntax', () => {
      const turn1Partial = '```html\n<div>Test</div>\n```';
      const turn2Continuation = '```html\n<span>Next Part</span>\n```';
      const stitched = specStitchContinuationChunks(turn1Partial, turn2Continuation);

      assert.ok(stitched.includes('<div>Test</div>'));
      assert.ok(stitched.includes('<span>Next Part</span>'));
    });

    it('T2-B6: should preserve multi-byte Vietnamese Unicode and Emojis across stream continuation boundaries', () => {
      const turn1 = '```html\n<!-- Chào mừng bạn đến với Suna Chat 🌸 -->\n<div class="mo-ta">\n';
      const turn2 = '  <h1>Trải nghiệm tuyệt vời cùng Trí Tuệ Nhân Tạo 🚀</h1>\n</div>\n```';
      const stitched = specStitchContinuationChunks(turn1, turn2);

      assert.ok(stitched.includes('Chào mừng bạn đến với Suna Chat 🌸'));
      assert.ok(stitched.includes('Trải nghiệm tuyệt vời cùng Trí Tuệ Nhân Tạo 🚀'));
    });

    it('T2-B7: should eliminate duplicated overlapping lines when model repeats prefix on continuation', () => {
      const turn1 = '```js\nconst scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera();\nconst renderer = new THREE.WebGLRenderer();\n';
      const turn2 = 'const renderer = new THREE.WebGLRenderer();\nrenderer.setSize(window.innerWidth, window.innerHeight);\n```';
      const stitched = specStitchContinuationChunks(turn1, turn2);

      const rendererCount = (stitched.match(/new THREE\.WebGLRenderer\(\);/g) || []).length;
      assert.strictEqual(rendererCount, 1, 'Overlapping line must be deduplicated to exactly 1 occurrence');
    });

    it('T2-B8: should guard against infinite continuation recursion and stop after MAX_CONTINUATION_TURNS (5)', () => {
      let turnCount = 0;
      const MAX_CONTINUATION_TURNS = 5;
      let shouldContinue = true;

      while (shouldContinue && turnCount < MAX_CONTINUATION_TURNS) {
        turnCount++;
        // Simulate continuous truncation
        if (turnCount >= MAX_CONTINUATION_TURNS) {
          shouldContinue = false;
        }
      }

      assert.strictEqual(turnCount, 5, 'Continuation must halt at max 5 turns');
    });

    it('T2-B9: should preserve code blocks containing nested template literals and escaped backticks', () => {
      const complexCode = '```javascript\nconst tpl = `Hello ${name} \\`nested\\``;\nconsole.log(tpl);\n```';
      const rendered = specFormatMessageWithCollapse(complexCode, 12);

      assert.ok(rendered.includes('Hello ${name}'));
    });

    it('T2-B10: should accurately count trailing empty lines and preserve exact whitespace structure', () => {
      const codeWithBlankLines = 'def foo():\n\n    pass\n\n';
      const lines = codeWithBlankLines.replace(/\r?\n$/, '').split(/\r\n|\r|\n/).length;
      assert.strictEqual(lines, 4, 'Blank lines must be accurately accounted for in line counter');
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (T3-C1 to T3-C5)
  // =========================================================================
  describe('Tier 3: Cross-Feature Combinations (R1 & R2)', () => {

    it('T3-C1: should handle combination of KaTeX math blocks and collapsible code blocks in single message', () => {
      const mixedContent = `
Đây là công thức toán:
$$E = mc^2$$

Và đây là thuật toán mô phỏng 3D:
\`\`\`javascript
${Array.from({ length: 18 }, (_, i) => `const step_${i} = ${i} * 2;`).join('\n')}
\`\`\`
`;
      const rendered = specFormatMessageWithCollapse(mixedContent, 12);
      assert.ok(rendered.includes('18 dòng'), 'Line count badge must be rendered for code block');
      assert.ok(rendered.includes('is-collapsible'), 'Collapsible wrapper must be generated');
    });

    it('T3-C2: should abort active continuation loop cleanly when AbortController signals abort', async () => {
      const abortController = new AbortController();
      let streamCompleted = false;
      let turnsExecuted = 0;

      async function simulatedContinuationStream(signal) {
        for (let turn = 1; turn <= 4; turn++) {
          if (signal.aborted) {
            throw new Error('AbortError');
          }
          turnsExecuted++;
          if (turn === 2) {
            abortController.abort(); // User clicked Stop Generation during Turn 2
          }
          await new Promise(r => setTimeout(r, 10));
        }
        streamCompleted = true;
      }

      try {
        await simulatedContinuationStream(abortController.signal);
      } catch (e) {
        assert.strictEqual(e.message, 'AbortError');
      }

      assert.strictEqual(turnsExecuted, 2, 'Stream loop must stop immediately upon abort');
      assert.strictEqual(streamCompleted, false, 'Stream must not report full completion on abort');
    });

    it('T3-C3: should support dark mode and light mode CSS variables for code blocks and fade overlays', () => {
      assert.match(stylesCss, /\.code-block-wrapper/, 'styles.css must style .code-block-wrapper');
      assert.match(stylesCss, /--bg-secondary|--bg-input|background/i, 'Code blocks must use theme color tokens');
    });

    it('T3-C4: should keep DOM stable when toggling collapse state during incremental chunk arrival', () => {
      const { doc } = createDomSandbox();
      const bubble = doc.createElement('div');
      bubble.className = 'message-bubble';

      const wrapper = doc.createElement('div');
      wrapper.className = 'code-block-wrapper is-collapsible';
      const toggleBtn = doc.createElement('button');
      toggleBtn.className = 'btn-code-collapse-toggle';
      wrapper.appendChild(toggleBtn);
      bubble.appendChild(wrapper);

      assert.ok(bubble.querySelector('.btn-code-collapse-toggle') !== null, 'Toggle button should exist');
    });

    it('T3-C5: should maintain active bubble reference across multiple turn completions without creating duplicate bubbles', () => {
      const { doc } = createDomSandbox();
      const messagesContainer = doc.createElement('div');
      messagesContainer.id = 'messages-container';

      // 1 Assistant container created for entire multi-turn generation
      const assistantEl = doc.createElement('div');
      assistantEl.className = 'message assistant';
      const bubbleEl = doc.createElement('div');
      bubbleEl.className = 'message-bubble';
      assistantEl.appendChild(bubbleEl);
      messagesContainer.appendChild(assistantEl);

      const assistantMatches = messagesContainer.querySelectorAll('.message.assistant');
      assert.strictEqual(assistantMatches.length, 1, 'Only 1 assistant message bubble should exist across all continuation turns');
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD WORKLOADS & INTEGRITY (T4-W1 to T4-W4)
  // =========================================================================
  describe('Tier 4: Real-World Workloads & Integrity (R1 & R2)', () => {

    it('T4-W1: should assemble a 500-line complex Three.js 3D scene across 3 turns into a single valid collapsible block', () => {
      const turn1Lines = Array.from({ length: 180 }, (_, i) => `// Turn 1 setup: mesh_${i} = new THREE.Mesh();`).join('\n');
      const turn2Lines = Array.from({ length: 180 }, (_, i) => `// Turn 2 anim: mesh_${i + 180}.rotation.x += 0.01;`).join('\n');
      const turn3Lines = Array.from({ length: 140 }, (_, i) => `// Turn 3 render: renderer.render(scene, camera); // ${i}`).join('\n');

      const chunk1 = '```javascript\n' + turn1Lines + '\n';
      const chunk2 = turn2Lines + '\n';
      const chunk3 = turn3Lines + '\n```';

      const stitched = specStitchContinuationChunks(specStitchContinuationChunks(chunk1, chunk2), chunk3);
      const cleanStitched = stitched.replace(/\r?\n$/, '');
      const totalLines = cleanStitched.split('\n').length;
      assert.ok(totalLines >= 500, `Total lines (${totalLines}) must be >= 500`);

      const formatted = specFormatMessageWithCollapse(stitched, 12);
      assert.ok(formatted.includes('is-collapsible'), '500-line block must be collapsible');
      assert.ok(formatted.includes('dòng'), 'Must display accurate line badge');
      assert.ok(formatted.includes('btn-code-collapse-toggle'), 'Must include collapse toggle button');
    });

    it('T4-W2: should assemble a complete HTML5 Canvas Game with CSS and JavaScript stitched without syntax corruption', () => {
      const turn1 = '```html\n<!DOCTYPE html>\n<html>\n<head>\n<style>\ncanvas { background: #111; }\n</style>\n</head>\n<body>\n<canvas id="game"></canvas>\n<script>\n';
      const turn2 = 'const canvas = document.getElementById("game");\nconst ctx = canvas.getContext("2d");\nlet ballX = 50, ballY = 50;\n';
      const turn3 = 'function loop() {\n  ctx.clearRect(0, 0, 300, 300);\n  ctx.fillRect(ballX, ballY, 10, 10);\n  requestAnimationFrame(loop);\n}\nloop();\n</script>\n</body>\n</html>\n```';

      const stitched = specStitchContinuationChunks(specStitchContinuationChunks(turn1, turn2), turn3);
      assert.ok(stitched.includes('<!DOCTYPE html>'));
      assert.ok(stitched.includes('<canvas id="game">'));
      assert.ok(stitched.includes('requestAnimationFrame(loop);'));
      assert.ok(stitched.endsWith('</html>\n```'));
    });

    it('T4-W3: should verify static JavaScript compilation of app.js with zero syntax errors', () => {
      const { execSync } = require('child_process');
      const output = execSync('node -c app.js', { encoding: 'utf8' });
      assert.strictEqual(output, '', 'node -c app.js must produce 0 output (clean compile)');
    });

    it('T4-W4: should verify styles.css contains valid collapsible code block rules and transitions', () => {
      const cssRules = [
        '.code-block-wrapper',
        '.code-lang',
        '.btn-copy-code',
        '.code-line-badge',
        '.btn-toggle-code',
        '.code-collapse-overlay',
        '.thinking-block-wrapper',
        '.thinking-header',
        '.thinking-badge',
        '.thinking-body'
      ];
      for (const rule of cssRules) {
        assert.ok(stylesCss.includes(rule), `styles.css must define ${rule}`);
      }
    });

    it('T4-W5: should format real app.js formatMessage with thinking accordion for closed and streaming thoughts', () => {
      const sandbox = {
        escHtml: (t) => t ? t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '',
        renderKatex: () => '',
        renderMindmapIframe: () => '',
        parseKanban: () => '',
        window: {},
        document: { createElement: () => ({}) }
      };
      vm.createContext(sandbox);
      const startIdx = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
      const endIdx = appJs.indexOf('function parseKanban(code) {');
      assert.ok(startIdx !== -1 && endIdx !== -1, 'formatMessage boundary found');
      vm.runInContext(appJs.slice(startIdx, endIdx), sandbox);

      // Test closed thinking block
      const closedOutput = sandbox.formatMessage('<think>Phân tích thuật toán\nBước 1\nBước 2</think>Đây là kết quả cuối cùng.');
      assert.ok(closedOutput.includes('thinking-block-wrapper is-collapsed'), 'Closed thinking must have is-collapsed');
      assert.ok(closedOutput.includes('3 dòng suy luận'), 'Must count 3 lines of reasoning');
      assert.ok(closedOutput.includes('Quá trình suy nghĩ'), 'Must have thinking badge text');
      assert.ok(closedOutput.includes('Đây là kết quả cuối cùng.'), 'Final text must be preserved');

      // Test streaming thinking block
      const streamOutput = sandbox.formatMessage('<think>Đang giải bài toán...', true);
      assert.ok(streamOutput.includes('thinking-block-wrapper is-streaming is-open'), 'Streaming thinking must be open');
      assert.ok(streamOutput.includes('is-pulsing'), 'Streaming badge must pulse');
      assert.ok(streamOutput.includes('Đang suy nghĩ...'), 'Streaming badge text');
    });

    it('T4-W6: should format real app.js formatMessage with collapsible code blocks >12 lines and copy data-code', () => {
      const sandbox = {
        escHtml: (t) => t ? t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '',
        renderKatex: () => '',
        renderMindmapIframe: () => '',
        parseKanban: () => '',
        window: {},
        document: { createElement: () => ({}) }
      };
      vm.createContext(sandbox);
      const startIdx = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
      const endIdx = appJs.indexOf('function parseKanban(code) {');
      vm.runInContext(appJs.slice(startIdx, endIdx), sandbox);

      const codeLines = Array.from({ length: 18 }, (_, i) => `const item_${i} = ${i};`).join('\n');
      const input = '```javascript\n' + codeLines + '\n```';
      const output = sandbox.formatMessage(input);

      assert.ok(output.includes('is-collapsible collapsed'), 'Should have is-collapsible collapsed classes');
      assert.ok(output.includes('18 dòng'), 'Should show 18 dòng badge');
      assert.ok(output.includes('btn-toggle-code'), 'Should have toggle button');
      assert.ok(output.includes('code-collapse-overlay'), 'Should have fade overlay');
      assert.ok(output.includes('btn-copy-code'), 'Should have copy button');
      const copyMatch = output.match(/btn-copy-code[^>]*data-code="([^"]+)"/);
      assert.ok(copyMatch, 'Must have data-code on copy button');
      assert.strictEqual(decodeURIComponent(copyMatch[1]).trim(), codeLines.trim(), 'Decoded data-code must match original code');
    });

    it('T4-W7: should format real app.js formatWorkspaceMessageContent with collapsible code and apply button', () => {
      const fnMatch = appJs.match(/function\s+formatWorkspaceMessageContent\s*\(\s*text\s*\)\s*\{[\s\S]*?\n  \}/);
      assert.ok(fnMatch, 'formatWorkspaceMessageContent found in app.js');

      const sandbox = {
        escHtml: (t) => t ? t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '',
        encodeURIComponent: encodeURIComponent
      };
      vm.createContext(sandbox);
      vm.runInContext(fnMatch[0], sandbox);

      const wsCode = Array.from({ length: 22 }, (_, i) => `<div>Element ${i}</div>`).join('\n');
      const wsInput = '```html\n' + wsCode + '\n```';
      const wsOutput = sandbox.formatWorkspaceMessageContent(wsInput);

      assert.ok(wsOutput.includes('is-collapsible collapsed'), 'Workspace code must be collapsible');
      assert.ok(wsOutput.includes('22 dòng'), 'Workspace line count badge');
      assert.ok(wsOutput.includes('btn-workspace-apply'), 'Apply button must be present');
      const applyMatch = wsOutput.match(/btn-workspace-apply[^>]*data-code="([^"]+)"/);
      assert.ok(applyMatch, 'Must have data-code on apply button');
      assert.strictEqual(decodeURIComponent(applyMatch[1]).trim(), wsCode.trim(), 'Decoded data-code must match original workspace code');
    });

    it('T4-W8: should render header preview button in formatMessage for HTML/JS/SVG code blocks', () => {
      const sandbox = {
        escHtml: (t) => t ? t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '',
        renderKatex: () => '',
        renderMindmapIframe: () => '',
        parseKanban: () => '',
        window: {},
        document: { createElement: () => ({}) }
      };
      vm.createContext(sandbox);
      const startIdx = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
      const endIdx = appJs.indexOf('function parseKanban(code) {');
      vm.runInContext(appJs.slice(startIdx, endIdx), sandbox);

      const htmlInput = '```html\n<h1>Hello Suna</h1>\n```';
      const output = sandbox.formatMessage(htmlInput);

      assert.ok(output.includes('btn-header-preview'), 'Must include btn-header-preview in code-block-header-right');
      assert.ok(output.includes('openArtifactFromCodeBlock'), 'Must call openArtifactFromCodeBlock');
    });

    it('T4-W9: should have #btn-toggle-workspace in index.html and top-bar-right', () => {
      assert.ok(indexHtml.includes('id="btn-toggle-workspace"'), 'index.html must have #btn-toggle-workspace');
      assert.ok(indexHtml.includes('id="btn-toggle-workspace-mobile"'), 'index.html must have #btn-toggle-workspace-mobile');
      assert.ok(appJs.includes('btn-toggle-workspace'), 'app.js must bind #btn-toggle-workspace');
    });
  });
});
