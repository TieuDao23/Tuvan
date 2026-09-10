# Suna Agent Harness (SunaHarness) — Codebase & Test Infrastructure Investigation

**Document Path**: `d:\Suna Chat\.agents\explorer_survey_1\survey_codebase.md`  
**Date**: 2026-09-07T12:28:17Z  
**Author**: Explorer 1 (Codebase & Test Infrastructure Investigator)  
**Assigned Directory**: `d:\Suna Chat\.agents\explorer_survey_1`  
**Task Spec**: `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` (lines 149–202)  

---

## 1. Executive Summary

This report delivers a comprehensive architectural survey of the **Suna Chat** codebase and test infrastructure to establish the foundational blueprint for designing and implementing the **Suna Agent Harness (SunaHarness)**.

SunaHarness is specified as an open-source inspired autonomous execution engine and benchmark harness combining best-of-breed patterns from **SWE-agent** (ACI & file tools), **OpenHands/OpenDevin** (event stream & trajectory), **LangGraph** (state checkpointing & time-travel replay), **AgentBench/SWE-bench** (benchmark evaluation suite), and **Chaos Engineering** (fault injection & grounded self-correction).

### Key Baseline Metrics
- **Current Test Count**: **828 Mocha tests passing (100% green, 0 failures, 0 pending, ~8.0s execution time)** across **37 test files**.
- **Static Compilation Integrity**: `node -c app.js && node -c redesign.js` passes with **0 syntax errors**.
- **Automated Verification Harness**: `python run_verification.py` enforces 4 sequential gates (JS syntax, CSS brace balance/hygiene & z-index: 10000, 828 Mocha tests, test architecture distribution) and passes 100% green.
- **Agent Architecture**: `SunaAgent` is currently implemented inside `app.js` between lines 3014 and 4282 (`// === START OF agent.js ===` to `// === END OF agent.js ===`), using an internal `Map`-based tool registry, 16 registered tools (11 core tools + 5 legacy tools), a streaming chunk parser (`StreamParser`), an autonomous ReAct execution loop bounded by `MAX_RECURSION_DEPTH: 4`, and a glassmorphic trajectory drawer (`renderTrajectoryView`).

---

## 2. Codebase Architecture & Existing Agent Survey

### 2.1 Monolithic Modular Bundle Pattern in `app.js`

`d:\Suna Chat\app.js` (421 KB, 10,434 lines) is constructed using section-delimiters that delineate modular sub-components:

| Section Delimiter | Line Range | Module Name & Responsibilities |
|---|---|---|
| `// === START OF auth.js ===` ... `// === END OF auth.js ===` | Lines 1 – 1,042 | Firebase Auth & Firestore Sync, multi-account storage partitioning, guest UID persistence (`getOrCreateGuestUid`), 3-way merge with clock-drift immunity (`mergeChats`), sync indicator (`#sync-indicator`). |
| `// === START OF features.js ===` ... `// === END OF features.js ===` | Lines 1,044 – 3,012 | Lofi player, TTS, document analysis, voice input, export chat, mindmap iframe bridge. |
| `// === START OF agent.js ===` ... `// === END OF agent.js ===` | Lines 3,014 – 4,282 | **SunaAgent**: `StreamParser`, tool registry (`_registry`), parameter validation (`validateParameters`), prompt documentation (`generatePromptDocs`), 16 tool implementations (`tools`), tool execution (`executeTool`, `handleToolCalls`), and core initialization (`initCoreTools`). |
| `// === START OF app.js ===` ... `// === END OF app.js ===` | Lines 4,284 – 10,432 | Global `State` definition, IndexedDB & localStorage handlers, chat management, UI event binding, streaming completions (`generateAIResponse`), ReAct multi-step turn looping (lines 8269–8341), trajectory drawer UI (`renderTrajectoryView`), and VFS compiler (`compileVfsToSrcDoc`). |

> **CRITICAL ARCHITECTURAL INVARIANT**: Multiple existing test suites (e.g., `test_dsh_react_loop_and_trajectory.js` line 204 and `test_dsh_zero_regression_matrix.js` line 93) slice `app.js` directly using `appJs.indexOf('// === START OF agent.js ===')` and `appJs.indexOf('// === END OF agent.js ===')`. These exact comment markers MUST be preserved and remain intact!

### 2.2 `SunaAgent` Anatomy & Life Cycle

