# Task Assignment: Worker M1 — Sub-harness Delegation & Event Bus Implementation

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Milestone
Milestone 1: Sub-harness Delegation & Event Bus (R1)

## Exclusive File Ownership
- File owned exclusively: `d:\Suna Chat\suna_harness.js`

## Objectives
Implement the complete Sub-harness Delegation and Event Bus architecture in `suna_harness.js`:
1. `InterHarnessEventBus` class:
   - Message envelopes: `directive`, `status_query`, `emergency_stop`, `progress`, `completed`, `failed` (plus `pause`, `resume`, `assistance_request`, `response`).
   - Targeted point-to-point delivery (`to: harnessId`), broadcast pub/sub (`to: '*'`), and request/response (`request(to, type, payload, timeoutMs)`).
   - Error-isolated subscriber execution in `try/catch` with ring-buffer history.
2. `VfsSandbox` enhancements:
   - `branch(options)` method: creates snapshot clone, bookmarks `_branchOriginSnapshot`, sets up branch tracking.
   - `getBranchChanges()`: compares current branch files against `_branchOriginSnapshot` (added, modified, deleted).
3. `HarnessController` enhancements:
   - `spawnSubHarness({ role, budget, vfsWorkspaceMode, id, metadata })`:
     - Modes: `'share'`, `'clone'`, `'branch'`.
     - Recursion depth guard: enforce `depth <= 4`, throw `HarnessError('MAX_RECURSION_DEPTH_EXCEEDED')` if spawn requested at `depth >= 5`.
     - Cycle detection: check `lineage` array, throw `HarnessError('DELEGATION_CYCLE_DETECTED')`.
     - Budget clamping & hierarchical resource tracking (debit child tokens to parent in real time).
     - Event bus linking: parent and child connect to shared event bus.
   - `mergeSubHarness(childId, options)`:
     - 3-way reconciliation against origin snapshot.
     - Conflict detection: `modify_modify_conflict`, `modify_delete_conflict`, `delete_modify_conflict`, `add_add_conflict`.
     - Strategies: `'safe'` (default, throws `HarnessError('BRANCH_CONFLICT')` or returns `{ success: false, conflicts }` leaving parent VFS pristine) vs `'force'` (applies child changes).
   - `emergencyStopSubHarness(childId, reason)`: cascading halt to child and all its descendants.
4. `TrajectoryEngine` enhancements:
   - `TrajectoryTreeNode` data model: handles hierarchical steps without mutating frozen events.
   - `stitchChildTrajectory(childHarnessId, childEventsOrEngine, options)`.
   - `getHierarchicalTree(options)`: returns structured tree nodes with hierarchical indices (e.g. `1`, `2`, `2.1`, `2.2`).
   - `exportMarkdown({ hierarchical: true })` backward-compatible export.
5. `SunaHarness` Public Facade export:
   - Export `InterHarnessEventBus` and ensure `createHarness()` creates/wires event bus properly.

## Authoritative Strategy & Contract References
Read and strictly adhere to:
- `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md`
- `d:\Suna Chat\.agents\explorer_m1_1\m1_strategy.md`
- `d:\Suna Chat\.agents\explorer_m1_2\m1_strategy.md`
- `d:\Suna Chat\.agents\explorer_m1_3\m1_contracts.md`

## Verification Requirements (You must run and report results in handoff)
1. `node -c suna_harness.js && node -c app.js && node -c redesign.js` (Must be 0 syntax errors)
2. `npm test` (Must pass all 982 existing mocha tests with 0 failures)
3. `python run_verification.py` (Must be 100% green)
Write your handoff report to `d:\Suna Chat\.agents\worker_m1\handoff.md`.

## 2026-09-07T13:48:07Z
<USER_REQUEST>
You are worker_m1.
Your working directory is d:\Suna Chat\.agents\worker_m1.
Before starting work, you MUST read:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
- d:\Suna Chat\.agents\worker_m1\DISPATCH.md
- d:\Suna Chat\.agents\explorer_m1_1\m1_strategy.md
- d:\Suna Chat\.agents\explorer_m1_2\m1_strategy.md
- d:\Suna Chat\.agents\explorer_m1_3\m1_contracts.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File ownership:
You own exclusively: d:\Suna Chat\suna_harness.js

Your task:
Implement Milestone 1: Sub-harness Delegation & Event Bus (R1) in suna_harness.js:
1. Implement InterHarnessEventBus with all required message envelopes (directive, status_query, emergency_stop, progress, completed, failed, etc.), point-to-point, broadcast, and request/response with isolated callback execution.
2. Enhance VfsSandbox with branch() mode and branch change tracking.
3. Enhance HarnessController with spawnSubHarness({ role, budget, vfsWorkspaceMode }), mergeSubHarness(childId, options), emergencyStopSubHarness, recursion depth guard (depth >= 5 throws MAX_RECURSION_DEPTH_EXCEEDED), lineage cycle guard, and hierarchical token debiting.
4. Enhance TrajectoryEngine with TrajectoryTreeNode, stitchChildTrajectory(), getHierarchicalTree(), and hierarchical markdown export.
5. Export InterHarnessEventBus and ensure SunaHarness facade supports sub-harness lifecycle.
6. Verify your implementation:
   - Run syntax check: node -c suna_harness.js && node -c app.js && node -c redesign.js
   - Run Mocha tests: npm test (verify all 982 tests pass 100%)
   - Run python run_verification.py
7. Write your handoff report to d:\Suna Chat\.agents\worker_m1\handoff.md and report back via send_message.
</USER_REQUEST>

## 2026-09-07T14:00:22Z
Sender: 54f8a5c6-f5e1-47fc-bcb2-f13faec46da4 (parent)
**Context**: Milestone 1 Implementation (R1 Sub-harness Delegation & Event Bus)
**Content**: Orchestrator heartbeat check. Please provide a brief status update on your progress implementing the classes in `suna_harness.js`.
**Action**: Continue implementation and update progress.md.
