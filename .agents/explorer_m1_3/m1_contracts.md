# Milestone 1 Worker Specification & Definitive Contract Checklist
## Multi-Agent Sub-harness Delegation, 3-Way Branch Conflict Resolution & Defensive Edge Cases (R1)

**Document Version:** 1.0.0  
**Author:** `explorer_m1_3` (Specification Mining & Contract Specialist)  
**Target Codebase:** `suna_harness.js` (Universal Module Definition)  
**Test Suite:** `tests/test_suna_harness.js`  
**Parent Milestone:** M1 (Sub-harness Delegation & Event Bus — R1)  
**Verification Target:** 100% pass on 982+ tests, `node -c` clean, `run_verification.py` green.

---

## 1. Architectural Scope & Objectives

In modern agent harnesses (SWE-agent, OpenHands, LangGraph), monolithic single-agent loops fail when complex tasks require specialized sub-tasks (e.g. exploratory research, isolated code refactoring, independent test generation).

Milestone 1 introduces **Multi-Agent Sub-harness Delegation** into `SunaHarness`. This document establishes the definitive contractual specification for:
1. **`mergeSubHarness(childId, options)`** and **3-Way VFS Branch Conflict Resolution**:
   - Reconciling branched sub-harness workspace mutations back into the parent workspace.
   - Formal classification of all conflict scenarios across Base ($B$), Parent ($P$), and Child ($C$).
   - Operational strategies: `'safe'` (deterministic abort/throw on conflict) vs `'force'` (overwrite with conflict tracking).
2. **Defensive Guards & Edge Cases**:
   - Recursion depth limit enforcing $\text{depth} \le 4$ (spawning at $\text{depth} \ge 5$ is rejected).
   - Lineage cycle detection preventing circular delegation or parent re-entry.
   - Hierarchical budget exhaustion (turn caps, token ceilings, timeout cascade, upstream debiting).
   - Cascading emergency halt and VFS cleanup across active sub-trees.
3. **Definitive M1 Worker Checklist**:
   - Concrete, step-by-step implementation guide for `worker_1` / `worker_m1_1`.

---

## 2. Sub-harness Lifecycle & State Machine

```
                      +-------------------+
                      |   [Uninitialized] |
                      +---------+---------+
                                | spawnSubHarness()
                                v
                      +-------------------+
                      |   'initialized'   |
                      +---------+---------+
                                | executeAction() / start()
                                v
                      +-------------------+ <-------+
                      |     'running'     |         | resume()
                      +----+-----+----+---+         |
         pause()           |     |    |             |
     +---------------------+     |    +-------------+
     |                           |    |   'paused'  |
     v                           |    +-------------+
+---------+                      |
|'paused' |                      |
+---------+                      v
         budget exhausted / error | task complete
    +-----------------------------+-----------------------------+
    |                                                           |
    v                                                           v
+-------------------+                                   +-------------------+
|     'failed'      |                                   |    'completed'    |
+---------+---------+                                   +---------+---------+
          |                                                       |
          | emergencyStop()                                       | mergeSubHarness()
          v                                                       v
+-------------------+                                   +-------------------+
|     'halted'      |                                   |     'merged'      |
+-------------------+                                   +-------------------+
```

### 2.1 SubHarness Context Descriptor
Each active sub-harness managed by `HarnessController` possesses a registered descriptor stored in `this._children: Map<string, SubHarnessDescriptor>`:

```typescript
interface SubHarnessDescriptor {
  id: string;                                   // e.g. "subharness_coder_1725713400_abc1"
  role: string;                                 // e.g. "coder", "reviewer", "explorer", "tester"
  parentId: string;                             // ID of direct parent controller/harness
  depth: number;                                // 0 for root, 1 for child, 2 for grandchild...
  lineage: string[];                            // [rootId, childId, ...] ancestry chain
  status: 'initialized' | 'running' | 'paused' | 'completed' | 'failed' | 'halted' | 'merged';
  vfsWorkspaceMode: 'share' | 'clone' | 'branch';
  originSnapshot: VfsSnapshot | null;           // Captured at spawn time if mode === 'branch'
  harness: SunaHarnessInstance;                 // Child harness instance { vfs, controller, aci, trajectory... }
  budget: {
    maxTurns: number;
    maxTokens: number;
    timeoutMs: number;
  };
  allocatedBudget: {
    maxTurns: number;
    maxTokens: number;
    timeoutMs: number;
  };
  startTime: number;
  endTime: number | null;
  isMerged: boolean;
  metadata: Record<string, any>;
}
```

