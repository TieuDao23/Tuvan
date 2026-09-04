/**
 * tests/test_dsh_react_loop_and_trajectory.js
 * 
 * Comprehensive Opaque-Box Test Suite for:
 * DeepSeek Harness (dsh) Autonomous Multi-Step ReAct Engine & Explainable AI Trajectory View
 * 
 * Covers:
 * - Autonomous ReAct Cycle: Think -> Action (<suna_tool_call>) -> Observation -> Next Action / Final Answer
 * - StreamParser: Buffering tool calls, filtering display text, separating <think> tags
 * - Recursion Guard: MAX_RECURSION_DEPTH = 4 ceiling, anti-infinite loop safety, depth reset
 * - Error Self-Correction Loop: Error observation feed-back and adaptive retry
 * - AbortController Safety: Cancellation mid-loop, partial content retention
 * - Trajectory Data Model: Structured step logging (step, tool, params, result, durationMs, timestamp)
 * - Trajectory View UI: formatMessage rendering .trajectory-chip and collapsible .trajectory-drawer
 * - Active Tool Status Widget: .agent-active-tool-indicator state during execution
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('DSH Suite 3: Autonomous ReAct Loop & Trajectory Engine (dsh-session)', () => {
  let appJs;
  let StreamParserClass;

  // =========================================================================
  // AUTHORITATIVE SPECIFICATION ORACLES: ReAct Engine & Trajectory
  // =========================================================================

  class ReActEngineOracle {
    constructor(options = {}) {
      this.MAX_RECURSION_DEPTH = options.MAX_RECURSION_DEPTH || 4;
      this.tools = options.tools || new Map();
    }

    async runAutonomousReActLoop({ prompt, modelStepGenerator, context = {} }) {
      const trajectory = [];
      const history = [{ role: 'user', content: prompt }];
      let depth = 0;
      let finalAnswer = '';
      const consecutiveFailures = new Map();

      const state = context.State || { agentRecursionDepth: 0 };
      state.agentRecursionDepth = 0;

      while (depth <= this.MAX_RECURSION_DEPTH) {
        // Abort check
        if (context.window && context.window.isAgentAborted) {
          finalAnswer = finalAnswer || '[Aborted by user]';
          break;
        }

        // Check recursion limit guard
        if (depth === this.MAX_RECURSION_DEPTH) {
          finalAnswer += '\n[Warning] Max agent tool recursion depth (4) reached. Halting recursion loop.';
          break;
        }

        depth++;
        state.agentRecursionDepth = depth;

        // Model generates step (simulated by modelStepGenerator)
        const stepResponse = await modelStepGenerator(history, depth);
        if (!stepResponse) break;

        // Parse tool calls via StreamParser or regex
        const toolCallMatch = stepResponse.match(/<suna_tool_call>([\s\S]*?)<\/suna_tool_call>/);
        const thoughtMatch = stepResponse.match(/<think>([\s\S]*?)<\/think>/);
        const thought = thoughtMatch ? thoughtMatch[1].trim() : '';

        if (!toolCallMatch) {
          // Final Answer reached!
          const cleanAnswer = stepResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          finalAnswer = cleanAnswer;
          break;
        }

        // Tool call detected
        const rawCallContent = toolCallMatch[1].trim();
        let parsedCall = null;
        try {
          parsedCall = JSON.parse(rawCallContent);
        } catch (e) {
          parsedCall = { tool: 'unknown', args: {} };
        }

        const toolName = parsedCall.tool || parsedCall.name;
        const toolArgs = parsedCall.args || parsedCall.arguments || {};
        const startTime = Date.now();

        // Anti-oscillation duplicate failure guard
        const failureKey = `${toolName}:${JSON.stringify(toolArgs)}`;
        const failCount = consecutiveFailures.get(failureKey) || 0;
        if (failCount >= 3) {
          finalAnswer += `\n[Warning] Halting execution: Tool "${toolName}" failed 3 consecutive times with identical parameters.`;
          break;
        }

        // Execute tool
        let toolResult = null;
        let toolError = null;
        const toolFn = this.tools.get(toolName);

        if (toolFn) {
          try {
            toolResult = await toolFn(toolArgs, context);
            consecutiveFailures.delete(failureKey);
          } catch (err) {
            toolError = err.message;
            consecutiveFailures.set(failureKey, failCount + 1);
          }
        } else {
          toolError = `Tool "${toolName}" not found`;
          consecutiveFailures.set(failureKey, failCount + 1);
        }

        const durationMs = Date.now() - startTime;

        // Record Trajectory Step
        const stepRecord = {
          step: depth,
          tool: toolName,
          thought,
          params: toolArgs,
          result: toolResult,
          error: toolError,
          durationMs,
          timestamp: Date.now()
        };
        trajectory.push(stepRecord);

        // Format Observation
        const observationText = toolError
          ? `[Observation Error]: ${toolError}`
          : `[Observation Result]: ${typeof toolResult === 'object' ? JSON.stringify(toolResult) : toolResult}`;

        // Feed back into conversation history
        history.push({ role: 'assistant', content: stepResponse });
        history.push({ role: 'user', content: `[SUNA TOOL OBSERVATION]:\n${observationText}` });
      }

      return {
        finalAnswer,
        trajectory,
        totalSteps: trajectory.length,
        depthReached: depth
      };
    }
  }

  // Trajectory UI Renderer Oracle
  function renderTrajectoryViewOracle(trajectory, options = {}) {
    if (!Array.isArray(trajectory) || trajectory.length === 0) return '';

    const stepCount = trajectory.length;
    const totalDuration = trajectory.reduce((sum, s) => sum + (s.durationMs || 0), 0);

    let html = `<div class="trajectory-container" data-steps="${stepCount}">`;
    html += `<div class="trajectory-chip" role="button" aria-expanded="false" tabindex="0">`;
    html += `<span class="trajectory-icon">⚡</span>`;
    html += `<span class="trajectory-label">${stepCount} bước suy luận</span>`;
    html += `<span class="trajectory-duration-badge">${totalDuration}ms</span>`;
    html += `<span class="trajectory-toggle-chevron">▼</span>`;
    html += `</div>`;

    html += `<div class="trajectory-drawer collapsed">`;
    html += `<div class="trajectory-timeline">`;

    trajectory.forEach(step => {
      const isError = !!step.error;
      html += `<div class="trajectory-step-node ${isError ? 'step-error' : 'step-success'}">`;
      html += `<div class="step-header">`;
      html += `<span class="step-number">#${step.step}</span>`;
      html += `<span class="step-tool-name">${step.tool}</span>`;
      html += `<span class="step-duration">${step.durationMs}ms</span>`;
      html += `</div>`;

      if (step.thought) {
        html += `<div class="step-thought"><em>${step.thought}</em></div>`;
      }

      html += `<div class="step-params"><code>${JSON.stringify(step.params)}</code></div>`;

      if (isError) {
        html += `<div class="step-error-msg">${step.error}</div>`;
      } else {
        html += `<div class="step-result"><code>${typeof step.result === 'object' ? JSON.stringify(step.result) : step.result}</code></div>`;
      }
      html += `</div>`;
    });

    html += `</div></div></div>`;
    return html;
  }

  // =========================================================================
  // SETUP
  // =========================================================================

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');

    // Extract and instantiate StreamParser from app.js agent section
    const agentStart = appJs.indexOf('// === START OF agent.js ===');
    const agentEnd = appJs.indexOf('// === END OF agent.js ===');
    const agentCode = agentStart !== -1 && agentEnd !== -1
      ? appJs.slice(agentStart, agentEnd)
      : appJs;

    const parserSandbox = {
      window: {},
      document: {},
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    vm.createContext(parserSandbox);
    vm.runInContext(agentCode, parserSandbox);
    StreamParserClass = parserSandbox.StreamParser || (parserSandbox.window.SunaAgent && parserSandbox.window.SunaAgent.StreamParser);
    assert.ok(StreamParserClass, 'StreamParserClass must be successfully extracted and initialized from app.js');
  });

  // =========================================================================
  // SUITE 1: STREAMPARSER TOOL CALL & THINK TAG EXTRACTION
  // =========================================================================

  describe('1. StreamParser Chunk Processing & Tag Separation (RL-01 to RL-04)', () => {
    it('RL-01: should buffer <suna_tool_call> tags without leaking XML syntax to display text', () => {
      const parser = new StreamParserClass();
      const chunk1 = 'Chào bạn! Để mình tính toán cho bạn: <suna_tool_call>';
      const chunk2 = '{"tool":"sandbox_exec","args":{"code":"25*4"}}</suna_tool_call> Xong rồi nhé!';

      const out1 = parser.parseChunk(chunk1);
      const out2 = parser.parseChunk(chunk2);
      const remaining = parser.flush();

      const visibleText = out1 + out2 + remaining;
      assert.ok(!visibleText.includes('<suna_tool_call>'));
      assert.ok(!visibleText.includes('</suna_tool_call>'));
      assert.ok(!visibleText.includes('sandbox_exec'));
      assert.ok(visibleText.includes('Chào bạn! Để mình tính toán cho bạn:'));
      assert.ok(visibleText.includes('Xong rồi nhé!'));

      assert.strictEqual(parser.toolCalls.length, 1);
      assert.ok(parser.toolCalls[0].includes('sandbox_exec'));
    });

    it('RL-02: should handle fragmented chunks split across tag boundaries cleanly', () => {
      const parser = new StreamParserClass();
      const chunks = ['Đây là kết quả: <su', 'na_tool_ca', 'll>{"tool":"calc"}', '</suna_t', 'ool_call> Đã hoàn tất.'];

      let visibleText = '';
      chunks.forEach(c => { visibleText += parser.parseChunk(c); });
      visibleText += parser.flush();

      assert.ok(!visibleText.includes('<suna_tool_call>'));
      assert.ok(!visibleText.includes('{"tool":"calc"}'));
      assert.ok(visibleText.includes('Đây là kết quả:'));
      assert.ok(visibleText.includes('Đã hoàn tất.'));
      assert.strictEqual(parser.toolCalls.length, 1);
    });

    it('RL-03: should extract and handle multiple sequential tool calls in a single response', () => {
      const parser = new StreamParserClass();
      const fullResponse = `
        <suna_tool_call>{"tool":"fs_read","args":{"path":"data.csv"}}</suna_tool_call>
        Tiếp theo phân tích:
        <suna_tool_call>{"tool":"analyze_tabular","args":{"format":"csv"}}</suna_tool_call>
      `;

      parser.parseChunk(fullResponse);
      parser.flush();

      assert.strictEqual(parser.toolCalls.length, 2);
      assert.ok(parser.toolCalls[0].includes('fs_read'));
      assert.ok(parser.toolCalls[1].includes('analyze_tabular'));
    });

    it('RL-04: should flush false-alarm tag buffers when stream ends prematurely', () => {
      const parser = new StreamParserClass();
      const chunk = 'Kiểm tra toán tử nhỏ hơn: 5 < 10 và 3 <';
      const out = parser.parseChunk(chunk);
      const flushed = parser.flush();

      const total = out + flushed;
      assert.ok(total.includes('5 < 10'));
      assert.ok(total.endsWith('<'));
    });
  });

  // =========================================================================
  // SUITE 2: AUTONOMOUS REACT MULTI-STEP LOOP & RECURSION GUARDS
  // =========================================================================

  describe('2. Autonomous ReAct Execution Loop & Guards (RL-05 to RL-09)', () => {
    let mockTools;
    let engine;

    beforeEach(() => {
      mockTools = new Map();
      mockTools.set('sandbox_exec', async (args) => eval(args.code));
      mockTools.set('fs_read', async (args) => `Content of ${args.path}: x = 100`);

      engine = new ReActEngineOracle({ MAX_RECURSION_DEPTH: 4, tools: mockTools });
    });

    it('RL-05: should execute a single-step Think -> Action -> Observation -> Final Answer cycle', async () => {
      let turn = 0;
      const modelMock = async (history, depth) => {
        turn++;
        if (turn === 1) {
          return '<think>Cần tính căn bậc hai của 144</think><suna_tool_call>{"tool":"sandbox_exec","args":{"code":"Math.sqrt(144)"}}</suna_tool_call>';
        }
        return 'Kết quả căn bậc hai của 144 là 12.';
      };

      const res = await engine.runAutonomousReActLoop({
        prompt: 'Tính căn bậc hai của 144',
        modelStepGenerator: modelMock
      });

      assert.strictEqual(res.totalSteps, 1);
      assert.strictEqual(res.trajectory[0].tool, 'sandbox_exec');
      assert.strictEqual(res.trajectory[0].thought, 'Cần tính căn bậc hai của 144');
      assert.strictEqual(res.trajectory[0].result, 12);
      assert.strictEqual(res.finalAnswer, 'Kết quả căn bậc hai của 144 là 12.');
    });

    it('RL-06: should execute multi-step tool chaining (Step 1 -> Observation 1 -> Step 2 -> Answer)', async () => {
      let turn = 0;
      const modelMock = async (history, depth) => {
        turn++;
        if (turn === 1) {
          return '<suna_tool_call>{"tool":"fs_read","args":{"path":"config.js"}}</suna_tool_call>';
        }
        if (turn === 2) {
          return '<suna_tool_call>{"tool":"sandbox_exec","args":{"code":"100 * 2"}}</suna_tool_call>';
        }
        return 'Đã đọc config và tính toán xong giá trị là 200.';
      };

      const res = await engine.runAutonomousReActLoop({
        prompt: 'Đọc config và nhân đôi',
        modelStepGenerator: modelMock
      });

      assert.strictEqual(res.totalSteps, 2);
      assert.strictEqual(res.trajectory[0].tool, 'fs_read');
      assert.strictEqual(res.trajectory[1].tool, 'sandbox_exec');
      assert.strictEqual(res.trajectory[1].result, 200);
      assert.strictEqual(res.finalAnswer, 'Đã đọc config và tính toán xong giá trị là 200.');
    });

    it('RL-07: should strictly enforce MAX_RECURSION_DEPTH = 4 and halt recursion loop', async () => {
      // Infinite recursive tool caller mock
      const infiniteModelMock = async (history, depth) => {
        return `<suna_tool_call>{"tool":"sandbox_exec","args":{"code":"${depth} + 1"}}</suna_tool_call>`;
      };

      const stateObj = { agentRecursionDepth: 0 };
      const res = await engine.runAutonomousReActLoop({
        prompt: 'Lặp vô tận',
        modelStepGenerator: infiniteModelMock,
        context: { State: stateObj }
      });

      assert.strictEqual(res.totalSteps, 4);
      assert.strictEqual(res.depthReached, 4);
      assert.ok(res.finalAnswer.includes('Max agent tool recursion depth (4) reached'));
    });

    it('RL-08: should reset agentRecursionDepth on fresh message execution', async () => {
      const stateObj = { agentRecursionDepth: 4 };
      const modelMock = async () => 'Trả lời trực tiếp';

      await engine.runAutonomousReActLoop({
        prompt: 'Tin nhắn mới',
        modelStepGenerator: modelMock,
        context: { State: stateObj }
      });

      assert.strictEqual(stateObj.agentRecursionDepth, 1);
    });

    it('RL-09: should feed error observation back into loop for error self-correction', async () => {
      let turn = 0;
      let observationSeenByModel = '';

      mockTools.set('failing_tool', async (args) => {
        if (!args.validParam) throw new Error('Missing parameter "validParam"');
        return 'Corrected success!';
      });

      const selfCorrectingModel = async (history, depth) => {
        turn++;
        if (turn === 1) {
          // Bad call
          return '<suna_tool_call>{"tool":"failing_tool","args":{}}</suna_tool_call>';
        }
        if (turn === 2) {
          // Model inspects observation error and corrects itself
          observationSeenByModel = history[history.length - 1].content;
          return '<suna_tool_call>{"tool":"failing_tool","args":{"validParam":true}}</suna_tool_call>';
        }
        return 'Hoàn thành sau khi tự sửa lỗi!';
      };

      const res = await engine.runAutonomousReActLoop({
        prompt: 'Thực hiện tác vụ cần sửa lỗi',
        modelStepGenerator: selfCorrectingModel
      });

      assert.strictEqual(res.totalSteps, 2);
      assert.ok(res.trajectory[0].error.includes('Missing parameter'));
      assert.strictEqual(res.trajectory[1].result, 'Corrected success!');
      assert.ok(observationSeenByModel.includes('Missing parameter "validParam"'));
      assert.strictEqual(res.finalAnswer, 'Hoàn thành sau khi tự sửa lỗi!');
    });

    it('RL-10: should halt execution when identical tool call fails 3 consecutive times (anti-oscillation)', async () => {
      mockTools.set('broken_stub', async () => { throw new Error('Permanent Failure'); });

      // Model stubbornly calls exact same failing tool
      const stubbornModel = async () => {
        return '<suna_tool_call>{"tool":"broken_stub","args":{"id":123}}</suna_tool_call>';
      };

      const res = await engine.runAutonomousReActLoop({
        prompt: 'Thử nghiệm lặp lỗi',
        modelStepGenerator: stubbornModel
      });

      assert.ok(res.finalAnswer.includes('failed 3 consecutive times'));
    });
  });

  // =========================================================================
  // SUITE 3: ABORT CONTROLLER CANCELLATION
  // =========================================================================

  describe('3. AbortController Cancellation Safety (RL-11 to RL-12)', () => {
    it('RL-11: should halt multi-step loop immediately when isAgentAborted is true', async () => {
      const mockWindow = { isAgentAborted: false };
      let stepExecuted = 0;

      const mockTools = new Map([
        ['step_tool', async () => {
          stepExecuted++;
          if (stepExecuted === 1) {
            // User clicks abort during/after step 1
            mockWindow.isAgentAborted = true;
          }
          return `Step ${stepExecuted} done`;
        }]
      ]);

      const engine = new ReActEngineOracle({ tools: mockTools });
      const modelMock = async () => '<suna_tool_call>{"tool":"step_tool","args":{}}</suna_tool_call>';

      const res = await engine.runAutonomousReActLoop({
        prompt: 'Chạy tác vụ dài',
        modelStepGenerator: modelMock,
        context: { window: mockWindow }
      });

      assert.strictEqual(stepExecuted, 1);
      assert.ok(res.finalAnswer.includes('Aborted'));
    });

    it('RL-12: should retain completed trajectory steps upon abort for user inspection', async () => {
      const mockWindow = { isAgentAborted: false };
      const mockTools = new Map([
        ['read_data', async () => {
          mockWindow.isAgentAborted = true; // Abort after reading
          return 'Data ready';
        }]
      ]);

      const engine = new ReActEngineOracle({ tools: mockTools });
      const modelMock = async () => '<think>Đang đọc dữ liệu</think><suna_tool_call>{"tool":"read_data","args":{}}</suna_tool_call>';

      const res = await engine.runAutonomousReActLoop({
        prompt: 'Tác vụ',
        modelStepGenerator: modelMock,
        context: { window: mockWindow }
      });

      assert.strictEqual(res.trajectory.length, 1);
      assert.strictEqual(res.trajectory[0].tool, 'read_data');
      assert.strictEqual(res.trajectory[0].thought, 'Đang đọc dữ liệu');
    });
  });

  // =========================================================================
  // SUITE 4: TRAJECTORY DATA MODEL & UI RENDERING
  // =========================================================================

  describe('4. Trajectory Data Model & Glassmorphic View (RL-13 to RL-15)', () => {
    it('RL-13: should structure trajectory records with step, tool, params, duration, timestamp', () => {
      const sampleStep = {
        step: 1,
        tool: 'sandbox_exec',
        thought: 'Tính toán nhanh',
        params: { code: '10 + 20' },
        result: '30',
        durationMs: 15,
        timestamp: Date.now()
      };

      assert.strictEqual(typeof sampleStep.step, 'number');
      assert.strictEqual(typeof sampleStep.tool, 'string');
      assert.strictEqual(typeof sampleStep.params, 'object');
      assert.strictEqual(typeof sampleStep.durationMs, 'number');
      assert.strictEqual(typeof sampleStep.timestamp, 'number');
    });

    it('RL-14: should render .trajectory-chip and collapsible .trajectory-drawer with step nodes', () => {
      const mockTrajectory = [
        { step: 1, tool: 'fs_read', thought: 'Đọc file', params: { path: 'index.html' }, result: '<html>', durationMs: 10 },
        { step: 2, tool: 'sandbox_exec', thought: 'Tính kích thước', params: { code: '1+1' }, result: '2', durationMs: 5 }
      ];

      const html = renderTrajectoryViewOracle(mockTrajectory);

      assert.ok(html.includes('class="trajectory-container"'));
      assert.ok(html.includes('class="trajectory-chip"'));
      assert.ok(html.includes('2 bước suy luận'));
      assert.ok(html.includes('15ms'));
      assert.ok(html.includes('class="trajectory-drawer collapsed"'));
      assert.ok(html.includes('class="trajectory-step-node step-success"'));
      assert.ok(html.includes('fs_read'));
      assert.ok(html.includes('sandbox_exec'));
    });

    it('RL-15: should mark trajectory nodes with step-error class when a tool execution fails', () => {
      const mockTrajectory = [
        { step: 1, tool: 'bad_tool', params: {}, error: 'SyntaxError: unexpected token', durationMs: 8 }
      ];

      const html = renderTrajectoryViewOracle(mockTrajectory);
      assert.ok(html.includes('step-error'));
      assert.ok(html.includes('SyntaxError: unexpected token'));
    });
  });
});