The current `SunaAgent` object is defined at `app.js:3100`:

```javascript
const SunaAgent = {
  StreamParser,
  MAX_RECURSION_DEPTH: 4,
  MAX_RESULT_LENGTH: 1500,
  reset() { window.isAgentAborted = false; },
  abort() { window.isAgentAborted = true; },
  MOODS_WHITELIST: ['calm', 'excited', 'sad', 'stressed', 'creative'],
  THEMES_WHITELIST: ['aurora', 'sunset', 'ocean', 'forest', 'midnight'],
  _registry: new Map(),
  ...
};
```

#### Key Methods in `SunaAgent`:
1. **`registerTool(definition)` (lines 3122–3147)**:
   - Validates that `definition` is an object, `name` is a valid string matching `/^[a-zA-Z0-9_-]+$/`, and `execute` is an async function.
   - Stores entry into `this._registry.set(trimmedName, toolEntry)` and binds `this.tools[trimmedName] = toolEntry.execute`.
2. **`unregisterTool(name)` (lines 3149–3158)**:
   - Removes tool from `_registry` and `this.tools`.
3. **`getTool(name)` & `listTools()` (lines 3160–3171)**:
   - Queries registered tools and metadata (name, description, parameters schema).
4. **`validateParameters(schema, args)` (lines 3173–3244)**:
   - Checks required parameters against `schema.required`.
   - Checks allowed values against `schema.properties[key].enum`.
   - Enforces and coerces types: `'string'`, `'number'` (coerces valid numeric strings), `'boolean'` (coerces `'true'`/`'false'`), `'object'`, `'array'`.
5. **`generatePromptDocs()` (lines 3246–3258)**:
   - Dynamically formats all registered tools into markdown with XML call instructions:
     `<suna_tool_call>\n{\n  "tool": "tool_name",\n  "args": { ... }\n}\n</suna_tool_call>`
   - Injected into system prompt inside `app.js:7624-7629`.
6. **`executeTool(name, args, context)` (lines 3900–3951)**:
   - Parses arguments if stringified JSON.
   - Runs `validateParameters(tool.parameters, parsedArgs)`.
   - Executes `tool.execute(sanitized, context)` with try/catch exception containment.
   - Serializes output to string/JSON.
   - Enforces `MAX_RESULT_LENGTH = 1500` characters, appending `\n[Truncated: output exceeded max result limit]` if exceeded.
7. **`handleToolCalls(rawCallsArray, context)` (lines 3954–4064)**:
   - Iterates through extracted `<suna_tool_call>` JSON payloads.
   - Anti-oscillation guard: checks `State.toolFailures.get(`${toolName}:${JSON.stringify(toolArgs)}`)`. If >= 3 consecutive failures, halts immediately with a warning.
   - Executes tool, records metrics (`durationMs`, `timestamp`), appends step to `trajectory`.
   - Formats final observation string:
     `\n\n[SUNA TOOL EXECUTION OBSERVATIONS]:\n- Tool [toolName]:\n  Result: ...`
8. **`StreamParser` (lines 3020–3098)**:
   - Character-by-character streaming state machine: `TEXT` -> `IN_TAG` -> `IN_CONTENT` -> `IN_END_TAG`.
   - Isolates `<suna_tool_call>` tags from the user-facing chat bubble without flickering.
   - Supports `flush()` for trailing fragments.

### 2.3 Inventory of Existing Registered Tools (16 Tools)

The existing tools cover 6 domains:

