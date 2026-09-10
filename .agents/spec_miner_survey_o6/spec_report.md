# SunaAgent & SunaHarness Architectural Survey & Specification Report

- **Date**: 2026-09-07T16:20:00Z
- **Author**: Specification Miner (`spec_miner_survey_o6`)
- **Authoritative Source**: `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` (§ `## 2026-09-07T16:12:49Z`), `suna_harness.js`, `app.js`, and test suites (`tests/test_suna_harness.js`, `tests/test_challenger_m1_adversarial_vfs_lifecycle.js`, `tests/test_challenger_m2_vfs_diff_adversarial.js`, `tests/test_challenger_m2_schema_adversarial.js`, `tests/test_dsh_zero_regression_matrix.js`).

---

## 1. Executive Summary & Architectural Overview

The Suna system provides an enterprise-grade autonomous AI agent ecosystem combining a high-performance in-memory harness (**SunaHarness**) and an autonomous agent cognitive core (**SunaAgent**).
SunaHarness is implemented as a Universal Module Definition (UMD) pure JavaScript library (7,942 lines) operating without third-party npm dependencies across both Browser (DOM / IndexedDB) and Node.js (headless / in-memory).

SunaAgent inherits and synthesizes the capabilities of:
1. **HermesAgent**: High-conviction function calling, structured tool execution, and deterministic reasoning.
2. **Claude Agent**: Extended Thinking, scratchpad reflection, comprehensive system prompting, and granular step deliberation.
3. **Codex Agent**: Precise character-level code surgery, unified git diff generation, and test-grounded self-correction.

The system currently runs **1,226 passing automated tests** (Mocha) with zero regressions, verified via `npm test` and `python run_verification.py`.

---

## 2. Core SunaHarness Architecture & Runtime Components

### 2.1 HarnessController
`HarnessController` governs execution budget, agent lifecycle, safety ceilings, and multi-agent coordination.
- **Constructor Options**:
  ```javascript
  new HarnessController({
    id: 'harness_root',         // Harness/Agent unique ID
    role: 'root',               // Role name: 'root', 'orchestrator', 'worker', 'reviewer', etc.
    depth: 0,                   // Recursion depth (0 for root, max 5)
    lineage: [],                // Immutable ancestor ID chain
    parentId: null,             // Direct parent ID
    parentController: null,     // Direct parent controller instance
    vfs: new VfsSandbox(),      // Associated virtual file system
    bus: new InterHarnessEventBus(), // Event bus for messaging
    trajectory: new TrajectoryEngine(), // Event stream recorder
    maxTurns: 15,               // Maximum allowable action turns
    maxTokens: 50000,           // Maximum allowable estimated tokens
    timeoutMs: 60000,           // Wall-clock timeout in milliseconds
    readOnly: false,            // If true, mutative tools are forbidden
    vfsWorkspaceMode: 'share',  // 'share', 'clone', or 'branch'
    metadata: {}
  })
  ```
- **Lifecycle States**:
  - `initialized` -> `running` -> `paused` -> `halted` / `completed`.
- **Budget Control**:
  - Token consumption estimation: `Math.ceil(text.length / 4)`.
  - Hierarchical debiting: child tokens consumed automatically debit parent tokens consumed via `parentController.consumeTokens(tokens)`.
  - Ceilings: `MAX_TURNS_EXCEEDED`, `MAX_TOKENS_EXCEEDED`, `EXECUTION_TIMEOUT`.

### 2.2 VfsSandbox (Virtual File System)
`VfsSandbox` provides an isolated in-memory RAM filesystem mimicking POSIX file operations with event emission:
- **Internal Storage**:
  - `files`: `Map<normalizedPath, VfsFileNode>` where each node is `{ name, path, content, sizeBytes, lines, createdAt, modifiedAt, version, hash, readOnly, locked }`.
  - `directories`: `Set<normalizedPath>` where root is `''`.
- **Path Normalization**:
  - Null bytes (`\0`) stripped.
  - Windows drive letters (`C:`, `/C:`) and backslashes normalized.
  - Double UNC slashes (`//`) and leading slashes stripped.
  - `.` and `..` resolved via path stack. Root is normalized to empty string `''`.
- **Key Methods**:
  - `writeFile(path, content, options)`: Creates parent directories if `autoCreateDirs: true`. Rejects empty path, locked files (`LOCKED_FILE`), read-only files (`PERMISSION_DENIED`), or files exceeding `maxFileSizeBytes` (default 10MB).
  - `readFile(path)`: Returns string content or throws `VFSNotFound`.
  - `removeFile(path)` / `deleteFile(path)`: Deletes file from Map.
  - `mkdir(dirPath, { recursive })`: Registers folder in `directories` set.
  - `listDir(dirPath, { recursive, maxDepth })`: Returns array of entries with metrics `{ name, path, isDir, sizeBytes, lines, childCount }`.
  - `findByName(pattern, { searchDirectory, type, maxDepth, extensions })`: Fast glob matching.
  - `grepSearch(query, { searchPath, isRegex, caseInsensitive, matchPerLine, includes })`: Regex/literal search with ReDoS protection.
  - `createSnapshot()` / `restoreSnapshot(snapshot)`: Full VFS state serialization/deserialization.
  - `branch()` / `getBranchChanges()`: Clones state with an immutable origin snapshot for 3-way branch reconciliation.

### 2.3 The 6 Standard ACI Tools Suite
`AciInterface` implements the 6 SWE-agent / Anthropic standard tools:

#### 1. `view_file`
- **Purpose**: Sliding window virtual file viewer.
- **Parameters**: `path` (string, required), `startLine` (int, default 1), `endLine` (int), `contentOffset` (int, default 0).
- **Behavior**:
  - 1-indexed line numbers. Formats output as `<line>: <content>`.
  - Window clamping: max 800 lines (`maxViewLines`), max 46,080 bytes (`maxViewBytes`).
  - If content exceeds byte limit, appends: `\n[Content truncated at byte limit. Use contentOffset to view remaining content]`.
  - Error conditions: file not found (`VFSNotFound`), invalid bounds `startLine > endLine` (`INVALID_BOUNDS`).

