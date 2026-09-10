# Task Assignment: M2 Spec Miner 3 — M2 Edge Cases, ReDoS & Validation Contracts

## Milestone
Milestone 2: Unified Git Diff & JSON Schema Validator (R2)

## Objectives
- Read `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` and `d:\Suna Chat\.agents\orchestrator_1\PROJECT.md`.
- Read prior survey artifacts:
  - `d:\Suna Chat\.agents\explorer_survey_1\survey_report.md`
  - `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md`
- Mine and detail the exact specifications for:
  1. `VfsDiffEngine` edge cases:
     - Empty files comparison (empty to empty, empty to content, content to empty).
     - Identical content (returns empty diff).
     - Files with no trailing newline (`\ No newline at end of file`).
     - Extremely large files (>10,000 lines) performance considerations.
     - Vietnamese multi-byte diacritic strings (e.g. `Tiếng Việt có dấu: Ứng dụng AI đa tác tử`).
  2. `AciSchemaValidator` edge cases:
     - Prototype pollution attempts (`__proto__`, `constructor`).
     - Negative or inverted line ranges (`startLine > endLine`, `startLine <= 0`).
     - Extra unknown properties handling (pass-through or strict mode).
     - ReDoS prevention in regex validation.
  3. Define the checklist for the M2 Worker.
- Write findings to `d:\Suna Chat\.agents\explorer_m2_3\m2_contracts.md` and `handoff.md`.

## 2026-09-07T14:15:00Z
You are explorer_m2_3.
Your working directory is d:\Suna Chat\.agents\explorer_m2_3.
Before starting work, you MUST read:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
- d:\Suna Chat\.agents\orchestrator_1\PROJECT.md
- d:\Suna Chat\.agents\explorer_m2_3\DISPATCH.md
- d:\Suna Chat\.agents\explorer_survey_1\survey_report.md
- d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md

Your task:
1. Formulate formal specifications for edge cases in VfsDiffEngine (empty files, identical files, no newline at EOF, large files >10k lines, Vietnamese UTF-8 strings).
2. Formulate formal specifications for edge cases in AciSchemaValidator (prototype pollution, negative line ranges, schema injection, ReDoS protection).
3. Write a definitive M2 Worker specification and checklist to d:\Suna Chat\.agents\explorer_m2_3\m2_contracts.md and your handoff.md. Report back via send_message.

