# Handoff Report: M1 Explorer 1 — Sub-Harness Lifecycle & VFS Isolation Modes

**Agent:** `explorer_m1_1`  
**Working Directory:** `d:\Suna Chat\.agents\explorer_m1_1`  
**Milestone:** Milestone 1: Sub-harness Delegation & Event Bus (R1)  
**Timestamp:** 2026-09-07T13:48:00Z  
**Handoff Type:** Hard (Task Complete)  

---

## 1. Observation

1. **`ORIGINAL_REQUEST.md` (lines 14–18)** explicitly mandates:
   > "Cho phép Parent Harness sinh ra các Child Sub-harness độc lập (spawnSubHarness({ role, budget, vfsWorkspaceMode })) với các chế độ không gian làm việc linh hoạt (share dùng chung VFS, clone nhân bản độc lập, hoặc branch rẽ nhánh với khả năng merge ngược lại)."
   > "Thiết lập kênh truyền nhận thông điệp có cấu trúc hai chiều giữa Parent và Sub-harness, hỗ trợ gửi chỉ thị tiếp theo, giám sát tiến độ và dừng khẩn cấp từ harness cha."
   > "Tự động đính kèm toàn bộ chuỗi sự kiện thought -> action -> observation của sub-harness con vào dòng trajectory tổng thể của harness cha, hiển thị rõ ràng quan hệ phân cấp cây."

2. **`suna_harness.js` Line Mapping for Current Governance & VFS**:
   - `VfsSandbox` (lines 159–907): Implements in-memory POSIX filesystem, `writeFile`, `readFile`, `removeFile`, `createSnapshot()` (lines 797–818), `restoreSnapshot()` (lines 820–837), and event emission `_emit(eventType, path, data)` for `'write'`, `'change'`, `'delete'`, `'mkdir'`, `'rmdir'`, `'restore'` (lines 211, 246, 301, 302, 350, 385, 835).
   - `HarnessController` (lines 1552–1740): Currently manages single-agent execution state (`turnsCompleted`, `tokensConsumed`, `isHalted`, `listeners: Map`, `executeAction`, `halt`). Lacks sub-harness hierarchy, parent/child tracking, and inter-harness messaging.
   - `TrajectoryEngine` (lines 1745–1873): Records flat sequence of steps via `recordStep(stepData)` creating `makeImmutableEvent(rawEvent)`. Lacks `agent_id`, `role`, `depth`, and `children` arrays for tree representation.
   - `createHarness()` (lines 3118–3136): Instantiates a single flat harness bundle (`vfs`, `controller`, `aci`, `trajectory`, `checkpoint`, `chaos`, `guardrails`).

3. **Current Test Suite Baseline**:
   - Running `npm test` executes 38 test files resulting in `982 passing (4s)`.
   - `tests/test_suna_harness.js` covers `HarnessController` unit tests at lines 527–576 (tests `T1-CTRL-01` through `T1-CTRL-05`), verifying turn limits, token budgets, read-only mode, turn counts, and timeouts.

4. **Document Artifacts Surveyed**:
   - `d:\Suna Chat\.agents\explorer_survey_1\survey_report.md` (Sections 4.1 & 5.1).
   - `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md` (Sections 2.1–2.4, Table 6 Features 1–9, and Edge Cases 1–5).

---

## 2. Logic Chain

1. **Hierarchy Integration (from Obs 1 & Obs 2)**:
   Because `HarnessController` already possesses `this.vfs`, `this.aci`, turn/token tracking, and tool execution governance, extending `HarnessController` with `id`, `role`, `depth`, `parentId`, `parentController`, and `children = new Map()` allows any controller instance to act either as a root orchestrator or as a delegated sub-harness without duplicating execution logic.

2. **VFS Workspace Partitioning (from Obs 1 & Obs 2)**:
   - For `'share'` mode: assigning `childVfs = this.vfs` provides zero-copy, direct memory mutation of the parent workspace, satisfying collaborative agent patterns.
   - For `'clone'` mode: calling `parent.vfs.createSnapshot()` followed by `childVfs.restoreSnapshot(snapshot)` provides complete isolation. Mutations in child do not touch parent, satisfying read-only/scratchpad patterns.
   - For `'branch'` mode: combining `createSnapshot()` bookmarking (`_branchOriginSnapshot`), active change ledger tracking (`_branchLedger` listening to `VfsSandbox._emit` events), and delta comparison at merge time allows reliable conflict detection (`modified in branch AND modified in parent since origin`) and clean merging back to the parent VFS.

