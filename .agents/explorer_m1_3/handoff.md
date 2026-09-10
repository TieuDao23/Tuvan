# Milestone 1 Specification Miner 3 Handoff Report
## Formal Contracts: `mergeSubHarness`, 3-Way VFS Conflict Resolution & Defensive Edge Guards

**Document ID:** SUNA-M1-CONTRACTS-01  
**Author:** `explorer_m1_3` (Specification Mining & Contract Specialist)  
**Parent Agent:** `orchestrator_1` (`parent`, ID: `54f8a5c6-f5e1-47fc-bcb2-f13faec46da4`)  
**Working Directory:** `d:\Suna Chat\.agents\explorer_m1_3`  
**Primary Output Artifact:** `d:\Suna Chat\.agents\explorer_m1_3\m1_contracts.md`  
**Verification Target:** Zero regression across all 982 tests (`npm test`), 0 syntax errors (`node -c`), green `run_verification.py`.

---

## 1. Observation

### 1.1 Examination of `suna_harness.js`
- **File Path**: `d:\Suna Chat\suna_harness.js` (3,259 lines, UMD format).
- **VFS Snapshot Mechanics** (Lines 797–837):
  ```javascript
  createSnapshot() {
    const snap = {
      files: {},
      directories: Array.from(this.directories)
    };
    for (const [p, n] of this.files.entries()) {
      snap.files[p] = {
        name: n.name, path: n.path, content: n.content,
        size: n.size, sizeBytes: n.size, lines: n.lines,
        createdAt: n.createdAt, updatedAt: n.updatedAt,
        version: n.version, locked: n.locked, readOnly: n.readOnly
      };
    }
    return snap;
  }
  ```
  *Observation*: `createSnapshot()` creates an in-memory dictionary of file nodes keyed by normalized path and an array of directories. `restoreSnapshot()` restores this state. Neither `branch()` nor any changeset tracking ledger exists currently in `VfsSandbox`.
- **Harness Governance Architecture** (Lines 1552–1740):
  ```javascript
  class HarnessController {
    constructor(options = {}) {
      this.vfs = options.vfs || new VfsSandbox();
      this.aci = new AciInterface(this.vfs, { controller: this });
      this.maxTurns = options.maxTurns || 15;
      this.maxTokens = options.maxTokens || 50000;
      this.timeoutMs = options.timeoutMs || 60000;
      this.readOnly = Boolean(options.readOnly);
      this.turnsCompleted = 0;
      this.tokensConsumed = 0;
      this.startTime = Date.now();
      this.isHalted = false;
      this.haltReason = null;
      this.haltDetails = null;
      this.listeners = new Map();
    }
  ```
  *Observation*: `HarnessController` manages a single monolithic agent instance. There is no `this._children` registry, no `spawnSubHarness()`, no `mergeSubHarness()`, and no sub-harness lifecycle management.
- **Error Class Definitions** (Lines 137–153):
  ```javascript
  class VfsError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = 'VfsError';
      this.code = code;
      this.details = details;
    }
  }
  class HarnessError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = 'HarnessError';
      this.code = code;
      this.details = details;
    }
  }
  ```
  *Observation*: Both `VfsError` and `HarnessError` support a standardized `(code, message, details)` signature, which must be utilized for all M1 error conditions.

### 1.2 Examination of `tests/test_suna_harness.js`
- **Test Suite Volume**: 2,127 lines, 149 test assertions across Tiers 1–4.
- Lines 526–576 verify `HarnessController` turn budgeting, token ceiling, read-only mode, and timeout. All constructors and baseline methods must remain backward-compatible to prevent regressions.

---

## 2. Logic Chain

