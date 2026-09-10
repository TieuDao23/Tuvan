# Technical Survey Report: Test Suite Architecture, Baseline Verification & UI/DOM Environment

**Surveyor**: `explorer_survey_3`  
**Milestone**: Suna Agent Harness Advanced Capabilities (R1: Sub-harness Delegation, R2: Unified Diff & Schema Validator, R3: UI Visualizer & IndexedDB Checkpoint Persistence, R4: E2E Testing & Adversarial Fuzzing)  
**Date**: 2026-09-07  
**Working Directory**: `d:\Suna Chat\.agents\explorer_survey_3`  
**Target Project**: `d:\Suna Chat`

---

## 1. Executive Summary & Verification Baseline

### 1.1 Baseline Status
A rigorous baseline survey was executed across the entire repository. The verification pipeline (`python run_verification.py`) and static syntax checking (`node -c`) yielded the following definitive metrics:
- **Total Test Files**: Exactly 38 test suite files discovered across `tests/` and its subdirectories.
- **Mocha Test Execution**: **982 tests passing, 0 failing, 0 pending** across all 38 files.
- **Mocha Execution Duration**: ~4.0 seconds (pure test execution in Node.js VM).
- **Total Verification Pipeline Duration**: ~7.56 seconds (including static syntax checks, CSS hygiene analysis, Mocha test run, and test distribution verification).
- **Syntax Check**: 0 syntax errors across `app.js`, `redesign.js`, `suna_harness.js`, and `tests/test_suna_harness.js`.
- **CSS Hygiene**: Exactly 1,326 open braces `{` and 1,326 close braces `}` in `styles.css` (100% balanced), `.toast-container` strictly configured with `z-index: 10000`, 0 unclosed nested selector corruptions.
- **Existing SunaHarness Test Suite (`tests/test_suna_harness.js`)**: 154 tests passing in **238ms** with zero regressions against the existing 828 legacy tests.

### 1.2 Verification Pipeline Invariants (`run_verification.py`)
`run_verification.py` acts as the authoritative gatekeeper for the project, enforcing four sequential checks:
1. `verify_syntax()`: Runs `node -c app.js` and `node -c redesign.js`. Note that `suna_harness.js` also compiles cleanly with `node -c`.
2. `verify_css_hygiene()`: Validates curly brace parity in `styles.css`, guards against corrupt unclosed selectors (`re.search(r"\.message\.assistant\s*\.message-bubble\s*\{\s*\.user-dropdown", css)`), and ensures `.toast-container` has `z-index: 10000`.
3. `verify_mocha_tests()`: Executes `npx mocha "tests/**/*.js"`. It parses regex `r'(\d+)\s+passing'`. If the exit code is non-zero or any test fails, it halts immediately.
4. `verify_test_distribution()`: Scans the `tests/` tree and asserts discovery of active feature suites, hidden suites, and adversarial suites.

**Crucial Finding**: `run_verification.py` does not assert a fixed upper bound of 982 tests; rather, it parses `(\d+)\s+passing` and verifies `code == 0` (0 failing). Adding new passing tests (e.g. expanding to 1,060+ tests) will pass the verification runner cleanly, provided no existing test regresses.

---

## 2. Existing Test Infrastructure Deep Dive

### 2.1 Test Suite Inventory (38 Test Files)
The 38 test files in `tests/` are categorized into distinct functional and architectural tiers:

