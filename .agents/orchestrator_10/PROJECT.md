# Project: Suna Agent Lifecycle, 22 Tools Functional Integrity & E2E Verification

## Architecture & System Overview
The Suna system provides an autonomous AI Agent (`SunaAgent`) powered by OODA/ReAct cognitive loops, paired with an ACI Tool Harness (`SunaHarness`) offering 22 developer and environment tools, and an interactive frontend (`app.js`).

### 1. SunaAgent Lifecycle & Core (R1)
- **Standalone Execution & Default VFS/Registry**: Ensure `SunaAgent` instantiates a default `VfsSandbox` and registers standard ACI tools in constructor and `run()`, eliminating the dependency on manual harness attachment.
- **Multi-Step ReAct Loop in `_runLegacy`**: Track `currentStepIndex` across steps, pass individual step objects to `executeStep`, and continue until all steps in the plan are satisfied.
- **Circuit Breaker Recovery in `steer()`**: Reset `consecutiveFailures`, clear `haltReason`, and actively restore `this.status = 'idle'` and `this.isAgentAborted = false`.
- **`MultiSyntaxParser` Discrimination**: Distinguish legitimate tool invocations from standard JSON manifests/configs (`package.json`, `tsconfig.json`) by filtering package manifest keys (`version`, `dependencies`, `scripts`) and requiring parameter structures.
- **`_boundObservation` Long Error Truncation**: Preserve structured error object wrappers with `isError: true` and `status: 'error'` when error strings exceed 1500 characters, preventing false positive reflection.

### 2. 22 Tools Functional Integrity (R2)
- **`memory_store` Persistence**: Resolve duplicate fact detection race in `app.js` so `saveMemory(true)` is reliably triggered when storing facts, ensuring persistent reload.
- **`fs_patch` Universal Byte Length**: Correct undeclared identifier `content.length` to `patched.length` in `app.js:4594`, guaranteeing failure-free execution in environments without `Buffer` or `TextEncoder`.
- **`replace_file_content` Deletion Hygiene**: In `suna_harness.js:830-834`, prevent pushing empty strings into `combined` on line deletion, eliminating extraneous `\n\n` blank lines.
- **`fetch_page_summary` Hallucination Prevention**: Remove fake Vietnamese HTML mock in `app.js:4447` on network/proxy failure, returning explicit `{ success: false, error: ... }`.
- **`run_sandboxed_command` & `sandbox_exec` Execution & Security**: Support `const`/`let` statement execution, close host constructor escape paths via `Object.constructor`, and add `run_sandboxed_command` to `mutatingTools` during `readOnly` mode.
- **Parameter Alias Normalization**: Invoke `AciSchemaValidator.normalizeArgs` prior to `validateParameters` in `executeTool` (`app.js` and `suna_agent.js`).
- **`vfs_change` Shell Redirection Sync**: Parse target file path from shell redirection operators (`>`, `>>`) in `run_sandboxed_command` and emit `vfs_change` for Live Workspace sync.

