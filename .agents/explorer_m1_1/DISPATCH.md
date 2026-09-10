# Task Assignment: M1 Explorer 1 — Sub-harness Lifecycle & VFS Isolation Modes

## Milestone
Milestone 1: Sub-harness Delegation & Event Bus (R1)

## Objectives
- Read `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` and `d:\Suna Chat\.agents\orchestrator_1\PROJECT.md`.
- Read prior survey artifacts:
  - `d:\Suna Chat\.agents\explorer_survey_1\survey_report.md`
  - `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md`
- Detail the implementation strategy for `HarnessController.prototype.spawnSubHarness({ role, budget, vfsWorkspaceMode })`:
  - Mode `'share'`: shared memory reference to parent VFS.
  - Mode `'clone'`: deep snapshot clone restoring parent VFS state.
  - Mode `'branch'`: deep snapshot clone with changeset tracking and origin snapshot bookmarking.
  - Sub-harness turn budget, token budget, and lifecycle cleanup.
- Define exact method signatures, error handling, and hooks in `suna_harness.js`.
- Write your findings to `d:\Suna Chat\.agents\explorer_m1_1\m1_strategy.md` and `handoff.md`.

## 2026-09-07T13:43:46Z
You are explorer_m1_1.
Your working directory is d:\Suna Chat\.agents\explorer_m1_1.
Before starting work, you MUST read:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
- d:\Suna Chat\.agents\orchestrator_1\PROJECT.md
- d:\Suna Chat\.agents\explorer_m1_1\DISPATCH.md
- d:\Suna Chat\.agents\explorer_survey_1\survey_report.md
- d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md

Your task:
1. Detail the implementation strategy for HarnessController.prototype.spawnSubHarness({ role, budget, vfsWorkspaceMode }).
2. Map out how 'share', 'clone', and 'branch' modes interact with VfsSandbox.
3. Provide concrete code structure, method signatures, and state tracking for HarnessController in suna_harness.js.
4. Write your findings to d:\Suna Chat\.agents\explorer_m1_1\m1_strategy.md and your handoff.md. Report back via send_message.
