# Suna Agent Harness (SunaHarness) — In-Depth Architecture Survey & Interface Specification Report

**Document ID:** SUNA-HARNESS-SURVEY-01  
**Author:** Explorer Survey 1 (`explorer_survey_1`)  
**Target Environment:** `d:\Suna Chat`  
**Timestamp:** 2026-09-07T13:45:00Z  
**Verification Baseline:** 982 passing Mocha tests (38 files, 0 failures), 0 JavaScript syntax errors (`node -c`), full green `run_verification.py`.

---

## 1. Executive Summary & Objective

This report provides a comprehensive architectural survey and concrete technical blueprint for upgrading the **Suna Agent Harness (`SunaHarness`)** to match and exceed frontier autonomous agent runtimes (such as **SWE-agent**, **OpenHands / All-Hands**, and **LangGraph**). 

The upgrade introduces three core pillars:
1. **R1: Multi-Agent Sub-harness Delegation & Hierarchical Coordination**:
   - `spawnSubHarness({ role, budget, vfsWorkspaceMode })` supporting `share`, `clone`, and `branch` VFS modes.
   - Bilateral structured `InterHarnessEventBus` for directives, monitoring, and emergency halts.
   - Hierarchical `TrajectoryEngine` stitching (`getHierarchicalTree()`) representing nested multi-agent reasoning.
2. **R2: Unified Git Diff Engine & JSON Schema Validation**:
   - `VfsDiffEngine` producing standard Git patches (`--- a/path\n+++ b/path\n@@ -l,s +l,s @@`) using Myers/LCS diff algorithm with full Unicode / Vietnamese UTF-8 preservation.
   - `AciSchemaValidator` enforcing strict JSON Schema validation across all 6 ACI tools (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `list_dir`, `run_sandboxed_command`) with structured diagnostic feedback before VFS mutation.
3. **R3: Interactive UI Visualizer DOM Component & Persistent Checkpoint Storage**:
   - `SunaHarnessVisualizer` DOM component embedding an interactive Trajectory Tree (with filtering by role/level/status), Benchmark Scorecard (gauges for $\mathcal{S}$, $\eta$, $\mathcal{R}$), and Side-by-Side / Unified Diff Viewer.
   - `IndexedDbCheckpointStorage` persisting VFS snapshots and checkpoint histories into `suna_harness_checkpoints_<uid>` with transparent fallback to `localStorage` / in-memory store.

All proposed enhancements adhere strictly to the **Zero-Regression Mandate**: 100% backward compatibility with the existing 982 test cases, 0 external npm dependencies (pure standard JavaScript UMD architecture), and zero impact on SunaChat core chat and workspace operations.

---

## 2. Baseline Architecture Map of Existing `suna_harness.js`

`suna_harness.js` is implemented as a 3,259-line Universal Module Definition (UMD) package located at `d:\Suna Chat\suna_harness.js`.

### 2.1 Component Inventory & Line Mapping