| # | Tool Name | Domain | Description & Capabilities | Parameters |
|---|---|---|---|---|
| 1 | `sandbox_exec` | Code & Math | Safe client-side JS / Math evaluator in Node `vm` or `new Function` with timeout (default 1500ms) and exception capture. | `code` (string, required), `timeoutMs` (number) |
| 2 | `web_search_context` | Web Knowledge | Live or mocked web search returning titles, URLs, and snippets. | `query` (string, required), `maxResults` (number) |
| 3 | `fetch_page_summary` | Web Fetch | Fetches and cleans web pages, sanitizes protocol (`http:`, `https:` only), strips scripts/styles/nav/footer, caps at 4000 chars. | `url` (string, required), `maxLength` (number) |
| 4 | `fs_write` | Virtual FS | Writes file to `State.vfs`. If `index.html`, automatically syncs with `#artifact-editor-textarea` and `#artifact-iframe.srcdoc`, and dispatches synthetic `'input'` event. | `path` (string, required), `content` (string, required) |
| 5 | `fs_read` | Virtual FS | Reads virtual file from `State.vfs`, returns content, size, and line count. | `path` (string, required) |
| 6 | `fs_list` | Virtual FS | Lists all files in `State.vfs` with metadata (path, size, lines, updatedAt). | None |
| 7 | `fs_patch` | Virtual FS | Surgical search-and-replace on a virtual file. Requires search block to match exactly 1 occurrence (rejects 0 or >1 matches). Auto-syncs `index.html`. | `path` (string, required), `search` (string, required), `replace` (string, required) |
| 8 | `memory_store` | Semantic Memory | Stores facts in `State.memory.facts` with case-insensitive deduplication and category tagging. | `fact` (string, required), `category` (string) |
| 9 | `memory_query` | Semantic Memory | Queries facts in `State.memory.facts` using keyword tokens and category filters. | `query` (string), `category` (string) |
| 10 | `visualize_diagram` | Visual Analytics | Generates clean SVG diagrams (flowcharts, sequences) stripped of XSS scripts, or produces `json:mindmap` blocks for `mindmap.html`. | `type` (enum), `title` (string), `data` (object) |
| 11 | `analyze_tabular` | Tabular Analytics | Parses CSV or JSON tabular data, calculates statistics (count, sum, mean, median, min, max, stdDev), and formats markdown tables inside `.table-responsive-wrapper`. | `data` (string, required), `format` (enum), `operation` (string) |
| 12 | `change_lofi_mood` | Legacy Media | Whitelisted mood change (`calm`, `excited`, `sad`, `stressed`, `creative`) and particle sync. | `mood` (enum, required) |
| 13 | `speak_message` | Legacy TTS | Text-to-speech synthesis via `window.speakText` or `window.readAloud`. | `message` (string, required), `lang` (string) |
| 14 | `save_note_to_firestore`| Legacy Storage | Optimistic async write to Firestore or localStorage guest notes. | `title` (string), `content` (string, required) |
| 15 | `get_system_state` | Legacy Context | Serializes active chat, theme, sentiment, lofi mood, and memory count into JSON. | None |
| 16 | `update_user_profile` | Legacy Settings | Modifies `userName`, `theme`, `fontSize` with whitelist and boundary validation. | `userName` (string), `theme` (enum), `fontSize` (number) |

### 2.4 Autonomous ReAct Cycle & State Machine

In `app.js:8269-8341`, the ReAct cycle operates as follows:
1. **Streaming & Tag Parsing**: As tokens arrive from the LLM provider, `StreamParser` intercepts `<suna_tool_call>` chunks and extracts them.
2. **Recursion Ceiling Guard**: Checks if `(State.agentRecursionDepth || 0) >= window.SunaAgent.MAX_RECURSION_DEPTH` (default: 4).
   - If reached, halts recursion, appends a warning system message to the chat, and persists state.
3. **Execution & UI Status**:
   - Increments `State.agentRecursionDepth`.
   - Appends `.agent-active-tool-indicator` to the DOM showing spinner and step index: `Suna đang gọi công cụ: <code>...</code> (bước X/4)...`.
   - Injects execution context `{ depth, message, State, document, toast }` into `handleToolCalls()`.
4. **Observation Feedback & Recursion**:
   - Receives observation block: `[SUNA TOOL EXECUTION OBSERVATIONS]: ...`.
   - Appends a new message with `role: 'user'` containing the observation block to `activeChat.messages`.
   - Invokes `generateAIResponse()` recursively.
   - The LLM reasons over the observation and either invokes another tool or provides the final response.
5. **Observability & Trajectory UI**:
   - Steps are stored in `message.trajectory = [{ step, tool, thought, params, result, error, durationMs, timestamp }]`.
   - `renderTrajectoryView(trajectory)` generates a Zen Glassmorphic UI element:
     - `.trajectory-chip`: pill badge showing `⚡ X bước suy luận` and `Yms duration`.
     - Collapsible `.trajectory-drawer`: timeline node list with `.trajectory-step-node`, `.step-thought`, `.step-params`, and `.step-result`/`.step-error-msg`.

---

## 3. Test Infrastructure Survey

### 3.1 Test Verification Matrix & Execution Runners

The project employs a 3-tier verification architecture:

