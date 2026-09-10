# Handoff Report: Specification Mining for Suna Agent Harness Upgrade (R1–R4)

**Agent**: `spec_miner_survey_2`  
**Date**: 2026-09-07T13:40:00Z  
**Type**: Hard Handoff (Task Complete)  
**Target File**: `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md`  
**Recipient**: Parent Orchestrator (`54f8a5c6-f5e1-47fc-bcb2-f13faec46da4`)

---

## 1. Observation

1. **`ORIGINAL_REQUEST.md` (`d:\Suna Chat\.agents\ORIGINAL_REQUEST.md:14-40`)**:
   Mandates four specific advanced architectural enhancements for SunaHarness:
   - *R1 (lines 14-18)*: Multi-Agent Sub-harness Delegation (`spawnSubHarness({ role, budget, vfsWorkspaceMode })` with `share`, `clone`, `branch` modes), Two-way Inter-Harness Event Bus, and Trajectory Stitching into a hierarchical tree representation.
   - *R2 (lines 19-22)*: Standard Git Unified Diff Engine (`VfsDiffEngine`) producing `--- a/path\n+++ b/path\n@@ -l,s +l,s @@` format, whitespace and Vietnamese UTF-8 preservation, and `AciSchemaValidator` providing JSON Schema validation for all ACI tools before VFS execution.
   - *R3 (lines 23-29)*: SunaHarness UI Visualizer (DOM component for trajectory tree, Benchmark Scorecard with Success Rate $SR$, Step Efficiency $\eta$, and Fault Recovery Rate $FRR$, side-by-side / unified diff viewer), and Checkpoint persistence to IndexedDB (`suna_harness_checkpoints_<uid>`).
   - *R4 (lines 30-40)*: E2E tests, Adversarial Fuzzing ($\ge 5$ recursion depth, schema injections, 10,000+ line diffs), and 100% zero regression on the existing 982 tests (`npm test`), 0 syntax errors (`node -c`), and `python run_verification.py`.

2. **Existing Implementation in `suna_harness.js`**:
   - `suna_harness.js:1449-1465`: Current `_computeUnifiedDiff` is a rudimentary line-by-line comparison without hunk headers `@@ -l,s +l,s @@`, context lines, or snapshot diffing.
   - `suna_harness.js:1552-1740`: `HarnessController` manages a single harness lifecycle without child sub-harness spawning, hierarchy tracking, or multi-agent event dispatch.
   - `suna_harness.js:1878-1983`: `CheckpointManager` stores snapshots in an in-memory Map (`this.checkpoints`), lacking IndexedDB persistence or UID partitioning.
   - `suna_harness.js:3149-3242`: ACI tools are registered with parameter descriptions, but runtime validation occurs only via ad-hoc assertions inside tool methods rather than a dedicated JSON Schema validator.
   - `suna_harness.js:2947-2970` & `3068-3085`: `EvaluationRunner` defines metric formulas for Success Rate, average Step Efficiency, and Fault Recovery Rate.

3. **Current Test Baseline & Integrity**:
   - `npm test` executed via background task `task-32`: `982 passing (5s)`.
   - `package.json:7-8`: `"scripts": { "test": "npx mocha \"tests/**/*.js\"", "check": "node -c app.js && node -c redesign.js" }`.
   - `run_verification.py`: Verifies `node -c app.js && node -c redesign.js`, CSS brace balance, toast z-index, and Mocha tests passing.

---

## 2. Logic Chain

1. **R1 Multi-Agent Sub-harness Delegation**:
   - From Observation 1 & 2, `HarnessController` must be extended with `spawnSubHarness(options)`.
   - Workspace mode semantics require three distinct memory behaviors:
     - `'share'`: passes direct reference `this.vfs`.
     - `'clone'`: passes `new VfsSandbox().restoreSnapshot(this.vfs.createSnapshot())`.
     - `'branch'`: passes cloned VFS while recording an active changeset ledger, allowing `mergeBranchToParent()` with conflict detection.
   - Inter-Harness Event Bus requires structured JSON message envelopes (`id`, `senderId`, `recipientId`, `type`, `timestamp`, `payload`) supporting parent directives (`directive`, `emergency_stop`) and child telemetry (`progress`, `completed`, `failed`).
   - Trajectory Stitching requires tree nodes (`TrajectoryTreeNode`) carrying `harnessId`, `parentHarnessId`, `depth`, and a `children` array, rendered via depth-first hierarchical traversal.

