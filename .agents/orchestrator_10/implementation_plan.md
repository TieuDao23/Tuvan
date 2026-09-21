# Implementation Plan: Suna Agent Lifecycle, 22 Tools Functional Integrity & E2E Verification

## 1. Executive Summary & Architectural Overview
Based on deep technical survey by 3 specialized explorers (`explorer_o10_survey_1`, `explorer_o10_survey_2`, `explorer_o10_survey_3`), this plan provides a comprehensive, surgical, and zero-regression remediation for all reported defects across:
- **Milestone R1**: Suna Agent Lifecycle & Core (`suna_agent.js`)
- **Milestone R2**: 22 Tools Functional Integrity (`app.js`, `suna_harness.js`, `suna_agent.js`)
- **Milestone R3**: End-to-End ReAct Agent Workflow & Full Test Suite Regression (1,768+ tests)

---

## 2. Proposed Changes & Technical Blueprints

### Milestone R1: Suna Agent Lifecycle & Core (`suna_agent.js`)

#### R1.1. SunaAgent Standalone Execution & Default VFS/Registry
- **File**: `suna_agent.js` (lines 33–38, 1107–1112, 1578, 2095)
- **Problem**: In constructor, `this.vfs` is hardcoded to `null`. `registerAciTools` is mistakenly invoked on the `SunaAgent` class rather than an instance. When `run()` is executed on a standalone agent, `executeStep` throws `Harness VFS not attached`, tripping the circuit breaker after 3 failures.
- **Remediation**:
  1. In constructor, support `options.vfs || new (getHarnessComponents().VfsSandbox)()`.
  2. Instantiate and register ACI tools directly on the instance: `getHarnessComponents().localHarness.registerAciTools(this)`.
  3. In `run()`, ensure lazy binding: if `!this.vfs`, bind a default `VfsSandbox`; if `this.tools.size === 0`, register standard tools.

#### R1.2. Multi-Step ReAct Loop in `_runLegacy`
- **File**: `suna_agent.js` (lines 1763–1764, 2135–2163)
- **Problem**: `executeStep` only selects `plan[0]`. `_runLegacy` has a `while(turn < maxTurns)` loop that hits `finalStatus = 'completed'; break;` after turn 1 if no replan is requested, terminating multi-step tasks after step 1.
- **Remediation**:
  1. In `_runLegacy`, generate plan once if not already provided.
  2. Maintain `currentStepIndex = 0`.
  3. On each iteration, pass `plan[currentStepIndex]` as `activeStep` to `executeStep`.
  4. When `stepResult.reflection.satisfied === true`, advance `currentStepIndex++`.
  5. Only break with `finalStatus = 'completed'` when `currentStepIndex >= plan.length`.

#### R1.3. `agent.steer()` Unabort & Idle Recovery
- **File**: `suna_agent.js` (lines 1695–1705)
- **Problem**: `steer()` clears failure counters and `haltReason`, but fails to reset `this.status = 'idle'` and `this.isAgentAborted = false`. Subsequent calls to `executeStep` immediately abort.
- **Remediation**:
  1. In `steer(instruction)`, explicitly assign `this.status = 'idle';` and `this.isAgentAborted = false;`.
  2. Clear any circuit breaker flags and reset error guardrails to allow normal resumption.

#### R1.4. `MultiSyntaxParser` Tool vs JSON Data Discrimination
- **File**: `suna_agent.js` (lines 330–355)
- **Problem**: `if (parsed && (parsed.tool || parsed.name))` misidentifies any JSON document possessing a `name` key (such as `package.json`) as a tool call.
- **Remediation**:
  1. Exclude standard manifest/package keys: `version`, `dependencies`, `devDependencies`, `scripts`, `main`, `author`, `license`, `repository`.
  2. Require explicit tool arguments/parameters (`args`, `arguments`, `parameters`) or require that `parsed.tool || parsed.name` match a known tool in `this.tools` / standard schema.