```
+-----------------------------------------------------------------------------------------+
|                                Authoritative Test Matrix                                |
+-----------------------------------------------------------------------------------------+
                                             │
                   +-------------------------+-------------------------+
                   │                                                   │
                   ▼                                                   ▼
+------------------------------------+               +------------------------------------+
|          Fast Local Gates          |               |     Authoritative Python Runner    |
| - npm test: npx mocha "tests/**/*.js"|             | - python run_verification.py       |
| - npm run check: node -c app.js     |              |   1. verify_syntax()                |
|                  node -c redesign.js|              |   2. verify_css_hygiene()          |
+------------------------------------+               |   3. verify_mocha_tests()          |
                                                     |   4. verify_test_distribution()    |
                                                     +------------------------------------+
```

### 3.2 Inventory of All 37 Test Files

| # | Test File Path | Focus Area / Domain | Key Verification Focus |
|---|---|---|---|
| 1 | `tests/test_auth_and_account_sync.js` | Auth & Isolation | 64 tests across 4 tiers: storage partitioning, guest UID, 3-way merge, quota safety, large image preservation. |
| 2 | `tests/test_dsh_tool_registry.js` | DSH Suite 1 | 25 tests: tool lifecycle, JSON schema, validation, truncation, legacy retention. |
| 3 | `tests/test_dsh_core_tools.js` | DSH Suite 2 | 29 tests: 11 core tools across 5 domains, VM isolation, timeouts, VFS patch. |
| 4 | `tests/test_dsh_react_loop_and_trajectory.js` | DSH Suite 3 | 15 tests: ReAct loop, anti-oscillation, recursion ceiling, trajectory model & UI. |
| 5 | `tests/test_dsh_zero_regression_matrix.js` | DSH Suite 4 | 22 tests: static syntax, CSS hygiene, StreamParser, workspace sync, continuation. |
| 6 | `tests/test_challenger_adversarial_isolation.js` | Adversarial | Cross-account pollution, dirty RAM scrub, token revocation. |
| 7 | `tests/test_challenger_adversarial_suite.js` | Adversarial | Extreme coordinates, boundary clamping, corrupted storage. |
| 8 | `tests/test_challenger_cloud_sync_adversarial.js` | Adversarial | Clock skew drift, tombstone deletion safety, network race conditions. |
| 9 | `tests/test_challenger_collapsible_adversarial.js` | Adversarial | Large code blocks, nested fences, markdown corruption. |
| 10 | `tests/test_challenger_continuation_adversarial.js` | Adversarial | Multi-turn stitching, incomplete code fences, token ceilings. |
| 11 | `tests/test_challenger_m1_token_and_prompt_adversarial.js` | Adversarial | Prompt inflation, system prompt budgets. |
| 12 | `tests/test_challenger_m1_token_maximization.js` | Adversarial | Token maximization limits, continuation triggering. |
| 13 | `tests/test_challenger_storage_security_adversarial.js` | Adversarial | LocalStorage prefix collisions, quota recovery. |
| 14 | `tests/test_challenger_workspace_live_sync_adversarial.js` | Adversarial | Rapid editor modifications, synthetic event loops. |
| 15 | `tests/test_collapsible_code_and_continuation.js` | Features | Collapsible code fences (>12 lines), copy button. |
| 16 | `tests/test_e2e_token_continuation_engine.js` | E2E | End-to-end multi-chunk continuation engine. |
| 17 | `tests/test_four_pillars_comprehensive_suite.js` | Features | Folders, search, workspace device modes, console logs. |
| 18 | `tests/test_mindmap_balanced_engine_and_features_opt.js` | Features | Mindmap layout engine, zoom/pan controls, export. |
| 19 | `tests/test_mobile_responsive_redesign.js` | UI / Mobile | Breakpoints (<=1150px, <=768px), mobile overflow menu. |
| 20 | `tests/test_multi_turn_chaining_and_truncation_detection.js` | Engine | Multi-turn conversation history, truncation detection heuristics. |
| 21 | `tests/test_per_message_diagram_and_svg_render.js` | Features | Mermaid & SVG rendering, XSS sanitization. |
| 22 | `tests/test_performance_shortcuts_storage_security.js` | UI / Shortcuts | Scroll passive/rAF, search debounce 150ms, particle visibility, global shortcuts (Escape, Ctrl+/, Ctrl+Shift+O). |
| 23 | `tests/test_session_idle_and_scroll_preservation.js` | Features | Session idle timeout, scroll restoration. |
| 24 | `tests/test_spacious_layout_redesign.js` | UI / Layout | Spacing variables, padding, container margins. |
| 25 | `tests/test_thinking_blocks_stream_parser_adversarial.js` | Engine | `<think>` tags buffering and separation. |
| 26 | `tests/test_token_maximization_and_system_prompts.js` | Engine | System prompt composition, dynamic tools docs injection. |
| 27 | `tests/test_topbar_layout_and_css_hygiene.js` | UI / CSS | Topbar flex nowrap, z-index layering, button accessibility. |
| 28 | `tests/test_workspace_direct_sync_and_continuation.js` | Workspace | Workspace direct sync, iframe live preview, toast feedback. |
| 29 | `tests/ui_redesign/visible_tests/test_color_palette.js` | Visible UI | Ink charcoal theme, glassmorphic cards, accent colors. |
| 30 | `tests/ui_redesign/visible_tests/test_layout_elements.js` | Visible UI | Transition properties, interactive hover states. |
| 31 | `tests/ui_redesign/visible_tests/test_typography.js` | Visible UI | Font family imports (Cinzel, Outfit, Inter), letter-spacing. |
| 32 | `tests/ui_redesign/visible_tests/test_workspace_layout.js` | Visible UI | 3-pane split containers, resizer handles, responsive CSS. |
| 33 | `tests/ui_redesign/hidden_tests/test_contrast_ratio.js` | Hidden UI | WCAG 4.5:1 text contrast ratios across themes. |
| 34 | `tests/ui_redesign/hidden_tests/test_css_fallbacks.js` | Hidden UI | Generic CSS font-family fallbacks. |
| 35 | `tests/ui_redesign/hidden_tests/test_transition_perf.js` | Hidden UI | Layout-shift-free transitions (transform, opacity only). |
| 36 | `tests/ui_redesign/hidden_tests/test_workspace_resizers_and_storage.js` | Hidden UI | Pointer lock during resize, localStorage synchronization. |
| 37 | `tests/ui_redesign/adversarial_tests/test_adversarial_state_and_resilience.js` | Adversarial UI | Storage exhaustion, malformed UTF-8 Unicode, network flapping. |