| Category | File Path | Focus Area |
|---|---|---|
| **Harness Core Suite** | `tests/test_suna_harness.js` | 154 tests covering VfsSandbox, AciInterface (6 tools), HarnessController, TrajectoryEngine, CheckpointManager, SelfCorrectionLoop, ChaosFaultInjector, RunawayGuardrails, BenchmarkSuite (20 tasks), EvaluationRunner. |
| **System & Tool Registry** | `tests/test_dsh_core_tools.js`<br>`tests/test_dsh_tool_registry.js`<br>`tests/test_dsh_react_loop_and_trajectory.js` | 11 core tools (sandbox_exec, fs_*, memory_*, web_*), Tool Registry schemas, ReAct loop execution, tool chaining. |
| **Zero-Regression Invariants** | `tests/test_dsh_zero_regression_matrix.js` | 10 Gates (ZR-01 to ZR-10): syntax, CSS hygiene, StreamParser, SunaAgent contracts, live workspace auto-sync, continuation engine, user storage isolation, mindmap bridge, lofi audio, mobile responsiveness. |
| **Continuation & Autonomy** | `tests/test_e2e_token_continuation_engine.js`<br>`tests/test_collapsible_code_and_continuation.js`<br>`tests/test_multi_turn_chaining_and_truncation_detection.js` | Multi-turn streaming, chunk stitching, token ceiling calculation, truncation detection. |
| **Workspace & Sync** | `tests/test_workspace_direct_sync_and_continuation.js`<br>`tests/test_performance_shortcuts_storage_security.js` | Live code iframe injection, textarea auto-sync, synthetic `input` event dispatch, keyboard shortcuts, storage security. |
| **Challenger & Adversarial (10 suites)** | `tests/test_challenger_adversarial_isolation.js`<br>`tests/test_challenger_cloud_sync_adversarial.js`<br>`tests/test_challenger_collapsible_adversarial.js`<br>`tests/test_challenger_continuation_adversarial.js`<br>`tests/test_challenger_m1_token_and_prompt_adversarial.js`<br>`tests/test_challenger_m1_token_maximization.js`<br>`tests/test_challenger_storage_security_adversarial.js`<br>`tests/test_challenger_workspace_live_sync_adversarial.js`<br>`tests/test_challenger_adversarial_suite.js`<br>`tests/test_thinking_blocks_stream_parser_adversarial.js` | Stress testing, memory leaks, rapid flapping auth state, corrupted JSON in localStorage, iframe drag pointer lock, quota exhaustion. |
| **UI Redesign Matrix (9 suites)** | `tests/ui_redesign/visible_tests/*` (4 suites)<br>`tests/ui_redesign/hidden_tests/*` (4 suites)<br>`tests/ui_redesign/adversarial_tests/*` (1 suite) | 60% visible / 40% hidden split: WCAG 4.5:1 contrast ratios, CSS generic font fallbacks, GPU transition performance, 3-pane split layouts, Zen dark palette. |

### 2.2 Deep Dive into `tests/test_suna_harness.js`
`tests/test_suna_harness.js` is 2,127 lines and comprises 154 tests structured into 4 strict tiers:
- **Tier 1: Feature Coverage (65 tests)**:
  - 1.1 `VfsSandbox`: In-memory pure RAM operations, path normalization, mkdir -p, deletion, stat metadata.
  - 1.2 `AciInterface: view_file`: 1-indexed line numbers `<line>: <content>`, window bounds clamping, 46KB byte truncation, contentOffset pagination.
  - 1.3 `AciInterface: replace_file_content`: Surgical verbatim chunk replacement, whitespace preservation, mismatch diagnostics, allowMultiple duplicate controls.
  - 1.4 `AciInterface: grep_search`: Literal search, regex matching, matchPerLine line-numbered snippets, glob includes filtering.
  - 1.5 `AciInterface: find_by_name`: Glob pattern matching, type filters (file/directory), maxDepth traversal.
  - 1.6 `AciInterface: list_dir`: Formatted directory tree enumeration, recursive discovery, entry counts.
  - 1.7 `AciInterface: run_sandboxed_command`: Virtual Unix shell emulator (`ls`, `cat`, `grep`, `head`, `tail`, `wc`, `diff`, `echo`, `node -e`) with zero host disk/network access.
  - 1.8 `HarnessController`: Decoupled turn/token budgets, turn countdown, step progression, abort handling.
  - 1.9 `TrajectoryEngine`: Immutable event stream (`deepFreeze`), serialization to JSONL/Markdown/HTML timeline.
  - 1.10 `CheckpointManager`: LangGraph-style snapshot state capture, rollback/rewind, memory delta tracking, structural sharing.
  - 1.11 `SelfCorrectionLoop & DiagnosticFeedback`: Structured error classification (6 categories: SyntaxError, RangeError, IndentationError, MismatchError, NetworkError, TimeoutError), exact `^` visual pointer generation.
  - 1.12 `ChaosFaultInjector`: 5 fault simulation rules (transient network drops, 429 rate limit backoff, EBUSY locked files, stream chunk fragmentation, corrupted payloads).
  - 1.13 `RunawayGuardrails`: 3-tier loop sentinel (repetition detector, zero-progress detector, ping-pong state oscillation detector), budget enforcement.
  - 1.14 `BenchmarkSuite & EvaluationRunner`: 20 standardized SWE-bench/AgentBench tasks across 5 tiers, automated scorecard metrics ($SR$, $\eta$, $FRR$, $SCT$, $ZPA$).
- **Tier 2: Boundary & Corner Cases (60 tests across 12 boundary domains B1-B12)**:
  - Empty files, large files (>5,000 lines), 1-based line bounds, inverted slices, missing paths, ReDoS regex injection guards, indentation drift, locked files, budget ceilings, path traversal security containment (`../../`, Windows drive letters, null bytes), deep directories, UTF-8 Vietnamese multibyte chunk fragmentation.
