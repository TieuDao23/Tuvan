'use strict';

/**
 * tests/test_suna_r2_visible.js
 * 
 * Milestone R2: 22 Tools Functional Integrity — Visible Test Suite (60% Split - 15 Tests)
 * 
 * Author: teamwork_preview_test_writer
 * Authoritative Sources:
 * - ORIGINAL_REQUEST.md (Follow-up 2026-09-20T14:39:06Z, Requirement R2)
 * - orchestrator_10/implementation_plan.md
 * - explorer_o10_survey_2/survey_report.md & handoff.md
 * 
 * Covered Requirements:
 * 1. memory_store Persistence & Deduplication (R2-V01 .. R2-V02)
 * 2. fs_patch Universal Byte Length (R2-V03 .. R2-V04)
 * 3. replace_file_content Deletion Newline Hygiene (R2-V05 .. R2-V07)
 * 4. fetch_page_summary Network Error Handling (R2-V08 .. R2-V09)
 * 5. run_sandboxed_command & sandbox_exec Execution & Security (R2-V10 .. R2-V13)
 * 6. Parameter Aliases Normalization (R2-V14)
 * 7. vfs_change Shell Redirection Sync (R2-V15)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SunaAgent = require('../suna_agent.js');
const SunaHarness = require('../suna_harness.js');
const { VfsSandbox, HarnessController, AciSchemaValidator } = SunaHarness;

/**
 * Helper to instantiate an isolated application context from app.js
 * for testing client-side tool implementations directly.
 */
function createAppContext(extraGlobals = {}) {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  // Extract SunaAgent facade block
  const agentStart = appJs.indexOf('// === START OF agent.js ===');
  const agentEnd = appJs.indexOf('// === END OF agent.js ===');
  const agentCode = agentStart !== -1 && agentEnd !== -1
    ? appJs.slice(agentStart, agentEnd)
    : appJs;

  // Extract memory subsystem functions
  const saveMemoryStart = appJs.indexOf('async function saveMemory');
  const removeMemoryFactStart = appJs.indexOf('function removeMemoryFact');
  const memoryCode = saveMemoryStart !== -1 && removeMemoryFactStart !== -1
    ? appJs.slice(saveMemoryStart, removeMemoryFactStart)
    : '';

  const memoryCalls = {
    saveMemoryCount: 0,
    saveMemoryImmediate: null,
    addMemoryFactCount: 0
  };

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
    memoryCalls,
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
    sunaAgent: sandbox.window.SunaAgent || sandbox.SunaAgent,
    memoryCalls
  };
}