### 3. End-to-End Verification & Regression (R3)
- **Grounded Self-Correction (60% Visible / 40% Hidden)**: Author 60 automated tests (36 Visible / 24 Hidden) verifying all R1, R2, and R3 acceptance criteria.
- **Zero-Regression Full Suite**: Guarantee 100% pass rate on all 1,768+ existing Mocha tests with `--exit`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | SunaAgent Standalone Default VFS & ACI Tools | Auto-bind VfsSandbox and register ACI tools in constructor & run() | R1 | ORIGINAL_REQUEST §R1 |
| 2 | Multi-Step ReAct Loop Step Tracking | Implement `currentStepIndex` and sequential execution in `_runLegacy` | R1 | ORIGINAL_REQUEST §R1 |
| 3 | `agent.steer()` Unabort & Idle State Recovery | Reset `status = 'idle'`, `isAgentAborted = false`, and guardrails in `steer()` | R1 | ORIGINAL_REQUEST §R1 |
| 4 | `MultiSyntaxParser` JSON Manifest Filtering | Filter `package.json`/manifest keys and require parameters for tool calls | R1 | ORIGINAL_REQUEST §R1 |
| 5 | `_boundObservation` Error Flag Preservation | Retain error wrapper object and `isError: true` when truncated >1500 chars | R1 | ORIGINAL_REQUEST §R1 |
| 6 | `memory_store` Deduplication & Persistence | Trigger `saveMemory(true)` properly and avoid RAM-only fact duplication | R2 | ORIGINAL_REQUEST §R2 |
| 7 | `fs_patch` Universal Byte Length Fallback | Replace `content.length` with `patched.length` for safe universal fallback | R2 | ORIGINAL_REQUEST §R2 |
| 8 | `replace_file_content` Deletion Newline Hygiene | Eliminate extra `\n\n` on line deletion in harness and preview diff | R2 | ORIGINAL_REQUEST §R2 |
| 9 | `fetch_page_summary` Network Error Handling | Remove hardcoded mock HTML and return explicit failure on network error | R2 | ORIGINAL_REQUEST §R2 |
| 10 | Sandbox Statement Execution & Security | Support `const`/`let`, prevent constructor escape, enforce `readOnly` | R2 | ORIGINAL_REQUEST §R2 |
| 11 | Parameter Aliases Normalization | Call `AciSchemaValidator.normalizeArgs` before `validateParameters` in `executeTool` | R2 | ORIGINAL_REQUEST §R2 |
| 12 | `vfs_change` Shell Redirection Sync | Extract redirection target file path from `CommandLine` and emit event | R2 | ORIGINAL_REQUEST §R2 |
| 13 | Visible Test Suite (60% - 36 tests) | Author visible unit & integration tests covering R1, R2, and R3 | R3 | ORIGINAL_REQUEST §R3 |
| 14 | Hidden Test Suite (40% - 24 tests) | Author independent hidden tests validating against specification cheating | R3 | RULE[user_global] § 2 |
| 15 | Multi-Step ReAct Workflow E2E Test | Comprehensive end-to-end multi-turn agent test suite | R3 | ORIGINAL_REQUEST §R3 |
| 16 | Zero-Regression Suite Pass | Maintain 100% pass across all existing 1,768+ Mocha tests | R3 | ORIGINAL_REQUEST §R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | R1: Suna Agent Lifecycle & Core | `suna_agent.js` | none | DONE |
| 2 | R2: 22 Tools Functional Integrity | `app.js`, `suna_harness.js`, `suna_agent.js` | R1 | IN_PROGRESS |
| 3 | R3: E2E Verification & Full Regression | `tests/`, `npm test` | R1, R2 | PLANNED |

## Interface Contracts
### SunaAgent ↔ SunaHarness VFS
- `new SunaAgent(options)`:
  - If `options.vfs` provided, use it; else instantiate `new (getHarnessComponents().VfsSandbox)()`.
  - Auto-register standard ACI tools into `this.tools` via `getHarnessComponents().localHarness.registerAciTools(this)`.
- `agent.run(prompt, options)`:
  - If `!this.vfs`, lazy-bind `new (getHarnessComponents().VfsSandbox)()`.
  - If `this.tools.size === 0`, lazy-register standard ACI tools.
- `agent.steer(instruction)`:
  - Sets `this.status = 'idle'`, `this.isAgentAborted = false`, `this.consecutiveFailures = 0`, `this.haltReason = null`.

### MultiSyntaxParser ↔ Tool Invocation
- `MultiSyntaxParser.parse(text)`:
  - Skips JSON blocks containing manifest keys (`version`, `dependencies`, `devDependencies`, `scripts`, `main`, `repository`).
  - Requires explicit `args`, `arguments`, `parameters` or valid tool name matching registry.

### executeTool ↔ Parameter Validation
- `executeTool(toolName, rawArgs)`:
  - Normalize first: `const normalized = AciSchemaValidator.normalizeArgs(toolName, rawArgs);`
  - Validate second: `validateParameters(toolName, normalized);`
  - Invoke tool with `normalized`.

## Code Layout
- `suna_agent.js`: Core agent lifecycle, ReAct loops (`_runLegacy`, `executeStep`), `steer`, `MultiSyntaxParser`, `_boundObservation`, `executeTool`.
- `suna_harness.js`: ACI tools (`replace_file_content`, `run_sandboxed_command`, `sandbox_exec`, `AciSchemaValidator`).
- `app.js`: Frontend tool implementations (`memory_store`, `fs_patch`, `fetch_page_summary`, `executeTool`).
- `tests/test_suna_agent_lifecycle_r1.js`: Visible & hidden tests for R1.
- `tests/test_22_tools_functional_r2.js`: Visible & hidden tests for R2.
- `tests/test_e2e_react_workflow_r3.js`: Visible & hidden tests for R3 E2E.