---

## 3. Formal Specification: `mergeSubHarness(childId, options)`

### 3.1 Method Signatures
The merge operation must be accessible both on the `HarnessController` instance and as a convenient delegation method on the top-level harness facade returned by `createHarness()`:

```javascript
// On HarnessController
controller.mergeSubHarness(childIdOrInstance, options = {});

// On Harness Facade
harness.mergeSubHarness(childIdOrInstance, options = {});
```

### 3.2 Input Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `childIdOrInstance` | `string` \| `object` | **Required** | The unique string identifier of the child sub-harness (or the child harness instance object possessing an `.id` or `._descriptor.id`). |
| `options.strategy` | `'safe'` \| `'force'` | `'safe'` | Merge conflict handling strategy:<br>• `'safe'`: Aborts immediately if any conflict is detected. Throws `HarnessError('BRANCH_CONFLICT')` unless `throwOnConflict` is `false`.<br>• `'force'`: Overwrites conflicting parent files with child branch versions while recording all overwritten conflicts in the result. |
| `options.throwOnConflict` | `boolean` | `true` | If `true` and `strategy === 'safe'`, throws a `HarnessError` when conflicts exist. If `false`, aborts merge and returns `{ success: false, conflicts, ... }`. |
| `options.autoCommit` | `boolean` | `true` | When `true`, automatically applies mutations directly to `parent.vfs`. When `false`, performs a dry-run calculation returning the diff and changeset without mutating parent VFS. |
| `options.recordTrajectory` | `boolean` | `true` | When `true`, logs a structured step event of action `merge_subharness` to `parent.trajectory`. |

---

### 3.3 Pre-condition Validation & Error Handling

Before computing differences, `mergeSubHarness` executes the following deterministic checks:

1. **Existence Check**:
   - Lookup child descriptor in `parent._children.get(childId)`.
   - If missing:
     ```javascript
     throw new HarnessError('SUB_HARNESS_NOT_FOUND', `Sub-harness with ID "${childId}" was not found on this controller.`, { childId });
     ```

2. **VFS Mode Compatibility Check**:
   - If `descriptor.vfsWorkspaceMode !== 'branch'`:
     ```javascript
     if (descriptor.vfsWorkspaceMode === 'share') {
       throw new HarnessError('INVALID_VFS_MODE', `Cannot merge sub-harness "${childId}" with vfsWorkspaceMode "share": mutations are already active in the shared VFS.`, { childId, mode: 'share' });
     }
     if (descriptor.vfsWorkspaceMode === 'clone') {
       throw new HarnessError('INVALID_VFS_MODE', `Cannot merge sub-harness "${childId}" with vfsWorkspaceMode "clone": clone mode is strictly isolated scratchpad with no merge capability.`, { childId, mode: 'clone' });
     }
     ```

3. **Origin Snapshot Verification**:
   - If `!descriptor.originSnapshot`:
     ```javascript
     throw new HarnessError('MISSING_ORIGIN_SNAPSHOT', `Sub-harness "${childId}" lacks a valid branch origin snapshot for 3-way reconciliation.`, { childId });
     ```

4. **Already-Merged Check**:
   - If `descriptor.isMerged === true` and `!options.force`:
     ```javascript
     throw new HarnessError('ALREADY_MERGED', `Sub-harness "${childId}" has already been merged into parent VFS.`, { childId });
     ```

---

### 3.4 Three-Way VFS Branch Conflict Detection Algorithm

Let:
- $\mathcal{S}_{\text{base}}$ be the branch origin snapshot: `descriptor.originSnapshot`.
- $\mathcal{S}_{\text{parent}}$ be the parent's current VFS state: `parent.vfs.createSnapshot()`.
- $\mathcal{S}_{\text{child}}$ be the child's current VFS state: `child.vfs.createSnapshot()`.

