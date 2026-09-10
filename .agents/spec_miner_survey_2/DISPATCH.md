# Task Assignment: Survey 2 — Specification & Requirements Mining

## Objectives
- Read `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` completely.
- Mine and formalize detailed specifications, constraints, and edge cases for all four requirements:
  - R1: Multi-Agent Sub-harness Delegation (`spawnSubHarness`, `share`/`clone`/`branch` modes, two-way Inter-Harness Event Bus, hierarchical trajectory stitching with tree representations).
  - R2: `VfsDiffEngine` (standard Git patch format `--- a/path\n+++ b/path\n@@ -l,s +l,s @@`, whitespace preservation, Vietnamese UTF-8 character safety) and `AciSchemaValidator` (JSON schema validation for all ACI tools, pre-validation diagnostics, bounds checking).
  - R3: Interactive UI Visualizer (DOM component in SunaChat, trajectory tree viewing, Benchmark Scorecard with Success Rate, Step Efficiency, Fault Recovery Rate metrics, side-by-side / unified diff visualizer) and Checkpoint persistence (IndexedDB `suna_harness_checkpoints_<uid>` serialization/restoration).
  - R4: Testing suite & adversarial fuzzing requirements (deep nesting $\ge 5$, schema injection, large file diffs >10k lines, zero regression on existing 982 tests).
- Specify exact data formats, error structures, event names, and method signatures.
- Write your comprehensive findings to `d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md` and your `handoff.md`.

## 2026-09-07T13:35:22Z
You are spec_miner_survey_2.
Your working directory is d:\Suna Chat\.agents\spec_miner_survey_2.
Before starting work, you MUST read:
- d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
- d:\Suna Chat\.agents\spec_miner_survey_2\DISPATCH.md

Your task:
1. Mine and extract detailed formal specifications and constraints for all 4 requirements from ORIGINAL_REQUEST.md:
   - R1: Sub-harness delegation (spawnSubHarness parameters, budget, share/clone/branch VFS semantics, two-way event bus protocol, trajectory stitching data structure).
   - R2: VfsDiffEngine (Git unified diff patch format specification, line indexing, Vietnamese UTF-8 character preservation) and AciSchemaValidator (JSON Schema schemas for all ACI tools, validation errors and error response formatting).
   - R3: SunaHarness UI Visualizer (DOM component requirements, trajectory tree rendering, benchmark scorecard formulas for Success Rate $, Step Efficiency η, Fault Recovery Rate $, diff viewer) and Checkpoint persistence (IndexedDB schema suna_harness_checkpoints_<uid>, serialization/deserialization).
   - R4: Testing, adversarial fuzzing scenarios (recursion depth >= 5, schema injections, 10k+ line diffs), and zero regression standards.
2. Formulate explicit function signatures, event payloads, schema definitions, and edge cases.
3. Write your complete findings to d:\Suna Chat\.agents\spec_miner_survey_2\spec_report.md.
4. Create your handoff.md in d:\Suna Chat\.agents\spec_miner_survey_2\handoff.md and report back to your parent orchestrator.

