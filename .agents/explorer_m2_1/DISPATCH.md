# Task Assignment: M2 Explorer 1 — VfsDiffEngine Architecture & Git Patch Implementation

## Milestone
Milestone 2: Unified Git Diff & JSON Schema Validator (R2)

## Objectives
- Read `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` and `d:\Suna Chat\.agents\orchestrator_1\PROJECT.md`.
- Read prior survey artifacts:
  - `d:\Suna Chat\.agents\explorer_survey_1\survey_report.md`
  - `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md`
- Detail the implementation strategy for `VfsDiffEngine` in `suna_harness.js`:
  1. Myers / LCS line-diffing algorithm:
     - 1-indexed hunk numbering `@@ -l,s +l,s @@`.
     - Standard Git patch header: `--- a/path\n+++ b/path\n`.
     - Group changes within 3 context lines into unified hunks.
  2. Multi-file snapshot comparison:
     - `compareSnapshots(snapA, snapB)` returning file-level diffs and full unified patch.
     - Added files: `--- /dev/null\n+++ b/<path>\n@@ -0,0 +1,s @@`.
     - Deleted files: `--- a/<path>\n+++ /dev/null\n@@ -1,s +0,0 @@`.
     - Modified files: standard unified patch.
  3. Safe multi-byte string handling for Vietnamese UTF-8 characters and special symbols.
  4. Integration with `AciInterface._computeUnifiedDiff` (replace naive diff with `VfsDiffEngine`).
- Write findings to `d:\Suna Chat\.agents\explorer_m2_1\m2_diff_strategy.md` and `handoff.md`.

## 2026-09-07T14:12:46Z
You are explorer_m2_1.
Your working directory is d:\Suna Chat\.agents\explorer_m2_1.
Before starting work, you MUST read:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
- d:\Suna Chat\.agents\orchestrator_1\PROJECT.md
- d:\Suna Chat\.agents\explorer_m2_1\DISPATCH.md
- d:\Suna Chat\.agents\explorer_survey_1\survey_report.md
- d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md

Your task:
1. Detail the implementation strategy for VfsDiffEngine in suna_harness.js:
   - Myers/LCS algorithm for standard Git unified diffs with hunk headers @@ -l,s +l,s @@.
   - 3-line context grouping and patch generation.
   - compareSnapshots(snapA, snapB) with /dev/null for created/deleted files.
   - Vietnamese UTF-8 multi-byte character preservation.
2. Provide concrete method definitions, data structures, and hook points in suna_harness.js.
3. Write your findings to d:\Suna Chat\.agents\explorer_m2_1\m2_diff_strategy.md and your handoff.md. Report back via send_message.