#### 2. `replace_file_content`
- **Purpose**: Surgical code chunk replacement with exact character and indentation fidelity.
- **Parameters**: `TargetFile` (string, required), `TargetContent` (string, required), `ReplacementContent` (string, required), `StartLine` (int), `EndLine` (int), `AllowMultiple` (bool, default false), `preview` (bool, default false).
- **Behavior**:
  - Searches for verbatim `TargetContent` within `[StartLine, EndLine]`.
  - Rejects ambiguous matches if `TargetContent` appears >1 time and `AllowMultiple` is false.
  - When `preview: true` is passed, calls `VfsDiffEngine.previewReplaceDiff` without mutating the file.
  - When applied, calculates unified diff and returns:
    `{ success: true, path, oldContent, newContent, diff }`.
  - Preserves exact UTF-8 Vietnamese diacritics and whitespace indentations.

#### 3. `grep_search`
- **Purpose**: Regex and literal pattern searching across files.
- **Parameters**: `Query` (string, required), `SearchPath` (string), `IsRegex` (bool), `CaseInsensitive` (bool), `MatchPerLine` (bool, default true), `Includes` (array of glob patterns).
- **Behavior**:
  - Filters matching files using `Includes` globs.
  - ReDoS check: blocks dangerous regexes before execution.
  - Returns array with `.matches` property and custom `.toString()` formatting (`file:line: content`).

#### 4. `find_by_name`
- **Purpose**: Workspace file and directory locator by glob pattern.
- **Parameters**: `Pattern` (string, required), `SearchDirectory` (string), `Type` (`'file' | 'directory' | 'any'`), `MaxDepth` (int), `Extensions` (array of string).
- **Behavior**:
  - Translates glob patterns (`*.js`, `**/*.css`) to safe regex.
  - Returns list of matched entries with `.toString()` returning newline-separated paths.

#### 5. `list_dir`
- **Purpose**: Directory structure enumeration.
- **Parameters**: `DirectoryPath` (string), `Recursive` (bool), `MaxDepth` (int).
- **Behavior**:
  - Enumerates child files and directories with size, line count, and recursive child count.

#### 6. `run_sandboxed_command`
- **Purpose**: In-memory shell command runner (zero host disk access).
- **Parameters**: `CommandLine` (string, required), `TimeoutMs` (int, default 3000, max 60000), `Cwd` (string).
- **Behavior**:
  - Supported built-in commands: `pwd`, `echo`, `cat`, `ls` (`-l`, `-R`), `head` (`-n`), `tail` (`-n`), `grep` (`-i`, `-n`, `-v`), `wc` (`-l`, `-w`, `-c`), `diff`, `touch`, `mkdir` (`-p`), `rm` (`-r`, `-f`), `node -e "<code>"`.
  - Supports UNIX pipes (`|`) transferring stdout to stdin between sequential command stages.
  - Supports output redirection (`>` write, `>>` append) into virtual files.
  - For `node -e`: evaluates in isolated Node.js `vm` sandbox with safe stdlib (`Math`, `JSON`, `Date`, etc.) and capture of `console.log/warn/error`.

---

## 3. JSON Schema Validation & Parameter Sanitization (AciSchemaValidator)

`AciSchemaValidator` provides strict Draft-07 JSON Schema validation and pre-execution hygiene before tool calls touch the VFS or Harness Controller.

### 3.1 Parameter Alias Normalization & Coercion
Different LLM models produce different casing conventions (Claude/Hermes often use `TargetFile` or `target_file`, OpenHands uses `targetFile`, Anthropic uses `path`). `AciSchemaValidator.normalizeArgs(toolName, rawArgs)` provides bidirectional alias mapping:

| Canonical Key | Recognized Aliases | Automatic Coercion |
|---|---|---|
| `view_file.path` | `AbsolutePath`, `absolutePath`, `Path`, `targetFile`, `TargetFile`, `file`, `filePath` | Strips whitespace |
| `view_file.startLine` | `StartLine`, `start_line` | String integer (`"10"`) -> `10` |
| `view_file.endLine` | `EndLine`, `end_line` | String integer (`"25"`) -> `25` |
| `view_file.contentOffset` | `ContentOffset`, `content_offset`, `offset` | String integer -> Number |
| `replace_file_content.path` | `TargetFile`, `targetFile`, `Path`, `target_file`, `file`, `filePath`, `AbsolutePath`, `absolutePath` | Synced to both `path` and `TargetFile` |
| `replace_file_content.targetContent` | `TargetContent`, `target_content`, `target`, `oldContent`, `old_content` | Verbatim string |
| `replace_file_content.replacementContent` | `ReplacementContent`, `replacement_content`, `replacement`, `newContent`, `new_content` | Verbatim string |
| `replace_file_content.startLine` | `StartLine`, `start_line` | String integer -> Number |
| `replace_file_content.endLine` | `EndLine`, `end_line` | String integer -> Number |
| `replace_file_content.allowMultiple` | `AllowMultiple`, `allow_multiple` | Truthy/string -> Boolean |
| `grep_search.query` | `Query`, `pattern`, `search_term`, `term` | String |
| `grep_search.searchPath` | `SearchPath`, `search_path`, `path`, `dir`, `directory` | String |
| `grep_search.isRegex` | `IsRegex`, `is_regex`, `regex` | Boolean |
| `grep_search.caseInsensitive` | `CaseInsensitive`, `case_insensitive`, `ignoreCase` | Boolean |
| `grep_search.matchPerLine` | `MatchPerLine`, `match_per_line` | Boolean |
| `grep_search.includes` | `Includes`, `include`, `patterns` | Array of strings |
| `find_by_name.pattern` | `Pattern`, `glob`, `name` | String |
| `find_by_name.searchDirectory` | `SearchDirectory`, `search_directory`, `directory`, `dir`, `path`, `Directory` | String |
| `find_by_name.type` | `Type`, `entryType`, `entry_type` | Enforces `'file' \| 'directory' \| 'any'` |
| `find_by_name.maxDepth` | `MaxDepth`, `max_depth`, `depth` | String integer -> Number |
| `list_dir.directoryPath` | `DirectoryPath`, `dirPath`, `DirPath`, `path`, `Path`, `dir`, `directory` | String |
| `run_sandboxed_command.commandLine` | `CommandLine`, `command`, `cmd`, `command_line` | String |
| `run_sandboxed_command.timeoutMs` | `TimeoutMs`, `timeout_ms`, `timeout` | Clamped 1 to 60000 |
| `run_sandboxed_command.cwd` | `Cwd`, `workingDirectory`, `working_dir` | String |