| Component | Lines | Primary Purpose & Responsibilities | Key Internal Data Structures |
| :--- | :--- | :--- | :--- |
| **UMD Module Wrapper** | 12–32 | Universal compatibility: CommonJS (`module.exports`), AMD (`define`), Browser Global (`window.SunaHarness`, `root.SunaHarness`). Auto-registers ACI tools if `window.SunaAgent` exists. | N/A |
| **Core Utilities & Cryptography** | 33–132 | Cross-platform hashing (`fastHash` via Node `crypto` or FNV-1a fallback), byte length computation (`Buffer` or `TextEncoder`), deep freezing, regex escaping, and ReDoS detection (`isDangerousReDosRegex`). | Regex backtracking patterns |
| **Custom Error Classes** | 133–153 | `VfsError(code, message, details)` and `HarnessError(code, message, details)`. | `code`, `message`, `details` |
| **`VfsSandbox`** | 159–907 | In-memory Virtual File System isolated from the host OS disk. Supports POSIX-like file I/O, directory trees, surgical line replacement, snapshots, and Live Workspace sync. | `files: Map<string, VfsFileNode>`<br>`directories: Set<string>`<br>`listeners: Set<{evt, handler}>` |
| **`AciInterface`** | 912–1546 | SWE-agent Agent-Computer Interface (ACI). Exposes 6 tool methods (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `list_dir`, `run_sandboxed_command`) and in-memory shell emulator (`_executeShell`). | Max view bounds (`800` lines, `46080` bytes), command timeout (`3000ms`) |
| **`HarnessController`** | 1552–1740 | Decoupled governance runtime enforcing turn budgets (`maxTurns`), token ceilings (`maxTokens`), timeouts (`timeoutMs`), and read-only permission modes. | `turnsCompleted`, `tokensConsumed`, `isHalted`, `listeners: Map` |
| **`TrajectoryEngine`** | 1745–1873 | Immutable trajectory event stream recording step-by-step agent execution (`thought`, `action`, `observation`, `metrics`). Exports to JSONL and Markdown. | `events: Array<ImmutableEvent>` |
| **`CheckpointManager`** | 1878–1982 | LangGraph-style state checkpointing and time-travel replay. Saves VFS snapshots and context memory snapshots per step. Supports `rewind`, `pause`, `resume`, `replay`. | `checkpoints: Map<number, Checkpoint>`<br>`checkpointOrder: Array<string>` |
| **`SelfCorrectionLoop`** | 1987–2190 | Grounded self-correction analyzer. Classifies errors into 9 standardized categories (`SyntaxError`, `VFSMismatch`, etc.) and generates actionable repair suggestions with pointer hints. | Static `CATEGORIES` array |
| **`ChaosFaultInjector`** | 2195–2289 | Adversarial resilience injector simulating network drops, locked files (`EBUSY`), 429 rate limits, and latency. | `rules: Array<Rule>`, `stats: object` |
| **`RunawayGuardrails`** | 2294–2427 | Sentinel detecting repetitive failures ($\ge 3$), zero-progress mutation cycles ($\ge 3$), and ping-pong state oscillation. | `failureCounts: Map`, `actionHistory: Array` |
| **`BenchmarkSuite`** | 2432–2933 | 20 standardized multi-tier benchmark evaluation tasks across 5 distinct tiers (Basic ACI, Edge Cases, Self-Correction, Tool Composition, Chaos Resilience). | Static task catalog |
| **`EvaluationRunner`** | 2938–3086 | Evaluation orchestrator computing Success Rate ($\mathcal{S}$), Step Efficiency ($\eta$), Fault Recovery Rate ($\mathcal{R}$), and Markdown Scorecards. | `results: Array` |
| **`SunaHarness` Facade** | 3092–3258 | Public factory `createHarness()`, `registerAciTools(sunaAgent)`, and alias registry. | Public module export |

---

## 3. Gap Analysis: Current State vs. Requirements

### 3.1 Requirement R1: Multi-Agent Sub-harness Delegation
- **Current Limitation**: `HarnessController` and `createHarness()` currently operate only as a single flat, monolithic agent instance.
- **Missing Capabilities**:
  1. No `spawnSubHarness({ role, budget, vfsWorkspaceMode })` method.
  2. No concept of workspace isolation modes (`share`, `clone`, `branch`).
  3. No inter-harness messaging mechanism (no `InterHarnessEventBus`).
  4. `TrajectoryEngine` records a single flat sequence of steps without parent-child nesting or tree representation (`getHierarchicalTree()`).

### 3.2 Requirement R2: Unified Git Diff Engine & JSON Schema Validation
- **Current Limitation in Diff**: Line 1449 of `suna_harness.js` has a naive line-by-line comparison helper `_computeUnifiedDiff(file1, file2, text1, text2)`:
  ```js
  // Current naive implementation in suna_harness.js:1449-1465
  _computeUnifiedDiff(file1, file2, text1, text2) {
    const l1 = text1.split('\n');
    const l2 = text2.split('\n');
    let out = `--- a/${file1}\n+++ b/${file2}\n`;
    const max = Math.max(l1.length, l2.length);
    for (let i = 0; i < max; i++) {
      const line1 = l1[i];
      const line2 = l2[i];
      if (line1 !== line2) {
        if (line1 !== undefined) out += `-${line1}\n`;
        if (line2 !== undefined) out += `+${line2}\n`;
      } else {
        out += ` ${line1}\n`;
      }
    }
    return out;
  }
  ```
  This naive method **completely lacks**:
  - Hunk headers (`@@ -l,s +l,s @@`).
  - Context line grouping (standard 3 context lines).
  - Myers / LCS diff optimization (misaligns on added/deleted lines).
  - Snapshot-to-snapshot multi-file comparison.
  - Pre-save surgical replacement preview.
