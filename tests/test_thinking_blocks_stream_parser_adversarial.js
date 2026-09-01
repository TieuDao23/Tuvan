/**
 * test_thinking_blocks_stream_parser_adversarial.js
 * 
 * Comprehensive 4-Tier Adversarial Test Suite for:
 * - <think> and <thought> Thinking Blocks Parser & Stream Integration in app.js
 * - Live Streaming State (isStreaming = true) vs Completed State (isStreaming = false)
 * - Incremental streaming chunk transitions & unclosed thinking tags
 * - Malformed, empty, nested, uppercase, and attribute-laden thinking tags
 * - Markdown, Code, LaTeX, and XSS isolation within thinking blocks
 * - Interactive accordion DOM toggling and CSS/Aria state verification
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Adversarial Test Suite: <think>/<thought> Blocks & Stream Parser Integrity', () => {
  let appJs, stylesCss;
  let sandbox;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');

    // Setup isolated VM DOM sandbox
    sandbox = createDomSandbox();
    vm.createContext(sandbox);

    // Extract formatMessage and toggleThinkingBlock from app.js
    const formatStart = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
    const formatEnd = appJs.indexOf('function parseKanban(code) {');
    assert.ok(formatStart !== -1 && formatEnd !== -1, 'formatMessage boundaries found in app.js');
    vm.runInContext(appJs.slice(formatStart, formatEnd), sandbox);

    const toggleStart = appJs.indexOf('function toggleThinkingBlock(headerEl) {');
    const toggleExport = 'window.toggleThinkingBlock = toggleThinkingBlock;';
    const toggleEnd = appJs.indexOf(toggleExport) + toggleExport.length;
    assert.ok(toggleStart !== -1 && appJs.indexOf(toggleExport) !== -1, 'toggleThinkingBlock boundaries found in app.js');
    vm.runInContext(appJs.slice(toggleStart, toggleEnd), sandbox);
  });

  // Mock DOM Sandbox Factory
  function createDomSandbox() {
    function escHtml(s) {
      if (!s) return '';
      return s.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
    }

    function renderKatex(math, isBlock) {
      if (!math) return '';
      return `<katex-rendered data-block="${isBlock}">${escHtml(math)}</katex-rendered>`;
    }

    function renderMindmapIframe(content) {
      return `<iframe class="mindmap-iframe" data-content="${escHtml(content)}"></iframe>`;
    }

    function parseKanban(code) {
      return `<div class="kanban-board">${escHtml(code)}</div>`;
    }

    const windowObj = {};
    const documentObj = {
      createElement: (tag) => {
        let _className = '';
        const attributes = new Map();
        const children = [];
        const el = {
          tagName: tag.toUpperCase(),
          style: {},
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
          setAttribute: (k, v) => attributes.set(k, String(v)),
          getAttribute: (k) => attributes.get(k) || null,
          removeAttribute: (k) => attributes.delete(k),
          hasAttribute: (k) => attributes.has(k),
          appendChild: (c) => { c.parentElement = el; children.push(c); return c; },
          children,
          parentElement: null,
          textContent: '',
          innerHTML: '',
          closest(sel) {
            let curr = this;
            while (curr) {
              if (matchesSel(curr, sel)) return curr;
              curr = curr.parentElement;
            }
            return null;
          },
          querySelector(sel) {
            for (const child of this.children) {
              if (matchesSel(child, sel)) return child;
              const n = child.querySelector(sel);
              if (n) return n;
            }
            return null;
          }
        };

        function matchesSel(target, sel) {
          if (!sel || !target) return false;
          if (sel.startsWith('.')) {
            const cls = sel.slice(1);
            return target.classList.contains(cls);
          }
          return false;
        }

        Object.defineProperty(el, 'className', {
          get: () => _className,
          set: (v) => {
            _className = v || '';
            el.classList._classes.clear();
            if (v) v.split(/\s+/).filter(Boolean).forEach(c => el.classList._classes.add(c));
          }
        });

        return el;
      }
    };

    return {
      escHtml,
      renderKatex,
      renderMindmapIframe,
      parseKanban,
      window: windowObj,
      document: documentObj
    };
  }

  // =========================================================================
  // TIER 1: FEATURE COVERAGE — STREAMING VS COMPLETED STATES
  // =========================================================================
  describe('Tier 1: Feature Coverage (Streaming vs Completed States)', () => {
    it('T1.1: should format closed <think> tag in completed mode (isStreaming = false)', () => {
      const input = '<think>Phân tích thuật toán\nBước 1: Khởi tạo\nBước 2: Duyệt cây</think>Kết quả hoàn tất.';
      const output = sandbox.formatMessage(input, false);

      assert.ok(output.includes('class="thinking-block-wrapper is-collapsed"'), 'Must have is-collapsed class');
      assert.ok(output.includes('data-streaming="false"'), 'data-streaming must be false');
      assert.ok(output.includes('aria-expanded="false"'), 'aria-expanded must be false');
      assert.ok(output.includes('Quá trình suy nghĩ'), 'Must display "Quá trình suy nghĩ"');
      assert.ok(!output.includes('is-pulsing'), 'Must not have is-pulsing animation when closed');
      assert.ok(output.includes('3 dòng suy luận'), 'Must count 3 reasoning lines');
      assert.ok(output.includes('expand_more'), 'Must have expand_more icon');
      assert.ok(output.includes('style="display: none;"'), 'Body must be hidden by default');
      assert.ok(output.includes('Phân tích thuật toán<br>Bước 1: Khởi tạo<br>Bước 2: Duyệt cây'), 'Content must preserve line breaks with <br>');
      assert.ok(output.includes('Kết quả hoàn tất.'), 'Rest of message must be rendered');
    });

    it('T1.2: should format closed <think> tag even when isStreaming = true as completed thinking', () => {
      const input = '<think>Đang phân tích xong</think>Đang sinh mã nguồn...';
      const output = sandbox.formatMessage(input, true);

      assert.ok(output.includes('class="thinking-block-wrapper is-collapsed"'), 'Closed block during stream must collapse');
      assert.ok(output.includes('data-streaming="false"'), 'Closed block data-streaming must be false');
      assert.ok(output.includes('Quá trình suy nghĩ'), 'Closed block badge must be "Quá trình suy nghĩ"');
      assert.ok(!output.includes('is-pulsing'), 'Closed block must not pulse');
      assert.ok(output.includes('style="display: none;"'), 'Body must be closed');
      assert.ok(output.includes('Đang sinh mã nguồn...'), 'Subsequent streaming text must be present');
    });

    it('T1.3: should format unclosed <think> tag in active streaming mode (isStreaming = true)', () => {
      const input = '<think>Đang tổng hợp dữ liệu thời gian thực...\nĐang kết nối API...';
      const output = sandbox.formatMessage(input, true);

      assert.ok(output.includes('thinking-block-wrapper is-streaming is-open'), 'Streaming unclosed block must have is-streaming is-open');
      assert.ok(output.includes('data-streaming="true"'), 'data-streaming must be true');
      assert.ok(output.includes('aria-expanded="true"'), 'aria-expanded must be true');
      assert.ok(output.includes('is-pulsing'), 'Streaming badge must have is-pulsing class');
      assert.ok(output.includes('Đang suy nghĩ...'), 'Must display active "Đang suy nghĩ..." label');
      assert.ok(output.includes('expand_less'), 'Toggle icon must be expand_less when open');
      assert.ok(output.includes('style="display: block;"'), 'Body must be visible with display: block');
      assert.ok(output.includes('2 dòng suy luận'), 'Must count 2 reasoning lines');
    });

    it('T1.4: should format unclosed <think> tag in completed mode (isStreaming = false) as collapsed fallback', () => {
      const input = '<think>Dữ liệu suy nghĩ bị ngắt dòng giữa chừng...';
      const output = sandbox.formatMessage(input, false);

      assert.ok(output.includes('thinking-block-wrapper is-collapsed'), 'Unclosed tag after stream end must collapse');
      assert.ok(output.includes('data-streaming="false"'), 'data-streaming must be false');
      assert.ok(output.includes('Quá trình suy nghĩ'), 'Label must revert to "Quá trình suy nghĩ"');
      assert.ok(!output.includes('is-pulsing'), 'Must not pulse');
      assert.ok(output.includes('expand_more'), 'Icon must be expand_more');
      assert.ok(output.includes('style="display: none;"'), 'Body must be hidden');
    });

    it('T1.5: should maintain exact parity for <thought> tag synonym across all modes', () => {
      const closedOutput = sandbox.formatMessage('<thought>Suy nghĩ 1\nSuy nghĩ 2</thought>Phản hồi.', false);
      assert.ok(closedOutput.includes('thinking-block-wrapper is-collapsed'), 'Closed <thought> must collapse');
      assert.ok(closedOutput.includes('2 dòng suy luận'), 'Must count 2 lines');

      const streamOutput = sandbox.formatMessage('<thought>Đang suy nghĩ sâu...', true);
      assert.ok(streamOutput.includes('thinking-block-wrapper is-streaming is-open'), 'Streaming <thought> must open');
      assert.ok(streamOutput.includes('Đang suy nghĩ...'), 'Streaming <thought> badge must display');
    });
  });

  // =========================================================================
  // TIER 2: INCREMENTAL STREAMING PROGRESSION & STRESS HARNESS
  // =========================================================================
  describe('Tier 2: Incremental Streaming Progression & Transition Simulation', () => {
    it('T2.1: should simulate smooth 6-step incremental token streaming from start to finish', () => {
      const streamSteps = [
        { text: '<think>', isStreaming: true, expectOpen: true, expectLines: 1 },
        { text: '<think>Bước 1: Khởi động', isStreaming: true, expectOpen: true, expectLines: 1 },
        { text: '<think>Bước 1: Khởi động\nBước 2: Tìm kiếm giải pháp', isStreaming: true, expectOpen: true, expectLines: 2 },
        { text: '<think>Bước 1: Khởi động\nBước 2: Tìm kiếm giải pháp\nBước 3: Hoàn thiện code', isStreaming: true, expectOpen: true, expectLines: 3 },
        { text: '<think>Bước 1: Khởi động\nBước 2: Tìm kiếm giải pháp\nBước 3: Hoàn thiện code</think>', isStreaming: true, expectOpen: false, expectLines: 3 },
        { text: '<think>Bước 1: Khởi động\nBước 2: Tìm kiếm giải pháp\nBước 3: Hoàn thiện code</think>\n\n# Kết quả cuối cùng\nĐây là câu trả lời.', isStreaming: false, expectOpen: false, expectLines: 3 }
      ];

      for (let i = 0; i < streamSteps.length; i++) {
        const step = streamSteps[i];
        const out = sandbox.formatMessage(step.text, step.isStreaming);

        if (step.expectOpen) {
          assert.ok(out.includes('is-streaming is-open'), `Step ${i + 1} must be open and streaming`);
          assert.ok(out.includes('data-streaming="true"'), `Step ${i + 1} data-streaming must be true`);
        } else {
          assert.ok(out.includes('is-collapsed'), `Step ${i + 1} must be collapsed`);
          assert.ok(out.includes('data-streaming="false"'), `Step ${i + 1} data-streaming must be false`);
        }

        assert.ok(out.includes(`${step.expectLines} dòng suy luận`), `Step ${i + 1} line count check failed`);
      }
    });

    it('T2.2: should process 100 rapid stream chunk updates in under 100ms without lag or memory leaks', () => {
      const start = Date.now();
      let text = '<think>Khởi tạo luồng';
      for (let i = 0; i < 100; i++) {
        text += `\nBước tính toán số ${i}`;
        const out = sandbox.formatMessage(text, true);
        assert.ok(out.includes('thinking-block-wrapper'), 'Must produce valid thinking wrapper');
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 100, `100 stream chunk formatting took ${elapsed}ms (expected < 100ms)`);
    });

    it('T2.3: should handle stream truncation abruptly mid-sentence when isStreaming flips to false', () => {
      const truncatedInput = '<think>Đang xử lý dở dang nhưng API bị timeout hoặc mất kết nối...';
      const out = sandbox.formatMessage(truncatedInput, false);

      assert.ok(out.includes('is-collapsed'), 'Truncated stream must be rendered collapsed');
      assert.ok(out.includes('style="display: none;"'), 'Truncated body must be hidden');
      assert.ok(out.includes('Quá trình suy nghĩ'), 'Must show standard badge');
      assert.ok(out.includes('Đang xử lý dở dang nhưng API bị timeout hoặc mất kết nối...'), 'Content must be preserved');
    });
  });

  // =========================================================================
  // TIER 3: MALFORMED, EMPTY, NESTED & CASE-INSENSITIVE TAGS
  // =========================================================================
  describe('Tier 3: Malformed, Empty, Nested & Edge Case Tags', () => {
    it('T3.1: should handle empty closed tags <think></think> and <thought></thought>', () => {
      const out1 = sandbox.formatMessage('<think></think>Phản hồi bình thường.', false);
      assert.ok(out1.includes('class="thinking-block-wrapper is-collapsed"'), 'Empty closed think must render');
      assert.ok(out1.includes('1 dòng suy luận'), 'Default line count must be 1');
      assert.ok(out1.includes('Phản hồi bình thường.'), 'Text after empty think must render');

      const out2 = sandbox.formatMessage('<thought></thought>Phản hồi 2.', false);
      assert.ok(out2.includes('class="thinking-block-wrapper is-collapsed"'), 'Empty closed thought must render');
    });

    it('T3.2: should handle empty unclosed tags <think> and <thought> in streaming mode', () => {
      const out1 = sandbox.formatMessage('<think>', true);
      assert.ok(out1.includes('is-streaming is-open'), 'Empty unclosed think in stream must render open');
      assert.ok(out1.includes('1 dòng suy luận'), 'Default line count 1');

      const out2 = sandbox.formatMessage('<thought>', true);
      assert.ok(out2.includes('is-streaming is-open'), 'Empty unclosed thought in stream must render open');
    });

    it('T3.3: should handle whitespace-only and newline-only thinking blocks cleanly', () => {
      const input = '<think>\n   \n\t   \n</think>Xin chào!';
      const out = sandbox.formatMessage(input, false);
      assert.ok(out.includes('1 dòng suy luận'), 'Whitespace-only content defaults to 1 line');
      assert.ok(out.includes('Xin chào!'), 'Subsequent text must be intact');
    });

    it('T3.4: should support uppercase and mixed case tags (<THINK>, <Thought>, </THINK>)', () => {
      const outUpper = sandbox.formatMessage('<THINK>Suy luận viết hoa</THINK>OK.', false);
      assert.ok(outUpper.includes('thinking-block-wrapper is-collapsed'), 'Uppercase <THINK> must be parsed');
      assert.ok(outUpper.includes('Suy luận viết hoa'), 'Content in uppercase tag must be preserved');

      const outMixed = sandbox.formatMessage('<Thought>Suy luận hỗn hợp</Thought>Đã xong.', false);
      assert.ok(outMixed.includes('thinking-block-wrapper is-collapsed'), 'Mixed case <Thought> must be parsed');
      assert.ok(outMixed.includes('Suy luận hỗn hợp'), 'Content in mixed case tag must be preserved');
    });

    it('T3.5: should accept thinking tags with arbitrary attributes (<think model="deepseek-r1">)', () => {
      const input = '<think model="r1" duration="3.5s" tokens="1200">\nPhân tích bài toán\n</think>Kết quả.';
      const out = sandbox.formatMessage(input, false);
      assert.ok(out.includes('thinking-block-wrapper is-collapsed'), 'Tag with attributes must parse successfully');
      assert.ok(out.includes('Phân tích bài toán'), 'Content must be preserved');
    });

    it('T3.6: should not match word-boundary lookalike tags (<thinking>, <thinker>, <thoughtful>)', () => {
      const input = 'Đây là thẻ <thinking>không hợp lệ</thinking> và <thoughtful>từ vựng</thoughtful>.';
      const out = sandbox.formatMessage(input, false);
      assert.ok(!out.includes('thinking-block-wrapper'), 'Lookalike tags must not create thinking blocks');
      assert.ok(out.includes('&lt;thinking&gt;'), 'Lookalike tags must be HTML-escaped safely');
    });

    it('T3.7: should parse multiple sequential thinking blocks in a single message', () => {
      const input = '<think>Suy nghĩ đợt 1</think>Đoạn giữa<thought>Suy nghĩ đợt 2\nChi tiết</thought>Đoạn kết.';
      const out = sandbox.formatMessage(input, false);
      
      const count = (out.match(/thinking-block-wrapper/g) || []).length;
      assert.strictEqual(count, 2, 'Must render exactly 2 thinking wrappers');
      assert.ok(out.includes('Suy nghĩ đợt 1'), 'First thinking block content present');
      assert.ok(out.includes('Suy nghĩ đợt 2<br>Chi tiết'), 'Second thinking block content present');
      assert.ok(out.includes('Đoạn giữa'), 'Middle text preserved');
      assert.ok(out.includes('Đoạn kết.'), 'Ending text preserved');
    });

    it('T3.8: should gracefully handle nested tags without infinite loops or crashes', () => {
      const input = '<think>Suy nghĩ ngoài <think>suy nghĩ trong</think> kết thúc</think>';
      const out = sandbox.formatMessage(input, false);
      assert.ok(out.includes('thinking-block-wrapper'), 'Must render at least one thinking wrapper');
      assert.ok(out.includes('suy nghĩ'), 'Content must be safely preserved');
    });

    it('T3.9: should safely treat broken unclosed markup (<think without closing angle) as text', () => {
      const input = 'Xin chào <think đây là văn bản dở dang';
      const out = sandbox.formatMessage(input, false);
      assert.ok(!out.includes('thinking-block-wrapper'), 'Broken tag missing > must not trigger thinking wrapper');
      assert.ok(out.includes('&lt;think'), 'Must escape <think safely');
    });
  });

  // =========================================================================
  // TIER 4: SECURITY, ISOLATION, RICH FORMATTING & INTERACTIVE DOM ACCORDION
  // =========================================================================
  describe('Tier 4: Security, Isolation, Rich Formatting & Interactive DOM Accordion', () => {
    it('T4.1: should strictly neutralize XSS payloads inside thinking blocks', () => {
      const xssInput = '<think><script>window._hacked = true; alert("xss")</script><img src="x" onerror="steal()"></think>An toàn';
      const out = sandbox.formatMessage(xssInput, false);

      assert.ok(!out.includes('<script>'), 'Must not contain raw <script> tag');
      assert.ok(!out.includes('<img src='), 'Must not contain raw <img> tag');
      assert.ok(out.includes('&lt;script&gt;'), 'Script tag must be HTML-escaped');
      assert.ok(out.includes('&lt;img src=&quot;x&quot; onerror=&quot;steal()&quot;&gt;'), 'Img tag must be HTML-escaped');
    });

    it('T4.2: should preserve code blocks and backticks inside thinking blocks without leaking', () => {
      const input = '<think>Phân tích code:\n' +
        '```javascript\n' +
        'const a = 10;\n' +
        'const b = 20;\n' +
        '```\n' +
        'Dùng hàm `calculate()`</think>Phản hồi ngoài.';
      const out = sandbox.formatMessage(input, false);

      assert.ok(out.includes('thinking-block-wrapper is-collapsed'), 'Thinking block must render');
      assert.ok(out.includes('const a = 10;'), 'Code inside thinking block must be preserved');
      assert.ok(out.includes('calculate()'), 'Inline code inside thinking block must be preserved');
      assert.ok(out.includes('Phản hồi ngoài.'), 'Outer message intact');
    });

    it('T4.3: should preserve LaTeX formulas inside thinking blocks without corrupting syntax', () => {
      const mathInput = '<think>Ta có công thức $$f(x) = \\int_{-\\infty}^\\infty e^{-x^2} dx$$ và biến $x = 1$</think>Kết quả là $\\sqrt{\\pi}$.';
      const out = sandbox.formatMessage(mathInput, false);

      assert.ok(out.includes('thinking-block-wrapper is-collapsed'), 'Thinking block must render');
      assert.ok(out.includes('$$f(x) = \\int_{-\\infty}^\\infty e^{-x^2} dx$$'), 'Block math inside thinking preserved');
      assert.ok(out.includes('$x = 1$'), 'Inline math inside thinking preserved');
      assert.ok(out.includes('katex-rendered'), 'Outer math expression rendered');
    });

    it('T4.4: should preserve rich markdown characters (bold, headers, lists) inside thinking trace', () => {
      const input = '<think>### Bước phân tích\n**Quan trọng**: Kiểm tra input\n* Gợi ý 1\n* Gợi ý 2\n> Ghi chú</think>Xong.';
      const out = sandbox.formatMessage(input, false);

      assert.ok(out.includes('### Bước phân tích'), 'Headers inside thinking rendered safely as text');
      assert.ok(out.includes('**Quan trọng**: Kiểm tra input'), 'Bold text inside thinking rendered safely as text');
      assert.ok(out.includes('* Gợi ý 1<br>* Gợi ý 2'), 'Lists inside thinking rendered with <br>');
    });

    it('T4.5: should strip <suna_tool_call> tags without interfering with thinking blocks', () => {
      const input = '<suna_tool_call name="search">{"q":"threejs"}</suna_tool_call><think>Đã nhận kết quả tìm kiếm</think>Mã nguồn Three.js.';
      const out = sandbox.formatMessage(input, false);

      assert.ok(!out.includes('<suna_tool_call>'), 'suna_tool_call must be completely stripped');
      assert.ok(!out.includes('search'), 'Tool call payload must not show');
      assert.ok(out.includes('thinking-block-wrapper is-collapsed'), 'Thinking block must render');
      assert.ok(out.includes('Đã nhận kết quả tìm kiếm'), 'Thinking content intact');
      assert.ok(out.includes('Mã nguồn Three.js.'), 'Response content intact');
    });

    it('T4.6: should seamlessly handle mixed complex response with Thinking + Mermaid + Collapsible Code', () => {
      const code18Lines = Array.from({ length: 18 }, (_, i) => `const val_${i} = ${i};`).join('\n');
      const complexMsg = '<think>\n' +
        'Phân tích sơ đồ & mã nguồn\n' +
        '- Sơ đồ kiến trúc: graph TD\n' +
        '- Mã nguồn 18 dòng\n' +
        '</think>\n\n' +
        '```mermaid\n' +
        'graph TD\n' +
        '  A[Client] --> B[Server]\n' +
        '```\n\n' +
        '```javascript\n' +
        code18Lines + '\n' +
        '```\n\n' +
        'Lời giải hoàn tất.';

      const out = sandbox.formatMessage(complexMsg, false);

      assert.ok(out.includes('thinking-block-wrapper is-collapsed'), 'Thinking wrapper present');
      assert.ok(out.includes('mermaid-wrapper'), 'Mermaid wrapper present');
      assert.ok(out.includes('is-collapsible collapsed'), 'Code block >12 lines is collapsible');
      assert.ok(out.includes('18 dòng'), 'Code line badge displays 18 dòng');
      assert.ok(out.includes('Lời giải hoàn tất.'), 'Ending text preserved');
    });

    it('T4.7: should toggle thinking block open/collapsed state via toggleThinkingBlock DOM function', () => {
      // Create Mock Header and Wrapper in DOM sandbox
      const wrapper = sandbox.document.createElement('div');
      wrapper.className = 'thinking-block-wrapper is-collapsed';

      const header = sandbox.document.createElement('div');
      header.className = 'thinking-header';
      header.setAttribute('aria-expanded', 'false');
      wrapper.appendChild(header);

      const toggleIcon = sandbox.document.createElement('span');
      toggleIcon.className = 'material-icons-round thinking-toggle-icon';
      toggleIcon.textContent = 'expand_more';
      wrapper.appendChild(toggleIcon);

      const body = sandbox.document.createElement('div');
      body.className = 'thinking-body';
      body.style.display = 'none';
      wrapper.appendChild(body);

      // 1. Expand block
      sandbox.toggleThinkingBlock(header);
      assert.strictEqual(wrapper.classList.contains('is-open'), true, 'Wrapper should have is-open class');
      assert.strictEqual(wrapper.classList.contains('is-collapsed'), false, 'Wrapper should not have is-collapsed class');
      assert.strictEqual(header.getAttribute('aria-expanded'), 'true', 'aria-expanded should be true');
      assert.strictEqual(toggleIcon.textContent, 'expand_less', 'Toggle icon should be expand_less');
      assert.strictEqual(body.style.display, 'block', 'Body should be display: block');

      // 2. Collapse block
      sandbox.toggleThinkingBlock(header);
      assert.strictEqual(wrapper.classList.contains('is-open'), false, 'Wrapper should not have is-open class');
      assert.strictEqual(wrapper.classList.contains('is-collapsed'), true, 'Wrapper should have is-collapsed class');
      assert.strictEqual(header.getAttribute('aria-expanded'), 'false', 'aria-expanded should be false');
      assert.strictEqual(toggleIcon.textContent, 'expand_more', 'Toggle icon should be expand_more');
      assert.strictEqual(body.style.display, 'none', 'Body should be display: none');
    });

    it('T4.8: should gracefully handle toggleThinkingBlock with null or orphan DOM elements without throwing', () => {
      assert.doesNotThrow(() => sandbox.toggleThinkingBlock(null));
      const orphanHeader = sandbox.document.createElement('div');
      assert.doesNotThrow(() => sandbox.toggleThinkingBlock(orphanHeader));
    });

    it('T4.9: should verify CSS rules in styles.css for thinking block styling and pulsing animations', () => {
      assert.match(stylesCss, /\.thinking-block-wrapper\s*\{/);
      assert.match(stylesCss, /\.thinking-block-wrapper\.is-streaming\s*\{/);
      assert.match(stylesCss, /\.thinking-badge\.is-pulsing\s*\{/);
      assert.match(stylesCss, /@keyframes\s+thinking-badge-pulse\s*\{/);
      assert.match(stylesCss, /\.thinking-meta-info\s*\{/);
      assert.match(stylesCss, /\.thinking-toggle-icon\s*\{/);
      assert.match(stylesCss, /\.thinking-body\s*\{/);
      assert.match(stylesCss, /\.thinking-content\s*\{/);
      assert.match(stylesCss, /body\.light-mode\s+\.thinking-block-wrapper\s*\{/);
    });
  });
});
