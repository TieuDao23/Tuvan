'use strict';

/**
 * d:\Suna Chat\.agents\challenger_r1_2\test_r1_stress.js
 * 
 * Challenger 2 (teamwork_preview_challenger) — Empirical & Adversarial Stress Suite for Milestone R1
 * 
 * Focus Areas:
 * 1. Multi-step ReAct loop with mid-way replan:
 *    - In _runLegacy with direct plan injection
 *    - In autonomous agent.run() via brain.planHierarchy
 *    - Boundary when replan triggered at maxTurns limit
 *    - Guardrails circuit breaker trip under continuous failures
 * 2. Repeated steering calls & state preservation (running, paused, halted, malformed inputs)
 * 3. MultiSyntaxParser adversarial edge cases (XML code blocks, Markdown backticks, invalid JSON, JSON arrays with package names, false positive suppression)
 * 4. Reflection invariants under bounded (>1500 chars) and unbounded (<1500 chars) error and non-error observations
 */

const assert = require('assert');
const SunaAgent = require('../../suna_agent.js');
const SunaHarness = require('../../suna_harness.js');

let passedTests = 0;
let failedTests = 0;
const failures = [];

async function runTest(name, fn) {
  process.stdout.write(`  Testing: ${name}... `);
  try {
    await fn();
    console.log('PASS');
    passedTests++;
  } catch (err) {
    console.log('FAIL');
    console.error(`    Error: ${err.message}`);
    failures.push({ name, error: err });
    failedTests++;
  }
}