- **Current Limitation in Schema Validation**: Tool arguments in `AciInterface` are parsed with manual fallbacks (e.g. `args.TargetFile || args.targetFile || args.path`). There is **no formal schema validator** (`AciSchemaValidator`). If invalid types, missing required arguments, or out-of-bounds parameters are passed, errors are discovered ad-hoc deep inside VFS methods rather than rejected deterministically at the interface boundary with clear structural diagnostics.

### 3.3 Requirement R3: UI Visualizer & IndexedDB Persistence
- **Current Limitation in Visualizer**: `app.js` has a simple flat chip drawer `renderTrajectoryView(trajectory)` (lines 8589–8630). There is no dedicated interactive DOM component that visualizes hierarchical sub-agent execution trees, displays the Benchmark Scorecard metrics ($\mathcal{S}$, $\eta$, $\mathcal{R}$), or provides side-by-side / highlighted diff inspection.
- **Current Limitation in Persistence**: `CheckpointManager` stores checkpoints exclusively in an in-memory `Map` (`this.checkpoints`). Checkpoints vanish on page refresh or process termination. There is no IndexedDB persistence adapter (`suna_harness_checkpoints_<uid>`) or serialization export/import mechanism.

---

## 4. Detailed Architectural Specification & Hook Points

### 4.1 R1: Multi-Agent Sub-harness Delegation & Hierarchical Coordination

```
                                  +-----------------------------+
                                  |     Parent SunaHarness      |
                                  | (Role: Orchestrator / Root) |
                                  +--------------+--------------+
                                                 |
                       +-------------------------+-------------------------+
                       | Inter-Harness Event Bus (Bilateral Messaging)     |
                       +-------------------------+-------------------------+
                                                 |
         +---------------------------------------+---------------------------------------+
         |                                       |                                       |
+--------v------------------+       +------------v-------------+       +-----------------v-----+
| Sub-Harness 1: 'worker'   |       | Sub-Harness 2: 'review'  |       | Sub-Harness 3: 'audit'|
| Mode: 'share' (Shared VFS)|       | Mode: 'clone' (Isolated) |       | Mode: 'branch' (Branch)|
+---------------------------+       +--------------------------+       +-----------+-----------+
                                                                                   |
                                                                       +-----------v-----------+
                                                                       | mergeSubHarness()     |
                                                                       | (Diff-based Merge)    |
                                                                       +-----------------------+
```

#### 4.1.1 Component: `InterHarnessEventBus`
A decoupled publish-subscribe and point-to-point messaging channel connecting Parent and Child sub-harnesses.

- **Class Name**: `InterHarnessEventBus` (alias `HarnessEventBus`).
- **Location**: Insert around line 1547 (before `HarnessController`) or exported as part of root facade.
- **State & Data Structures**:
  ```js
  class InterHarnessEventBus {
    constructor() {
      this.subscribers = new Map(); // harnessId -> Set<callback>
      this.history = [];            // Array<BusMessage>
    }
  }
  ```
- **Message Schema**:
  ```ts
  interface BusMessage {
    id: string;          // `msg_${timestamp}_${hash}`
    from: string;        // sender harness id (e.g. 'parent' or 'sub_worker_abc')
    to: string;          // recipient harness id, or '*' for broadcast
    type: 'directive' | 'progress' | 'status' | 'emergency_stop' | 'result' | 'message';
    payload: any;        // structured data
    timestamp: number;   // epoch ms
  }
  ```
- **Public Methods**:
  1. `subscribe(harnessId, callback)`: Registers a listener for messages directed to `harnessId` or `'*'`. Returns an unsubscribe function.
  2. `unsubscribe(harnessId, callback)`: Removes the listener.
  3. `send({ from, to, type, payload })`: Transmits a targeted message, logs to `history`, and executes matched subscriber callbacks safely in try-catch.
  4. `broadcast(from, type, payload)`: Transmits to all registered subscribers (`to: '*'`).
  5. `getHistory(filter)`: Returns filtered history by `from`, `to`, or `type`.
  6. `clear()`: Resets history and subscribers.

#### 4.1.2 Method: `spawnSubHarness(options)`
Attached to the Harness instance returned by `createHarness()` and to `HarnessController`.

- **Signature**:
  ```js
  spawnSubHarness({
    role = 'worker',
    budget = {},
    vfsWorkspaceMode = 'share', // 'share' | 'clone' | 'branch'
    id = null,
    metadata = {}
  }) -> SubHarnessInstance
  ```