- **Tier 3: Cross-Feature Interactions (18 tests across 6 state workflows C1-C6)**:
  - VFS edit -> Checkpoint -> Rewind -> Verify clean restoration.
  - ACI shell -> VFS mutation -> Trajectory event capture.
  - Chaos fault injection -> Diagnostic feedback -> Automated recovery.
  - Repetitive failure -> Guardrail sentinel trip -> Trajectory flush.
  - Checkpoint replay -> Memory integrity verification.
  - Rate limit 429 -> Controller backoff -> Resumed trajectory.
- **Tier 4: Real-World Workloads (6 scenarios T4-SCEN-01 to T4-SCEN-06)**:
  - Multi-file refactoring (extracting HTML/CSS/JS).
  - Algorithmic bug fixing guided by visual `^` diagnostics.
  - Chaos resilience run (network drop + locked file).
  - Time-travel debugging (rewind and alternate branch patch).
  - Full 20-task benchmark evaluation and JSON/Markdown scorecard generation.
  - Live workspace sync with VFS `index.html` mutation events.

### 2.3 Performance & Speed Analysis
- The entire `test_suna_harness.js` executes in **~238ms**.
- **Reason for high speed**: SunaHarness components execute strictly in-memory (RAM-based VFS and mock sandboxes) without disk I/O, network latency, child process spawns, or heavy DOM parsers like JSDOM.
- **Implication for new tests**: Adding 80-120 additional unit/integration tests for R1-R4 will add at most 150-250ms to the test execution, keeping total Mocha test suite runtime well under 5 seconds.

---

## 3. Browser / UI Architecture & DOM Environment Survey

### 3.1 Vanilla JavaScript Architecture & Script Loading
The SunaChat frontend is built on pure Vanilla JavaScript (ES2020+) without Webpack, Vite, or framework bundles.
In `index.html`, scripts are loaded in the following exact sequence at the bottom of `<body>` (lines 924-926):
```html
<script src="suna_harness.js"></script>
<script src="app.js?v=7"></script>
```

`suna_harness.js` employs a Universal Module Definition (UMD) pattern:
```javascript
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory(); // Node.js / CommonJS
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);       // AMD
  } else {
    const harness = factory();
    root.SunaHarness = harness;
    if (typeof window !== 'undefined') {
      window.SunaHarness = harness;
      if (window.SunaAgent && typeof harness.registerAciTools === 'function') {
        harness.registerAciTools(window.SunaAgent);
      }
    }
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  // Module implementation
});
```

When `app.js` executes, it bridges `SunaHarness` into `SunaAgent` at lines 4280-4301:
```javascript
(function bridgeSunaHarness() {
  let harnessModule = null;
  if (typeof SunaHarness !== 'undefined') {
    harnessModule = SunaHarness;
  } else if (typeof window !== 'undefined' && window.SunaHarness) {
    harnessModule = window.SunaHarness;
  } else if (typeof require === 'function') {
    try { harnessModule = require('./suna_harness.js'); } catch (e) {}
  }

  if (harnessModule) {
    SunaAgent.harness = harnessModule;
    if (typeof harnessModule.registerAciTools === 'function') {
      harnessModule.registerAciTools(SunaAgent);
    }
  }
})();
```

### 3.2 DOM Structure & Key UI Mount Points
The application DOM layout consists of:
1. **Chat Area**:
   - `#messages-container`: Container where user and assistant chat message bubbles are appended.
   - Assistant message content is rendered through `formatMessageContent(content, trajectory)`.
2. **Current Trajectory Drawer** (`app.js` lines 8578-8633):
   - When an assistant turn includes tool calls, `renderTrajectoryView(trajectory)` prepends a `.trajectory-container` to the message bubble.
   - Elements:
     - `.trajectory-chip`: A clickable pill button displaying the number of steps, duration in ms, and a toggle chevron `▼`.
     - `.trajectory-drawer.collapsed`: Collapsible container expanding to max-height 1200px on click (`toggleTrajectoryDrawer(this)`).
     - `.trajectory-timeline`: Timeline container hosting `.trajectory-step-node` items.
     - `.trajectory-step-node`: Contains step number badge, tool name, duration, thought snippet, params JSON, and result/error.
3. **Live Workspace (3-Pane Split Layout)**:
   - `#artifacts-panel`: Container for the workspace.
   - `#artifact-editor-textarea`: Left pane code editor textarea.
   - `#artifact-iframe`: Middle pane live rendering iframe.
   - `#workspace-chat-messages` & `#workspace-chat-input`: Right pane workspace assistant chat.
