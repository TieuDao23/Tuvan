# Suna Agent Harness (SunaHarness) Orchestration Plan

## Overview
Design, build, and verify the Suna Agent Harness (`suna_harness.js`) for SunaChat, integrating SWE-agent ACI & VFS sandbox, LangGraph-style checkpointing & OpenHands immutable trajectory, grounded self-correction & chaos fault injection, and multi-tier benchmark evaluation with zero regression on all 828 existing tests.

## Phase 0: Codebase Survey [COMPLETED]
- Explorer 1 surveyed project structure, SunaAgent ReAct loop, delimiter markers, and 828 test baseline.
- Explorer 2 surveyed VFS Sandbox, SWE-agent ACI tools, and Trajectory / Checkpointing architecture.
- Explorer 3 surveyed Grounded Self-Correction, Chaos Fault Injector, Guardrails, and Benchmark Suite.
- Artifacts produced: `survey_codebase.md`, `survey_vfs_trajectory.md`, `survey_chaos_eval.md`, `PROJECT.md`, `TEST_INFRA.md`.

## Phase 1: Dual Track Execution [ACTIVE]
1. **Track 1 (E2E Test Suite)**:
   - Worker: `teamwork_preview_test_writer` (`test_writer_1`)
   - Target: `tests/test_suna_harness.js` (Tiers 1-4, >=138 tests) & `TEST_READY.md`.
2. **Track 2 (Implementation)**:
   - Worker: `teamwork_preview_worker` (`worker_1`)
   - Target: `suna_harness.js`, `app.js` bridge hook, `index.html` script tag.
   - Verification: `npm test` passes 100% (828 existing + all new tests), `npm run check` 0 syntax errors, `python run_verification.py` 100% green.

## Phase 2: Review & Adversarial Challenge [PENDING]
- 2 Independent Reviewers (`teamwork_preview_reviewer`): review correctness, completeness, interface compliance, zero regression.
- 2 Challengers (`teamwork_preview_challenger`): stress-test VFS boundaries, ReDoS, concurrent checkpoints, chaos injection under load.

## Phase 3: Forensic Integrity Audit [PENDING]
- Forensic Auditor (`teamwork_preview_auditor`): static analysis, runtime verification, zero-mocking check, anti-cheating audit.

## Phase 4: Gate & Final Delivery [PENDING]
- Gate check recorded in `GATE_STATUS.md`.
- Report to Sentinel.