#### R1.5. `_boundObservation` Long Error Truncation
- **File**: `suna_agent.js` (lines 1443–1457)
- **Problem**: When observation exceeds 1500 chars, `_boundObservation` replaces `value` with a raw string, dropping `isError: true` and `status: 'error'`. `reflectObservation` checks `!isError && typeof observation === 'string'` and incorrectly claims "succeeded cleanly".
- **Remediation**:
  1. When truncating, preserve the original object structure: return `{ ...value, text: truncatedText, truncated: true }` or wrap with `isError: true`, `status: 'error'`.
  2. Ensure `isError` flag and error status survive truncation so reflection accurately recognizes failures.

---

### Milestone R2: 22 Tools Functional Integrity (`app.js`, `suna_harness.js`, `suna_agent.js`)

#### R2.1. `memory_store` Deduplication & Persistence
- **File**: `app.js` (lines 4649, 5474–5489)
- **Problem**: `state.memory.facts.push(memoryEntry)` runs before calling `addMemoryFact(fact, category)`. `addMemoryFact` checks for duplicates, finds the fact just pushed, returns early, and never executes `saveMemory(true)`. Facts are lost on page refresh.
- **Remediation**:
  1. Call `addMemoryFact` directly without prior manual pushing, allowing it to perform deduplication and invoke `saveMemory(true)`.
  2. If already exists in RAM, avoid double-push and ensure dirty persistence flag is synced.

#### R2.2. `fs_patch` Universal Byte Length
- **File**: `app.js` (line 4594)
- **Problem**: In `fs_patch`, the fallback in the ternary is `: content.length`. `content` is undefined (the variable is `patched`), throwing `ReferenceError: content is not defined` when `Buffer` and `TextEncoder` are absent.
- **Remediation**:
  1. Change `content.length` to `patched.length`.
  2. Provide a universal UTF-8 byte length calculation fallback: `encodeURIComponent(patched).replace(/%[A-F\d]{2}/g, 'U').length`.

#### R2.3. `replace_file_content` Deletion Newline Hygiene
- **File**: `suna_harness.js` (lines 830–834, 1816)
- **Problem**: When deleting lines (`replacedSlice === ""`), pushing `""` into `combined` causes `.join('\n')` to insert `\n\n`. Similarly, `"".split('\n')` produces `[""]`.
- **Remediation**:
  1. In `suna_harness.js:830-834`, only push `replacedSlice` if `replacedSlice.length > 0`.
  2. In `previewReplaceDiff` and line-based replacements, handle empty `replacementContent` by omitting the chunk from array concatenation rather than injecting an empty line string.

#### R2.4. `fetch_page_summary` Network Error Mock Removal
- **File**: `app.js` (lines 4447–4449)
- **Problem**: On network failure, `app.js` synthesizes a fake Vietnamese HTML page ("Tiêu đề trang..."), inducing AI hallucinations.
- **Remediation**:
  1. Remove the fake HTML fallback.
  2. If `fetchLinkContext` fails or returns an error and no explicit `args.mockHtml` is provided, return `{ success: false, error: 'Network request failed: ' + err.message }`.

#### R2.5. `run_sandboxed_command` & `sandbox_exec` Execution & Security
- **File**: `suna_harness.js` (lines 3250, 3701, 3742), `app.js` (line 4357)
- **Problem**: Wrapping code in `(${code})` causes syntax errors on `const`/`let` statements; host constructor is accessible via `({}).constructor.constructor('return this')()`; and `run_sandboxed_command` is missing from `mutatingTools` during `readOnly` mode.
- **Remediation**:
  1. In `suna_harness.js` and `app.js`, evaluate statements without expression wrapping: execute via clean wrapper function or Node `vm.runInNewContext`.
  2. Protect host constructor: freeze or sanitize prototype constructor access (`Object.freeze(Object.prototype)` or proxy trap).
  3. Add `run_sandboxed_command` to `mutatingTools` in `suna_harness.js:3701` and check for file mutation commands (`touch`, `rm`, `>`, `>>`, `mkdir`) to enforce `readOnly`.