describe('Milestone R2: 22 Tools Functional Integrity — Visible Suite (15 Tests)', function () {
  this.timeout(15000);

  // =========================================================================
  // 1. memory_store Persistence & Deduplication
  // =========================================================================
  describe('1. memory_store Persistence & Deduplication', function () {
    it('R2-V01: storing a new fact triggers saveMemory(true) and persists state without premature array push dropping persistence', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      let saveMemoryCalled = false;
      let passedImmediate = null;
      sandbox.saveMemory = async function (immediate) {
        saveMemoryCalled = true;
        passedImmediate = immediate;
      };

      const result = await sunaAgent.tools.memory_store(
        { fact: 'User prefers dark mode and concise answers', category: 'preference' },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );

      assert.strictEqual(result.success, true, 'memory_store must succeed for valid fact');
      assert.strictEqual(sandbox.State.memory.facts.length, 1, 'State.memory.facts must contain exactly 1 fact');
      
      const stored = sandbox.State.memory.facts[0];
      const storedFact = typeof stored === 'string' ? stored : stored.fact;
      assert.strictEqual(storedFact, 'User prefers dark mode and concise answers');
      assert.strictEqual(saveMemoryCalled, true, 'saveMemory(true) must be called when storing a new fact');
      assert.strictEqual(passedImmediate, true, 'saveMemory must be invoked with immediate = true');
    });

    it('R2-V02: duplicate fact detection succeeds without premature push and does not trigger duplicate entries', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      let saveCalls = 0;
      sandbox.saveMemory = async function () {
        saveCalls++;
      };

      // 1. Store first fact
      const res1 = await sunaAgent.tools.memory_store(
        { fact: 'Preferred language: TypeScript', category: 'tech' },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );
      assert.strictEqual(res1.success, true);
      assert.strictEqual(sandbox.State.memory.facts.length, 1);

      const initialSaves = saveCalls;

      // 2. Store identical fact (should deduplicate and NOT push)
      const res2 = await sunaAgent.tools.memory_store(
        { fact: 'Preferred language: TypeScript', category: 'tech' },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );
      assert.strictEqual(res2.success, true, 'Deduplication should return success: true');
      assert.ok(
        (res2.message || '').includes('deduplicated') || (res2.message || '').includes('already exists'),
        'Message must indicate fact already exists in memory'
      );
      assert.strictEqual(sandbox.State.memory.facts.length, 1, 'Facts array length must remain 1 after duplicate');
    });
  });

  // =========================================================================
  // 2. fs_patch Universal Byte Length
  // =========================================================================
  describe('2. fs_patch Universal Byte Length', function () {
    it('R2-V03: fs_patch calculates byte length when Buffer and TextEncoder are undefined without throwing ReferenceError: content is not defined', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      // Initialize virtual file
      sandbox.State.vfs['index.html'] = {
        content: '<html><head><title>Old</title></head></html>',
        size: 44,
        lines: 1,
        updatedAt: Date.now()
      };

      // Explicitly delete Buffer and TextEncoder in sandbox to force fallback
      delete sandbox.Buffer;
      delete sandbox.TextEncoder;

      // Ensure content variable is NOT in scope
      let patchResult;
      let threwReferenceError = false;
      try {
        patchResult = await sunaAgent.tools.fs_patch(
          { path: 'index.html', search: 'Old', replace: 'New Title' },
          { State: sandbox.State }
        );
      } catch (err) {
        if (err instanceof ReferenceError && err.message.includes('content is not defined')) {
          threwReferenceError = true;
        }
        throw err;
      }

      assert.strictEqual(threwReferenceError, false, 'Must not throw ReferenceError: content is not defined');
      assert.strictEqual(patchResult.success, true, 'fs_patch must succeed in fallback byteLength environment');
      assert.ok(sandbox.State.vfs['index.html'].content.includes('New Title'));
      assert.strictEqual(typeof sandbox.State.vfs['index.html'].size, 'number', 'size must be a valid number');
      assert.ok(sandbox.State.vfs['index.html'].size > 0, 'size must be greater than 0');
    });

    it('R2-V04: fs_patch computes accurate UTF-8 multi-byte counts for Vietnamese strings when Buffer and TextEncoder are absent', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      const initialText = 'Tiêu đề gốc';
      const replacementText = 'Tiêu đề bài viết chuẩn Tiếng Việt với ký tự có dấu 🚀';
      const expectedUtf8Bytes = Buffer.byteLength(replacementText, 'utf8');

      sandbox.State.vfs['article.txt'] = {
        content: initialText,
        size: Buffer.byteLength(initialText, 'utf8'),
        lines: 1,
        updatedAt: Date.now()
      };

      // Strip Buffer and TextEncoder
      delete sandbox.Buffer;
      delete sandbox.TextEncoder;

      const patchResult = await sunaAgent.tools.fs_patch(
        { path: 'article.txt', search: initialText, replace: replacementText },
        { State: sandbox.State }
      );

      assert.strictEqual(patchResult.success, true);
      const patchedFile = sandbox.State.vfs['article.txt'];
      assert.strictEqual(patchedFile.content, replacementText);
      assert.strictEqual(
        patchedFile.size,
        expectedUtf8Bytes,
        `UTF-8 byte length must match authoritative oracle (${expectedUtf8Bytes} bytes), got ${patchedFile.size}`
      );
    });
  });

  // =========================================================================
  // 3. replace_file_content Deletion Newline Hygiene
  // =========================================================================
  describe('3. replace_file_content Deletion Newline Hygiene', function () {
    let vfs;

    beforeEach(() => {
      vfs = new VfsSandbox();
    });

    it('R2-V05: deleting a middle line with replacementContent: "" does NOT leave extraneous double newline (\\n\\n)', function () {
      const initial = 'line 1\nline 2\nline 3\nline 4\nline 5';
      vfs.writeFile('clean_delete.txt', initial);

      // Delete middle line 3
      vfs.replaceContent('clean_delete.txt', 'line 3', '', {
        startLine: 3,
        endLine: 3
      });

      const updated = vfs.readFile('clean_delete.txt');
      const expected = 'line 1\nline 2\nline 4\nline 5';

      assert.strictEqual(
        updated,
        expected,
        `Deleting middle line must produce exactly 4 clean lines without extraneous \\n\\n, got:\n${JSON.stringify(updated)}`
      );
      assert.ok(!updated.includes('line 2\n\nline 4'), 'Must not contain double newline between surrounding lines');
    });

    it('R2-V06: deleting top line (line 1) and bottom line does not leave leading or trailing blank lines', function () {
      // 1. Delete line 1
      vfs.writeFile('top_bottom.txt', 'first line\nsecond line\nthird line');
      vfs.replaceContent('top_bottom.txt', 'first line', '', {
        startLine: 1,
        endLine: 1
      });

      let content = vfs.readFile('top_bottom.txt');
      assert.strictEqual(content, 'second line\nthird line', 'Deleting line 1 must not leave a leading newline');

      // 2. Delete bottom line (line 2 of remaining 2 lines)
      vfs.replaceContent('top_bottom.txt', 'third line', '', {
        startLine: 2,
        endLine: 2
      });

      content = vfs.readFile('top_bottom.txt');
      assert.strictEqual(content, 'second line', 'Deleting last line must not leave a trailing newline');
    });

    it('R2-V07: previewReplaceDiff accurately previews line deletion without extraneous blank line', function () {
      const initial = 'alpha\nbeta\ngamma';
      vfs.writeFile('diff_preview.txt', initial);

      const preview = SunaHarness.VfsDiffEngine.previewReplaceDiff(vfs, 'diff_preview.txt', 'beta', '', {
        startLine: 2,
        endLine: 2
      });

      assert.strictEqual(preview.wouldSucceed, true, 'previewReplaceDiff must report wouldSucceed: true');
      if (preview.newContent) {
        assert.strictEqual(
          preview.newContent,
          'alpha\ngamma',
          'preview.newContent must not contain an empty blank line in place of deleted beta'
        );
      }
      if (preview.patch) {
        assert.ok(!preview.patch.includes('+\n'), 'Unified diff must not add an empty blank line');
        assert.ok(!preview.patch.includes('+ \n'), 'Unified diff must not add an empty blank line with space');
      }
    });
  });

  // =========================================================================
  // 4. fetch_page_summary Network Error Handling
  // =========================================================================
  describe('4. fetch_page_summary Network Error Handling', function () {
    it('R2-V08: network error returns { success: false, error: ... } and DOES NOT return fake Vietnamese mock HTML', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      // Mock fetchLinkContext to throw a network error
      sandbox.fetchLinkContext = async function () {
        throw new Error('Network timeout: connection refused by upstream host');
      };

      const result = await sunaAgent.tools.fetch_page_summary(
        { url: 'https://real-site-offline.org/data' },
        { fetchLinkContext: sandbox.fetchLinkContext }
      );

      assert.strictEqual(result.success, false, 'Network failure must return success: false');
      assert.ok(result.error !== undefined, 'Must provide an explicit error description');
      
      const content = result.content || '';
      assert.ok(!content.includes('Tiêu đề trang'), 'Must NOT return fake Vietnamese fallback title');
      assert.ok(!content.includes('Nội dung văn bản chính'), 'Must NOT return fake Vietnamese fallback body');
    });

    it('R2-V09: explicit args.mockHtml parameter is strictly respected for automated tests', async function () {
      const { sunaAgent } = createAppContext();

      const testHtml = '<html><body><h1>Custom Test Heading</h1><p>Expected content body.</p></body></html>';
      const result = await sunaAgent.tools.fetch_page_summary({
        url: 'https://unit-test.internal/page',
        mockHtml: testHtml
      });

      assert.strictEqual(result.success, true, 'Explicit mockHtml must succeed');
      assert.ok(result.content.includes('Custom Test Heading Expected content body.'));
    });
  });

  // =========================================================================
  // 5. run_sandboxed_command & sandbox_exec Execution & Security
  // =========================================================================
  describe('5. run_sandboxed_command & sandbox_exec Execution & Security', function () {
    it('R2-V10: code with const and let statements runs without SyntaxError: Unexpected token const', async function () {
      const { sunaAgent } = createAppContext();

      const codeWithDeclarations = 'const a = 15; let b = 25; const c = a + b; c;';
      const result = await sunaAgent.tools.sandbox_exec({ code: codeWithDeclarations });

      assert.strictEqual(result.success, true, `sandbox_exec must execute const/let without syntax error: ${result.error || ''}`);
      assert.strictEqual(result.result, '40', 'Result must equal evaluated expression 40');
    });

    it('R2-V11: repeated execution of const declarations in sandbox succeeds without identifier redeclaration conflict', async function () {
      const { sunaAgent } = createAppContext();

      const code1 = 'const x = 100; x * 2;';
      const res1 = await sunaAgent.tools.sandbox_exec({ code: code1 });
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res1.result, '200');

      const code2 = 'const x = 500; x + 50;';
      const res2 = await sunaAgent.tools.sandbox_exec({ code: code2 });
      assert.strictEqual(res2.success, true, 'Second execution with same const name must not collide');
      assert.strictEqual(res2.result, '550');
    });

    it('R2-V12: prototype constructor escape via ({}).constructor.constructor cannot access host window or process', async function () {
      const { sunaAgent } = createAppContext();

      const escapePayload = `({}).constructor.constructor('return typeof process !== "undefined" ? process.pid : (typeof window !== "undefined" ? "window" : "isolated")')()`;
      const result = await sunaAgent.tools.sandbox_exec({ code: escapePayload });

      assert.strictEqual(result.success, true);
      assert.notStrictEqual(result.result, 'window', 'Sandbox must not expose host window object');
      assert.strictEqual(
        typeof process !== 'undefined' && result.result === String(process.pid),
        false,
        'Sandbox must not expose host Node.js process object'
      );
    });

    it('R2-V13: readOnly mode blocks mutating commands (touch, rm, >, >>, mkdir) via run_sandboxed_command with PERMISSION_DENIED', async function () {
      const vfs = new VfsSandbox();
      vfs.writeFile('protected.txt', 'immutable content');
      const controller = new HarnessController({ vfs, readOnly: true, maxTurns: 5 });

      const mutatingCommands = [
        'touch new_file.txt',
        'mkdir -p /sub',
        'rm protected.txt',
        'echo "mutation" > protected.txt',
        'echo "append" >> protected.txt'
      ];

      for (const cmd of mutatingCommands) {
        const check = typeof controller.canExecute === 'function'
          ? controller.canExecute('run_sandboxed_command', { CommandLine: cmd })
          : controller.checkGuardrails('run_sandboxed_command', { CommandLine: cmd });
        assert.strictEqual(
          check.allowed,
          false,
          `Guardrail check must reject mutating command in readOnly mode: "${cmd}"`
        );
        assert.strictEqual(
          check.code,
          'PERMISSION_DENIED',
          `Rejection code must be PERMISSION_DENIED for "${cmd}"`
        );
      }

      // Read-only inspection commands should remain allowed
      const readCheck = typeof controller.canExecute === 'function'
        ? controller.canExecute('run_sandboxed_command', { CommandLine: 'ls -la' })
        : controller.checkGuardrails('run_sandboxed_command', { CommandLine: 'ls -la' });
      assert.strictEqual(readCheck.allowed, true, 'Inspection commands like "ls -la" must be allowed in readOnly mode');
    });
  });

  // =========================================================================
  // 6. Parameter Aliases Normalization
  // =========================================================================
  describe('6. Parameter Aliases Normalization', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R2-V14: executeTool accepts standard parameter aliases (path for TargetFile, query for Query, command for CommandLine)', async function () {
      agent = new SunaAgent({ id: 'alias_verification_agent' });
      if (agent.vfs && typeof agent.vfs.writeFile === 'function') {
        agent.vfs.writeFile('sample_code.js', 'const testValue = 99;\nconsole.log(testValue);\n');
      }

      // 1. Alias: path -> TargetFile in view_file
      const viewRes = await agent.executeTool('view_file', { path: 'sample_code.js' });
      assert.ok(viewRes !== null && typeof viewRes === 'object', 'view_file with alias "path" must execute successfully');
      assert.ok(
        (viewRes.content || viewRes.text || '').includes('testValue'),
        'view_file output must contain file content'
      );

      // 2. Alias: query -> Query in grep_search
      const grepRes = await agent.executeTool('grep_search', { query: 'testValue', SearchPath: 'sample_code.js' });
      assert.ok(grepRes !== null && typeof grepRes === 'object', 'grep_search with alias "query" must execute successfully');
      assert.ok(
        (grepRes.content || grepRes.text || JSON.stringify(grepRes)).includes('testValue'),
        'grep_search output must contain matched string'
      );

      // 3. Alias: command -> CommandLine in run_sandboxed_command
      const cmdRes = await agent.executeTool('run_sandboxed_command', { command: 'pwd' });
      assert.ok(cmdRes !== null && typeof cmdRes === 'object', 'run_sandboxed_command with alias "command" must execute successfully');
    });
  });

  // =========================================================================
  // 7. vfs_change Shell Redirection Sync
  // =========================================================================
  describe('7. vfs_change Shell Redirection Sync', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R2-V15: run_sandboxed_command with shell redirection > and >> emits vfs_change event with target path and content', async function () {
      agent = new SunaAgent({ id: 'vfs_change_redirection_agent' });
      const capturedEvents = [];

      agent.on('vfs_change', (eventData) => {
        capturedEvents.push(eventData);
      });

      // 1. Redirection with '>'
      await agent.invokeAciTool('run_sandboxed_command', {
        CommandLine: 'echo "alpha beta" > live_workspace_test.txt'
      });

      assert.strictEqual(
        capturedEvents.length,
        1,
        'vfs_change event must be emitted when shell redirection > creates/modifies a file'
      );
      assert.strictEqual(capturedEvents[0].path, 'live_workspace_test.txt', 'Event path must match redirection target');
      assert.ok(capturedEvents[0].content.includes('alpha beta'), 'Event content must match written output');

      // 2. Redirection with '>>'
      await agent.invokeAciTool('run_sandboxed_command', {
        CommandLine: 'echo "gamma delta" >> live_workspace_test.txt'
      });

      assert.strictEqual(
        capturedEvents.length,
        2,
        'vfs_change event must be emitted on subsequent append redirection >>'
      );
      assert.strictEqual(capturedEvents[1].path, 'live_workspace_test.txt');
      assert.ok(capturedEvents[1].content.includes('gamma delta'), 'Appended content must be reflected in event payload');
    });
  });
});
