## 2026-09-07T16:38:47Z

You are the Primary Implementation Worker for SunaAgent development (Milestone 1, 2, 3, 4 Integration).
Your working directory is: d:\Suna Chat\.agents\worker_m1_o6
Your caller/parent orchestrator is: 42ac3744-8c8f-4be3-ae11-274cf3c1d73d

MANDATORY FIRST STEP:
Read the authoritative user request at: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md (pay special attention to section ## 2026-09-07T16:12:49Z).
Read PROJECT.md at: d:\Suna Chat\PROJECT.md.
Read the architectural design blueprints authored by our specialist explorers:
- Cognitive Brain & Memory: d:\Suna Chat\.agents\explorer_m1_1_o6\cognitive_design.md
- Multi-Syntax Parser & Auto-Repair: d:\Suna Chat\.agents\explorer_m1_2_o6\parser_design.md
- UMD Module & Invariants: d:\Suna Chat\.agents\explorer_m1_3_o6\module_design.md
- E2E Test Suite: d:\Suna Chat\tests\test_suna_agent.js
- Test Ready Report: d:\Suna Chat\TEST_READY.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your write ownership:
You exclusively own:
- `d:\Suna Chat\suna_agent.js`
- `d:\Suna Chat\app.js` (bridge to window.SunaAgent while keeping the literal const SunaAgent = { ... } block intact to preserve Gate 4 static regex tests)
- `d:\Suna Chat\index.html` (include `<script src="suna_agent.js"></script>`)

Implementation Scope:
1. Implement `suna_agent.js`:
   - Pure Vanilla JS (ES6+), zero external npm dependencies.
   - Dual Runtime universal UMD pattern (Node.js CommonJS `module.exports`, ESM interop, Browser global `window.SunaAgent` / `root.SunaAgent`).
   - Classes to implement and export:
     - `JsonAutoRepair`: Normalizes smart quotes, quotes unquoted keys, replaces single quotes safely, strips trailing commas, fixes unescaped newlines, balances truncated unclosed braces/brackets.
     - `MultiSyntaxParser`: Parses XML tags (`<suna_tool_call>` / `<tool_call>`), Markdown ```json blocks, and native JSON function calls.
     - `StreamParser`: Streaming tool parser maintaining full backward compatibility with legacy tests.
     - `ExtendedThinkingStreamParser`: Parses `<think>`, `<thought>`, `<scratchpad>` blocks, emits real-time `thought_chunk` events, strips thinking blocks from final response text.
     - `SmartMemory`: Working Memory (Map of facts, goals, scratchpad, steer directives), Episodic Memory (timeline of steps), token estimation, token-threshold compaction, turn summarization.
     - `OodaBrain`: Closed-loop 5-stage cognitive brain (`analyzeIntent -> planHierarchy -> thinkExtended -> executeTool -> reflectObservation`), error classification, runaway loop protection.
     - `SunaAgent`: Main agent class and facade:
       - Preserves ALL Gate 4 invariants: `MAX_RECURSION_DEPTH: 4`, `reset()`, `abort()`, `isAgentAborted` boolean, `MOODS_WHITELIST`, `THEMES_WHITELIST`, `_registry: new Map()`, and 5 legacy tools (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`, `sandbox_exec`).
       - SunaHarness wiring: `attachHarness(harnessController, options)`, `invokeAciTool(toolName, rawArgs)` using `AciSchemaValidator.normalizeArgs`, `VfsDiffEngine.previewReplaceDiff`, and execution on `AciInterface`.
       - HITL hooks: `pause()`, `resume()`, `steer(instruction)`, `rewind(stepIndex)`.
       - Events: `emit('thought_chunk')`, `emit('diff_preview')`, `emit('vfs_change')`, `emit('status_change')`.
       - `executeStep(promptOrStep)` executing the full cognitive loop.
2. Update `index.html`:
   - Add `<script src="suna_agent.js"></script>` between `suna_harness.js` and `app.js`.
3. Update `app.js`:
   - Keep the literal `const SunaAgent = { ... }` block intact to ensure zero regression on static regex inspection tests in `test_dsh_zero_regression_matrix.js` and `test_dsh_tool_registry.js`.
   - Wire `window.SunaAgent` to `SunaAgent` at runtime.
4. Verification:
   Run the following verification commands and record their outputs:
   - `npx mocha tests/test_suna_agent.js`
   - `npm run check`
   - `npm test`
   - `python run_verification.py`
   All tests must pass 100% with zero regressions!

Deliverables:
- Write implementation report to: d:\Suna Chat\.agents\worker_m1_o6\worker_report.md
- Write self-contained handoff to: d:\Suna Chat\.agents\worker_m1_o6\handoff.md
- Notify parent orchestrator via send_message when complete.
