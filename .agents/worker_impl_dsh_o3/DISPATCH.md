# Dispatch: Implementation Worker for DeepSeek Harness (dsh)

- Working directory: d:\Suna Chat\.agents\worker_impl_dsh_o3
- Exclusive write ownership: `app.js`, `styles.css`, `index.html`
- Authoritative request: `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md`
- Architecture & Contracts: `d:\Suna Chat\.agents\orchestrator_3\PROJECT.md`
- Blueprint References:
  - `d:\Suna Chat\.agents\spec_miner_survey_o3\report.md`
  - `d:\Suna Chat\.agents\explorer_codebase_o3\report.md`
  - `d:\Suna Chat\TEST_READY.md`
  - `d:\Suna Chat\TEST_INFRA.md`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Implementation Tasks
1. **Modular Tool Registry & Core Tools (M1)**:
   - Upgrade `SunaAgent` in `app.js` (around lines 2914–3250) to support `registerTool(def)`, `unregisterTool(name)`, `listTools()`, `getTool(name)`, `executeTool(name, args, ctx)`, `generatePromptDocs()`.
   - Implement JSON schema validator for parameter types (`string`, `number`, `boolean`, `object`, `array`, `enum`) and required fields.
   - Implement 11 core tools: `sandbox_exec`, `web_search_context`, `fetch_page_summary`, `fs_read`, `fs_write`, `fs_list`, `fs_patch`, `memory_query`, `memory_store`, `visualize_diagram`, `analyze_tabular`.
   - Preserve all 5 legacy tools (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`).
   - Keep `MAX_RECURSION_DEPTH: 4`, `MAX_RESULT_LENGTH: 1500`, `reset()`, `abort()`, and `StreamParser`.
2. **ReAct Execution Engine & System Prompting (M2)**:
   - In `buildSystemPrompt()` in `app.js`, inject `SunaAgent.generatePromptDocs()`.
   - In `generateAIResponse()` in `app.js`, implement multi-step ReAct loop with `MAX_RECURSION_DEPTH: 4` guard, tool error recovery/self-correction, abort handling, and record steps into `message.trajectory`.
3. **Trajectory View & Live Status UI (M3)**:
   - In `formatMessage(msg)` in `app.js`, render `.trajectory-chip` and collapsible `.trajectory-drawer` with `.trajectory-timeline` when `msg.trajectory` has steps.
   - In `app.js`, show `.agent-active-tool-indicator` when tool execution is in flight.
   - In `styles.css`, append Zen Glassmorphic UI styles for trajectory chip, drawer, timeline, and tool indicator. Ensure 100% brace balance and `.toast-container { z-index: 10000; }`.
4. **Verification**:
   - Run `node -c app.js && node -c redesign.js`
   - Run `npx mocha "tests/test_dsh_*.js"`
   - Run `python run_verification.py`
   - Ensure all 735 tests pass with 0 errors.
   - Write handoff report to `d:\Suna Chat\.agents\worker_impl_dsh_o3\handoff.md`.
