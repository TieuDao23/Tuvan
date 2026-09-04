# Handoff Report: Spec Miner Survey for DeepSeek Harness (dsh) Integration

**Milestone**: SunaAgent DeepSeek Harness (dsh) Architectural Survey & Specification  
**Agent**: Spec Miner (`teamwork_preview_spec_miner`)  
**Working Directory**: `d:\Suna Chat\.agents\spec_miner_survey_o3`  
**Date**: 2026-09-04  
**Type**: Hard Handoff (Task Complete)

---

## 1. Observation

1. **Current SunaAgent Implementation in `app.js`**:
   - Defined at lines 2914–3250 within `// === START OF agent.js ===` to `// === END OF agent.js ===`.
   - Instantiated as `const SunaAgent = { ... }` and assigned to `window.SunaAgent = SunaAgent;` at line 3248.
   - Streaming state machine `StreamParser` (lines 2920–2998) parses `<suna_tool_call>` chunks during SSE streaming, accumulating filtered text in `this.filteredText` and raw tool calls in `this.toolCalls`.
   - Tool dictionary `SunaAgent.tools` (lines 3020–3174) contains 5 hardcoded local tools: `change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, and `update_user_profile`.
   - Recursion depth limit `MAX_RECURSION_DEPTH = 4` (line 3004); result truncation limit `MAX_RESULT_LENGTH = 1500` (line 3005).
   - Abort hooks: `reset()` (line 3008) sets `window.isAgentAborted = false`; `abort()` (line 3011) sets `window.isAgentAborted = true`.

2. **ReAct & Tool Call Execution in `app.js`**:
   - Lines 6660–6667 hook `SunaAgent.reset()` and `State.abortController.signal.addEventListener('abort', ...)` before request initiation.
   - Lines 7107–7151 check `const toolCalls = parser ? parser.toolCalls : []`:
     - If `(State.agentRecursionDepth || 0) >= window.SunaAgent.MAX_RECURSION_DEPTH`, logs warning and posts system message: `"⚠️ Lỗi: Đã đạt giới hạn số lần gọi công cụ liên tiếp (4)..."`.
     - Otherwise increments `State.agentRecursionDepth`, updates typing indicator text to `"Suna đang chạy công cụ..."`, executes `window.SunaAgent.handleToolCalls(toolCalls)`, pushes observation text as a user message (`role: 'user', content: observationBlock`), and recursively calls `generateAIResponse()`.

3. **System Prompt Construction in `app.js`**:
   - `buildSystemPrompt()` (lines 6388–6473) compiles identity, user authority, memory facts (`getMemoryPrompt()`), pinned context, tone, mode (Flash vs Pro), anti-placeholder directives, vision rules, web search directives, and special formats (Mindmap, Live Workspace, Task list, Document analyzer).
   - **Critical Absence**: `buildSystemPrompt()` contains zero instructions about tool definitions or the `<suna_tool_call>` protocol. The LLM has no prompt awareness of available tools.

4. **UI & Workspace Synchronization in `app.js` & `index.html`**:
   - Live Workspace helpers: `extractWorkspaceCode(responseText)` (lines 1931–1958) extracts runnable code; `autoApplyWorkspaceCode(newCode)` (lines 1960–1983) updates `#artifact-editor-textarea.value`, dispatches `new Event('input', { bubbles: true })`, updates `#artifact-iframe.srcdoc`, and triggers a success toast.
   - Thinking Accordion blocks: `formatMessage` (lines 5198–5248) renders `<think>` / `<thought>` blocks as glassmorphic accordions styled by `.thinking-block-wrapper` in `styles.css` (lines 1496–1600).
   - `index.html` only loads `app.js` via `<script src="app.js?v=7"></script>` (line 924). `redesign.js` is an independent stub exporting `{ version: '2.0.0' }`.

5. **Test Suite & Verification Baseline**:
   - Executing `python run_verification.py` passed with 0 syntax errors across `app.js` and `redesign.js`, CSS brace balance, and 644/644 passing Mocha tests across 30 test files in 16.02s.

---

## 2. Logic Chain

1. **Step 1 (Scope & Boundaries)**:
   From Observation 1 and 4, `app.js` contains the entire runtime logic for SunaChat. All 644 tests evaluate `app.js` directly through VM scripts or regex matching. Therefore, modifying or extending `SunaAgent` must occur inside `app.js` (specifically between lines 2914 and 3250) to avoid breaking test fixtures that read `app.js`.