### 3.2 Security Hygiene & ReDoS Defense
1. **Prototype Pollution Protection (`sanitizeArgs`)**:
   Filters out `__proto__`, `constructor`, and `prototype` keys so hostile tool call JSON payloads cannot pollute global objects.
2. **ReDoS Catastrophic Backtracking Filter (`isDangerousReDosRegex`)**:
   Detects nested quantifiers (`(a+)+`, `(a*)*`, `(x{1,})+`), consecutive repeated quantifiers (`++`, `**`), and ambiguous alternations (`(a|a)+`). Rejects hostile queries before creating a `RegExp`.
3. **Structured Diagnostics Format**:
   Returns `{ valid: false, tool, normalizedArgs, errors: [...], diagnostic: string }` where `diagnostic` includes visual pointer `^` and actionable remediation hints.

---

## 4. VfsDiffEngine & Unified Git Diff Generation

`VfsDiffEngine` implements the Myers / LCS diff algorithm enhanced with common prefix and suffix pruning:
- **Git Patch Compliance**:
  Outputs standard headers:
  ```diff
  --- a/path/to/file.js
  +++ b/path/to/file.js
  @@ -oldStart,oldCount +newStart,newCount @@
   context line
  -deleted line
  +inserted line
  ```
- **Special Cases**:
  - New files: `--- /dev/null\n+++ b/path`.
  - Deleted files: `--- a/path\n+++ /dev/null`.
  - No newline at EOF: emits `\ No newline at end of file`.
  - Vietnamese Unicode: diacritics normalized with NFC (`normalizeUnicode !== false`).
  - Windows line endings: normalized `\r\n` to `\n`.
- **Context Hunk Grouping**:
  - Context lines default: 3 lines.
  - Coalesces proximate edit blocks if distance $\le 2 \times \text{contextLines}$.
- **Key Methods**:
  - `createUnifiedDiff(filePathA, filePathB, textA, textB, options)`: Returns patch string.
  - `previewReplaceDiff(vfs, targetFile, targetContent, replacementContent, options)`: Performs a non-destructive dry-run of `replace_file_content` and returns `{ wouldSucceed, reason, patch, oldContent }`.
  - `compareSnapshots(snapshotA, snapshotB, options)`: Computes full workspace diff between 2 snapshots with `{ patch, filesChanged, insertions, deletions, files: [...] }`.

---

## 5. Multi-Agent Sub-Harness, Event Bus & Checkpointing

### 5.1 InterHarnessEventBus
Bidirectional decoupled message broker for parent-child communication:
- **Envelope Format**:
  ```javascript
  {
    id: "msg_1715000000000_abc123",
    correlationId: "req_1715000000000_xyz789", // Optional for request-response
    from: "harness_root",
    to: "subharness_worker_1", // or '*' for broadcast
    type: "directive", // 'directive' | 'progress' | 'result' | 'emergency_stop' | 'pause' | 'resume' | 'status_query' | 'response'
    timestamp: "2026-09-07T16:00:00.000Z",
    epoch_ms: 1715000000000,
    payload: { ... },
    metadata: { ... }
  }
  ```
- **Patterns Supported**:
  - Point-to-Point direct messaging.
  - Broadcast (`to: '*'`).
  - Request-Response via `bus.request(from, to, type, payload, { timeoutMs, correlationId })` returning a Promise.
  - Middleware interceptors (`bus.interceptors.push(fn)`).
  - Ring buffer message history (1,000 messages).

### 5.2 Sub-Harness Delegation Lifecycle
Parent harness delegates work via `parent.spawnSubHarness(options)`:
- **VFS Workspace Modes**:
  1. `share`: Child shares parent's `VfsSandbox` instance directly; live changes reflect immediately. Cannot be merged via `mergeSubHarness`.
  2. `clone`: Child receives an independent cloned snapshot. Isolated scratchpad; mutations cannot be merged back to parent.
  3. `branch`: Child receives a branch VFS with recorded `_branchOriginSnapshot`. Mutations are isolated until reconciled back via `parent.mergeSubHarness(childId)`.
- **Safety Guards**:
  - **Recursion Guard**: Max recursion depth $\le 5$. Throws `MAX_RECURSION_DEPTH_EXCEEDED`.
  - **Cycle Guard**: Detects self-delegation or delegation to any ancestor in `lineage`. Throws `DELEGATION_CYCLE_DETECTED`.
  - **Budget Clamping**: Child budget is clamped to parent's remaining turns and tokens. Throws `BUDGET_EXHAUSTED` if parent is already depleted.
  - **Halt Guard**: Cannot spawn from a halted parent (`PARENT_HALTED`).