- **Workspace Modes Implementation**:
  - **`'share'` Mode**:
    ```js
    childVfs = this.vfs; // Exact same VFS reference. Mutations are immediately shared.
    ```
  - **`'clone'` Mode**:
    ```js
    childVfs = new VfsSandbox(this.vfs.options);
    childVfs.restoreSnapshot(this.vfs.createSnapshot()); // Independent copy. Zero bleed-back.
    ```
  - **`'branch'` Mode**:
    ```js
    childVfs = new VfsSandbox(this.vfs.options);
    const branchOrigin = this.vfs.createSnapshot();
    childVfs.restoreSnapshot(branchOrigin);
    childHarness._branchOriginSnapshot = branchOrigin; // Preserves branch point for merge.
    ```
- **Child Budget Governance**:
  - `childMaxTurns = Math.min(budget.maxTurns || 10, this.controller.maxTurns - this.controller.turnsCompleted)`.
  - `childMaxTokens = Math.min(budget.maxTokens || 20000, this.controller.maxTokens - this.controller.tokensConsumed)`.
  - `childTimeoutMs = Math.min(budget.timeoutMs || 30000, this.controller.timeoutMs)`.
  - Tokens consumed by child are reported back to parent event bus and charged to parent's aggregate budget.
- **Emergency Halt & Parent Control**:
  - Parent maintains `this.children = new Map()`.
  - Parent can call `emergencyStopSubHarness(childId, reason)`:
    - Broadcasts `'emergency_stop'` message on `InterHarnessEventBus`.
    - Triggers `child.controller.halt('EMERGENCY_STOP_BY_PARENT', { reason })`.

#### 4.1.3 Method: `mergeSubHarness(childHarnessOrId, options = {})`
Merges changes from a `'branch'` mode sub-harness back into the parent VFS.

- **Signature**: `mergeSubHarness(child, { strategy = 'overwrite', conflictResolution = 'theirs' })`
- **Algorithm**:
  1. Retrieves `child._branchOriginSnapshot` and `child.vfs.createSnapshot()`.
  2. Computes branch diff via `VfsDiffEngine.compareSnapshots(branchOrigin, childSnapshot)`.
  3. Checks against current parent VFS state to detect conflicts (files modified in both parent and branch since origin).
  4. Applies changes to parent VFS:
     - For new files in child -> `parent.vfs.writeFile(path, content)`
     - For modified files in child -> `parent.vfs.writeFile(path, content)`
     - For deleted files in child -> `parent.vfs.removeFile(path)`
  5. Emits `'vfs_merged'` event on `InterHarnessEventBus` and logs step to parent trajectory.
  6. Returns `{ success: true, filesMerged: [...], diff: patchString }`.

#### 4.1.4 Trajectory Stitching & Hierarchical Tree
In `TrajectoryEngine`:
- **Event Metadata Extension**:
  Extend `recordStep(stepData)` to accept optional hierarchical fields:
  ```js
  agent_id: stepData.agent_id || stepData.agentId || 'root',
  role: stepData.role || 'parent',
  parent_step_id: stepData.parent_step_id || null,
  sub_trajectory: stepData.sub_trajectory || null,
  depth: stepData.depth || 0
  ```
- **New Method: `stitchChildTrajectory(subHarnessId, childTrajectoryEngineOrEvents, options = {})`**:
  - Appends a delegation step in parent trajectory referencing the child's complete execution trace.
  - Associates child events with parent's step index.
- **New Method: `getHierarchicalTree()`**:
  - Constructs a tree where root-level steps contain a `children` array populated with the corresponding sub-harness events.
- **New Option in `exportMarkdown({ hierarchical: true })`**:
  - Formats child steps with sub-bullet indentation, `[SUB-AGENT: <role>]` badges, and nested parameter/observation blocks.

---

### 4.2 R2: Unified Git Diff Engine (`VfsDiffEngine`) & JSON Schema Validator (`AciSchemaValidator`)

#### 4.2.1 Component: `VfsDiffEngine`
A pure JavaScript, high-performance Git diff generator complying with standard Git patch specifications.

- **Class Name**: `VfsDiffEngine` (alias `DiffEngine`).
- **Location**: Insert around line 908 (between `VfsSandbox` and `AciInterface`).
- **Core Algorithms**:
  1. **Myers / Longest Common Subsequence (LCS) Line Diff Algorithm**:
     - Computes the minimum edit script between `oldLines` and `newLines`.
     - Groups contiguous changes into hunks with configurable context lines (default `3`).
     - Calculates standard hunk headers: `@@ -oldStart,oldCount +newStart,newCount @@`.
     - Single-line shorthand handling: if count is 1, git standard allows `@@ -1 +1 @@` or `@@ -1,1 +1,1 @@`.
  2. **Unicode & Vietnamese UTF-8 Preservation**:
     - Splits strictly on `\n` without altering multi-byte Unicode code points (e.g. `Tiếng Việt`, emojis, tabs).
     - Standardizes CRLF (`\r\n`) to LF (`\n`) before comparison to prevent spurious carriage return diffs.
