'use strict';

/**
 * tests/test_suna_r1_visible.js
 * 
 * Milestone R1: Suna Agent Lifecycle & Core — Visible Test Suite (60% Split - 12 Tests)
 * 
 * Author: teamwork_preview_test_writer
 * Specifications derived from:
 * - ORIGINAL_REQUEST.md (Follow-up 2026-09-20T14:39:06Z, Requirement R1)
 * - orchestrator_10/implementation_plan.md
 * - explorer_o10_survey_1/survey_report.md & handoff.md
 * 
 * Covered Requirements:
 * 1. SunaAgent Standalone VFS & Tool Registry (R1-V01 .. R1-V03)
 * 2. Multi-Step ReAct Loop in _runLegacy (R1-V04 .. R1-V06)
 * 3. agent.steer() Unabort & Recovery (R1-V07 .. R1-V08)
 * 4. MultiSyntaxParser JSON Manifest Discrimination (R1-V09 .. R1-V10)
 * 5. _boundObservation Long Error Flag Preservation (R1-V11 .. R1-V12)
 */

const assert = require('assert');
const SunaAgent = require('../suna_agent.js');
const SunaHarness = require('../suna_harness.js');

describe('Milestone R1: Suna Agent Lifecycle & Core — Visible Suite (12 Tests)', function () {
  this.timeout(15000);

  // =========================================================================
  // 1. SunaAgent Standalone VFS & Tool Registry
  // =========================================================================
  describe('1. SunaAgent Standalone VFS & Tool Registry', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-V01: new SunaAgent() instantiates a non-null VFS with standard filesystem operations (exists, readFile, writeFile)', function () {
      agent = new SunaAgent({ id: 'standalone_vfs_test' });

      assert.ok(agent.vfs !== null, 'agent.vfs must not be null upon instantiation');
      assert.strictEqual(typeof agent.vfs, 'object', 'agent.vfs must be an object');
      assert.strictEqual(typeof agent.vfs.exists, 'function', 'agent.vfs must provide exists()');
      assert.strictEqual(typeof agent.vfs.readFile, 'function', 'agent.vfs must provide readFile()');
      assert.strictEqual(typeof agent.vfs.writeFile, 'function', 'agent.vfs must provide writeFile()');

      // Verify VFS basic functionality
      agent.vfs.writeFile('hello_standalone.txt', 'SunaAgent Standalone VFS OK');
      assert.strictEqual(agent.vfs.exists('hello_standalone.txt'), true, 'hello_standalone.txt must exist');
      assert.strictEqual(agent.vfs.readFile('hello_standalone.txt'), 'SunaAgent Standalone VFS OK');
    });

    it('R1-V02: new SunaAgent() automatically registers standard ACI tools on the instance', function () {
      agent = new SunaAgent({ id: 'standalone_registry_test' });

      const requiredAciTools = [
        'list_dir',
        'view_file',
        'replace_file_content',
        'grep_search',
        'find_by_name',
        'run_sandboxed_command'
      ];

      for (const toolName of requiredAciTools) {
        assert.ok(
          agent.tools[toolName] !== undefined && typeof agent.tools[toolName] === 'function',
          `Standard ACI tool "${toolName}" must be registered in agent.tools`
        );
        const registered = agent.getTool(toolName);
        assert.ok(registered !== null, `agent.getTool("${toolName}") must return registered entry`);
        assert.strictEqual(registered.name, toolName);
      }
    });

    it('R1-V03: standalone agent.run() executes without throwing "Harness VFS not attached"', async function () {
      agent = new SunaAgent({ id: 'standalone_run_test' });
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('sample.txt', 'Sample workspace file for standalone run');
      }

      const result = await agent.run('Inspect sample.txt', { maxTurns: 2 });

      assert.ok(result !== null && typeof result === 'object', 'run() must return an execution result object');
      assert.notStrictEqual(
        result.haltReason,
        'Tool "list_dir" failed 3 consecutive times with identical parameters.',
        'Standalone run must not trigger circuit breaker on list_dir due to missing VFS'
      );

      if (Array.isArray(result.results)) {
        for (const r of result.results) {
          const errMsg = (r && r.error) || (r && r.result && r.result.error) || '';
          assert.ok(
            !errMsg.includes('Harness VFS not attached'),
            `Step execution must not fail with "Harness VFS not attached", got: ${errMsg}`
          );
        }
      }
    });
  });

  // =========================================================================
  // 2. Multi-Step ReAct Loop in _runLegacy
  // =========================================================================
  describe('2. Multi-Step ReAct Loop in _runLegacy', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-V04: _runLegacy executes all sequential steps of a multi-step plan without premature exit after step 1', async function () {
      agent = new SunaAgent({ id: 'multi_step_test' });
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('app.js', 'console.log("initial");');
      }

      // "Fix bug in app.js" produces a 3-step hierarchical plan in OodaBrain:
      // 1. inspect_source (view_file)
      // 2. perform_surgery (replace_file_content)
      // 3. verify_fix (run_sandboxed_command)
      const result = await agent.run('Fix bug in app.js', { maxTurns: 5 });

      assert.ok(result.turnsExecuted >= 2, `_runLegacy must execute multi-step plan sequentially; expected >= 2 turns, got ${result.turnsExecuted}`);
      assert.ok(Array.isArray(result.results) && result.results.length >= 2, `Expected >= 2 step results, got ${result.results.length}`);
      assert.strictEqual(result.results[0].step.name, 'inspect_source', 'Step 1 must be inspect_source');
      assert.strictEqual(result.results[1].step.name, 'perform_surgery', 'Step 2 must be perform_surgery');
    });

    it('R1-V05: _runLegacy tracks currentStepIndex advancement upon step satisfaction and completes successfully', async function () {
      agent = new SunaAgent({ id: 'step_advance_test' });
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('app.js', 'const x = 1;');
      }

      const executedStepNames = [];
      const result = await agent.run('Fix bug in app.js', {
        maxTurns: 5,
        onStep: (stepRes) => {
          if (stepRes && stepRes.step && stepRes.step.name) {
            executedStepNames.push(stepRes.step.name);
          }
        }
      });

      assert.strictEqual(result.status, 'completed', 'Final status must be completed when all steps finish');
      assert.ok(executedStepNames.includes('inspect_source'), 'inspect_source must be executed');
      assert.ok(executedStepNames.includes('perform_surgery'), 'perform_surgery must be executed');
      assert.ok(result.turnsExecuted >= 2, 'Must have executed multiple turns');
    });

    it('R1-V06: _runLegacy does not prematurely mark status completed when a step indicates replanNeeded', async function () {
      agent = new SunaAgent({ id: 'replan_loop_test' });
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('broken.js', 'syntax error {{{');
      }

      let replanTriggered = false;
      const originalReflect = agent.brain.reflectObservation.bind(agent.brain);

      // Force first step to require replan
      let turnCount = 0;
      agent.brain.reflectObservation = (step, observation, context) => {
        turnCount++;
        if (turnCount === 1) {
          replanTriggered = true;
          return {
            satisfied: false,
            nextAction: 'replan',
            replanNeeded: true,
            reflection: 'File inspection failed: need remediation.',
            reflectionText: 'File inspection failed: need remediation.'
          };
        }
        return originalReflect(step, observation, context);
      };

      const result = await agent.run('Fix bug in broken.js', { maxTurns: 4 });

      assert.strictEqual(replanTriggered, true, 'Replan reflection must have been evaluated');
      assert.ok(result.turnsExecuted >= 2, 'Execution must continue after replanNeeded without immediately completing turn 1');
    });
  });

  // =========================================================================
  // 3. agent.steer() Unabort & Recovery
  // =========================================================================
  describe('3. agent.steer() Unabort & Recovery', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-V07: agent.steer() resets isAgentAborted to false and status to idle after agent is aborted', function () {
      agent = new SunaAgent({ id: 'steer_unabort_test' });

      // Simulate an emergency abort
      agent.abort('Emergency user stop');
      assert.strictEqual(agent.isAgentAborted, true, 'Pre-condition: agent must be aborted');
      assert.strictEqual(agent.status, 'halted', 'Pre-condition: agent status must be halted');

      // Operator provides new directive via steer
      const steerAccepted = agent.steer('Resume operation: focus on unit testing');

      assert.strictEqual(steerAccepted, true, 'steer() must return true for non-empty instruction');
      assert.strictEqual(agent.isAgentAborted, false, 'steer() must reset isAgentAborted to false');
      assert.strictEqual(agent.status, 'idle', 'steer() must restore agent.status to idle');
    });

    it('R1-V08: agent.steer() clears consecutiveFailures, resets haltReason, and permits subsequent execution', async function () {
      agent = new SunaAgent({ id: 'steer_circuit_recovery_test' });

      // Simulate circuit breaker trip
      agent.consecutiveFailures = 3;
      agent.haltReason = 'Tool "view_file" failed 3 consecutive times with identical parameters.';
      agent.status = 'halted';
      agent.isAgentAborted = true;

      // Prior to steer, executeStep must immediately refuse
      const preSteerRes = await agent.executeStep('Test prompt');
      assert.strictEqual(preSteerRes.status, 'halted');
      assert.strictEqual(preSteerRes.halted, true);

      // Apply steering instruction
      agent.steer('Try alternative path: inspect index.html instead');

      assert.strictEqual(agent.consecutiveFailures, 0, 'consecutiveFailures must be reset to 0');
      assert.strictEqual(agent.haltReason, null, 'haltReason must be cleared to null');
      assert.strictEqual(agent.status, 'idle', 'status must be idle');
      assert.strictEqual(agent.isAgentAborted, false, 'isAgentAborted must be false');

      // Subsequent execution must proceed normally without circuit breaker block
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('index.html', '<!DOCTYPE html><html><body>OK</body></html>');
      }

      const postSteerRes = await agent.executeStep({
        name: 'inspect_index',
        tool: 'view_file',
        params: { path: 'index.html' }
      });

      assert.notStrictEqual(postSteerRes.status, 'halted', 'Execution must not be halted after steer()');
      assert.ok(!postSteerRes.halted, 'Step must not be halted after steer()');
    });
  });

  // =========================================================================
  // 4. MultiSyntaxParser JSON Manifest Discrimination
  // =========================================================================
  describe('4. MultiSyntaxParser JSON Manifest Discrimination', function () {
    const Parser = SunaAgent.MultiSyntaxParser;

    it('R1-V09: MultiSyntaxParser.parse rejects standard package.json manifests with name, version, dependencies', function () {
      const packageJson = JSON.stringify({
        name: 'suna-chat',
        version: '1.0.0',
        description: 'Suna Chat Web Application',
        main: 'app.js',
        scripts: {
          test: 'mocha',
          start: 'node app.js'
        },
        dependencies: {
          express: '^4.18.2'
        }
      }, null, 2);

      // Raw JSON input
      const rawCalls = Parser.parse(packageJson);
      assert.deepStrictEqual(
        rawCalls,
        [],
        'Raw package.json manifest must NOT be parsed as an executable tool call'
      );

      // Inside Markdown ```json code block
      const markdown = 'Here is the project manifest:\n```json\n' + packageJson + '\n```\nPlease inspect it.';
      const mdCalls = Parser.parse(markdown);
      assert.deepStrictEqual(
        mdCalls,
        [],
        'Markdown code block containing package.json must NOT be parsed as a tool call'
      );
    });

    it('R1-V10: MultiSyntaxParser.parse recognizes genuine tool calls in Markdown code blocks and raw JSON', function () {
      // 1. Markdown code block with explicit tool
      const mdText = 'Executing tool:\n```json\n{\n  "tool": "list_dir",\n  "args": { "SearchDirectory": "/test" }\n}\n```';
      const mdCalls = Parser.parse(mdText);
      assert.strictEqual(mdCalls.length, 1, 'Markdown code block with tool must be parsed');
      assert.strictEqual(mdCalls[0].tool, 'list_dir');
      assert.strictEqual(mdCalls[0].args.SearchDirectory, '/test');

      // 2. Raw JSON tool call
      const rawJson = '{"tool": "view_file", "args": {"path": "index.html"}}';
      const rawCalls = Parser.parse(rawJson);
      assert.strictEqual(rawCalls.length, 1, 'Raw JSON tool call must be parsed');
      assert.strictEqual(rawCalls[0].tool, 'view_file');
      assert.strictEqual(rawCalls[0].args.path, 'index.html');
    });
  });

  // =========================================================================
  // 5. _boundObservation Long Error Flag Preservation
  // =========================================================================
  describe('5. _boundObservation Long Error Flag Preservation', function () {
    let agent;

    beforeEach(() => {
      agent = new SunaAgent({ id: 'bound_obs_test' });
    });

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-V11: _boundObservation preserves isError: true and status: "error" when error exceeds 1500 chars', function () {
      const longStack = 'Error: Database connection timeout\n' + '    at Socket.<anonymous> (/node_modules/pg/lib/connection.js:150:23)\n'.repeat(40);
      const longError = {
        isError: true,
        status: 'error',
        error: longStack,
        code: 'CONN_TIMEOUT'
      };

      assert.ok(JSON.stringify(longError).length > 1500, 'Pre-condition: error object serialized length must exceed 1500 chars');

      const bounded = agent._boundObservation(longError, 1500);

      assert.strictEqual(bounded.truncated, true, 'Observation must be marked truncated');

      // The bounded return envelope or bounded.value MUST retain isError: true
      const preservedIsError = bounded.isError === true || (bounded.value && bounded.value.isError === true);
      assert.strictEqual(preservedIsError, true, '_boundObservation must preserve isError flag');

      const preservedStatus = bounded.status === 'error' || (bounded.value && bounded.value.status === 'error');
      assert.strictEqual(preservedStatus, true, '_boundObservation must preserve status: "error"');
    });

    it('R1-V12: OodaBrain.reflectObservation returns satisfied: false and replanNeeded: true for bounded long error', function () {
      const longStack = 'AssertionError: Expected exit code 0 but received 1\n' + '    at Context.<anonymous> (/tests/core.js:42:12)\n'.repeat(50);
      const longError = {
        isError: true,
        status: 'error',
        error: longStack,
        success: false
      };

      const bounded = agent._boundObservation(longError, 1500);
      const activeStep = { id: 1, name: 'run_tests', tool: 'run_sandboxed_command' };

      // Pass bounded observation to reflection
      const reflection = agent.brain.reflectObservation(activeStep, bounded.value || bounded);

      assert.strictEqual(reflection.satisfied, false, 'Reflection must recognize that bounded long error was NOT satisfied');
      assert.strictEqual(reflection.replanNeeded, true, 'Reflection must signal replanNeeded: true on error');
      assert.ok(
        !reflection.reflectionText.includes('succeeded cleanly'),
        `Reflection text must not claim step "succeeded cleanly", got: "${reflection.reflectionText}"`
      );
    });
  });
});