4. **Modal Dialog System**:
   - Standard modal markup across SunaChat:
     ```html
     <div id="<name>-modal" class="modal-overlay" style="display:none;">
       <div class="modal <name>-modal">
         <div class="modal-header">...</div>
         <div class="modal-body">...</div>
       </div>
     </div>
     ```
   - Existing modals: `settings-modal`, `api-modal`, `personality-modal`, `font-modal`, `rename-modal`, `delete-confirm-modal`, `memory-modal`, `translator-modal`, `pinned-context-modal`, `export-modal`.

### 3.3 Visual Styling & Design Language (`styles.css`)
- **Theme Palette**: Zen Dark (Ink-wash) / Light theme.
  - `--bg-primary`: `#0d0d11` (dark), `#f8f9fa` (light)
  - `--bg-secondary`: `rgba(20, 18, 30, 0.65)`
  - `--bg-card`: `rgba(255, 255, 255, 0.04)`
  - `--border-glass`: `rgba(255, 255, 255, 0.08)`
  - `--accent-1`: `#e8a87c` (warm terracotta/apricot)
  - `--accent-glow`: `rgba(232, 168, 124, 0.35)`
  - `--radius-pill`: `9999px`, `--radius-md`: `16px`, `--radius-sm`: `12px`
- **Existing Trajectory CSS** (`styles.css` lines 7149-7422):
  - Fully styled `.trajectory-container`, `.trajectory-chip`, `.trajectory-drawer`, `.trajectory-timeline`, `.trajectory-step-node`, `.step-card`, `.step-number`, `.step-indicator`, and light-mode overrides.
- **Identified UI Gaps for R3**:
  1. *Trajectory Tree Hierarchy*: Current `renderTrajectoryView` only renders flat 1-dimensional step lists. It lacks visual tree indentation for sub-harness delegation, parent-child connectors, role badges (e.g. `[Sub-Agent: Refactor]`), and filtering by sub-agent/depth.
  2. *Benchmark Scorecard Component*: No visual scoreboard component exists in the DOM to render the 3 key metrics ($SR$, $\eta$, $FRR$) with progress rings/bars and task breakdown table.
  3. *Diff Viewer Component*: No visual Diff component exists in the DOM to display unified/side-by-side Git diffs with syntax coloring (`.diff-line.diff-add` green, `.diff-line.diff-del` red, line gutters).

---

## 4. Testing Helpers, Mock VFS & Mock DOM Utilities

Because the test suite executes in Node.js (without browser globals or JSDOM dependencies), lightweight, deterministic in-memory mock utilities are required to test browser-dependent features (DOM rendering, event listeners, and IndexedDB persistence).

### 4.1 Mock DOM Environment Utility (`createMockDOM`)
This lightweight DOM emulator allows testing UI Visualizer DOM nodes, event listeners, class toggling, and query selectors without installing third-party DOM libraries:

```javascript
function createMockDOM() {
  class MockClassList {
    constructor(el) {
      this._el = el;
      this._classes = new Set();
    }
    add(...cls) { cls.forEach(c => this._classes.add(c)); this._sync(); }
    remove(...cls) { cls.forEach(c => this._classes.delete(c)); this._sync(); }
    toggle(c) {
      const has = this._classes.has(c);
      if (has) this._classes.delete(c); else this._classes.add(c);
      this._sync();
      return !has;
    }
    contains(c) { return this._classes.has(c); }
    _sync() { this._el.className = Array.from(this._classes).join(' '); }
  }

  class MockElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.className = '';
      this.classList = new MockClassList(this);
      this.attributes = new Map();
      this.style = {};
      this.children = [];
      this.parentElement = null;
      this._innerHTML = '';
      this._textContent = '';
      this._listeners = new Map();
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
      if (k === 'class') {
        this.className = String(v);
        this.classList._classes = new Set(String(v).split(/\s+/).filter(Boolean));
      }
    }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }
    
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    }
    
    get innerHTML() { return this._innerHTML; }
    set innerHTML(val) {
      this._innerHTML = val;
      this._textContent = val.replace(/<[^>]*>/g, '');
    }
    get textContent() { return this._textContent; }
    set textContent(val) {
      this._textContent = val;
      this._innerHTML = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    addEventListener(evt, fn) {
      if (!this._listeners.has(evt)) this._listeners.set(evt, []);
      this._listeners.get(evt).push(fn);
    }
    removeEventListener(evt, fn) {
      if (this._listeners.has(evt)) {
        this._listeners.set(evt, this._listeners.get(evt).filter(f => f !== fn));
      }
    }
    dispatchEvent(event) {
      const fns = this._listeners.get(event.type) || [];
      fns.forEach(fn => fn.call(this, event));
      return true;
    }
    click() {
      this.dispatchEvent({ type: 'click', target: this });
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
      const results = [];
      const match = (el) => {
        if (selector.startsWith('.')) {
          if (el.classList.contains(selector.slice(1))) results.push(el);
        } else if (selector.startsWith('#')) {
          if (el.getAttribute('id') === selector.slice(1)) results.push(el);
        } else if (selector.startsWith('[')) {
          const attr = selector.replace(/[\[\]]/g, '').split('=')[0];
          if (el.hasAttribute(attr)) results.push(el);
        } else if (el.tagName.toLowerCase() === selector.toLowerCase()) {
          results.push(el);
        }
        el.children.forEach(match);
      };
      this.children.forEach(match);
      return results;
    }

    closest(selector) {
      let cur = this;
      while (cur) {
        if (selector.startsWith('.') && cur.classList.contains(selector.slice(1))) return cur;
        if (selector.startsWith('#') && cur.getAttribute('id') === selector.slice(1)) return cur;
        if (cur.tagName && cur.tagName.toLowerCase() === selector.toLowerCase()) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
  }

  const elementsRegistry = new Map();

  const mockDoc = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => elementsRegistry.get(id) || null,
    registerElement: (id, el) => { el.setAttribute('id', id); elementsRegistry.set(id, el); },
    body: new MockElement('body'),
    querySelector: (sel) => mockDoc.body.querySelector(sel),
    querySelectorAll: (sel) => mockDoc.body.querySelectorAll(sel)
  };

  return { mockDoc, MockElement };
}
```

### 4.2 Mock IndexedDB Storage Utility (`createMockIndexedDBStore`)
To verify R3 checkpoint persistence (`suna_harness_checkpoints_<uid>`) without requiring browser native IndexedDB:

```javascript
function createMockIndexedDBStore() {
  const databases = new Map(); // dbName -> Map<storeName, Map<key, value>>

  return {
    open(dbName, version = 1) {
      if (!databases.has(dbName)) {
        databases.set(dbName, new Map());
      }
      const dbStores = databases.get(dbName);

      return {
        createObjectStore(storeName) {
          if (!dbStores.has(storeName)) {
            dbStores.set(storeName, new Map());
          }
        },
        transaction(storeNames, mode = 'readonly') {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          return {
            objectStore(storeName) {
              if (!dbStores.has(storeName)) {
                dbStores.set(storeName, new Map());
              }
              const store = dbStores.get(storeName);
              return {
                get(key) {
                  const val = store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null;
                  return Promise.resolve(val);
                },
                put(value, key) {
                  store.set(key, JSON.parse(JSON.stringify(value)));
                  return Promise.resolve(key);
                },
                delete(key) {
                  store.delete(key);
                  return Promise.resolve();
                },
                getAll() {
                  return Promise.resolve(Array.from(store.values()).map(v => JSON.parse(JSON.stringify(v))));
                },
                clear() {
                  store.clear();
                  return Promise.resolve();
                }
              };
            }
          };
        }
      };
    },
    _dump(dbName, storeName) {
      if (!databases.has(dbName)) return {};
      const store = databases.get(dbName).get(storeName);
      return store ? Object.fromEntries(store.entries()) : {};
    },
    _clearAll() {
      databases.clear();
    }
  };
}
```

### 4.3 Git Patch Compliance Checker (`validateGitPatchCompliance`)
To rigorously verify that `VfsDiffEngine` output strictly conforms to the Git unified diff standard:

