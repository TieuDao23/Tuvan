# Suna Agent Harness (SunaHarness) — Formal Specification & Technical Blueprint Report

**Date**: 2026-09-07  
**Author**: `spec_miner_survey_2` (Specification Mining Specialist)  
**Target Project**: Suna Agent Harness (`d:\Suna Chat\suna_harness.js`) & SunaChat Application  
**Authoritative Specification Sources**:
- `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` (Primary mandate: R1–R4)
- `d:\Suna Chat\.agents\spec_miner_survey_2\DISPATCH.md`
- `d:\Suna Chat\suna_harness.js` (Current runtime implementation)
- `d:\Suna Chat\tests\test_suna_harness.js` (E2E Test Suite)
- `d:\Suna Chat\run_verification.py` (Automated verification runner)
- `d:\Suna Chat\app.js` & `index.html` (SunaChat host application)

---

## 1. Executive Summary & Architectural Overview

Suna Agent Harness (SunaHarness) is an enterprise-grade execution, observation, and benchmarking harness designed for autonomous multi-step software engineering agents, drawing architectural patterns from **OpenHands**, **SWE-agent**, and **LangGraph**.

The purpose of this specification report is to formally define the technical architecture, function interfaces, JSON Schema definitions, event bus protocols, mathematical benchmark formulas, DOM visualizer requirements, and persistence mechanics for four advanced capabilities:
1. **R1: Multi-Agent Sub-harness Delegation & Hierarchical Orchestration**: Parent harnesses spawning child sub-harnesses with fine-grained turn/token budgets, flexible VFS workspace partitioning (`share`, `clone`, `branch`), a bidirectional event bus, and hierarchical trajectory tree stitching.
2. **R2: Standard Git Unified Diff Engine (`VfsDiffEngine`) & JSON Schema Validator (`AciSchemaValidator`)**: Production-grade unified diff generator conforming to standard Git patch format (`--- a/... \n +++ b/... \n @@ -l,s +l,s @@`) with Vietnamese UTF-8 preservation, paired with a strict JSON Schema validator for all ACI tools preventing execution on invalid arguments.
3. **R3: Interactive UI Visualizer (`SunaHarnessVisualizer`) & Persistent Checkpoints**: Rich browser DOM visualizer for trajectory event trees, visual benchmark scorecard charts with exact mathematical formulas ($SR$, $\eta$, $FRR$), unified/split diff viewers, and persistent IndexedDB snapshot serialization (`suna_harness_checkpoints_<uid>`).
4. **R4: Comprehensive E2E Testing, Adversarial Fuzzing & Zero Regression**: Test suites validating deep recursion ($\ge 5$), prototype pollution and schema injection resilience, 10,000+ line diff scaling, and 100% preservation of all 982 existing Mocha tests.

---

## 2. Formal Specification: R1 — Multi-Agent Sub-harness Delegation

### 2.1 Sub-Harness Spawning Architecture

The root `HarnessController` or any active sub-harness can act as a parent to spawn nested child sub-harnesses. Each sub-harness is an autonomous execution unit with its own lifecycle, turn/token budget, and VFS sandbox mode.

#### Method Signature: `spawnSubHarness`
```typescript
interface SpawnSubHarnessOptions {
  role: string;                                   // e.g., 'planner', 'coder', 'debugger', 'reviewer', 'explorer'
  subHarnessId?: string;                          // Unique ID (default: `subharness_${role}_${Date.now()}_${rand}`)
  budget: {
    maxTurns?: number;                            // Maximum allowed turns (default: 10)
    maxTokens?: number;                           // Maximum token consumption (default: 25000)
    timeoutMs?: number;                           // Execution timeout in milliseconds (default: 30000)
  };
  vfsWorkspaceMode: 'share' | 'clone' | 'branch'; // Workspace partitioning strategy
  readOnly?: boolean;                             // If true, sub-harness cannot mutate VFS
  metadata?: Record<string, any>;                 // Custom metadata/task description
}

interface SubHarnessInstance {
  id: string;
  role: string;
  depth: number;                                  // Nesting depth (root = 0, child = 1, grandchild = 2...)
  parentId: string | null;
  vfs: VfsSandbox;
  controller: HarnessController;
  aci: AciInterface;
  trajectory: TrajectoryEngine;
  bus: InterHarnessEventBus;
  vfsMode: 'share' | 'clone' | 'branch';
  branchState?: VfsBranchState;                   // Present only when mode === 'branch'
  status: 'initialized' | 'running' | 'paused' | 'completed' | 'failed' | 'halted';
  
  // Public Methods
  executeAction(toolName: string, args: Record<string, any>): Promise<any>;
  sendDirective(directive: string, payload?: any): void;
  requestStatus(): SubHarnessStatusReport;
  emergencyStop(reason?: string): void;
  pause(): void;
  resume(): void;
  mergeBranchToParent(options?: MergeBranchOptions): MergeResult;
  terminate(): void;
}
```

### 2.2 VFS Workspace Partitioning Semantics

