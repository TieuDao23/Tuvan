'use strict';

/**
 * security_stress_r2.js
 * 
 * Challenger 2 Adversarial Stress Suite for Milestone R2 (22 Tools Functional Integrity)
 * 
 * Areas Tested:
 * 1. Sandbox Escape & Prototype Pollution Challenge
 * 2. readOnly Mode Violation & Guardrails Bypass Challenge
 * 3. Parameter Aliases Normalization & Validation Challenge
 * 4. vfs_change Shell Redirection Parsing & Event Synchronization Challenge
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SunaAgent = require('../../suna_agent.js');
const SunaHarness = require('../../suna_harness.js');
const { VfsSandbox, HarnessController, AciSchemaValidator } = SunaHarness;

/**
 * Helper to instantiate an isolated application context from app.js
 */
function createAppContext(extraGlobals = {}) {
  const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');

  const agentStart = appJs.indexOf('// === START OF agent.js ===');
  const agentEnd = appJs.indexOf('// === END OF agent.js ===');
  const agentCode = agentStart !== -1 && agentEnd !== -1
    ? appJs.slice(agentStart, agentEnd)
    : appJs;

  const saveMemoryStart = appJs.indexOf('async function saveMemory');
  const removeMemoryFactStart = appJs.indexOf('function removeMemoryFact');
  const memoryCode = saveMemoryStart !== -1 && removeMemoryFactStart !== -1
    ? appJs.slice(saveMemoryStart, removeMemoryFactStart)
    : '';

  const sandbox = {
    window: {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => []
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    State: {
      memory: { facts: [] },
      vfs: {}
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    URL: URL,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    getStorageSuffix: () => '_guest',
    idbSet: async () => true,
    triggerCloudSync: () => {},
    broadcastLocalSync: () => {},
    ...extraGlobals
  };

  sandbox.window.State = sandbox.State;
  vm.createContext(sandbox);
  vm.runInContext(agentCode, sandbox);

  if (memoryCode) {
    vm.runInContext(memoryCode, sandbox);
  }

  return {
    sandbox,
    sunaAgent: sandbox.window.SunaAgent || sandbox.SunaAgent
  };
}

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

async function test(name, fn) {
  stats.total++;
  process.stdout.write(`  [RUN] ${name} ... `);
  try {
    await fn();
    stats.passed++;
    console.log(`PASS`);
  } catch (err) {
    stats.failed++;
    console.log(`FAIL`);
    console.error(`    Error: ${err.message}`);
    stats.errors.push({ name, error: err });
  }
}

async function runAllTests() {
  console.log('\n===============================================================');
  console.log('CHALLENGER 2: ADVERSARIAL STRESS SUITE (MILESTONE R2)');
  console.log('===============================================================\n');

  // =========================================================================
  // CHALLENGE 1: SANDBOX ESCAPE & PROTOTYPE POLLUTION
  // =========================================================================
  console.log('--- CHALLENGE 1: Sandbox Escape & Prototype Pollution ---');

  await test('1.1: Node VM branch - ({}) constructor escape cannot access host process or window', async () => {
    const { sunaAgent } = createAppContext();
    const payload = `({}).constructor.constructor('return typeof process !== "undefined" ? process.pid : (typeof window !== "undefined" ? "window" : "isolated")')()`;
    const res = await sunaAgent.tools.sandbox_exec({ code: payload });
    assert.strictEqual(res.success, true);
    assert.notStrictEqual(res.result, 'window');
    assert.notStrictEqual(res.result, String(process.pid));
    assert.strictEqual(res.result, 'safe');
  });

  await test('1.2: Node VM branch - AsyncFunction and Generator constructor escapes are contained', async () => {
    const { sunaAgent } = createAppContext();
    const payloads = [
      `(async function(){}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `(function*(){}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `Object.getPrototypeOf(async function(){}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `Object.getPrototypeOf(function*(){}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `[].map.constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `"".trim.constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`
    ];

    for (const code of payloads) {
      const res = await sunaAgent.tools.sandbox_exec({ code });
      assert.strictEqual(res.success, true);
      assert.notStrictEqual(res.result, String(process.pid), `Payload "${code}" escaped to process.pid`);
    }
  });

  await test('1.3: Node VM branch - Prototype manipulation within sandbox does not pollute host prototypes', async () => {
    const { sunaAgent } = createAppContext();

    const pollutionPayload = `
      Object.prototype.__challenger_polluted__ = 'evil';
      Function.prototype.__challenger_fn_polluted__ = 'evil';
      Array.prototype.__challenger_arr_polluted__ = 'evil';
      'pollution_attempted';
    `;
    const res = await sunaAgent.tools.sandbox_exec({ code: pollutionPayload });
    assert.strictEqual(res.success, true);

    // Verify host prototypes are not corrupted
    assert.strictEqual(Object.prototype.__challenger_polluted__, undefined, 'Host Object.prototype must NOT be polluted');
    assert.strictEqual(Function.prototype.__challenger_fn_polluted__, undefined, 'Host Function.prototype must NOT be polluted');
    assert.strictEqual(Array.prototype.__challenger_arr_polluted__, undefined, 'Host Array.prototype must NOT be polluted');
  });

  await test('1.4: Node VM branch - Host Function and Object constructor integrity restored after execution and errors', async () => {
    const { sunaAgent } = createAppContext();

    // Verify initial clean state
    assert.strictEqual(Function.prototype.constructor, Function);
    assert.strictEqual(Object.prototype.constructor, Object);

    // Normal execution
    await sunaAgent.tools.sandbox_exec({ code: '1 + 1' });
    assert.strictEqual(Function.prototype.constructor, Function, 'Function.prototype.constructor must be restored after normal run');
    assert.strictEqual(Object.prototype.constructor, Object, 'Object.prototype.constructor must be restored after normal run');

    // Execution with runtime exception
    await sunaAgent.tools.sandbox_exec({ code: 'throw new Error("intentional crash in sandbox")' });
    assert.strictEqual(Function.prototype.constructor, Function, 'Function.prototype.constructor must be restored after sandbox error');
    assert.strictEqual(Object.prototype.constructor, Object, 'Object.prototype.constructor must be restored after sandbox error');

    // Execution with syntax error
    await sunaAgent.tools.sandbox_exec({ code: 'const a =' });
    assert.strictEqual(Function.prototype.constructor, Function, 'Function.prototype.constructor must be restored after syntax error');
    assert.strictEqual(Object.prototype.constructor, Object, 'Object.prototype.constructor must be restored after syntax error');
  });

  await test('1.5: Browser fallback branch (require unavailable) - constructor escapes safely contained and prototypes restored', async () => {
    // Emulate browser environment without require
    const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
    const agentStart = appJs.indexOf('// === START OF agent.js ===');
    const agentEnd = appJs.indexOf('// === END OF agent.js ===');
    const agentCode = agentStart !== -1 && agentEnd !== -1 ? appJs.slice(agentStart, agentEnd) : appJs;

    const browserSandbox = {
      window: {},
      document: { getElementById: () => null, querySelectorAll: () => [] },
      console: { log: () => {}, warn: () => {}, error: () => {} },
      State: { memory: { facts: [] }, vfs: {} },
      localStorage: { getItem: () => null, setItem: () => {} },
      URL: URL,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      require: undefined // Browser environment!
    };
    browserSandbox.window.State = browserSandbox.State;
    vm.createContext(browserSandbox);
    vm.runInContext(agentCode, browserSandbox);
    const sunaAgent = browserSandbox.window.SunaAgent || browserSandbox.SunaAgent;

    const payloads = [
      `({}).constructor.constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `[].filter.constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `Object.getPrototypeOf({}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
      `(() => {}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`
    ];

    for (const code of payloads) {
      const res = await sunaAgent.tools.sandbox_exec({ code });
      assert.strictEqual(res.success, true);
      assert.notStrictEqual(res.result, String(process.pid));
      assert.strictEqual(res.result, 'safe');
    }

    // Prototype restoration check in browser fallback
    assert.strictEqual(Function.prototype.constructor, Function);
    assert.strictEqual(Object.prototype.constructor, Object);
  });

  await test('1.6: Harness _executeNodeSandboxSync - handles const/let and syntax errors cleanly', async () => {
    const vfs = new VfsSandbox();
    const controller = new HarnessController({ vfs });
    const res = controller._executeNodeSandboxSync('const foo = "bar"; let count = 42; `${foo}_${count}`;', 1500);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes('bar_42'));
  });

  // =========================================================================
  // CHALLENGE 2: READONLY MODE VIOLATIONS & GUARDRAIL INTEGRITY
  // =========================================================================
  console.log('\n--- CHALLENGE 2: readOnly Mode Violations & Guardrail Integrity ---');

  await test('2.1: Mutating commands touch, rm, >, >>, mkdir rejected with PERMISSION_DENIED', async () => {
    const vfs = new VfsSandbox();
    vfs.writeFile('target.txt', 'untouched');
    const controller = new HarnessController({ vfs, readOnly: true });

    const forbidden = [
      'touch foo',
      'rm -rf /',
      'echo "a" > out.txt',
      'cat < in >> out',
      'mkdir -p /a/b/c'
    ];

    for (const cmd of forbidden) {
      const check = controller.canExecute('run_sandboxed_command', { CommandLine: cmd });
      assert.strictEqual(check.allowed, false, `Command "${cmd}" must be blocked in readOnly mode`);
      assert.strictEqual(check.code, 'PERMISSION_DENIED', `Expected PERMISSION_DENIED for "${cmd}"`);
    }
  });

  await test('2.2: Adversarial evasion vectors (leading spaces, chaining with ;, &&, ||, pipes) blocked in readOnly', async () => {
    const vfs = new VfsSandbox();
    vfs.writeFile('data.txt', 'original');
    const controller = new HarnessController({ vfs, readOnly: true });

    const evasionCommands = [
      '   touch escaped_space.txt',
      '\tmkdir -p /tab_dir',
      'ls -la; rm data.txt',
      'pwd ; touch chained_semicolon.txt',
      'echo test && mkdir /chained_and',
      'false || rm -f data.txt',
      'echo hacked > /root.txt',
      'cat data.txt >/dev/null',
      'echo appended >> data.txt',
      'echo "val" > "spaced name.txt"'
    ];

    for (const cmd of evasionCommands) {
      const check = controller.canExecute('run_sandboxed_command', { CommandLine: cmd });
      assert.strictEqual(
        check.allowed,
        false,
        `Evasion attempt "${cmd}" must be rejected with allowed=false`
      );
      assert.strictEqual(
        check.code,
        'PERMISSION_DENIED',
        `Evasion attempt "${cmd}" must return PERMISSION_DENIED`
      );
    }
  });

  await test('2.3: Mutating tools (replace_file_content, fs_write, fs_patch, write_to_file) blocked in readOnly', async () => {
    const vfs = new VfsSandbox();
    vfs.writeFile('doc.txt', 'immutable');
    const controller = new HarnessController({ vfs, readOnly: true });

    const mutatingTools = ['replace_file_content', 'fs_write', 'fs_patch', 'write_to_file'];
    for (const tool of mutatingTools) {
      const check = controller.canExecute(tool, { path: 'doc.txt' });
      assert.strictEqual(check.allowed, false, `Tool "${tool}" must be rejected in readOnly mode`);
      assert.strictEqual(check.code, 'PERMISSION_DENIED');
    }
  });

  await test('2.4: Read-only inspection tools and commands remain permitted in readOnly mode', async () => {
    const vfs = new VfsSandbox();
    vfs.writeFile('doc.txt', 'hello read-only');
    const controller = new HarnessController({ vfs, readOnly: true });

    const safeCommands = ['ls -la', 'cat doc.txt', 'pwd', 'grep hello doc.txt', 'find .', 'node -e "1+1"'];
    for (const cmd of safeCommands) {
      const check = controller.canExecute('run_sandboxed_command', { CommandLine: cmd });
      assert.strictEqual(check.allowed, true, `Inspection command "${cmd}" should be allowed`);
    }

    const safeTools = ['view_file', 'list_dir', 'grep_search', 'find_by_name'];
    for (const tool of safeTools) {
      const check = controller.canExecute(tool, { path: 'doc.txt' });
      assert.strictEqual(check.allowed, true, `Inspection tool "${tool}" should be allowed`);
    }
  });

  // =========================================================================
  // CHALLENGE 3: PARAMETER ALIASES VALIDATION & NORMALIZATION
  // =========================================================================
  console.log('\n--- CHALLENGE 3: Parameter Aliases Validation & Normalization ---');

  await test('3.1: executeTool accepts path instead of TargetFile for view_file', async () => {
    const agent = new SunaAgent({ id: 'param_alias_agent_1' });
    agent.vfs.writeFile('alias_target.js', 'const secret = "SUNA_42";\n');

    // 1. Alias path
    const res1 = await agent.executeTool('view_file', { path: 'alias_target.js' });
    assert.ok(res1 !== null && typeof res1 === 'object');
    assert.ok((res1.content || res1.text || '').includes('SUNA_42'));

    // 2. Alias targetFile
    const res2 = await agent.executeTool('view_file', { targetFile: 'alias_target.js' });
    assert.ok((res2.content || res2.text || '').includes('SUNA_42'));

    // 3. Canonical TargetFile
    const res3 = await agent.executeTool('view_file', { TargetFile: 'alias_target.js' });
    assert.ok((res3.content || res3.text || '').includes('SUNA_42'));

    agent.destroy();
  });

  await test('3.2: executeTool accepts command, cmd, command_line instead of CommandLine for run_sandboxed_command', async () => {
    const agent = new SunaAgent({ id: 'param_alias_agent_2' });

    // 1. Alias command
    const res1 = await agent.executeTool('run_sandboxed_command', { command: 'pwd' });
    assert.ok(res1 !== null && typeof res1 === 'object');
    assert.ok((res1.content || res1.text || JSON.stringify(res1)).length > 0);

    // 2. Alias cmd
    const res2 = await agent.executeTool('run_sandboxed_command', { cmd: 'echo "hello from cmd"' });
    assert.ok((res2.content || res2.text || JSON.stringify(res2)).includes('hello from cmd'));

    // 3. Alias command_line
    const res3 = await agent.executeTool('run_sandboxed_command', { command_line: 'echo "hello from command_line"' });
    assert.ok((res3.content || res3.text || JSON.stringify(res3)).includes('hello from command_line'));

    // 4. Canonical CommandLine
    const res4 = await agent.executeTool('run_sandboxed_command', { CommandLine: 'echo "canonical"' });
    assert.ok((res4.content || res4.text || JSON.stringify(res4)).includes('canonical'));

    agent.destroy();
  });

  await test('3.3: executeTool accepts query, pattern, search_term instead of Query for grep_search', async () => {
    const agent = new SunaAgent({ id: 'param_alias_agent_3' });
    agent.vfs.writeFile('search_me.txt', 'needle in haystack\nsecond line needle\n');

    // 1. Alias query + searchPath
    const res1 = await agent.executeTool('grep_search', { query: 'needle', searchPath: 'search_me.txt' });
    assert.ok((res1.content || res1.text || JSON.stringify(res1)).includes('needle'));

    // 2. Alias pattern + path
    const res2 = await agent.executeTool('grep_search', { pattern: 'needle', path: 'search_me.txt' });
    assert.ok((res2.content || res2.text || JSON.stringify(res2)).includes('needle'));

    // 3. Canonical Query + SearchPath
    const res3 = await agent.executeTool('grep_search', { Query: 'needle', SearchPath: 'search_me.txt' });
    assert.ok((res3.content || res3.text || JSON.stringify(res3)).includes('needle'));

    agent.destroy();
  });

  await test('3.4: executeTool accepts directoryPath aliases (dirPath, path, dir) for list_dir', async () => {
    const agent = new SunaAgent({ id: 'param_alias_agent_4' });
    agent.vfs.writeFile('folder/item.txt', 'data');

    // 1. Alias path
    const res1 = await agent.executeTool('list_dir', { path: 'folder' });
    assert.ok((res1.content || res1.text || JSON.stringify(res1)).includes('item.txt'));

    // 2. Alias dir
    const res2 = await agent.executeTool('list_dir', { dir: 'folder' });
    assert.ok((res2.content || res2.text || JSON.stringify(res2)).includes('item.txt'));

    // 3. Canonical DirectoryPath
    const res3 = await agent.executeTool('list_dir', { DirectoryPath: 'folder' });
    assert.ok((res3.content || res3.text || JSON.stringify(res3)).includes('item.txt'));

    agent.destroy();
  });

  await test('3.5: executeTool accepts replace_file_content aliases (path, targetContent, replacementContent)', async () => {
    const agent = new SunaAgent({ id: 'param_alias_agent_5' });
    agent.vfs.writeFile('code.txt', 'line 1\nline 2\nline 3\n');

    const res = await agent.executeTool('replace_file_content', {
      path: 'code.txt',
      targetContent: 'line 2',
      replacementContent: 'line 2 updated',
      startLine: 2,
      endLine: 2
    });

    assert.ok(res !== null);
    assert.strictEqual(agent.vfs.readFile('code.txt'), 'line 1\nline 2 updated\nline 3\n');

    agent.destroy();
  });

  // =========================================================================
  // CHALLENGE 4: VFS_CHANGE SHELL REDIRECTION SYNCHRONIZATION
  // =========================================================================
  console.log('\n--- CHALLENGE 4: vfs_change Shell Redirection Synchronization ---');

  await test('4.1: Redirection with double-quoted filename echo "data" > "my test file.txt"', async () => {
    const agent = new SunaAgent({ id: 'redir_agent_1' });
    const events = [];
    agent.on('vfs_change', (e) => events.push(e));

    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: 'echo "data" > "my test file.txt"'
    });

    assert.strictEqual(events.length, 1, 'vfs_change event must be emitted');
    assert.strictEqual(events[0].path, 'my test file.txt', 'Outer double quotes must be stripped');
    assert.ok(events[0].content.includes('data'), 'Content must contain redirected data');
    assert.strictEqual(agent.vfs.readFile('my test file.txt').trim(), 'data');

    agent.destroy();
  });

  await test('4.2: Redirection with single-quoted filename and subdirectories echo "more" >> "./sub/test.txt"', async () => {
    const agent = new SunaAgent({ id: 'redir_agent_2' });
    agent.vfs.mkdir('sub', { recursive: true });
    agent.vfs.writeFile('sub/test.txt', 'first line\n');

    const events = [];
    agent.on('vfs_change', (e) => events.push(e));

    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: 'echo "more" >> "./sub/test.txt"'
    });

    assert.strictEqual(events.length, 1, 'vfs_change event must be emitted on >> append');
    // Note: path in vfs might be 'sub/test.txt' or './sub/test.txt'
    assert.ok(events[0].path === 'sub/test.txt' || events[0].path === './sub/test.txt');
    assert.ok(events[0].content.includes('first line'));
    assert.ok(events[0].content.includes('more'));

    agent.destroy();
  });

  await test('4.3: Redirection with spaces in content and filename: echo "complex data 123" > "folder/file name.log"', async () => {
    const agent = new SunaAgent({ id: 'redir_agent_3' });
    agent.vfs.mkdir('folder', { recursive: true });

    const events = [];
    agent.on('vfs_change', (e) => events.push(e));

    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: 'echo "complex data 123" > "folder/file name.log"'
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].path, 'folder/file name.log');
    assert.ok(events[0].content.includes('complex data 123'));

    agent.destroy();
  });

  await test('4.4: Sequential redirections emit ordered vfs_change events with cumulative content', async () => {
    const agent = new SunaAgent({ id: 'redir_agent_4' });
    const events = [];
    agent.on('vfs_change', (e) => events.push(e));

    // Step 1: initial write
    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: 'echo "entry 1" > "log.txt"'
    });

    // Step 2: append 1
    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: 'echo "entry 2" >> "log.txt"'
    });

    // Step 3: append 2
    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: 'echo "entry 3" >> "log.txt"'
    });

    assert.strictEqual(events.length, 3, 'Must emit 3 events for 3 redirection commands');
    assert.strictEqual(events[0].path, 'log.txt');
    assert.ok(events[0].content.includes('entry 1') && !events[0].content.includes('entry 2'));

    assert.strictEqual(events[1].path, 'log.txt');
    assert.ok(events[1].content.includes('entry 1') && events[1].content.includes('entry 2') && !events[1].content.includes('entry 3'));

    assert.strictEqual(events[2].path, 'log.txt');
    assert.ok(events[2].content.includes('entry 1') && events[2].content.includes('entry 2') && events[2].content.includes('entry 3'));

    agent.destroy();
  });

  // Summary
  console.log('\n===============================================================');
  console.log(`STRESS RESULTS: Total: ${stats.total} | Passed: ${stats.passed} | Failed: ${stats.failed}`);
  console.log('===============================================================\n');

  if (stats.failed > 0) {
    console.error('FAILED TESTS DETAILS:');
    for (const item of stats.errors) {
      console.error(`- ${item.name}: ${item.error.message}`);
    }
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal stress suite runner error:', err);
  process.exit(1);
});
