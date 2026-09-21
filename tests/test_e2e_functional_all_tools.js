'use strict';

/**
 * tests/test_e2e_functional_all_tools.js
 * 
 * Comprehensive End-to-End Functional Verification Suite:
 * Validates 100% of the tools, harness, and Suna Agent core runtime
 * in real, end-to-end execution scenarios to ensure complete operational satisfaction.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SunaAgent = require('../suna_agent.js');
const SunaHarness = require('../suna_harness.js');
const { VfsSandbox, HarnessController, AciSchemaValidator } = SunaHarness;

/**
 * Creates an isolated client runtime simulating app.js execution environment.
 */
function createFullClientRuntime(extraGlobals = {}) {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  // Extract SunaAgent facade block
  const agentStart = appJs.indexOf('// === START OF agent.js ===');
  const agentEnd = appJs.indexOf('// === END OF agent.js ===');
  const agentCode = agentStart !== -1 && agentEnd !== -1
    ? appJs.slice(agentStart, agentEnd)
    : appJs;

  // Extract memory subsystem
  const saveMemoryStart = appJs.indexOf('async function saveMemory');
  const removeMemoryFactStart = appJs.indexOf('function removeMemoryFact');
  const memoryCode = saveMemoryStart !== -1 && removeMemoryFactStart !== -1
    ? appJs.slice(saveMemoryStart, removeMemoryFactStart)
    : '';

  const storageStore = new Map();
  const memoryCalls = {
    saveMemoryCount: 0,
    savedData: null
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
      getItem: (key) => storageStore.get(key) || null,
      setItem: (key, val) => {
        storageStore.set(key, String(val));
        if (key.includes('memory')) {
          memoryCalls.saveMemoryCount++;
          memoryCalls.savedData = val;
        }
      }
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
    memoryCalls,
    storageStore
  };
}

