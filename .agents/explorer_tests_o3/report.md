# Comprehensive Test Harness Analysis & DeepSeek Harness (DSH) Test Strategy

## 1. Executive Summary & Baseline Verification

A thorough investigation of the Suna Chat testing infrastructure, existing test suites, and verification framework was conducted.
The test harness is operating with **100% pass rate across all 644 existing tests**, with **0 syntax errors** and **0 regressions**.

### Baseline Verification Status:
| Verification Gate | Command | Execution Time | Result | Status |
|---|---|---|---|---|
| **JavaScript Syntax** | `node -c app.js && node -c redesign.js` | 315 ms | 0 errors | **PASSED** |
| **CSS Hygiene & Braces** | `python run_verification.py` (Step 2) | 12 ms | Balanced `{}` (open = close), `.toast-container { z-index: 10000; }` | **PASSED** |
| **Mocha Test Suite** | `npx mocha "tests/**/*.js"` / `npm test` | ~4.0 s | **644 passing, 0 failing, 0 pending** | **PASSED** |
| **Orchestrated Suite** | `python run_verification.py` | 9.03 s | `>>> VERIFICATION PASSED: ALL CHECKS 100% GREEN (644 TESTS) <<<` | **PASSED** |
| **Test Distribution** | `run_verification.py` (Step 4) | 15 ms | 30 test files discovered; Active Feature: 8, Hidden & Adversarial: 12 | **PASSED** |

---

## 2. Test Infrastructure & Framework Architecture

### 2.1 Configuration & Test Scripts (`package.json`)
```json
{
  "name": "suna-chat",
  "version": "2.0.0",
  "description": "Suna Chat - Modern AI Web Application with Zen Dark & Live Workspace",
  "main": "app.js",
  "scripts": {
    "test": "npx mocha \"tests/**/*.js\"",
    "check": "node -c app.js && node -c redesign.js"
  },
  "keywords": ["ai", "chat", "workspace", "vanilla-js"],
  "author": "Suna Team",
  "license": "MIT"
}
```
- **`npm test`**: Invokes Mocha over all `.js` files located in `tests/` and all recursive subdirectories using globbing `"tests/**/*.js"`.
- **`npm run check`**: Runs Node's native compiler syntax checker (`node -c`) against `app.js` and `redesign.js`.

### 2.2 Assertion Framework & Dependencies
- **Test Runner**: Mocha (BDD interface: `describe`, `it`, `before`, `beforeEach`, `after`, `afterEach`).
- **Assertion Library**: Standard Node.js built-in `assert` module (`assert.strictEqual`, `assert.ok`, `assert.deepStrictEqual`, `assert.match`, `assert.doesNotThrow`, `assert.throws`, `assert.notStrictEqual`).
- **Zero Third-Party Test Bloat**: The project avoids heavy assertion frameworks (no Chai, no Jest, no Sinon, no Puppeteer). All mocks and stubs use Node.js standard libraries (`assert`, `vm`, `fs`, `child_process`).
- **Execution Mechanism**: Because `app.js` is a vanilla client-side browser application without Node `module.exports`, tests utilize Node's built-in `vm` module:
  1. `fs.readFileSync('app.js', 'utf8')` reads the source code.
  2. Mock browser environments are created: `vm.createContext(sandbox)` with mock `window`, `document`, `State`, `fetch`, `Event`, `AbortController`, `localStorage`.
  3. Functions or blocks are either extracted via RegExp and executed via `vm.runInContext()`, or simulated end-to-end.
  4. Static structural assertions examine DOM selectors, regex patterns, CSS rules, and accessibility attributes.

### 2.3 Authoritative Verification Runner (`run_verification.py`)
`run_verification.py` is the single source of truth for repository health, enforcing 4 sequential stages:
1. **Step 1: JavaScript Syntax Verification (`verify_syntax`)**:
   - Executes `node -c app.js` and `node -c redesign.js`. Must exit code 0.
2. **Step 2: CSS Hygiene & Brace Balance (`verify_css_hygiene`)**:
   - Compares count of `{` against `}` in `styles.css`.
   - Prohibits corrupt unclosed nested selector regex: `r"\.message\.assistant\s*\.message-bubble\s*\{\s*\.user-dropdown"`.
   - Mandates `.toast-container { z-index: 10000; }`.