| Mode | Semantics | Data Isolation | Write Impact | Merge Requirement |
| :--- | :--- | :--- | :--- | :--- |
| `'share'` | Child receives the exact memory reference to parent's `VfsSandbox`. | Zero isolation. | Any file write/delete immediately mutates the parent workspace. | None (already shared). |
| `'clone'` | Child receives a deep snapshot copy of parent's `VfsSandbox` at spawn time: `parent.vfs.createSnapshot()`. | Full isolation. | Mutations in child VFS never affect parent or siblings. | No merge mechanism (scratchpad / exploration mode). |
| `'branch'` | Child receives a snapshot copy with an active changeset ledger (`addedFiles`, `modifiedFiles`, `deletedFiles`, `baseSnapshot`). | Isolated branch. | Child mutations are staged locally in the branch ledger. | Explicit `mergeBranchToParent()` or `parent.mergeBranch(child)`. |

#### Branch Merge Semantics & Conflict Resolution
```typescript
interface MergeBranchOptions {
  strategy?: 'overwrite' | 'abort_on_conflict' | 'three_way'; // Default: 'overwrite'
}

interface MergeResult {
  success: boolean;
  mergedFiles: string[];
  conflicts?: Array<{
    path: string;
    parentContent: string;
    childContent: string;
    baseContent: string;
  }>;
  error?: string;
}
```
- **Overwrite**: All files added or modified in the branch are written to the parent VFS. Deleted files in the branch are deleted from parent.
- **Abort on Conflict**: If a file modified in the branch was also modified in the parent since branch creation (i.e. `parentFile.updatedAt > branchCreatedAt` and `parentHash !== baseHash`), the merge aborts with `success: false` and lists all conflicting paths.
- **Three-Way**: If modifications are in non-overlapping lines, changes merge cleanly; otherwise marked with conflict markers (`<<<<<<< PARENT`, `=======`, `>>>>>>> BRANCH`).

### 2.3 Two-Way Inter-Harness Event Bus Protocol

Communication between parent and child harnesses occurs via an event bus adhering to structured JSON message envelopes.

#### Event Envelope Schema
```typescript
interface InterHarnessMessage {
  id: string;                   // UUID / unique message ID: `msg_${now}_${rand}`
  senderId: string;             // ID of transmitting harness
  recipientId: string;          // Target harness ID or '*' for broadcast
  type: InterHarnessEventType;
  timestamp: string;            // ISO 8601 UTC timestamp
  payload: Record<string, any>;
}

type InterHarnessEventType =
  // Parent -> Child
  | 'directive'                 // Next instruction, prompt, or tool requirement
  | 'status_query'              // Request current turn, token, and memory state
  | 'emergency_stop'            // Immediate emergency halt
  | 'pause'                     // Pause execution
  | 'resume'                    // Resume execution
  // Child -> Parent
  | 'progress'                  // Periodic heartbeat & turn status
  | 'assistance_request'        // Escalation when stuck or encountering unknown error
  | 'completed'                 // Task finished with result payload
  | 'failed';                   // Task terminated with unrecoverable error
```

#### Event Payloads Specification
1. **`directive`**:
   ```json
   {
     "instruction": "Fix failing assertion in /tests/math.test.js",
     "priority": "HIGH",
     "context": { "targetFile": "src/math.js" }
   }
   ```
2. **`progress`**:
   ```json
   {
     "currentTurn": 3,
     "maxTurns": 10,
     "tokensConsumed": 4120,
     "activeTool": "replace_file_content",
     "percentEstimate": 40,
     "lastThought": "Replacing division logic to guard against zero"
   }
   ```
3. **`emergency_stop`**:
   ```json
   {
     "reason": "Parent budget exhausted or user clicked cancel",
     "immediate": true
   }
   ```
4. **`completed`**:
   ```json
   {
     "success": true,
     "turnsUsed": 4,
     "tokensUsed": 5210,
     "summary": "Resolved bug in math.js line 42",
     "modifiedFiles": ["src/math.js"]
   }
   ```

### 2.4 Trajectory Stitching & Hierarchical Tree Data Structure

When a child sub-harness runs, its execution events must be seamlessly aggregated into the parent trajectory without flattening the hierarchy.

#### Hierarchical Trajectory Node Schema
```typescript
interface TrajectoryTreeNode {
  id: string;                         // `evt_${stepIndex}_${timestamp}`
  harnessId: string;                  // ID of harness that generated the event
  parentHarnessId: string | null;     // null for root harness
  depth: number;                      // 0 = root, 1 = sub-harness, 2 = nested sub-harness
  role: string;                       // 'root' | 'coder' | 'reviewer' | ...
  stepIndex: number;                  // Local step index within this harness
  globalStepIndex: number;            // Monotonically increasing across whole tree
  type: 'thought' | 'action' | 'observation' | 'spawn' | 'complete' | 'error';
  timestamp: string;
  thought?: string;
  action?: {
    tool: string;
    params: Record<string, any>;
  };
  observation?: {
    status: 'success' | 'error';
    result?: any;
    error?: string;
  };
  metrics: {
    durationMs: number;
    tokensConsumed: number;
  };
  children: TrajectoryTreeNode[];     // Nested sub-harness events or sub-actions
}
```

#### Trajectory Stitching Rules
1. When `parent.spawnSubHarness()` is invoked, parent records a node of type `'spawn'` with `subHarnessId`, `role`, and `budget`.
2. As the child executes, events recorded in the child's `TrajectoryEngine` are automatically bridged into the child's node subtree under the parent.
3. When the child completes, a `'complete'` event summarizes total child duration, token usage, and outcome.
4. Traversal helpers:
   - `trajectory.getHierarchicalTree()`: Returns the nested tree.
   - `trajectory.getFlattenedTimeline()`: Returns pre-order depth-first traversal with indentation markers.