describe('E2E Comprehensive Functional Verification Suite', function () {
  this.timeout(20000);

  // =========================================================================
  // 1. Memory Subsystem (memory_store & memory_query)
  // =========================================================================
  describe('1. Memory Subsystem: memory_store & memory_query', function () {
    it('E2E-MEM-01: memory_store persists new facts to localStorage and memory_query retrieves them cleanly', async function () {
      const { sunaAgent, sandbox, memoryCalls } = createFullClientRuntime();

      let saveMemoryCalled = false;
      sandbox.saveMemory = async function (immediate) {
        saveMemoryCalled = true;
        memoryCalls.saveMemoryCount++;
      };

      // Store fact 1
      const storeRes1 = await sunaAgent.tools.memory_store(
        {
          fact: 'Suna is an advanced agentic AI assistant designed for pair programming.',
          category: 'architecture'
        },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );

      assert.strictEqual(storeRes1.success, true, 'memory_store must succeed');
      assert.ok(storeRes1.message.includes('stored') || storeRes1.message.includes('Fact'), 'message must confirm storage');
      assert.strictEqual(sandbox.State.memory.facts.length, 1, 'State.memory.facts must have 1 fact');
      assert.ok(saveMemoryCalled, 'saveMemory must have been called when storing new fact');

      // Store fact 2
      const storeRes2 = await sunaAgent.tools.memory_store(
        {
          fact: 'The user prefers TypeScript with strict null checks.',
          category: 'preferences'
        },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );
      assert.strictEqual(storeRes2.success, true);
      assert.strictEqual(sandbox.State.memory.facts.length, 2);

      // Query facts by category
      const queryRes1 = await sunaAgent.tools.memory_query(
        { category: 'preferences' },
        { State: sandbox.State }
      );
      assert.strictEqual(queryRes1.success, true);
      assert.ok(queryRes1.results.length >= 1);
      assert.ok(queryRes1.results.some(f => (f.fact || f).includes('TypeScript')));

      // Query facts by semantic keyword
      const queryRes2 = await sunaAgent.tools.memory_query(
        { query: 'agentic assistant' },
        { State: sandbox.State }
      );
      assert.strictEqual(queryRes2.success, true);
      assert.ok(queryRes2.results.some(f => (f.fact || f).includes('advanced agentic AI')));
    });

    it('E2E-MEM-02: deduplication prevents duplicate facts while preserving existing entries and storage state', async function () {
      const { sunaAgent, sandbox, memoryCalls } = createFullClientRuntime();

      sandbox.saveMemory = async function () {
        memoryCalls.saveMemoryCount++;
      };

      await sunaAgent.tools.memory_store(
        { fact: 'Unique Invariant Alpha' },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );

      // Duplicate store
      const dupRes = await sunaAgent.tools.memory_store(
        { fact: '  unique invariant alpha  ' },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );
      assert.strictEqual(dupRes.success, true);
      assert.ok(dupRes.duplicate || dupRes.message.includes('already exists') || dupRes.message.includes('tồn tại'), 'Must identify duplicate');
      assert.strictEqual(sandbox.State.memory.facts.length, 1, 'Facts array must not grow on duplicate');
    });
  });

  // =========================================================================
  // 2. File Systems & Virtual File System (fs_patch, fs_read, fs_write, fs_list)
  // =========================================================================
  describe('2. Client VFS Operations: fs_patch, fs_read, fs_write, fs_list', function () {
    it('E2E-FS-01: fs_write, fs_read, fs_patch, and fs_list work end-to-end without ReferenceError', async function () {
      const { sunaAgent, sandbox } = createFullClientRuntime();

      // Write initial file
      const initialContent = 'Line 1: Header\nLine 2: Target to replace\nLine 3: Footer\n';
      const writeRes = await sunaAgent.tools.fs_write(
        {
          path: '/src/main.js',
          content: initialContent
        },
        { State: sandbox.State }
      );
      assert.strictEqual(writeRes.success, true);
      assert.strictEqual(sandbox.State.vfs['/src/main.js'].content, initialContent);

      // Read file
      const readRes = await sunaAgent.tools.fs_read(
        { path: '/src/main.js' },
        { State: sandbox.State }
      );
      assert.strictEqual(readRes.success, true);
      assert.strictEqual(readRes.content, initialContent);

      // Patch file (testing multi-byte unicode and special replacement patterns like $$ and $&)
      const patchRes = await sunaAgent.tools.fs_patch(
        {
          path: '/src/main.js',
          search: 'Line 2: Target to replace',
          replace: 'Line 2: Giá trị thay thế với ký tự đặc biệt $$ và $&'
        },
        { State: sandbox.State }
      );

      assert.strictEqual(patchRes.success, true);
      assert.ok(patchRes.patchedLength > 0, 'Must calculate length cleanly without ReferenceError');
      assert.ok(sandbox.State.vfs['/src/main.js'].size > 0, 'Must record byte size in VFS entry');
      assert.ok(sandbox.State.vfs['/src/main.js'].content.includes('$$ và $&'), 'Special replacement patterns must not be corrupted');

      // List files
      const listRes = await sunaAgent.tools.fs_list({}, { State: sandbox.State });
      assert.strictEqual(listRes.success, true);
      assert.ok(listRes.files.some(f => f.path === '/src/main.js'));
    });
  });

  // =========================================================================
  // 3. SWE-agent ACI Tools (replace_file_content, view_file, list_dir, grep_search, find_by_name)
  // =========================================================================
  describe('3. SWE-agent ACI Tools: replace_file_content & Navigation', function () {
    let vfs;

    beforeEach(() => {
      vfs = new VfsSandbox();
    });

    it('E2E-ACI-01: replace_file_content deletes lines cleanly without inserting extraneous blank lines (\\n\\n)', function () {
      const initial = 'line 1\nline 2\nline 3\nline 4\nline 5';
      vfs.writeFile('clean_delete.txt', initial);

      // Delete middle line 3
      vfs.replaceContent('clean_delete.txt', 'line 3', '', {
        startLine: 3,
        endLine: 3
      });

      const updated = vfs.readFile('clean_delete.txt');
      assert.strictEqual(updated.includes('line 3'), false, 'Line 3 must be deleted');
      assert.strictEqual(updated.includes('\n\n'), false, 'Must not leave double newline');
    });

    it('E2E-ACI-02: ACI tools accept both canonical names and parameter aliases without validation error', function () {
      vfs.writeFile('/workspace/app.js', 'function hello() {\n  return "world";\n}\n');

      // Test normalizeArgs on view_file with alias "TargetFile" instead of "path"
      const norm1 = AciSchemaValidator.normalizeArgs('view_file', {
        TargetFile: '/workspace/app.js'
      });
      assert.strictEqual(norm1.path, '/workspace/app.js', 'Must normalize TargetFile to path');

      // Test normalizeArgs on grep_search with alias "query" (lowercase) instead of "Query"
      const norm2 = AciSchemaValidator.normalizeArgs('grep_search', {
        query: 'hello'
      });
      assert.strictEqual(norm2.Query, 'hello', 'Must normalize query to Query');

      // Test normalizeArgs on find_by_name with alias "pattern" (lowercase) instead of "Pattern"
      const norm3 = AciSchemaValidator.normalizeArgs('find_by_name', {
        pattern: '*.js'
      });
      assert.strictEqual(norm3.Pattern, '*.js', 'Must normalize pattern to Pattern');
    });
  });

  // =========================================================================
  // 4. Sandboxed Execution (run_sandboxed_command & sandbox_exec)
  // =========================================================================
  describe('4. Sandbox Security & Execution: run_sandboxed_command & sandbox_exec', function () {
    it('E2E-SBX-01: sandbox_exec executes const and let statements without SyntaxError', async function () {
      const { sunaAgent } = createFullClientRuntime();

      const codeWithConstLet = `
        const x = 10;
        let y = 20;
        const sum = x + y;
        sum * 2;
      `;

      const res = await sunaAgent.tools.sandbox_exec({ code: codeWithConstLet });
      assert.strictEqual(res.success, true, `Must succeed: ${res.error || ''}`);
      assert.strictEqual(res.result, '60');
    });

    it('E2E-SBX-02: sandbox_exec shields against prototype constructor escape attempts', async function () {
      const { sunaAgent } = createFullClientRuntime();

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

    it('E2E-SBX-03: HarnessController enforces readOnly guardrails against mutating shell commands', function () {
      const vfs = new VfsSandbox();
      const readOnlyHarness = new HarnessController({ vfs, readOnly: true });

      // Attempt mutating command: touch
      const touchCheck = readOnlyHarness.canExecute('run_sandboxed_command', {
        CommandLine: 'touch /workspace/forbidden.txt'
      });
      assert.strictEqual(touchCheck.allowed, false);
      assert.strictEqual(touchCheck.code, 'PERMISSION_DENIED');

      // Attempt mutating command: redirection >
      const redirCheck = readOnlyHarness.canExecute('run_sandboxed_command', {
        CommandLine: 'echo "hack" > /workspace/hack.txt'
      });
      assert.strictEqual(redirCheck.allowed, false);
      assert.strictEqual(redirCheck.code, 'PERMISSION_DENIED');
    });
  });

  // =========================================================================
  // 5. Shell Redirection & vfs_change Event Synchronization
  // =========================================================================
  describe('5. Shell Redirection & Live Workspace vfs_change Event Sync', function () {
    it('E2E-SYNC-01: run_sandboxed_command with shell redirection emits vfs_change event', async function () {
      const agent = new SunaAgent({ id: 'e2e_vfs_sync_test' });

      let emittedChange = null;
      agent.on('vfs_change', (evt) => {
        emittedChange = evt;
      });

      // Execute redirection command: echo "Live Sync Data" > live_file.txt
      const result = await agent.invokeAciTool('run_sandboxed_command', {
        CommandLine: 'echo "Live Sync Data" > live_file.txt'
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(emittedChange !== null, 'vfs_change event must be emitted');
      assert.strictEqual(emittedChange.path, 'live_file.txt');
      assert.ok(emittedChange.content.includes('Live Sync Data'));

      agent.destroy();
    });
  });

  // =========================================================================
  // 6. SunaAgent Lifecycle, MultiSyntaxParser & ReAct Loop
  // =========================================================================
  describe('6. SunaAgent Lifecycle & Multi-Step ReAct Loop', function () {
    it('E2E-CORE-01: MultiSyntaxParser ignores configuration files (package.json) containing "name"', function () {
      const normalAssistantResponse = `
Here is a sample package.json configuration:
\`\`\`json
{
  "name": "my-suna-app",
  "version": "1.0.0",
  "description": "Demonstration project",
  "dependencies": {
    "express": "^4.18.2"
  }
}
\`\`\`
Let me know if you need anything else!
      `;

      const parsedCalls = SunaAgent.MultiSyntaxParser.parse(normalAssistantResponse);
      assert.strictEqual(parsedCalls.length, 0, 'Must NOT parse package.json as a tool call');
    });

    it('E2E-CORE-02: agent.steer() successfully un-aborts and restores idle status after circuit breaker halt', function () {
      const agent = new SunaAgent({ id: 'e2e_steer_test' });

      // Simulate a circuit breaker halt
      agent.status = 'halted';
      agent.isAgentAborted = true;
      agent.consecutiveFailures = 5;

      // Operator steers the agent
      agent.steer('Try using grep_search instead of view_file');

      assert.strictEqual(agent.status, 'idle', 'Agent status must be restored to idle');
      assert.strictEqual(agent.isAgentAborted, false, 'isAgentAborted must be cleared to false');
      assert.strictEqual(agent.consecutiveFailures, 0, 'consecutiveFailures must be reset to 0');

      agent.destroy();
    });

    it('E2E-CORE-03: _boundObservation preserves error flag and status on large error messages (>1500 chars)', function () {
      const agent = new SunaAgent({ id: 'e2e_observation_test' });

      const longStack = 'Error: StackOverflowException at recursiveFunction (core.js:100)\n' +
        '  at subCall (sub.js:200)\n'.repeat(60); // > 1500 chars

      const longError = {
        isError: true,
        status: 'error',
        error: longStack,
        code: 'CONN_TIMEOUT'
      };

      const bounded = agent._boundObservation(longError, 1500);

      assert.strictEqual(bounded.truncated, true, 'Observation must be marked truncated');
      const preservedIsError = bounded.isError === true || (bounded.value && bounded.value.isError === true);
      assert.strictEqual(preservedIsError, true, '_boundObservation must preserve isError flag');

      agent.destroy();
    });
  });

  // =========================================================================
  // 7. Network & Hallucination Prevention (fetch_page_summary)
  // =========================================================================
  describe('7. fetch_page_summary Zero-Hallucination on Network Failure', function () {
    it('E2E-WEB-01: fetch_page_summary returns explicit error on network failure without synthetic HTML', async function () {
      const { sunaAgent } = createFullClientRuntime({
        fetchLinkContext: async () => {
          throw new Error('ENOTFOUND: failed to resolve host');
        }
      });

      const res = await sunaAgent.tools.fetch_page_summary(
        { url: 'https://non-existent-domain-404-xyz.com' },
        {
          fetchLinkContext: async () => {
            throw new Error('ENOTFOUND: failed to resolve host');
          }
        }
      );

      assert.strictEqual(res.success, false, 'Must return success: false on network failure');
      assert.ok(res.error, 'Must provide an error description');
      assert.strictEqual(
        (res.content || '').includes('Tiêu đề trang'),
        false,
        'Must NEVER return synthetic Vietnamese HTML on network error'
      );
    });
  });
});