- **Key Methods**:
  ```js
  class VfsDiffEngine {
    // 1. Single File Diff
    static createUnifiedDiff(oldPath, newPath, oldContent, newContent, options = {}) {
      // Returns Git patch string:
      // --- a/oldPath
      // +++ b/newPath
      // @@ -1,5 +1,6 @@
      //  context
      // -removed
      // +added
    }

    // 2. Snapshot vs Snapshot Diff (Multi-File)
    static compareSnapshots(snapshotA, snapshotB, options = {}) {
      // Compares all files in snapshotA.files vs snapshotB.files:
      // - Modified files: diff old vs new
      // - Added files: diff /dev/null vs b/path
      // - Deleted files: diff a/path vs /dev/null
      // Returns: {
      //   patch: string,
      //   filesChanged: number,
      //   insertions: number,
      //   deletions: number,
      //   details: Array<{ path, status: 'added'|'modified'|'deleted', diff, insertions, deletions }>
      // }
    }

    // 3. Pre-Save Surgical Replacement Preview
    static previewReplaceDiff(vfs, targetFile, targetContent, replacementContent, options = {}) {
      // Computes old content vs what the content WOULD be after replace_file_content
      // Returns unified diff without modifying VFS
    }

    // 4. Side-by-Side Line Formatting (for UI Visualizer)
    static formatSideBySide(oldContent, newContent, options = {}) {
      // Returns paired line objects [{ left: { line, text, type }, right: { line, text, type } }]
    }
  }
  ```
- **Shell Emulator Integration**:
  Replace lines 1449–1465 in `AciInterface.prototype._computeUnifiedDiff` to delegate directly to `VfsDiffEngine.createUnifiedDiff(file1, file2, text1, text2, { context: 3 })`. This ensures `run_sandboxed_command('diff -u file1 file2')` outputs true Git-compatible hunks!

#### 4.2.2 Component: `AciSchemaValidator`
Strict parameter validation for all 6 ACI tools.

- **Class Name**: `AciSchemaValidator` (alias `SchemaValidator`).
- **Location**: Insert around line 911 (before `AciInterface`).
- **Tool Schemas Specification**:
  ```js
  const TOOL_SCHEMAS = {
    view_file: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1 },
        startLine: { type: 'integer', minimum: 1 },
        endLine: { type: 'integer', minimum: 1 },
        contentOffset: { type: 'integer', minimum: 0 }
      },
      required: ['path'],
      aliases: {
        path: ['AbsolutePath', 'absolutePath', 'Path', 'targetFile', 'TargetFile'],
        startLine: ['StartLine'],
        endLine: ['EndLine'],
        contentOffset: ['ContentOffset']
      }
    },
    replace_file_content: {
      type: 'object',
      properties: {
        TargetFile: { type: 'string', minLength: 1 },
        TargetContent: { type: 'string', minLength: 1 },
        ReplacementContent: { type: 'string' },
        StartLine: { type: 'integer', minimum: 1 },
        EndLine: { type: 'integer', minimum: 1 },
        AllowMultiple: { type: 'boolean' }
      },
      required: ['TargetFile', 'TargetContent', 'ReplacementContent'],
      aliases: {
        TargetFile: ['path', 'Path', 'targetFile'],
        TargetContent: ['targetContent'],
        ReplacementContent: ['replacementContent'],
        StartLine: ['startLine'],
        EndLine: ['endLine'],
        AllowMultiple: ['allowMultiple']
      }
    },
    grep_search: {
      type: 'object',
      properties: {
        Query: { type: 'string', minLength: 1 },
        SearchPath: { type: 'string' },
        IsRegex: { type: 'boolean' },
        CaseInsensitive: { type: 'boolean' },
        MatchPerLine: { type: 'boolean' },
        Includes: { type: 'array', items: { type: 'string' } }
      },
      required: ['Query'],
      aliases: {
        Query: ['query'],
        SearchPath: ['searchPath'],
        IsRegex: ['isRegex'],
        CaseInsensitive: ['caseInsensitive'],
        MatchPerLine: ['matchPerLine'],
        Includes: ['includes']
      }
    },
    find_by_name: {
      type: 'object',
      properties: {
        Pattern: { type: 'string', minLength: 1 },
        SearchDirectory: { type: 'string' },
        Type: { type: 'string', enum: ['file', 'directory', 'any'] },
        MaxDepth: { type: 'integer', minimum: 0 },
        Extensions: { type: 'array', items: { type: 'string' } }
      },
      required: ['Pattern'],
      aliases: {
        Pattern: ['pattern'],
        SearchDirectory: ['searchDirectory'],
        Type: ['type'],
        MaxDepth: ['maxDepth'],
        Extensions: ['extensions']
      }
    },
    list_dir: {
      type: 'object',
      properties: {
        DirectoryPath: { type: 'string' },
        Recursive: { type: 'boolean' },
        MaxDepth: { type: 'integer', minimum: 0 }
      },
      required: [],
      aliases: {
        DirectoryPath: ['directoryPath', 'dirPath', 'DirPath', 'path', 'Path'],
        Recursive: ['recursive'],
        MaxDepth: ['maxDepth']
      }
    },
    run_sandboxed_command: {
      type: 'object',
      properties: {
        CommandLine: { type: 'string', minLength: 1 },
        TimeoutMs: { type: 'number', minimum: 1 },
        Cwd: { type: 'string' }
      },
      required: ['CommandLine'],
      aliases: {
        CommandLine: ['commandLine', 'command', 'cmd'],
        TimeoutMs: ['timeoutMs'],
        Cwd: ['cwd']
      }
    }
  };
  ```
