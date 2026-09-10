# DISPATCH — explorer_m3_1

## 2026-09-07T15:18:00Z
You are explorer_m3_1 (Specification and Architecture Explorer for Milestone 3).
Working directory: d:\Suna Chat\.agents\explorer_m3_1

Authoritative files to study:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md (Requirements R3: UI Visualizer & IndexedDB Persistence)
- d:\Suna Chat\PROJECT.md
- d:\Suna Chat\suna_harness.js (TrajectoryEngine, CheckpointManager, BenchmarkSuite, VfsDiffEngine)
- d:\Suna Chat\app.js and d:\Suna Chat\redesign.js (UI conventions, DOM patterns, theme styling)

Your task:
Survey and design the complete technical architecture and implementation strategy for Milestone 3:
1. Component Trực Quan Hóa DOM (SunaHarness UI Visualizer):
   - Design `SunaHarnessVisualizer` (or `SunaHarness.UIVisualizer`):
     - Hierarchical Trajectory Tree viewer (Thought, Action, Params, Output, Duration, Token Cost) with filtering by sub-agent/depth.
     - Benchmark Scorecard display with charts/bars for Success Rate (SR), Step Efficiency (eta), Fault Recovery Rate (FRR).
     - Interactive Diff Viewer (unified and side-by-side modes using VfsDiffEngine output with green/red syntax highlighting).
     - Pure vanilla DOM construction (no external frameworks like React/Vue), resilient against browser and headless test environments.
2. Lưu Trữ Bền Vững Checkpoint vào IndexedDB:
   - Design `IndexedDbCheckpointStore` (or `CheckpointManager` IndexedDB methods):
     - Database name format: `suna_harness_checkpoints_<uid>`.
     - Object stores: `snapshots` (key: `checkpointId`, value: `{ stepIndex, timestamp, vfsState, metadata }`) and `metadata` (keys for session info).
     - Asynchronous Promise-based APIs: `saveCheckpointToIndexedDB(uid, checkpoint)`, `loadCheckpointsFromIndexedDB(uid)`, `clearIndexedDB(uid)`.
     - Robust Node.js fallback (in-memory mock or graceful degradation if `window.indexedDB` is undefined, so Node tests pass 100%).
3. Integration and Test Strategy:
   - Identify exact integration points in `suna_harness.js`.
   - Design test specifications for both DOM Visualizer rendering and IndexedDB persistence.
4. Output:
   - Write comprehensive strategy to `d:\Suna Chat\.agents\explorer_m3_1\m3_visualizer_persistence_strategy.md`.
   - Write handoff report to `d:\Suna Chat\.agents\explorer_m3_1\handoff.md`.
   - Report back via send_message.