3. **Inter-Harness Communication (from Obs 1 & Obs 2)**:
   Introducing `InterHarnessEventBus` with targeted envelope routing (`from`, `to`, `type`, `payload`) enables parents to issue directives, inspect status, and trigger emergency halts (`emergencyStopSubHarness`). Propagating the halt downwards (`child.controller.halt('EMERGENCY_STOP_BY_PARENT')`) guarantees that any running or scheduled action by the sub-harness is immediately halted.

4. **Hierarchical Trajectory Stitching (from Obs 1 & Obs 2)**:
   Extending `TrajectoryEngine.recordStep` with `agent_id`, `role`, `depth`, and `children: []`, combined with `stitchChildTrajectory(subHarnessId, childTrajectory)`, attaches child event arrays as subtrees under the parent's `spawnSubHarness` event. This generates a structured hierarchical tree without disrupting the linear timeline.

5. **Zero-Regression Invariant (from Obs 3)**:
   All existing properties on `HarnessController` (`vfs`, `aci`, `maxTurns`, `maxTokens`, `timeoutMs`, `readOnly`, `turnsCompleted`, `tokensConsumed`, `isHalted`, `executeAction`, `incrementTurn`, `consumeTokens`, `halt`, `reset`) are preserved. Default parameters ensure that existing calls (`new HarnessController({ maxTurns: 5, maxTokens: 1000, vfs })`) behave identically to the baseline.

---

## 3. Caveats

1. **Concurrency Model**: JavaScript in Node.js and the browser is single-threaded. While multi-agent execution is conceptually parallel, in-process sub-harnesses execute asynchronously via interleaving microtasks/promises. Locking (`vfs.lockFile`) should be respected during tool calls.
2. **Deep Recursion Ceiling**: While deep recursion is required for adversarial testing ($\ge 5$), an upper limit of `depth > 10` is enforced to prevent accidental infinite recursion loops.
3. **M1 vs M2 Diff Dependency**: In M1, `mergeSubHarness` uses direct snapshot object key/content comparison for conflict detection. When M2 (`VfsDiffEngine`) is implemented, `mergeSubHarness` can optionally invoke `VfsDiffEngine.compareSnapshots` for hunk-level three-way diffing.

---

## 4. Conclusion

The implementation strategy for Milestone 1 is fully specified and documented in `d:\Suna Chat\.agents\explorer_m1_1\m1_strategy.md`.

Key components ready for implementation:
1. `InterHarnessEventBus` class placed before `HarnessController` in `suna_harness.js`.
2. `VfsSandbox.prototype.branch()` providing cloned VFS, origin bookmark, and mutation ledger.
3. `HarnessController.prototype.spawnSubHarness({ role, budget, vfsWorkspaceMode, ... })` managing sub-agent lifecycle and resource boundaries.
4. `HarnessController.prototype.mergeSubHarness(childId, options)` providing conflict-aware branch merging.
5. `HarnessController.prototype.emergencyStopSubHarness(childId, reason)` for parent-driven containment.
6. `TrajectoryEngine` extensions for hierarchical trajectory stitching.
7. `createHarness()` facade extensions exposing the multi-agent delegation API.

---

## 5. Verification Method

1. **Static Analysis & Syntax Verification**:
   ```bash
   node -c suna_harness.js
   ```
   Must pass with exit code 0.

2. **Regression Verification**:
   ```bash
   npm test
   ```
   All 982 existing Mocha tests must pass (100% green).

3. **Targeted Sub-Harness Unit Test Execution**:
   Add test block in `tests/test_suna_harness.js` under `Tier 1: Feature Coverage` validating:
   - `spawnSubHarness` in `'share'`, `'clone'`, and `'branch'` modes.
   - Live mutations in `'share'` mode reflected in parent.
   - Scratchpad mutations in `'clone'` mode completely isolated from parent.
   - Branch modifications staged and merged cleanly via `mergeSubHarness`.
   - Conflict detection when both parent and branch modify the same file with `strategy: 'abort_on_conflict'`.
   - Directive sending and progress telemetry over `InterHarnessEventBus`.
   - Immediate halting upon `emergencyStopSubHarness`.
   - Trajectory tree nesting verified via `trajectory.getHierarchicalTree()`.
   - Deep recursion ($\ge 5$ levels) without call stack overflow.