- **3-Way Merge Reconciliation (`mergeSubHarness`)**:
  - Evaluates differences between `originSnapshot`, `parentSnapshot`, and `childSnapshot`.
  - Classifies 4 conflict categories: `modify_modify_conflict`, `modify_delete_conflict`, `delete_modify_conflict`, `add_add_conflict`.
  - Strategies:
    - `safe` (default): Aborts without mutating parent if any conflict exists (`throwOnConflict: true` throws `BRANCH_CONFLICT`).
    - `force`: Overwrites parent with child modifications.
  - Auto-stitches child trajectory into parent trajectory upon successful merge.
- **Cascading Emergency Stop (`emergencyStopSubHarness`)**:
  - Recursively traverses and halts the entire sub-harness tree. Emits `emergency_stop` event across the bus.

### 5.3 Trajectory Hierarchical Logging
`TrajectoryEngine` maintains an immutable audit log of all steps:
- **Step Envelope**:
  ```javascript
  {
    id: "evt_step_1_1715000000000",
    step_index: 1,
    timestamp: "2026-09-07T16:00:00.000Z",
    epoch_ms: 1715000000000,
    agent_id: "harness_root",
    role: "root",
    depth: 0,
    thought: "Analyzing user goal...",
    action: { tool: "view_file", params: { path: "index.html" } },
    observation: { status: "success", result: "..." },
    metrics: { durationMs: 42, tokensConsumed: 120 },
    status: "success",
    sub_trajectory: null,
    children: []
  }
  ```
- **Trajectory Stitching**:
  `trajectory.stitchChildTrajectory(childHarnessId, childEvents, { role, anchorStepId })` attaches child event chains to the parent spawn step.
- **Hierarchical Tree**:
  `trajectory.getHierarchicalTree()` resolves the parent-child relationship into a recursive tree structure with roll-up metrics for duration and token usage.

### 5.4 CheckpointManager & Persistence
- **State Capture**:
  `saveCheckpoint(stepIndex, memoryOrMetadata)` creates a deep-frozen copy of the VFS file map and context memory facts.
- **Time-Travel**:
  - `rewind(stepIndex)`: Reverts VFS and memory state back to a past step, pruning subsequent checkpoints.
  - `replay(fromStep, toStep)`: Replays steps to restore state.
- **IndexedDB Persistence (`IndexedDbCheckpointStore`)**:
  - User-isolated databases: `suna_harness_checkpoints_<uid>`.
  - CRUD operations: `saveCheckpoint`, `loadCheckpoints`, `getCheckpoint`, `getCheckpointByStep`, `deleteCheckpoint`, `clearCheckpoints`.
  - Multi-tenant data isolation verified.
  - Full session export/import: `exportSession(uid)` and `importSession(uid, pkg, { overwrite })`.
  - Headless Node.js fallback: `InMemoryIdbFallback` ensures automated tests and SSR run without browser `window.indexedDB`.

---

## 6. Self-Correction, Chaos Testing & Guardrails

### 6.1 SelfCorrectionLoop
Analyzes tool execution and test errors to provide grounded diagnostic feedback across 10 categories:
1. `SyntaxError`: JavaScript syntax mistakes, missing tokens.
2. `RuntimeError`: Unhandled runtime exceptions.
3. `TimeoutError`: Exceeded execution timeout.
4. `TruncationDetected`: Output clipped at byte or line limits.
5. `VFSMismatch`: TargetContent mismatch during `replace_file_content`.
6. `VFSNotFound`: Target file or directory missing.
7. `PermissionError`: File locked (`EBUSY`) or read-only.
8. `RateLimitError`: HTTP 429 Too Many Requests (reads `Retry-After`).
9. `NetworkError`: Fetch / connection failure.
10. `SchemaValidationError`: Invalid tool parameters.

Output includes exact line and column numbers, code snippet, visual pointer `^`, and suggested action (e.g. call `view_file` to re-read line range).

### 6.2 RunawayGuardrails
Protects against runaway agent loops:
1. **Consecutive Failure Sentinel**: Flags when an action fails $\ge 3$ consecutive times with identical parameters.
2. **Ping-Pong Alternation Sentinel**: Detects 2-cycle oscillation ($A \rightarrow B \rightarrow A \rightarrow B$).
3. **Period-3 Cyclic Loop Sentinel**: Detects 3-cycle oscillation ($A \rightarrow B \rightarrow C \rightarrow A \rightarrow B \rightarrow C$).
4. **Zero-Progress Stagnant VFS Sentinel**: Computes hash of all file contents/versions. If VFS state remains unchanged across 3 modifying turns, triggers loop halt.

---

## 7. SunaAgent Integration Architecture Specification

To integrate with SunaHarness without regression, **SunaAgent** must adhere to the following architecture:

### 7.1 Existing Invariants & Backward Compatibility (Gate 4 Zero-Regression)
Existing tests in `tests/test_dsh_zero_regression_matrix.js` and `tests/test_dsh_tool_registry.js` enforce:
1. `MAX_RECURSION_DEPTH = 4`.
2. `StreamParser` class for parsing `<suna_tool_call>` tags from streaming LLM output.
3. `reset()` method setting `window.isAgentAborted = false`.
4. `abort()` method setting `window.isAgentAborted = true`.
5. Retention of 5 legacy tools in `SunaAgent.tools`:
   - `change_lofi_mood(args)`
   - `speak_message(args)`
   - `save_note_to_firestore(args)`
   - `get_system_state()`
   - `update_user_profile(args)`
6. Retention of `sandbox_exec(args)`.