```javascript
function validateGitPatchCompliance(diffString, expectedOldPath, expectedNewPath) {
  assert.ok(typeof diffString === 'string', 'Diff output must be a string');
  const lines = diffString.split('\n');

  // Check headers
  const header1 = lines.find(l => l.startsWith('--- '));
  const header2 = lines.find(l => l.startsWith('+++ '));
  assert.ok(header1, 'Diff must contain "--- " old file header');
  assert.ok(header2, 'Diff must contain "+++ " new file header');
  if (expectedOldPath) assert.ok(header1.includes(expectedOldPath));
  if (expectedNewPath) assert.ok(header2.includes(expectedNewPath));

  // Check hunk headers @@ -l,s +l,s @@
  const hunkHeaders = lines.filter(l => /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/.test(l));
  assert.ok(hunkHeaders.length > 0, 'Diff must contain at least one valid @@ hunk header');

  // Verify hunk line count arithmetic
  let inHunk = false;
  let oldCount = 0, newCount = 0;
  let expOld = 0, expNew = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (inHunk) {
        assert.strictEqual(oldCount, expOld, `Hunk old line count mismatch: parsed ${oldCount} vs header ${expOld}`);
        assert.strictEqual(newCount, expNew, `Hunk new line count mismatch: parsed ${newCount} vs header ${expNew}`);
      }
      inHunk = true;
      expOld = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      expNew = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;
      oldCount = 0;
      newCount = 0;
    } else if (inHunk) {
      if (line.startsWith('-')) {
        oldCount++;
      } else if (line.startsWith('+')) {
        newCount++;
      } else if (line.startsWith(' ')) {
        oldCount++;
        newCount++;
      }
    }
  }

  return true;
}
```

### 4.4 Vietnamese Unicode Corpus Generator
To verify that diffing and chunk replacements preserve UTF-8 Vietnamese diacritics and character encodings:

```javascript
function getVietnameseTestCorpus() {
  return {
    title: 'Hệ thống Suna Agent Harness: Điều Phối Đa-Agent & Phân Tầng',
    summary: 'Kiểm toán thay đổi trực quan và khôi phục sau sự cố.',
    codeBlock: [
      '// Chức năng: Tính toán hiệu suất bước suy luận',
      'function tinhToanHieuSuat(buocHienTai, buocToiUu) {',
      '  if (buocHienTai <= 0) return 0.0;',
      '  const eta = buocToiUu / buocHienTai;',
      '  return Math.min(1.0, eta); // Tỷ lệ tối đa 100%',
      '}',
      'module.exports = { tinhToanHieuSuat };'
    ].join('\n'),
    modifiedBlock: [
      '// Chức năng: Tính toán hiệu suất bước suy luận (Đã tối ưu hóa)',
      'function tinhToanHieuSuat(buocHienTai, buocToiUu) {',
      '  if (buocHienTai <= 0) return 0.0;',
      '  const eta = buocToiUu / buocHienTai;',
      '  console.log("Đã hoàn tất tính toán.");',
      '  return Math.min(1.0, eta); // Tỷ lệ tối đa 100%',
      '}',
      'module.exports = { tinhToanHieuSuat };'
    ].join('\n')
  };
}
```

---

## 5. Clean Test Integration Architecture (Zero-Regression Roadmap)

### 5.1 Architectural Decision: Single Test File vs. Modular Files
Two structural options were evaluated for organizing the new tests:

| Evaluation Dimension | Option A: Extend `tests/test_suna_harness.js` | Option B: Separate Modular Files (`tests/test_suna_harness_*.js`) |
|---|---|---|
| **Discovery & Automation** | Automatically runs via `npx mocha "tests/**/*.js"` and `run_verification.py`. | Automatically runs via `npx mocha "tests/**/*.js"` and `run_verification.py`. |
| **Suite Cohesion** | High: All SunaHarness components, controllers, and oracles stay unified in one canonical suite. | Medium: Requires duplicating or cross-importing `getHarnessModule()` and test harness boilerplate. |
| **Verification Gate Safety** | Zero risk of breaking `verify_test_distribution()`. | Small risk: `run_verification.py` categorizes suites by filename pattern (`visible_tests`, `test_collapsible`, `test_workspace_direct`, `adversarial`, etc.). |
| **Test Output Granularity** | Clean hierarchical Mocha nesting: Tiers 1-4 with explicit sub-headings. | Spread across multiple files in terminal output. |
| **Recommendation** | **STRONGLY RECOMMENDED (Primary)** | Secondary (if file size exceeds 5,000 lines) |

**Recommendation**: Integrate the new test suites directly into `tests/test_suna_harness.js` (or alternatively co-located modular files prefixed with `test_suna_harness_*.js`). Since `tests/test_suna_harness.js` is currently 2,127 lines, adding ~1,000 lines for the new sections will bring it to ~3,100 lines, which is well within comfortable limits (for comparison, `tests/test_e2e_token_continuation_engine.js` is 2,400+ lines, and `app.js` is 10,400+ lines).

### 5.2 Test Suite Structure Plan for R1-R4
The existing 4-tier structure in `tests/test_suna_harness.js` will be seamlessly augmented without touching or renumbering any of the existing 154 tests (T1-VFS-01 through T4-SCEN-06):

