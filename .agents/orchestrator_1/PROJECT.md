# Project: Suna Agent Harness Advanced Capabilities (R1–R4)

## Architecture
- Subsystems within `suna_harness.js`:
  - `VfsSandbox`: Virtual in-memory filesystem with snapshot, restore, and branch merging.
  - `InterHarnessEventBus`: Message broker for parent-child harness communication.
  - `HarnessController`: Central agent harness lifecycle manager supporting `spawnSubHarness`, resource budgets, and delegation.
  - `VfsDiffEngine`: Standard Git unified diff engine (LCS/Myers, hunk headers `@@ -l,s +l,s @@`, context lines, snapshot comparison, UTF-8 Vietnamese safe).
  - `AciSchemaValidator`: JSON Schema validator for 6 SWE-agent ACI tools with alias normalization and structured diagnostics.
  - `TrajectoryEngine`: Hierarchical trajectory event store with `stitchChildTrajectory()` and `getHierarchicalTree()`.
  - `CheckpointManager` & `IndexedDbCheckpointStorage`: Dual-layer checkpoint persistence supporting in-memory, localStorage, and IndexedDB (`suna_harness_checkpoints_<uid>`).
  - `SunaHarnessVisualizer`: Component rendering Trajectory Tree, Scorecard ($SR$, $\eta$, $FRR$), and Diff Viewer (DOM & `renderToString()`).
  - Integration bridge with `app.js` and test matrix in `tests/test_suna_harness.js`.

## Code Layout
- Core Engine: `d:\Suna Chat\suna_harness.js` (UMD module, zero npm dependencies).
- Application Bridge: `d:\Suna Chat\app.js` (UI integration and SunaAgent harness bridge).
- Test Suites: `d:\Suna Chat\tests\test_suna_harness.js` (comprehensive Tiers 1-4 & adversarial fuzzing).
- System Verification: `d:\Suna Chat\run_verification.py` and `d:\Suna Chat\package.json` (`npm test`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Sub-harness Spawning | `spawnSubHarness({ role, budget, vfsWorkspaceMode })` lifecycle management | M1 | survey |
| 2 | VFS Share Mode | Sub-harness operates on shared parent VFS reference | M1 | survey |
| 3 | VFS Clone Mode | Sub-harness operates on isolated snapshot clone | M1 | survey |
| 4 | VFS Branch Mode | Sub-harness operates on branch with change tracking ledger | M1 | survey |
| 5 | Branch Merging | `mergeSubHarness(childId)` merges branch back to parent VFS with conflict detection | M1 | survey |
| 6 | Inter-Harness Event Bus | Two-way message broker with structured envelopes | M1 | survey |
| 7 | Parent Directives | Parent sends `directive`, `status_query`, `emergency_stop` | M1 | survey |
| 8 | Child Telemetry | Child reports `progress`, `completed`, `failed` | M1 | survey |
| 9 | Hierarchical Trajectory | `TrajectoryTreeNode` data structures with parent-child links | M1 | survey |
| 10 | Trajectory Stitching | `stitchChildTrajectory()` attaches child steps into parent tree | M1 | survey |
| 11 | Tree Traversal | `getHierarchicalTree()` outputs structured tree representations | M1 | survey |
| 12 | Unified Git Diff | `VfsDiffEngine` computes Git patch with `@@ -l,s +l,s @@` hunk headers | M2 | survey |
| 13 | Context Grouping | 3-line context grouping and clean patch generation | M2 | survey |
| 14 | Snapshot Diffing | `compareSnapshots(snapA, snapB)` detects added/modified/deleted files with `/dev/null` | M2 | survey |
| 15 | Unicode / UTF-8 Safety | Safe multi-byte string handling for Vietnamese diacritics and special characters | M2 | survey |
| 16 | ACI Tool Schemas | JSON Schema definitions for all 6 ACI tools (`view_file`, `replace_file_content`, etc.) | M2 | survey |
| 17 | Pre-Validation Diagnostics | Rejection of invalid types/missing required fields before VFS execution | M2 | survey |
| 18 | Alias Normalization | Parameter alias resolution (`TargetFile`/`path`, `TargetContent`/`targetContent`, etc.) | M2 | survey |
| 19 | UI Trajectory Tree | DOM rendering of hierarchical trajectory with status, metrics, and filtering | M3 | survey |
| 20 | Benchmark Scorecard | Scorecard display with $SR$, $\eta$, and $FRR$ metric calculations | M3 | survey |
| 21 | Visual Diff Viewer | Side-by-side and unified diff viewer with added (green) and deleted (red) styling | M3 | survey |
| 22 | Headless HTML Renderer | `renderToString()` for DOM components enabling Node.js testability | M3 | survey |
| 23 | IndexedDB Persistence | Checkpoint serialization to IndexedDB `suna_harness_checkpoints_<uid>` | M3 | survey |
| 24 | Storage Fallbacks | Automatic fallback to `localStorage` or in-memory map | M3 | survey |
| 25 | Tier 1-4 Test Matrix | Comprehensive unit, boundary, interaction, and scenario tests in `tests/test_suna_harness.js` | M4 | survey |
| 26 | Adversarial Fuzzing | Fuzzing deep recursion $\ge 5$, schema injection, and large diffs (>10k lines) | M4 | survey |
| 27 | Zero-Regression Gate | 100% pass on 982+ tests, `node -c` clean, `python run_verification.py` green | M4 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Sub-harness Delegation & Event Bus (R1) | Features 1–11: `spawnSubHarness`, `share`/`clone`/`branch` VFS modes, `mergeSubHarness`, `InterHarnessEventBus`, trajectory tree stitching | none | DONE |
| M2 | Unified Git Diff & JSON Schema Validator (R2) | Features 12–18: `VfsDiffEngine` (Git hunks, snapshot diffs, UTF-8 safety), `AciSchemaValidator` (schemas, diagnostics, aliases) | none | PLANNED |
| M3 | UI Visualizer & Checkpoint Persistence (R3) | Features 19–24: `SunaHarnessVisualizer` (Trajectory Tree, Scorecard, Diff Viewer, `renderToString()`), `IndexedDbCheckpointStorage` | M1, M2 | PLANNED |
| M4 | Comprehensive Testing, Adversarial Fuzzing & Zero-Regression Verification (R4) | Features 25–27: Extend `tests/test_suna_harness.js` (Tiers 1–4, fuzzing), verify 982+ tests, `node -c`, `run_verification.py` | M1, M2, M3 | PLANNED |

## Interface Contracts
### M1 ↔ M2 (Sub-harness & Diff/Schema)
- `VfsSandbox.prototype.branch()`: returns cloned VFS with `_branchOriginSnapshot`.
- `VfsDiffEngine.compareSnapshots(snapA, snapB)`: used by `mergeSubHarness` to compute diffs and detect conflicts.
- `AciSchemaValidator.validate(toolName, args)`: called at entry of `AciInterface.execute(toolName, args)`.

### M1/M2 ↔ M3 (Visualizer & Persistence)
- `TrajectoryEngine.prototype.getHierarchicalTree()`: consumed by `SunaHarnessVisualizer.renderTrajectoryTree()`.
- `VfsDiffEngine`: consumed by `SunaHarnessVisualizer.renderDiffView(diffText, mode)`.
- `CheckpointManager.exportSnapshot(checkpointId)`: serialized to `IndexedDbCheckpointStorage.save(uid, checkpointId, data)`.

### M1/M2/M3 ↔ M4 (Testing)
- All new subsystems exported via UMD pattern in `suna_harness.js`.
- Mock helpers (`createMockDOM`, `createMockIndexedDBStore`) available in test environment.