### 7.2 SunaAgent Cognitive Cycle (OODA / ReAct++)
```
┌─────────────────────────────────────────────────────────────┐
│                       SunaAgent Brain                       │
│                                                             │
│  1. Goal Decomposition & Intent Analysis                    │
│     [User Prompt] -> analyzeIntent() -> Sub-goals           │
│                           │                                 │
│  2. Hierarchical Planning                                   │
│     plan() -> [Step 1, Step 2, ... Step N]                  │
│                           │                                 │
│  3. Extended Thinking (Scratchpad)                          │
│     think() -> Streamed Thought Block                       │
│                           │                                 │
│  4. Tool Call Parsing & Schema Validation                   │
│     parseToolCalls() -> AciSchemaValidator.normalizeArgs()  │
│                           │                                 │
│  5. Pre-Flight Preview & Execution                          │
│     (If code surgery: VfsDiffEngine.previewReplaceDiff)     │
│     HarnessController.executeAction()                       │
│                           │                                 │
│  6. Observation Reflection & Grounded Self-Correction       │
│     reflect() -> Check SelfCorrectionLoop & Guardrails      │
│     (If stuck >= 3: backoff / alternate strategy)           │
│                           │                                 │
│  7. State Checkpointing & Trajectory Sync                   │
│     CheckpointManager.saveCheckpoint()                      │
│     TrajectoryEngine.recordStep()                           │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Multi-Syntax Tool Call Parser & Malformed JSON Auto-Repair
SunaAgent must support multiple prompt-output conventions:
1. **XML Tags**: `<suna_tool_call>{"tool": "view_file", "args": {...}}</suna_tool_call>` or `<tool_call>...</tool_call>`.
2. **Markdown Code Blocks**: ````json\n{"tool": "view_file", "args": {...}}\n````.
3. **Native Function Calling Objects**: `{ function: { name: "...", arguments: "..." } }`.
4. **Auto-Repair Engine**:
   - Strips trailing commas: `{"a": 1,}` -> `{"a": 1}`.
   - Fixes unquoted keys: `{path: "foo"}` -> `{"path": "foo"}`.
   - Balances unclosed brackets/braces from token truncation.

### 7.4 Dual Memory Architecture
- **Working Memory**: Current task, active plan, scratchpad, in-flight tool call arguments.
- **Episodic Memory**: History of previous turns, tool outputs, user interventions.
- **Token Compaction Engine**:
  When total context approaches window budget (e.g. > 16,000 tokens), compacts early episodic turns into a dense executive summary while preserving all file paths, function signatures, and key architectural decisions verbatim.

### 7.5 Human-in-the-Loop Hooks
SunaAgent must expose hooks for the SunaChat UI:
- `onThought(callback)`: Real-time streaming callback for thoughts.
- `onAction(callback)`: Notifies when a tool is about to be executed.
- `pause()`: Pauses execution before the next step.
- `resume()`: Resumes execution.
- `steer(guidance)`: Injects user guidance into the next thought cycle.
- `rewind(stepIndex)`: Calls `checkpointManager.rewind(stepIndex)` to roll back state.

---

## 8. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | VfsSandbox | `writeFile` | Writes virtual file in memory, auto-creates parent folders | `path` (str), `content` (str), `options` | Inode node object | Throws `FILE_EXISTS`, `IS_A_DIRECTORY`, `LOCKED_FILE`, `PERMISSION_DENIED`, `FILE_TOO_LARGE` | `suna_harness.js:261` |
| 2 | VfsSandbox | `readFile` | Reads virtual file content | `path` (str) | File text content (str) | Throws `VFSNotFound` (code: `VFSNotFound`) | `suna_harness.js:327` |
| 3 | VfsSandbox | `normalizePath` | Strips drive letters, UNC slashes, leading slashes, null bytes, resolves `.`/`..` | `rawPath` (str) | Clean normalized path (str) | Returns `''` on empty/null input | `suna_harness.js:182` |
| 4 | VfsSandbox | `mkdir` | Creates folder and recursive parents in directories Set | `dirPath` (str), `options` | `true` | Throws `FILE_EXISTS`, `NO_SUCH_DIRECTORY` | `suna_harness.js:236` |
| 5 | VfsSandbox | `removeFile` | Removes file from virtual memory map | `path` (str) | `true` | Throws `VFSNotFound` if missing | `suna_harness.js:348` |
| 6 | VfsSandbox | `removeDir` | Removes directory with optional recursive flag | `dirPath` (str), `options` | `true` | Throws `DIRECTORY_NOT_EMPTY`, `NO_SUCH_DIRECTORY` | `suna_harness.js:373` |
| 7 | VfsSandbox | `listDir` | Lists directory contents with size, line metrics, child count | `dirPath` (str), `options` | Array of entry objects | Throws `NO_SUCH_DIRECTORY`, `NOT_A_DIRECTORY` | `suna_harness.js:448` |
| 8 | VfsSandbox | `findByName` | Glob pattern file/dir finder | `pattern` (str), `options` | Array of matching entries | Returns empty array if none match | `suna_harness.js:555` |
| 9 | VfsSandbox | `grepSearch` | Regex and literal file search with ReDoS filter | `query` (str), `options` | Array of matches with `.toString()` | Throws `VFSNotFound`, `INVALID_REGEX` | `suna_harness.js:619` |
| 10 | VfsSandbox | `replaceContent` | Surgical string replacement with bounds checking | `path`, `target`, `rep`, `options` | `{ path, oldContent, newContent }` | Throws `VFSNotFound`, `INVALID_BOUNDS`, `TARGET_NOT_FOUND`, `AMBIGUOUS_MATCH` | `suna_harness.js:696` |
| 11 | VfsSandbox | `createSnapshot` | Full snapshot export of all files and directories | none | Snapshot object with files Map & Set | Returns clean deep-cloned snapshot | `suna_harness.js:808` |
| 12 | VfsSandbox | `restoreSnapshot` | Replaces VFS state with snapshot | `snapshot` | `true` | Restores files and directories cleanly | `suna_harness.js:831` |
| 13 | VfsSandbox | `branch` | Creates isolated branch VFS with origin snapshot | `options` | New `VfsSandbox` instance | Clones existing files, records origin | `suna_harness.js:935` |
| 14 | VfsSandbox | `getBranchChanges` | Computes diff between branch and origin snapshot | none | `{ added, modified, deleted }` | Empty arrays if no changes | `suna_harness.js:974` |
| 15 | AciInterface | `view_file` | Sliding window file viewer with line numbering & byte ceiling | `args` (`path`, `startLine`, `endLine`, `contentOffset`) | Formatted line string `<n>: <text>` | Throws `INVALID_ARGS`, `INVALID_BOUNDS`, `VFSNotFound` | `suna_harness.js:2495` |
| 16 | AciInterface | `replace_file_content` | Surgical chunk replacement with diff generation & preview | `args` (`TargetFile`, `TargetContent`, `ReplacementContent`, `StartLine`, `EndLine`, `AllowMultiple`, `preview`) | `{ success, path, oldContent, newContent, diff }` | Throws `INVALID_ARGS`, `INVALID_TARGET`, `INVALID_BOUNDS` | `suna_harness.js:2569` |
| 17 | AciInterface | `grep_search` | SWE-agent pattern search wrapper | `args` (`Query`, `SearchPath`, `IsRegex`, `CaseInsensitive`, `MatchPerLine`, `Includes`) | Array with `.matches` and `.toString()` | Throws `INVALID_ARGS` | `suna_harness.js:2614` |
| 18 | AciInterface | `find_by_name` | SWE-agent glob search wrapper | `args` (`Pattern`, `SearchDirectory`, `Type`, `MaxDepth`, `Extensions`) | Array with `.matches` and `.toString()` | Returns empty array if none match | `suna_harness.js:2643` |
| 19 | AciInterface | `list_dir` | SWE-agent directory listing wrapper | `args` (`DirectoryPath`, `Recursive`, `MaxDepth`) | Array of file/folder objects | Throws error if path is invalid | `suna_harness.js:2665` |
| 20 | AciInterface | `run_sandboxed_command` | In-memory shell emulator executing Unix utils & node -e | `args` (`CommandLine`, `TimeoutMs`, `Cwd`) | `{ stdout, stderr, exitCode }` | Returns exitCode 1/2/127 on error | `suna_harness.js:2673` |
| 21 | AciSchemaValidator | `validate` | Validates tool arguments against JSON Schema Draft-07 | `toolName` (str), `rawArgs` (obj) | `{ valid, tool, normalizedArgs, errors, diagnostic }` | Returns `valid: false` with structured errors | `suna_harness.js:2130` |
| 22 | AciSchemaValidator | `normalizeArgs` | Bidirectional alias mapping and type coercion | `toolName` (str), `rawArgs` (obj) | Sanitized normalized args object | Replaces aliases, coerces string numbers | `suna_harness.js:2042` |
| 23 | AciSchemaValidator | `sanitizeArgs` | Removes prototype pollution vectors (`__proto__`, `constructor`, `prototype`) | `rawArgs` (obj) | Clean sanitized object | Strips dangerous properties | `suna_harness.js:2032` |
| 24 | VfsDiffEngine | `createUnifiedDiff` | Myers LCS diff engine with prefix/suffix pruning | `filePathA`, `filePathB`, `textA`, `textB`, `options` | Unified Git diff string (`--- a/\n+++ b/\n@@ ... @@`) | Empty string if identical | `suna_harness.js:1059` |
| 25 | VfsDiffEngine | `previewReplaceDiff` | Non-destructive dry-run of code chunk replacement | `vfs`, `targetFile`, `targetContent`, `replacementContent`, `options` | `{ wouldSucceed, reason, patch, oldContent }` | `wouldSucceed: false` on error | `suna_harness.js:1535` |
| 26 | VfsDiffEngine | `compareSnapshots` | Computes full workspace diff between 2 VFS snapshots | `snapshotA`, `snapshotB`, `options` | `{ patch, filesChanged, insertions, deletions, files }` | Tracks added, deleted, modified, unchanged | `suna_harness.js:1419` |
| 27 | HarnessController | `executeAction` | Validates schema, tracks budget, and invokes tool | `toolName`, `args` | Tool output or error envelope | Halts if turns/tokens exceeded | `suna_harness.js:3465` |
| 28 | HarnessController | `spawnSubHarness` | Spawns child harness with isolated VFS mode | `options` (`role`, `budget`, `vfsWorkspaceMode`, `maxDepth`) | Child harness descriptor facade | Throws `MAX_RECURSION_DEPTH_EXCEEDED`, `DELEGATION_CYCLE_DETECTED`, `BUDGET_EXHAUSTED` | `suna_harness.js:3565` |
| 29 | HarnessController | `mergeSubHarness` | Reconciles branch changes back to parent via 3-way merge | `childId`, `options` (`strategy`, `throwOnConflict`, `autoCommit`) | `{ success, filesMerged, added, modified, deleted, conflicts }` | Throws `BRANCH_CONFLICT`, `ALREADY_MERGED`, `INVALID_VFS_MODE` | `suna_harness.js:3757` |
| 30 | HarnessController | `emergencyStopSubHarness`| Cascades halt through all sub-harnesses in subtree | `childIdOrNull`, `reason` | `true` | Halts all target controllers | `suna_harness.js:4044` |
| 31 | InterHarnessEventBus| `send` | Dispatches frozen structured message to target or broadcast | `messageOptions` (`from`, `to`, `type`, `payload`, `correlationId`) | Delivery envelope with delivery metadata | Throws if required fields missing | `suna_harness.js:3125` |
| 32 | InterHarnessEventBus| `request` | Request-response pattern with correlationId & timeout | `from`, `to`, `type`, `payload`, `options` | Promise resolving to response envelope | Rejects on timeout | `suna_harness.js:3222` |
| 33 | TrajectoryEngine | `recordStep` | Records immutable execution step with metrics | `stepData` (`thought`, `action`, `observation`, `metrics`, `status`) | Frozen event object | Emits to listeners | `suna_harness.js:4188` |
| 34 | TrajectoryEngine | `stitchChildTrajectory` | Attaches child sub-agent trajectory to parent spawn step | `childHarnessId`, `childEvents`, `options` | Stitched record object | Anchors to spawn step | `suna_harness.js:4242` |
| 35 | TrajectoryEngine | `getHierarchicalTree` | Reconstructs hierarchical execution tree from stitched records | `options` | Array of root nodes with nested `.children` | Aggregates tokens and duration | `suna_harness.js:4288` |
| 36 | CheckpointManager | `saveCheckpoint` | Creates immutable snapshot of VFS and memory facts | `stepIndex`, `memoryOrMetadata` | Checkpoint ID string | Deep freezes snapshot | `suna_harness.js:4543` |
| 37 | CheckpointManager | `rewind` | Reverts VFS & memory state to specified step | `stepIndex` | Restored checkpoint object | Throws `CHECKPOINT_NOT_FOUND` | `suna_harness.js:4576` |
| 38 | CheckpointManager | `replay` | Restores snapshot corresponding to target step | `fromStep`, `toStep` | `{ success, stepsReplayed }` | Restores VFS cleanly | `suna_harness.js:4616` |
| 39 | IndexedDbCheckpointStore | `saveCheckpoint` | Persists snapshot to IndexedDB with multi-tenant UID isolation | `uid`, `checkpointData` | `{ success, checkpointId, uid }` | Falls back to in-memory on Node.js | `suna_harness.js:4850` |
| 40 | IndexedDbCheckpointStore | `exportSession` / `importSession` | Exports/imports full session to serializable JSON | `uid`, `packageData`, `options` | Session package / import result | Rejects invalid package | `suna_harness.js:5030` |
| 41 | SelfCorrectionLoop | `analyzeError` | Classifies error into 10 categories with remediation pointer | `err`, `context` | Diagnostic object with location, pointer, hint | Maps to appropriate error type | `suna_harness.js:5210` |
| 42 | RunawayGuardrails | `recordFailure` | Tracks consecutive identical tool failures | `toolName`, `args` | `{ halted, triggered, reason }` | Halts when failures $\ge 3$ | `suna_harness.js:5520` |
| 43 | RunawayGuardrails | `recordAction` | Detects ping-pong (period 2) and period 3 cyclic loops | `toolName`, `args`, `vfsHash` | `{ halted, triggered, reason }` | Halts on cyclic oscillation | `suna_harness.js:5542` |
| 44 | RunawayGuardrails | `recordTurnModification` | Detects stagnant VFS hash over multiple turns | `vfs` | `{ halted, triggered, reason }` | Halts if VFS unchanged $\ge 3$ turns | `suna_harness.js:5586` |
| 45 | SunaHarnessVisualizer| `renderToString` | Headless HTML rendering of Trajectory, Scorecard & Diff | none | HTML string | Renders without browser DOM | `suna_harness.js:7630` |

---

## 9. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `VfsSandbox.normalizePath` | `C:\foo\bar\..\baz\./file.js` | Drive letter stripped, backslashes replaced, `..` and `.` resolved -> `foo/baz/file.js` |
| 2 | `VfsSandbox.normalizePath` | `///etc//passwd\0.png` | Leading and multiple UNC slashes stripped, null bytes removed -> `etc/passwd.png` |
| 3 | `VfsSandbox.writeFile` | File size exceeding 10MB | Throws `VfsError('FILE_TOO_LARGE')` with byte length details |
| 4 | `VfsSandbox.writeFile` | File marked `locked: true` | Throws `VfsError('LOCKED_FILE', 'EBUSY: resource busy or locked...')` |
| 5 | `VfsSandbox.writeFile` | Path matches an existing directory in `directories` Set | Throws `VfsError('IS_A_DIRECTORY', '...is an existing directory')` |
| 6 | `AciInterface.view_file` | Empty file (0 lines) | Returns `"File: <path> (Total lines: 0)\n"` without error |
| 7 | `AciInterface.view_file` | `startLine = 50`, `endLine = 20` (inverted bounds) | Throws `VfsError('INVALID_BOUNDS', 'startLine (50) cannot be greater than endLine (20)')` |
| 8 | `AciInterface.view_file` | File with 10,000 lines, default options | Clamped to first 800 lines (lines 1 to 800) |
| 9 | `AciInterface.view_file` | Large content where byte count exceeds 46,080 bytes | Truncates output and appends `[Content truncated at byte limit. Use contentOffset...]` |
| 10 | `AciInterface.view_file` | `contentOffset = 100` | Slices buffer from byte offset 100 before formatting line numbers |
| 11 | `AciInterface.replace_file_content` | TargetContent missing from file | Throws `VfsError('TARGET_NOT_FOUND', 'Target content not found in...')` |
| 12 | `AciInterface.replace_file_content` | TargetContent occurs 3 times in range, `AllowMultiple = false` | Throws `VfsError('AMBIGUOUS_MATCH', 'Ambiguous duplicate match: TargetContent matches 3 times...')` |
| 13 | `AciInterface.replace_file_content` | `preview = true` | Calls `previewReplaceDiff` and returns `{ wouldSucceed: true, patch: '...' }` without writing to VFS |
| 14 | `AciInterface.replace_file_content` | Content contains Vietnamese Unicode (`à, ệ, ỹ, ợ...`) | Preserves diacritics and NFC normalization identically in newContent and patch |
| 15 | `AciSchemaValidator.validate` | `args = {"__proto__": {"polluted": "yes"}, "path": "test.js"}` | Sanitizer drops `__proto__`; `Object.prototype.polluted` remains `undefined` |
| 16 | `AciSchemaValidator.validate` | `grep_search` with query `(a+)+$` (ReDoS pattern) | Fails with `SCHEMA_VALIDATION_ERROR: ReDoS vulnerability detected in regex query` |
| 17 | `AciSchemaValidator.validate` | Numeric strings for integer fields (`startLine: "42"`) | Coerces string `"42"` to number `42` cleanly |
| 18 | `AciSchemaValidator.validate` | `startLine = 10`, `endLine = 5` for `replace_file_content` | Fails crossFieldRule `valid_line_range` with `Invalid line range [10, 5]` |
| 19 | `VfsDiffEngine.createUnifiedDiff`| Identical texts `textA === textB` | Returns empty string `""` |
| 20 | `VfsDiffEngine.createUnifiedDiff`| File text lacks trailing newline | Emits `\ No newline at end of file` in diff output |
| 21 | `VfsDiffEngine.createUnifiedDiff`| File additions (`isAdded: true`) | Sets old header to `/dev/null`, hunk header to `@@ -0,0 +1,N @@` |
| 22 | `VfsDiffEngine.createUnifiedDiff`| File deletions (`isDeleted: true`) | Sets new header to `/dev/null`, hunk header to `@@ -1,N +0,0 @@` |
| 23 | `VfsDiffEngine.createUnifiedDiff`| Huge file diff (>25,000 line edits) | Myers LCS falls back to chunked delete-then-insert without exhausting memory |
| 24 | `HarnessController.spawnSubHarness`| `childId === this.id` (self-delegation) | Throws `HarnessError('DELEGATION_CYCLE_DETECTED')` |
| 25 | `HarnessController.spawnSubHarness`| Target child is an ancestor in `lineage` | Throws `HarnessError('DELEGATION_CYCLE_DETECTED')` |
| 26 | `HarnessController.spawnSubHarness`| Current recursion depth $\ge 5$ | Throws `HarnessError('MAX_RECURSION_DEPTH_EXCEEDED')` |
| 27 | `HarnessController.spawnSubHarness`| Parent remaining turn budget $\le 0$ | Throws `HarnessError('BUDGET_EXHAUSTED')` |
| 28 | `HarnessController.mergeSubHarness`| Sub-harness created with `vfsWorkspaceMode = 'share'` | Throws `HarnessError('INVALID_VFS_MODE')` (already active in shared VFS) |
| 29 | `HarnessController.mergeSubHarness`| Sub-harness created with `vfsWorkspaceMode = 'clone'` | Throws `HarnessError('INVALID_VFS_MODE')` (clone is isolated scratchpad) |
| 30 | `HarnessController.mergeSubHarness`| File modified in parent and modified differently in branch | Detects `modify_modify_conflict`. In `safe` mode, throws `BRANCH_CONFLICT` |
| 31 | `HarnessController.mergeSubHarness`| File modified in branch but deleted in parent | Detects `modify_delete_conflict` |
| 32 | `HarnessController.mergeSubHarness`| File deleted in branch but modified in parent | Detects `delete_modify_conflict` |
| 33 | `HarnessController.mergeSubHarness`| File added in branch and added with different content in parent | Detects `add_add_conflict` |
| 34 | `HarnessController.mergeSubHarness`| `strategy = 'force'` | Overwrites conflicting parent files with branch versions |
| 35 | `HarnessController.emergencyStopSubHarness` | Nested sub-harness tree (Depth 0 -> 1 -> 2) | Recursively halts all descendants and marks status `'halted'` |
| 36 | `InterHarnessEventBus.send` | Target subscriber throws an exception in listener | Logs error and continues delivering to remaining subscribers |
| 37 | `InterHarnessEventBus.request` | Target fails to respond within `timeoutMs` | Rejects Promise with timeout error, cleans up pending Map entry |
| 38 | `CheckpointManager.rewind` | Step index not found in checkpoints Map | Throws `HarnessError('CHECKPOINT_NOT_FOUND')` |
| 39 | `CheckpointManager.rewind` | Rewinding from Step 5 to Step 2 | Restores Step 2 VFS snapshot, deletes Step 3, 4, 5 from checkpoints Map |
| 40 | `IndexedDbCheckpointStore` | Running in headless Node.js without `window.indexedDB` | Seamlessly uses `InMemoryIdbFallback` with zero unhandled rejections |
| 41 | `IndexedDbCheckpointStore` | Querying checkpoints for User A when User B data exists | Returns only User A data (strict multi-tenant database name isolation) |
| 42 | `RunawayGuardrails.recordAction`| Actions alternate $A \rightarrow B \rightarrow A \rightarrow B$ | Triggers loop sentinel with `'Ping-pong cycle detected between alternating actions'` |
| 43 | `RunawayGuardrails.recordAction`| Actions cycle $A \rightarrow B \rightarrow C \rightarrow A \rightarrow B \rightarrow C$ | Triggers loop sentinel with `'Period-3 cyclic loop detected without forward progress'` |
| 44 | `RunawayGuardrails.recordTurnModification` | VFS hash remains identical across 3 turns with modification attempts | Triggers loop sentinel with `'Zero progress: VFS state is stagnant across 3 turns'` |
| 45 | `run_sandboxed_command` | Command includes pipe `cat file.txt \| grep -n hello` | Piped output transfers from `cat` stdout to `grep` stdin |
| 46 | `run_sandboxed_command` | Command includes output redirection `echo hi > out.txt` | Writes `'hi\n'` into virtual file `out.txt` in VFS |
| 47 | `run_sandboxed_command` | Command includes append redirection `echo more >> out.txt` | Appends `'more\n'` to virtual file `out.txt` in VFS |
| 48 | `run_sandboxed_command` | `node -e "1 / 0"` | Executes in isolated VM context, returns stdout `'Infinity'` with exitCode 0 |
| 49 | `run_sandboxed_command` | `node -e "while(true){}"` with `TimeoutMs = 500` | Exceeds VM script timeout, returns stderr with timeout error, exitCode 1 |
| 50 | `SunaHarnessVisualizer` | Non-diff string passed to `setDiff` | Safely ignores invalid input and displays `'No diff loaded'` |