---

## 3. Formal Specification: R2 — Unified Diff Engine & JSON Schema Validator

### 3.1 VfsDiffEngine (Standard Git Patch Generation)

`VfsDiffEngine` computes standard unified diffs conforming to Git patch specifications (`git diff` format).

#### Unified Diff Format Specification
```
--- a/path/to/file.js
+++ b/path/to/file.js
@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@
 <context_line_1>
-<deleted_line>
+<added_line>
 <context_line_2>
```

#### Structural Rules & Invariants
1. **Header Convention**:
   - For file modification: `--- a/<filePath>\n+++ b/<filePath>\n`
   - For file creation: `--- /dev/null\n+++ b/<filePath>\n`
   - For file deletion: `--- a/<filePath>\n+++ /dev/null\n`
2. **Hunk Header Syntax**:
   - `@@ -oldStart,oldCount +newStart,newCount @@`
   - All line numbers are **1-indexed**.
   - If `oldCount === 1`, Git allows `@@ -oldStart +newStart,newCount @@` (and vice-versa). The engine must generate standard counts and accept standard format.
3. **Context Grouping**:
   - Default context lines: `contextLines = 3`.
   - Neighboring changes separated by $\le 2 \times contextLines$ are merged into a single hunk.
4. **Line Prefixes**:
   - ` ` (single space): unchanged context line.
   - `-`: removed line.
   - `+`: inserted line.
5. **No Newline at End of File**:
   - If the old or new content lacks a trailing `\n`, append `\ No newline at end of file` immediately following the affected line.
6. **Vietnamese UTF-8 Character Preservation**:
   - Slicing and character indexing must strictly respect multi-byte Unicode code points.
   - Vietnamese tonal marks and accented characters (e.g., `ả, ã, ạ, ắ, ằ, ẳ, ẵ, ặ, ấ, ầ, ẩ, ẫ, ậ, ê, ơ, ư, đ`) must never be split across bytes or corrupted.

#### VfsDiffEngine Public API
```typescript
class VfsDiffEngine {
  /**
   * Generates a Git unified diff string comparing two text strings.
   */
  static createPatch(
    filePath: string,
    oldText: string,
    newText: string,
    options?: { contextLines?: number; oldHeader?: string; newHeader?: string }
  ): string;

  /**
   * Compares two files within a VFS instance.
   */
  static diffFiles(
    vfs: VfsSandbox,
    pathA: string,
    pathB: string,
    options?: { contextLines?: number }
  ): string;

  /**
   * Compares two entire VFS snapshots, generating a multi-file patch.
   */
  static diffSnapshots(
    snapshotA: { files: Record<string, { content: string }> },
    snapshotB: { files: Record<string, { content: string }> },
    options?: { contextLines?: number }
  ): string;

  /**
   * Generates a preview diff for replace_file_content BEFORE applying it.
   */
  static previewReplaceDiff(
    vfs: VfsSandbox,
    targetFile: string,
    targetContent: string,
    replacementContent: string,
    options?: { startLine?: number; endLine?: number; allowMultiple?: boolean; contextLines?: number }
  ): { patch: string; wouldSucceed: boolean; reason?: string };

  /**
   * Parses a unified diff string into a structured AST of files and hunks.
   */
  static parsePatch(patchStr: string): ParsedPatch[];
}

interface ParsedPatch {
  oldFile: string;
  newFile: string;
  hunks: Array<{
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
  }>;
}
```

### 3.2 AciSchemaValidator (JSON Schema Validation for ACI Tools)

`AciSchemaValidator` provides strict, pre-execution argument validation for all six SWE-agent ACI tools. When arguments violate schema constraints, the validator immediately halts execution and returns structured diagnostics with actionable error descriptions, protecting the VFS from invalid operations and feeding clean signal to `SelfCorrectionLoop`.

#### JSON Schema Definitions

##### 1. `view_file` Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "view_file_args",
  "type": "object",
  "properties": {
    "path": { "type": "string", "minLength": 1, "description": "Virtual file path to view." },
    "AbsolutePath": { "type": "string", "minLength": 1 },
    "startLine": { "type": "integer", "minimum": 1, "description": "1-indexed starting line number." },
    "StartLine": { "type": "integer", "minimum": 1 },
    "endLine": { "type": "integer", "minimum": 1, "description": "1-indexed ending line number." },
    "EndLine": { "type": "integer", "minimum": 1 },
    "contentOffset": { "type": "integer", "minimum": 0, "description": "Byte offset into file." },
    "ContentOffset": { "type": "integer", "minimum": 0 }
  },
  "required": [],
  "anyOf": [
    { "required": ["path"] },
    { "required": ["AbsolutePath"] }
  ],
  "additionalProperties": true
}
```
*Cross-Field Rule*: If both `startLine` and `endLine` are provided, `startLine <= endLine`.

##### 2. `replace_file_content` Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "replace_file_content_args",
  "type": "object",
  "properties": {
    "TargetFile": { "type": "string", "minLength": 1, "description": "Virtual file path." },
    "targetFile": { "type": "string", "minLength": 1 },
    "TargetContent": { "type": "string", "minLength": 1, "description": "Exact text to match." },
    "targetContent": { "type": "string", "minLength": 1 },
    "ReplacementContent": { "type": "string", "description": "New text to substitute (can be empty string)." },
    "replacementContent": { "type": "string" },
    "StartLine": { "type": "integer", "minimum": 1 },
    "startLine": { "type": "integer", "minimum": 1 },
    "EndLine": { "type": "integer", "minimum": 1 },
    "endLine": { "type": "integer", "minimum": 1 },
    "AllowMultiple": { "type": "boolean" },
    "allowMultiple": { "type": "boolean" }
  },
  "anyOf": [
    { "required": ["TargetFile", "TargetContent"] },
    { "required": ["targetFile", "targetContent"] }
  ],
  "additionalProperties": true
}
```
*Cross-Field Rule*: `StartLine <= EndLine` when both are supplied. `TargetContent` must not be empty.

