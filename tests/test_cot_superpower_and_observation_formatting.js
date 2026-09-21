/**
 * tests/test_cot_superpower_and_observation_formatting.js
 * 
 * Verification suite for Suna's Super-Powered Chain-of-Thought (CoT) system,
 * omnidirectional reasoning without blind spots, and tool observation sanitization.
 */

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

describe('Super-Powered Chain-of-Thought & Observation Sanitization Suite', () => {
  let appJs;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // 1. Meta-Cognitive Orchestration Prompt Progression
  // =========================================================================
  describe('1. Meta-Cognitive Orchestration Prompt Progression', () => {
    let getPromptFn;

    before(() => {
      const sandbox = { window: {} };
      vm.createContext(sandbox);
      const match = appJs.match(/function\s+getCognitiveOrchestrationPrompt\s*\([\s\S]*?\n\}/);
      assert.ok(match, 'getCognitiveOrchestrationPrompt must exist in app.js');
      vm.runInContext(match[0], sandbox);
      getPromptFn = sandbox.getCognitiveOrchestrationPrompt;
    });

    it('1.1: "low" returns empty string and omits cognitive meta-prompts', () => {
      const prompt = getPromptFn('low');
      assert.strictEqual(prompt, '');
    });

    it('1.2: "medium" injects structured multi-perspective reasoning without Tree-of-Thought', () => {
      const prompt = getPromptFn('medium');
      assert.ok(prompt.length > 0, 'medium must return non-empty prompt');
      assert.match(prompt, /MEDIUM/i);
      assert.match(prompt, /đa chiều|logic/i);
      assert.strictEqual(prompt.includes('Tree-of-Thought'), false, 'medium must not include Tree-of-Thought');
      assert.strictEqual(prompt.includes('4-PHASE'), false, 'medium must not include 4-PHASE');
    });

    it('1.3: "high" injects Thesis-Antithesis-Synthesis omnidirectional reasoning without 4-PHASE', () => {
      const prompt = getPromptFn('high');
      assert.ok(prompt.length > 0, 'high must return non-empty prompt');
      assert.match(prompt, /HIGH/i);
      assert.match(prompt, /chính đề.*phản đề.*hợp đề|thesis.*antithesis.*synthesis/is);
      assert.match(prompt, /không góc chết/i);
      assert.strictEqual(prompt.includes('Tree-of-Thought'), false, 'high must not include Tree-of-Thought');
      assert.strictEqual(prompt.includes('4-PHASE'), false, 'high must not include 4-PHASE');
    });

    it('1.4: "xhigh" injects Assumption Challenge, Consistency, and Omnidirectional Reasoning', () => {
      const prompt = getPromptFn('xhigh');
      assert.ok(prompt.length > 0, 'xhigh must return non-empty prompt');
      assert.match(prompt, /giả định|assumption/i);
      assert.match(prompt, /nhất quán|consistency/i);
      assert.match(prompt, /đa hướng không góc chết|omnidirectional/i);
    });

    it('1.5: "max" injects Tree-of-Thought with >= 2 options, edge cases, and Omnidirectional Reasoning', () => {
      const prompt = getPromptFn('max');
      assert.ok(prompt.length > 0, 'max must return non-empty prompt');
      assert.match(prompt, /tree-of-thought|cây suy luận/i);
      assert.match(prompt, /(?:tối thiểu|ít nhất)\s*2\s*phương án|phương án a\s*vs\s*phương án b/i);
      assert.match(prompt, /trường hợp biên|điều kiện biên|edge-case|lỗi biên/i);
      assert.match(prompt, /đa hướng không góc chết|omnidirectional/i);
    });

    it('1.6: "ultra" injects 4-Phase Deep Architecture with Omnidirectional Zero-Blindspot execution', () => {
      const prompt = getPromptFn('ultra');
      assert.ok(prompt.length > 0, 'ultra must return non-empty prompt');
      assert.match(prompt, /4-phase/i);
      assert.match(prompt, /phân rã|decomposition/i);
      assert.match(prompt, /bất biến|invariant/i);
      assert.match(prompt, /phản ví dụ|counter-example|adversarial/i);
      assert.match(prompt, /không thỏa hiệp|zero-compromise|hoàn mỹ|tối ưu/i);
      assert.match(prompt, /đa hướng không góc chết/i);
    });

    it('1.7: "max" elevates to elite Multi-Branch Decision Architecture with trade-off matrix and relentless stress testing', () => {
      const prompt = getPromptFn('max');
      assert.match(prompt, /MULTI-BRANCH DECISION ARCHITECTURE|Multi-Branch Hypothesis Generation/i, 'Must specify multi-branch architecture');
      assert.match(prompt, /nhánh giả thuyết|branch hypothesis/i, 'Must mandate explicit branch hypothesis generation');
      assert.match(prompt, /ma trận đánh giá đánh đổi|trade-off matrix/i, 'Must mandate trade-off matrix evaluation');
      assert.match(prompt, /cực trị số học|numeric extremes/i, 'Must test numeric extremes');
      assert.match(prompt, /áp lực bộ nhớ|memory pressure/i, 'Must test memory pressure');
      assert.match(prompt, /race conditions/i, 'Must test race conditions');
      assert.match(prompt, /tương tranh|concurrency|deadlock/i, 'Must test concurrency / deadlocks');
      assert.match(prompt, /đối kháng|adversarial inputs/i, 'Must test adversarial inputs');
      assert.match(prompt, /triệt tiêu lỗi có thể xác minh|verifiable error elimination/i, 'Must mandate verifiable error elimination');
    });

    it('1.8: "ultra" elevates to supreme 4-Phase Deep Cognitive Architecture with formal DAG, axiomatic proofs, byzantine red-teaming, and zero-compromise synthesis', () => {
      const prompt = getPromptFn('ultra');
      // Phase 1: Hyper-Atomic Problem Decomposition & Formal Dependency DAG mapping
      assert.match(prompt, /PHA 1/i);
      assert.match(prompt, /phân rã nguyên tử|hyper-atomic/i, 'Phase 1 must include hyper-atomic decomposition');
      assert.match(prompt, /đồ thị phụ thuộc|dependency DAG/i, 'Phase 1 must include formal dependency DAG mapping');
      assert.match(prompt, /ràng buộc ẩn|hidden invariants/i, 'Phase 1 must extract hidden invariants');
      assert.match(prompt, /giới hạn môi trường|environmental constraints/i, 'Phase 1 must inspect environmental constraints');
      assert.match(prompt, /đa góc nhìn|multi-stakeholder perspectives/i, 'Phase 1 must cover multi-stakeholder perspectives');

      // Phase 2: Axiomatic Invariant Proofs & Contract Formalization
      assert.match(prompt, /PHA 2/i);
      assert.match(prompt, /tiên đề bất biến|axiomatic invariant/i, 'Phase 2 must include axiomatic invariant proofs');
      assert.match(prompt, /quy nạp|inductive proofs/i, 'Phase 2 must include inductive proofs');
      assert.match(prompt, /chuyển trạng thái|state-machine transition invariants/i, 'Phase 2 must include state-machine transition invariants');
      assert.match(prompt, /an toàn bộ nhớ\/đồng thời|memory\/concurrency safety bounds/i, 'Phase 2 must include memory/concurrency safety bounds');
      assert.match(prompt, /tiền điều kiện.*hậu điều kiện|formal preconditions.*formal postconditions/is, 'Phase 2 must formalize preconditions and postconditions');

      // Phase 3: Ruthless Adversarial Red-Teaming & Byzantine Counter-Example Falsification
      assert.match(prompt, /PHA 3/i);
      assert.match(prompt, /tấn công đối kháng|adversarial red-teaming|adversarial critic/i, 'Phase 3 must mandate adversarial red-teaming');
      assert.match(prompt, /byzantine/i, 'Phase 3 must cover byzantine counter-examples');
      assert.match(prompt, /bế tắc|deadlocks/i, 'Phase 3 must test deadlocks');
      assert.match(prompt, /xung đột tương tranh|race hazards/i, 'Phase 3 must test race hazards');
      assert.match(prompt, /trôi số thực|floating point drift/i, 'Phase 3 must test floating point drift');
      assert.match(prompt, /cạn kiệt tài nguyên|resource exhaustion/i, 'Phase 3 must test resource exhaustion');

      // Phase 4: Zero-Compromise Synthesis & Production-Grade Flawless Implementation
      assert.match(prompt, /PHA 4/i);
      assert.match(prompt, /không thỏa hiệp|zero-compromise/i, 'Phase 4 must mandate zero-compromise synthesis');
      assert.match(prompt, /độ phức tạp thuật toán tối ưu|optimal algorithmic complexity/i, 'Phase 4 must optimize algorithmic complexity');
      assert.match(prompt, /xử lý lỗi phòng thủ|defensive error handling/i, 'Phase 4 must enforce defensive error handling');
      assert.match(prompt, /tự phục hồi|self-healing/i, 'Phase 4 must require self-healing resilience');
      assert.match(prompt, /100%.*không rút gọn.*không placeholder/is, 'Phase 4 must enforce 100% complete code without placeholders');
    });

    it('1.9: case-insensitivity and whitespace resilience for "max" and "ultra"', () => {
      const pMaxLower = getPromptFn('max');
      const pMaxUpper = getPromptFn('MAX');
      const pMaxMixed = getPromptFn('  Max\t');
      assert.strictEqual(pMaxUpper, pMaxLower, 'MAX must return exact same prompt as max');
      assert.strictEqual(pMaxMixed, pMaxLower, 'Whitespace-padded Max must return exact same prompt as max');

      const pUltraLower = getPromptFn('ultra');
      const pUltraUpper = getPromptFn('ULTRA');
      const pUltraMixed = getPromptFn('  Ultra\n');
      assert.strictEqual(pUltraUpper, pUltraLower, 'ULTRA must return exact same prompt as ultra');
      assert.strictEqual(pUltraMixed, pUltraLower, 'Whitespace-padded Ultra must return exact same prompt as ultra');
    });

    it('1.10: "max" and "ultra" enforce bilingual (VN/EN) cognitive directives for cross-lingual LLM compliance', () => {
      const pMax = getPromptFn('max');
      assert.match(pMax, /CÂY SUY LUẬN ĐA NHÁNH/i);
      assert.match(pMax, /Tree-of-Thought/i);
      assert.match(pMax, /MA TRẬN ĐÁNH GIÁ ĐÁNH ĐỔI/i);
      assert.match(pMax, /Trade-Off Matrix/i);
      assert.match(pMax, /STRESS-TEST/i);
      assert.match(pMax, /TRIỆT TIÊU LỖI CÓ THỂ XÁC MINH/i);
      assert.match(pMax, /Verifiable Error Elimination/i);

      const pUltra = getPromptFn('ultra');
      assert.match(pUltra, /PHÂN RÃ NGUYÊN TỬ/i);
      assert.match(pUltra, /Hyper-Atomic Problem Decomposition/i);
      assert.match(pUltra, /CHỨNG MINH TIÊN ĐỀ BẤT BIẾN/i);
      assert.match(pUltra, /Axiomatic Invariant Proofs/i);
      assert.match(pUltra, /TẤN CÔNG ĐỐI KHÁNG/i);
      assert.match(pUltra, /Adversarial Red-Teaming/i);
      assert.match(pUltra, /TỔNG HỢP GIẢI PHÁP HOÀN MỸ/i);
      assert.match(pUltra, /Zero-Compromise Synthesis/i);
    });
  });

  // =========================================================================
  // 2. buildSystemPrompt CoT and Omnidirectional Reasoning Invariants
  // =========================================================================
  describe('2. buildSystemPrompt CoT & Omnidirectional Reasoning', () => {
    function buildPromptInContext(stateOverrides = {}) {
      const defaultState = {
        mode: 'pro',
        settings: { systemPrompt: '', userPurpose: '', tone: 'friendly', reasoningEffort: 'xhigh' },
        webSearchEnabled: false
      };
      const merged = Object.assign({}, defaultState, stateOverrides);
      if (stateOverrides.settings) {
        merged.settings = Object.assign({}, defaultState.settings, stateOverrides.settings);
      }
      // Extract the real getCognitiveOrchestrationPrompt function from appJs
      const match = appJs.match(/function\s+getCognitiveOrchestrationPrompt\s*\([\s\S]*?\n\}/);
      let realGetPrompt = null;
      if (match) {
        const tempSandbox = {};
        vm.runInNewContext(match[0] + '; tempFn = getCognitiveOrchestrationPrompt;', tempSandbox);
        realGetPrompt = tempSandbox.tempFn;
      }

      const sandbox = {
        State: merged,
        getMemoryPrompt: () => '',
        isReasoningModel: (m) => m && m.includes('thinking'),
        getCognitiveOrchestrationPrompt: realGetPrompt || ((lvl) => {
          if (lvl === 'xhigh') return '[XHIGH_COGNITIVE_PROMPT]';
          if (lvl === 'max') return '[MAX_COGNITIVE_PROMPT]';
          if (lvl === 'ultra') return '[ULTRA_COGNITIVE_PROMPT]';
          return '';
        })
      };
      vm.createContext(sandbox);
      const fnMatch = appJs.match(/function\s+buildSystemPrompt\s*\([\s\S]*?\n\}/);
      vm.runInContext(fnMatch[0], sandbox);
      return sandbox.buildSystemPrompt();
    }

    it('2.1: Pro mode injects Omnidirectional Reasoning & Deep CoT without blind spots', () => {
      const prompt = buildPromptInContext({ mode: 'pro' });
      assert.match(prompt, /\[CHẾ ĐỘ PRO 💎 - HIỆU NĂNG TỐI ĐA\]/);
      assert.match(prompt, /Suy luận từng bước \(Chain-of-Thought\)/);
      assert.match(prompt, /LẬP LUẬN ĐA HƯỚNG KHÔNG GÓC CHẾT/);
      assert.match(prompt, /chính đề,\s*phản đề,\s*hợp đề/i);
      assert.match(prompt, /Quét sạch điểm mù|điểm mù/i);
    });

    it('2.2: Flash mode with reasoning model injects fast blindspot-free reasoning', () => {
      const prompt = buildPromptInContext({ mode: 'flash' });
      // In non-reasoning flash:
      assert.match(prompt, /\[CHẾ ĐỘ FLASH ⚡ - TỐC ĐỘ TỐI ĐA\]/);
      assert.match(prompt, /Trả lời CỰC NGẮN/);
    });

    it('2.3: [TƯ DUY] section contains omnidirectional reasoning directive', () => {
      const prompt = buildPromptInContext();
      assert.match(prompt, /\[TƯ DUY\]:/);
      assert.match(prompt, /lập luận đa hướng không góc chết/);
    });

    it('2.4: buildSystemPrompt with reasoningEffort="max" injects upgraded Multi-Branch Decision Architecture', () => {
      const prompt = buildPromptInContext({ settings: { reasoningEffort: 'max' } });
      assert.match(prompt, /\[KIẾN TRÚC NHẬN THỨC ĐỈNH CAO — MAX 💎/);
      assert.match(prompt, /MULTI-BRANCH DECISION ARCHITECTURE/);
      assert.match(prompt, /ma trận đánh giá đánh đổi/i);
      assert.match(prompt, /trường hợp biên/i);
      assert.match(prompt, /triệt tiêu lỗi có thể xác minh/i);
    });

    it('2.5: buildSystemPrompt with reasoningEffort="ultra" injects supreme 4-Phase Deep Cognitive Architecture', () => {
      const prompt = buildPromptInContext({ settings: { reasoningEffort: 'ultra' } });
      assert.match(prompt, /\[KIẾN TRÚC NHẬN THỨC SIÊU CẤP TỐI THƯỢNG — ULTRA 🔥/);
      assert.match(prompt, /4-PHASE DEEP COGNITIVE ARCHITECTURE/);
      assert.match(prompt, /PHA 1 - PHÂN RÃ NGUYÊN TỬ & LẬP ĐỒ THỊ PHỤ THUỘC/);
      assert.match(prompt, /PHA 2 - CHỨNG MINH TIÊN ĐỀ BẤT BIẾN & HỢP ĐỒNG CHÍNH THỨC/);
      assert.match(prompt, /PHA 3 - TẤN CÔNG ĐỐI KHÁNG TẬN DIỆT & BẺ GÃY PHẢN VÍ DỤ/);
      assert.match(prompt, /PHA 4 - TỔNG HỢP GIẢI PHÁP HOÀN MỸ KHÔNG THỎA HIỆP/);
    });

    it('2.6: buildSystemPrompt in Flash mode with reasoningEffort="ultra" retains supreme cognitive directives', () => {
      const prompt = buildPromptInContext({ mode: 'flash', settings: { reasoningEffort: 'ultra' } });
      assert.match(prompt, /\[CHẾ ĐỘ FLASH ⚡/);
      assert.match(prompt, /\[KIẾN TRÚC NHẬN THỨC SIÊU CẤP TỐI THƯỢNG — ULTRA 🔥/);
      assert.match(prompt, /4-PHASE DEEP COGNITIVE ARCHITECTURE/);
    });

    it('2.7: buildSystemPrompt resolves getCognitiveOrchestrationPrompt from window scope if local is missing', () => {
      const match = appJs.match(/function\s+getCognitiveOrchestrationPrompt\s*\([\s\S]*?\n\}/);
      assert.ok(match);
      const tempSandbox = {};
      vm.runInNewContext(match[0] + '; tempFn = getCognitiveOrchestrationPrompt;', tempSandbox);

      const sandbox = {
        State: {
          mode: 'pro',
          settings: { systemPrompt: '', userPurpose: '', tone: 'friendly', reasoningEffort: 'max' },
          webSearchEnabled: false
        },
        getMemoryPrompt: () => '',
        isReasoningModel: () => false,
        window: {
          getCognitiveOrchestrationPrompt: tempSandbox.tempFn
        }
      };
      vm.createContext(sandbox);
      const fnMatch = appJs.match(/function\s+buildSystemPrompt\s*\([\s\S]*?\n\}/);
      vm.runInContext(fnMatch[0], sandbox);
      const prompt = sandbox.buildSystemPrompt();
      assert.match(prompt, /\[KIẾN TRÚC NHẬN THỨC ĐỈNH CAO — MAX 💎/);
      assert.match(prompt, /MULTI-BRANCH DECISION ARCHITECTURE/);
    });
  });

  // =========================================================================
  // 3. Tool Observation Sanitization & Formatting
  // =========================================================================
  describe('3. Tool Observation Sanitization & Formatting in handleToolCalls', () => {
    it('3.1: memory_query observation does not format as web search and renders facts clearly', () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name, args) => {
          if (name === 'memory_query') {
            return JSON.stringify({
              success: true,
              count: 2,
              results: [
                { fact: 'User prefers dark mode', category: 'preference' },
                { fact: 'User works on React project', category: 'work' }
              ]
            });
          }
          return '';
        }
      };

      // Extract handleToolCalls function body
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      assert.ok(handleToolCallsMatch, 'handleToolCalls must exist in app.js');

      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      return agentSandbox.handleToolCalls(['{"tool":"memory_query","args":{"query":"dark"}}']).then((obs) => {
        assert.ok(obs.includes('[SUNA TOOL EXECUTION OBSERVATIONS]'), 'Must include observation header');
        assert.ok(obs.includes('Tìm thấy 2 ký ức phù hợp:'), 'Must format as memory query, not web search');
        assert.ok(obs.includes('User prefers dark mode'), 'Must include fact text');
        assert.ok(!obs.includes('Tiêu đề:'), 'Must NOT include web search "Tiêu đề" for memory_query');
        assert.ok(!obs.includes('[object Object]'), 'Must never include [object Object]');
      });
    });

    it('3.2: sandbox_exec observation formats clean result without raw JSON wrapper', () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name) => {
          if (name === 'sandbox_exec') {
            return JSON.stringify({ success: true, result: '42' });
          }
          return '';
        }
      };

      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      return agentSandbox.handleToolCalls(['{"tool":"sandbox_exec","args":{"code":"6*7"}}']).then((obs) => {
        assert.ok(obs.includes('Kết quả thực thi:\n42'), 'Must cleanly format sandbox execution result');
        assert.ok(!obs.includes('[object Object]'), 'Must never include [object Object]');
      });
    });

    it('3.3: export functions cleanly filter out isToolObservation and observation blocks', () => {
      assert.match(
        appJs,
        /function\s+getCleanExportMessages\s*\(chat\)/,
        'app.js must define getCleanExportMessages helper'
      );
      assert.match(
        appJs,
        /!m\.isToolObservation\s*&&\s*!\(m\.role === 'user' && typeof m\.content === 'string' && m\.content\.trim\(\)\.startsWith\('\[SUNA TOOL EXECUTION OBSERVATIONS\]'\)\)/,
        'getCleanExportMessages must filter tool observations'
      );
    });

    it('3.4: fs_read formats path, line count, byte size and content cleanly', async () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name) => {
          if (name === 'fs_read') {
            return JSON.stringify({ success: true, path: 'index.html', content: '<h1>Hello</h1>', size: 14, lines: 1 });
          }
          return '';
        }
      };
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      const obs = await agentSandbox.handleToolCalls(['{"tool":"fs_read","args":{"path":"index.html"}}']);
      assert.ok(obs.includes('Nội dung tệp "index.html" (1 dòng, 14 bytes):\n<h1>Hello</h1>'), 'Must format fs_read with path, lines, bytes and content');
      assert.ok(!obs.includes('[object Object]'));
    });

    it('3.5: fs_read with empty file does not dump raw JSON object', async () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name) => {
          if (name === 'fs_read') {
            return JSON.stringify({ success: true, path: 'empty.txt', content: '', size: 0, lines: 1 });
          }
          return '';
        }
      };
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      const obs = await agentSandbox.handleToolCalls(['{"tool":"fs_read","args":{"path":"empty.txt"}}']);
      assert.ok(obs.includes('Nội dung tệp "empty.txt" (1 dòng, 0 bytes):'), 'Must cleanly format empty file');
      assert.ok(!obs.includes('"success": true'), 'Must not dump raw JSON');
      assert.ok(!obs.includes('[object Object]'));
    });

    it('3.6: fetch_page_summary formats URL, length and content cleanly', async () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name) => {
          if (name === 'fetch_page_summary') {
            return JSON.stringify({ success: true, url: 'https://example.com', length: 25, content: 'Sample page clean content' });
          }
          return '';
        }
      };
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      const obs = await agentSandbox.handleToolCalls(['{"tool":"fetch_page_summary","args":{"url":"https://example.com"}}']);
      assert.ok(obs.includes('Nội dung tóm tắt từ "https://example.com" (25 ký tự):'), 'Must format fetch_page_summary nicely');
      assert.ok(obs.includes('Sample page clean content'));
      assert.ok(!obs.includes('[object Object]'));
    });

    it('3.7: web_search_context error is exposed and not masked by empty results array', async () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name) => {
          if (name === 'web_search_context') {
            return JSON.stringify({ success: false, query: 'test', count: 0, results: [], error: 'DNS resolution failed' });
          }
          return '';
        }
      };
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      const obs = await agentSandbox.handleToolCalls(['{"tool":"web_search_context","args":{"query":"test"}}']);
      assert.ok(obs.includes('Lỗi tìm kiếm: DNS resolution failed'), 'Must expose actual error');
      assert.ok(!obs.includes('Không tìm thấy kết quả tìm kiếm nào'), 'Must not mask error with 0 results message');
    });

    it('3.8: grep_search formats file, line number and snippet cleanly', async () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name) => {
          if (name === 'grep_search') {
            return JSON.stringify([
              { file: 'app.js', lineNumber: 42, lineContent: 'const a = 1;' },
              { file: 'index.html', lineNumber: 10, lineContent: '<div id="app"></div>' }
            ]);
          }
          return '';
        }
      };
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      const obs = await agentSandbox.handleToolCalls(['{"tool":"grep_search","args":{"Query":"app"}}']);
      assert.ok(obs.includes('Tìm thấy 2 kết quả:\napp.js:42: const a = 1;\nindex.html:10: <div id="app"></div>'));
    });

    it('3.9: list_dir formats directory contents cleanly with [DIR] / [FILE]', async () => {
      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async (name) => {
          if (name === 'list_dir') {
            return JSON.stringify([
              { path: 'src', type: 'directory', size: 0 },
              { path: 'package.json', type: 'file', size: 1024 }
            ]);
          }
          return '';
        }
      };
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      const obs = await agentSandbox.handleToolCalls(['{"tool":"list_dir","args":{}}']);
      assert.ok(obs.includes('[DIR] src (0 bytes)'));
      assert.ok(obs.includes('[FILE] package.json (1024 bytes)'));
    });

    it('3.10: circular object or BigInt in tool results does not crash and formats safely', async () => {
      const circularObj = { name: 'circular_tool' };
      circularObj.self = circularObj;

      const agentSandbox = {
        State: { agentRecursionDepth: 1 },
        executeTool: async () => {
          return circularObj;
        }
      };
      const handleToolCallsMatch = appJs.match(/async\s+handleToolCalls\s*\([\s\S]*?\n\s{2}\},/);
      const fnCode = `agentSandbox.handleToolCalls = ${handleToolCallsMatch[0].replace(/^async\s+handleToolCalls/, 'async function').replace(/,\s*$/, '')};`;
      vm.runInNewContext(fnCode, { agentSandbox });

      const obs = await agentSandbox.handleToolCalls(['{"tool":"circular_tool","args":{}}']);
      assert.ok(obs.includes('[SUNA TOOL EXECUTION OBSERVATIONS]'));
      assert.ok(!obs.includes('[object Object]'));
      assert.ok(obs.includes('[Circular Reference]') || obs.includes('hoàn tất'));
    });
  });
});
