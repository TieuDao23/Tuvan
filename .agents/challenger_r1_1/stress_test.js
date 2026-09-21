'use strict';

/**
 * stress_test.js
 * 
 * Adversarial Stress Test Suite for Milestone R1 (Suna Agent Lifecycle & Core)
 * Author: Challenger 1 (teamwork_preview_challenger)
 * 
 * Objectives:
 * 1. Standalone SunaAgent stress test (multiple instances, zero options, distinct tool calls, concurrent execution, no VFS errors)
 * 2. Multi-step ReAct loop stress test (4+ steps, sequential execution, mocked & real satisfaction, status completed)
 * 3. Steering & abort recovery (circuit breaker tripping, state verification, steer reset to idle, subsequent execution succeeds)
 * 4. Parser adversarial stress test (package.json, tsconfig.json, JSON with comments, nested configs, 0 false positives)
 * 5. Long error reflection (20,000+ char stack trace, truncation bound, flag preservation, reflection satisfied: false)
 */

const assert = require('assert');
const SunaAgent = require('../../suna_agent.js');
const SunaHarness = require('../../suna_harness.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.stack || err.message}`);
  }
}

async function runAll() {
  console.log('================================================================');
  console.log('CHALLENGER 1 ADVERSARIAL STRESS TEST SUITE — MILESTONE R1');
  console.log('================================================================\n');

  // =========================================================================
  // 1. STANDALONE SUNAAGENT STRESS TEST
  // =========================================================================
  console.log('--- TEST GROUP 1: Standalone SunaAgent Stress Test ---');

  await test('1.1: 10 SunaAgent instances instantiated with ZERO options have distinct, isolated VFS sandboxes', () => {
    const agents = [];
    for (let i = 0; i < 10; i++) {
      agents.push(new SunaAgent());
    }

    assert.strictEqual(agents.length, 10);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      assert.ok(a.vfs !== null && typeof a.vfs === 'object', `Agent #${i} must have non-null vfs`);
      assert.strictEqual(typeof a.vfs.readFile, 'function');
      assert.strictEqual(typeof a.vfs.writeFile, 'function');
      assert.strictEqual(typeof a.vfs.exists, 'function');

      // Unique file per instance
      a.vfs.writeFile(`instance_${i}.txt`, `Data from agent ${i}`);
    }

    // Verify isolation: Agent 0 must NOT see Agent 1's file
    for (let i = 0; i < agents.length; i++) {
      assert.strictEqual(agents[i].vfs.exists(`instance_${i}.txt`), true);
      const otherIdx = (i + 1) % agents.length;
      assert.strictEqual(agents[i].vfs.exists(`instance_${otherIdx}.txt`), false,
        `VFS isolation violation: Agent ${i} sees file from Agent ${otherIdx}`);
    }
  });

  await test('1.2: All 6 standard ACI tools are registered and functional on zero-option agents without external harness', async () => {
    const agent = new SunaAgent();
    const standardTools = ['list_dir', 'view_file', 'replace_file_content', 'grep_search', 'find_by_name', 'run_sandboxed_command'];
    for (const t of standardTools) {
      assert.ok(typeof agent.tools[t] === 'function', `Tool ${t} must be callable`);
      const registered = agent.getTool(t);
      assert.ok(registered !== null, `Tool ${t} must be in registry`);
    }

    // Populate file in VFS
    agent.vfs.writeFile('app.js', 'console.log("hello world");\nfunction test() { return 42; }\n');

    // Test list_dir
    const listRes = await agent.invokeAciTool('list_dir', { DirectoryPath: '' });
    assert.ok(Array.isArray(listRes) && listRes.some(item => item.name === 'app.js'),
      'list_dir must return array containing app.js');

    // Test view_file
    const viewRes = await agent.invokeAciTool('view_file', { AbsolutePath: 'app.js' });
    const viewStr = String(viewRes);
    assert.ok(viewStr.includes('console.log') || (viewRes.text && viewRes.text.includes('console.log')),
      'view_file must return file content');

    // Test grep_search
    const grepRes = await agent.invokeAciTool('grep_search', { SearchPath: 'app.js', Query: 'test' });
    assert.ok(Array.isArray(grepRes) && grepRes.some(item => item.content && item.content.includes('test')),
      'grep_search must find matching line');

    // Test find_by_name
    const findRes = await agent.invokeAciTool('find_by_name', { SearchDirectory: '', Pattern: '*.js' });
    assert.ok(Array.isArray(findRes) && findRes.some(item => item.name === 'app.js'),
      'find_by_name must locate app.js');

    // Test replace_file_content
    await agent.invokeAciTool('replace_file_content', {
      TargetFile: 'app.js',
      TargetContent: 'return 42;',
      ReplacementContent: 'return 100;'
    });
    assert.strictEqual(agent.vfs.readFile('app.js').includes('return 100;'), true,
      'replace_file_content must update VFS');

    // Test run_sandboxed_command
    const cmdRes = await agent.invokeAciTool('run_sandboxed_command', { CommandLine: 'echo 100' });
    const cmdOutput = cmdRes && cmdRes.stdout !== undefined ? cmdRes.stdout : String(cmdRes);
    assert.ok(cmdOutput.includes('100'), 'run_sandboxed_command must execute and return output');
  });

  await test('1.3: Standalone agent.run() executes multiple distinct tool calls sequentially with zero VFS errors', async () => {
    const agent = new SunaAgent();
    agent.vfs.writeFile('target.js', 'let counter = 0;\nfunction increment() { counter++; }\n');

    const distinctToolsPlan = [
      { id: 1, name: 'dir_check', tool: 'list_dir', params: { DirectoryPath: '' } },
      { id: 2, name: 'read_code', tool: 'view_file', params: { AbsolutePath: 'target.js' } },
      { id: 3, name: 'search_fn', tool: 'grep_search', params: { SearchPath: 'target.js', Query: 'increment' } },
      { id: 4, name: 'locate_file', tool: 'find_by_name', params: { SearchDirectory: '', Pattern: 'target.js' } },
      { id: 5, name: 'edit_code', tool: 'replace_file_content', params: { TargetFile: 'target.js', TargetContent: 'counter++', ReplacementContent: 'counter += 10;' } },
      { id: 6, name: 'verify_syntax', tool: 'run_sandboxed_command', params: { CommandLine: 'node -c target.js' } }
    ];

    const result = await agent.run('Refactor counter increment in target.js', {
      plan: distinctToolsPlan,
      maxTurns: 10
    });

    assert.strictEqual(result.status, 'completed', `Expected completed status, got ${result.status}`);
    assert.strictEqual(result.haltReason, null);
    assert.strictEqual(result.results.length, 6, `Expected 6 tool step results, got ${result.results.length}`);

    // Verify no step produced "Harness VFS not attached"
    for (let i = 0; i < result.results.length; i++) {
      const stepRes = result.results[i];
      const err = (stepRes && stepRes.error) || (stepRes && stepRes.result && stepRes.result.error) || '';
      assert.ok(!String(err).includes('Harness VFS not attached'),
        `Step #${i} (${stepRes.step && stepRes.step.tool}) threw VFS attachment error: ${err}`);
      assert.strictEqual(stepRes.status, 'success', `Step #${i} must succeed`);
    }

    // Verify file in VFS was updated
    assert.strictEqual(agent.vfs.readFile('target.js').includes('counter += 10;'), true);
  });

  await test('1.4: Concurrently execute agent.run() across 5 independent instances with zero VFS attachment errors', async () => {
    const agents = Array.from({ length: 5 }, (_, i) => new SunaAgent({ id: `concurrent_${i}` }));
    
    // Seed each agent with files
    agents.forEach((ag, i) => {
      ag.vfs.writeFile(`data_${i}.json`, JSON.stringify({ index: i, active: true }));
    });

    const runPromises = agents.map((ag, i) => ag.run(`Inspect data_${i}.json and summarize`, { maxTurns: 2 }));
    const results = await Promise.all(runPromises);

    assert.strictEqual(results.length, 5);
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      assert.ok(res !== null && typeof res === 'object');
      assert.notStrictEqual(res.status, 'halted');
      assert.strictEqual(res.haltReason, null);

      if (Array.isArray(res.results)) {
        for (const stepRes of res.results) {
          const errText = (stepRes && stepRes.error) || (stepRes && stepRes.result && stepRes.result.error) || '';
          assert.ok(!errText.includes('Harness VFS not attached'),
            `Agent #${i} run had "Harness VFS not attached"`);
        }
      }
    }
  });

  // =========================================================================
  // 2. MULTI-STEP REACT LOOP STRESS TEST
  // =========================================================================
  console.log('\n--- TEST GROUP 2: Multi-step ReAct Loop Stress Test ---');

  await test('2.1: _runLegacy executes a 4+ step plan strictly in sequence and completes with status "completed"', async () => {
    const agent = new SunaAgent();
    agent.vfs.writeFile('pipeline.js', 'const a = 1;\nconst b = 2;\nmodule.exports = { a, b };\n');

    const fourPlusPlan = [
      { id: 1, name: 'step_1_list', tool: 'list_dir', params: { DirectoryPath: '' } },
      { id: 2, name: 'step_2_view', tool: 'view_file', params: { AbsolutePath: 'pipeline.js' } },
      { id: 3, name: 'step_3_grep', tool: 'grep_search', params: { SearchPath: 'pipeline.js', Query: 'module.exports' } },
      { id: 4, name: 'step_4_replace', tool: 'replace_file_content', params: { TargetFile: 'pipeline.js', TargetContent: 'const a = 1;', ReplacementContent: 'const a = 100;' } },
      { id: 5, name: 'step_5_verify_view', tool: 'view_file', params: { AbsolutePath: 'pipeline.js' } }
    ];

    const executedSteps = [];
    const turnsRecorded = [];

    const result = await agent._runLegacy('Execute 5-step workflow', {
      plan: fourPlusPlan,
      maxTurns: 10,
      onTurnStart: (t) => turnsRecorded.push(t),
      onStep: (stepRes) => {
        if (stepRes && stepRes.step) executedSteps.push(stepRes.step.name);
      }
    });

    assert.strictEqual(result.status, 'completed', `Expected status "completed", got "${result.status}"`);
    assert.strictEqual(result.results.length, 5, `Expected 5 results, got ${result.results.length}`);
    assert.deepStrictEqual(executedSteps, [
      'step_1_list',
      'step_2_view',
      'step_3_grep',
      'step_4_replace',
      'step_5_verify_view'
    ], 'All 5 steps must execute strictly in sequence');
    assert.deepStrictEqual(turnsRecorded, [1, 2, 3, 4, 5], 'Turns must advance 1, 2, 3, 4, 5');

    // Confirm file was modified in step 4
    assert.strictEqual(agent.vfs.readFile('pipeline.js').includes('const a = 100;'), true);
  });

  await test('2.2: _runLegacy with mocked step satisfaction executes all 4 steps sequentially and terminates with "completed"', async () => {
    const agent = new SunaAgent();

    // Mock steps with custom dummy tools
    agent.tools['custom_audit'] = async (args) => ({ status: 'success', audited: true });
    agent.tools['custom_build'] = async (args) => ({ status: 'success', built: true });
    agent.tools['custom_test'] = async (args) => ({ status: 'success', passed: 4 });
    agent.tools['custom_deploy'] = async (args) => ({ status: 'success', deployed: true });

    const mockedPlan = [
      { id: 1, name: 'audit_step', tool: 'custom_audit', params: {} },
      { id: 2, name: 'build_step', tool: 'custom_build', params: {} },
      { id: 3, name: 'test_step', tool: 'custom_test', params: {} },
      { id: 4, name: 'deploy_step', tool: 'custom_deploy', params: {} }
    ];

    const executed = [];
    const result = await agent._runLegacy('Execute mocked build pipeline', {
      plan: mockedPlan,
      maxTurns: 10,
      onStep: (stepRes) => {
        executed.push(stepRes.step.name);
      }
    });

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.results.length, 4);
    assert.deepStrictEqual(executed, ['audit_step', 'build_step', 'test_step', 'deploy_step']);
    for (const r of result.results) {
      assert.strictEqual(r.status, 'success');
      assert.strictEqual(r.reflection.satisfied, true);
    }
  });

  await test('2.3: _runLegacy terminates with "max_turns_exceeded" when maxTurns < plan.length without uncaught exception', async () => {
    const agent = new SunaAgent();
    agent.vfs.writeFile('test.txt', 'Hello');

    const fourStepPlan = [
      { id: 1, name: 's1', tool: 'list_dir', params: { DirectoryPath: '' } },
      { id: 2, name: 's2', tool: 'view_file', params: { AbsolutePath: 'test.txt' } },
      { id: 3, name: 's3', tool: 'list_dir', params: { DirectoryPath: '' } },
      { id: 4, name: 's4', tool: 'view_file', params: { AbsolutePath: 'test.txt' } }
    ];

    const result = await agent._runLegacy('Run with limited budget', {
      plan: fourStepPlan,
      maxTurns: 2
    });

    assert.strictEqual(result.status, 'max_turns_exceeded', `Expected "max_turns_exceeded", got "${result.status}"`);
    assert.strictEqual(result.results.length, 2, 'Should execute exactly 2 steps before budget exhaustion');
  });

  await test('2.4: _runLegacy recovers and replans if an intermediate step fails with replanNeeded: true', async () => {
    const agent = new SunaAgent();
    agent.vfs.writeFile('fix.js', 'let a = 1;');

    let callCount = 0;
    const origReflect = agent.brain.reflectObservation.bind(agent.brain);
    agent.brain.reflectObservation = (step, obs, ctx) => {
      callCount++;
      if (step.name === 'failing_step' && callCount === 1) {
        return {
          satisfied: false,
          replanNeeded: true,
          nextAction: 'replan',
          reflection: 'First attempt failed, replan required.'
        };
      }
      return origReflect(step, obs, ctx);
    };

    const initialPlan = [
      { id: 1, name: 'failing_step', tool: 'view_file', params: { AbsolutePath: 'fix.js' } }
    ];

    const result = await agent._runLegacy('Run with intentional replan', {
      plan: initialPlan,
      maxTurns: 5
    });

    // It should have replanned via brain.planHierarchy and continued
    assert.ok(result.results.length >= 2, 'Expected replanned execution with multiple steps');
    assert.strictEqual(result.status, 'completed', 'Replan workflow should eventually complete');
  });

  // =========================================================================
  // 3. STEERING & ABORT RECOVERY
  // =========================================================================
  console.log('\n--- TEST GROUP 3: Steering & Abort Recovery ---');

  await test('3.1: Circuit breaker trips after 3 consecutive failures, locking status to "halted"', async () => {
    const agent = new SunaAgent({ maxConsecutiveFailures: 3 });

    let tripEmitted = false;
    agent.on('circuit_breaker_tripped', () => { tripEmitted = true; });

    // Step that fails because file does not exist
    const failingStep = { id: 1, name: 'fail_step', tool: 'view_file', params: { AbsolutePath: 'nonexistent.txt' } };

    await agent.executeStep(failingStep);
    assert.strictEqual(agent.consecutiveFailures, 1);
    assert.strictEqual(agent.status, 'idle'); // Returns to idle when not halted

    await agent.executeStep(failingStep);
    assert.strictEqual(agent.consecutiveFailures, 2);
    assert.strictEqual(agent.status, 'idle');

    await agent.executeStep(failingStep);
    assert.strictEqual(agent.consecutiveFailures, 3);
    assert.strictEqual(agent.status, 'halted', 'Status must be "halted" after 3 failures');
    assert.strictEqual(agent.isAgentAborted, true, 'isAgentAborted must be true');
    assert.ok(tripEmitted, 'circuit_breaker_tripped event must be emitted');

    // Attempting further execution while halted must be immediately refused
    const blockedRes = await agent.executeStep(failingStep);
    assert.strictEqual(blockedRes.halted, true);
    assert.strictEqual(blockedRes.status, 'halted');
  });

  await test('3.2: agent.steer() resets consecutiveFailures to 0, status to "idle", isAgentAborted to false, and permits execution', async () => {
    const agent = new SunaAgent({ maxConsecutiveFailures: 3 });
    const failingStep = { id: 1, name: 'fail', tool: 'view_file', params: { AbsolutePath: 'bad.txt' } };

    // Trip circuit breaker
    await agent.executeStep(failingStep);
    await agent.executeStep(failingStep);
    await agent.executeStep(failingStep);
    assert.strictEqual(agent.status, 'halted');
    assert.strictEqual(agent.isAgentAborted, true);

    // Call steer()
    let steerEmitted = false;
    agent.on('steer_applied', () => { steerEmitted = true; });

    const steerResult = agent.steer('Stop reading bad.txt, view good.txt instead');
    assert.strictEqual(steerResult, true, 'steer() should return true');
    assert.ok(steerEmitted, 'steer_applied event must be emitted');

    // Verify state restored
    assert.strictEqual(agent.status, 'idle', 'Status must be reset to "idle"');
    assert.strictEqual(agent.isAgentAborted, false, 'isAgentAborted must be reset to false');
    assert.strictEqual(agent.consecutiveFailures, 0, 'consecutiveFailures must be reset to 0');
    assert.strictEqual(agent.haltReason, null, 'haltReason must be null');

    // Create good file and execute succeeding step
    agent.vfs.writeFile('good.txt', 'Content in good.txt');
    const goodStep = { id: 2, name: 'good', tool: 'view_file', params: { AbsolutePath: 'good.txt' } };
    const goodRes = await agent.executeStep(goodStep);

    assert.notStrictEqual(goodRes.status, 'halted', 'Subsequent step must execute');
    assert.strictEqual(agent.consecutiveFailures, 0, 'Successful execution keeps consecutiveFailures at 0');
  });

  await test('3.3: agent.steer() preserves "paused" status if agent was paused (not halted)', () => {
    const agent = new SunaAgent();
    agent.status = 'paused';

    const steerRes = agent.steer('Instruction while paused');
    assert.strictEqual(steerRes, true);
    assert.strictEqual(agent.status, 'paused', 'steer() must NOT overwrite "paused" with "idle"');

    // Verify resume() works after paused steer
    const resumeRes = agent.resume();
    assert.strictEqual(resumeRes, true);
    assert.strictEqual(agent.status, 'running');
  });

  await test('3.4: Multiple consecutive circuit breaker trips and steer() recoveries cycle reliably', async () => {
    const agent = new SunaAgent({ maxConsecutiveFailures: 2 });
    const failStep = { id: 1, name: 'f', tool: 'view_file', params: { AbsolutePath: 'missing.txt' } };
    agent.vfs.writeFile('ok.txt', 'Fine');
    const okStep = { id: 2, name: 'ok', tool: 'view_file', params: { AbsolutePath: 'ok.txt' } };

    // Cycle 1: Fail -> Trip -> Steer -> Succeed
    await agent.executeStep(failStep);
    await agent.executeStep(failStep);
    assert.strictEqual(agent.status, 'halted');
    agent.steer('Recover cycle 1');
    assert.strictEqual(agent.status, 'idle');
    const res1 = await agent.executeStep(okStep);
    assert.strictEqual(res1.status, 'success');

    // Cycle 2: Fail -> Trip -> Steer -> Succeed
    await agent.executeStep(failStep);
    await agent.executeStep(failStep);
    assert.strictEqual(agent.status, 'halted');
    agent.steer('Recover cycle 2');
    assert.strictEqual(agent.status, 'idle');
    const res2 = await agent.executeStep(okStep);
    assert.strictEqual(res2.status, 'success');
  });

  // =========================================================================
  // 4. PARSER ADVERSARIAL STRESS TEST
  // =========================================================================
  console.log('\n--- TEST GROUP 4: Parser Adversarial Stress Test ---');

  const MultiSyntaxParser = SunaAgent.MultiSyntaxParser || SunaAgent.prototype.MultiSyntaxParser;

  await test('4.1: MultiSyntaxParser rejects full standard package.json (0 false positive tool calls)', () => {
    const pkgJson = JSON.stringify({
      name: "suna-chat-desktop",
      version: "2.4.0",
      description: "Desktop client for Suna Chat",
      main: "main.js",
      scripts: {
        start: "electron .",
        test: "mocha tests/**/*.js"
      },
      repository: {
        type: "git",
        url: "https://github.com/tieudao23/suna-chat.git"
      },
      keywords: ["ai", "assistant", "react"],
      author: "TieuDao23",
      license: "MIT",
      dependencies: {
        express: "^4.19.2",
        ws: "^8.16.0"
      },
      devDependencies: {
        mocha: "^10.4.0"
      }
    }, null, 2);

    const calls = MultiSyntaxParser.parse(pkgJson);
    assert.strictEqual(calls.length, 0, `Expected 0 tool calls from package.json, got: ${JSON.stringify(calls)}`);

    // In markdown codeblock
    const mdBlock = "Here is the project manifest:\n```json\n" + pkgJson + "\n```\nLet me know what you think.";
    const mdCalls = MultiSyntaxParser.parse(mdBlock);
    assert.strictEqual(mdCalls.length, 0, `Expected 0 tool calls from markdown package.json, got: ${JSON.stringify(mdCalls)}`);
  });

  await test('4.2: MultiSyntaxParser rejects tsconfig.json and build configs with comments (0 false positives)', () => {
    const tsconfig = `{
      // TypeScript configuration
      "compilerOptions": {
        "target": "ES2022",
        "module": "commonjs",
        /* strict type checking */
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
      },
      "include": ["src/**/*"],
      "exclude": ["node_modules", "dist"]
    }`;

    const calls = MultiSyntaxParser.parse(tsconfig);
    assert.strictEqual(calls.length, 0, `Expected 0 tool calls from tsconfig.json, got: ${JSON.stringify(calls)}`);
  });

  await test('4.3: MultiSyntaxParser rejects JSON with "name" but no tool/arguments/params/type (0 false positives)', () => {
    const jsonWithNameOnly = JSON.stringify({
      name: "awesome-feature-flag",
      enabled: true,
      rolloutPercentage: 50,
      tags: ["experiment", "v2"]
    });

    const calls = MultiSyntaxParser.parse(jsonWithNameOnly);
    assert.strictEqual(calls.length, 0, `Expected 0 tool calls from data object with "name", got: ${JSON.stringify(calls)}`);

    const scopedPkg = JSON.stringify({
      name: "@scoped/ui-components",
      version: "1.0.0"
    });
    const scopedCalls = MultiSyntaxParser.parse(scopedPkg);
    assert.strictEqual(scopedCalls.length, 0, 'Expected 0 tool calls from scoped package name');

    const spaceName = JSON.stringify({
      name: "my application name",
      description: "App with spaces in name"
    });
    const spaceCalls = MultiSyntaxParser.parse(spaceName);
    assert.strictEqual(spaceCalls.length, 0, 'Expected 0 tool calls from name with spaces');
  });

  await test('4.4: MultiSyntaxParser rejects deeply nested manifests and configs', () => {
    const nestedManifest = JSON.stringify({
      name: "root-workspace",
      workspaces: ["packages/*"],
      publishConfig: { access: "public" },
      engines: { node: ">=18.0.0" }
    });
    const nestedCalls = MultiSyntaxParser.parse(nestedManifest);
    assert.strictEqual(nestedCalls.length, 0);

    const lernaConfig = JSON.stringify({
      version: "1.0.0",
      npmClient: "yarn",
      useWorkspaces: true
    });
    const lernaCalls = MultiSyntaxParser.parse(lernaConfig);
    assert.strictEqual(lernaCalls.length, 0);
  });

  await test('4.5: MultiSyntaxParser correctly detects authentic OpenAI function calls, Markdown blocks, and XML tool calls', () => {
    // 1. OpenAI function call format in JSON
    const openAiFormat = JSON.stringify({
      name: "view_file",
      arguments: { AbsolutePath: "suna_agent.js" }
    });
    const openAiCalls = MultiSyntaxParser.parse(openAiFormat);
    assert.strictEqual(openAiCalls.length, 1);
    assert.strictEqual(openAiCalls[0].tool, "view_file");
    assert.strictEqual(openAiCalls[0].args.AbsolutePath, "suna_agent.js");

    // 2. OpenAI format with arguments as JSON string
    const openAiStringArgs = JSON.stringify({
      name: "list_dir",
      arguments: "{\"DirectoryPath\":\"src\"}"
    });
    const openAiStringCalls = MultiSyntaxParser.parse(openAiStringArgs);
    assert.strictEqual(openAiStringCalls.length, 1);
    assert.strictEqual(openAiStringCalls[0].tool, "list_dir");
    assert.strictEqual(openAiStringCalls[0].args.DirectoryPath, "src");

    // 3. XML <suna_tool_call>
    const xmlFormat = '<suna_tool_call tool="list_dir">{"DirectoryPath": "src"}</suna_tool_call>';
    const xmlCalls = MultiSyntaxParser.parse(xmlFormat);
    assert.strictEqual(xmlCalls.length, 1);
    assert.strictEqual(xmlCalls[0].tool, "list_dir");
    assert.strictEqual(xmlCalls[0].args.DirectoryPath, "src");

    // 4. XML <tool_call name="...">
    const xmlToolCall = '<tool_call name="grep_search"><Query>target</Query><SearchPath>app.js</SearchPath></tool_call>';
    const xmlToolCalls = MultiSyntaxParser.parse(xmlToolCall);
    assert.strictEqual(xmlToolCalls.length, 1);
    assert.strictEqual(xmlToolCalls[0].tool, "grep_search");
    assert.strictEqual(xmlToolCalls[0].args.Query, "target");

    // 5. Mixed content: package.json in markdown block AND authentic <tool_call>
    const mixed = `
Here is the package.json:
\`\`\`json
{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": { "lodash": "^4.17.21" }
}
\`\`\`

Now I will read the readme file:
<tool_call name="view_file">
  <path>README.md</path>
</tool_call>
`;
    const mixedCalls = MultiSyntaxParser.parse(mixed);
    assert.strictEqual(mixedCalls.length, 1, `Must detect exactly 1 tool call, got ${mixedCalls.length}`);
    assert.strictEqual(mixedCalls[0].tool, "view_file");
  });

  // =========================================================================
  // 5. LONG ERROR REFLECTION
  // =========================================================================
  console.log('\n--- TEST GROUP 5: Long Error Reflection ---');

  await test('5.1: 20,000 character error stack trace through _boundObservation preserves isError: true and status: "error"', () => {
    const agent = new SunaAgent();
    
    // Construct 20,000+ character realistic stack trace
    let hugeStackTrace = 'Error: CriticalDatabaseFailure: Connection pool exhausted under heavy load\n';
    for (let i = 0; i < 300; i++) {
      hugeStackTrace += `    at executeQuery (d:\\Suna Chat\\src\\database\\pool.js:${100 + i}:${i * 2})\n`;
      hugeStackTrace += `    at async retryWithBackoff (d:\\Suna Chat\\src\\util\\retry.js:${200 + i}:${i * 3})\n`;
    }
    assert.ok(hugeStackTrace.length > 20000, `Stack trace length should be >20000 chars, got ${hugeStackTrace.length}`);

    const errorPayload = {
      isError: true,
      status: 'error',
      code: 'DB_CONNECTION_EXHAUSTED',
      error: hugeStackTrace,
      message: 'Failed to connect to cluster after 30 retries'
    };

    const bounded = agent._boundObservation(errorPayload, 1500);

    // Verify envelope bounds
    assert.strictEqual(bounded.truncated, true, 'Bounded observation must be marked truncated');
    assert.strictEqual(bounded.originalLength > 20000, true, 'originalLength must record full size');
    assert.ok(bounded.text.length <= 1500, `text length must be <= 1500 chars, got ${bounded.text.length}`);
    assert.strictEqual(bounded.isError, true, 'Outer envelope must preserve isError: true');
    assert.strictEqual(bounded.status, 'error', 'Outer envelope must preserve status: "error"');

    // Verify bounded inner value
    assert.ok(bounded.value !== null && typeof bounded.value === 'object');
    assert.strictEqual(bounded.value.isError, true, 'Inner value must preserve isError: true');
    assert.strictEqual(bounded.value.status, 'error', 'Inner value must preserve status: "error"');
    assert.strictEqual(bounded.value.truncated, true, 'Inner value must be marked truncated');
  });

  await test('5.2: OodaBrain.reflectObservation returns satisfied: false and replanNeeded: true on bounded 20,000 char error', () => {
    const agent = new SunaAgent();

    let hugeStackTrace = 'Error: StackOverflowException in AST recursion\n';
    while (hugeStackTrace.length < 22000) {
      hugeStackTrace += '    at parseExpression (d:\\Suna Chat\\parser.js:42:15)\n';
    }

    const rawError = {
      isError: true,
      status: 'error',
      error: hugeStackTrace
    };

    const bounded = agent._boundObservation(rawError, 1500);

    // Reflect using bounded envelope
    const step = { id: 1, name: 'execute_syntax_check', tool: 'run_sandboxed_command' };
    const reflectionFromEnvelope = agent.brain.reflectObservation(step, bounded);

    assert.strictEqual(reflectionFromEnvelope.satisfied, false, 'reflection.satisfied must be false');
    assert.strictEqual(reflectionFromEnvelope.replanNeeded, true, 'reflection.replanNeeded must be true');
    assert.strictEqual(reflectionFromEnvelope.nextAction, 'replan', 'reflection.nextAction must be "replan"');

    // Reflect using inner bounded value
    const reflectionFromValue = agent.brain.reflectObservation(step, bounded.value);
    assert.strictEqual(reflectionFromValue.satisfied, false, 'reflectionFromValue.satisfied must be false');
    assert.strictEqual(reflectionFromValue.replanNeeded, true, 'reflectionFromValue.replanNeeded must be true');
    assert.strictEqual(reflectionFromValue.nextAction, 'replan', 'reflectionFromValue.nextAction must be "replan"');
  });

  await test('5.3: Error object with success: false or status: "failed" without explicit isError also triggers isError: true and replanNeeded: true', () => {
    const agent = new SunaAgent();
    const failurePayload = {
      success: false,
      status: 'failed',
      error: 'x'.repeat(5000)
    };

    const bounded = agent._boundObservation(failurePayload, 1500);
    assert.strictEqual(bounded.isError, true);
    assert.strictEqual(bounded.status, 'error');

    const reflection = agent.brain.reflectObservation({ id: 1, name: 'test' }, bounded);
    assert.strictEqual(reflection.satisfied, false);
    assert.strictEqual(reflection.replanNeeded, true);
  });

  await test('5.4: Extreme 50,000 char error string payload retains diagnostic message in reflection', () => {
    const agent = new SunaAgent();
    const extreme50k = 'FatalError: OutOfMemory: Heap allocation failed\n' + 'stack frame line\n'.repeat(3000);
    assert.ok(extreme50k.length > 50000);

    const errorObj = {
      status: 'error',
      error: extreme50k
    };

    const bounded = agent._boundObservation(errorObj, 1500);
    assert.strictEqual(bounded.isError, true);
    assert.strictEqual(bounded.truncated, true);

    const reflection = agent.brain.reflectObservation({ id: 1, name: 'heavy_op' }, bounded);
    assert.strictEqual(reflection.satisfied, false);
    assert.strictEqual(reflection.replanNeeded, true);
    assert.ok(reflection.reflection.includes('FatalError') || reflection.reflection.includes('encountered diagnostic'));
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    console.error(`\nFAILED TESTS (${failedTests}):`);
    failures.forEach(f => console.error(`  - ${f.name}: ${f.error.message}`));
    process.exit(1);
  } else {
    console.log(`\nALL ${totalTests} ADVERSARIAL STRESS TESTS PASSED EMPIRICALLY!`);
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