- **Validation Rules & Error Reporting**:
  - Normalizes aliases: If user passes `path`, maps to `TargetFile` or vice versa.
  - Checks required fields: Reports `MISSING_REQUIRED_PROPERTY`.
  - Checks types: Reports `TYPE_MISMATCH` (e.g. number passed when string expected).
  - Checks bounds: `startLine > endLine` -> reports `INVALID_RANGE_BOUNDS`.
  - Checks enums: `Type: 'invalid'` -> reports `INVALID_ENUM_VALUE`.
  - Structured Diagnostic Return:
    ```js
    {
      valid: false,
      tool: 'replace_file_content',
      errors: [
        { field: 'TargetContent', rule: 'required', message: 'TargetContent cannot be empty.', expected: 'non-empty string', actual: '' }
      ]
    }
    ```
- **ACI Interface Hook Point**:
  In `AciInterface.prototype.execute(toolName, args)` (line 923):
  ```js
  const validation = AciSchemaValidator.validate(toolName, args);
  if (!validation.valid) {
    return {
      status: 'ERROR',
      error: `Schema validation failed for "${toolName}": ${validation.errors.map(e => e.message).join('; ')}`,
      code: 'SCHEMA_VALIDATION_ERROR',
      validationErrors: validation.errors
    };
  }
  ```

---

### 4.3 R3: Interactive UI Visualizer DOM Component & IndexedDB Checkpoint Persistence

#### 4.3.1 Component: `SunaHarnessVisualizer` (DOM Component)
A self-contained UI module rendering Trajectory Trees, Benchmark Scorecards, and Diff Views.

- **Class Name**: `SunaHarnessVisualizer` (alias `Visualizer`).
- **Location**: Insert around line 3087 (before root facade) or bundled in `suna_harness.js`.
- **Environment Agility**:
  - If running in browser: mounts to target DOM container element (`container.appendChild(...)`), binds interactive event listeners (tab switching, filters, expand/collapse toggles).
  - If running in headless / Node.js test environment: provides `renderToString()` returning well-formed HTML for assertions.
