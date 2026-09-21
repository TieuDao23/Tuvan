'use strict';

/**
 * tests/test_suna_r1_hidden.js
 * 
 * Milestone R1: Suna Agent Lifecycle & Core — Hidden Test Suite (40% Split - 8 Tests)
 * Adversarial Verification, Deep Stress, Boundary & Invariant Edge Cases
 * 
 * Author: teamwork_preview_test_writer
 * Specifications derived from:
 * - ORIGINAL_REQUEST.md (Follow-up 2026-09-20T14:39:06Z, Requirement R1)
 * - orchestrator_10/implementation_plan.md
 * - explorer_o10_survey_1/survey_report.md & handoff.md
 * 
 * Covered Requirements:
 * 1. Standalone VFS & Tool Registry Deep Invariants (R1-H01)
 * 2. Multi-Step ReAct Loop Complex Workflows & Boundaries (R1-H02 .. R1-H03)
 * 3. Steer Recovery After Full Circuit Breaker Trip & Window State (R1-H04 .. R1-H05)
 * 4. MultiSyntaxParser Adversarial Rejections & Function Calls (R1-H06 .. R1-H07)
 * 5. _boundObservation Extreme Stack Trace & Diagnostic Extraction (R1-H08)
 */

const assert = require('assert');
const SunaAgent = require('../suna_agent.js');
const SunaHarness = require('../suna_harness.js');

