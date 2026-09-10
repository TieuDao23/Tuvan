# E2E Test Infra: SunaAgent Autonomous Cognitive Engine

## Test Philosophy
- **Opaque-box, requirement-driven**: Derived directly from `ORIGINAL_REQUEST.md` (§ `## 2026-09-07T16:12:49Z`) and `PROJECT.md` specifications, testing behavioral contracts rather than implementation details.
- **Methodology**: 4-Tier Test Architecture:
  - **Tier 1 (Feature Coverage)**: Exhaustive testing of each feature in isolation with $\ge 5$ test cases per feature covering the primary happy path and specific requirement behaviors.
  - **Tier 2 (Boundary & Corner Cases)**: Testing extreme inputs, empty values, massive payloads, truncated tokens, deep recursion, ReDoS patterns, and Unicode diacritics.
  - **Tier 3 (Cross-Feature Combinations)**: Testing multi-subsystem workflows (e.g. malformed JSON -> auto-repair -> schema validation -> ACI tool execution -> observation reflection -> trajectory recording).
  - **Tier 4 (Real-World Application Scenarios)**: Realistic end-to-end multi-turn developer and user workloads.
- **Zero-Regression Guarantee**: Enforces that all existing 1,226 Mocha tests, static syntax checks (`npm run check`), and `python run_verification.py` remain 100% green with 0 errors.

---

## Feature Inventory (22 Core Features)

| # | Feature | Requirement | Milestone | Tier 1 (Min $\ge$ 5) | Tier 2 | Tier 3 |
|---|---------|-------------|-----------|:--------------------:|:------:|:------:|
| 1 | Cognitive Brain OODA Cycle | R1 | M1 | 6 | ✓ | ✓ |
| 2 | Extended Thinking & Scratchpad | R1 | M1 | 6 | ✓ | ✓ |
| 3 | Multi-Syntax Tool Call Parser | R1 | M1 | 6 | ✓ | ✓ |
| 4 | Malformed JSON Auto-Repair | R1 | M1 | 6 | ✓ | ✓ |
| 5 | Smart Context & Dual Memory | R1 | M1 | 6 | ✓ | ✓ |
| 6 | Legacy Agent Invariants Preservation | R1 / Survey | M1 | 6 | ✓ | ✓ |
| 7 | Deep SunaHarness ACI Integration | R2 | M2 | 6 | ✓ | ✓ |
| 8 | Strict AciSchemaValidator Compliance | R2 | M2 | 6 | ✓ | ✓ |
| 9 | Hierarchical Trajectory Recording | R2 | M2 | 6 | ✓ | ✓ |
| 10 | Checkpoint Replay & Rollback | R2 | M2 | 6 | ✓ | ✓ |
| 11 | InterHarnessEventBus Multi-Agent | R2 | M2 | 6 | ✓ | ✓ |
| 12 | Codex Code Surgery (UTF-8 Vietnamese) | R3 | M3 | 6 | ✓ | ✓ |
| 13 | VfsDiffEngine Preview Integration | R3 | M3 | 6 | ✓ | ✓ |
| 14 | Grounded Diagnostic Loop | R3 | M3 | 6 | ✓ | ✓ |
| 15 | Stuck & Runaway Detection | R3 | M3 | 6 | ✓ | ✓ |
| 16 | Real-time Thought Streaming | R4 | M4 | 6 | ✓ | ✓ |
| 17 | HITL Controls (Pause/Resume/Steer/Rewind) | R4 | M4 | 6 | ✓ | ✓ |
| 18 | Live Workspace 2-Way Sync | R4 | M4 | 6 | ✓ | ✓ |
| 19 | Visualizer Integration | R4 | M4 | 6 | ✓ | ✓ |
| 20 | Dual Runtime Pure Vanilla JS | R5 | M5 | 6 | ✓ | ✓ |
| 21 | Zero Regression System Gate | R5 | M5 | 6 | ✓ | ✓ |
| 22 | E2E Testing Suite Track | Dual Track | M-TEST | 6 | ✓ | ✓ |

---

## Test Architecture & Runners

- **Test Runner**: Mocha (`npx mocha "tests/**/*.js"`).
- **Primary Test File**: `tests/test_suna_agent.js`.
- **Pass/Fail Semantics**: 0 failures, 0 pending, exit code 0.
- **Verification Command**: `python run_verification.py`.
- **Syntax Hygiene**: `npm run check` (`node -c app.js && node -c redesign.js && node -c suna_harness.js`).
- **Isolation Protocol**: Each test initializes fresh instances of `VfsSandbox`, `HarnessController`, `TrajectoryEngine`, and `SunaAgent`. Global mocks (`window`, `document`) are isolated and cleaned up in `afterEach()`.

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | End-to-End Surgical Bug Fixing Workflow | F1, F2, F7, F8, F12, F13, F14 | High |
| 2 | Multi-File Scaffold & Live Workspace Sync | F1, F3, F7, F9, F18, F20 | High |
| 3 | Interactive Human-in-the-Loop Refactoring | F1, F2, F10, F16, F17 | High |
| 4 | Multi-Agent Collaborative Task (Lead + Sub-agent) | F7, F9, F10, F11, F15 | Very High |
| 5 | Resilient Self-Correction under Injected Chaos | F1, F4, F7, F8, F14, F15, F19 | Very High |

---

## Coverage Thresholds & Metrics

- **Tier 1 (Feature Coverage)**: $\ge 110$ tests (at least 5 per feature across 22 features; actual: 132 tests).
- **Tier 2 (Boundary & Corner Cases)**: $\ge 25$ tests (actual: 26 tests).
- **Tier 3 (Cross-Feature Combinations)**: $\ge 15$ tests (actual: 15 tests).
- **Tier 4 (Real-World Scenarios)**: $\ge 5$ end-to-end scenarios (actual: 5 scenarios).
- **Total Suite Size**: $\ge 155$ tests (actual: **178 tests**).
- **Target Pass Rate**: **100% Green** across both `tests/test_suna_agent.js` and all existing 1,226 baseline tests.
