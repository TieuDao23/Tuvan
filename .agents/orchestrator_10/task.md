# Task Tracking: Suna Agent Lifecycle, 22 Tools & E2E Verification

## Phase 0: Survey & Architectural Planning
- [x] Dispatch 3 parallel Explorers (R1 Core, R2 Tools, R3 Testing)
- [x] Receive comprehensive survey reports from all 3 Explorers
- [x] Create `PROJECT.md` and `implementation_plan.md`
- [ ] User approval of `implementation_plan.md` ("APPROVED")

## Phase 1: Milestone R1 - Suna Agent Lifecycle & Core [COMPLETED]
- [x] Dispatch Worker to implement R1 fixes in `suna_agent.js`:
  - [x] Auto-bind default `VfsSandbox` and register standard ACI tools in constructor & `run()`
  - [x] Implement `currentStepIndex` and multi-step plan execution in `_runLegacy`
  - [x] Reset `status = 'idle'`, `isAgentAborted = false`, and guardrails in `steer()`
  - [x] Exclude manifest keys (`version`, `dependencies`, `scripts`) and require parameters in `MultiSyntaxParser`
  - [x] Retain error wrapper and `isError: true` on truncation in `_boundObservation`
- [x] Dispatch 2 Independent Reviewers for R1 (Both APPROVE)
- [x] Dispatch 2 Adversarial Challengers for R1 (Both APPROVE, 39 stress tests pass)
- [x] Dispatch Forensic Auditor for R1 (CLEAN verdict, 0 violations)
- [x] Milestone R1 Gate Evaluation (PASS)

## Phase 2: Milestone R2 - 22 Tools Functional Fixes
- [ ] Dispatch Worker to implement R2 fixes in `app.js`, `suna_harness.js`, `suna_agent.js`:
  - [ ] Fix `memory_store` deduplication race to ensure `saveMemory(true)` triggers persistence across reloads
  - [ ] Fix `fs_patch` byte length fallback: replace `content.length` with `patched.length`
  - [ ] Fix `replace_file_content` deletion newline hygiene: eliminate extra `\n\n` on line deletion
  - [ ] Remove fake Vietnamese HTML mock from `fetch_page_summary` on network failure
  - [ ] Fix `run_sandboxed_command` & `sandbox_exec`: allow `const`/`let` statements, block constructor escape, enforce `readOnly`
  - [ ] Normalize parameter aliases via `AciSchemaValidator.normalizeArgs` before `validateParameters` in `executeTool`
  - [ ] Parse target file path from shell redirection (`>`) in `run_sandboxed_command` and emit `vfs_change`
- [ ] Dispatch 2 Independent Reviewers for R2
- [ ] Dispatch 2 Adversarial Challengers for R2
- [ ] Dispatch Forensic Auditor for R2 (binary veto check)
- [ ] Milestone R2 Gate Evaluation

## Phase 3: Milestone R3 - End-to-End Verification & Full Regression
- [ ] Dispatch Test Writer to author 60 new tests (36 Visible 60% / 24 Hidden 40%):
  - [ ] `tests/test_suna_r1_r2_visible.js` (36 tests)
  - [ ] `tests/test_suna_r1_r2_hidden.js` (24 tests)
- [ ] Run full regression test suite (`npm test`) to ensure 100% pass (1,828+ tests PASS, 0 failures, exit code 0)
- [ ] Verify `npm run check` passes with 0 syntax errors
- [ ] Dispatch Final Forensic Auditor for system-wide integrity check
- [ ] Milestone R3 Gate Evaluation & Report to Sentinel for Victory Audit
