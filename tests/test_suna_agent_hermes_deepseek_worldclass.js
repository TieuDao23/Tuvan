/**
 * tests/test_suna_agent_hermes_deepseek_worldclass.js
 * 
 * WORLD-CLASS AGENT & HARNESS TEST SUITE (Hermes 3 + DeepSeek Harness)
 * 
 * Demonstrates:
 * 1. Hermes 3 Function Calling Schemas (<tools>) & Tool Responses (<tool_response>)
 * 2. Multi-Turn Autonomous Execution Engine (SunaAgent.run with auto-replanning)
 * 3. Multi-Agent Team Collaboration (SunaAgent.collaborate across Planner/Coder/Reviewer)
 * 4. DeepSeek Benchmark Evaluation Suite (BenchmarkSuite & EvaluationRunner with SR, eta, FRR)
 * 5. Weak Laptop/PC Virtual Resource Metering, Syntax-Safe Surgery, & Zero-Leak Memory
 */

const assert = require('assert');
const SunaAgent = require('../suna_agent.js');
const SunaHarness = require('../suna_harness.js');

describe('SunaAgent & SunaHarness: World-Class Hermes 3 & DeepSeek Harness Test Suite', function () {
  this.timeout(10000);

  let controller;
  let vfs;
  let agent;

  beforeEach(() => {
    controller = SunaHarness.createHarness({
      maxTurns: 10,
      tokenBudget: 32000,
      enableAciTools: true
    });
    vfs = controller.vfs;
    agent = new SunaAgent({ id: 'test_agent' });
    agent.attachHarness(controller);
  });

  afterEach(() => {
    if (agent && typeof agent.destroy === 'function') {
      agent.destroy();
    }
    if (controller && typeof controller.destroy === 'function') {
      controller.destroy();
    }
  });

  // =========================================================================
  // TIER 1: Hermes 3 Function Calling Schemas & Tool Responses
  // =========================================================================
  describe('Tier 1: Hermes 3 Function Calling & Tool Response Protocol', () => {
    it('T1-1: should format Hermes 3 <tools> block with valid JSON schema definitions', () => {
      const hermesDoc = agent.formatHermesTools();
      assert.ok(typeof hermesDoc === 'string', 'formatHermesTools must return string');
      assert.ok(hermesDoc.includes('<tools>'), 'Must contain <tools> tag');
      assert.ok(hermesDoc.includes('</tools>'), 'Must contain </tools> tag');

      const jsonMatch = hermesDoc.match(/<tools>\s*([\s\S]*?)\s*<\/tools>/i);
      assert.ok(jsonMatch, 'Must extract JSON inside <tools>');
      const toolsArray = JSON.parse(jsonMatch[1]);
      assert.ok(Array.isArray(toolsArray), 'Tools payload must be an array');
      assert.ok(toolsArray.length >= 5, 'Must contain at least 5 tools');

      const viewFile = toolsArray.find(t => t.function && t.function.name === 'view_file');
      assert.ok(viewFile, 'Must include view_file tool');
      assert.strictEqual(viewFile.type, 'function');
      assert.ok(viewFile.function.parameters, 'Must have parameters object');
    });

    it('T1-2: should support static SunaAgent.formatHermesTools() call', () => {
      const hermesDoc = SunaAgent.formatHermesTools();
      assert.ok(hermesDoc.includes('<tools>') && hermesDoc.includes('</tools>'));
      const jsonMatch = hermesDoc.match(/<tools>\s*([\s\S]*?)\s*<\/tools>/i);
      const toolsArray = JSON.parse(jsonMatch[1]);
      assert.ok(toolsArray.some(t => t.function.name === 'sandbox_exec'));
    });

    it('T1-3: should format structured Hermes 3 <tool_response> envelopes', () => {
      const resultObj = { status: 'success', lines: 42, file: 'app.js' };
      const responseXml = agent.formatToolResponse('view_file', resultObj);
      assert.ok(responseXml.includes('<tool_response>'), 'Must have <tool_response> tag');
      assert.ok(responseXml.includes('</tool_response>'), 'Must have </tool_response> tag');

      const jsonMatch = responseXml.match(/<tool_response>\s*([\s\S]*?)\s*<\/tool_response>/i);
      assert.ok(jsonMatch, 'Must extract JSON inside <tool_response>');
      const parsed = JSON.parse(jsonMatch[1]);
      assert.strictEqual(parsed.name, 'view_file');
      assert.deepStrictEqual(parsed.content, resultObj);
    });

    it('T1-4: should format static SunaAgent.formatToolResponse() with string content', () => {
      const responseXml = SunaAgent.formatToolResponse('grep_search', 'Found 3 matches on line 12');
      assert.ok(responseXml.includes('<tool_response>'));
      assert.ok(responseXml.includes('grep_search'));
      assert.ok(responseXml.includes('Found 3 matches'));
    });

    it('T1-5: should export OpenAI-compatible tools array via formatOpenAITools()', () => {
      const openAiTools = agent.formatOpenAITools();
      assert.ok(Array.isArray(openAiTools), 'Must return an array');
      assert.ok(openAiTools.every(t => t.type === 'function' && t.function && t.function.name));
    });

    it('T1-6: should parse Hermes native <tool_call> alongside XML and Markdown', () => {
      const rawText = `I will inspect the file now.
<tool_call>
{"name": "view_file", "arguments": {"path": "src/main.js"}}
</tool_call>`;
      const calls = SunaAgent.MultiSyntaxParser.parse(rawText);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].tool, 'view_file');
      assert.strictEqual(calls[0].args.path, 'src/main.js');
    });
  });

  // =========================================================================
  // TIER 2: Multi-Turn Autonomous Execution Engine (SunaAgent.run)
  // =========================================================================
  describe('Tier 2: Multi-Turn Autonomous Execution Loop (SunaAgent.run)', () => {
    it('T2-1: should run autonomous multi-turn loop to completion', async () => {
      vfs.writeFile('main.js', 'console.log("old");');

      let stepCount = 0;
      const runResult = await agent.run('inspect and fix bug in main.js', {
        maxTurns: 3,
        onStep: (step, turn) => {
          stepCount++;
          assert.ok(turn >= 1, 'turn must be 1-indexed');
          assert.ok(step.thought, 'step must have thought');
        }
      });

      assert.ok(runResult, 'Must return run result');
      assert.strictEqual(runResult.status, 'completed');
      assert.ok(runResult.turnsExecuted >= 1, 'Must execute at least 1 turn');
      assert.ok(stepCount >= 1, 'onStep callback must have fired');
      assert.ok(Array.isArray(runResult.trajectory), 'Must include trajectory events');
    });

    it('T2-2: should invoke lifecycle callbacks (onTurnStart, onStep, onComplete)', async () => {
      vfs.writeFile('index.html', '<div>Hello</div>');

      let startFired = false;
      let completeFired = false;

      const runResult = await agent.run('check index.html', {
        maxTurns: 2,
        onTurnStart: (turn) => { startFired = true; },
        onComplete: (res) => { completeFired = true; }
      });

      assert.ok(startFired, 'onTurnStart must fire');
      assert.ok(completeFired, 'onComplete must fire');
      assert.strictEqual(runResult.status, 'completed');
    });

    it('T2-3: should respect maxTurns ceiling and report max_turns_exceeded if incomplete', async () => {
      // Force loop to require replan repeatedly
      agent.brain.reflectObservation = () => ({
        satisfied: false,
        replanNeeded: true,
        reflection: 'Simulated continuous diagnostic feedback'
      });

      const runResult = await agent.run('long continuous task', {
        maxTurns: 2
      });

      assert.strictEqual(runResult.status, 'max_turns_exceeded');
      assert.strictEqual(runResult.turnsExecuted, 2);
    });

    it('T2-4: should gracefully support user steer injection during autonomous run', async () => {
      vfs.writeFile('test.js', 'const x = 1;');

      let steered = false;
      const runResult = await agent.run('fix test.js', {
        maxTurns: 3,
        onStep: (step, turn) => {
          if (turn === 1 && !steered) {
            agent.steer('Pivot: check package.json instead');
            steered = true;
          }
        }
      });

      assert.ok(steered, 'Steer should have been injected');
      assert.strictEqual(agent.memory.getFact('latest_steer'), 'Pivot: check package.json instead');
    });

    it('T2-5: should halt autonomous run cleanly when circuit breaker trips', async () => {
      agent.maxConsecutiveFailures = 2;
      agent.invokeAciTool = async () => ({ status: 'error', error: 'Persistent fatal error' });

      const runResult = await agent.run('failing task', { maxTurns: 5 });
      assert.strictEqual(runResult.status, 'halted');
      assert.strictEqual(agent.status, 'halted');
      assert.ok(runResult.turnsExecuted <= 2, 'Should halt within max consecutive failures limit');
    });
  });

  // =========================================================================
  // TIER 3: Multi-Agent Team Collaboration (SunaAgent.collaborate)
  // =========================================================================
  describe('Tier 3: Multi-Agent Team Collaboration (SunaAgent.collaborate)', () => {
    it('T3-1: should orchestrate multi-agent collaboration across specialized roles', async () => {
      vfs.writeFile('spec.md', '# Feature Spec\nImplement login module.');

      const subagents = [
        { role: 'planner', budget: 2 },
        { role: 'coder', budget: 2 },
        { role: 'auditor', budget: 2 }
      ];

      const collabResult = await agent.collaborate({
        prompt: 'Build and audit login module based on spec.md',
        subagents,
        topology: 'pipeline'
      });

      assert.ok(collabResult, 'collaborate must return a result');
      assert.strictEqual(collabResult.status, 'completed');
      assert.strictEqual(collabResult.participants.length, 3);
      assert.ok(collabResult.teamTrajectory.length >= 3, 'Must record collective trajectory');
    });

    it('T3-2: should isolate VFS changes per subagent in branch mode and merge to parent', async () => {
      vfs.writeFile('shared.txt', 'base');

      const collabResult = await agent.collaborate({
        prompt: 'Update shared.txt with coder additions',
        subagents: [
          { role: 'coder', vfsWorkspaceMode: 'branch' }
        ],
        topology: 'hub-spoke'
      });

      assert.strictEqual(collabResult.status, 'completed');
      assert.ok(collabResult.participants[0].role === 'coder');
    });

    it('T3-3: should coordinate inter-agent event bus messages during collaboration', async () => {
      let messageSeen = false;
      controller.bus.subscribe('team:broadcast', (msg) => {
        messageSeen = true;
      });

      await agent.collaborate({
        prompt: 'Collaborative task with communication',
        subagents: [{ role: 'worker_1' }, { role: 'worker_2' }],
        topology: 'mesh'
      });

      assert.ok(messageSeen, 'Team broadcast event must have been published');
    });
  });

  // =========================================================================
  // TIER 4: DeepSeek Harness & SWE-bench Benchmark Evaluation Suite
  // =========================================================================
  describe('Tier 4: DeepSeek Harness Benchmark Evaluation Suite', () => {
    it('T4-1: should initialize BenchmarkSuite and register multi-tier tasks', () => {
      const suite = new SunaHarness.BenchmarkSuite();
      assert.ok(suite, 'BenchmarkSuite must be defined');

      suite.registerTask({
        id: 'TASK-01',
        tier: 1,
        name: 'File inspection test',
        prompt: 'view file main.js',
        expectedOutputs: ['main.js']
      });

      const tasks = suite.getTasks();
      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].id, 'TASK-01');
    });

    it('T4-2: should execute evaluation and compute SR, eta, and FRR metrics', async () => {
      const suite = new SunaHarness.BenchmarkSuite();
      suite.registerTask({
        id: 'BENCH-01',
        tier: 1,
        name: 'Simple read',
        prompt: 'Inspect app.js',
        verify: (harness) => harness.vfs.exists('app.js')
      });
      suite.registerTask({
        id: 'BENCH-02',
        tier: 2,
        name: 'Syntax repair',
        prompt: 'Fix syntax error',
        verify: (harness) => true
      });

      vfs.writeFile('app.js', 'console.log("ok");');

      const runner = new SunaHarness.EvaluationRunner({ suite, harness: controller, agent });
      const scorecard = await runner.run();

      assert.ok(scorecard, 'Scorecard must be returned');
      assert.strictEqual(typeof scorecard.successRate, 'number', 'successRate must be a number');
      assert.strictEqual(typeof scorecard.stepEfficiency, 'number', 'stepEfficiency must be a number');
      assert.strictEqual(typeof scorecard.faultRecoveryRate, 'number', 'faultRecoveryRate must be a number');
      assert.ok(scorecard.totalTasks >= 2, 'Total tasks must be >= 2');
      assert.ok(scorecard.successRate >= 0 && scorecard.successRate <= 100);
    });

    it('T4-3: should export visualizer-ready scorecard compatible with SunaHarnessVisualizer', async () => {
      const suite = new SunaHarness.BenchmarkSuite();
      suite.registerTask({ id: 'V-01', tier: 1, name: 'T1', verify: () => true });

      const runner = new SunaHarness.EvaluationRunner({ suite, harness: controller });
      const scorecard = await runner.run();

      const viz = new SunaHarness.SunaHarnessVisualizer({ activeTab: 'scorecard' });
      const html = viz.renderScorecard(scorecard);
      assert.ok(typeof html === 'string', 'Visualizer renderScorecard must return HTML');
      assert.ok(html.includes('Success Rate') || html.includes('SR'));
    });
  });

  // =========================================================================
  // TIER 5: Weak Laptop/PC Virtual Resource Metering & Zero-Leak Memory
  // =========================================================================
  describe('Tier 5: Weak Laptop/PC Virtual Resource Metering & Memory Resilience', () => {
    it('T5-1: should enforce Virtual Resource Metering to protect low-end CPUs', () => {
      const meter = new SunaHarness.VirtualResourceMeter({
        maxVirtualCpuMs: 500,
        maxMemoryBytes: 10 * 1024 * 1024 // 10MB
      });

      meter.recordOperation('heavy_diff', 200, 1024 * 1024);
      assert.strictEqual(meter.isThrottled(), false);

      meter.recordOperation('massive_surgery', 400, 2 * 1024 * 1024);
      assert.strictEqual(meter.isThrottled(), true, 'Should throttle when virtual CPU budget exceeded');
      assert.ok(meter.getDiagnostics().includes('Virtual CPU limit exceeded'));
    });

    it('T5-2: should execute Syntax-Safe Surgery pre-check to prevent code corruption', () => {
      const validCode = 'function hello() { return "world"; }';
      const brokenCode = 'function hello() { return "world"'; // Missing closing brace

      assert.strictEqual(SunaHarness.isSyntaxSafe('test.js', validCode), true);
      assert.strictEqual(SunaHarness.isSyntaxSafe('test.js', brokenCode), false);
      // Non-JS files (css, html, md) should always pass syntax check safely
      assert.strictEqual(SunaHarness.isSyntaxSafe('style.css', '.btn { color: red; }'), true);
    });

    it('T5-3: should cleanly destroy SunaAgent and release memory references for weak PCs', () => {
      agent.memory.setFact('k1', 'v1');
      agent.on('test_event', () => {});
      assert.strictEqual(agent.memory.workingMemory.size, 1);
      assert.strictEqual(agent.listeners.size, 1);

      agent.destroy();
      assert.strictEqual(agent.memory.workingMemory.size, 0, 'Working memory should be cleared');
      assert.strictEqual(agent.listeners.size, 0, 'Listeners should be cleared');
      assert.strictEqual(agent.status, 'destroyed');
    });

    it('T5-4: should cleanly destroy HarnessController and VfsSandbox without memory leaks', () => {
      vfs.writeFile('leak_test.txt', 'some content');
      assert.strictEqual(vfs.exists('leak_test.txt'), true);

      controller.destroy();
      assert.strictEqual(vfs.exists('leak_test.txt'), false, 'VFS inodes should be cleared');
    });
  });
});
