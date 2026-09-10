# Handoff Report: Suna Agent Harness — VFS Sandbox & Trajectory Architecture (R1 & R2)

**Agent:** Explorer 2 (VFS Sandbox & Trajectory Architecture Investigator)  
**Working Directory:** `d:\Suna Chat\.agents\explorer_survey_2\`  
**Target:** Suna Agent Harness (SunaHarness) Integration for SunaChat  
**Date:** 2026-09-07T12:32:45Z  

---

## 1. Observation

### 1.1 Existing Virtual File System (VFS) in `app.js`
In `app.js:3566-3718`, four VFS tools are currently registered: `fs_write`, `fs_read`, `fs_list`, and `fs_patch`.
- `State.vfs` is initialized as a flat dictionary:
  ```javascript
  // app.js:3575-3587
  if (!state.vfs && !state.virtualFS) state.vfs = {};
  const targetVfs = state.vfs || state.virtualFS;
  targetVfs[path] = {
    content,
    size: byteLength,
    lines: content.split('\n').length,
    updatedAt: Date.now()
  };
  ```
- **Live Workspace Sync** (`app.js:3589-3609`): When `path === 'index.html'`, `fs_write` and `fs_patch` update `#artifact-editor-textarea.value`, dispatch an `'input'` event, and set `#artifact-iframe.srcdoc = content`.
- **Workspace Compilation** (`app.js:8612-8648`): `compileVfsToSrcDoc(vfs)` takes `vfs` and bundles `index.html` with linked `<link rel="stylesheet" href="*.css">` and `<script src="*.js">` into a self-contained HTML document for the iframe preview.
- **Limitation**: The current VFS uses flat string keys (`targetVfs[path]`), lacks a hierarchical tree model, lacks directory listing (`list_dir`), lacks path normalization and sandboxing against path traversal, and lacks SWE-agent style surgical file tools (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `run_sandboxed_command`).

### 1.2 Existing Trajectory & ReAct Loop in `app.js`
In `app.js:3958-4064`:
- `handleToolCalls(rawCallsArray, context)` executes tool calls and records a mutable JavaScript array:
  ```javascript
  // app.js:4038-4047
  trajectory.push({
    step: currentDepth,
    tool: toolName,
    thought,
    params: toolArgs,
    result: !isError ? observation : undefined,
    error: isError ? observation : undefined,
    durationMs,
    timestamp: Date.now()
  });
  ```
- `renderTrajectoryView(trajectory)` (`app.js:8566-8610`) renders `.trajectory-chip` (e.g. `⚡ 3 bước suy luận 45ms`) and a collapsible `.trajectory-drawer` containing `.trajectory-step-node` elements.
- **Limitation**: Trajectory records are mutable objects. There is **no state checkpointing** (no snapshots of `State.vfs` or `State.memory.facts`), **no time-travel debugging** (`rewind`, `pause`, `resume`, `replay`), and **no serialization to JSONL or clean Markdown**.

### 1.3 Baseline Verification Status
Direct execution of existing verification commands confirmed:
- `npm run check` (`node -c app.js && node -c redesign.js`): Exited with code 0 (0 syntax errors).
- `npm test` (`npx mocha "tests/**/*.js"`): Exited with code 0, **828 passing tests (9s)**, 0 failing, 0 pending across all feature, adversarial, and invariant test suites.

---

## 2. Logic Chain

1. **Safety & Host Isolation Requirement**:
   - The user request requires that the VFS operates completely in RAM without leaking to host disk or executing arbitrary OS commands.
   - *Observation*: Existing `fs_write` operates on `State.vfs` in memory, but lacks path normalization (`normalizePath`) to prevent sandbox escaping (`../`), and lacks directory tree management.
   - *Inference*: A dedicated `VfsSandbox` class must manage in-memory files and directories, standardizing all paths into POSIX relative format, and safely handling subdirectories with automatic parent creation (`mkdir -p`).

2. **SWE-agent Style ACI Adoption**:
   - High LLM context consumption and file edit hallucinations occur when agents are forced to read or rewrite entire files.
   - *Observation*: Existing `fs_read` dumps entire file strings into conversation context, and `fs_patch` only performs single global substring replacements.
   - *Inference*: Implementing `view_file` with 1-indexed line numbers and sliding windows (`startLine`, `endLine`, 800-line / 46KB caps) and `replace_file_content` with line range verification, unique chunk matching, and mismatch diagnostic feedback will drastically improve agent accuracy and reduce token waste.
   - Adding in-memory `grep_search`, `find_by_name`, `list_dir`, and `run_sandboxed_command` (emulating `ls`, `cat`, `grep`, `head`, `tail`, `wc`, `diff`, `echo`, `node -e` in RAM) equips the agent with complete Unix-like workbench capabilities without invoking real OS processes.

