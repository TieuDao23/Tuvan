## 2026-09-20T15:24:26Z

You are the Test Writer (teamwork_preview_test_writer) for Milestone R2 (22 Tools Functional Integrity).
Your working directory is: d:\Suna Chat\.agents\test_writer_r2

MANDATORY INPUT:
Read the authoritative user request at:
d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
Pay special attention to section: ## Follow-up — 2026-09-20T14:39:06Z and requirement R2.

Also read:
- d:\Suna Chat\.agents\orchestrator_10\implementation_plan.md
- d:\Suna Chat\.agents\explorer_o10_survey_2\survey_report.md
- d:\Suna Chat\.agents\explorer_o10_survey_2\handoff.md

OBJECTIVE:
Following the Grounded Self-Correction Loop & Test-First protocol (RULE[user_global] § 2), author 25 comprehensive unit and integration tests for Milestone R2, split into:
1. 15 Visible Tests (60%) in `tests/test_suna_r2_visible.js`
2. 10 Hidden Tests (40%) in `tests/test_suna_r2_hidden.js`

TEST SPECIFICATIONS:
Cover all 7 requirements of Milestone R2:
1. `memory_store` Persistence & Deduplication:
   - Test that storing a new fact triggers `saveMemory(true)` and persists across reloads.
   - Test duplicate detection without premature array push in `app.js`.
2. `fs_patch` Universal Byte Length:
   - Test byte length calculation in `fs_patch` when `Buffer` is deleted/undefined and `TextEncoder` is deleted/undefined.
   - Verify `ReferenceError: content is not defined` does NOT occur.
   - Verify correct byte counts for ASCII and UTF-8 multi-byte strings.
3. `replace_file_content` Deletion Newline Hygiene:
   - Test deleting lines (e.g. deleting middle line 3 in a 5-line file with `replacementContent: ""`).
   - Verify result does NOT contain extraneous `\n\n` double newline.
   - Test deleting top line (line 1) and bottom line (line 5).
   - Test `previewReplaceDiff` when deleting content.
4. `fetch_page_summary` Network Error Handling:
   - Test network error when `fetchLinkContext` fails or throws.
   - Verify it returns `{ success: false, error: ... }` and DOES NOT return fake Vietnamese mock HTML ("Tiêu đề trang...", "Nội dung văn bản chính").
   - Verify that when explicit `mockHtml` parameter is provided, it is still respected.
5. `run_sandboxed_command` & `sandbox_exec`:
   - Test code with `const` and `let` statements (e.g. `const a = 1; let b = 2; return a + b;`) runs without `SyntaxError: Unexpected token 'const'`.
   - Test repeated execution of `const` declarations in same sandbox.
   - Test prototype constructor escape: `({}).constructor.constructor('return this')()` cannot access host `window` or `process`.
   - Test `readOnly` mode: mutating commands (`touch`, `rm`, `>`, `>>`, `mkdir`) via `run_sandboxed_command` are blocked.
6. Parameter Aliases Normalization:
   - Test `executeTool('view_file', { path: 'test.txt' })` accepts `path` as alias for `TargetFile`.
   - Test `executeTool('grep_search', { query: 'test', SearchPath: 'test.txt' })` accepts `query` as alias for `Query`.
   - Test `executeTool('run_sandboxed_command', { command: 'ls' })` accepts `command` as alias for `CommandLine`.
7. `vfs_change` Shell Redirection Sync:
   - Test that `run_sandboxed_command({ CommandLine: "echo test > test.txt" })` emits `vfs_change` event with target path and content.
   - Test redirection with `>>`.

CONSTRAINTS:
- You are a TEST WRITER. DO NOT modify any application code (`app.js`, `suna_harness.js`, `suna_agent.js`).
- Write only to `tests/test_suna_r2_visible.js` and `tests/test_suna_r2_hidden.js`.
- Use Mocha / Chai / Node assert conventions. Ensure tests run with `npx mocha --exit`.

OUTPUT:
Write your handoff report to `d:\Suna Chat\.agents\test_writer_r2\handoff.md`.
Document test counts and initial run against un-remediated code. Then send a completion message to parent (`orchestrator_10`).