Define the universe of normalized file paths:
$$\mathcal{U} = \text{keys}(\mathcal{S}_{\text{base}}.\text{files}) \cup \text{keys}(\mathcal{S}_{\text{parent}}.\text{files}) \cup \text{keys}(\mathcal{S}_{\text{child}}.\text{files})$$

For each path $p \in \mathcal{U}$, retrieve node representations:
- $B = \mathcal{S}_{\text{base}}.\text{files}[p]$ (or `null` if file did not exist at branch creation)
- $P = \mathcal{S}_{\text{parent}}.\text{files}[p]$ (or `null` if file does not exist in parent)
- $C = \mathcal{S}_{\text{child}}.\text{files}[p]$ (or `null` if file does not exist in child)

#### 3.4.1 State Decision Matrix

| $B$ (Base) | $P$ (Parent) | $C$ (Child) | Relationship Condition | Classification | Merge Action (Clean / Safe) | Conflict Flag |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Exists | Exists | Exists | $C.\text{content} == B.\text{content}$ | Child unchanged | Keep $P$ unchanged | None |
| Exists | Deleted | Exists | $C.\text{content} == B.\text{content}$ | Child unchanged; Parent deleted | Keep deleted | None |
| Exists | Exists | Deleted | $P.\text{content} == B.\text{content}$ | Child deleted; Parent unchanged | Delete file in Parent | None (`deleted`) |
| Exists | Exists | Exists | $P.\text{content} == B.\text{content} \land C.\text{content} \neq B.\text{content}$ | Child modified; Parent unchanged | Update Parent ($P \leftarrow C$) | None (`modified`) |
| None | None | Exists | New in child only | Child added | Add to Parent ($P \leftarrow C$) | None (`added`) |
| None | Exists | Exists | $P.\text{content} == C.\text{content}$ | Both added identical content | Keep identical content | None (`added`) |
| Exists | Exists | Exists | $P.\text{content} == C.\text{content}$ | Both modified to same content | Keep identical content | None (`modified`) |
| Exists | Deleted | Deleted | Both deleted | Both deleted file | Keep deleted | None |
| **Exists** | **Exists** | **Exists** | $C.\text{content} \neq B.\text{content} \land P.\text{content} \neq B.\text{content} \land C.\text{content} \neq P.\text{content}$ | **Both modified with conflicting content** | **ABORT** in `'safe'` mode | **`modify_modify_conflict`** |
| **Exists** | **Deleted** | **Exists** | $C.\text{content} \neq B.\text{content} \land P = \text{null}$ | **Child modified, Parent deleted** | **ABORT** in `'safe'` mode | **`modify_delete_conflict`** |
| **Exists** | **Exists** | **Deleted** | $C = \text{null} \land P.\text{content} \neq B.\text{content}$ | **Child deleted, Parent modified** | **ABORT** in `'safe'` mode | **`delete_modify_conflict`** |
| **None** | **Exists** | **Exists** | $B = \text{null} \land P.\text{content} \neq C.\text{content}$ | **Both added file with different content** | **ABORT** in `'safe'` mode | **`add_add_conflict`** |

---

### 3.5 Conflict Descriptor Schema

When a conflict is detected, a structured object is appended to `conflicts`:

```typescript
interface BranchConflict {
  path: string;
  type: 'modify_modify_conflict' | 'modify_delete_conflict' | 'delete_modify_conflict' | 'add_add_conflict';
  reason: string;
  base: {
    exists: boolean;
    content: string | null;
    version?: number;
    updatedAt?: number;
  };
  parent: {
    exists: boolean;
    content: string | null;
    version?: number;
    updatedAt?: number;
  };
  child: {
    exists: boolean;
    content: string | null;
    version?: number;
    updatedAt?: number;
  };
}
```

---

### 3.6 Strategy Resolution Semantics

#### Mode 1: `'safe'` Strategy (Default)
1. If `conflicts.length > 0`:
   - **Parent VFS remains 100% untouched** (atomic abort).
   - If `options.throwOnConflict !== false`:
     ```javascript
     throw new HarnessError(
       'BRANCH_CONFLICT',
       `Merge aborted due to ${conflicts.length} conflict(s): ${conflicts.map(c => c.path).join(', ')}.`,
       { childId, conflicts, count: conflicts.length }
     );
     ```
   - If `options.throwOnConflict === false`:
     Returns `{ success: false, childId, strategy: 'safe', conflicts, filesMerged: [], added: [], modified: [], deleted: [] }`.