3. **Step 3: Mocha Test Execution (`verify_mocha_tests`)**:
   - Runs `npx mocha "tests/**/*.js"`.
   - Parses regex `r'(\d+)\s+passing'`.
   - Requires zero failures and non-zero passing count.
4. **Step 4: Test Architecture Distribution (`verify_test_distribution`)**:
   - Scans `tests/` directory tree.
   - Validates existence of visible and hidden test splits.

---

## 3. Complete Inventory of Existing 644 Tests (30 Test Files)

An exhaustive audit of all 30 test files was conducted with exact test counts:

| # | Test File Path | Tests | Primary Scope & Coverage Area |
|---|---|:---:|---|
| 1 | `tests/test_e2e_token_continuation_engine.js` | **216** | 4-Tier E2E matrix covering all 20 continuation features (F1–F20), token ceiling resolvers, boundary code fence deduplication, single bubble streaming, 60fps rAF rendering, Three.js 1200+ line workloads. |
| 2 | `tests/test_collapsible_code_and_continuation.js` | **34** | Collapsible code blocks (>12 lines / >260px), toggle UI, copy/preview preservation, thinking tag separation, multi-turn chunk stitcher. |
| 3 | `tests/test_performance_shortcuts_storage_security.js` | **31** | Scroll performance, debounce timers, hybrid storage quota recovery, global keyboard shortcuts, KaTeX math parsing safety, iframe sandbox hardening. |
| 4 | `tests/test_challenger_collapsible_adversarial.js` | **30** | Adversarial stress testing for collapsible code blocks, unclosed backticks, huge payloads. |
| 5 | `tests/test_workspace_direct_sync_and_continuation.js` | **29** | Direct workspace live sync, `#artifact-editor-textarea` updates, synthetic `input` event dispatch, `#artifact-iframe.srcdoc` live reload, toast z-index 10000. |
| 6 | `tests/test_multi_turn_chaining_and_truncation_detection.js` | **28** | Multi-tier truncation detection (`length`, unclosed fences, unclosed HTML tags), continuation context builder, 10-20 turn recursion bound guard. |
| 7 | `tests/test_challenger_m1_token_and_prompt_adversarial.js` | **27** | Adversarial prompt injection, anti-placeholder rules, multi-byte UTF-8 token ceiling tests. |
| 8 | `tests/test_thinking_blocks_stream_parser_adversarial.js` | **26** | `<think>` and `<thought>` stream parsing, accordion toggle, streaming state transitions, unclosed tag resilience. |
| 9 | `tests/test_topbar_layout_and_css_hygiene.js` | **25** | Top bar layout, Lofi player, responsive breakpoints, CSS syntax & brace balance. |
| 10 | `tests/test_challenger_workspace_live_sync_adversarial.js` | **24** | Adversarial workspace live sync, rapid edits, malformed HTML/regex, abort propagation. |
| 11 | `tests/test_challenger_adversarial_suite.js` | **18** | Dual resizers, pointer locking, storage isolation, anti-tautology test distribution checks. |
| 12 | `tests/test_challenger_m1_token_maximization.js` | **18** | Model ceiling resolution across reasoning models (o1, o3, claude-3-7) and coding models. |
| 13 | `tests/test_challenger_storage_security_adversarial.js` | **17** | QuotaExceededError recovery, user account switching state clearing, storage key suffix isolation. |
| 14 | `tests/test_challenger_continuation_adversarial.js` | **16** | 500-line Three.js multi-turn continuation streams, abort cancellation, recursion guards. |
| 15 | `tests/test_four_pillars_comprehensive_suite.js` | **16** | Mindmap canvas bridge, Live Workspace Pro (console drawer, device modes), AI memory folders, code optimization. |
| 16 | `tests/test_token_maximization_and_system_prompts.js` | **15** | Main chat & workspace assistant anti-placeholder system prompt directives. |
| 17 | `tests/ui_redesign/adversarial_tests/test_adversarial_state_and_resilience.js` | **14** | Workspace resizer boundary clamping, state resilience, pointer lock restore. |
| 18 | `tests/test_mobile_responsive_redesign.js` | **12** | Mobile layout responsiveness, dropdown menus, touch target dimensions. |
| 19 | `tests/test_session_idle_and_scroll_preservation.js` | **11** | Session idle timer, user scroll position preservation during streaming. |
| 20 | `tests/test_mindmap_balanced_engine_and_features_opt.js` | **8** | Mindmap tree balance, node drag-and-drop, export formats. |
| 21 | `tests/test_per_message_diagram_and_svg_render.js` | **6** | Per-message SVG diagram rendering, markdown-to-tree sanitizer, camera centering in fitScreen. |
| 22 | `tests/test_spacious_layout_redesign.js` | **6** | Zen spacious layout spacing, header padding, message container widths. |
| 23 | `tests/ui_redesign/hidden_tests/test_workspace_resizers_and_storage.js` | **6** | Workspace resizers, pointer lock, localStorage sync across handlers. |
| 24 | `tests/ui_redesign/visible_tests/test_color_palette.js` | **3** | Zen charcoal palette, glassmorphic panel styling, accent consistency. |
| 25 | `tests/ui_redesign/visible_tests/test_typography.js` | **2** | Typography imports, serif headers, letter spacing. |
| 26 | `tests/ui_redesign/visible_tests/test_workspace_layout.js` | **2** | 3-pane split containers, resizers in index.html and styles.css. |
| 27 | `tests/ui_redesign/hidden_tests/test_contrast_ratio.js` | **1** | Text contrast ratio >= 4.5:1 for WCAG accessibility. |
| 28 | `tests/ui_redesign/hidden_tests/test_css_fallbacks.js` | **1** | Safe generic font-family fallbacks. |
| 29 | `tests/ui_redesign/hidden_tests/test_transition_perf.js` | **1** | Transition performance rules (transform, opacity only). |
| 30 | `tests/ui_redesign/visible_tests/test_layout_elements.js` | **1** | Interactive element hover and active transitions. |
| **TOTAL** | **30 Files** | **644** | **100% Pass Rate (0 Failures, 0 Skips)** |