- **View Subsystems**:
  1. **Trajectory Tree View**:
     - Filter toolbar:
       - Level filter: `[All Levels]`, `[Parent Only]`, `[Sub-Agents Only]`
       - Sub-agent dropdown: `[All Agents]`, `[worker]`, `[reviewer]`, etc.
       - Status filter: `[All Status]`, `[Pass Only]`, `[Fail Only]`
       - Live search bar for keyword search in thought/tool/observation.
     - Hierarchical nodes with indent guides, step index badges, duration chips, token consumption badges, and collapsible details for `thought`, `action.params`, and `observation.result`.
  2. **Benchmark Scorecard View**:
     - Top metrics panel:
       - **Success Rate ($\mathcal{S}$)**: Gauge / progress bar with `PASS`/`FAIL` badge.
       - **Step Efficiency ($\eta$)**: Average efficiency metric.
       - **Fault Recovery Rate ($\mathcal{R}$)**: Percentage of injected faults recovered.
       - **Zero-Progress Accuracy**: Guardrail precision.
     - 5-Tier Breakdown Grid:
       - Tier 1: Core Functionality (4 tasks)
       - Tier 2: Boundary & Robustness (5 tasks)
       - Tier 3: Algorithmic Self-Correction (4 tasks)
       - Tier 4: Multi-Step Tool Composition (3 tasks)
       - Tier 5: Chaos Resilience & Fault Recovery (4 tasks)
  3. **Visual Diff Viewer**:
     - Toggle: `[Unified Diff]` vs `[Side-by-Side]`.
     - File selector dropdown when multi-file diff is present.
     - Syntax color-coded lines:
       - `diff-add` (green background, `+` marker)
       - `diff-delete` (red background, `-` marker)
       - `diff-hunk` (blue/purple background, `@@ ... @@`)
       - `diff-context` (neutral background).

#### 4.3.2 Component: `IndexedDbCheckpointStorage`
A robust persistence layer for storing VFS snapshots and checkpoint history.

- **Class Name**: `IndexedDbCheckpointStorage` (alias `CheckpointStorage`).
- **Location**: Insert around line 1983 (adjacent to `CheckpointManager`).
- **Database Schema**:
  - Database Name: `suna_harness_checkpoints_<uid>` (where `<uid>` is user ID, session ID, or `'default'`).
  - Version: `1`.
  - Object Store 1: `checkpoints`
    - KeyPath: `checkpoint_id`
    - Indexes: `step_index` (unique: false), `timestamp` (unique: false).
  - Object Store 2: `metadata`
    - KeyPath: `key` (holds active session pointers, last modified timestamp).
- **Core Methods**:
  ```js
  class IndexedDbCheckpointStorage {
    constructor(options = {}) {
      this.prefix = options.prefix || 'suna_harness_checkpoints_';
      this.fallbackStore = new Map(); // In-memory fallback if IndexedDB is unavailable
    }

    async openDatabase(uid) { ... }
    async saveCheckpoint(uid, checkpoint) { ... }
    async getCheckpoint(uid, checkpointIdOrStepIndex) { ... }
    async getAllCheckpoints(uid) { ... }
    async exportSession(uid) { ... } // Serializes complete VFS snapshot + checkpoint chain to JSON
    async importSession(uid, serializedJson) { ... } // Reconstructs checkpoints from JSON string
    async clearSession(uid) { ... }
  }
  ```
- **Resilience & Fallback Matrix**:
  - In Node.js or browsers where `window.indexedDB` is undefined / disabled (incognito mode / security restrictions), automatically routes reads/writes to `this.fallbackStore` or `window.localStorage` (partitioned key: `suna_chk_${uid}_...`).
  - Safely handles `QuotaExceededError` without crashing the application.

---

## 5. Hook Points in Existing Codebase & Zero-Regression Verification

### 5.1 Insertion Points in `suna_harness.js`

```
suna_harness.js
├── Lines 133-153:  VfsError & HarnessError
├── Lines 159-907:  VfsSandbox (Existing)
├── [INSERT POINT 1: Lines 908-911]
│   └── class VfsDiffEngine (Myers Git Diff, compareSnapshots, formatSideBySide)
│   └── class AciSchemaValidator (Schemas, validate, assertValid)
├── Lines 912-1546: AciInterface (Existing)
│   ├── Hook execute() -> validate with AciSchemaValidator
│   └── Hook _executeSingleCommand('diff') -> use VfsDiffEngine
├── [INSERT POINT 2: Line 1547]
│   └── class InterHarnessEventBus (Messaging, directive, emergency_stop)
├── Lines 1552-1740: HarnessController (Existing)
│   ├── Hook spawnSubHarness()
│   ├── Hook mergeSubHarness()
│   └── Hook emergencyStopSubHarness()
├── Lines 1745-1873: TrajectoryEngine (Existing)
│   ├── Hook stitchChildTrajectory()
│   ├── Hook getHierarchicalTree()
│   └── Hook exportMarkdown({ hierarchical: true })
├── Lines 1878-1982: CheckpointManager (Existing)
│   ├── Hook exportState() & importState()
│   └── Hook persistToStorage(uid) & loadFromStorage(uid)
├── [INSERT POINT 3: Line 1983]
│   └── class IndexedDbCheckpointStorage (IndexedDB persistence & localStorage fallback)
├── Lines 1987-3086: SelfCorrectionLoop, Chaos, Guardrails, Benchmark, Evaluation (Existing)
├── [INSERT POINT 4: Line 3087]
│   └── class SunaHarnessVisualizer (DOM Trajectory Tree, Scorecard, Diff Viewer)
└── Lines 3092-3258: SunaHarness Facade & Public Exports
    ├── Export InterHarnessEventBus, VfsDiffEngine, AciSchemaValidator,
    │          IndexedDbCheckpointStorage, SunaHarnessVisualizer
    └── Enhance createHarness() with sub-harness delegation methods
```

