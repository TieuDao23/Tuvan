'use strict';

/**
 * stress_test_r2.js
 * 
 * Comprehensive Empirical Stress Testing Suite for Milestone R2 (22 Tools Functional Integrity)
 * Author: Challenger 1 (teamwork_preview_challenger)
 * 
 * Objective:
 * Adversarially challenge and stress-test the functional integrity of tools modified in Milestone R2:
 * 1. memory_store: 50 rapid concurrent stores with duplicate facts, mixed casing, extra whitespace,
 *    raw string legacy formats, capacity limits, and storage dirty state persistence.
 * 2. fs_patch: Apply patches with astral plane UTF-8 characters (emoji, CJK, math symbols),
 *    zero-width joiners, and regex metacharacters ($$, $&, $', \1) with Buffer and TextEncoder deleted.
 *    Compare sizes against authoritative host Buffer.byteLength oracle.
 * 3. replace_file_content: Consecutive line deletions, single-line deletions across diverse file sizes
 *    (1, 2, 3, 10, 100, 1000 lines), and empty replacement deletions. Verify zero \n\n artifacts.
 * 4. fetch_page_summary: Simulated network failures, timeouts, 404/500 HTTP errors, empty content.
 *    Verify zero synthetic Vietnamese HTML strings are returned.
 * 5. Additional R2 integrity checks: sandbox const/let repeated declarations, prototype evasion containment,
 *    readOnly guardrails, parameter aliases normalization, and vfs_change redirection parsing.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SunaAgent = require('../../suna_agent.js');
const SunaHarness = require('../../suna_harness.js');
const { VfsSandbox, HarnessController, AciSchemaValidator, VfsDiffEngine } = SunaHarness;

let passCount = 0;
let failCount = 0;
const testResults = [];

function recordPass(testName, details = '') {
  passCount++;
  testResults.push({ name: testName, status: 'PASS', details });
  console.log(`  [PASS] ${testName}${details ? ' — ' + details : ''}`);
}

function recordFail(testName, error) {
  failCount++;
  testResults.push({ name: testName, status: 'FAIL', error: error.message || String(error) });
  console.error(`  [FAIL] ${testName}: ${error.message || String(error)}`);
}

/**
 * Helper to build an isolated app.js execution context with configurable globals
 */