async function main() {
  console.log('================================================================');
  console.log('CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS SUITE (Milestone R1)');
  console.log('================================================================\n');

  // ===========================================================================
  // SECTION 1: Multi-Step ReAct Loop with Mid-Way Replan
  // ===========================================================================
  console.log('--- SECTION 1: Multi-Step ReAct Loop with Mid-Way Replan ---');

  await runTest('1.1 Autonomous agent.run() ReAct mid-way replan: step 2 of 3 fails -> brain replans -> completes cleanly', async () => {
    const agent = new SunaAgent({ id: 'react_auto_replan_agent' });
    if (agent.vfs) {
      agent.vfs.writeFile('app.js', 'const x = 42;');
    }

    let planGenerationCount = 0;
    agent.brain.planHierarchy = (intent, prompt) => {
      planGenerationCount++;
      if (planGenerationCount === 1) {
        // Initial 3-step plan: Step 1 succeeds, Step 2 fails, Step 3 should be replaced by replan
        return [
          { id: 1, name: 'inspect_source', tool: 'view_file', params: { path: 'app.js' } },
          { id: 2, name: 'patch_source_fail', tool: 'replace_file_content', params: { TargetFile: 'app.js', TargetContent: 'NON_EXISTENT_TXT', ReplacementContent: '100' } },
          { id: 3, name: 'verify_source', tool: 'view_file', params: { path: 'app.js' } }
        ];
      } else {
        // Remediated 2-step plan
        return [
          { id: 10, name: 'remediated_patch', tool: 'replace_file_content', params: { TargetFile: 'app.js', TargetContent: '42', ReplacementContent: '100' } },
          { id: 11, name: 'remediated_verify', tool: 'view_file', params: { path: 'app.js' } }
        ];
      }
    };

    const stepProgression = [];
    const result = await agent.run('Fix bug in app.js', {
      maxTurns: 6,
      onStep: (stepRes, turn) => {
        stepProgression.push({
          turn,
          name: stepRes.step.name,
          satisfied: stepRes.reflection ? stepRes.reflection.satisfied : null,
          replanNeeded: stepRes.reflection ? stepRes.reflection.replanNeeded : null
        });
      }
    });

    assert.strictEqual(result.status, 'completed', 'Final status must be completed after remediated plan completes');
    assert.strictEqual(planGenerationCount, 2, 'brain.planHierarchy must be called twice (initial + replan)');
    assert.strictEqual(result.turnsExecuted, 4, 'Must have executed exactly 4 turns');

    // Step progression verification
    assert.strictEqual(stepProgression[0].name, 'inspect_source');
    assert.strictEqual(stepProgression[0].satisfied, true);

    assert.strictEqual(stepProgression[1].name, 'patch_source_fail');
    assert.strictEqual(stepProgression[1].satisfied, false);
    assert.strictEqual(stepProgression[1].replanNeeded, true);

    assert.strictEqual(stepProgression[2].name, 'remediated_patch');
    assert.strictEqual(stepProgression[2].satisfied, true);

    assert.strictEqual(stepProgression[3].name, 'remediated_verify');
    assert.strictEqual(stepProgression[3].satisfied, true);

    // Verify VFS file was actually modified by remediated step
    assert.strictEqual(agent.vfs.readFile('app.js'), 'const x = 100;');
  });

  await runTest('1.2 Direct _runLegacy() ReAct replan with custom initial plan injection', async () => {
    const agent = new SunaAgent({ id: 'react_direct_legacy_agent' });
    if (agent.vfs) {
      agent.vfs.writeFile('target.js', 'console.log("hello");');
    }

    const initialPlan = [
      { id: 1, name: 'step1_view', tool: 'view_file', params: { path: 'target.js' } },
      { id: 2, name: 'step2_fail', tool: 'replace_file_content', params: { TargetFile: 'target.js', TargetContent: 'NONEXISTENT', ReplacementContent: 'X' } }
    ];

    let replanCalled = false;
    agent.brain.planHierarchy = (intent, prompt) => {
      replanCalled = true;
      return [
        { id: 10, name: 'step10_fix', tool: 'replace_file_content', params: { TargetFile: 'target.js', TargetContent: 'hello', ReplacementContent: 'world' } }
      ];
    };

    const res = await agent._runLegacy('Fix target.js', { plan: initialPlan, maxTurns: 5 });

    assert.strictEqual(res.status, 'completed', 'Must complete successfully after replan');
    assert.strictEqual(replanCalled, true, 'Replan must be called');
    assert.strictEqual(res.turnsExecuted, 3, 'Must have executed 3 turns: step1, step2 (fail), step10 (fix)');
    assert.strictEqual(agent.vfs.readFile('target.js'), 'console.log("world");');
  });

  await runTest('1.3 Replan triggered at maxTurns limit exits with max_turns_exceeded cleanly', async () => {
    const agent = new SunaAgent({ id: 'replan_max_turns_agent' });
    if (agent.vfs) {
      agent.vfs.writeFile('app.js', 'let a = 1;');
    }

    agent.brain.planHierarchy = () => [
      { id: 1, name: 'inspect', tool: 'view_file', params: { path: 'app.js' } },
      { id: 2, name: 'fail', tool: 'replace_file_content', params: { TargetFile: 'app.js', TargetContent: 'MISSING', ReplacementContent: '2' } },
      { id: 3, name: 'verify', tool: 'view_file', params: { path: 'app.js' } }
    ];

    // maxTurns: 2 means step 1 succeeds (turn 1), step 2 fails and asks for replan (turn 2 == maxTurns)
    const result = await agent.run('Fix bug in app.js', { maxTurns: 2 });

    assert.strictEqual(result.status, 'max_turns_exceeded', 'Must terminate with max_turns_exceeded when turn limit reached');
    assert.strictEqual(result.turnsExecuted, 2, 'Must have executed exactly 2 turns');
  });

  await runTest('1.4 Continuous failure loop trips guardrails circuit breaker after 3 consecutive failures', async () => {
    const agent = new SunaAgent({ id: 'circuit_breaker_stress_agent' });
    agent.brain.planHierarchy = () => [
      { id: 1, name: 'fail', tool: 'replace_file_content', params: { TargetFile: 'ghost.js', TargetContent: 'A', ReplacementContent: 'B' } }
    ];

    const result = await agent.run('Task that repeatedly fails', { maxTurns: 5 });

    assert.strictEqual(result.status, 'halted', 'Circuit breaker must halt after 3 consecutive failures');
    assert.strictEqual(result.turnsExecuted, 3, 'Must halt after exactly 3 turns');
    assert.strictEqual(agent.consecutiveFailures, 3, 'consecutiveFailures must be 3');
    assert.ok(
      agent.haltReason.includes('3 consecutive times') || agent.haltReason.includes('consecutive step failures'),
      `haltReason must indicate 3 consecutive failures, got: "${agent.haltReason}"`
    );
  });

  // ===========================================================================
  // SECTION 2: Repeated Steering Calls and Steering While Running or Halted
  // ===========================================================================
  console.log('\n--- SECTION 2: Repeated Steering Calls & Steering Dynamics ---');

  await runTest('2.1 Repeated steering calls: valid inputs vs invalid inputs & memory persistence', async () => {
    const agent = new SunaAgent({ id: 'steer_stress_agent' });

    // Invalid inputs: must return false and not mutate state
    assert.strictEqual(agent.steer(''), false, 'Empty string must return false');
    assert.strictEqual(agent.steer('   '), false, 'Whitespace-only string must return false');
    assert.strictEqual(agent.steer(null), false, 'null must return false');
    assert.strictEqual(agent.steer(undefined), false, 'undefined must return false');
    assert.strictEqual(agent.steer(12345), false, 'number must return false');
    assert.strictEqual(agent.steer({ instruction: 'test' }), false, 'object must return false');
    assert.strictEqual(agent.steerInstructions.length, 0, 'No invalid instructions should be stored');

    // Repeated valid steering calls
    const instructions = [
      'Focus on error logs first',
      'Do not modify index.html',
      'Use find_by_name instead of list_dir',
      'Check test coverage before submitting',
      'A'.repeat(5000) // Extreme 5KB steer instruction
    ];

    for (const instr of instructions) {
      const ok = agent.steer(instr);
      assert.strictEqual(ok, true, `Steer "${instr.slice(0, 20)}..." must return true`);
    }

    assert.strictEqual(agent.steerInstructions.length, 5, 'All 5 valid instructions must be queued');
    assert.strictEqual(agent.memory.getFact('latest_steer'), instructions[4], 'SmartMemory must hold latest steer instruction');
  });

  await runTest('2.2 Steering while agent is halted: unabort, clear circuit breaker, reset status to idle', async () => {
    const agent = new SunaAgent({ id: 'steer_halted_agent' });

    // Simulate halted state from circuit breaker
    agent.status = 'halted';
    agent.isAgentAborted = true;
    agent.consecutiveFailures = 3;
    agent.haltReason = 'Circuit breaker tripped: 3 identical failures.';

    // Check pre-condition: execution must be blocked
    const preRes = await agent.executeStep('test prompt');
    assert.strictEqual(preRes.status, 'halted');
    assert.strictEqual(preRes.halted, true);

    // Call steer while halted
    const steered = agent.steer('Operator directive: unblock and inspect config.json');
    assert.strictEqual(steered, true);
    assert.strictEqual(agent.status, 'idle', 'Agent status must transition to idle');
    assert.strictEqual(agent.isAgentAborted, false, 'isAgentAborted must be false');
    assert.strictEqual(agent.consecutiveFailures, 0, 'consecutiveFailures must be 0');
    assert.strictEqual(agent.haltReason, null, 'haltReason must be cleared');

    // Post-condition: executeStep must now execute
    if (agent.vfs) agent.vfs.writeFile('config.json', '{"env":"test"}');
    const postRes = await agent.executeStep({ name: 'read_cfg', tool: 'view_file', params: { path: 'config.json' } });
    assert.notStrictEqual(postRes.status, 'halted');
  });

  await runTest('2.3 Steering while agent is running: preserves running status (does NOT revert to idle)', async () => {
    const agent = new SunaAgent({ id: 'steer_running_agent' });

    // Set status to running
    agent.status = 'running';
    agent.isAgentAborted = false;

    // Apply steer while running
    const steered = agent.steer('Steering injected mid-execution');
    assert.strictEqual(steered, true);
    assert.strictEqual(agent.status, 'running', 'Agent status must REMAIN "running" when steered during execution');
    assert.strictEqual(agent.isAgentAborted, false);
    assert.strictEqual(agent.memory.getFact('latest_steer'), 'Steering injected mid-execution');
  });

  await runTest('2.4 Steering while agent is paused: preserves paused status for subsequent resume()', async () => {
    const agent = new SunaAgent({ id: 'steer_paused_agent' });

    // Agent is paused
    agent.pause();
    assert.strictEqual(agent.status, 'paused', 'Pre-condition: agent status must be paused');

    // Steer while paused
    const steered = agent.steer('Adjust trajectory during pause');
    assert.strictEqual(steered, true);
    assert.strictEqual(agent.status, 'paused', 'Agent status must REMAIN "paused" so operator can resume()');

    // Resume agent
    const resumed = agent.resume();
    assert.strictEqual(resumed, true, 'resume() must succeed from paused state');
    assert.strictEqual(agent.status, 'running', 'Agent status must now be running');
  });

  // ===========================================================================
  // SECTION 3: Edge-Case Inputs in MultiSyntaxParser
  // ===========================================================================
  console.log('\n--- SECTION 3: Edge-Case Inputs in MultiSyntaxParser ---');

  const Parser = SunaAgent.MultiSyntaxParser;

  await runTest('3.1 MultiSyntaxParser: XML code blocks embedded inside Markdown backticks', () => {
    const text = [
      'Here is the tool call wrapped in a markdown XML code block:',
      '```xml',
      '<suna_tool_call tool="run_sandboxed_command">',
      '{"CommandLine": "node -v"}',
      '</suna_tool_call>',
      '```'
    ].join('\n');

    const calls = Parser.parse(text);
    assert.strictEqual(calls.length, 1, 'Embedded XML tool call inside markdown block must be detected');
    assert.strictEqual(calls[0].tool, 'run_sandboxed_command');
    assert.strictEqual(calls[0].args.CommandLine, 'node -v');
  });

  await runTest('3.2 MultiSyntaxParser: Unclosed markdown code blocks and mixed contents', () => {
    // Unclosed markdown block with genuine tool
    const unclosedMd = '```json\n{\n  "tool": "view_file",\n  "args": { "path": "index.html" }\n}';
    const calls1 = Parser.parse(unclosedMd);
    assert.ok(Array.isArray(calls1), 'Must return an array');

    // Markdown block with completely invalid unparseable junk
    const junkMd = '```json\nTHIS IS NOT JSON AT ALL {{{[[[\n```';
    const calls2 = Parser.parse(junkMd);
    assert.deepStrictEqual(calls2, [], 'Unparseable junk must result in empty calls array without throwing');
  });

  await runTest('3.3 MultiSyntaxParser: JSON arrays with package names, configurations, or manifests', () => {
    // Top-level JSON array with package names
    const arrayInput = JSON.stringify([
      { name: 'mocha', version: '^10.0.0' },
      { name: 'express', version: '^4.18.0' },
      { name: 'typescript', version: '^5.0.0' }
    ]);
    const calls1 = Parser.parse(arrayInput);
    assert.deepStrictEqual(calls1, [], 'Top-level JSON arrays with package names must NOT be parsed as tool calls');

    // Array inside markdown
    const mdArray = '```json\n' + arrayInput + '\n```';
    const calls2 = Parser.parse(mdArray);
    assert.deepStrictEqual(calls2, [], 'Markdown block with array must NOT be parsed as tool call');

    // String array
    const stringArray = '["suna-chat", "suna-harness", "suna-agent"]';
    assert.deepStrictEqual(Parser.parse(stringArray), []);
  });

  await runTest('3.4 MultiSyntaxParser: JSON objects with "name" but NOT genuine tool calls vs Genuine function calls', () => {
    // Non-tool object 1: Person record
    const person = JSON.stringify({ name: 'Alice Smith', age: 28, city: 'London' });
    assert.deepStrictEqual(Parser.parse(person), [], 'Person record with "name" must NOT be parsed as tool');

    // Non-tool object 2: Config with name and version
    const cfg = JSON.stringify({ name: 'suna-plugin-logger', version: '1.2.3' });
    assert.deepStrictEqual(Parser.parse(cfg), [], 'Config with name and version must NOT be parsed as tool');

    // Non-tool object 3: Name with spaces or slashes
    const badName = JSON.stringify({ name: 'invalid tool name!', args: {} });
    assert.deepStrictEqual(Parser.parse(badName), [], 'Tool name with spaces/exclamations must be rejected');

    // Genuine Function Call 1: name + arguments (OpenAI format)
    const genuine1 = JSON.stringify({ name: 'list_dir', arguments: { DirectoryPath: '/app' } });
    const calls1 = Parser.parse(genuine1);
    assert.strictEqual(calls1.length, 1);
    assert.strictEqual(calls1[0].tool, 'list_dir');
    assert.strictEqual(calls1[0].args.DirectoryPath, '/app');

    // Genuine Function Call 2: name + type="function"
    const genuine2 = JSON.stringify({ name: 'verify_deployment', type: 'function' });
    const calls2 = Parser.parse(genuine2);
    assert.strictEqual(calls2.length, 1);
    assert.strictEqual(calls2[0].tool, 'verify_deployment');
  });

  await runTest('3.5 MultiSyntaxParser: Malformed and flexible XML attributes', () => {
    // Single quotes
    const singleQuote = "<tool_call tool='grep_search'>{\"Query\": \"abc\"}</tool_call>";
    const calls1 = Parser.parse(singleQuote);
    assert.strictEqual(calls1.length, 1);
    assert.strictEqual(calls1[0].tool, 'grep_search');
    assert.strictEqual(calls1[0].args.Query, 'abc');

    // Unquoted attribute
    const unquoted = '<tool_call tool=find_by_name>{"Pattern": "*.js"}</tool_call>';
    const calls2 = Parser.parse(unquoted);
    assert.strictEqual(calls2.length, 1);
    assert.strictEqual(calls2[0].tool, 'find_by_name');
    assert.strictEqual(calls2[0].args.Pattern, '*.js');

    // Auxiliary attributes (id, timeout)
    const auxAttrs = '<suna_tool_call id="call_123" tool="view_file" timeout="5000">{"path": "a.txt"}</suna_tool_call>';
    const calls3 = Parser.parse(auxAttrs);
    assert.strictEqual(calls3.length, 1);
    assert.strictEqual(calls3[0].tool, 'view_file');
    assert.strictEqual(calls3[0].args.path, 'a.txt');
  });

  // ===========================================================================
  // SECTION 4: Reflection Invariants Under Bounded & Unbounded Error Observations
  // ===========================================================================
  console.log('\n--- SECTION 4: Reflection Invariants Under Bounded & Unbounded Error Observations ---');

  const agent = new SunaAgent({ id: 'reflection_challenger_agent' });
  const brain = agent.brain;
  const dummyStep = { id: 1, name: 'execute_migration', tool: 'run_sandboxed_command' };

  await runTest('4.1 Bounded error (>1500 chars): error flags survive truncation and reflection signals replanNeeded', () => {
    const hugeStackTrace = 'Error: ETIMEDOUT\n' + '    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1146:16)\n'.repeat(50);
    const hugeError = {
      isError: true,
      status: 'error',
      error: hugeStackTrace,
      code: 'ETIMEDOUT',
      attempt: 3
    };

    const bounded = agent._boundObservation(hugeError, 1500);

    // Truncation envelope checks
    assert.strictEqual(bounded.truncated, true, 'Must be marked truncated');
    assert.strictEqual(bounded.isError, true, 'Envelope isError must be true');
    assert.strictEqual(bounded.status, 'error', 'Envelope status must be error');

    // Inner bounded value checks
    assert.strictEqual(bounded.value.isError, true, 'bounded.value.isError must be true');
    assert.strictEqual(bounded.value.status, 'error', 'bounded.value.status must be error');
    assert.ok(bounded.value.error.includes('truncated'), 'bounded.value.error must contain truncation notice');

    // Reflection invariant checks on bounded.value (as passed by executeStep)
    const ref = brain.reflectObservation(dummyStep, bounded.value);
    assert.strictEqual(ref.satisfied, false, 'Reflection must report satisfied: false');
    assert.strictEqual(ref.replanNeeded, true, 'Reflection must signal replanNeeded: true');
    assert.strictEqual(ref.nextAction, 'replan', 'Reflection nextAction must be replan');
    assert.ok(!ref.reflectionText.includes('succeeded cleanly'), 'Must NOT report clean success');
    assert.ok(ref.reflectionText.includes('Need remediation'), 'Must indicate need for remediation');
  });

  await runTest('4.2 Unbounded error (<1500 chars): reflection signals replanNeeded and error diagnosis', () => {
    const shortError = {
      isError: true,
      status: 'error',
      error: 'File /var/log/missing.log does not exist'
    };

    const bounded = agent._boundObservation(shortError, 1500);
    assert.strictEqual(bounded.truncated, false, 'Short error must not be truncated');
    assert.strictEqual(bounded.isError, true, 'isError must be preserved');

    // Pass bounded.value (as passed by executeStep)
    const ref = brain.reflectObservation(dummyStep, bounded.value);
    assert.strictEqual(ref.satisfied, false, 'satisfied must be false');
    assert.strictEqual(ref.replanNeeded, true, 'replanNeeded must be true');
    assert.ok(ref.reflectionText.includes('File /var/log/missing.log does not exist'));
  });

  await runTest('4.3 Error without explicit isError flag (success: false or status: "failed")', () => {
    const failedResult = {
      status: 'failed',
      success: false,
      message: 'Process killed by SIGKILL'
    };

    const bounded = agent._boundObservation(failedResult, 1500);
    assert.strictEqual(bounded.isError, true, '_boundObservation must infer isError: true from success: false');

    const ref = brain.reflectObservation(dummyStep, bounded.value);
    assert.strictEqual(ref.satisfied, false, 'Reflection must detect failure');
    assert.strictEqual(ref.replanNeeded, true, 'replanNeeded must be true');
  });

  await runTest('4.4 Exact boundary lengths: 1499, 1500, 1501 chars', () => {
    // Exact string at boundary
    const plainStr1500 = 'X'.repeat(1500);
    const bExact = agent._boundObservation(plainStr1500, 1500);
    assert.strictEqual(bExact.truncated, false, 'Exact 1500 length string must not be truncated');

    const plainStr1501 = 'Y'.repeat(1501);
    const bOver = agent._boundObservation(plainStr1501, 1500);
    assert.strictEqual(bOver.truncated, true, '1501 length string must be truncated');
  });

  await runTest('4.5 Clean success > 1500 chars is NOT falsely classified as error', () => {
    const bigSuccess = {
      status: 'success',
      data: 'Clean output line.\n'.repeat(120) // ~2400 chars
    };

    const bounded = agent._boundObservation(bigSuccess, 1500);
    assert.strictEqual(bounded.truncated, true, 'Must be truncated');
    assert.strictEqual(bounded.isError, undefined, 'Must NOT set isError on clean success');

    const ref = brain.reflectObservation(dummyStep, bounded.value);
    assert.strictEqual(ref.satisfied, true, 'Clean success even when truncated must be satisfied: true');
    assert.strictEqual(ref.nextAction, 'proceed', 'Clean success must proceed');
    assert.ok(ref.reflectionText.includes('succeeded cleanly'), 'Must report succeeded cleanly');
  });

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
  console.log(`PASSED:      ${passedTests}`);
  console.log(`FAILED:      ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    console.error('FAILURES DETECTED:');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.error.message}`);
    }
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL CHALLENGER ADVERSARIAL TESTS PASSED (100%).');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('FATAL TEST RUNNER ERROR:', err);
  process.exit(1);
});