### 3.3 Test Sandboxing Technique

Because Suna Chat is a vanilla JavaScript client-side application, tests run under Node.js using `vm.createContext(sandbox)`:
- Mocks are provided for `window`, `document`, `localStorage`, `sessionStorage`, `IndexedDB`, `console`, and `Event`.
- Tests verify behaviors against **Authoritative Specification Oracles** (reference implementations embedded in the test files) to guarantee opaque-box validation.

---

## 4. Gap Analysis: SunaAgent vs SunaHarness Requirements

The user request (`ORIGINAL_REQUEST.md` lines 149–202) specifies **Suna Agent Harness** with 4 core pillars. Here is the gap analysis comparing current capabilities against requirements:

| Requirement Pillar | SunaHarness Specification | Current `SunaAgent` State | Architectural Gap |
|---|---|---|---|
| **R1: VFS Sandbox** | Pure in-memory RAM filesystem, completely isolated from host disk. Supports read, write, chunk replacement (`replace_file_content`), pattern search (`grep_search`/regex), directory traversal (`find_by_name`, `list_dir`). | Basic flat map `State.vfs[path] = { content, size, lines }`. Only supports `fs_write`, `fs_read`, `fs_list`, and single-occurrence `fs_patch`. | Missing true hierarchical directory traversal (`list_dir`, `find_by_name`), multi-file regex pattern search (`grep_search`), and chunk replacement with line bounds (`replace_file_content`). |
| **R1: SWE-agent ACI** | Standard Agent-Computer Interface: `view_file` (sliding window with 1-based line numbers, line clamping), `grep_search`, `find_by_name`, `replace_file_content`, and `run_sandboxed_command`. | Has `sandbox_exec`, `fs_read`, `fs_write`, `fs_patch`. Lacks line numbering, sliding window, structured line-by-line grep. | Tool interfaces do not match SWE-agent standard parameters (`StartLine`, `EndLine`, `TargetContent`, `ReplacementContent`, `Pattern`, `SearchDirectory`). |
| **R1: Controller Decoupling** | Strict separation: Controller manages lifecycle, token/step budget, access control, and safe execution; Agent manages reasoning and planning. | Controller logic is interleaved inside `handleToolCalls()` and `generateAIResponse()` in `app.js`. | Missing dedicated, exportable `SunaController` class with discrete lifecycle hooks and event emitters. |
| **R2: Trajectory & Event Stream** | Immutable event stream logging `step_index`, `timestamp`, `thought`, `action`, `observation`, `metrics` (durationMs, memory/resource delta). Standard JSONL and Markdown export. | Appends mutable objects to `message.trajectory`. No JSONL export; only renders HTML via `renderTrajectoryView`. | Missing immutable event stream data model, metric calculations (resource/tokens), and `exportToJsonl()` / `exportToMarkdown()` methods. |
| **R2: State Checkpointing** | LangGraph-inspired state snapshotting after every step (VFS, context memory, tool states). Supports rewind, pause/resume, and replay for time-travel debugging. | `State` is updated in-place without past snapshots. No rewind or replay capability. | Missing `CheckpointManager`: deep snapshots, rewind to step $N$, pause/resume, and deterministic trajectory replay. |
| **R3: Grounded Self-Correction** | Catches syntax errors, lint, execution errors, truncation; packages into structured `DiagnosticFeedback` (error classification, diagnostic message, actionable advice). | Catches exceptions and returns string `Error executing tool...`. No structured diagnostics or remedial hints. | Missing `SelfCorrectionLoop` with error taxonomy (`SYNTAX_ERROR`, `NOT_FOUND`, `AMBIGUOUS_MATCH`, `TIMEOUT`, `VALIDATION_ERROR`, `RATE_LIMIT`) and remediation hints. |
| **R3: Chaos Fault Injector** | Injects simulated dropped network, 429/ResourceExhausted rate limit, file corruption/locks, clock skew, and fragmented stream chunks to evaluate resilience. | None. Tools operate without simulated fault injection. | Missing `ChaosFaultInjector` module for adversarial resilience testing. |
| **R3: Runaway Guardrails** | Detects repeated ineffective actions (>threshold), stagnation/zero-progress (no state change), and enforces max turn ceilings. | Anti-oscillation guard halts if identical tool+params fails 3 consecutive times; recursion limit is hardcoded to 4. | Missing zero-progress detection (repeated turns with 0 VFS delta) and configurable turn/token budgets. |
| **R4: Benchmark Suite** | Multi-scenario benchmark suite (code edit, navigation, bug fix, tool chaining) with automated scorecard: Success Rate, Step Efficiency, Fault Recovery Rate. | No autonomous benchmark suite or scoring framework exists. | Missing `BenchmarkSuite` with task definitions, evaluation oracles, and automated scorecard reporting. |
| **R4: Zero Regression** | 100% preservation of all 828 existing tests, 0 syntax errors, green verification runner. | 828 tests passing. | Must be strictly preserved with zero breaks. |

