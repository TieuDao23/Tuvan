# Implementation Plan — SunaAgent

## Overview
Xây dựng SunaAgent — Siêu Tác Nhân Tự Trị Độc Quyền Cho Hệ Sinh Thái SunaChat & SunaHarness.

## Phases
1. **Phase 0: Survey & Specification Mining**
   - Survey 1: SunaHarness architecture, ACI tools, VfsSandbox, VfsDiffEngine, AciSchemaValidator, InterHarnessEventBus.
   - Survey 2: SunaChat architecture, UI hooks, Live Workspace, DOM visualizer integration, Thought streaming.
   - Survey 3: Existing test suite analysis (1,226 tests), regression baseline, verification scripts.
2. **Phase 1: Architecture & PROJECT.md Formulation**
   - Decompose into Milestones (M1 Cognitive Brain, M2 Harness Integration, M3 Code Surgery & Self-Correction, M4 SunaChat UI & HITL, M5 Verification & Zero Regression).
   - Establish interface contracts and file layout.
3. **Phase 2: Milestone Execution Loop (Direct / Sub-orchestrator pattern)**
   - Explorer -> Worker -> Reviewers -> Challengers -> Forensic Auditor.
4. **Phase 3: E2E Dual Track & Final Verification**
   - 1,226 existing tests + new SunaAgent tests (100% pass).
   - Syntax check npm run check (0 errors).
   - python run_verification.py (100% green).
5. **Phase 4: Synthesis & Victory Claim Report**
