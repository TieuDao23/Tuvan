'use strict';

/**
 * tests/test_suna_r2_hidden.js
 * 
 * Milestone R2: 22 Tools Functional Integrity — Hidden Test Suite (40% Split - 10 Tests)
 * Adversarial Verification, Deep Boundary Stress & Invariant Integrity
 * 
 * Author: teamwork_preview_test_writer
 * Authoritative Sources:
 * - ORIGINAL_REQUEST.md (Follow-up 2026-09-20T14:39:06Z, Requirement R2)
 * - orchestrator_10/implementation_plan.md
 * - explorer_o10_survey_2/survey_report.md & handoff.md
 * 
 * Covered Requirements:
 * 1. memory_store Case-Insensitive Rapid Deduplication (R2-H01)
 * 2. memory_store Legacy Array / String Element Resilience (R2-H02)
 * 3. fs_patch Extreme Multi-Byte Astral / Emoji UTF-8 Accuracy (R2-H03)
 * 4. fs_patch Deletion & Metacharacter Replacement (R2-H04)
 * 5. replace_file_content Multi-Line Consecutive Deletion Hygiene (R2-H05)
 * 6. replace_file_content Complete File Truncation (R2-H06)
 * 7. fetch_page_summary Adversarial Protocols & Empty Body Rejection (R2-H07)
 * 8. sandbox_exec Advanced Prototype & Function Constructor Escape Neutralization (R2-H08)
 * 9. run_sandboxed_command Chained & Complex Redirection Guard in readOnly Mode (R2-H09)
 * 10. vfs_change Quoted Paths & Working Directory Redirection Parsing (R2-H10)
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

describe('Milestone R2: 22 Tools Functional Integrity — Hidden Suite (10 Tests)', function () {
  this.timeout(15000);

  // =========================================================================
  // 1. memory_store Case-Insensitive Rapid Deduplication
  // =========================================================================
  describe('1. memory_store Case-Insensitive Rapid Deduplication', function () {
    it('R2-H01: rapid sequential invocations with mixed case and leading/trailing whitespace result in exactly one stored fact and single persistence trigger', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      let saveCount = 0;
      sandbox.saveMemory = async function () {
        saveCount++;
      };

      const variations = [
        '   User lives in Hanoi, Vietnam   ',
        'user lives in hanoi, vietnam',
        'USER LIVES IN HANOI, VIETNAM',
        '\tUser lives in Hanoi, Vietnam\n'
      ];

      for (let i = 0; i < variations.length; i++) {
        const res = await sunaAgent.tools.memory_store(
          { fact: variations[i], category: 'location' },
          { State: sandbox.State, saveMemory: sandbox.saveMemory }
        );
        assert.strictEqual(res.success, true, `Call #${i + 1} must return success: true`);
        if (i > 0) {
          assert.ok(
            (res.message || '').includes('deduplicated') || (res.message || '').includes('already exists'),
            `Subsequent call #${i + 1} must report deduplication`
          );
        }
      }

      assert.strictEqual(sandbox.State.memory.facts.length, 1, 'Exactly 1 fact must exist in State.memory.facts');
      assert.strictEqual(saveCount, 1, 'saveMemory must only be called for the initial new fact, not duplicate calls');
    });

    it('R2-H02: memory_store handles legacy arrays with raw strings or mixed objects without throwing TypeError: Cannot read properties of undefined', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      let saveTriggered = false;
      sandbox.saveMemory = async function () {
        saveTriggered = true;
      };

      // Populate with legacy string elements and malformed objects
      sandbox.State.memory.facts = [
        'Legacy raw string fact A',
        { fact: 'Legacy object fact B', category: 'old' },
        'Legacy raw string fact C'
      ];

      // 1. Attempt storing a duplicate of a raw string fact
      const dupRes = await sunaAgent.tools.memory_store(
        { fact: 'legacy raw string fact a', category: 'general' },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );
      assert.strictEqual(dupRes.success, true);
      assert.ok(
        (dupRes.message || '').includes('deduplicated') || (dupRes.message || '').includes('already exists'),
        'Must detect duplicate against raw string entries without crashing'
      );
      assert.strictEqual(sandbox.State.memory.facts.length, 3, 'Must not append duplicate');

      // 2. Store brand-new fact
      const newRes = await sunaAgent.tools.memory_store(
        { fact: 'Brand new distinct fact D', category: 'fresh' },
        { State: sandbox.State, saveMemory: sandbox.saveMemory }
      );
      assert.strictEqual(newRes.success, true);
      assert.strictEqual(sandbox.State.memory.facts.length, 4, 'Must append new fact cleanly');
      assert.strictEqual(saveTriggered, true, 'saveMemory must be called on storing new fact');
    });
  });

  // =========================================================================
  // 2. fs_patch Extreme Multi-Byte & Metacharacter Integrity
  // =========================================================================
  describe('2. fs_patch Extreme Multi-Byte & Metacharacter Integrity', function () {
    it('R2-H03: extreme multi-byte UTF-8 test (astral characters, CJK ideographs, ZWJ compound emoji) with Buffer and TextEncoder removed matches authoritative byte count', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      const complexUtf8String = '𠮷野家 𝄞 Musical Note 👨‍👩‍👧‍👦 Family Emoji Tiếng Việt có đủ dấu: ẵ, ặ, ế, ộ, ừ, ỳ';
      const expectedBytes = Buffer.byteLength(complexUtf8String, 'utf8');

      sandbox.State.vfs['complex.txt'] = {
        content: 'placeholder',
        size: 11,
        lines: 1,
        updatedAt: Date.now()
      };

      // Remove modern encoders to test universal fallback
      delete sandbox.Buffer;
      delete sandbox.TextEncoder;

      const res = await sunaAgent.tools.fs_patch(
        { path: 'complex.txt', search: 'placeholder', replace: complexUtf8String },
        { State: sandbox.State }
      );

      assert.strictEqual(res.success, true);
      const patched = sandbox.State.vfs['complex.txt'];
      assert.strictEqual(patched.content, complexUtf8String);
      assert.strictEqual(
        patched.size,
        expectedBytes,
        `Patched size (${patched.size}) must exactly match UTF-8 byte length oracle (${expectedBytes})`
      );
    });

    it('R2-H04: fs_patch correctly applies deletion patches (replace: "") and preserves literal regex metacharacters ($$, $&, $\') without evaluation', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      const initialCode = 'const price = 100;\nconst currency = "USD";\n';
      const replaceWithSpecialChars = 'const price = "$$99.99" + "$&" + "$\'";';

      sandbox.State.vfs['config.js'] = {
        content: initialCode,
        size: Buffer.byteLength(initialCode, 'utf8'),
        lines: 2,
        updatedAt: Date.now()
      };

      delete sandbox.Buffer;
      delete sandbox.TextEncoder;

      // 1. Patch with special replacement tokens ($$, $&, $')
      const resSpecial = await sunaAgent.tools.fs_patch(
        { path: 'config.js', search: 'const price = 100;', replace: replaceWithSpecialChars },
        { State: sandbox.State }
      );

      assert.strictEqual(resSpecial.success, true);
      assert.ok(
        sandbox.State.vfs['config.js'].content.includes('$$99.99'),
        'Literal "$$" must be preserved rather than collapsed to "$"'
      );

      // 2. Deletion patch (replace: "")
      const resDelete = await sunaAgent.tools.fs_patch(
        { path: 'config.js', search: 'const currency = "USD";\n', replace: '' },
        { State: sandbox.State }
      );

      assert.strictEqual(resDelete.success, true);
      assert.ok(!sandbox.State.vfs['config.js'].content.includes('currency'));
      assert.ok(sandbox.State.vfs['config.js'].size > 0, 'Size must be non-zero positive integer');
    });
  });

  // =========================================================================
  // 3. replace_file_content Multi-Line & Complete Truncation Hygiene
  // =========================================================================
  describe('3. replace_file_content Multi-Line & Complete Truncation Hygiene', function () {
    let vfs;

    beforeEach(() => {
      vfs = new VfsSandbox();
    });

    it('R2-H05: multi-line deletion (deleting consecutive lines 2-4 in a 6-line file) produces clean contiguous lines without blank line artifacts', function () {
      const initial = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6';
      vfs.writeFile('multiline_delete.txt', initial);

      vfs.replaceContent('multiline_delete.txt', 'line 2\nline 3\nline 4', '', {
        startLine: 2,
        endLine: 4
      });

      const result = vfs.readFile('multiline_delete.txt');
      const expected = 'line 1\nline 5\nline 6';

      assert.strictEqual(
        result,
        expected,
        `Multi-line deletion must leave clean 3 remaining lines, got:\n${JSON.stringify(result)}`
      );
      assert.strictEqual(result.split('\n').length, 3, 'Must have exactly 3 lines');
    });

    it('R2-H06: complete file clearing (deleting lines 1 to N with replacementContent: "") produces clean empty string without stray newlines', function () {
      const initial = 'alpha\nbeta\ngamma\ndelta\nepsilon';
      vfs.writeFile('all_delete.txt', initial);

      vfs.replaceContent('all_delete.txt', initial, '', {
        startLine: 1,
        endLine: 5
      });

      const result = vfs.readFile('all_delete.txt');
      assert.strictEqual(result, '', 'Full deletion must yield an empty string ""');
      assert.notStrictEqual(result, '\n', 'Full deletion must not leave stray newline "\\n"');
    });
  });

  // =========================================================================
  // 4. fetch_page_summary Adversarial Protocols & Empty Responses
  // =========================================================================
  describe('4. fetch_page_summary Adversarial Protocols & Empty Responses', function () {
    it('R2-H07: adversarial URL schemes (javascript:, file:, data:) and empty network responses reject cleanly with { success: false } and zero synthetic HTML', async function () {
      const { sandbox, sunaAgent } = createAppContext();

      const dangerousUrls = [
        'javascript:alert(document.cookie)',
        'file:///etc/passwd',
        'file:///C:/Windows/win.ini',
        'data:text/html,<script>evil()</script>'
      ];

      for (const url of dangerousUrls) {
        const res = await sunaAgent.tools.fetch_page_summary({ url });
        assert.strictEqual(res.success, false, `Scheme in "${url}" must be rejected with success: false`);
        assert.ok(res.error !== undefined, `Must return explicit error for "${url}"`);
        const content = res.content || '';
        assert.ok(!content.includes('Tiêu đề trang'), `Must not return fake Vietnamese HTML for "${url}"`);
      }

      // Test null/empty response from fetchLinkContext
      sandbox.fetchLinkContext = async function () {
        return null; // Server returned empty
      };

      const emptyRes = await sunaAgent.tools.fetch_page_summary(
        { url: 'https://empty-response.internal/api' },
        { fetchLinkContext: sandbox.fetchLinkContext }
      );

      assert.strictEqual(emptyRes.success, false, 'Empty network response must result in success: false');
      assert.ok(!JSON.stringify(emptyRes).includes('Tiêu đề trang'));
    });
  });

  // =========================================================================
  // 5. sandbox_exec Advanced Escape Neutralization
  // =========================================================================
  describe('5. sandbox_exec Advanced Escape Neutralization', function () {
    it('R2-H08: prototype chain inspection and Function constructor evasion attempts are safely contained', async function () {
      const { sunaAgent } = createAppContext();

      const escapeVectors = [
        `[].filter.constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
        `Object.getPrototypeOf({}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`,
        `(() => {}).constructor('return typeof process !== "undefined" ? process.pid : "safe"')()`
      ];

      for (const code of escapeVectors) {
        const res = await sunaAgent.tools.sandbox_exec({ code });
        assert.strictEqual(res.success, true);
        assert.strictEqual(
          typeof process !== 'undefined' && res.result === String(process.pid),
          false,
          `Escape payload "${code}" must not extract host process.pid`
        );
      }
    });
  });

  // =========================================================================
  // 6. run_sandboxed_command Chained & Complex Redirection Guard in readOnly Mode
  // =========================================================================
  describe('6. run_sandboxed_command Chained & Complex Redirection Guard in readOnly Mode', function () {
    it('R2-H09: complex mutating commands (chained writes, space-padded redirections, appending) are rejected with PERMISSION_DENIED in readOnly mode', async function () {
      const vfs = new VfsSandbox();
      vfs.writeFile('read_target.txt', 'untouchable');
      const controller = new HarnessController({ vfs, readOnly: true, maxTurns: 10 });

      const complexMutatingCommands = [
        'echo 12345 >> read_target.txt',
        'cat < read_target.txt > /output.txt',
        'touch "spaced filename.txt"',
        'mkdir -p /sub/nested/dir',
        'rm -rf /'
      ];

      for (const cmd of complexMutatingCommands) {
        const guardCheck = typeof controller.canExecute === 'function'
          ? controller.canExecute('run_sandboxed_command', { CommandLine: cmd })
          : controller.checkGuardrails('run_sandboxed_command', { CommandLine: cmd });
        assert.strictEqual(
          guardCheck.allowed,
          false,
          `Guardrail must block complex mutation command in readOnly mode: "${cmd}"`
        );
        assert.strictEqual(
          guardCheck.code,
          'PERMISSION_DENIED',
          `Code must be PERMISSION_DENIED for "${cmd}"`
        );
      }

      // Verify VFS was not altered
      assert.strictEqual(vfs.readFile('read_target.txt'), 'untouchable');
      assert.strictEqual(vfs.exists('output.txt'), false);
    });
  });

  // =========================================================================
  // 7. vfs_change Quoted Paths & Working Directory Redirection Parsing
  // =========================================================================
  describe('7. vfs_change Quoted Paths & Working Directory Redirection Parsing', function () {
    let agent;

    afterEach(() => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
      agent = null;
    });

    it('R2-H10: redirection with quoted filenames, spaces, and relative cwd correctly emits vfs_change with resolved path', async function () {
      agent = new SunaAgent({ id: 'vfs_change_complex_agent' });
      const capturedEvents = [];

      agent.on('vfs_change', (data) => {
        capturedEvents.push(data);
      });

      // 1. Redirection into quoted filename with spaces
      await agent.invokeAciTool('run_sandboxed_command', {
        CommandLine: 'echo "release notes content" > "release notes.txt"'
      });

      assert.strictEqual(
        capturedEvents.length,
        1,
        'vfs_change must be emitted for quoted redirection target'
      );
      assert.strictEqual(
        capturedEvents[0].path,
        'release notes.txt',
        'Target path must be stripped of outer quotes'
      );
      assert.ok(capturedEvents[0].content.includes('release notes content'));

      // 2. Redirection with subfolder or cwd
      if (agent.vfs && typeof agent.vfs.mkdir === 'function') {
        agent.vfs.mkdir('docs', { recursive: true });
      }

      await agent.invokeAciTool('run_sandboxed_command', {
        CommandLine: 'echo "docs readme" > docs/README.md'
      });

      assert.strictEqual(capturedEvents.length, 2);
      assert.strictEqual(capturedEvents[1].path, 'docs/README.md');
      assert.ok(capturedEvents[1].content.includes('docs readme'));
    });
  });
});