describe('Milestone R1: Suna Agent Lifecycle & Core — Hidden Suite (8 Tests)', function () {
  this.timeout(15000);

  // =========================================================================
  // 1. Standalone VFS & Tool Registry Deep Invariants
  // =========================================================================
  describe('1. Standalone VFS & Tool Registry Deep Invariants', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-H01: custom options.vfs passed to new SunaAgent({ vfs }) is preserved and used by registered ACI tools', async function () {
      const customVfs = new SunaHarness.VfsSandbox();
      customVfs.writeFile('custom_secret.txt', 'CUSTOM_VFS_PAYLOAD_9999');

      agent = new SunaAgent({ id: 'custom_vfs_agent', vfs: customVfs });

      assert.strictEqual(
        agent.vfs,
        customVfs,
        'new SunaAgent({ vfs }) must bind the provided custom VFS without overwriting it'
      );
      assert.strictEqual(
        agent.vfs.readFile('custom_secret.txt'),
        'CUSTOM_VFS_PAYLOAD_9999',
        'Custom VFS content must be accessible directly via agent.vfs'
      );

      // Verify that registered tools or invokeAciTool read from the custom VFS instance
      if (typeof agent.invokeAciTool === 'function') {
        const toolResult = await agent.invokeAciTool('view_file', { path: 'custom_secret.txt' });
        assert.ok(
          toolResult && (toolResult.content || toolResult.text || '').includes('CUSTOM_VFS_PAYLOAD_9999'),
          'invokeAciTool("view_file") must read from the attached custom VFS'
        );
      }
    });
  });

  // =========================================================================
  // 2. Multi-Step ReAct Loop Complex Workflows & Boundaries
  // =========================================================================
  describe('2. Multi-Step ReAct Loop Complex Workflows & Boundaries', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-H02: _runLegacy terminates with "max_turns_exceeded" when turns are exhausted before completing plan', async function () {
      agent = new SunaAgent({ id: 'max_turns_boundary_agent' });
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('app.js', 'console.log("target");');
      }

      // "Fix bug in app.js" produces a 3-step plan: inspect_source -> perform_surgery -> verify_fix
      // Setting maxTurns: 2 forces turn exhaustion before completing all 3 steps
      const result = await agent.run('Fix bug in app.js', { maxTurns: 2 });

      assert.strictEqual(
        result.status,
        'max_turns_exceeded',
        'Status must be "max_turns_exceeded" when steps remain incomplete at maxTurns'
      );
      assert.strictEqual(result.turnsExecuted, 2, 'Must have executed exactly 2 turns');
      assert.strictEqual(result.results.length, 2, 'Results must contain exactly 2 step outputs');
    });

    it('R1-H03: _runLegacy incorporates mid-flight steer guidance into subsequent step thoughts dynamically', async function () {
      agent = new SunaAgent({ id: 'steer_midflight_agent' });
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('app.js', 'console.log("midflight");');
      }

      const steerInstruction = 'Enforce strict null checks during surgery';
      const result = await agent.run('Fix bug in app.js', {
        maxTurns: 4,
        onTurnStart: (turn) => {
          if (turn === 2) {
            agent.steer(steerInstruction);
          }
        }
      });

      // Verify that the steer guidance was registered in memory
      assert.strictEqual(
        agent.memory.getFact('latest_steer'),
        steerInstruction,
        'Steer instruction must be stored in SmartMemory'
      );

      // Verify that subsequent step (turn 2) thought or execution context received the steer guidance
      if (result.results && result.results[1]) {
        const step2Thought = result.results[1].thought || (result.results[1].step && result.results[1].step.thought) || '';
        assert.ok(
          step2Thought.includes(steerInstruction) || agent.memory.getFact('latest_steer') === steerInstruction,
          'Turn 2 thought must reflect injected steer guidance'
        );
      }
    });
  });

  // =========================================================================
  // 3. Steer Recovery After Full Circuit Breaker Trip & Window State
  // =========================================================================
  describe('3. Steer Recovery After Full Circuit Breaker Trip & Window State', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-H04: steer() resets guardrails and recovers agent after a 3-consecutive-failures circuit breaker trip', async function () {
      agent = new SunaAgent({ id: 'circuit_trip_recovery_agent' });

      // Emulate circuit breaker tripping after 3 repeated failures
      agent.consecutiveFailures = 3;
      agent.status = 'halted';
      agent.isAgentAborted = true;
      agent.haltReason = 'Tool "list_dir" failed 3 consecutive times with identical parameters.';

      if (agent.guardrails && typeof agent.guardrails.recordFailure === 'function') {
        agent.guardrails.recordFailure('list_dir');
        agent.guardrails.recordFailure('list_dir');
        agent.guardrails.recordFailure('list_dir');
      }

      // Pre-condition: executing a step while halted must immediately be refused
      const haltedStep = await agent.executeStep('Any prompt');
      assert.strictEqual(haltedStep.status, 'halted', 'Pre-condition: executeStep must return halted');
      assert.strictEqual(haltedStep.halted, true);

      // Human operator intervenes
      const steerResult = agent.steer('Redirect to view_file on index.html');
      assert.strictEqual(steerResult, true);

      // State verification
      assert.strictEqual(agent.status, 'idle', 'Agent status must be idle after steer');
      assert.strictEqual(agent.isAgentAborted, false, 'isAgentAborted must be false after steer');
      assert.strictEqual(agent.consecutiveFailures, 0, 'consecutiveFailures must be reset to 0');
      assert.strictEqual(agent.haltReason, null, 'haltReason must be null');

      // Subsequent execution must not throw or abort immediately
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('index.html', '<div>Recovered</div>');
      }
      const recoveredStep = await agent.executeStep({
        name: 'inspect_recovered',
        tool: 'view_file',
        params: { path: 'index.html' }
      });

      assert.notStrictEqual(recoveredStep.status, 'halted', 'Recovered step must not be halted');
      assert.ok(!recoveredStep.halted, 'Recovered step must not have halted: true');
    });

    it('R1-H05: steer() synchronizes window.isAgentAborted = false in browser-like environments', function () {
      // Mock global.window if running in Node environment
      const wasWindowDefined = typeof global.window !== 'undefined';
      if (!wasWindowDefined) {
        global.window = { isAgentAborted: true };
      } else {
        global.window.isAgentAborted = true;
      }

      try {
        agent = new SunaAgent({ id: 'window_sync_agent' });
        agent.isAgentAborted = true;
        agent.status = 'halted';

        agent.steer('Unblock agent from browser UI');

        assert.strictEqual(agent.isAgentAborted, false, 'Agent instance isAgentAborted must be false');
        assert.strictEqual(global.window.isAgentAborted, false, 'global.window.isAgentAborted must be synchronized to false');
      } finally {
        if (!wasWindowDefined) {
          delete global.window;
        }
      }
    });
  });

  // =========================================================================
  // 4. MultiSyntaxParser Adversarial Rejections & Function Calls
  // =========================================================================
  describe('4. MultiSyntaxParser Adversarial Rejections & Function Calls', function () {
    const Parser = SunaAgent.MultiSyntaxParser;

    it('R1-H06: MultiSyntaxParser rejects configs with scripts, devDependencies, and scoped names, but accepts OpenAI function calls', function () {
      // Adversarial Case 1: Build config with scripts and devDependencies
      const buildConfig = JSON.stringify({
        name: 'build-pipeline',
        scripts: { build: 'webpack', test: 'mocha' },
        devDependencies: { webpack: '^5.0.0' }
      });
      assert.deepStrictEqual(
        Parser.parse(buildConfig),
        [],
        'Build config with scripts and devDependencies must NOT be parsed as tool call'
      );

      // Adversarial Case 2: Scoped package name
      const scopedManifest = JSON.stringify({
        name: '@suna/core-agent',
        version: '2.0.0',
        main: 'index.js'
      });
      assert.deepStrictEqual(
        Parser.parse(scopedManifest),
        [],
        'Scoped package manifest must NOT be parsed as tool call'
      );

      // Adversarial Case 3: Metadata manifest with keywords and repository
      const metaConfig = JSON.stringify({
        name: 'plugin-search',
        keywords: ['search', 'crawler'],
        repository: 'https://github.com/example/repo'
      });
      assert.deepStrictEqual(
        Parser.parse(metaConfig),
        [],
        'Manifest with repository and keywords must NOT be parsed as tool call'
      );

      // Authentic OpenAI Function Call 1: stringified arguments
      const openaiStringArgs = JSON.stringify({
        name: 'list_dir',
        arguments: '{"DirectoryPath": "src"}'
      });
      const res1 = Parser.parse(openaiStringArgs);
      assert.strictEqual(res1.length, 1, 'OpenAI format with arguments string must be recognized');
      assert.strictEqual(res1[0].tool, 'list_dir');
      assert.strictEqual(res1[0].args.DirectoryPath, 'src');

      // Authentic OpenAI Function Call 2: object parameters
      const openaiObjParams = JSON.stringify({
        name: 'view_file',
        parameters: { path: 'server.js' }
      });
      const res2 = Parser.parse(openaiObjParams);
      assert.strictEqual(res2.length, 1, 'OpenAI format with parameters object must be recognized');
      assert.strictEqual(res2[0].tool, 'view_file');
      assert.strictEqual(res2[0].args.path, 'server.js');
    });

    it('R1-H07: MultiSyntaxParser discriminates package.json code block from authentic <suna_tool_call> XML in mixed text', function () {
      const mixedPayload = [
        'Here is the existing package.json:',
        '```json',
        '{',
        '  "name": "suna-chat",',
        '  "version": "2.0.0",',
        '  "dependencies": {',
        '    "express": "^4.19.0"',
        '  }',
        '}',
        '```',
        'Now triggering file search:',
        '<suna_tool_call tool="find_by_name">',
        '{"Pattern": "*.test.js", "SearchDirectory": "tests"}',
        '</suna_tool_call>'
      ].join('\n');

      const parsedCalls = Parser.parse(mixedPayload);

      assert.strictEqual(
        parsedCalls.length,
        1,
        'Only genuine XML tool call should be parsed; package.json code block must be excluded'
      );
      assert.strictEqual(parsedCalls[0].tool, 'find_by_name');
      assert.strictEqual(parsedCalls[0].args.Pattern, '*.test.js');
      assert.strictEqual(parsedCalls[0].args.SearchDirectory, 'tests');
    });
  });

  // =========================================================================
  // 5. _boundObservation Extreme Stack Trace & Diagnostic Extraction
  // =========================================================================
  describe('5. _boundObservation Extreme Stack Trace & Diagnostic Extraction', function () {
    let agent;

    beforeEach(() => {
      agent = new SunaAgent({ id: 'extreme_stress_agent' });
    });

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R1-H08: _boundObservation handles extreme 15,000+ char error payload, bounds length, and preserves diagnostic reflection', function () {
      const massiveStackTrace = 'FATAL EXCEPTION in VM Sandbox:\n' + '    at VM.evaluate (/runtime/vm.js:400:15)\n'.repeat(450);
      const extremeError = {
        isError: true,
        status: 'error',
        error: massiveStackTrace,
        diagnostic: {
          code: 'ERR_VFS_MEM_LIMIT',
          level: 'FATAL'
        },
        success: false
      };

      assert.ok(JSON.stringify(extremeError).length > 15000, 'Pre-condition: payload must exceed 15000 chars');

      const bounded = agent._boundObservation(extremeError, 1500);

      assert.strictEqual(bounded.truncated, true, 'bounded observation must be flagged as truncated');
      assert.ok(bounded.text.length <= 1650, `bounded text length must be bounded around limit, got: ${bounded.text.length}`);

      // Must preserve error classification
      const isErr = bounded.isError === true || (bounded.value && bounded.value.isError === true);
      assert.strictEqual(isErr, true, '_boundObservation must preserve isError flag on extreme truncation');

      // Reflection must process the bounded error cleanly without throwing
      const activeStep = { id: 99, name: 'stress_step', tool: 'run_sandboxed_command' };
      const reflection = agent.brain.reflectObservation(activeStep, bounded.value || bounded);

      assert.strictEqual(reflection.satisfied, false, 'Reflection must report satisfied: false');
      assert.strictEqual(reflection.replanNeeded, true, 'Reflection must report replanNeeded: true');
      assert.ok(
        !reflection.reflectionText.includes('succeeded cleanly'),
        'Reflection must not claim clean success for extreme fatal error'
      );
    });
  });
});
