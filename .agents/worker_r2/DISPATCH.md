## 2026-09-20T15:36:32Z

You are the Implementation Worker (teamwork_preview_worker) for Milestone R2 (22 Tools Functional Integrity).
Your working directory is: d:\Suna Chat\.agents\worker_r2

MANDATORY INPUT:
Read the authoritative user request at:
d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
Pay special attention to section: ## Follow-up — 2026-09-20T14:39:06Z and requirement R2.

Also read:
- d:\Suna Chat\.agents\orchestrator_10\implementation_plan.md
- d:\Suna Chat\.agents\explorer_o10_survey_2\survey_report.md
- d:\Suna Chat\.agents\explorer_o10_survey_2\handoff.md
- d:\Suna Chat\.agents\test_writer_r2\handoff.md
- d:\Suna Chat\tests\test_suna_r2_visible.js
- d:\Suna Chat\tests\test_suna_r2_hidden.js

FILE OWNERSHIP:
You own and modify:
- `d:\Suna Chat\app.js`
- `d:\Suna Chat\suna_harness.js`
- `d:\Suna Chat\suna_agent.js`
DO NOT touch test files in `tests/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

OBJECTIVE:
Implement the 7 required fixes across `app.js`, `suna_harness.js`, and `suna_agent.js` with surgical precision and zero regressions:
1. `memory_store` Persistence & Deduplication
2. `fs_patch` Universal Byte Length
3. `replace_file_content` Deletion Newline Hygiene
4. `fetch_page_summary` Network Error Handling
5. `run_sandboxed_command` & `sandbox_exec`
6. Parameter Aliases Normalization
7. `vfs_change` Shell Redirection Sync

VERIFICATION REQUIREMENTS:
Run and verify:
1. `node -c app.js; node -c suna_harness.js; node -c suna_agent.js`
2. `npm run check` (0 errors)
3. `npx mocha --exit tests/test_suna_r2_visible.js` (15/15 PASS)
4. `npx mocha --exit tests/test_suna_r2_hidden.js` (10/10 PASS)
5. `npx mocha --exit tests/test_suna_r1_visible.js tests/test_suna_r1_hidden.js` (20/20 PASS - zero regression on R1)
6. `npx mocha --exit tests/test_dsh_core_tools.js` (All existing tool tests PASS)