##### 3. `grep_search` Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "grep_search_args",
  "type": "object",
  "properties": {
    "Query": { "type": "string", "minLength": 1, "description": "Search string or regex." },
    "query": { "type": "string", "minLength": 1 },
    "SearchPath": { "type": "string" },
    "searchPath": { "type": "string" },
    "IsRegex": { "type": "boolean" },
    "isRegex": { "type": "boolean" },
    "CaseInsensitive": { "type": "boolean" },
    "caseInsensitive": { "type": "boolean" },
    "MatchPerLine": { "type": "boolean" },
    "matchPerLine": { "type": "boolean" },
    "Includes": { "type": "array", "items": { "type": "string" } },
    "includes": { "type": "array", "items": { "type": "string" } }
  },
  "anyOf": [
    { "required": ["Query"] },
    { "required": ["query"] }
  ],
  "additionalProperties": true
}
```
*Security Guard*: If `IsRegex === true`, `isDangerousReDosRegex(Query)` must return `false`.

##### 4. `find_by_name` Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "find_by_name_args",
  "type": "object",
  "properties": {
    "Pattern": { "type": "string", "minLength": 1, "description": "Glob pattern." },
    "pattern": { "type": "string", "minLength": 1 },
    "SearchDirectory": { "type": "string" },
    "searchDirectory": { "type": "string" },
    "Type": { "type": "string", "enum": ["file", "directory", "any"] },
    "type": { "type": "string", "enum": ["file", "directory", "any"] },
    "MaxDepth": { "type": "integer", "minimum": 0 },
    "maxDepth": { "type": "integer", "minimum": 0 }
  },
  "anyOf": [
    { "required": ["Pattern"] },
    { "required": ["pattern"] }
  ],
  "additionalProperties": true
}
```

##### 5. `list_dir` Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "list_dir_args",
  "type": "object",
  "properties": {
    "DirectoryPath": { "type": "string" },
    "directoryPath": { "type": "string" },
    "Recursive": { "type": "boolean" },
    "recursive": { "type": "boolean" },
    "MaxDepth": { "type": "integer", "minimum": 0 },
    "maxDepth": { "type": "integer", "minimum": 0 }
  },
  "additionalProperties": true
}
```

##### 6. `run_sandboxed_command` Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "run_sandboxed_command_args",
  "type": "object",
  "properties": {
    "CommandLine": { "type": "string", "minLength": 1, "description": "Unix shell command line." },
    "commandLine": { "type": "string", "minLength": 1 },
    "cmd": { "type": "string", "minLength": 1 },
    "TimeoutMs": { "type": "integer", "minimum": 1, "maximum": 60000 },
    "timeoutMs": { "type": "integer", "minimum": 1, "maximum": 60000 },
    "Cwd": { "type": "string" },
    "cwd": { "type": "string" }
  },
  "anyOf": [
    { "required": ["CommandLine"] },
    { "required": ["commandLine"] },
    { "required": ["cmd"] }
  ],
  "additionalProperties": true
}
```

#### Structured Validation Error Output
When validation fails, `AciSchemaValidator.validate(toolName, args)` returns:
```json
{
  "valid": false,
  "tool": "replace_file_content",
  "errors": [
    {
      "field": "TargetContent",
      "keyword": "required",
      "message": "Parameter 'TargetContent' is required and cannot be empty.",
      "received": ""
    }
  ],
  "diagnostic": "SCHEMA_VALIDATION_ERROR: Tool 'replace_file_content' rejected invalid arguments. Field 'TargetContent' is required and cannot be empty."
}
```

---

## 4. Formal Specification: R3 — UI Visualizer & Checkpoint Persistence

### 4.1 SunaHarness UI Visualizer Component

The Visualizer is a modular DOM UI component that mounts cleanly into SunaChat's workspace or modal dialogs (`#suna-harness-visualizer`).

```
+-----------------------------------------------------------------------------------------+
| [SunaHarness Control Bar]                                                               |
| Tabs: [ 🌲 Trajectory Tree ]  [ 📊 Benchmark Scorecard ]  [ 🔍 Diff Viewer ]  [ 💾 Checkpoints ] |
+-----------------------------------------------------------------------------------------+
| TAB 1: TRAJECTORY TREE                                                                  |
| Filter: [All Roles v] [Status: All v]  Search: [____________]  [Expand All] [Collapse]  |
| --------------------------------------------------------------------------------------- |
| > [Step 1] [Root] view_file("src/app.js")                   [PASS] [42ms] [210 tokens]  |
| v [Step 2] [Root] spawnSubHarness(role: "coder", mode: "branch")                        |
|   |-- [Step 2.1] [Sub: Coder] grep_search("handleError")    [PASS] [15ms] [140 tokens]  |
|   |-- [Step 2.2] [Sub: Coder] replace_file_content(...)     [PASS] [35ms] [320 tokens]  |
|   \-- [Step 2.3] [Sub: Coder] completed (branch merged)     [PASS]                      |
| > [Step 3] [Root] run_sandboxed_command("node -c src/app.js") [PASS] [80ms]             |
+-----------------------------------------------------------------------------------------+
```