function createAppContext(extraGlobals = {}) {
  const appJsPath = path.join(__dirname, '..', '..', 'app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Extract SunaAgent facade
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

  const memoryAudit = {
    saveCalls: 0,
    immediateCalls: 0,
    lastSavedMemory: null
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
    getStorageSuffix: () => '_test',
    idbSet: async (key, val) => {
      memoryAudit.lastSavedMemory = JSON.parse(JSON.stringify(val));
      return true;
    },
    triggerCloudSync: () => {},
    broadcastLocalSync: () => {},
    memoryAudit,
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
    memoryAudit
  };
}

async function runAllStressTests() {
  console.log('================================================================');
  console.log('STARTING EMPIRICAL STRESS TEST HARNESS — MILESTONE R2');
  console.log('================================================================\n');

  // ===========================================================================
  // 1. STRESS TEST: memory_store
  // ===========================================================================
  console.log('--- 1. STRESS TEST: memory_store Concurrency, Deduplication & Dirty State ---');

  try {
    const { sandbox, sunaAgent, memoryAudit } = createAppContext();

    let saveMemoryTriggerCount = 0;
    sandbox.saveMemory = async function (immediate) {
      saveMemoryTriggerCount++;
      if (immediate) memoryAudit.immediateCalls++;
      sandbox.State.memory.lastUpdated = Date.now();
    };

    // Prepare 50 concurrent requests with controlled duplicate clusters:
    // Cluster A: 15 calls for "User prefers dark mode and JetBrains Mono" with mixed case & spacing
    // Cluster B: 15 calls for "Primary stack is Node.js, Express and TypeScript"
    // Cluster C: 10 calls for "Favorite editor is VS Code with Vim keybindings"
    // 10 distinct unique facts (Facts 1 to 10)
    const storePromises = [];
    const factClusterA = [
      'User prefers dark mode and JetBrains Mono',
      'user prefers dark mode and jetbrains mono',
      'USER PREFERS DARK MODE AND JETBRAINS MONO',
      '   User prefers dark mode and JetBrains Mono   ',
      '\tUser prefers dark mode and JetBrains Mono\n',
      '  user prefers dark mode and jetbrains mono  ',
      'User prefers dark mode and JetBrains Mono',
      'USER PREFERS DARK MODE AND JETBRAINS MONO',
      'User prefers dark mode and JetBrains Mono',
      '   user prefers dark mode and jetbrains mono',
      'User prefers dark mode and JetBrains Mono   ',
      'USER PREFERS DARK MODE AND JETBRAINS MONO',
      'User prefers dark mode and JetBrains Mono',
      '\tuser prefers dark mode and jetbrains mono\t',
      '   USER PREFERS DARK MODE AND JETBRAINS MONO   '
    ];

    const factClusterB = [
      'Primary stack is Node.js, Express and TypeScript',
      'primary stack is node.js, express and typescript',
      'PRIMARY STACK IS NODE.JS, EXPRESS AND TYPESCRIPT',
      '  Primary stack is Node.js, Express and TypeScript  ',
      '\tprimary stack is node.js, express and typescript\n',
      'Primary stack is Node.js, Express and TypeScript',
      'PRIMARY STACK IS NODE.JS, EXPRESS AND TYPESCRIPT',
      '   Primary stack is Node.js, Express and TypeScript',
      'primary stack is node.js, express and typescript   ',
      'Primary stack is Node.js, Express and TypeScript',
      'Primary stack is Node.js, Express and TypeScript',
      'PRIMARY STACK IS NODE.JS, EXPRESS AND TYPESCRIPT',
      'primary stack is node.js, express and typescript',
      '   Primary stack is Node.js, Express and TypeScript   ',
      '\tPRIMARY STACK IS NODE.JS, EXPRESS AND TYPESCRIPT\t'
    ];

    const factClusterC = [
      'Favorite editor is VS Code with Vim keybindings',
      'favorite editor is vs code with vim keybindings',
      'FAVORITE EDITOR IS VS CODE WITH VIM KEYBINDINGS',
      '   Favorite editor is VS Code with Vim keybindings   ',
      '\tfavorite editor is vs code with vim keybindings\n',
      'Favorite editor is VS Code with Vim keybindings',
      'FAVORITE EDITOR IS VS CODE WITH VIM KEYBINDINGS',
      '   Favorite editor is VS Code with Vim keybindings',
      'favorite editor is vs code with vim keybindings   ',
      'Favorite editor is VS Code with Vim keybindings'
    ];

    for (let f of factClusterA) {
      storePromises.push(sunaAgent.tools.memory_store({ fact: f, category: 'preference' }, { State: sandbox.State, saveMemory: sandbox.saveMemory }));
    }
    for (let f of factClusterB) {
      storePromises.push(sunaAgent.tools.memory_store({ fact: f, category: 'tech' }, { State: sandbox.State, saveMemory: sandbox.saveMemory }));
    }
    for (let f of factClusterC) {
      storePromises.push(sunaAgent.tools.memory_store({ fact: f, category: 'tools' }, { State: sandbox.State, saveMemory: sandbox.saveMemory }));
    }
    for (let i = 1; i <= 10; i++) {
      storePromises.push(sunaAgent.tools.memory_store({ fact: `Independent distinct fact #${i} for stress test`, category: 'misc' }, { State: sandbox.State, saveMemory: sandbox.saveMemory }));
    }

    assert.strictEqual(storePromises.length, 50, 'Must have exactly 50 concurrent store requests');

    // Fire all 50 rapid concurrent stores
    const results = await Promise.all(storePromises);

    // Verify all 50 calls succeeded
    for (let idx = 0; idx < results.length; idx++) {
      assert.strictEqual(results[idx].success, true, `Call #${idx + 1} must return success: true`);
    }

    // Exactly 3 (clusters) + 10 (distinct) = 13 facts stored
    const expectedUniqueFacts = 13;
    assert.strictEqual(
      sandbox.State.memory.facts.length,
      expectedUniqueFacts,
      `State.memory.facts must contain exactly ${expectedUniqueFacts} deduplicated facts, got ${sandbox.State.memory.facts.length}`
    );

    // Verify saveMemory dirty state triggers
    assert.ok(
      saveMemoryTriggerCount >= expectedUniqueFacts,
      `saveMemory must be triggered at least once per new stored fact (called ${saveMemoryTriggerCount} times)`
    );
    assert.ok(
      memoryAudit.immediateCalls >= expectedUniqueFacts,
      `saveMemory immediate flag must be set to true for persistence`
    );

    recordPass('1.1. memory_store 50 rapid concurrent stores with duplicate clusters and case/whitespace variations', `13 unique facts, ${saveMemoryTriggerCount} saves`);
  } catch (err) {
    recordFail('1.1. memory_store 50 rapid concurrent stores', err);
  }

  // 1.2. Legacy raw string formats & malformed memory resilience
  try {
    const { sandbox, sunaAgent } = createAppContext();

    let saveTriggered = false;
    sandbox.saveMemory = async function () {
      saveTriggered = true;
    };

    // Pre-populate with heterogeneous legacy entries
    sandbox.State.memory.facts = [
      'Legacy raw string fact: User is located in Tokyo',
      { fact: 'Legacy object fact: Uses Linux desktop', category: 'os' },
      'Legacy raw string fact: Prefers Vietnamese localization',
      null,
      {},
      { fact: '' },
      'Legacy raw string fact: Shell is zsh'
    ];

    // Attempt deduplicating against legacy string with case variations
    const dupRes = await sunaAgent.tools.memory_store(
      { fact: 'legacy raw string fact: user is located in tokyo', category: 'geo' },
      { State: sandbox.State, saveMemory: sandbox.saveMemory }
    );
    assert.strictEqual(dupRes.success, true);
    assert.ok((dupRes.message || '').includes('deduplicated') || (dupRes.message || '').includes('already exists'));

    // Attempt storing a new fact
    const newRes = await sunaAgent.tools.memory_store(
      { fact: 'Fresh fact: Learning Rust in 2026', category: 'goal' },
      { State: sandbox.State, saveMemory: sandbox.saveMemory }
    );
    assert.strictEqual(newRes.success, true);
    assert.strictEqual(saveTriggered, true, 'saveMemory must be called for new fact despite legacy entries');

    // Query to verify query tool doesn't crash on legacy formats
    const queryRes = await sunaAgent.tools.memory_query({ query: 'tokyo' }, { State: sandbox.State });
    assert.strictEqual(queryRes.success, true);
    assert.strictEqual(queryRes.count, 1);

    recordPass('1.2. memory_store legacy raw strings, nulls, empty objects resilience & querying', `Handled 7 heterogeneous entries smoothly`);
  } catch (err) {
    recordFail('1.2. memory_store legacy formats resilience', err);
  }

  // 1.3. Rolling 50-fact capacity limit
  try {
    const { sandbox, sunaAgent } = createAppContext();
    sandbox.saveMemory = async function () {};

    for (let i = 1; i <= 60; i++) {
      await sunaAgent.tools.memory_store({ fact: `Fact number ${i} sequential limit test`, category: 'limit' }, { State: sandbox.State, saveMemory: sandbox.saveMemory });
    }

    assert.ok(sandbox.State.memory.facts.length <= 50, `Facts count must not exceed 50 limit, got ${sandbox.State.memory.facts.length}`);
    recordPass('1.3. memory_store rolling capacity ceiling (50 facts)', `Current facts count: ${sandbox.State.memory.facts.length}`);
  } catch (err) {
    recordFail('1.3. memory_store rolling capacity ceiling', err);
  }

  // ===========================================================================
  // 2. STRESS TEST: fs_patch
  // ===========================================================================
  console.log('\n--- 2. STRESS TEST: fs_patch Astral UTF-8, ZWJ, Math, Regex & Missing Global ---');

  // 2.1. Astral Plane, CJK, ZWJ emoji, Math symbols with Buffer and TextEncoder DELETED
  try {
    const { sandbox, sunaAgent } = createAppContext();

    // Explicitly delete Buffer and TextEncoder to force fallback calculation
    delete sandbox.Buffer;
    delete sandbox.TextEncoder;

    const testVectors = [
      {
        name: 'CJK Extension B (U+20BB7 𠮷) & Rare Ideographs',
        content: 'Title: 𠮷野家 (Yoshinoya) 𪚥 (Tetsu - 64 strokes) 𠫬 (U+20AF4)',
        search: 'PLACEHOLDER_1'
      },
      {
        name: 'Musical Symbols & Byzantine notation (U+1D11E 𝄞, U+1D000)',
        content: 'Sonata in G Major 𝄞 𝄢 𝄡 Allegro con brio 𝅘𝅥𝅯',
        search: 'PLACEHOLDER_2'
      },
      {
        name: 'Complex ZWJ Compound Emojis & Modifiers',
        content: 'Family: 👨‍👩‍👧‍👦 | Technologist: 👩‍💻 | Supervillain: 🦹‍♀️ | Flag: 🏳️‍🌈 | Firefighter: 👨‍🚒',
        search: 'PLACEHOLDER_3'
      },
      {
        name: 'Mathematical Formal Logic & Calculus Symbols',
        content: '∀x ∈ ℝ: ∑_{i=1}^∞ \frac{1}{i²} = \frac{π²}{6} ∧ ∮_C \vec{F}\cdot d\vec{r} = ∬_S (\nabla\times\vec{F})\cdot d\vec{S} ≠ ∅',
        search: 'PLACEHOLDER_4'
      },
      {
        name: 'Full Vietnamese Diacritical Spectrum with Composite Accents',
        content: 'Tiếng Việt đầy đủ thanh điệu: ẵ, ặ, ế, ề, ể, ễ, ệ, ố, ồ, ổ, ỗ, ộ, ớ, ờ, ở, ỡ, ợ, ứ, ừ, sử, chữ, ngự, phượng hoàng',
        search: 'PLACEHOLDER_5'
      }
    ];

    let fullOriginal = testVectors.map(v => v.search).join('\n');
    sandbox.State.vfs['astral_stress.txt'] = {
      content: fullOriginal,
      size: fullOriginal.length,
      lines: testVectors.length,
      updatedAt: Date.now()
    };

    for (let vec of testVectors) {
      const patchRes = await sunaAgent.tools.fs_patch(
        { path: 'astral_stress.txt', search: vec.search, replace: vec.content },
        { State: sandbox.State }
      );
      assert.strictEqual(patchRes.success, true, `fs_patch must succeed for ${vec.name}`);
    }

    const finalContent = sandbox.State.vfs['astral_stress.txt'].content;
    const finalSize = sandbox.State.vfs['astral_stress.txt'].size;
    const authoritativeByteLength = Buffer.byteLength(finalContent, 'utf8');

    assert.strictEqual(
      finalSize,
      authoritativeByteLength,
      `Universal fallback byte length (${finalSize}) must match authoritative Buffer.byteLength (${authoritativeByteLength})`
    );

    recordPass('2.1. fs_patch astral UTF-8, CJK, ZWJ, Math & Vietnamese with Buffer & TextEncoder deleted', `Authoritative byte length ${finalSize} bytes verified`);
  } catch (err) {
    recordFail('2.1. fs_patch astral UTF-8 fallback', err);
  }

  // 2.2. Regex Metacharacters and Deletion Patches
  try {
    const { sandbox, sunaAgent } = createAppContext();
    delete sandbox.Buffer;
    delete sandbox.TextEncoder;

    const initialCode = [
      'const pricePattern = "$$100.00";',
      'const matchVar = "$&";',
      'const postMatch = "$\'";',
      'const preMatch = "$`";',
      'const backref = "$1 and \\1";',
      'const lineToDelete = "DELETE_ME_NOW";'
    ].join('\n');

    sandbox.State.vfs['meta.js'] = {
      content: initialCode,
      size: initialCode.length,
      lines: 6,
      updatedAt: Date.now()
    };

    // Patch 1: Replace literal $& with complex replacement string containing $$, $&, $', $`
    const complexMetaReplacement = 'const matchVar = "$$" + "$&" + "$\'" + "$`" + "$1" + "\\d+";';
    const patch1 = await sunaAgent.tools.fs_patch(
      { path: 'meta.js', search: 'const matchVar = "$&";', replace: complexMetaReplacement },
      { State: sandbox.State }
    );
    assert.strictEqual(patch1.success, true);
    assert.ok(
      sandbox.State.vfs['meta.js'].content.includes('$$" + "$&" + "$\''),
      'Literal replacement metacharacters must be preserved without expansion'
    );

    // Patch 2: Deletion patch (replace: "")
    const patch2 = await sunaAgent.tools.fs_patch(
      { path: 'meta.js', search: '\nconst lineToDelete = "DELETE_ME_NOW";', replace: '' },
      { State: sandbox.State }
    );
    assert.strictEqual(patch2.success, true);
    assert.ok(!sandbox.State.vfs['meta.js'].content.includes('DELETE_ME_NOW'));

    // Verify size against oracle
    const actualSize = sandbox.State.vfs['meta.js'].size;
    const expectedSize = Buffer.byteLength(sandbox.State.vfs['meta.js'].content, 'utf8');
    assert.strictEqual(actualSize, expectedSize, `Byte size must match oracle: expected ${expectedSize}, got ${actualSize}`);

    recordPass('2.2. fs_patch literal regex metacharacters ($$, $&, $\', $`, $1) & deletion patches', `No metacharacter expansion, exact ${actualSize} bytes`);
  } catch (err) {
    recordFail('2.2. fs_patch regex metacharacters and deletion', err);
  }

  // 2.3. Large file (100KB) patching performance and error handling
  try {
    const { sandbox, sunaAgent } = createAppContext();
    delete sandbox.Buffer;
    delete sandbox.TextEncoder;

    // Generate ~100KB file
    const repeatedChunk = 'console.log("Chunk with emoji 🚀 and vietnamese: Cảm ơn bạn!");\n';
    let largeContent = repeatedChunk.repeat(1500) + 'TARGET_MARKER_UNIQUE\n' + repeatedChunk.repeat(500);
    sandbox.State.vfs['large.js'] = {
      content: largeContent,
      size: Buffer.byteLength(largeContent, 'utf8'),
      lines: 2001,
      updatedAt: Date.now()
    };

    const startT = Date.now();
    const patchRes = await sunaAgent.tools.fs_patch(
      { path: 'large.js', search: 'TARGET_MARKER_UNIQUE', replace: 'REPLACED_SUCCESSFULLY_🌟' },
      { State: sandbox.State }
    );
    const durationMs = Date.now() - startT;

    assert.strictEqual(patchRes.success, true);
    const updatedSize = sandbox.State.vfs['large.js'].size;
    const expectedSize = Buffer.byteLength(sandbox.State.vfs['large.js'].content, 'utf8');
    assert.strictEqual(updatedSize, expectedSize);

    // Error handling: not found
    const missingRes = await sunaAgent.tools.fs_patch(
      { path: 'large.js', search: 'NON_EXISTENT_MARKER', replace: 'foo' },
      { State: sandbox.State }
    );
    assert.strictEqual(missingRes.success, false);

    // Error handling: ambiguous match
    const ambigRes = await sunaAgent.tools.fs_patch(
      { path: 'large.js', search: 'console.log', replace: 'foo' },
      { State: sandbox.State }
    );
    assert.strictEqual(ambigRes.success, false);
    assert.ok(ambigRes.error.includes('Ambiguous patch target'));

    recordPass('2.3. fs_patch 100KB multi-byte file patch, missing & ambiguous error handling', `Duration: ${durationMs}ms`);
  } catch (err) {
    recordFail('2.3. fs_patch large file and error handling', err);
  }

  // ===========================================================================
  // 3. STRESS TEST: replace_file_content
  // ===========================================================================
  console.log('\n--- 3. STRESS TEST: replace_file_content Line Deletions & Artifact Hygiene ---');

  // 3.1. Single-line deletions across diverse file sizes (1, 2, 3, 10, 100, 1000 lines)
  try {
    const vfs = new VfsSandbox();

    // File sizes to test
    const sizes = [1, 2, 3, 10, 100, 1000];

    for (let size of sizes) {
      const lines = [];
      for (let i = 1; i <= size; i++) lines.push(`line_${i}_content_xyz`);
      const original = lines.join('\n');
      const filename = `file_${size}.txt`;
      vfs.writeFile(filename, original);

      // Deletion test targets: top, middle (if size >= 3), bottom
      const targets = [];
      targets.push({ lineNum: 1, desc: 'top' });
      if (size >= 3) {
        targets.push({ lineNum: Math.floor(size / 2), desc: 'middle' });
      }
      if (size >= 2) {
        targets.push({ lineNum: size, desc: 'bottom' });
      }

      for (let t of targets) {
        // Fresh file for each target test
        vfs.writeFile(filename, original);
        const targetContent = `line_${t.lineNum}_content_xyz`;

        vfs.replaceContent(filename, targetContent, '', {
          startLine: t.lineNum,
          endLine: t.lineNum
        });

        const result = vfs.readFile(filename);

        // Verification 1: zero \n\n artifacts introduced
        assert.ok(
          !result.includes('\n\n'),
          `Size ${size} (${t.desc} deletion) must NOT contain extraneous double newline (\\n\\n)`
        );

        // Verification 2: line count decreased by exactly 1 (or 0 if size was 1)
        const expectedLineCount = size === 1 ? (result === '' ? 0 : 1) : size - 1;
        const actualLineCount = result === '' ? 0 : result.split('\n').length;
        assert.strictEqual(
          actualLineCount,
          expectedLineCount,
          `Size ${size} (${t.desc} deletion) line count must be ${expectedLineCount}, got ${actualLineCount}`
        );

        // Verification 3: target content is completely gone
        assert.ok(
          !result.includes(targetContent),
          `Target line "${targetContent}" must be completely removed`
        );
      }
    }

    recordPass('3.1. replace_file_content single-line deletions across sizes 1, 2, 3, 10, 100, 1000 lines', `Zero \\n\\n artifacts across all boundary locations (top, middle, bottom)`);
  } catch (err) {
    recordFail('3.1. replace_file_content single-line deletions across sizes', err);
  }

  // 3.2. Consecutive multi-line deletions & full truncation
  try {
    const vfs = new VfsSandbox();

    // 100-line file
    const lines100 = [];
    for (let i = 1; i <= 100; i++) lines100.push(`item_${i}`);
    vfs.writeFile('consec.txt', lines100.join('\n'));

    // Delete lines 20 through 49 (30 consecutive lines)
    const targetSlice = lines100.slice(19, 49).join('\n');
    vfs.replaceContent('consec.txt', targetSlice, '', {
      startLine: 20,
      endLine: 49
    });

    const after30Deleted = vfs.readFile('consec.txt');
    assert.ok(!after30Deleted.includes('\n\n'), 'Consecutive deletion must not introduce \\n\\n');
    assert.strictEqual(after30Deleted.split('\n').length, 70, 'Must have exactly 70 remaining lines');
    assert.ok(after30Deleted.includes('item_19\nitem_50'), 'Surrounding lines must be joined cleanly');

    // Complete truncation (lines 1 to 70)
    vfs.replaceContent('consec.txt', after30Deleted, '', {
      startLine: 1,
      endLine: 70
    });
    const truncated = vfs.readFile('consec.txt');
    assert.strictEqual(truncated, '', 'Full truncation must result in empty string ""');
    assert.notStrictEqual(truncated, '\n', 'Full truncation must NOT leave stray newline "\\n"');

    // VfsDiffEngine preview verification
    vfs.writeFile('diff_test.txt', 'alpha\nbeta\ngamma\ndelta');
    const preview = VfsDiffEngine.previewReplaceDiff(vfs, 'diff_test.txt', 'beta\ngamma', '', {
      startLine: 2,
      endLine: 3
    });
    assert.strictEqual(preview.wouldSucceed, true);
    assert.ok(!preview.patch.includes('+\n') && !preview.patch.includes('+ \n'), 'Diff preview must not include empty addition lines');

    recordPass('3.2. replace_file_content 30-line consecutive deletion, full truncation, and diff preview', `Clean 70 lines, "" truncation, valid unified diff`);
  } catch (err) {
    recordFail('3.2. replace_file_content consecutive deletions', err);
  }

  // ===========================================================================
  // 4. STRESS TEST: fetch_page_summary
  // ===========================================================================
  console.log('\n--- 4. STRESS TEST: fetch_page_summary Network Failures & Anti-Hallucination ---');

  try {
    const { sandbox, sunaAgent } = createAppContext();

    const failureScenarios = [
      { name: 'ECONNREFUSED', error: new Error('connect ECONNREFUSED 127.0.0.1:80') },
      { name: 'ENOTFOUND (DNS Failure)', error: new Error('getaddrinfo ENOTFOUND non-existent-domain-404.vn') },
      { name: 'ETIMEDOUT (Connection Timeout)', error: new Error('Connection timed out after 5000ms (ETIMEDOUT)') },
      { name: 'HTTP 404 Not Found', error: new Error('HTTP 404: Not Found') },
      { name: 'HTTP 500 Internal Server Error', error: new Error('HTTP 500: Server error occurred') },
      { name: 'HTTP 502 Bad Gateway', error: new Error('HTTP 502: Bad Gateway') },
      { name: 'HTTP 503 Service Unavailable', error: new Error('HTTP 503: Service Unavailable') },
      { name: 'Empty string response', returns: '' },
      { name: 'Null response', returns: null },
      { name: 'Undefined response', returns: undefined },
      { name: 'Whitespace only response', returns: '   \n\t  ' }
    ];

    for (let sc of failureScenarios) {
      const mockFetchFn = async () => {
        if (sc.error) throw sc.error;
        return sc.returns;
      };

      const res = await sunaAgent.tools.fetch_page_summary(
        { url: 'https://example.com/api/test' },
        { fetchLinkContext: mockFetchFn }
      );

      // Must report failure
      assert.strictEqual(
        res.success,
        false,
        `Scenario "${sc.name}" must return success: false, got: ${JSON.stringify(res)}`
      );

      // Error must be informative
      assert.ok(
        res.error && res.error.length > 0,
        `Scenario "${sc.name}" must provide non-empty error message`
      );

      // CRITICAL CHECK: ZERO synthetic Vietnamese mock HTML strings
      const serialized = JSON.stringify(res).toLowerCase();
      assert.ok(
        !serialized.includes('tiêu đề trang') &&
        !serialized.includes('trang mẫu') &&
        !serialized.includes('trích dẫn') &&
        !serialized.includes('<html>'),
        `Scenario "${sc.name}" returned prohibited synthetic Vietnamese HTML or mock string!`
      );
    }

    // Adversarial & illegal protocols
    const illegalProtocols = [
      'javascript:alert(document.cookie)',
      'file:///C:/Windows/System32/drivers/etc/hosts',
      'ftp://ftp.is.co.za/rfc/rfc1808.txt',
      'data:text/html,<script>alert(1)</script>',
      'gopher://gopher.floodgap.com',
      'bad://malformed'
    ];

    for (let protoUrl of illegalProtocols) {
      const res = await sunaAgent.tools.fetch_page_summary({ url: protoUrl });
      assert.strictEqual(res.success, false, `Illegal protocol "${protoUrl}" must be rejected`);
      assert.ok(
        res.error.includes('Unsupported protocol') || res.error.includes('Invalid URL format'),
        `Error must clearly identify protocol rejection for "${protoUrl}"`
      );
    }

    recordPass('4.1. fetch_page_summary 11 network failure scenarios & 6 illegal protocols', `Zero synthetic HTML returned, 100% clean errors`);
  } catch (err) {
    recordFail('4.1. fetch_page_summary failure stress', err);
  }

  // ===========================================================================
  // 5. ADDITIONAL R2 INTEGRITY: sandbox_exec, Guardrails, Aliases, vfs_change
  // ===========================================================================
  console.log('\n--- 5. ADDITIONAL R2 INTEGRITY: sandbox_exec, Guardrails, Aliases, vfs_change ---');

  // 5.1. sandbox_exec const/let repeated execution & prototype escape containment
  try {
    const { sandbox, sunaAgent } = createAppContext();

    // Repeated execution of const declarations
    for (let i = 1; i <= 5; i++) {
      const code = `const PI = 3.14159; const r = ${i}; const area = PI * r * r; area;`;
      const res = await sunaAgent.tools.sandbox_exec({ code });
      assert.strictEqual(res.success, true);
      assert.strictEqual(Number(res.result), 3.14159 * i * i);
    }

    // Prototype escape attempts
    const escapeVectors = [
      '({}).constructor.constructor("return process")()',
      'Function("return process")()',
      '(()=>{})["constructor"]["constructor"]("return process")()',
      '[].constructor.constructor("return process")()',
      'Object.getPrototypeOf(async function(){}).constructor("return process")()'
    ];

    for (let escapeCode of escapeVectors) {
      const res = await sunaAgent.tools.sandbox_exec({ code: escapeCode });
      if (res.success) {
        assert.ok(
          !res.result.includes('pid') && !res.result.includes('version') && res.result !== '[object process]',
          `Sandbox escape code succeeded in extracting host process: ${res.result}`
        );
      }
    }

    recordPass('5.1. sandbox_exec const/let re-declaration loop (5x) & 5 prototype escape containment vectors', `All contained safely`);
  } catch (err) {
    recordFail('5.1. sandbox_exec re-declaration and containment', err);
  }

  // 5.2. readOnly guardrails blocking mutating tools and shell commands
  try {
    const controller = new HarnessController({ readOnly: true });

    const mutatingTools = ['replace_file_content', 'fs_write', 'fs_patch', 'write_to_file'];
    for (let tool of mutatingTools) {
      const check = controller.canExecute(tool, {});
      assert.strictEqual(check.allowed, false, `Tool "${tool}" must be blocked in readOnly mode`);
      assert.strictEqual(check.code, 'PERMISSION_DENIED');
    }

    const mutatingCommands = [
      'touch test.txt',
      'rm -rf node_modules',
      'echo "hello" > index.html',
      'echo "append" >> log.txt',
      'mkdir -p src/components',
      'mv old.js new.js',
      'cp file.txt backup.txt'
    ];

    for (let cmd of mutatingCommands) {
      const check = controller.canExecute('run_sandboxed_command', { CommandLine: cmd });
      assert.strictEqual(check.allowed, false, `Command "${cmd}" must be blocked in readOnly mode`);
      assert.strictEqual(check.code, 'PERMISSION_DENIED');
    }

    const safeCommands = [
      'ls -la',
      'cat package.json',
      'grep "foo" main.js',
      'node -e "console.log(1+1)"'
    ];

    for (let cmd of safeCommands) {
      const check = controller.canExecute('run_sandboxed_command', { CommandLine: cmd });
      assert.strictEqual(check.allowed, true, `Safe command "${cmd}" should be allowed in readOnly mode`);
    }

    recordPass('5.2. HarnessController readOnly guardrails', `4 mutating tools, 7 shell commands blocked; 4 safe commands allowed`);
  } catch (err) {
    recordFail('5.2. readOnly guardrails', err);
  }

  // 5.3. Parameter aliases normalization
  try {
    const rawAliases = [
      { tool: 'replace_file_content', input: { path: 'App.js', TargetContent: 'a', ReplacementContent: 'b' }, canonical: 'TargetFile' },
      { tool: 'view_file', input: { file: 'index.html' }, canonical: 'AbsolutePath' },
      { tool: 'web_search', input: { query: 'Antigravity' }, canonical: 'Query' },
      { tool: 'run_sandboxed_command', input: { command: 'node -v' }, canonical: 'CommandLine' }
    ];

    for (let item of rawAliases) {
      const norm = AciSchemaValidator.normalizeArgs(item.tool, item.input);
      assert.ok(
        norm[item.canonical] !== undefined,
        `Alias for ${item.tool} must populate canonical property "${item.canonical}"`
      );
    }

    recordPass('5.3. AciSchemaValidator parameter aliases normalization', `TargetFile, AbsolutePath, Query, CommandLine mapped cleanly`);
  } catch (err) {
    recordFail('5.3. Parameter aliases normalization', err);
  }

  // 5.4. vfs_change event emission with quoted and relative redirection targets
  try {
    const agent = new SunaAgent({ autoDiscoverVfs: false });
    agent.vfs = new VfsSandbox();

    const emittedChanges = [];
    agent.on('vfs_change', (data) => emittedChanges.push(data));

    // Case 1: Double-quoted filename with space
    agent.vfs.writeFile('docs/my notes.txt', 'Initial notes');
    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: 'echo "updated notes" > "docs/my notes.txt"',
      Cwd: ''
    });
    assert.strictEqual(emittedChanges.length, 1);
    assert.strictEqual(emittedChanges[0].path, 'docs/my notes.txt');

    // Case 2: Relative cwd with single-quoted filename
    agent.vfs.writeFile('src/app.js', 'console.log("hello");');
    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: "echo 'console.log(\"world\");' > 'app.js'",
      Cwd: 'src'
    });
    assert.strictEqual(emittedChanges.length, 2);
    assert.strictEqual(emittedChanges[1].path, 'src/app.js');

    // Case 3: Appending redirection (>>)
    await agent.invokeAciTool('run_sandboxed_command', {
      CommandLine: "echo 'console.log(\"more\");' >> 'app.js'",
      Cwd: 'src'
    });
    assert.strictEqual(emittedChanges.length, 3);
    assert.strictEqual(emittedChanges[2].path, 'src/app.js');

    recordPass('5.4. vfs_change redirection path parsing (double quotes, single quotes, relative cwd, >>)', `3/3 events emitted with exact resolved paths`);
  } catch (err) {
    recordFail('5.4. vfs_change redirection path parsing', err);
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`STRESS TEST EXECUTION COMPLETE`);
  console.log(`TOTAL PASSED: ${passCount}`);
  console.log(`TOTAL FAILED: ${failCount}`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllStressTests();