#### R2.6. Parameter Aliases Normalization
- **File**: `app.js` (line 4826), `suna_agent.js` (line 1938)
- **Problem**: `executeTool` invokes `validateParameters` on raw arguments before `AciSchemaValidator.normalizeArgs`, rejecting valid aliases (`TargetFile`/`path`, `CommandLine`/`command`, `Query`/`query`).
- **Remediation**:
  1. In `executeTool`, normalize arguments first: `const normalized = AciSchemaValidator.normalizeArgs(toolName, rawArgs);`.
  2. Pass `normalized` to `validateParameters(toolName, normalized)` and to the tool implementation.

#### R2.7. `vfs_change` Shell Redirection Sync
- **File**: `suna_agent.js` (lines 1636–1642)
- **Problem**: For `run_sandboxed_command`, `targetPath` is checked on `normalized.TargetFile || normalized.path`, which is undefined. The path after `>` in `CommandLine` is ignored, so `vfs_change` is never emitted.
- **Remediation**:
  1. In `suna_agent.js`, if `toolName === 'run_sandboxed_command'` and `rawArgs.CommandLine` contains `>`:
  2. Parse the target file path: `const match = rawArgs.CommandLine.match(/>>\s*['"]?([^'">\s]+)['"]?|>\s*['"]?([^'">\s]+)['"]?/);`.
  3. Resolve the path against `cwd` and emit `vfs_change` with file content when the file exists in VFS.

---

### Milestone R3: E2E Verification & Full Regression Suite

#### R3.1. Grounded Self-Correction Test Splits (60% Visible / 40% Hidden)
Total 60 new tests across 2 test files:
- `tests/test_suna_r1_r2_visible.js` (36 tests - 60%):
  - 12 tests for R1 (SunaAgent lifecycle, constructor VFS, `_runLegacy` multi-step, `steer()`, `MultiSyntaxParser`, `_boundObservation`).
  - 15 tests for R2 (memory persistence, fs_patch, replace_file_content newline hygiene, fetch_page_summary network error, sandbox const/let & security, parameter alias normalization, vfs_change redirection).
  - 9 tests for R3 (E2E multi-step ReAct agent workflow, full tool execution, live sync).
- `tests/test_suna_r1_r2_hidden.js` (24 tests - 40%):
  - 8 tests for R1 edge cases (aborted agent during multi-turn steering, deeply nested JSON in parser, huge stack traces >5000 chars).
  - 10 tests for R2 edge cases (multiline deletion newline hygiene, concurrent memory saves, prototype pollution attempts in sandbox, quoted redirection paths `> "path with space/file.txt"`).
  - 6 tests for R3 complex workflows (3-step ReAct loop with tools, self-correction on tool error).

#### R3.2. Full Regression Suite Guarantee
- Run `npm test` (`npx mocha --exit --timeout 15000 "tests/**/*.js"`).
- Target: 100% PASS (1,768+ existing tests + 60 new tests = 1,828+ tests PASS, 0 failures).

---

## 3. Implementation Workflow & Delegation Plan
As a DISPATCH-ONLY Project Orchestrator:
1. **Worker Delegation (R1)**: Dispatch `teamwork_preview_worker` to apply R1 code changes in `suna_agent.js`.
2. **Review & Challenge (R1)**: Dispatch 2 Reviewers (`teamwork_preview_reviewer`) and 2 Challengers (`teamwork_preview_challenger`).
3. **Forensic Audit (R1)**: Dispatch Forensic Auditor (`teamwork_preview_auditor`).
4. **Worker Delegation (R2)**: Dispatch `teamwork_preview_worker` to apply R2 code changes in `app.js`, `suna_harness.js`, `suna_agent.js`.
5. **Review & Challenge (R2)**: Dispatch 2 Reviewers, 2 Challengers, and Forensic Auditor.
6. **Test Writer & E2E (R3)**: Dispatch `teamwork_preview_test_writer` to author Visible (60%) and Hidden (40%) test suites.
7. **Full Verification**: Run `npm run check` and full `npm test` suite.
8. **Final Victory Audit**: Verify all criteria and report back to Sentinel.