#### Benchmark Scorecard Visuals & Exact Mathematical Formulas
The Benchmark Scorecard renders aggregated KPI summary cards and tier breakdown bars:

1. **Success Rate ($SR$ or $S$)**:
   $$\text{Success Rate } (SR) = \frac{N_{\text{passed}}}{N_{\text{total}}} \times 100\%$$
   Where $N_{\text{passed}}$ is the count of tasks where the task oracle verified success, and $N_{\text{total}}$ is the total number of benchmark tasks (20 in the standard suite).

2. **Step Efficiency ($\eta$)**:
   $$\eta = \frac{1}{N_{\text{total}}} \sum_{i=1}^{N_{\text{total}}} \frac{\text{OptimalSteps}_i}{\max(\text{ActualSteps}_i, \text{OptimalSteps}_i)} \times 100\%$$
   - For any individual task, efficiency is clamped to $[0.0, 1.0]$.
   - If an agent completes a task in $\le \text{OptimalSteps}$, efficiency is $1.0$ ($100\%$).
   - If an agent takes $2\times$ the optimal steps, efficiency is $0.5$ ($50\%$).

3. **Fault Recovery Rate ($FRR$ or $R$)**:
   $$\text{Fault Recovery Rate } (FRR) = \frac{N_{\text{recovered\_faults}}}{N_{\text{injected\_faults}}} \times 100\%$$
   Where $N_{\text{injected\_faults}}$ is the total number of tasks where `ChaosFaultInjector` injected synthetic faults (Tier 5 tasks), and $N_{\text{recovered\_faults}}$ is the number of those tasks the agent successfully overcame and completed.

#### Visual Diff Viewer Specification
- **Modes**: Unified Diff view and Side-by-Side Split view.
- **Styling Tokens**:
  - Insertions: `background: rgba(46, 160, 67, 0.15); color: #3fb950; border-left: 3px solid #2ea043;`
  - Deletions: `background: rgba(248, 81, 73, 0.15); color: #f85149; border-left: 3px solid #da3633;`
  - Hunk Header: `background: rgba(56, 139, 253, 0.15); color: #58a6ff; font-family: monospace;`
  - Context Lines: `color: var(--text-secondary, #a0aec0); font-family: monospace;`

### 4.2 Checkpoint Persistence to IndexedDB

To ensure zero data loss across browser reloads, checkpoints are serialized into IndexedDB.

#### Database Naming & Schema
- **Database Name**: `suna_harness_checkpoints_<uid>`
  - `<uid>` is dynamic: matches current logged-in user ID (`AuthState.user.uid`), guest UID (`getOrCreateGuestUid()`), or custom caller UID.
- **Version**: 1
- **Object Store**: `checkpoints`
  - **KeyPath**: `id` (string, e.g., `chk_step_4_1725713400000`)
  - **Indexes**:
    - `by_step`: `step_index` (integer)
    - `by_timestamp`: `timestamp` (string)
    - `by_harness`: `harness_id` (string)
    - `by_uid`: `uid` (string)

#### Serialized Checkpoint Payload
```typescript
interface PersistentCheckpointData {
  id: string;                         // Unique ID: `chk_step_${stepIndex}_${timestamp}`
  uid: string;                        // User ID partition
  harness_id: string;                 // Root or sub-harness ID
  step_index: number;
  timestamp: string;                  // ISO UTC
  vfs_snapshot: {
    files: Record<string, {
      content: string;
      size: number;
      lines: number;
      updatedAt: number;
    }>;
    directories: string[];
  };
  trajectory_tree: TrajectoryTreeNode[];
  facts: Array<{ fact: string; category: string; timestamp: number }>;
  metrics: {
    turnsCompleted: number;
    tokensConsumed: number;
    elapsedMs: number;
  };
  metadata?: Record<string, any>;
}
```

#### Persistence Operations API
```typescript
class CheckpointStore {
  static async initDB(uid: string): Promise<IDBDatabase>;
  static async saveCheckpoint(uid: string, checkpoint: PersistentCheckpointData): Promise<string>;
  static async getCheckpoint(uid: string, checkpointId: string): Promise<PersistentCheckpointData | null>;
  static async listCheckpoints(uid: string): Promise<Array<{ id: string; step_index: number; timestamp: string }>>;
  static async deleteCheckpoint(uid: string, checkpointId: string): Promise<boolean>;
  static async clearAllCheckpoints(uid: string): Promise<boolean>;
  
  // Export / Import
  static async exportCheckpointsAsJson(uid: string): Promise<string>;
  static async importCheckpointsFromJson(uid: string, jsonStr: string): Promise<number>;
}
```
*Graceful Fallback*: If IndexedDB is blocked or running under Node.js without `fake-indexeddb`, fallback to an in-memory Map or `localStorage` partition.

---