2. **Step 2 (Tool Registry Architecture)**:
   From Observation 1, `SunaAgent.tools` is currently a static object map with no dynamic registration API and no parameter schema definitions. To satisfy DeepSeek Harness R1, `SunaAgent` must implement `registerTool(tool)`, `unregisterTool(name)`, `listTools()`, `getTool(name)`, and `executeTool(name, params)` where each tool defines `name`, `description`, `parameters` (JSON schema), and `execute` async function.

3. **Step 3 (Prompt Gap Resolution)**:
   From Observation 3, the LLM cannot currently invoke tools autonomously because `buildSystemPrompt()` omits tool instructions. By providing `SunaAgent.generatePromptDocs()`, `buildSystemPrompt()` can dynamically query `SunaAgent.listTools()` and inject the available tool contracts and `<suna_tool_call>` XML specification.

4. **Step 4 (Core Tool Suite)**:
   From Observation 1, 4, and `ORIGINAL_REQUEST.md`, SunaChat already has native hooks for workspace editor sync (`autoApplyWorkspaceCode`), web search (`window.performWebSearch`), web context extraction (`fetchLinkContext`), and fact storage (`addMemoryFact`). Wrapping these into standard DeepSeek Harness tools (`fs_read/fs_write/fs_list/fs_patch`, `web_search_context/fetch_page_summary`, `memory_query/memory_store`), alongside a browser-safe code runner (`sandbox_exec`) and analytics/visualization tools (`analyze_tabular`, `visualize_diagram`), will fully empower the agent with zero code bloat.

5. **Step 5 (Multi-Step ReAct & Trajectory Trace)**:
   From Observation 2 and 4, the existing recursion loop in lines 7107–7151 already handles basic re-entry but stores observations as raw user messages and records no trajectory metadata. By attaching a structured `trajectory: TrajectoryStep[]` array to the assistant message and rendering it via a collapsible glassmorphic drawer (analogous to the existing `.thinking-block-wrapper`), the user gains full Explainable AI visibility.

---

## 3. Caveats

1. **Browser Sandbox Isolation**: `sandbox_exec` running client-side in vanilla JS cannot use Node.js `worker_threads` or native Docker containers. It must execute via a controlled `new Function` scope with `window` and dangerous globals shadowed, protected by a strict `Promise.race` 3000ms timeout.
2. **Backward Compatibility**: Existing tests in `test_e2e_token_continuation_engine.js` and `test_challenger_continuation_adversarial.js` expect `SunaAgent.MAX_RECURSION_DEPTH` and `StreamParser`. These public properties must remain unaltered.
3. **Workspace Mutex**: `fs_write` to `index.html` updates the live editor and preview iframe simultaneously. Rapid sequential writes must be debounced or awaited to avoid iframe reloading race conditions.

---

## 4. Conclusion

The SunaChat codebase is exceptionally well-structured for DeepSeek Harness integration. The existing `StreamParser`, continuation loop, and Live Workspace hooks provide a solid foundation. 

The integration requires:
1. Upgrading `SunaAgent` in `app.js` (lines 2914–3250) into a **Modular Tool Registry** with standard JSON schemas.
2. Implementing the **5 Core Tools** (`sandbox_exec`, `fs_*`, `web_search_context`, `memory_*`, `analyze_tabular`, `visualize_diagram`) while retaining the 5 legacy whitelist tools.
3. Injecting tool specifications into `buildSystemPrompt()` (line 6470).
4. Capturing execution trajectories in `message.trajectory` and displaying them via a Zen Glassmorphic **Trajectory View** in `formatMessage()` and `styles.css`.

The complete specification and blueprint are detailed in `d:\Suna Chat\.agents\spec_miner_survey_o3\report.md`.

---

## 5. Verification Method

1. **Syntax Check**:
   ```bash
   node -c app.js && node -c redesign.js
   ```
   *Pass criteria*: Exit code 0, no output.

2. **Full Test Suite & Integrity Check**:
   ```bash
   python run_verification.py
   ```
   *Pass criteria*: All 644 tests green, 0 failing.

3. **Inspect Specification Artifacts**:
   - `d:\Suna Chat\.agents\spec_miner_survey_o3\report.md`
   - `d:\Suna Chat\.agents\spec_miner_survey_o3\handoff.md`