1. **Need for 3-Way Snapshot Diffing in `mergeSubHarness`**:
   - In a multi-agent system, when a child harness branches from parent VFS at time $T_0$, it receives an isolated copy of the parent VFS ($\mathcal{S}_{\text{base}}$).
   - While the child executes mutations ($\mathcal{S}_{\text{child}}$), the parent or peer harnesses may concurrently mutate the parent VFS ($\mathcal{S}_{\text{parent}}$).
   - A naive 2-way comparison between $\mathcal{S}_{\text{child}}$ and $\mathcal{S}_{\text{parent}}$ cannot distinguish whether a difference was caused by the child or the parent.
   - Therefore, a formal **3-Way Reconciliation** against $\mathcal{S}_{\text{base}}$ is mandatory:
     - If $C \neq B \land P == B \implies$ Clean child mutation (apply to parent).
     - If $C == B \land P \neq B \implies$ Clean parent mutation (preserve parent).
     - If $C \neq B \land P \neq B \land C \neq P \implies$ **True Conflict**.

2. **Conflict Taxonomy & Operational Handling**:
   - Four deterministic conflict states arise:
     1. `modify_modify_conflict`: Both modified same file with different content.
     2. `modify_delete_conflict`: Child modified, Parent deleted.
     3. `delete_modify_conflict`: Child deleted, Parent modified.
     4. `add_add_conflict`: Both added same path with different content.
   - For predictability:
     - `'safe'` strategy (default) guarantees zero unverified mutations: it detects all conflicts, leaves parent VFS 100% pristine, and throws `HarnessError('BRANCH_CONFLICT', ...)`.
     - `'force'` strategy applies child modifications over parent while logging conflict records.

3. **Sub-Harness Recursion Depth Invariant ($\text{depth} \ge 5$)**:
   - In hierarchical agent workflows, agents can delegate sub-tasks. Without a hard depth bound, an agent that gets stuck or generates recursive sub-tasks will trigger exponential fork-bombs and stack overflow.
   - A deterministic bound ($\text{depth} \le 4$, with spawn at $\text{depth} \ge 5$ throwing `MAX_RECURSION_DEPTH_EXCEEDED`) enforces safe termination.

4. **Lineage Cycle Prevention**:
   - By propagating an immutable ancestry array `this.lineage = Object.freeze([...parent.lineage, parent.id])`, any delegation or spawn target can be checked against `this.lineage` in $O(N)$ time ($N \le 5$). Circular calls immediately throw `DELEGATION_CYCLE_DETECTED`.

5. **Hierarchical Resource Conservation**:
   - Child budgets must be strictly bounded by parent remaining budgets (`min(requested, parent.remaining)`).
   - Real-time token consumption in child must debit parent in real time so parent token ceilings are never bypassed.
   - If parent hits its limit or user requests cancellation, cascading emergency stop halts all descendants recursively and protects VFS isolation.

---

## 3. Caveats

- **Line-level 3-Way Merge**: The current specification establishes file-level conflict detection and branch reconciliation. Full line-level AST or hunk merging (e.g. diff3 with `<<<<<<<` conflict markers) can be layered on top of this model in Milestone 2 when `VfsDiffEngine` is completed, without changing the method signatures or contract.
- **Zero Regression**: New methods on `HarnessController` (`spawnSubHarness`, `mergeSubHarness`, `emergencyStopSubHarness`) are additive. Existing methods (`executeAction`, `halt`, `canExecute`, `reset`) must remain intact.

---

## 4. Conclusion & Discovered Feature Tables

The formal contractual blueprint has been fully detailed and written to `d:\Suna Chat\.agents\explorer_m1_3\m1_contracts.md`.

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

## 5. Verification Method

To verify the integrity of the specification and ensure zero regression before and after worker implementation:

1. **Inspect Specification Artifacts**:
   - Read `d:\Suna Chat\.agents\explorer_m1_3\m1_contracts.md` to confirm all signatures, error codes, and checklist items are present.
2. **Syntax Validation**:
   - In shell: `node -c suna_harness.js && node -c app.js && node -c redesign.js`
   - Must exit 0 with zero output.
3. **Mocha Test Suite Execution**:
   - In shell: `npm test`
   - Must pass 100% of all 982 existing tests without any broken suites.
4. **Full Automated Verification**:
   - In shell: `python run_verification.py`
   - Must display full green checkmarks across all phases.