---

## 5. SunaHarness Component Architecture & Integration Blueprint

### 5.1 Modular Component Design

To satisfy all requirements cleanly and adhere to the project's zero-dependency, vanilla-JS architecture, SunaHarness should be designed with 6 cohesive, decoupled modules:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SunaHarness Ecosystem                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌──────────────────────────┐  │
│  │     VfsSandbox        │   │    AciInterface       │   │     SunaController       │  │
│  │ - In-memory RAM FS    │   │ - view_file           │   │ - Lifecycle management   │  │
│  │ - CRUD & replaceChunk │   │ - grep_search         │   │ - Budget (turns/tokens)  │  │
│  │ - regex grep & find   │   │ - find_by_name        │   │ - Tool dispatch & safety │  │
│  │ - hierarchical paths  │   │ - replace_file_content│   │ - Event emission         │  │
│  │ - snapshots & restore │   │ - run_sandboxed_cmd   │   │ - Controller/Agent split │  │
│  └───────────┬───────────┘   └───────────┬───────────┘   └────────────┬─────────────┘  │
│              │                           │                            │                │
│              ▼                           ▼                            ▼                │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌──────────────────────────┐  │
│  │   TrajectoryEngine    │   │  SelfCorrectionLoop   │   │     BenchmarkSuite       │  │
│  │ - Immutable events    │   │ - DiagnosticFeedback  │   │ - Task evaluation oracles│  │
│  │ - CheckpointManager   │   │ - Error taxonomy      │   │ - Automated Scorecard    │  │
│  │ - Rewind & Replay     │   │ - Anti-oscillation    │   │   * Success Rate         │  │
│  │ - JSONL & MD export   │   │ - Zero-progress guard │   │   * Step Efficiency      │  │
│  │ - Duration & metrics  │   │ - ChaosFaultInjector  │   │   * Fault Recovery Rate  │  │
│  └───────────────────────┘   └───────────────────────┘   └──────────────────────────┘  │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Class Specifications:

