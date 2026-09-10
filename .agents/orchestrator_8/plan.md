# Master Implementation Plan — SunaHarness & SunaAgent Optimization & Upgrade (R1–R5)

## 1. Architecture & Upgrade Overview

This project upgrades SunaHarness and SunaAgent across 5 core requirements with strict zero regression on all 1,438 existing tests:

- **R1: Performance & Memory Architecture**:
  - Fix Myers LCS `max > 25000` bailout bug in `suna_harness.js` that caused multi-megabyte corrupt patches on distributed edits.
  - Optimize Myers LCS: 32-bit integer line hashing, bounded edit distance ($D \le 4000$), compact prefix/suffix trimming, instant identical-file fast path. Target: < 100ms for 12,000 lines with 15 edits, < 10ms for 50,000 matching lines.
  - Implement full GC lifecycle methods in `suna_harness.js`: `VfsSandbox.reset()`, `destroy()`, `CheckpointManager.reset()`, `destroy()`, `pruneCheckpoints()`, `TrajectoryEngine.reset()`, `destroy()`, `HarnessController.reset()`, `destroy()`.
- **R2: Adversarial Fuzzing & Chaos Resilience**:
  - Sub-harness delegation recursion depth (5-tier ceiling) & sibling ID collision protection (`SUB_HARNESS_ALREADY_EXISTS`).
  - Preserve legacy invariant `SunaAgent.MAX_RECURSION_DEPTH = 4`.
  - CheckpointManager chaos recovery: preserve VFS directories on rewind, serialize and restore `TrajectoryEngine` events in IndexedDB store.
  - JsonAutoRepair extreme adversarial fuzzing: trailing backslash truncation, incomplete unicode escapes, leading commas, numeric/dotted unquoted keys, mid-primitive cutoffs.
- **R3: SmartMemory Adaptive Compression & Hash Index**:
  - Replace crude FIFO truncation with Information Density & Recency Weighting algorithm: $S(e) = \rho(e) \cdot (\beta_{\text{floor}} + (1 - \beta_{\text{floor}}) \cdot R(\Delta t))$ with 3-tier progressive compaction ensuring 100% preservation of architectural decisions and steering directives.
  - Hash-Indexed Working Memory: Namespaced addressing (`arch:`, `steer:`, `facts:`), inverted tag index, and rolling 32-bit FNV-1a checksum `_stateHash` for $O(1)$ mutation checks.
- **R4: Visualizer & Live Workspace HITL Integration**:
  - SunaHarnessVisualizer DOM rendering: Trajectory tree, Scorecard KPIs ($SR, \eta, FRR$), syntax-colored diff viewer.
  - Real-time HITL controls (`pause`, `resume`, `steer`, `rewind`) verified < 50ms latency.
  - Live Workspace 3-pane synchronization.
- **R5: Dual Runtime, Test Expansion & Zero Regression**:
  - Pure Vanilla JS (ES6+), zero external npm dependencies, Node.js + Browser UMD.
  - 100% green across all existing 1,438 tests + new test suites.
  - 0 syntax errors on `npm run check`.
  - `python run_verification.py` 100% GREEN across all 4 gates.

---

## 2. Milestone Decomposition

| Milestone | Scope | Key Deliverables | File Boundaries |
|---|---|---|---|
| **M-TEST** | Test Suite Expansion | Add test suites covering R1-R4 requirements, stress & adversarial tests | `tests/test_suna_harness.js`, `tests/test_suna_agent.js`, `tests/test_challenger_suna_agent_adversarial.js` |
| **M1** | R1 Myers LCS & VFS GC | Myers LCS optimization (<100ms / <10ms), eliminate `max > 25000`, VfsSandbox & HarnessController lifecycle methods (`reset`, `destroy`, `pruneCheckpoints`) | `suna_harness.js` |
| **M2** | R2 Adversarial & Chaos | Checkpoint directory & trajectory persistence, JsonAutoRepair edge cases, sub-harness sibling ID guard | `suna_harness.js`, `suna_agent.js` |
| **M3** | R3 SmartMemory & Hash Index | Information density & recency weighting compression, hash-indexed working memory, FNV-1a state checksum | `suna_agent.js` |
| **M4** | R4 Visualizer & HITL | Visualizer DOM rendering, HITL controls latency verification, Live Workspace sync | `suna_harness.js`, `suna_agent.js`, `app.js` |
| **M5** | R5 Final Verification & Gates | Run full 1,438+ tests, verify zero regression, run `npm run check`, `python run_verification.py`, audit gating | System-wide verification |

---

## 3. Execution Strategy (Test-First & Incremental Delivery)

1. **Step 1 (Test Expansion & M1 Implementation)**:
   - Worker implements M1 (Myers LCS optimization & VfsSandbox GC lifecycle) in `suna_harness.js` and adds corresponding performance/lifecycle test assertions in `tests/test_suna_harness.js`.
2. **Step 2 (M2 & M3 Implementation)**:
   - Worker implements M2 (Chaos resilience, checkpoint directory & trajectory persistence, JsonAutoRepair edge cases) and M3 (SmartMemory adaptive compression & hash-indexed working memory) in `suna_agent.js` and `suna_harness.js`, and adds tests to `tests/test_challenger_suna_agent_adversarial.js` and `tests/test_suna_agent.js`.
3. **Step 3 (M4 Verification & R5 Zero Regression)**:
   - Worker verifies M4 Visualizer & HITL latency, checks dual runtime exports, runs full Mocha suite, checks syntax hygiene (`node -c`), and executes `python run_verification.py`.
4. **Step 4 (Verification Gate)**:
   - Dispatch independent Reviewers, Challengers, and Forensic Auditor.
   - All gate verdicts must be APPROVE / CLEAN.
5. **Step 5 (Victory Audit Notification)**:
   - Notify Sentinel (parent) with full verification artifacts and victory audit report.