## 5. Formal Specification: R4 — Testing, Adversarial Fuzzing & Zero Regression

### 5.1 Expanded Test Matrix

| Domain | Target Requirements | Test Scope | Verification Assertion |
| :--- | :--- | :--- | :--- |
| **Sub-Harness Delegation** | R1 | Spawning child sub-harnesses in `share`, `clone`, and `branch` modes. | `share` reflects mutations in parent; `clone` is isolated; `branch` merges cleanly back to parent. |
| **Inter-Harness Event Bus** | R1 | Bidirectional message dispatch, directive execution, emergency stop. | Child receives directives; parent receives progress; stop halts child immediately. |
| **Trajectory Stitching** | R1 | Nesting child thoughts/actions into parent tree structure. | `getHierarchicalTree()` produces correct nested branches with proper depth tags. |
| **Unified Diff Patching** | R2 | Single file and multi-file snapshot diffs. | Headers match `--- a/... \n +++ b/...`, hunk numbers are 1-indexed, context lines exact. |
| **Vietnamese UTF-8 Diff** | R2 | Text with complex Vietnamese diacritics and composite Unicode. | Zero mojibake; diff hunks preserve exact characters and byte boundaries. |
| **AciSchemaValidator** | R2 | Schemas for all 6 ACI tools; valid vs invalid args. | Rejects missing required properties, negative line numbers, invalid enums, and ReDoS queries. |
| **UI Visualizer DOM** | R3 | Trajectory tree rendering, Scorecard KPI formulas, diff highlight DOM. | Visualizer creates DOM nodes, expands/collapses sub-trees, calculates exact $SR$, $\eta$, $FRR$. |
| **IndexedDB Persistence** | R3 | Serializing and restoring snapshots to `suna_harness_checkpoints_<uid>`. | Restore reproduces 100% of VFS files, directory tree, facts, and trajectory steps. |

### 5.2 Adversarial Fuzzing Scenarios

1. **Deep Sub-Harness Recursion ($\ge 5$ Levels)**:
   - Root harness spawns Child 1 $\to$ Child 2 $\to$ Child 3 $\to$ Child 4 $\to$ Child 5.
   - Enforces budget deduction down the hierarchy (e.g. parent budget $\ge$ child budget).
   - Verifies event propagation upwards without stack overflow (`Maximum call stack size exceeded`).
   - Trajectory tree nesting verified at `depth: 5`.
2. **Schema Injections & Prototype Pollution**:
   - Argument payloads containing `__proto__`, `constructor`, `prototype`, getter properties, and circular references.
   - Verifies validator rejects or strips prototype pollutions without modifying `Object.prototype`.
   - Huge string payloads (1MB single argument) tested for memory containment.
3. **Massive Diff Engine Stress Test (>10,000 Lines)**:
   - Comparing 10,000-line files with scattered additions, deletions, and modifications.
   - Execution time must stay strictly under 1,000ms.
   - Memory consumption must not exceed 50MB during diff computation.
   - Hunk indices must align 100% with standard Git diff.

### 5.3 Zero Regression Guarantees
- **All 982 existing Mocha tests** (`npm test`) must pass without a single failure.
- **Zero JavaScript syntax errors**: `npm run check` (`node -c app.js && node -c redesign.js && node -c suna_harness.js`) must exit with code 0.
- **Automated Verification**: `python run_verification.py` must complete 100% green.

---

## 6. Features Discovered

## Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Sub-Harness | `spawnSubHarness` | Spawns child sub-harness with role, budget, and workspace mode | `{ role, budget, vfsWorkspaceMode }` | `SubHarnessInstance` | Rejects missing role or invalid mode with `HarnessError` | `ORIGINAL_REQUEST.md` R1 |
| 2 | Sub-Harness | Shared VFS Mode | Child operates on identical parent VFS reference | File modifications in child | Instant mutation in parent VFS | Direct reference; no isolation | `ORIGINAL_REQUEST.md` R1 |
| 3 | Sub-Harness | Cloned VFS Mode | Child operates on isolated snapshot of parent VFS | File modifications in child | Isolated mutations; parent untouched | Clone memory boundary; no merge | `ORIGINAL_REQUEST.md` R1 |
| 4 | Sub-Harness | Branched VFS Mode | Child operates on branch fork with change tracking | File modifications in child | Branch changeset ledger | Requires explicit merge; detects conflicts | `ORIGINAL_REQUEST.md` R1 |
| 5 | Sub-Harness | `mergeBranchToParent` | Merges branched VFS changes back into parent workspace | `MergeBranchOptions` | `MergeResult` `{ success, mergedFiles, conflicts }` | Aborts on conflict if configured | `ORIGINAL_REQUEST.md` R1 |
| 6 | Event Bus | Bidirectional Message Passing | Structured envelope messaging between parent and sub-harnesses | `InterHarnessMessage` envelope | Event delivery to registered listeners | Drops unknown recipient; logs warning | `ORIGINAL_REQUEST.md` R1 |
| 7 | Event Bus | `emergencyStop` | Parent triggers immediate emergency stop of child sub-harness | `reason: string` | Child halted; status updated to `'halted'` | Stops execution immediately; emits halt event | `ORIGINAL_REQUEST.md` R1 |
| 8 | Event Bus | `progress` Heartbeat | Child reports progress, turn count, and token usage to parent | Progress payload | Parent progress event emitted | Non-blocking telemetry | `ORIGINAL_REQUEST.md` R1 |
| 9 | Trajectory | Hierarchical Tree Stitching | Attaches child event streams as children of parent spawn node | Child trajectory events | Nested `TrajectoryTreeNode` hierarchy | Preserves tree structure with depth indexing | `ORIGINAL_REQUEST.md` R1 |
| 10 | Diff Engine | Standard Unified Diff | Computes standard Git patch format with hunk headers | `filePath, oldText, newText` | `--- a/..\n+++ b/..\n@@ -l,s +l,s @@` string | Returns empty string if files identical | `ORIGINAL_REQUEST.md` R2 |
| 11 | Diff Engine | Snapshot Diffing | Compares two full VFS snapshots across all added/deleted/edited files | `snapshotA, snapshotB` | Multi-file unified diff patch | Handles `/dev/null` for created/deleted files | `ORIGINAL_REQUEST.md` R2 |
| 12 | Diff Engine | `previewReplaceDiff` | Previews unified diff before executing `replace_file_content` | `targetFile, targetContent, replacementContent` | `{ patch, wouldSucceed, reason }` | Reports `wouldSucceed: false` if target not found | `ORIGINAL_REQUEST.md` R2 |
| 13 | Diff Engine | Vietnamese UTF-8 Safety | Preserves Vietnamese diacritics and composite characters in diffs | Accented Vietnamese text | Clean diff string without byte slicing errors | Full Unicode multi-byte support | `ORIGINAL_REQUEST.md` R2 |
| 14 | Validator | `view_file` Schema | Validates path, bounds, and content offset | Tool args | `{ valid: true }` or `{ valid: false, errors }` | Rejects missing path or `startLine > endLine` | `ORIGINAL_REQUEST.md` R2 |
| 15 | Validator | `replace_file_content` Schema | Validates TargetFile, TargetContent, and line bounds | Tool args | `{ valid: true }` or `{ valid: false, errors }` | Rejects empty TargetContent or inverted bounds | `ORIGINAL_REQUEST.md` R2 |
| 16 | Validator | `grep_search` Schema & ReDoS | Validates Query and scans regex for ReDoS patterns | Tool args | `{ valid: true }` or `{ valid: false, errors }` | Rejects dangerous ReDoS patterns | `ORIGINAL_REQUEST.md` R2, `suna_harness.js` |
| 17 | Validator | `find_by_name` Schema | Validates Pattern, Type enum, and MaxDepth | Tool args | `{ valid: true }` or `{ valid: false, errors }` | Rejects invalid Type enum or negative depth | `ORIGINAL_REQUEST.md` R2 |
| 18 | Validator | `run_sandboxed_command` Schema | Validates CommandLine non-empty and TimeoutMs bounds | Tool args | `{ valid: true }` or `{ valid: false, errors }` | Rejects missing command or timeout > 60000ms | `ORIGINAL_REQUEST.md` R2 |
| 19 | UI Visualizer | DOM Trajectory Tree | Renders collapsible hierarchical event tree in browser DOM | `TrajectoryEngine` or JSON | Interactive DOM tree with status badges | Graceful fallback if container missing | `ORIGINAL_REQUEST.md` R3 |
| 20 | UI Visualizer | Benchmark Scorecard | Displays KPI cards ($SR$, $\eta$, $FRR$) and tier table | Scorecard metrics object | Rendered HTML/DOM scorecard | Formats percentages cleanly | `ORIGINAL_REQUEST.md` R3 |
| 21 | UI Visualizer | Interactive Diff Viewer | Displays unified or split diff with red/green syntax highlighting | Unified diff string | Rendered DOM diff element | Highlights added/deleted lines clearly | `ORIGINAL_REQUEST.md` R3 |
| 22 | Persistence | IndexedDB Checkpoints | Serializes snapshots to `suna_harness_checkpoints_<uid>` | Checkpoint object, `uid` | Saved record in IndexedDB store | Fallback to in-memory / localStorage | `ORIGINAL_REQUEST.md` R3 |
| 23 | Persistence | Checkpoint Restoration | Restores VFS, trajectory, and memory from IndexedDB record | `uid, checkpointId` | Restored VFS and memory state | Throws `CHECKPOINT_NOT_FOUND` if missing | `ORIGINAL_REQUEST.md` R3 |
| 24 | Testing | Deep Nesting Fuzzing | Tests sub-harness recursion depth $\ge 5$ | Recursive spawn calls | 5-level nested execution tree | Halts if depth exceeds safety threshold | `ORIGINAL_REQUEST.md` R4 |
| 25 | Testing | Schema Injection Fuzzing | Tests prototype pollution and malformed args against validator | `__proto__`, circular refs | Rejection with clean diagnostic | Protects runtime from prototype corruption | `ORIGINAL_REQUEST.md` R4 |
| 26 | Testing | 10k+ Line Diff Scaling | Computes diff on 10,000+ line files | Large file strings | Accurate patch within < 1000ms | Zero memory leaks | `ORIGINAL_REQUEST.md` R4 |

---

## 7. Edge Cases & Boundary Conditions

## Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Sub-Harness Spawning | Sub-harness spawned with 0 or negative turns/tokens budget | Rejects with `HarnessError('INVALID_BUDGET')` or clamps to safe minimum defaults (1 turn, 100 tokens). |
| 2 | Sub-Harness Recursion | Sub-harness tries to spawn recursively past depth 10 | Halts recursion with `HarnessError('MAX_RECURSION_DEPTH_EXCEEDED')` to prevent call-stack blowup. |
| 3 | Branched VFS Merge | Concurrent edit: Parent and branch both modified `config.json` with conflicting values | `mergeBranchToParent({ strategy: 'abort_on_conflict' })` aborts, returning conflict details without overwriting parent. |
| 4 | Event Bus | Message sent to a non-existent child sub-harness ID | Emits warning to console, does not throw unhandled exception, drops message safely. |
| 5 | Event Bus | Child sub-harness emits progress after parent has already called `emergencyStop()` | Message is ignored; child is in `'halted'` state and no further actions are processed. |
| 6 | Diff Engine | Comparing two files where the only difference is CRLF (`\r\n`) vs LF (`\n`) | Diff engine handles newline normalization option; identifies line endings cleanly. |
| 7 | Diff Engine | Diffing a completely empty file against another completely empty file | Returns empty string `""` without creating invalid hunk headers. |
| 8 | Diff Engine | File without trailing newline diffed against file with trailing newline | Appends `\ No newline at end of file` on the appropriate side per standard Git patch specification. |
| 9 | Diff Engine | File containing Vietnamese accents: `Tiếng Việt có dấu: ắ, ằ, ẳ, ẵ, ặ, ấ, ầ, ổ, ỡ, ự` | Exact UTF-8 code points preserved in hunk lines with zero multi-byte character fragmentation. |
| 10 | Diff Engine | Stress test: 12,000-line file with single-line modification at line 6,000 | Diff engine executes within < 300ms, producing single hunk `@@ -5997,7 +5997,7 @@` with 3 lines of context. |
| 11 | Schema Validator | Tool call with missing required parameter: `replace_file_content({ TargetFile: 'a.js' })` | Validator rejects before VFS call, returning `valid: false` with descriptive error for `TargetContent`. |
| 12 | Schema Validator | Cross-field error: `view_file({ path: 'a.js', startLine: 50, endLine: 20 })` | Validator rejects immediately with `startLine cannot be greater than endLine`. |
| 13 | Schema Validator | Malicious input: `grep_search({ Query: '(a+)+$', IsRegex: true })` | Detected as dangerous ReDoS pattern; rejected with `RedosWarning` before running regex search. |
| 14 | Schema Validator | Prototype pollution: `replace_file_content({ "__proto__": { "polluted": true }, "TargetFile": "a.js" })` | Validator checks own properties; `Object.prototype.polluted` remains `undefined`. |
| 15 | UI Visualizer | Trajectory tree with 500 events rendered in DOM | Uses virtual scrolling or collapsed accordion nodes to prevent DOM lag or browser freeze. |
| 16 | UI Visualizer | Benchmark scorecard with 0 total tasks | Handles division by zero gracefully, displaying `0.0%` for $SR$, $\eta$, and $FRR$ without `NaN%`. |
| 17 | Persistence | IndexedDB quota exceeded (`QuotaExceededError`) | Catches quota error, evicts oldest checkpoints in `by_timestamp` order, and retries write. |
| 18 | Persistence | Running in Node.js environment where `window.indexedDB` is undefined | Gracefully falls back to in-memory map or file store without throwing reference error. |
| 19 | Persistence | Restoring checkpoint from corrupted JSON string | Throws `HarnessError('CORRUPT_CHECKPOINT')` with clean error details, leaving current VFS intact. |

---

## 8. Implementation Blueprint & Recommended Milestones

To deliver these capabilities with zero regression and maximum architectural elegance, the following phased sequence is recommended:

```
+-------------------------------------------------------------------------------+
| PHASE 1: Core Engine Extensions (suna_harness.js)                             |
| - Implement VfsDiffEngine (LCS diff, Git patch format, UTF-8 safety)          |
| - Implement AciSchemaValidator (JSON Schema validation & ReDoS guard)        |
| - Implement InterHarnessEventBus & Sub-Harness Spawning (share/clone/branch)  |
| - Implement CheckpointStore (IndexedDB persistence with fallback)             |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| PHASE 2: UI Visualizer & Host Integration                                     |
| - Implement SunaHarnessVisualizer DOM component in suna_harness.js & app.js   |
| - Trajectory Tree rendering with hierarchy and badges                         |
| - Benchmark Scorecard rendering with exact formulas ($SR$, $\eta$, $FRR$)     |
| - Diff Viewer with unified / split modes and syntax highlighting              |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| PHASE 3: Comprehensive Test Suite & Adversarial Fuzzing                       |
| - Expand tests/test_suna_harness.js covering R1 - R4                          |
| - Add Deep Nesting fuzz tests (depth >= 5)                                    |
| - Add Prototype Pollution & Schema Injection fuzz tests                       |
| - Add 10,000+ line diff performance benchmark                                 |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| PHASE 4: Verification & Zero Regression Audit                                 |
| - Validate node -c app.js && node -c redesign.js && node -c suna_harness.js   |
| - Validate all 982 existing tests + new tests pass (npm test)                 |
| - Execute python run_verification.py -> 100% GREEN                            |
+-------------------------------------------------------------------------------+
```

---

*Report authored and certified by `spec_miner_survey_2` for Suna Agent Harness Core Team.*