2. **R2 Unified Diff & JSON Schema Validator**:
   - From Observation 2, `_computeUnifiedDiff` lacks standard hunk headers and context lines. A dedicated `VfsDiffEngine` must implement standard LCS/Myers line diffing, grouping changes within $2 \times contextLines$ into `@@ -l,s +l,s @@` hunks.
   - For snapshot diffing, files newly created in snapshot B use `--- /dev/null\n+++ b/<path>`, while deleted files use `--- a/<path>\n+++ /dev/null`.
   - Vietnamese UTF-8 multi-byte characters must be sliced and handled using code point safe routines to prevent string truncation or character corruption.
   - `AciSchemaValidator` must validate input objects against JSON Schema rules before invoking any VFS operation, returning structured diagnostic responses (`{ valid: false, errors: [...] }`) on failure to cleanly guide `SelfCorrectionLoop`.

3. **R3 UI Visualizer & Checkpoint Persistence**:
   - `SunaHarnessVisualizer` must provide DOM rendering for trajectory trees (with status badges, duration, tokens, collapsible nodes), benchmark scorecard KPI cards (using exact formulas: $SR = \frac{\text{Passed}}{\text{Total}}$, $\eta = \frac{1}{N}\sum \frac{\text{Optimal}}{\max(\text{Actual}, \text{Optimal})}$, $FRR = \frac{\text{Recovered}}{\text{Injected}}$), and diff viewers (added lines green, deleted lines red).
   - Checkpoint persistence must target IndexedDB database `suna_harness_checkpoints_<uid>` with object store `checkpoints`, with automatic fallback to localStorage or in-memory when IndexedDB is unavailable.

4. **R4 Testing, Adversarial Fuzzing & Zero Regression**:
   - Expanding `tests/test_suna_harness.js` to test all new features ensures complete coverage.
   - Adversarial tests must include: recursion depth $\ge 5$, prototype pollution / schema injection attempts, and diffing files $>10,000$ lines.
   - All 982 existing tests must continue to pass 100%.

---

## 3. Caveats

1. **Browser vs Node.js Environment Isolation**:
   In Node.js test runs (`npm test`), native `window.indexedDB` does not exist. Checkpoint persistence must implement an automatic fallback to an in-memory/mock store when `indexedDB` is undefined, allowing tests to run in both Node and Browser without requiring external npm packages.
2. **DOM Visualizer in Headless Testing**:
   When testing the DOM Visualizer in Node.js, tests should check DOM generation functions (e.g. `renderTrajectoryTreeHtml()`, `renderScorecardHtml()`) or use mock DOM objects without crashing if `document` is undefined.

---

## 4. Conclusion

All formal specifications, function interfaces, JSON schemas, event payloads, benchmark formulas, and edge cases have been mined and documented in exhaustive detail in `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md`. The design is 100% backward compatible with the current codebase, requires zero external npm dependencies, and provides the exact technical foundation needed for the implementation team.

---

## 5. Verification Method

1. **Specification Report Inspection**:
   Inspect `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md` to verify all 4 requirements, 26 discovered features, and 19 edge cases are documented.
2. **Existing Baseline Verification**:
   Execute:
   ```bash
   npm test
   ```
   Must confirm `982 passing` across all existing suites.
3. **Syntax Integrity**:
   Execute:
   ```bash
   node -c app.js && node -c redesign.js && node -c suna_harness.js
   ```
   Must exit with code 0.
4. **Automated Verification**:
   Execute:
   ```bash
   python run_verification.py
   ```
   Must print `>>> VERIFICATION PASSED: ALL CHECKS 100% GREEN (982 TESTS) <<<`.