#### Mode 2: `'force'` Strategy
1. Even if `conflicts.length > 0`:
   - Child branch mutations overwrite parent state for all conflicting files.
   - All conflicts are tracked in `result.conflicts` for auditing.
   - Applies:
     - `added`: `parent.vfs.writeFile(path, child.content)`
     - `modified`: `parent.vfs.writeFile(path, child.content)`
     - `deleted`: `parent.vfs.removeFile(path)`
     - `directories`: `parent.vfs.directories.add(dir)`

---

### 3.7 Output Schema: `MergeResult`

```typescript
interface MergeResult {
  success: boolean;
  childId: string;
  role: string;
  strategy: 'safe' | 'force';
  dryRun: boolean;
  filesMerged: string[];       // Union of added + modified + deleted applied paths
  added: string[];             // Paths newly created in parent
  modified: string[];          // Paths updated in parent
  deleted: string[];           // Paths removed from parent
  conflicts: BranchConflict[]; // Array of detected conflicts
  stats: {
    totalEvaluated: number;
    addedCount: number;
    modifiedCount: number;
    deletedCount: number;
    conflictCount: number;
  };
  trajectoryEvent?: any;
}
```

### 3.8 Post-Merge Side Effects & Event Dispatch

Upon successful merge (when `options.autoCommit !== false`):
1. **Mark Child Descriptor**:
   `descriptor.isMerged = true;`
   `descriptor.status = 'merged';`
2. **Event Bus Dispatch**:
   If an `InterHarnessEventBus` is active on parent:
   ```javascript
   bus.send({
     from: parent.id,
     to: '*',
     type: 'result',
     payload: {
       event: 'subharness_merged',
       childId,
       role: descriptor.role,
       filesMerged: result.filesMerged,
       stats: result.stats
     }
   });
   ```
3. **Trajectory Recording**:
   If `options.recordTrajectory !== false` and `parent.trajectory`:
   ```javascript
   parent.trajectory.recordStep({
     thought: `Merged branch changes from sub-harness [${descriptor.role}:${childId}] into parent workspace.`,
     action: {
       tool: 'merge_subharness',
       params: { childId, strategy: options.strategy || 'safe', filesMerged: result.filesMerged }
     },
     observation: {
       status: 'success',
       result: { filesMerged: result.filesMerged, stats: result.stats }
     },
     metrics: { durationMs: Date.now() - mergeStartTime, tokensConsumed: 0 },
     status: 'success'
   });
   ```

---

## 4. Formal Specification: Edge Cases & Defensive Guards

### 4.1 Edge Case 1: Recursion Depth Guard ($\text{depth} \ge 5$)

#### Invariant
- Root Harness: `depth = 0`.
- 1st Level Child: `depth = 1`.
- 2nd Level Child: `depth = 2`.
- 3rd Level Child: `depth = 3`.
- 4th Level Child: `depth = 4`.
- Maximum allowable sub-harness execution depth is **4**. Any attempt to spawn at `currentDepth >= 5` is strictly forbidden.

#### Guard Implementation in `spawnSubHarness`
```javascript
const currentDepth = this.depth !== undefined ? this.depth : 0;
const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 5;

if (currentDepth >= maxDepth) {
  throw new HarnessError(
    'MAX_RECURSION_DEPTH_EXCEEDED',
    `Sub-harness recursion depth limit (${maxDepth}) reached. Current depth is ${currentDepth}; cannot spawn further nested sub-harnesses.`,
    { currentDepth, maxDepth, role: options.role }
  );
}

const childDepth = currentDepth + 1;
```

#### Verification Requirement
1. Spawning up to `depth: 4` succeeds cleanly.
2. At `depth: 5`, calling `spawnSubHarness(...)` throws `HarnessError` with `.code === 'MAX_RECURSION_DEPTH_EXCEEDED'`.
3. Ensures zero possibility of call-stack overflow or runaway fork-bombing.

---

### 4.2 Edge Case 2: Cycle Detection & Lineage Tracking

#### Invariant
The harness delegation hierarchy must be a strictly **Directed Acyclic Graph (DAG) / Rooted Tree**. A child sub-harness must never delegate back to any ancestor in its lineage.