```
describe('Suna Agent Harness (SunaHarness) Comprehensive E2E Test Suite', () => {

  // =========================================================================
  // TIER 1: FEATURE COVERAGE (Existing 1.1 - 1.14 + New 1.15 - 1.19)
  // =========================================================================
  // Existing: 1.1 to 1.14 (65 tests preserved verbatim)
  
  // NEW R1:
  describe('1.15 SubHarnessDelegation & Inter-Harness Event Bus', () => {
    // T1-SUB-01: spawnSubHarness with share mode (shared VFS mutations)
    // T1-SUB-02: spawnSubHarness with clone mode (isolated VFS mutations)
    // T1-SUB-03: spawnSubHarness with branch mode (branch & merge capability)
    // T1-SUB-04: Two-way Inter-Harness Event Bus (directive dispatch & progress reports)
    // T1-SUB-05: Emergency stop & cascade abort from parent to child
    // T1-SUB-06: Hierarchical Trajectory Stitching into parent stream
  });

  // NEW R2:
  describe('1.16 VfsDiffEngine (Unified Git Diff Generator)', () => {
    // T1-DIFF-01: Generate valid Git patch header (--- a/... +++ b/...)
    // T1-DIFF-02: Generate accurate @@ -l,s +l,s @@ hunk line bounds
    // T1-DIFF-03: File-to-file comparison in VFS
    // T1-DIFF-04: VFS snapshot-to-snapshot comparison
    // T1-DIFF-05: Pre-commit diff preview for replace_file_content
    // T1-DIFF-06: Unicode Vietnamese diacritics verbatim preservation
  });

  // NEW R2:
  describe('1.17 AciSchemaValidator (JSON Schema Validation Layer)', () => {
    // T1-SCHEMA-01: Validate view_file parameters (types & required)
    // T1-SCHEMA-02: Validate replace_file_content (required fields & line bounds)
    // T1-SCHEMA-03: Validate grep_search (query required, regex boolean)
    // T1-SCHEMA-04: Validate find_by_name (enum: file|directory|any)
    // T1-SCHEMA-05: Validate list_dir (depth ranges & booleans)
    // T1-SCHEMA-06: Validate run_sandboxed_command (CommandLine required)
    // T1-SCHEMA-07: Early rejection before VFS execution with structured diagnostics
  });

  // NEW R3:
  describe('1.18 CheckpointPersistence (IndexedDB Storage Engine)', () => {
    // T1-IDB-01: Serialize full VFS snapshot and checkpoint trajectory to JSON
    // T1-IDB-02: Store snapshot in suna_harness_checkpoints_<uid>
    // T1-IDB-03: Restore VFS and checkpoint history from IndexedDB
    // T1-IDB-04: Graceful fallback to localStorage/RAM when IndexedDB fails
    // T1-IDB-05: Multi-session isolation by user UID
  });

  // NEW R3:
  describe('1.19 SunaHarness UI Visualizer (DOM Component)', () => {
    // T1-UI-01: Render hierarchical Trajectory Tree with sub-agent badges
    // T1-UI-02: Filter trajectory tree by sub-harness ID and depth level
    // T1-UI-03: Render Benchmark Scorecard (SR, eta, FRR) with visual progress
    // T1-UI-04: Render Syntax-highlighted Diff Viewer (add green, del red)
    // T1-UI-05: Toggle between Unified Diff and Side-by-Side views
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Existing B1 - B12 + New B13 - B16)
  // =========================================================================
  // Existing: B1 to B12 (60 tests preserved verbatim)

  // NEW:
  describe('B13: Sub-harness Workspace Isolation & Branch Divergence', () => {
    // T2-B13-01: Concurrent edits on distinct files in branch mode
    // T2-B13-02: Detect merge conflict on identical line mutation
    // T2-B13-03: Sub-harness budget exhaustion without parent exhaustion
    // T2-B13-04: Sub-harness crashing without crashing parent harness
  });

  describe('B14: Diff Special Cases & Edge File Conditions', () => {
    // T2-B14-01: Diff comparing completely empty file to new content
    // T2-B14-02: Diff comparing identical files returning zero hunks
    // T2-B14-03: Diff with CRLF vs LF newline normalization
    // T2-B14-04: Trailing newline addition/deletion handling
  });

  describe('B15: Schema Injection Attacks & Prototype Pollution', () => {
    // T2-B15-01: Reject __proto__ injection in tool arguments
    // T2-B15-02: Reject constructor.prototype pollution attempts
    // T2-B15-03: Handle NaN, Infinity, and null bytes safely
    // T2-B15-04: Reject extraneous unexpected schema properties when additionalProperties: false
  });

  describe('B16: IndexedDB Quota & Storage Resilience', () => {
    // T2-B16-01: Handle simulated QuotaExceededError during checkpoint save
    // T2-B16-02: Evict oldest checkpoints when quota threshold is breached
    // T2-B16-03: Recover cleanly from corrupted checkpoint serialization
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS (Existing C1 - C6 + New C7 - C10)
  // =========================================================================
  // Existing: C1 to C6 (18 tests preserved verbatim)

  // NEW:
  describe('C7: Sub-harness Branch -> Diff Preview -> Merge -> Trajectory Stitch', () => {
    // T3-C7-01: Child branches VFS, edits code, diff is previewed, merged to parent
    // T3-C7-02: Trajectory stitches child thoughts and actions under child branch node
  });

  describe('C8: Schema Validation Failure -> Diagnostic Loop -> Correction', () => {
    // T3-C8-01: Agent supplies malformed arguments -> Validator rejects -> Diagnostic returned -> Agent self-corrects
  });

  describe('C9: Multi-Agent Execution -> Scorecard KPI Calculation -> UI Render', () => {
    // T3-C9-01: Run multi-agent task -> calculate SR and eta -> render visual DOM scorecard
  });

  describe('C10: Checkpoint Snapshot -> IndexedDB -> Full Reload Restoration', () => {
    // T3-C10-01: Take checkpoint -> persist to IDB -> destroy harness -> reload from IDB -> verify identical VFS & trajectory
  });

  // =========================================================================
  // TIER 4: REAL-WORLD & ADVERSARIAL FUZZING (Existing T4-01 to T4-06 + New T4-07 to T4-10)
  // =========================================================================
  // Existing: T4-SCEN-01 to T4-SCEN-06 (6 tests preserved verbatim)

  // NEW:
  describe('Tier 4: Adversarial Fuzzing & Stress Scenarios', () => {
    // T4-SCEN-07: Deep Sub-harness Nesting (Recursive hierarchy to depth >= 5)
    // T4-SCEN-08: Ultra-large File Diff Fuzzing (>10,000 lines diff generation & hunk verification)
    // T4-SCEN-09: Schema Fuzzing Matrix (massive randomized invalid input payload fuzzing)
    // T4-SCEN-10: End-to-End Multi-Agent Architecture Refactor with Branching and Persistence
  });

});
```

