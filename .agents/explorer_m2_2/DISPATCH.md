# Task Assignment: M2 Explorer 2 — AciSchemaValidator Architecture & Tool Integration

## Milestone
Milestone 2: Unified Git Diff & JSON Schema Validator (R2)

## Objectives
- Read `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` and `d:\Suna Chat\.agents\orchestrator_1\PROJECT.md`.
- Read prior survey artifacts:
  - `d:\Suna Chat\.agents\explorer_survey_1\survey_report.md`
  - `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md`
- Detail the implementation strategy for `AciSchemaValidator` in `suna_harness.js`:
  1. JSON Schema specifications for all 6 SWE-agent ACI tools:
     - `view_file`: path/file required, optional line range (`startLine`, `endLine`).
     - `replace_file_content`: path required, `targetContent`, `replacementContent`, optional line range.
     - `grep_search`: query required, optional path.
     - `find_by_name`: pattern required, optional directory.
     - `list_dir`: directory required.
     - `run_sandboxed_command`: command required, timeout optional.
  2. Parameter alias normalization:
     - Map `TargetFile` -> `path`, `TargetContent` -> `targetContent`, `Query` -> `query`, etc. so existing tests and callers succeed seamlessly.
  3. Pre-validation diagnostic responses:
     - Check types, required fields, and range bounds *before* executing VFS methods.
     - Return structured diagnostic errors (`{ valid: false, errors: [...] }`) with hints for `SelfCorrectionLoop`.
  4. Hook into `AciInterface.prototype.execute(toolName, args)` and export on `SunaHarness`.
- Write findings to `d:\Suna Chat\.agents\explorer_m2_2\m2_schema_strategy.md` and `handoff.md`.

## 2026-09-07T14:12:47Z
You are explorer_m2_2.
Your working directory is d:\Suna Chat\.agents\explorer_m2_2.
Before starting work, you MUST read:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
- d:\Suna Chat\.agents\orchestrator_1\PROJECT.md
- d:\Suna Chat\.agents\explorer_m2_2\DISPATCH.md
- d:\Suna Chat\.agents\explorer_survey_1\survey_report.md
- d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md

Your task:
1. Detail the implementation strategy for AciSchemaValidator in suna_harness.js:
   - Complete JSON Schema specifications for all 6 ACI tools (view_file, replace_file_content, grep_search, find_by_name, list_dir, run_sandboxed_command).
   - Parameter alias normalization (TargetFile -> path, TargetContent -> targetContent, etc.).
   - Pre-validation diagnostics and error structures.
   - Hook points in AciInterface.prototype.execute and exports on SunaHarness.
2. Provide concrete class definitions, schema dictionaries, and diagnostic formatting methods.
3. Write your findings to d:\Suna Chat\.agents\explorer_m2_2\m2_schema_strategy.md and your handoff.md. Report back via send_message.