#### Ancestry Lineage Tracking
Each harness controller maintains its immutable ancestry lineage list:
```javascript
// On Root Harness
this.id = options.id || `harness_root_${Date.now()}`;
this.lineage = [];

// On Child Sub-harness spawned by parent
this.id = options.id || `subharness_${options.role}_${Date.now()}_${rand}`;
this.lineage = Object.freeze([...parent.lineage, parent.id]);
```

#### Cycle Guard
When delegating, routing a directive, or spawning:
```javascript
function assertNoCycle(targetId, lineage, sourceId) {
  if (targetId === sourceId) {
    throw new HarnessError(
      'DELEGATION_CYCLE_DETECTED',
      `Self-delegation detected: harness "${sourceId}" cannot delegate to itself.`,
      { sourceId, targetId, lineage }
    );
  }
  if (lineage.includes(targetId)) {
    throw new HarnessError(
      'DELEGATION_CYCLE_DETECTED',
      `Circular delegation detected: target "${targetId}" is an ancestor in lineage [${lineage.join(' -> ')}].`,
      { sourceId, targetId, lineage }
    );
  }
}
```

---

### 4.3 Edge Case 3: Hierarchical Budget Exhaustion Handling

#### Budget Constraints
A sub-harness is governed by three resource boundaries:
1. Turn budget: `budget.maxTurns` (default: 10).
2. Token budget: `budget.maxTokens` (default: 25,000).
3. Timeout: `budget.timeoutMs` (default: 30,000ms).

#### Allocation Constraints (Parent Ceiling Clamping)
A parent cannot grant resources it does not have:
```javascript
const remainingParentTurns = Math.max(0, this.maxTurns - this.turnsCompleted);
const remainingParentTokens = Math.max(0, this.maxTokens - this.tokensConsumed);
const remainingParentTimeout = Math.max(1000, this.timeoutMs - (Date.now() - this.startTime));

if (remainingParentTurns <= 0) {
  throw new HarnessError('BUDGET_EXHAUSTED', 'Parent turn budget is already exhausted; cannot spawn sub-harness.', { remainingParentTurns });
}
if (remainingParentTokens <= 0) {
  throw new HarnessError('BUDGET_EXHAUSTED', 'Parent token ceiling is already reached; cannot spawn sub-harness.', { remainingParentTokens });
}

const childMaxTurns = Math.min(requestedBudget.maxTurns || 10, remainingParentTurns);
const childMaxTokens = Math.min(requestedBudget.maxTokens || 25000, remainingParentTokens);
const childTimeoutMs = Math.min(requestedBudget.timeoutMs || 30000, remainingParentTimeout);
```

#### Upstream Token Debiting Protocol
When a child executes an action and consumes tokens:
1. Child increments `child.controller.tokensConsumed += deltaTokens`.
2. Child debits parent controller:
   ```javascript
   // Real-time upstream charge
   parent.controller.tokensConsumed += deltaTokens;
   ```
3. If parent's `tokensConsumed >= parent.maxTokens`:
   - Parent enters halted state (`haltReason = 'MAX_TOKENS_EXCEEDED'`).
   - Parent triggers `emergencyStopSubHarness(child.id, 'PARENT_MAX_TOKENS_EXCEEDED')`.
   - Child halts immediately.

#### Child Local Budget Exhaustion
- If child hits `child.turnsCompleted >= child.maxTurns`:
  - Child controller halts with `MAX_TURNS_EXCEEDED`.
  - Child status transitions to `'failed'`.
  - Emits `'failed'` envelope on EventBus.
  - Parent trajectory records child step failure with reason `'MAX_TURNS_EXCEEDED'`.

---

### 4.4 Edge Case 4: Cascading Emergency Stop & Cleanup

#### Method Signature
```javascript
// On HarnessController
controller.emergencyStopSubHarness(childIdOrNull, reason = 'EMERGENCY_STOP_BY_PARENT');

// On Top-Level Facade
harness.emergencyStopSubHarness(childIdOrNull, reason = 'EMERGENCY_STOP_BY_PARENT');
```