1. **`VfsSandbox`**:
   - `files`: `Map<string, { content: string, size: number, lines: number, updatedAt: number, locked: boolean }>`
   - `writeFile(path, content)`: writes or overwrites virtual file.
   - `readFile(path)`: returns content or throws structured `FileNotFoundError`.
   - `deleteFile(path)`: deletes virtual file.
   - `exists(path)`: boolean check.
   - `listDir(dirPath, options)`: returns directory entries, file counts, sizes.
   - `findByName(pattern, dirPath)`: glob/wildcard search matching paths.
   - `grepSearch(query, dirPath, options)`: line-by-line regex or exact search, returning `{ file, lineNumber, lineContent }[]`.
   - `replaceFileContent(path, targetContent, replacementContent, options)`: verifies exact line range and unique match (throws if 0 or >1 matches).
   - `createSnapshot()` / `restoreSnapshot(snapshot)`: deep copy of RAM VFS.

2. **`AciInterface`** (SWE-agent Tool Adapter):
   - Maps SWE-agent tool signatures to `VfsSandbox`:
     - `view_file({ path, StartLine, EndLine })`: formats code with 1-based line numbers, sliding window clamp (e.g. max 100 lines), and truncation indicator.
     - `grep_search({ Query, SearchPath, IsRegex, CaseInsensitive })`: formatted search results with line numbers.
     - `find_by_name({ Pattern, SearchDirectory })`: list of matching relative file paths.
     - `replace_file_content({ TargetFile, TargetContent, ReplacementContent, StartLine, EndLine })`: surgical block replacement with safety validation.
     - `run_sandboxed_command({ CommandLine, TimeoutMs })`: isolated script execution with timeout and sandbox constraints.
   - Converts tool definitions into JSON Schema objects compatible with `SunaAgent.registerTool()`.

3. **`TrajectoryEngine` & `CheckpointManager`**:
   - `TrajectoryStep`: immutable record `{ step_index, timestamp, thought, action: { tool, args }, observation: { result, error, isError }, metrics: { durationMs, memoryDelta }, status }`.
   - `TrajectoryEngine`:
     - `recordStep(step)`: appends step to immutable array.
     - `getTrajectory()`: returns clone of all steps.
     - `exportToJsonl()`: serializes steps into standard newline-delimited JSON.
     - `exportToMarkdown()`: produces comprehensive markdown summary with metrics table, step nodes, and execution timeline.
   - `CheckpointManager` (LangGraph pattern):
     - `checkpoints`: `Map<number, { step_index, timestamp, vfsSnapshot, memorySnapshot, stateSnapshot }>`
     - `saveCheckpoint(stepIndex, vfs, memory, state)`: deep copies state.
     - `getCheckpoint(stepIndex)`: retrieves snapshot.
     - `rewind(stepIndex)`: restores VFS, memory, and state to step $N$.
     - `replay(steps)`: deterministically replays actions from a checkpoint.

4. **`SelfCorrectionLoop` & `ChaosFaultInjector`**:
   - `SelfCorrectionLoop`:
     - `classifyError(err)`: maps error to taxonomy (`SYNTAX_ERROR`, `NOT_FOUND`, `AMBIGUOUS_MATCH`, `TIMEOUT`, `VALIDATION_ERROR`, `RATE_LIMIT`).
     - `formatDiagnostic(errorType, message, context)`: builds actionable feedback with remediation hints.
     - `checkAntiOscillation(toolName, args, history)`: detects >= 3 repeated failures.
     - `checkZeroProgress(trajectory, vfsHistory)`: detects consecutive steps with 0 state change.
   - `ChaosFaultInjector`:
     - `enableFault(faultType, options)` / `disableFault(faultType)`
     - Supported faults:
       - `network_drop`: throws connection reset / offline error.
       - `rate_limit_429`: throws 429 ResourceExhausted with retry-after.
       - `file_locked`: simulates EACCES / locked virtual file.
       - `corrupt_data`: injects truncated or malformed content.
       - `clock_skew`: shifts timestamps forward/backward.