---

## 4. Key Architectural Observations & Zero-Regression Constraints

### Constraint 1: Dynamic Syntax Verification on all Test Files
In `tests/test_e2e_token_continuation_engine.js` (lines 1821–1827):
```javascript
it('T2-B20.3: should verify all test files in tests/ directory parse cleanly', () => {
  const testFiles = fs.readdirSync('tests').filter(f => f.endsWith('.js'));
  testFiles.forEach(tf => {
    const content = fs.readFileSync(`tests/${tf}`, 'utf8');
    assert.doesNotThrow(() => new vm.Script(content), `Syntax error in tests/${tf}`);
  });
});
```
**Impact**: Every new test file created in `tests/` must have 100% valid JavaScript syntax. A single syntax error in any test file will break `test_e2e_token_continuation_engine.js`.

### Constraint 2: Test Ratio Integrity in `ui_redesign/`
In `tests/test_challenger_adversarial_suite.js` (lines 142–160):
```javascript
const visibleFiles = fs.readdirSync('tests/ui_redesign/visible_tests');
const hiddenFiles = fs.readdirSync('tests/ui_redesign/hidden_tests');
assert.ok(visibleFiles.length >= 4);
assert.ok(hiddenFiles.length >= 4);
const visiblePct = (visibleFiles.length / (visibleFiles.length + hiddenFiles.length)) * 100;
assert.ok(visiblePct >= 50 && visiblePct <= 60);
```
**Impact**: Do NOT place new DSH tests inside `tests/ui_redesign/`. New DSH tests should be placed in `tests/` root (e.g. `tests/test_dsh_*.js`) where they are automatically discovered by Mocha without disturbing the redesign directory ratio.