#### Operational Mechanics
1. **Target Resolution**:
   - If `childId` is provided: stop that specific child and all its nested descendants.
   - If `childId` is `null` or `'*'`: stop **ALL** active children registered on this controller.

2. **Recursive Descendant Halting**:
   ```javascript
   function haltSubTree(childDescriptor, haltReason) {
     const childController = childDescriptor.harness.controller;
     
     // Recursively stop any grandchildren spawned by this child
     if (childController._children && childController._children.size > 0) {
       for (const grandchildDesc of childController._children.values()) {
         haltSubTree(grandchildDesc, haltReason);
       }
     }
     
     // Halt child controller
     childController.halt(haltReason, { haltedAt: Date.now() });
     childDescriptor.status = 'halted';
     childDescriptor.endTime = Date.now();
   }
   ```

3. **Event Bus Broadcast**:
   ```javascript
   bus.send({
     from: this.id,
     to: childId || '*',
     type: 'emergency_stop',
     payload: { reason, timestamp: Date.now() }
   });
   ```

4. **VFS Sandbox Isolation Guarantee**:
   - For sub-harnesses in `'branch'` mode, halting leaves parent VFS untouched. Unmerged branch mutations remain isolated in the child VFS.
   - In-flight write operations are rejected because `canExecute()` returns `{ allowed: false, code: 'HALTED' }`.

5. **Trajectory Recording**:
   Parent logs step event:
   ```javascript
   parent.trajectory.recordStep({
     thought: `Emergency stop initiated for sub-harness [${childId}] due to: ${reason}`,
     action: { tool: 'emergency_stop', params: { childId, reason } },
     observation: { status: 'error', error: reason },
     status: 'error'
   });
   ```

---

## 5. Specification Mining Tables

## Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Sub-Harness | `spawnSubHarness` | Spawns child sub-harness with role, budget, and workspace mode | `{ role, budget, vfsWorkspaceMode, id, metadata }` | `SubHarnessInstance` | Rejects invalid modes or budgets with `HarnessError` | `ORIGINAL_REQUEST.md` R1 |
| 2 | Sub-Harness | VFS Share Mode | Sub-harness operates directly on parent VFS reference | Tool mutations | Instant mutations in parent VFS | Throws `INVALID_VFS_MODE` if `mergeSubHarness` attempted | `ORIGINAL_REQUEST.md` R1 |
| 3 | Sub-Harness | VFS Clone Mode | Sub-harness operates on isolated snapshot clone | Tool mutations | Isolated mutations; parent untouched | Throws `INVALID_VFS_MODE` if `mergeSubHarness` attempted | `ORIGINAL_REQUEST.md` R1 |
| 4 | Sub-Harness | VFS Branch Mode | Sub-harness operates on branch with change tracking | Tool mutations | Staged branch mutations ready for merge | Tracked for 3-way reconciliation | `ORIGINAL_REQUEST.md` R1 |
| 5 | Sub-Harness | `mergeSubHarness` | Reconciles branch changes to parent VFS with conflict detection | `childId, { strategy, throwOnConflict, autoCommit }` | `MergeResult` | Throws `BRANCH_CONFLICT` in safe mode if conflict exists | `ORIGINAL_REQUEST.md` R1 |
| 6 | Sub-Harness | Conflict Classification | 3-way analysis into 4 distinct conflict types | Base, Parent, Child snapshots | Array of `BranchConflict` objects | Categorizes modify/modify, modify/delete, delete/modify, add/add | `ORIGINAL_REQUEST.md` R1 |
| 7 | Sub-Harness | Strategy `'safe'` | Aborts merge without mutating parent VFS on conflict | Merge options | Error or `{ success: false, conflicts }` | Leaves Parent VFS 100% pristine | `ORIGINAL_REQUEST.md` R1 |
| 8 | Sub-Harness | Strategy `'force'` | Overwrites conflicting files while logging conflict details | Merge options | `{ success: true, filesMerged, conflicts }` | Applies child files regardless of parent edits | `ORIGINAL_REQUEST.md` R1 |
| 9 | Edge Guard | Recursion Depth Guard | Halts nesting when depth reaches or exceeds 5 | `spawnSubHarness` call | New sub-harness or rejection | Throws `MAX_RECURSION_DEPTH_EXCEEDED` at `depth >= 5` | `ORIGINAL_REQUEST.md` R4 |
| 10 | Edge Guard | Cycle Detection | Prevents delegation back to any ancestor in lineage | `targetId, lineage` | Validation pass or error | Throws `DELEGATION_CYCLE_DETECTED` if cycle found | `ORIGINAL_REQUEST.md` R1 |
| 11 | Budget | Hierarchical Allocation | Clamps child budget to remaining parent resources | `budget: { maxTurns, maxTokens, timeoutMs }` | Clamped child budget | Throws `BUDGET_EXHAUSTED` if parent remaining $\le 0$ | `ORIGINAL_REQUEST.md` R1 |
| 12 | Budget | Upstream Debiting | Real-time forwarding of child token usage to parent | Consumed tokens | Parent `tokensConsumed` incremented | Parent halts child if aggregate budget exceeded | `ORIGINAL_REQUEST.md` R1 |
| 13 | Emergency | `emergencyStopSubHarness` | Halts specific child or all active children | `childId, reason` | Children transitioned to `'halted'` | Freezes execution; protects VFS isolation | `ORIGINAL_REQUEST.md` R1 |
| 14 | Emergency | Cascading Descendant Halt | Recursively halts all grandchildren and active timers | Child descriptor | All descendants halted | Prevents orphaned background loops | `ORIGINAL_REQUEST.md` R1 |

## Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `mergeSubHarness` | Both Parent and Child modified `server.js` with conflicting text | In `'safe'` mode, aborts merge, leaves parent VFS untouched, throws `HarnessError('BRANCH_CONFLICT')` containing both versions. |
| 2 | `mergeSubHarness` | Child modified `app.js` but Parent deleted `app.js` | Identified as `modify_delete_conflict`; aborts in safe mode without recreating file in parent. |
| 3 | `mergeSubHarness` | Child deleted `config.json` but Parent modified `config.json` | Identified as `delete_modify_conflict`; aborts in safe mode without deleting parent file. |
| 4 | `mergeSubHarness` | Both Parent and Child created `utils.js` with identical content | Clean 3-way merge; added to parent without conflict. |
| 5 | `mergeSubHarness` | Both Parent and Child created `utils.js` with different content | Identified as `add_add_conflict`; aborts in safe mode. |
| 6 | `mergeSubHarness` | Called with invalid child ID `sub_unknown` | Throws `HarnessError('SUB_HARNESS_NOT_FOUND')`. |
| 7 | `mergeSubHarness` | Called on sub-harness with `vfsWorkspaceMode: 'share'` | Throws `HarnessError('INVALID_VFS_MODE')` (already shared). |
| 8 | `mergeSubHarness` | Called on sub-harness with `vfsWorkspaceMode: 'clone'` | Throws `HarnessError('INVALID_VFS_MODE')` (scratchpad isolation). |
| 9 | `mergeSubHarness` | Duplicate call after successful merge | Throws `HarnessError('ALREADY_MERGED')` unless `options.force` is specified. |
| 10 | Recursion Guard | Root (0) -> Child (1) -> Grandchild (2) -> Great-Grandchild (3) -> Great-Great-Grandchild (4) -> Attempt 5th Spawn | 5th spawn attempt rejected with `HarnessError('MAX_RECURSION_DEPTH_EXCEEDED')`. |
| 11 | Cycle Guard | Child 2 attempts to spawn or delegate back to Root or Child 1 | Lineage verification detects cycle; throws `HarnessError('DELEGATION_CYCLE_DETECTED')`. |
| 12 | Budget Exhaustion | Parent has 2 turns remaining; child requests 10 turns | Child budget clamped to 2 turns; execution bounded. |
| 13 | Budget Exhaustion | Parent has 0 turns remaining; attempt to spawn child | Throws `HarnessError('BUDGET_EXHAUSTED')`. |
| 14 | Upstream Debiting | Child consumes 15,000 tokens causing parent total to exceed `parent.maxTokens` | Parent immediately triggers `emergencyStop` on child and halts itself with `MAX_TOKENS_EXCEEDED`. |
| 15 | Emergency Stop | Parent calls `emergencyStopSubHarness()` while child is mid-action | Child controller marked halted; subsequent action calls return `{ allowed: false, code: 'HALTED' }`; branch mutations isolated. |

