# Task Assignment: M1 Spec Miner 3 — M1 Contracts, Conflict Resolution & Edge Cases

## Milestone
Milestone 1: Sub-harness Delegation & Event Bus (R1)

## Objectives
- Read `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` and `d:\Suna Chat\.agents\orchestrator_1\PROJECT.md`.
- Read prior survey artifacts:
  - `d:\Suna Chat\.agents\explorer_survey_1\survey_report.md`
  - `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md`
- Mine and detail the exact specifications for:
  1. `mergeSubHarness(childId)` / branch conflict resolution:
     - Detecting file additions, modifications, and deletions.
     - Conflict detection when both parent and child modified the same file path.
     - Merge options: `'force'` vs `'safe'` (throw on conflict).
  2. Edge cases for Sub-harness delegation:
     - Deadlock prevention and child emergency stop.
     - Budget exhaustion propagation (token/turn cap).
     - Deep nesting recursion guards ($\ge 5$ levels).
- Define the contract checklist for the M1 Worker.
- Write your findings to `d:\Suna Chat\.agents\explorer_m1_3\m1_contracts.md` and `handoff.md`.

## 2026-09-07T13:43:46Z
You are explorer_m1_3.
Your working directory is d:\Suna Chat\.agents\explorer_m1_3.
Before starting work, you MUST read:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
- d:\Suna Chat\.agents\orchestrator_1\PROJECT.md
- d:\Suna Chat\.agents\explorer_m1_3\DISPATCH.md
- d:\Suna Chat\.agents\explorer_survey_1\survey_report.md
- d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md

Your task:
1. Formulate formal specifications for mergeSubHarness(childId) and VFS branch conflict detection.
2. Specify edge cases: recursion depth guard (depth >= 5), cycle detection, budget exhaustion handling, emergency stop cleanup.
3. Write a definitive M1 Worker specification and checklist to d:\Suna Chat\.agents\explorer_m1_3\m1_contracts.md and your handoff.md. Report back via send_message.

