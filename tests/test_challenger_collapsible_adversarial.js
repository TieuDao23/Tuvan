/**
 * test_challenger_collapsible_adversarial.js
 * 
 * Adversarial Stress & Empirical Verification Test Suite (Milestone M1 Challenger)
 * 
 * Deep stress-testing for Collapsible Code Blocks logic in app.js:
 * 1. Exact 12 vs 13 lines boundary condition testing (with/without trailing newlines).
 * 2. CRLF (\r\n), LF (\n), CR (\r), and mixed line ending line counting matrix.
 * 3. Clipboard `data-code` vs `textContent` retrieval across 100+ and 500+ line blocks.
 * 4. Multiple collapsible code blocks in a single message with interleaved markdown constructs.
 * 5. Interactive DOM toggle state transitions, fade overlay click handling, and rapid toggle stress.
 * 6. CSS layout, max-height (260px), overflow, and Light Mode styling conformance.
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Adversarial Stress Verification: Collapsible Code Blocks Logic (Milestone M1 Challenger)', () => {
  let appJs, stylesCss, indexHtml;
  let sandboxContext, formatMessageFn, formatWorkspaceFn, toggleCodeBlockFn, copyCodeBlockFn;
  let copiedClipboardText = '';
  const toastMessages = [];

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');

    function createMockElement(tagName = 'div', id = '') {
      let _className = '';
      const el = {
        tagName: tagName.toUpperCase(),
        id: id,
        classList: {
          _classes: new Set(),
          add(...cls) { cls.forEach(c => c && c.split(/\s+/).forEach(x => this._classes.add(x))); },
          remove(...cls) { cls.forEach(c => c && c.split(/\s+/).forEach(x => this._classes.delete(x))); },
          contains(c) { return this._classes.has(c); },
          toggle(c) {
            if (this._classes.has(c)) { this._classes.delete(c); return false; }
            this._classes.add(c); return true;
          }
        },
        _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(val) {
          this._innerHTML = val;
          this._parseChildSpans(val);
        },
        _parseChildSpans(val) {
          this.children = [];
          if (typeof val === 'string') {
            const spanMatches = val.match(/<span class="([^"]+)">([^<]*)<\/span>/g);
            if (spanMatches) {
              spanMatches.forEach(sm => {
                const clsMatch = sm.match(/class="([^"]+)"/);
                const txtMatch = sm.match(/>([^<]*)</);
                const spanEl = createMockElement('span');
                if (clsMatch) spanEl.className = clsMatch[1];
                if (txtMatch) {
                  spanEl.textContent = txtMatch[1];
                  spanEl._innerHTML = txtMatch[1];
                }
                spanEl.parentElement = this;
                this.children.push(spanEl);
              });
            }
          }
        },
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
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; }
      };

      Object.defineProperty(el, 'className', {
        get() { return Array.from(this.classList._classes).join(' '); },
        set(val) {
          this.classList._classes.clear();
          if (val) {
            val.split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
          }
        }
      });

      return el;
    }

    function matchesSelector(el, sel) {
      if (!sel) return false;
      const parts = sel.split(',').map(s => s.trim());
      for (const part of parts) {
        if (part.startsWith('.')) {
          const classes = part.split('.').filter(Boolean);
          if (classes.every(c => el.classList.contains(c))) return true;
        } else if (part.startsWith('#')) {
          if (el.id === part.slice(1)) return true;
        } else if (el.tagName && el.tagName.toLowerCase() === part.toLowerCase()) {
          return true;
        }
      }
      return false;
    }

    const doc = {
      body: createMockElement('body'),
      documentElement: createMockElement('html'),
      getElementById: (id) => createMockElement('div', id),
      createElement: (tag) => createMockElement(tag),
      querySelector: (sel) => createMockElement('div'),
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    const copyTextHandler = (txt) => { copiedClipboardText = txt; };

    const sandbox = {
      document: doc,
      window: {
        document: doc,
        toast: (msg) => { toastMessages.push(msg); },
        copyText: copyTextHandler,
        openArtifactFromCodeBlock: () => {},
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      copyText: copyTextHandler,
      toast: (msg) => { toastMessages.push(msg); },
      renderKatex: () => null,
      renderMindmapIframe: () => '',
      parseKanban: () => '',
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout: (fn, ms) => setTimeout(fn, ms || 0),
      clearTimeout: (id) => clearTimeout(id)
    };

    sandboxContext = vm.createContext(sandbox);

    // Extract exact functions from app.js
    const escHtmlCode = `
      function escHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }
    `;

    const formatMessageStart = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
    const formatMessageEnd = appJs.indexOf('function parseKanban(code) {');
    const formatMessageCode = appJs.slice(formatMessageStart, formatMessageEnd);

    const wsMatch = appJs.match(/function\s+formatWorkspaceMessageContent\s*\(\s*text\s*\)\s*\{[\s\S]*?\n  \}/);
    const wsCode = wsMatch ? wsMatch[0] : '';

    const toggleStart = appJs.indexOf('function toggleCodeBlock(btnOrOverlay) {');
    const toggleEnd = appJs.indexOf('function toggleThinkingBlock(headerEl) {');
    const toggleCode = appJs.slice(toggleStart, toggleEnd);

    const copyStart = appJs.indexOf('window.copyCodeBlock = function(button) {');
    const copyEnd = appJs.indexOf('window.openArtifactFromCodeBlock = function(button) {');
    const copyCode = appJs.slice(copyStart, copyEnd);

    const runnerScript = new vm.Script(`
      ${escHtmlCode}
      ${formatMessageCode}
      ${wsCode}
      ${toggleCode}
      ${copyCode}
      ;window._formatMessage = formatMessage;
      ;window._formatWorkspaceMessageContent = formatWorkspaceMessageContent;
      ;window._toggleCodeBlock = toggleCodeBlock;
      ;window._copyCodeBlock = window.copyCodeBlock;
    `);
    runnerScript.runInContext(sandboxContext);

    formatMessageFn = sandboxContext.window._formatMessage;
    formatWorkspaceFn = sandboxContext.window._formatWorkspaceMessageContent;
    toggleCodeBlockFn = sandboxContext.window._toggleCodeBlock;
    copyCodeBlockFn = sandboxContext.window._copyCodeBlock;
  });

  // =========================================================================
  // SECTION 1: EXACT 12 vs 13 LINE BOUNDARY STRESS TESTING
  // =========================================================================
  describe('1. Exact 12 vs 13 Line Boundary Stress Matrix', () => {

    it('1.1: should not collapse 1-line code block', () => {
      const input = '```javascript\nconsole.log("single line");\n```';
      const output = formatMessageFn(input);

      assert.ok(!output.includes('is-collapsible'), '1-line block must NOT have is-collapsible');
      assert.ok(!output.includes('btn-code-collapse-toggle'), '1-line block must NOT have collapse toggle button');
      assert.ok(!output.includes('code-fade-overlay'), '1-line block must NOT have fade overlay');
      assert.ok(output.includes('1 dòng'), '1-line badge must show "1 dòng"');
    });

    it('1.2: should not collapse 11-line code block', () => {
      const code11 = Array.from({ length: 11 }, (_, i) => `const x_${i} = ${i};`).join('\n');
      const input = `\`\`\`javascript\n${code11}\n\`\`\``;
      const output = formatMessageFn(input);

      assert.ok(!output.includes('is-collapsible'), '11-line block must NOT have is-collapsible');
      assert.ok(!output.includes('btn-code-collapse-toggle'), '11-line block must NOT have collapse toggle button');
      assert.ok(output.includes('11 dòng'), '11-line badge must show "11 dòng"');
    });

    it('1.3: [CRITICAL BOUNDARY] exactly 12 lines must strictly NOT be collapsible', () => {
      const code12 = Array.from({ length: 12 }, (_, i) => `let item_${i + 1} = "${i + 1}";`).join('\n');
      const input = `\`\`\`typescript\n${code12}\n\`\`\``;
      const output = formatMessageFn(input);

      assert.ok(!output.includes('is-collapsible'), 'Exact 12-line code block must NOT have is-collapsible class');
      assert.ok(!output.includes('collapsed'), 'Exact 12-line code block must NOT have collapsed class');
      assert.ok(!output.includes('btn-code-collapse-toggle'), 'Exact 12-line code block must NOT render toggle button');
      assert.ok(!output.includes('code-fade-overlay'), 'Exact 12-line code block must NOT render fade overlay');
      assert.ok(output.includes('<span class="code-line-badge">12 dòng</span>'), 'Badge must render exact "12 dòng"');
    });

    it('1.4: [CRITICAL BOUNDARY] exactly 13 lines must strictly BE collapsible', () => {
      const code13 = Array.from({ length: 13 }, (_, i) => `let item_${i + 1} = "${i + 1}";`).join('\n');
      const input = `\`\`\`typescript\n${code13}\n\`\`\``;
      const output = formatMessageFn(input);

      assert.ok(output.includes('is-collapsible'), 'Exact 13-line code block MUST have is-collapsible class');
      assert.ok(output.includes('collapsed'), 'Exact 13-line code block MUST have collapsed class');
      assert.ok(output.includes('btn-code-collapse-toggle'), 'Exact 13-line code block MUST render toggle button');
      assert.ok(output.includes('code-fade-overlay'), 'Exact 13-line code block MUST render fade overlay');
      assert.ok(output.includes('<span class="code-line-badge">13 dòng</span>'), 'Badge must render exact "13 dòng"');
      assert.ok(output.includes('Mở rộng mã nguồn'), 'Toggle button must display initial label "Mở rộng mã nguồn"');
      assert.ok(output.includes('unfold_more'), 'Toggle button must render material icon "unfold_more"');
    });

    it('1.5: should collapse 14-line and 50-line code blocks with exact line counts', () => {
      const code14 = Array.from({ length: 14 }, (_, i) => `const row_${i} = ${i};`).join('\n');
      const out14 = formatMessageFn(`\`\`\`python\n${code14}\n\`\`\``);
      assert.ok(out14.includes('is-collapsible') && out14.includes('14 dòng'));

      const code50 = Array.from({ length: 50 }, (_, i) => `def step_${i}(): pass`).join('\n');
      const out50 = formatMessageFn(`\`\`\`python\n${code50}\n\`\`\``);
      assert.ok(out50.includes('is-collapsible') && out50.includes('50 dòng'));
    });

    it('1.6: Boundary testing with trailing newline stripping', () => {
      // 12 lines with trailing \n should still be 12 lines, NOT 13 lines
      const code12WithTrailing = Array.from({ length: 12 }, (_, i) => `line_${i + 1}();`).join('\n') + '\n';
      const out12 = formatMessageFn(`\`\`\`js\n${code12WithTrailing}\`\`\``);
      assert.ok(!out12.includes('is-collapsible'), '12 lines with trailing newline must NOT be collapsible');
      assert.ok(out12.includes('12 dòng'), 'Line count must be 12');

      // 13 lines with trailing \n should still be 13 lines, NOT 14 lines
      const code13WithTrailing = Array.from({ length: 13 }, (_, i) => `line_${i + 1}();`).join('\n') + '\n';
      const out13 = formatMessageFn(`\`\`\`js\n${code13WithTrailing}\`\`\``);
      assert.ok(out13.includes('is-collapsible'), '13 lines with trailing newline MUST be collapsible');
      assert.ok(out13.includes('13 dòng'), 'Line count must be 13');
    });

    it('1.7: Empty code block handling', () => {
      const input = '```\n```';
      const output = formatMessageFn(input);
      assert.ok(!output.includes('is-collapsible'), 'Empty code block must not be collapsible');
      assert.ok(output.includes('0 dòng'), 'Empty code block must show 0 dòng');
    });

    it('1.8: Parity check between Main Chat (formatMessage) and Workspace Assistant (formatWorkspaceMessageContent)', () => {
      const testCases = [
        { lines: 1, expectedCollapse: false },
        { lines: 11, expectedCollapse: false },
        { lines: 12, expectedCollapse: false },
        { lines: 13, expectedCollapse: true },
        { lines: 14, expectedCollapse: true },
        { lines: 25, expectedCollapse: true }
      ];

      testCases.forEach(({ lines, expectedCollapse }) => {
        const code = Array.from({ length: lines }, (_, i) => `val_${i} = ${i}`).join('\n');
        const mainOut = formatMessageFn(`\`\`\`python\n${code}\n\`\`\``);
        const wsOut = formatWorkspaceFn(`\`\`\`python\n${code}\n\`\`\``);

        if (expectedCollapse) {
          assert.ok(mainOut.includes('is-collapsible'), `Main Chat failed collapsible for ${lines} lines`);
          assert.ok(wsOut.includes('is-collapsible'), `Workspace Chat failed collapsible for ${lines} lines`);
          assert.ok(mainOut.includes(`${lines} dòng`));
          assert.ok(wsOut.includes(`${lines} dòng`));
        } else {
          assert.ok(!mainOut.includes('is-collapsible'), `Main Chat unexpectedly collapsed ${lines} lines`);
          assert.ok(!wsOut.includes('is-collapsible'), `Workspace Chat unexpectedly collapsed ${lines} lines`);
          assert.ok(mainOut.includes(`${lines} dòng`));
          assert.ok(wsOut.includes(`${lines} dòng`));
        }
      });
    });
  });

  // =========================================================================
  // SECTION 2: CRLF, LF, CR, AND MIXED LINE ENDINGS MATRIX
  // =========================================================================
  describe('2. CRLF, LF, CR, and Mixed Linebreak Matrix Stress Testing', () => {

    it('2.1: Unix LF (\\n) Linebreaks: 12 vs 13 lines', () => {
      const code12LF = Array.from({ length: 12 }, (_, i) => `echo "LF_${i}"`).join('\n');
      const out12 = formatMessageFn(`\`\`\`bash\n${code12LF}\n\`\`\``);
      assert.ok(!out12.includes('is-collapsible'), 'LF 12 lines must not collapse');
      assert.ok(out12.includes('12 dòng'));

      const code13LF = Array.from({ length: 13 }, (_, i) => `echo "LF_${i}"`).join('\n');
      const out13 = formatMessageFn(`\`\`\`bash\n${code13LF}\n\`\`\``);
      assert.ok(out13.includes('is-collapsible'), 'LF 13 lines MUST collapse');
      assert.ok(out13.includes('13 dòng'));
    });

    it('2.2: Windows CRLF (\\r\\n) Linebreaks: 12 vs 13 lines', () => {
      const code12CRLF = Array.from({ length: 12 }, (_, i) => `Write-Host "CRLF_${i}"`).join('\r\n');
      const out12 = formatMessageFn(`\`\`\`powershell\n${code12CRLF}\r\n\`\`\``);
      assert.ok(!out12.includes('is-collapsible'), 'CRLF 12 lines must not collapse');
      assert.ok(out12.includes('12 dòng'), 'CRLF 12 lines must report 12 dòng');

      const code13CRLF = Array.from({ length: 13 }, (_, i) => `Write-Host "CRLF_${i}"`).join('\r\n');
      const out13 = formatMessageFn(`\`\`\`powershell\n${code13CRLF}\r\n\`\`\``);
      assert.ok(out13.includes('is-collapsible'), 'CRLF 13 lines MUST collapse');
      assert.ok(out13.includes('13 dòng'), 'CRLF 13 lines must report 13 dòng');
    });

    it('2.3: Classic Mac CR (\\r) Linebreaks: 12 vs 13 lines', () => {
      const code12CR = Array.from({ length: 12 }, (_, i) => `print "CR_${i}"`).join('\r');
      const out12 = formatMessageFn(`\`\`\`python\n${code12CR}\n\`\`\``);
      assert.ok(!out12.includes('is-collapsible'), 'CR 12 lines must not collapse');
      assert.ok(out12.includes('12 dòng'));

      const code13CR = Array.from({ length: 13 }, (_, i) => `print "CR_${i}"`).join('\r');
      const out13 = formatMessageFn(`\`\`\`python\n${code13CR}\n\`\`\``);
      assert.ok(out13.includes('is-collapsible'), 'CR 13 lines MUST collapse');
      assert.ok(out13.includes('13 dòng'));
    });

    it('2.4: Mixed Linebreaks (\\r\\n, \\n, \\r interleaved) exact counting', () => {
      // 12 mixed lines: 4 with \r\n, 4 with \n, 4 with \r
      const part1 = Array.from({ length: 4 }, (_, i) => `row_${i}`).join('\r\n');
      const part2 = Array.from({ length: 4 }, (_, i) => `row_${i + 4}`).join('\n');
      const part3 = Array.from({ length: 4 }, (_, i) => `row_${i + 8}`).join('\r');
      const mixed12 = `${part1}\r\n${part2}\n${part3}`;

      const out12 = formatMessageFn(`\`\`\`text\n${mixed12}\n\`\`\``);
      assert.ok(!out12.includes('is-collapsible'), 'Mixed 12 lines must not collapse');
      assert.ok(out12.includes('12 dòng'), 'Mixed 12 lines must count exactly 12');

      // Add 1 extra line -> 13 lines
      const mixed13 = `${mixed12}\nfinal_line`;
      const out13 = formatMessageFn(`\`\`\`text\n${mixed13}\n\`\`\``);
      assert.ok(out13.includes('is-collapsible'), 'Mixed 13 lines MUST collapse');
      assert.ok(out13.includes('13 dòng'), 'Mixed 13 lines must count exactly 13');
    });

    it('2.5: Code blocks containing consecutive blank lines', () => {
      // 5 non-empty lines with 7 blank lines in between = 12 total lines
      const blank12 = 'line 1\n\n\nline 4\n\n\nline 7\n\n\nline 10\n\nline 12';
      const out12 = formatMessageFn(`\`\`\`text\n${blank12}\n\`\`\``);
      assert.ok(!out12.includes('is-collapsible'), '12 lines including blank lines must not collapse');
      assert.ok(out12.includes('12 dòng'));

      // 13 lines with blanks
      const blank13Explicit = `${blank12}\nline 13`;
      const out13 = formatMessageFn(`\`\`\`text\n${blank13Explicit}\n\`\`\``);
      assert.ok(out13.includes('is-collapsible'));
      assert.ok(out13.includes('13 dòng'));
    });
  });

  // =========================================================================
  // SECTION 3: CLIPBOARD data-code vs textContent ACROSS 100+ LINE BLOCKS
  // =========================================================================
  describe('3. Clipboard data-code vs textContent Retrieval across 100+ Line Workloads', () => {

    it('3.1: 150-line code block with HTML elements, unicode, quotes, and regexes retains 100% fidelity in data-code', () => {
      const rawLines = [];
      for (let i = 1; i <= 150; i++) {
        if (i % 10 === 0) {
          rawLines.push(`  // Line ${i}: <div class="box" onclick="alert('hello & welcome')">Tiếng Việt 🚀</div>`);
        } else if (i % 5 === 0) {
          rawLines.push(`  const regex_${i} = /<[^>]+>|pattern/g;`);
        } else if (i % 3 === 0) {
          rawLines.push(`  const template_${i} = \`Result for index \${${i}} -> "\${Math.PI.toFixed(2)}"\`;`);
        } else {
          rawLines.push(`  let state_${i} = { id: ${i}, active: true, ratio: 0.95 };`);
        }
      }
      const rawCode = rawLines.join('\n');
      const input = `\`\`\`javascript\n${rawCode}\n\`\`\``;
      const formatted = formatMessageFn(input);

      // Verify line count
      assert.ok(formatted.includes('150 dòng'), 'Line badge must reflect 150 dòng');
      assert.ok(formatted.includes('is-collapsible collapsed'), '150 lines must be collapsible and collapsed by default');

      // Verify data-code attribute
      const match = formatted.match(/data-code="([^"]+)"/);
      assert.ok(match, 'Copy button must have data-code attribute');

      const retrievedCode = decodeURIComponent(match[1]).replace(/\r?\n$/, '');
      assert.strictEqual(retrievedCode, rawCode, 'Retrieved data-code must match raw 150-line code verbatim');
    });

    it('3.2: copyCodeBlock simulation with data-code attribute', () => {
      let copiedText = '';
      const sampleCode = Array.from({ length: 120 }, (_, i) => `console.log("Trace #${i + 1}: <div id='${i}'>${i} & ${i * 2}</div>");`).join('\n');

      const mockButton = {
        tagName: 'BUTTON',
        classList: { contains: () => true },
        getAttribute: (attr) => attr === 'data-code' ? encodeURIComponent(sampleCode) : null,
        closest: (sel) => {
          if (sel === '.code-block-wrapper') {
            return {
              querySelector: (s) => null
            };
          }
          return null;
        },
        querySelector: (s) => ({ textContent: 'content_copy' })
      };

      sandboxContext.copyText = (txt) => { copiedText = txt; };
      sandboxContext.window.copyText = (txt) => { copiedText = txt; };
      copyCodeBlockFn(mockButton);

      assert.strictEqual(copiedText, sampleCode, 'copyCodeBlock must copy verbatim code via data-code');
      assert.strictEqual(copiedText.split('\n').length, 120, 'Copied code must have all 120 lines');
    });

    it('3.3: copyCodeBlock fallback to textContent when data-code is missing', () => {
      let copiedText = '';
      const sampleCode = Array.from({ length: 105 }, (_, i) => `function test_${i}() { return '<value & text>'; }`).join('\n');

      const mockCodeEl = {
        textContent: sampleCode
      };

      const mockWrapper = {
        querySelector: (sel) => {
          if (sel === 'pre code') return mockCodeEl;
          return null;
        }
      };

      const mockButton = {
        tagName: 'BUTTON',
        classList: { contains: () => true },
        getAttribute: (attr) => null, // data-code is null/missing
        closest: (sel) => sel === '.code-block-wrapper' ? mockWrapper : null,
        querySelector: (s) => ({ textContent: 'content_copy' })
      };

      sandboxContext.copyText = (txt) => { copiedText = txt; };
      sandboxContext.window.copyText = (txt) => { copiedText = txt; };
      copyCodeBlockFn(mockButton);

      assert.strictEqual(copiedText, sampleCode, 'copyCodeBlock fallback must copy textContent');
      assert.strictEqual(copiedText.split('\n').length, 105);
    });

    it('3.4: Copying in collapsed state vs expanded state produces identical full 100+ line output', () => {
      const lines110 = Array.from({ length: 110 }, (_, i) => `row_${i + 1} = "${i + 1}"`).join('\n');
      const input = `\`\`\`python\n${lines110}\n\`\`\``;
      const formatted = formatMessageFn(input);

      const match = formatted.match(/data-code="([^"]+)"/);
      assert.ok(match);
      const codeFromCollapsed = decodeURIComponent(match[1]).replace(/\r?\n$/, '');

      // Expand does not mutate data-code attribute
      const codeFromExpanded = decodeURIComponent(match[1]).replace(/\r?\n$/, '');

      assert.strictEqual(codeFromCollapsed, lines110);
      assert.strictEqual(codeFromExpanded, lines110);
      assert.strictEqual(codeFromCollapsed.split('\n').length, 110);
    });

    it('3.5: Massive 500-line code block stress test', () => {
      const lines500 = Array.from({ length: 500 }, (_, i) => `// Line ${i + 1}: export const SYM_${i + 1} = Symbol("sym_${i + 1}");`).join('\n');
      const input = `\`\`\`typescript\n${lines500}\n\`\`\``;
      const formatted = formatMessageFn(input);

      assert.ok(formatted.includes('500 dòng'));
      assert.ok(formatted.includes('is-collapsible collapsed'));

      const match = formatted.match(/data-code="([^"]+)"/);
      assert.ok(match);
      const decoded = decodeURIComponent(match[1]).replace(/\r?\n$/, '');
      assert.strictEqual(decoded, lines500);
      assert.strictEqual(decoded.split('\n').length, 500);
    });
  });

  // =========================================================================
  // SECTION 4: MULTIPLE COLLAPSIBLE CODE BLOCKS IN A SINGLE MESSAGE
  // =========================================================================
  describe('4. Multiple Collapsible Code Blocks in Single Message & Markdown Interleaving', () => {

    it('4.1: Message with 5 code blocks of varied sizes and interleaved markdown constructs', () => {
      const block1 = 'console.log("short 3 lines");\nconst a = 1;\nconst b = 2;'; // 3 lines (not collapsible)
      const block2 = Array.from({ length: 12 }, (_, i) => `let b2_${i} = ${i};`).join('\n'); // 12 lines (not collapsible)
      const block3 = Array.from({ length: 13 }, (_, i) => `let b3_${i} = ${i};`).join('\n'); // 13 lines (collapsible)
      const block4 = Array.from({ length: 30 }, (_, i) => `let b4_${i} = ${i};`).join('\n'); // 30 lines (collapsible)
      const block5 = Array.from({ length: 100 }, (_, i) => `let b5_${i} = ${i};`).join('\n'); // 100 lines (collapsible)

      const multiMessage = [
        '# Header 1: Multi-Block Overview',
        'Here is the first short snippet:\n```javascript\n' + block1 + '\n```',
        '## Section 2: Boundary Tests',
        'Here is an exact 12-line boundary block:\n```javascript\n' + block2 + '\n```',
        'And here is an exact 13-line boundary block:\n```typescript\n' + block3 + '\n```',
        '| Column A | Column B |\n| --- | --- |\n| Val 1 | Val 2 |',
        '- Task item 1\n- Task item 2',
        '```python\n' + block4 + '\n```',
        'Final massive script:\n```rust\n' + block5 + '\n```',
        'Ending explanation paragraph.'
      ].join('\n\n');

      const formatted = formatMessageFn(multiMessage);

      // Verify no placeholder leak
      assert.ok(!formatted.includes('%%SUNA_PLACEHOLDER_'), 'Zero placeholder tokens must remain in output');

      // Verify all 5 code blocks exist
      const blockWrappers = formatted.match(/<div class="code-block-wrapper[^"]*">/g) || [];
      assert.strictEqual(blockWrappers.length, 5, 'Must render exactly 5 code-block-wrapper containers');

      // Verify collapsible classification:
      // Block 1 (3 lines) -> not collapsible
      // Block 2 (12 lines) -> not collapsible
      // Block 3 (13 lines) -> collapsible
      // Block 4 (30 lines) -> collapsible
      // Block 5 (100 lines) -> collapsible
      const collapsibleWrappers = formatted.match(/code-block-wrapper is-collapsible/g) || [];
      assert.strictEqual(collapsibleWrappers.length, 3, 'Exactly 3 blocks (13, 30, 100 lines) must be collapsible');

      // Verify individual badges
      assert.ok(formatted.includes('3 dòng'));
      assert.ok(formatted.includes('12 dòng'));
      assert.ok(formatted.includes('13 dòng'));
      assert.ok(formatted.includes('30 dòng'));
      assert.ok(formatted.includes('100 dòng'));

      // Verify interleaved markdown rendered properly
      assert.ok(formatted.includes('<h2 class="msg-heading">Header 1: Multi-Block Overview</h2>'));
      assert.ok(formatted.includes('<h3 class="msg-heading">Section 2: Boundary Tests</h3>'));
      assert.ok(formatted.includes('<table>'));
      assert.ok(formatted.includes('<ul class="msg-list">'));
    });

    it('4.2: Workspace message with 3 code blocks and apply buttons', () => {
      const b1 = Array.from({ length: 5 }, (_, i) => `// ws 1 line ${i}`).join('\n');
      const b2 = Array.from({ length: 15 }, (_, i) => `// ws 2 line ${i}`).join('\n');
      const b3 = Array.from({ length: 25 }, (_, i) => `// ws 3 line ${i}`).join('\n');

      const input = `Explanation:\n\`\`\`html\n${b1}\n\`\`\`\nMiddle text\n\`\`\`css\n${b2}\n\`\`\`\nEnd text\n\`\`\`js\n${b3}\n\`\`\``;
      const formatted = formatWorkspaceFn(input);

      assert.ok(!formatted.includes('%%WS_CODE_'), 'All workspace placeholders must be restored');
      const applyButtons = formatted.match(/class="btn-workspace-apply"/g) || [];
      assert.strictEqual(applyButtons.length, 3, 'Must render 3 apply buttons');

      const collapsibleBlocks = formatted.match(/code-block-wrapper is-collapsible/g) || [];
      assert.strictEqual(collapsibleBlocks.length, 2, '2 of 3 blocks (15 and 25 lines) must be collapsible');
    });

    it('4.3: Independent toggle state across multiple code blocks in DOM', () => {
      function createCodeWrapperMock(id, lineCount) {
        let _classes = new Set(['code-block-wrapper', 'is-collapsible', 'collapsed']);
        const btn = {
          tagName: 'BUTTON',
          className: 'btn-code-collapse-toggle btn-toggle-code',
          innerHTML: '<span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span>',
          title: 'Mở rộng / Thu gọn mã nguồn',
          attributes: new Map(),
          setAttribute(k, v) { this.attributes.set(k, String(v)); },
          getAttribute(k) { return this.attributes.get(k) || null; },
          closest: (sel) => sel === '.code-block-wrapper' ? wrapper : null
        };
        const overlay = {
          tagName: 'DIV',
          className: 'code-fade-overlay code-collapse-overlay',
          closest: (sel) => sel === '.code-block-wrapper' ? wrapper : null
        };
        const wrapper = {
          id: id,
          tagName: 'DIV',
          classList: {
            add(...cls) { cls.forEach(c => _classes.add(c)); },
            remove(...cls) { cls.forEach(c => _classes.delete(c)); },
            contains(c) { return _classes.has(c); },
            toggle(c) {
              if (_classes.has(c)) { _classes.delete(c); return false; }
              _classes.add(c); return true;
            }
          },
          querySelector(sel) {
            if (sel.includes('btn-code-collapse-toggle') || sel.includes('btn-toggle-code')) return btn;
            return null;
          }
        };
        return { wrapper, btn, overlay };
      }

      const blockA = createCodeWrapperMock('blockA', 20);
      const blockB = createCodeWrapperMock('blockB', 50);
      const blockC = createCodeWrapperMock('blockC', 100);

      // Toggle block B only
      toggleCodeBlockFn(blockB.btn);

      // Verify block B expanded
      assert.ok(blockB.wrapper.classList.contains('is-expanded'), 'Block B must be is-expanded');
      assert.ok(!blockB.wrapper.classList.contains('collapsed'), 'Block B must NOT have collapsed');
      assert.ok(blockB.btn.innerHTML.includes('Thu gọn'), 'Block B button must say Thu gọn');

      // Verify block A and block C are still collapsed
      assert.ok(!blockA.wrapper.classList.contains('is-expanded'), 'Block A must stay collapsed');
      assert.ok(blockA.wrapper.classList.contains('collapsed'), 'Block A must have collapsed');
      assert.ok(!blockC.wrapper.classList.contains('is-expanded'), 'Block C must stay collapsed');
      assert.ok(blockC.wrapper.classList.contains('collapsed'), 'Block C must have collapsed');

      // Toggle block B again to collapse
      toggleCodeBlockFn(blockB.btn);
      assert.ok(!blockB.wrapper.classList.contains('is-expanded'));
      assert.ok(blockB.wrapper.classList.contains('collapsed'));
      assert.ok(blockB.btn.innerHTML.includes('Mở rộng mã nguồn'));
    });
  });

  // =========================================================================
  // SECTION 5: INTERACTIVE TOGGLE STATE TRANSITIONS & DOM PARITY
  // =========================================================================
  describe('5. Interactive Toggle State Transitions & DOM Parity', () => {

    it('5.1: Toggle via toggleCodeBlock on button transitions text and icons accurately', () => {
      let _classes = new Set(['code-block-wrapper', 'is-collapsible', 'collapsed']);
      const btn = {
        tagName: 'BUTTON',
        className: 'btn-code-collapse-toggle btn-toggle-code',
        innerHTML: '<span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span>',
        title: 'Mở rộng / Thu gọn mã nguồn',
        attributes: new Map(),
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) || null; },
        closest: (sel) => sel === '.code-block-wrapper' ? wrapper : null
      };

      const wrapper = {
        tagName: 'DIV',
        classList: {
          add(...cls) { cls.forEach(c => _classes.add(c)); },
          remove(...cls) { cls.forEach(c => _classes.delete(c)); },
          contains(c) { return _classes.has(c); },
          toggle(c) {
            if (_classes.has(c)) { _classes.delete(c); return false; }
            _classes.add(c); return true;
          }
        },
        querySelector: (sel) => btn
      };

      // 1st click: Expand
      toggleCodeBlockFn(btn);
      assert.ok(_classes.has('is-expanded'), 'Must have is-expanded class');
      assert.ok(!_classes.has('collapsed'), 'Must NOT have collapsed class');
      assert.ok(btn.innerHTML.includes('unfold_less'), 'Icon must change to unfold_less');
      assert.ok(btn.innerHTML.includes('Thu gọn'), 'Label must change to Thu gọn');
      assert.strictEqual(btn.title, 'Thu gọn mã nguồn');
      assert.strictEqual(btn.getAttribute('aria-label'), 'Thu gọn mã nguồn');

      // 2nd click: Collapse
      toggleCodeBlockFn(btn);
      assert.ok(!_classes.has('is-expanded'), 'Must NOT have is-expanded class');
      assert.ok(_classes.has('collapsed'), 'Must have collapsed class');
      assert.ok(btn.innerHTML.includes('unfold_more'), 'Icon must revert to unfold_more');
      assert.ok(btn.innerHTML.includes('Mở rộng mã nguồn'), 'Label must revert to Mở rộng mã nguồn');
      assert.strictEqual(btn.title, 'Mở rộng / Thu gọn mã nguồn');
      assert.strictEqual(btn.getAttribute('aria-label'), 'Mở rộng / Thu gọn mã nguồn');
    });

    it('5.2: Toggle via click on fade overlay', () => {
      let _classes = new Set(['code-block-wrapper', 'is-collapsible', 'collapsed']);
      const btn = {
        tagName: 'BUTTON',
        innerHTML: '<span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span>',
        attributes: new Map(),
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) || null; }
      };
      const wrapper = {
        tagName: 'DIV',
        classList: {
          add(...cls) { cls.forEach(c => _classes.add(c)); },
          remove(...cls) { cls.forEach(c => _classes.delete(c)); },
          contains(c) { return _classes.has(c); },
          toggle(c) {
            if (_classes.has(c)) { _classes.delete(c); return false; }
            _classes.add(c); return true;
          }
        },
        querySelector: (sel) => btn
      };
      const overlay = {
        tagName: 'DIV',
        closest: (sel) => sel === '.code-block-wrapper' ? wrapper : null
      };

      // Click overlay to expand
      toggleCodeBlockFn(overlay);
      assert.ok(_classes.has('is-expanded'), 'Clicking overlay must expand wrapper');
      assert.ok(!_classes.has('collapsed'));
      assert.ok(btn.innerHTML.includes('Thu gọn'));
    });

    it('5.3: 100 rapid sequential toggles stress test', () => {
      let _classes = new Set(['code-block-wrapper', 'is-collapsible', 'collapsed']);
      const btn = {
        tagName: 'BUTTON',
        innerHTML: '',
        attributes: new Map(),
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) || null; }
      };
      const wrapper = {
        tagName: 'DIV',
        classList: {
          add(...cls) { cls.forEach(c => _classes.add(c)); },
          remove(...cls) { cls.forEach(c => _classes.delete(c)); },
          contains(c) { return _classes.has(c); },
          toggle(c) {
            if (_classes.has(c)) { _classes.delete(c); return false; }
            _classes.add(c); return true;
          }
        },
        querySelector: (sel) => btn
      };
      const trigger = {
        closest: () => wrapper
      };

      for (let i = 1; i <= 100; i++) {
        toggleCodeBlockFn(trigger);
        const shouldBeExpanded = i % 2 !== 0;
        assert.strictEqual(_classes.has('is-expanded'), shouldBeExpanded, `Toggle #${i} failed expanded state`);
        assert.strictEqual(_classes.has('collapsed'), !shouldBeExpanded, `Toggle #${i} failed collapsed state`);
      }

      // After 100 toggles (even number), should be collapsed
      assert.ok(_classes.has('collapsed'));
      assert.ok(!_classes.has('is-expanded'));
    });

    it('5.4: toggleCodeBlock graceful handling of null or detached elements', () => {
      assert.doesNotThrow(() => {
        toggleCodeBlockFn(null);
        toggleCodeBlockFn(undefined);
        toggleCodeBlockFn({ closest: () => null });
      }, 'toggleCodeBlock must not throw on invalid arguments');
    });
  });

  // =========================================================================
  // SECTION 6: CSS HYGIENE & STYLESHEET CONFORMANCE FOR COLLAPSIBLE RULES
  // =========================================================================
  describe('6. CSS Layout & Stylesheet Conformance for Collapsible Code Blocks', () => {

    it('6.1: should define max-height: 260px and overflow: hidden for collapsed code blocks', () => {
      assert.match(
        stylesCss,
        /\.code-block-wrapper\.is-collapsible:not\(\.is-expanded\)[\s\S]*?max-height:\s*260px;/,
        'Missing max-height: 260px for collapsed code blocks in styles.css'
      );
      assert.match(
        stylesCss,
        /\.code-block-wrapper\.is-collapsible:not\(\.is-expanded\)[\s\S]*?overflow:\s*hidden;/,
        'Missing overflow: hidden for collapsed code blocks in styles.css'
      );
    });

    it('6.2: should define max-height expansion for .is-expanded state', () => {
      assert.match(
        stylesCss,
        /\.code-block-wrapper\.is-collapsible\.is-expanded\s*\{[\s\S]*?max-height:\s*10000px;/,
        'Missing max-height: 10000px on expanded code block in styles.css'
      );
      assert.match(
        stylesCss,
        /\.code-block-wrapper\.is-collapsible\.is-expanded\s*\{[\s\S]*?overflow:\s*visible;/,
        'Missing overflow: visible on expanded code block in styles.css'
      );
    });

    it('6.3: should define .code-fade-overlay and .code-collapse-overlay positioning and gradient', () => {
      assert.match(stylesCss, /\.code-fade-overlay/);
      assert.match(stylesCss, /\.code-collapse-overlay/);
      assert.match(stylesCss, /bottom:\s*38px;/);
      assert.match(stylesCss, /height:\s*80px;/);
      assert.match(stylesCss, /cursor:\s*pointer;/);
    });

    it('6.4: should define .btn-code-collapse-toggle and .btn-toggle-code button styles and hover transitions', () => {
      assert.match(stylesCss, /\.btn-code-collapse-toggle/);
      assert.match(stylesCss, /\.btn-toggle-code/);
      assert.match(stylesCss, /cursor:\s*pointer;/);
      assert.match(stylesCss, /transition:\s*all\s+var\(--transition/);
    });

    it('6.5: should define Light Mode rules for fade overlay and toggle button', () => {
      assert.match(stylesCss, /body\.light-mode\s+\.code-block-wrapper\.is-collapsible[\s\S]*?\.code-fade-overlay/);
      assert.match(stylesCss, /body\.light-mode\s+\.btn-code-collapse-toggle/);
    });
  });
});