5. **`BenchmarkSuite` & `EvaluationRunner`**:
   - Built-in benchmark scenarios:
     - `Scenario 1: Code Bugfix`: modify a function in VFS to fix a failing condition.
     - `Scenario 2: Multi-File Navigation & Refactor`: find usages across VFS and update signatures.
     - `Scenario 3: Algorithmic Compute`: compute complex mathematical series via `run_sandboxed_command`.
     - `Scenario 4: Multi-Step ReAct Chaining`: combine search, file read, compute, and file write across multiple steps.
     - `Scenario 5: Chaos Resilience`: execute a task with injected 429 rate limit or network drop, verifying self-correction recovery.
   - `EvaluationScorecard`:
     - `successRate`: % of benchmark scenarios solved.
     - `stepEfficiency`: ratio of optimal steps to actual steps.
     - `faultRecoveryRate`: % of injected faults successfully recovered from.
     - `scorecardReport`: markdown summary of evaluation metrics.

6. **`SunaController`**:
   - Orchestrates the full lifecycle:
     - Initializes `VfsSandbox`, `TrajectoryEngine`, `CheckpointManager`, `SelfCorrectionLoop`.
     - Controls turn loop: `step()`, `run(maxTurns)`.
     - Emits lifecycle events: `onStepStart`, `onToolExecute`, `onObservation`, `onCheckpoint`, `onComplete`, `onError`.

### 5.2 Dual Client-Side & Node.js Exportability Strategy

To satisfy both browser runtime (`window.SunaHarness`) and Mocha test suites (`require`):
- Implement the core SunaHarness in a standalone file `suna_harness.js` using the **Universal Module Definition (UMD)** pattern:
  ```javascript
  (function (root, factory) {
    if (typeof module === 'object' && module.exports) {
      // Node.js CommonJS
      module.exports = factory();
    } else {
      // Browser global
      root.SunaHarness = factory();
    }
  }(typeof self !== 'undefined' ? self : this, function () {
    // SunaHarness classes: VfsSandbox, AciInterface, TrajectoryEngine,
    // CheckpointManager, SelfCorrectionLoop, ChaosFaultInjector,
    // BenchmarkSuite, SunaController
    return { ... };
  }));
  ```
- In `app.js`:
  - Hook SunaHarness into `SunaAgent`:
    ```javascript
    if (typeof SunaHarness !== 'undefined') {
      SunaAgent.harness = SunaHarness;
      // Register SWE-agent ACI tools into SunaAgent._registry
      SunaHarness.registerAciTools(SunaAgent);
    }
    ```
- In `package.json`:
  - Update `"check"` script: `"check": "node -c app.js && node -c redesign.js && node -c suna_harness.js"`
- In `index.html`:
  - Include `<script src="suna_harness.js"></script>` before `app.js` (or inline inside the `agent.js` section of `app.js` while maintaining UMD exportability).

---

## 6. Verification Plan & Invariant Checklist

### 6.1 Verification Commands
1. **Static Syntax**:
   `npm run check` (compiles all core JS files with `node -c`).
2. **Mocha Suite**:
   `npm test` (must pass 100% of existing 828 tests + all new SunaHarness tests).
3. **Dedicated Harness Tests**:
   `npx mocha tests/test_suna_harness.js` (comprehensive coverage of VFS, ACI, Trajectory, Checkpointing, Self-Correction, Chaos, Benchmarks).
4. **Full System Verification**:
   `python run_verification.py` (must output `>>> VERIFICATION PASSED: ALL CHECKS 100% GREEN <<<`).

### 6.2 Regression Invariant Checklist
- [x] Section markers `// === START OF agent.js ===` and `// === END OF agent.js ===` preserved exactly.
- [x] `SunaAgent.MAX_RECURSION_DEPTH: 4` preserved.
- [x] `SunaAgent.reset()` and `SunaAgent.abort()` preserved.
- [x] All 5 legacy tools (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`) retained in `SunaAgent.tools`.
- [x] All 11 core tools (`sandbox_exec`, `web_search_context`, etc.) retained and fully functional.
- [x] CSS brace balance and `.toast-container { z-index: 10000; }` preserved in `styles.css`.
- [x] Auth, multi-account storage partitioning, and 3-way merge preserved.
- [x] Live Workspace direct sync and event dispatching preserved.