### Constraint 3: Existing `window.SunaAgent` Compatibility
In `tests/test_e2e_token_continuation_engine.js` (lines 399–402), the continuation engine tests mock `SunaAgent` as:
```javascript
SunaAgent: { MAX_RECURSION_DEPTH: 4, StreamParser: class { parseChunk() {} flush() {} } },
```
And in `app.js` (lines 2916–3248, 7107–7152):
- `SunaAgent` already defines: `StreamParser`, `MAX_RECURSION_DEPTH: 4`, `MAX_RESULT_LENGTH: 1500`, `reset()`, `abort()`, `tools: { change_lofi_mood, speak_message, save_note_to_firestore, get_system_state, update_user_profile }`, `executeTool(name, args)`, `handleToolCalls(rawCallsArray)`.
- `State.agentRecursionDepth` tracks tool execution depth.
**Impact**: When upgrading `SunaAgent` to the DeepSeek Harness architecture:
1. `MAX_RECURSION_DEPTH` must remain defined and defaulted to 4 (or user-configurable with fallback to 4).
2. `StreamParser` must remain functional and backward compatible.
3. Existing tools (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`) must continue to work without breaking.

### Constraint 4: CSS Hygiene & Stacking Context
In `run_verification.py`:
- `open_braces == close_braces` in `styles.css`.
- `.toast-container` must maintain `z-index: 10000;`.
**Impact**: Any CSS added for Trajectory views or tool status chips must maintain balanced `{}` and never modify `.toast-container`.

---

## 5. DeepSeek Harness (DSH) Test Strategy Design

To verify the new DeepSeek Harness capabilities with zero regressions, four comprehensive new test suites are designed:

```
tests/
├── test_dsh_tool_registry.js             # Suite 1: Modular Tool Registry (Unit & Contract)
├── test_dsh_core_tools.js                # Suite 2: 11 Core Tools (Unit & Isolation)
├── test_dsh_react_loop_and_trajectory.js # Suite 3: ReAct Loop, Trajectory & UI (Integration)
└── test_dsh_zero_regression_matrix.js    # Suite 4: End-to-End System Parity & Hardening
```

---

### 5.1 Suite 1: Modular Tool Registry (`test_dsh_tool_registry.js`)
**Scope**: Verification of dynamic tool lifecycle management, schema enforcement, registration, unregistration, parameter validation, and execution guards.

| Test ID | Test Name | Target Method | Specification / Assertion |
|---|---|---|---|
| `TR-01` | Successful tool registration | `registerTool` | Registers tool with `name`, `description`, `parameters`, `execute`. Tool appears in `listTools()`. |
| `TR-02` | Rejects registration with missing `name` | `registerTool` | Throws descriptive error `Tool definition must include a valid string 'name'`. |
| `TR-03` | Rejects registration with missing `execute` | `registerTool` | Throws descriptive error `Tool definition must include an async 'execute' function`. |
| `TR-04` | Rejects invalid tool names | `registerTool` | Names with spaces or special characters (`my tool`, `tool$`) are rejected; only `[a-z0-9_]` allowed. |
| `TR-05` | Dynamic tool unregistration | `unregisterTool` | Unregistering an existing tool removes it from `listTools()`. Calling it returns `Tool not found`. |
| `TR-06` | Idempotent unregistration | `unregisterTool` | Unregistering a non-existent tool returns `false` or no-op without throwing an exception. |
| `TR-07` | Re-registration after unregistration | `registerTool` | A tool can be unregistered and re-registered with updated schema cleanly. |
| `TR-08` | Tool listing with JSON Schema metadata | `listTools` | `listTools()` returns array of tools with complete JSON schema documentation for LLM prompt generation. |
| `TR-09` | System prompt tool description generation | `generateToolsPrompt` | Formats registered tools into standard prompt documentation including XML tags `<suna_tool_call>`. |
| `TR-10` | Parameter type validation: String | `executeTool` | Validates `type: "string"` parameter; rejects numbers/objects if strict. |
| `TR-11` | Parameter type validation: Number | `executeTool` | Validates `type: "number"`; converts string digits or rejects non-numeric input. |
| `TR-12` | Parameter type validation: Required fields | `executeTool` | Throws or returns clear validation error if a required parameter is omitted. |
| `TR-13` | Parameter type validation: Enum / Whitelist | `executeTool` | Validates value against `enum` list (e.g. `format: ["csv", "json"]`). |
| `TR-14` | Execution with stringified JSON args | `executeTool` | Safely parses stringified JSON arguments (`'{"code":"2+2"}'`) into object before execution. |
| `TR-15` | Execution with object args | `executeTool` | Accepts direct JS object arguments (`{ code: '2+2' }`). |
| `TR-16` | Result string serialization | `executeTool` | Serializes objects, arrays, numbers, booleans to formatted string output. |
| `TR-17` | Result length truncation ceiling | `executeTool` | Truncates outputs exceeding `MAX_RESULT_LENGTH` (1500–4000 chars) with truncation notice `[Truncated...]`. |
| `TR-18` | Execution error containment | `executeTool` | When `execute` throws an error, returns formatted error string `Error executing tool "...": ...` without crashing app. |
| `TR-19` | Async execution support | `executeTool` | Awaits Promises properly and resolves asynchronous execution results. |
| `TR-20` | Unknown tool execution safety | `executeTool` | Returns `Error: Tool "unknown_tool" is not registered or supported.` |
| `TR-21` | Context injection | `executeTool` | Injects execution context (`{ State, abortSignal, timestamp }`) to tools that require it. |
| `TR-22` | Preservation of legacy tools | `executeTool` | Ensures legacy tools (`change_lofi_mood`, `get_system_state`, `save_note_to_firestore`) continue functioning. |

---

### 5.2 Suite 2: Core Tool Harness Suite (`test_dsh_core_tools.js`)
**Scope**: Unit and integration tests for all 11 core tools across their 5 functional domains.

#### Domain 1: Code & Math Sandbox Runner (`sandbox_exec`)
- `SB-01`: **Basic Arithmetic**: Executes `Math.sqrt(144) + 25` and returns `"37"`.
- `SB-02`: **Complex Multi-line Algorithm**: Executes array manipulation (quicksort, map/filter/reduce) and returns formatted JSON result.
- `SB-03`: **Syntax Error Catching**: Executes `function( { missing parenthesis` and catches `SyntaxError`, returning actionable line/column information for ReAct self-correction.
- `SB-04`: **Runtime Exception Catching**: Executes `null.foo()` or undefined variable access and returns `TypeError: Cannot read properties of null`.
- `SB-05`: **Security Isolation**: Asserts that `sandbox_exec` cannot access or mutate parent `window.localStorage`, `document.cookie`, or execute arbitrary outer DOM mutations.
- `SB-06`: **Infinite Loop Timeout Guard**: Executes `while(true) {}` and aborts within 1500ms with `Execution timed out (1500ms limit exceeded)`.

#### Domain 2: Web Context & Knowledge Fetcher (`web_search_context`, `fetch_page_summary`)
- `WS-01`: **`web_search_context` Input Validation**: Rejects empty query string; trims excessive whitespace.
- `WS-02`: **`web_search_context` Mock Search Execution**: Dispatches search query to proxy, returns top 3–5 snippets `{ title, snippet, url }`.
- `WS-03`: **`web_search_context` Network Error Resilience**: Returns friendly fallback message on network failure instead of unhandled rejection.
- `FP-01`: **`fetch_page_summary` URL Sanitization**: Validates HTTP/HTTPS protocol; rejects `javascript:`, `file:`, `data:` URLs.
- `FP-02`: **`fetch_page_summary` HTML Content Extraction**: Uses DOMParser, strips `<script>`, `<style>`, `<nav>`, `<footer>`, `<iframe>`, and returns clean text content.
- `FP-03`: **`fetch_page_summary` Content Budget Limiting**: Clamps extracted text to 4,000 characters to protect context window.
- `FP-04`: **`fetch_page_summary` HTTP Error Handling**: Returns status code error message on HTTP 404/500/CORS failure.

#### Domain 3: Virtual Workspace File System (`fs_read`, `fs_write`, `fs_list`, `fs_patch`)
- `FS-01`: **`fs_write` File Creation**: Creates a virtual file `index.html` with HTML content in `State.virtualFS`.
- `FS-02`: **`fs_read` Existing File**: Reads `index.html` and returns its full content, line count, and byte size.
- `FS-03`: **`fs_read` Missing File**: Attempts to read `/nonexistent.css` and returns `Error: File "/nonexistent.css" not found in virtual workspace`.
- `FS-04`: **`fs_list` Workspace Directory Listing**: Lists all virtual files (`index.html`, `styles.css`, `app.js`) with sizes and modification timestamps.
- `FS-05`: **`fs_patch` Exact Block Search & Replace**: Replaces a 5-line block in `styles.css` with updated rules without re-writing the entire file.
- `FS-06`: **`fs_patch` Ambiguous / Not Found Search Guard**: Returns error if search block is not found or occurs multiple times in file.
- `FS-07`: **Live Workspace Auto-Sync Integration**: When `fs_write` or `fs_patch` targets the active workspace artifact (`index.html`), verifies that `#artifact-editor-textarea.value` is updated, an `input` event is dispatched, and `#artifact-iframe.srcdoc` is refreshed with toast notification.

#### Domain 4: Deep Memory & Fact Retrieval (`memory_query`, `memory_store`)
- `MM-01`: **`memory_store` Fact Addition**: Stores fact `{ fact: "Người dùng thích lập trình Rust", category: "skill" }` into `State.memory.facts`.
- `MM-02`: **`memory_store` Deduplication**: Prevents inserting duplicate facts with identical content.
- `MM-03`: **`memory_store` Persistence & Firestore Sync**: Verifies `localStorage` update and background Firestore call if user is authenticated.
- `MM-04`: **`memory_query` Keyword Retrieval**: Queries for `"Rust"` and returns the stored fact.
- `MM-05`: **`memory_query` Empty / No Match**: Queries for non-existent keyword and returns `[]` or `Không tìm thấy ký ức phù hợp`.
- `MM-06`: **`memory_query` Category Filter**: Queries facts filtered by category `"identity"`, `"work"`, or `"preference"`.

#### Domain 5: Data & Visual Analytics Tool (`visualize_diagram`, `analyze_tabular`)
- `VD-01`: **`visualize_diagram` Flowchart SVG**: Generates valid XML `<svg>` containing nodes, connections, and labels.
- `VD-02`: **`visualize_diagram` Sequence Diagram SVG**: Generates sequence diagram with actor lifelines and message arrows.
- `VD-03`: **`visualize_diagram` Mindmap JSON Format**: Generates mindmap structure compatible with `mindmap.html` (`LOAD_MINDMAP` message).
- `VD-04`: **`visualize_diagram` XSS Sanitization**: Asserts SVG string does not contain malicious `<script>` or `onload=` event handlers.
- `AT-01`: **`analyze_tabular` CSV Parsing**: Parses CSV string with commas, quotes, and newlines into structured tabular object.
- `AT-02`: **`analyze_tabular` Summary Statistics**: Computes `count`, `sum`, `mean`, `median`, `min`, `max`, `stdDev` for numeric columns.
- `AT-03`: **`analyze_tabular` Row Filtering**: Filters rows where `price > 100` or `status === 'completed'`.
- `AT-04`: **`analyze_tabular` Sorting**: Sorts dataset by specified column in ascending/descending order.
- `AT-05`: **`analyze_tabular` Markdown Table Formatting**: Formats filtered/aggregated data into clean markdown table syntax (`| Col1 | Col2 |`).

---

### 5.3 Suite 3: Autonomous ReAct Loop & Trajectory View (`test_dsh_react_loop_and_trajectory.js`)
**Scope**: Testing the complete autonomous multi-step cycle, streaming parser integration, recursion bounds, error self-correction, abort propagation, and trajectory UI trace generation.

| Test ID | Test Name | Scope & Assertion |
|---|---|---|
| `RL-01` | Full ReAct Step Cycle | Simulates `Think -> Action (<suna_tool_call>) -> Observation -> Next Think -> Final Answer`. Verifies that observation is fed back to the model context. |
| `RL-02` | StreamParser Tool Call Extraction | `StreamParser.parseChunk()` buffers `<suna_tool_call>` without leaking tool call syntax to user-facing text bubble. |
| `RL-03` | StreamParser Thinking Tag Separation | `StreamParser` properly separates `<think>` blocks into internal reasoning and extracts user-facing answer cleanly. |
| `RL-04` | Multiple Tool Calls in Single Turn | Parser handles 2+ sequential tool calls in a single response (e.g. `fs_read` followed by `analyze_tabular`). |
| `RL-05` | `MAX_RECURSION_DEPTH` Guard | When agent invokes tools recursively, recursion stops strictly at `MAX_RECURSION_DEPTH` (depth 4) and appends warning message without crashing. |
| `RL-06` | Recursion Depth Reset on New Message | Asserts `State.agentRecursionDepth` is reset to 0 when user sends a new message. |
| `RL-07` | Error Self-Correction Loop | When a tool returns an error in step 1, observation feeds error back; agent generates corrected tool call in step 2. |
| `RL-08` | Anti-Oscillation Duplicate Call Guard | Prevents repeating the exact same failed tool call with identical arguments more than 3 consecutive times. |
| `RL-09` | User Abort Mid-ReAct Execution | User clicking "Stop" triggers `AbortController.abort()`, sets `isAgentAborted = true`, halts in-flight tool, and removes typing indicator. |
| `RL-10` | Partial Content Retention on Abort | Preserves thoughts and completed tool observations in chat message when aborted. |
| `RL-11` | Trajectory Trace Data Structure | Emits trajectory log array with `{ step, thought, tool, args, observation, durationMs, timestamp }`. |
| `RL-12` | Trajectory Trace Persistence | Saves trajectory log in `activeChat.messages[i].trajectory` for history re-loading. |
| `RL-13` | Trajectory Accordion DOM Generation | Generates collapsible Zen Glassmorphic UI drawer with step chips and expand/collapse button. |
| `RL-14` | Live Execution Status Chip | Displays animated indicator during tool run (`Đang tính toán trong sandbox...`, `Đang truy vấn ký ức...`). |

---

### 5.4 Suite 4: Zero-Regression Matrix & Quality Gates (`test_dsh_zero_regression_matrix.js`)
**Scope**: Cross-subsystem compatibility and regression prevention across all legacy and enhanced capabilities.

- `ZR-01`: **Continuation Engine Preservation**: Verifies `stitchContinuationChunks`, multi-turn stream continuation, token ceiling resolvers (8192–65536), and anti-placeholder prompts remain 100% operational.
- `ZR-02`: **3-Pane Live Workspace Direct Sync Preservation**: Direct code injection into `#artifact-editor-textarea` and `#artifact-iframe.srcdoc` with synthetic `input` event and toast at `z-index: 10000` continues working.
- `ZR-03`: **Collapsible Code Blocks Preservation**: Code blocks >12 lines or >260px render collapsible buttons, line badges, and copy buttons without regressions.
- `ZR-04`: **Mindmap & Kanban Preservation**: Fullscreen mindmap bridge via `suna_active_mindmap_data` and Kanban markdown parsing remain intact.
- `ZR-05`: **Lofi Player & Audio Preservation**: Audio playback, volume slider, and mood changes (`change_lofi_mood`) continue operating.
- `ZR-06`: **Storage Quota & Isolation Preservation**: `QuotaExceededError` fallback, user-isolated storage key suffixes (`_user`, `_guest`), and pruning logic work without degradation.
- `ZR-07`: **Static Compilation Check**: `node -c app.js && node -c redesign.js` executes with 0 syntax errors.
- `ZR-08`: **CSS Hygiene Check**: Curly braces `{}` in `styles.css` remain 100% balanced, with zero corrupt selectors.
- `ZR-09`: **Complete Test Suite Pass**: All 644 legacy tests + all new DSH tests pass 100% with 0 failures under `python run_verification.py`.

---

## 6. Implementation Test Fixtures & Code Blueprint

The following high-fidelity mock DOM and sandbox environment blueprint is designed for all DSH test suites, maintaining zero external dependencies:

```javascript
/**
 * createDshTestEnvironment - High-fidelity VM DOM Sandbox for DSH Tests
 */
function createDshTestEnvironment(customState = {}, domOverrides = {}) {
  const dispatchedEvents = [];
  const toastCalls = [];
  const eventListeners = new Map();

  const mockEditor = {
    tagName: 'TEXTAREA',
    id: 'artifact-editor-textarea',
    value: '<!DOCTYPE html><html><body>Initial Workspace</body></html>',
    dispatchEvent(evt) {
      dispatchedEvents.push({ target: 'editor', type: evt.type, bubbles: evt.bubbles });
      const handlers = eventListeners.get('editor_' + evt.type) || [];
      handlers.forEach(fn => fn(evt));
      return true;
    },
    addEventListener(type, fn) {
      const key = 'editor_' + type;
      if (!eventListeners.has(key)) eventListeners.set(key, []);
      eventListeners.get(key).push(fn);
    }
  };

  const mockIframe = {
    tagName: 'IFRAME',
    id: 'artifact-iframe',
    srcdoc: '<!DOCTYPE html><html><body>Initial Workspace</body></html>',
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || null; }
  };

  const elements = {
    'artifact-editor-textarea': mockEditor,
    'artifact-iframe': mockIframe,
    'message-input': { value: '', focus: () => {} },
    ...domOverrides
  };

  const mockDoc = {
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      className: '',
      classList: {
        _classes: new Set(),
        add(...c) { c.forEach(x => this._classes.add(x)); },
        remove(...c) { c.forEach(x => this._classes.delete(x)); },
        contains(x) { return this._classes.has(x); },
        toggle(x) {
          if (this._classes.has(x)) { this._classes.delete(x); return false; }
          this._classes.add(x); return true;
        }
      },
      innerHTML: '',
      textContent: '',
      style: {},
      children: [],
      appendChild(ch) { this.children.push(ch); return ch; },
      remove() {}
    })
  };

  const mockState = {
    chats: [{ id: 'chat-test-1', title: 'Test Chat', messages: [] }],
    activeChatId: 'chat-test-1',
    mode: 'pro',
    agentRecursionDepth: 0,
    virtualFS: {
      'index.html': '<!DOCTYPE html><html><body>Hello World</body></html>',
      'styles.css': 'body { background: #121212; color: #fff; }',
      'app.js': 'console.log("Hello from virtual app.js");'
    },
    memory: { facts: [] },
    settings: { userName: 'Bạn', theme: 'aurora' },
    ...customState
  };

  const sandbox = {
    document: mockDoc,
    window: {
      document: mockDoc,
      toast: (msg, type) => toastCalls.push({ msg, type }),
      isAgentAborted: false
    },
    State: mockState,
    toast: (msg, type) => toastCalls.push({ msg, type }),
    genId: () => 'id_' + Math.random().toString(36).slice(2, 9),
    saveState: () => {},
    Event: function(type, opts) {
      this.type = type;
      this.bubbles = opts ? !!opts.bubbles : false;
    },
    AbortController: class {
      constructor() { this.signal = { aborted: false, listeners: [] }; }
      abort() {
        this.signal.aborted = true;
        this.signal.listeners.forEach(fn => fn());
      }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: (fn) => setTimeout(fn, 1),
    clearTimeout: (id) => clearTimeout(id)
  };

  vm.createContext(sandbox);
  return { sandbox, elements, toastCalls, dispatchedEvents };
}
```

---

## 7. Execution Plan & Quality Verification Protocol

### Phase 1: Pre-Implementation Verification Baseline (Confirmed)
- Run `npm run check` -> 0 syntax errors.
- Run `npm test` -> 644 tests passing.
- Run `python run_verification.py` -> 100% green.

### Phase 2: Test-First Scaffolding (Test-Driven Development)
- Create `tests/test_dsh_tool_registry.js` with all 22 registry tests.
- Create `tests/test_dsh_core_tools.js` with all 28 core tool unit tests.
- Create `tests/test_dsh_react_loop_and_trajectory.js` with all 14 ReAct & trajectory tests.
- Create `tests/test_dsh_zero_regression_matrix.js` with all 9 zero-regression integration tests.
- Verify syntax on all new test files using `node -c`.

### Phase 3: Incremental Implementation & Verification Loop
- Implement Modular Tool Registry in `app.js` -> verify `test_dsh_tool_registry.js` passes.
- Implement 11 core tools in `app.js` -> verify `test_dsh_core_tools.js` passes.
- Implement ReAct loop enhancements & Trajectory UI in `app.js` and `styles.css` -> verify `test_dsh_react_loop_and_trajectory.js` passes.
- Run `npm run check` -> ensure 0 syntax errors on `app.js` and `redesign.js`.
- Run `python run_verification.py` -> ensure all 644 legacy tests + ~73 new DSH tests pass (total ~717+ tests, 100% green).

### Phase 4: Final Acceptance Verification
- Confirm total test count >= 717 tests passing.
- Confirm `python run_verification.py` returns exit code 0.
- Confirm CSS brace balance and `.toast-container { z-index: 10000; }`.
- Verify no console errors or unhandled Promise rejections.