### 5.3 Zero-Regression Guarantee Protocol
To guarantee 100% backward compatibility and prevent regression:
1. **Preserve All Legacy Whitelists & Invariants**:
   - `SunaAgent.MAX_RECURSION_DEPTH = 4` must remain intact.
   - `SunaAgent.tools` must preserve all 5 legacy tools (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`).
   - `styles.css` brace count and `.toast-container` z-index 10000 must remain untouched.
   - `StreamParser` must pass regular conversational text without buffering delays.
2. **Backward-Compatible Return Signatures**:
   - `VfsSandbox`, `AciInterface`, and `TrajectoryEngine` must maintain their existing method signatures. Any new capability (e.g. schema validation, diff generation, sub-harness spawning) should either wrap existing methods or be exposed as additive methods/options.
3. **Execution Gate Sequence**:
   - Run `node -c app.js && node -c redesign.js && node -c suna_harness.js && node -c tests/test_suna_harness.js`.
   - Run `npx mocha tests/test_suna_harness.js` to ensure harness tests pass.
   - Run `python run_verification.py` to ensure all 982+ tests pass, CSS hygiene is clean, and the distribution check passes with exit code 0.

---

## 6. Conclusion & Recommendations for Implementers

1. **Test Infrastructure Ready**: The existing test suite is fast, reliable, and decoupled. It is ready to accept the new test suites with zero overhead.
2. **No Hardcoded Test Counts**: Neither `package.json` nor `run_verification.py` asserts an exact count of 982 tests; they enforce zero failures. Adding ~80-100 new tests for R1-R4 will seamlessly transition the project from 982 passing tests to ~1,060+ passing tests.
3. **Mock DOM & Mock IDB**: Use the provided lightweight mock utilities (`createMockDOM` and `createMockIndexedDBStore`) inside the test suite to achieve full coverage of R3 visualizer and persistence without installing external npm packages.
4. **Git Diff & Vietnamese Support**: Ensure `VfsDiffEngine` computes standard `@@ -l,s +l,s @@` hunks with line arithmetic and supports UTF-8 multibyte characters without regex mangling.
5. **Hierarchical Trajectory Model**: Enhance `TrajectoryEngine` to support a tree model (`parentId`, `subHarnessId`, `depth`) so that child sub-harness events are attached as hierarchical branches to the parent trajectory.