3. **Controller vs Agent Separation**:
   - *Observation*: Currently, `SunaAgent` in `app.js` intermixes prompt formatting, tool dispatch, whitelist checks, recursion limits, and error handling in a single object.
   - *Inference*: Decoupling into `HarnessController` (handles lifecycle, turn budget, token ceilings, read-only permissions, and execution timeouts) and `HarnessAgent` (pure cognitive reasoning, system prompting, and tool call selection) provides robust defense against runaway loops and out-of-budget execution.

4. **Observability & Checkpointing (LangGraph & OpenHands)**:
   - *Observation*: Currently, if an agent makes an erroneous file edit at step 3 of a 5-step loop, there is no way to rewind `State.vfs` or replay from step 2.
   - *Inference*: Implementing `CheckpointManager` to snapshot VFS state (optimized via Copy-on-Write structural sharing) and memory facts after each step allows time-travel debugging: `rewind(stepIndex)`, `pause()`, `resume()`, and `replay()`.
   - Recording an immutable, append-only event stream (`TrajectoryEventStream`) enables 1-click export to standard `.jsonl` (for benchmarks like SWE-bench/AgentBench) and clean Markdown audit reports.

5. **Zero-Regression Integration**:
   - *Observation*: All 828 existing tests depend on `State.vfs`, `SunaAgent.tools.fs_write`, `fs_read`, `fs_list`, `fs_patch`, and `MAX_RECURSION_DEPTH: 4`.
   - *Inference*: SunaHarness should be implemented in a dedicated, universally exportable module (`suna_harness.js`) and bridged into `SunaAgent`. `State.vfs` will remain the backing store for legacy tool calls, ensuring 100% backward compatibility and 0 test failures.

---

## 3. Caveats

1. **Browser vs Node.js Text Encoding**: In Node.js, `Buffer.byteLength` is standard, whereas in browser environments, `new TextEncoder().encode(str).length` must be used. `VfsSandbox` must support both transparently.
2. **Regex ReDoS Guard**: In `grep_search`, user/agent regexes could theoretically cause catastrophic backtracking. A safety timeout or length clamp must wrap all regex evaluations.
3. **Single File Workspace vs Multi-file Workspace**: The current Live Workspace preview iframe primarily displays `index.html`. SunaHarness's `compileVfsToSrcDoc` already injects linked CSS and JS from VFS, but hot-reloading non-HTML projects requires continued reliance on `compileVfsToSrcDoc`.

---

## 4. Conclusion

The architectural design for R1 (VFS Sandbox & SWE-agent ACI) and R2 (Trajectory Event Stream & State Checkpointing) is thoroughly defined, validated against the existing codebase, and documented in detail in `d:\Suna Chat\.agents\explorer_survey_2\survey_vfs_trajectory.md`.

### Core Recommendations:
1. **Module Architecture**: Package the harness in `suna_harness.js` exporting `{ VfsSandbox, TrajectoryEventStream, CheckpointManager, HarnessController }`.
2. **VFS & ACI Suite**: Implement `VfsSandbox` with in-memory isolation and the complete SWE-agent ACI toolset (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `list_dir`, `run_sandboxed_command`).
3. **Controller Governance**: Enforce `maxSteps` (10-25), token budgets, read-only modes, and timeout guards in `HarnessController`.
4. **Trajectory & Checkpoints**: Enforce immutable event logs in `TrajectoryEventStream`, provide atomic snapshots with CoW structural sharing in `CheckpointManager`, and support `rewind()`, `pause()`, `resume()`, `replay()`, JSONL export, and Markdown summary generation.
5. **Bridge & Compatibility**: Wire `SunaHarness` into `SunaAgent` in `app.js` while maintaining all existing tool signatures (`fs_write`, `fs_read`, `fs_list`, `fs_patch`), guaranteeing zero regression across all 828 tests.

---

## 5. Verification Method

To independently verify this investigation and the recommendations:
1. **Syntax Integrity**: Run `npm run check` (or `node -c app.js && node -c redesign.js`). Must exit with code 0.
2. **Existing Test Suite**: Run `npm test` (or `npx mocha "tests/**/*.js"`). Confirm all 828 tests pass.
3. **Inspect Specification Document**:
   - Open and review `d:\Suna Chat\.agents\explorer_survey_2\survey_vfs_trajectory.md`.
   - Verify all sections: Gap Analysis, VFS Sandbox, SWE-agent ACI, Controller vs Agent separation, Trajectory Event Stream, LangGraph Checkpointing & Replay, JSONL/Markdown export, and Live Workspace integration.
4. **Invalidation Conditions**:
   - Any requirement for VFS to access host physical disk or spawn native OS child processes invalidates the isolation model.
   - Any breaking change to `State.vfs` structure that causes existing Mocha tests in `tests/test_dsh_core_tools.js` to fail invalidates the zero-regression guarantee.
