# Dispatch — worker_m1_o8

**Role**: Implementation Worker — SunaHarness Performance & Memory Optimization (teamwork_preview_worker)
**Working Directory**: d:\Suna Chat\.agents\worker_m1_o8
**Authoritative Request**: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md (Section: 2026-09-08T04:24:49Z)
**Exclusive File Ownership**:
- `suna_harness.js`
- `tests/test_suna_harness.js`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & Source of Truth
Read the survey reports before modifying code:
- `d:\Suna Chat\.agents\explorer_survey_o8_1\survey_report.md` (detailed Myers LCS analysis, fatal `max > 25000` bug, 32-bit line hashing design, bounded Myers vector, and VfsSandbox/Harness lifecycle teardown methods).
- `d:\Suna Chat\.agents\explorer_survey_o8_2\survey_report.md` (CheckpointManager directory loss & trajectory persistence fixes, sub-harness sibling ID guard).

## Concrete Tasks to Implement in `suna_harness.js`:
1. **Myers LCS Optimization (R1)**:
   - Eliminate the fatal `if (max > 25000)` bailout in `_myersRaw` that caused 1MB–3.5MB corrupt patches on distributed edits.
   - In `_splitIntoLines`: compute 32-bit FNV-1a integer line hash alongside text.
   - In `_computeEdits`: implement instant equality fast-path (`if (start === N && start === M) return [];`) and compact prefix/suffix trimming windowing.
   - In `_myersRaw`: bound edit distance vector `v = new Int32Array(2 * limitD + 1)` with `limitD = Math.min(n + m, maxD)` where `maxD = 4000`. Compare integer hashes first in the inner snake loop before string equality.
   - Meet all performance targets: 12,000+ lines with 15 edits in < 100ms; 50,000 identical lines in < 10ms with zero object allocations; 14,000 lines with 2 distant edits generates clean <1KB patch.
2. **VfsSandbox & Runtime Lifecycle Architecture (R1)**:
   - Implement `VfsSandbox.prototype.reset(options)`: clears `this.files`, resets `this.directories` to `['']`, detaches branch lineage and origin snapshots.
   - Implement `VfsSandbox.prototype.destroy()`: calls reset, nullifies maps and listeners, flags `_destroyed = true` with defensive guards on subsequent method calls.
   - Implement `CheckpointManager.prototype.reset()`, `destroy()`, and `pruneCheckpoints(maxRetained = 20)`.
   - In `CheckpointManager.prototype.saveCheckpoint`: preserve directories in snapshot: `{ files: vfsSnapshot.files, directories: vfsSnapshot.directories }`.
   - In `CheckpointManager.prototype.rewind`: restore both files and directories properly.
   - In `IndexedDbCheckpointStore`: serialize `trajectoryEvents` from `this.trajectory.getEvents()` into checkpoint records and restore them on reload.
   - Implement `TrajectoryEngine.prototype.reset()` and `destroy()`.
   - Implement `HarnessController.prototype.reset(options)`: cascades reset to VFS, trajectory, checkpoint manager, and child sub-harnesses.
   - Implement `HarnessController.prototype.destroy()`.
   - In `HarnessController.prototype.spawnSubHarness`: add sibling ID collision check: throw `SUB_HARNESS_ALREADY_EXISTS` if child ID is already present and active.
3. **Test Suite Expansion in `tests/test_suna_harness.js`**:
   - Add test cases verifying:
     - Myers LCS 12,000 lines / 15 distributed edits < 100ms.
     - 50,000 identical lines diff < 10ms.
     - 14,000 lines with 2 distant edits produces clean 2-hunk patch without bailout.
     - `VfsSandbox.reset()` and `destroy()`.
     - `CheckpointManager.reset()`, `destroy()`, and `pruneCheckpoints()`.
     - `HarnessController.reset()` cascading teardown and memory reclamation.
     - Sub-harness sibling ID collision check.
     - Checkpoint directory preservation on rewind.

## Verification Requirements
Worker MUST run:
- `node -c suna_harness.js`
- `npx mocha tests/test_suna_harness.js`
Verify all existing and new tests pass 100% with 0 failures. Document exact results in `handoff.md`.