### 5.2 Bridge Integrity in `app.js`

In `app.js`, `SunaAgent` is encapsulated between strict marker comments:
```js
// Line 3014: // === START OF agent.js ===
// ...
// Line 4280: // Bridge SunaHarness into SunaAgent (R1-R4 ACI Sandbox & Trajectory Integration)
// ...
// Line 4305: // === END OF agent.js ===
```
- Existing tests specifically verify that these comment markers are present and unaltered.
- The bridging logic at lines 4281–4301 dynamically checks `SunaHarness` or `require('./suna_harness.js')`.
- All newly added components (`VfsDiffEngine`, `AciSchemaValidator`, `InterHarnessEventBus`, `SunaHarnessVisualizer`, `IndexedDbCheckpointStorage`) attach cleanly to `SunaHarness` without requiring modifications to the core agent ReAct loop inside `app.js`.

### 5.3 Zero-Regression Guarantee Checklist

| Verification Check | Target Standard | Assessment / Guarantee |
| :--- | :--- | :--- |
| **Existing Mocha Test Suite** | 982 passing tests (0 failures) | All existing class constructors, method signatures, parameter tolerances, and return formats are preserved with 100% backward compatibility. |
| **JavaScript Syntax Check** | `node -c app.js && node -c redesign.js && node -c suna_harness.js` | All new code uses standard ECMAScript compatible with ES2020+, Node.js v16+, and modern browsers. Zero syntax errors. |
| **External Dependency Ban** | 0 new packages in `package.json` | Myers diff algorithm, JSON schema validation, and event bus are authored in pure vanilla JS using standard library constructs. |
| **Workspace Synchronization** | `_syncLiveWorkspace` to `#artifact-editor-textarea` | Preserved untouched; virtual modifications to `index.html` continue to update the live workspace editor and preview iframe. |
| **Security & Sandbox Isolation** | Path traversal, null byte protection, ReDoS defense | All existing security checks remain active; schema validator adds an additional upfront defensive layer. |

---

## 6. Recommendations for Implementation & Testing

1. **Phase 1: R2 Core (Diff Engine & Schema Validator)**:
   - Implement `VfsDiffEngine` first, as it is a pure algorithmic component that does not depend on other subsystems.
   - Implement `AciSchemaValidator` and integrate into `AciInterface.execute()` while preserving parameter aliases.
   - Wire `VfsDiffEngine` into `replace_file_content` preview and shell `diff`.
2. **Phase 2: R1 Core (Sub-harness Delegation & Event Bus)**:
   - Implement `InterHarnessEventBus`.
   - Implement `spawnSubHarness`, `mergeSubHarness`, and emergency stop on `HarnessController` / `createHarness`.
   - Extend `TrajectoryEngine` with `stitchChildTrajectory()` and `getHierarchicalTree()`.
3. **Phase 3: R3 Core (UI Visualizer & Checkpoint Persistence)**:
   - Implement `IndexedDbCheckpointStorage` with localStorage/in-memory fallback.
   - Implement `SunaHarnessVisualizer` with tabs for Trajectory Tree, Scorecard, and Diff.
4. **Phase 4: Comprehensive E2E Testing & Verification**:
   - Add new test blocks to `tests/test_suna_harness.js` covering:
     - Sub-harness delegation (`share`, `clone`, `branch` modes, event bus message exchange, trajectory stitching).
     - Unified Git diff generation (hunks, UTF-8 Vietnamese text, snapshot comparisons).
     - Schema validation (rejections, error diagnostics, alias normalization).
     - IndexedDB persistence and UI Visualizer DOM rendering.
   - Verify `npm test` passes 100% (target $\ge 1000$ tests) and `python run_verification.py` is fully green.

---
*End of Survey Report — Prepared for Orchestrator and Implementation Agents.*