---

## 6. Definitive M1 Worker Implementation Checklist

The M1 Worker (`worker_1` / `worker_m1_1`) MUST implement the following components and behaviors in `d:\Suna Chat\suna_harness.js` and verify them in `tests/test_suna_harness.js`:

### 6.1 `HarnessController` Enhancements
- [ ] Add sub-harness registry: `this._children = new Map()` in `constructor`.
- [ ] Add recursion depth property: `this.depth = options.depth || 0`.
- [ ] Add lineage ancestry array: `this.lineage = options.lineage || []`.
- [ ] Implement `spawnSubHarness(options)`:
  - [ ] Validate `this.depth < 5`; throw `MAX_RECURSION_DEPTH_EXCEEDED` otherwise.
  - [ ] Validate and clamp `options.budget` against remaining parent turns, tokens, and timeout.
  - [ ] Handle `vfsWorkspaceMode`:
    - `'share'`: `childVfs = this.vfs`.
    - `'clone'`: `childVfs = new VfsSandbox(); childVfs.restoreSnapshot(this.vfs.createSnapshot())`.
    - `'branch'`: `childVfs = new VfsSandbox(); const origin = this.vfs.createSnapshot(); childVfs.restoreSnapshot(origin); descriptor.originSnapshot = origin`.
  - [ ] Store descriptor in `this._children.set(childId, descriptor)`.
  - [ ] Wire token debiting listener so child consumption updates parent `tokensConsumed`.
- [ ] Implement `mergeSubHarness(childIdOrInstance, options)`:
  - [ ] Validate child existence (`SUB_HARNESS_NOT_FOUND`).
  - [ ] Validate `vfsWorkspaceMode === 'branch'` (`INVALID_VFS_MODE`).
  - [ ] Execute 3-way diff between `descriptor.originSnapshot`, `this.vfs`, and `child.vfs`.
  - [ ] Detect all 4 conflict types: `modify_modify_conflict`, `modify_delete_conflict`, `delete_modify_conflict`, `add_add_conflict`.
  - [ ] Implement `'safe'` strategy: if conflicts exist, abort without mutating parent VFS; throw `BRANCH_CONFLICT` (or return `{ success: false }` if `throwOnConflict === false`).
  - [ ] Implement `'force'` strategy: overwrite parent files with child versions, recording conflicts in `result.conflicts`.
  - [ ] Mark `descriptor.isMerged = true` and update `status = 'merged'`.
  - [ ] Log merge event to `parent.trajectory` and emit `'subharness_merged'` on event bus.
- [ ] Implement `emergencyStopSubHarness(childIdOrNull, reason)`:
  - [ ] Recursively halt specified child (or all children if null) and their descendants.
  - [ ] Freeze execution and set `status = 'halted'`.
  - [ ] Broadcast `'emergency_stop'` event envelope on event bus.

### 6.2 Top-Level Facade (`createHarness()`) Delegation
- [ ] Forward `spawnSubHarness(...)` from harness object to `controller.spawnSubHarness(...)`.
- [ ] Forward `mergeSubHarness(...)` from harness object to `controller.mergeSubHarness(...)`.
- [ ] Forward `emergencyStopSubHarness(...)` from harness object to `controller.emergencyStopSubHarness(...)`.

### 6.3 Verification Tests to Add in `tests/test_suna_harness.js`
- [ ] Unit tests for `spawnSubHarness` with `'share'`, `'clone'`, and `'branch'` modes.
- [ ] Unit tests for `mergeSubHarness`:
  - [ ] Clean addition, modification, and deletion merge.
  - [ ] Conflict detection under `'safe'` mode (throws `BRANCH_CONFLICT`).
  - [ ] Overwrite under `'force'` mode with conflict tracking.
- [ ] Unit test for recursion depth guard: verify 5th nesting level throws `MAX_RECURSION_DEPTH_EXCEEDED`.
- [ ] Unit test for budget exhaustion propagation and upstream token deduction.
- [ ] Unit test for `emergencyStopSubHarness` halting active children and freezing isolated branch mutations.
- [ ] Full regression check: 100% of existing 982 tests must pass, `node -c` clean.

---
*Report certified by `explorer_m1_3` for Milestone 1 Worker Implementation.*
