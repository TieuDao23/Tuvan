# Test Infrastructure: DeepSeek Harness (dsh) Integration for SunaChat

## 1. Overview & Architectural Philosophy
The DeepSeek Harness (dsh) testing infrastructure provides comprehensive, opaque-box, specification-grounded test coverage for the transformation of SunaChat into an autonomous agent web application.

- **Modular Plugin Standard**: Adheres to the "Everything is a Plugin" (Cordis / DSH Plugin) architecture.
- **Client-Side First**: Validates that all tools execute securely in browser/Node VM environments with timeouts, error containment, and zero external dependency overhead.
- **Grounded Self-Correction**: Implements strict Test-Driven Development (TDD) scaffolding, ensuring that tests verify behaviors against authoritative specification oracles before, during, and after implementation milestones.
- **Zero-Regression Guarantee**: Enforces 100% backward compatibility across all 644 legacy tests, static compilation gates (`node -c`), CSS brace balances, and stacking context invariants.

---

## 2. Test Suites Architecture & Mapping

```
tests/
├── test_dsh_tool_registry.js             # Suite 1: Modular Tool Registry (Cordis / dsh-market)
├── test_dsh_core_tools.js                # Suite 2: 11 Core Tool Harnesses (5 Domains + Legacy)
├── test_dsh_react_loop_and_trajectory.js # Suite 3: Autonomous ReAct Engine & Trajectory (dsh-session)
└── test_dsh_zero_regression_matrix.js    # Suite 4: System Invariant Matrix & Backward Compatibility
```

### Suite 1: `tests/test_dsh_tool_registry.js` (25 Tests)
- **Lifecycle Management**: `registerTool`, `unregisterTool`, `listTools`, `getTool`, `executeTool`.
- **JSON Schema Validation**: Type checks (`string`, `number`, `boolean`, `object`, `array`), required parameter verification, enum restrictions.
- **Payload Flexibility**: Native object arguments and stringified JSON payload parsing.
- **Execution Containment**: Exception wrapping (`Error executing tool "..."`), asynchronous promise resolution, execution context injection (`{ State, abortSignal, timestamp }`).
- **Safety Ceilings**: Output length truncation (`MAX_RESULT_LENGTH = 1500`) with truncation notice.
- **Dynamic Prompting**: `generatePromptDocs()` Markdown output with `<suna_tool_call>` instructions.
- **Legacy Preservation**: Retention of `change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`.

### Suite 2: `tests/test_dsh_core_tools.js` (29 Tests)
- **Domain 1: Code & Math Sandbox Runner (`sandbox_exec`)**:
  - Exact math and arithmetic formula evaluation (`Math.sqrt(144) + 25` -> `37`).
  - Complex multi-line JavaScript algorithms and array processing.
  - `SyntaxError` capture with line/column diagnostic messages.
  - Runtime exception containment (`TypeError`, `ReferenceError`).
  - Timeout protection (150ms–1500ms) against infinite loops (`while(true) {}`).
  - VM security isolation (no access to parent `process`, `window`, or `localStorage`).
- **Domain 2: Web Context & Knowledge Fetcher (`web_search_context`, `fetch_page_summary`)**:
  - Query parameter validation and formatted search snippet generation.
  - URL protocol sanitization (permits `http:`, `https:`; rejects `javascript:`, `file:`, `data:`).
  - DOM cleaning: strips `<script>`, `<style>`, `<nav>`, `<footer>` tags.
  - Text length clamping (4,000 chars) protecting context window budgets.
- **Domain 3: Virtual Workspace File System (`fs_read`, `fs_write`, `fs_list`, `fs_patch`)**:
  - In-memory VFS manipulation in `State.vfs` / `State.virtualFS`.
  - Non-existent file error handling.
  - Precise block search-and-replace patch diffs (`fs_patch`).
  - Ambiguous / multiple-match patch prevention.
  - Live Workspace auto-synchronization on `index.html` changes (`#artifact-editor-textarea.value`, `input` event, `#artifact-iframe.srcdoc`, toast notification).
- **Domain 4: Deep Semantic Memory (`memory_store`, `memory_query`)**:
  - Fact storage in `State.memory.facts` with category tagging (`skill`, `preference`, `project`, `identity`).
  - Case-insensitive fact deduplication.
  - Token/keyword search and category filtering.
- **Domain 5: Visual & Tabular Analytics (`visualize_diagram`, `analyze_tabular`)**:
  - Valid SVG flowchart and sequence diagram generation with XML structure.
  - Mindmap JSON code fence generation compatible with `mindmap.html`.
  - XSS sanitization (strips malicious `<script>` and `onload=`/`onerror=` event handlers).
  - CSV parsing (quotes, commas, newlines) and JSON tabular array parsing.
  - Statistical calculations: `count`, `sum`, `mean`, `median`, `min`, `max`, `stdDev`.
  - Markdown table generation wrapped inside `.table-responsive-wrapper`.
- **Domain 6: Legacy Compatibility**: Retains all 5 legacy tools and whitelists (`MOODS_WHITELIST`, `THEMES_WHITELIST`).

### Suite 3: `tests/test_dsh_react_loop_and_trajectory.js` (15 Tests)
- **StreamParser Streaming Integration**: Buffers `<suna_tool_call>` chunks incrementally without leaking tag syntax to user-facing bubbles; separates `<think>` blocks; handles stream `flush()`.
- **Autonomous Multi-Step Loop**: Executes `Think -> Action -> Observation -> Next Action / Final Answer`.
- **Recursion Guard**: Bounds execution strictly to `MAX_RECURSION_DEPTH = 4`, halting safely with warning.
- **State Depth Reset**: Resets `agentRecursionDepth` to 0 on new user turns.
- **Error Self-Correction**: Injects tool execution errors back into the conversation for adaptive retry.
- **Anti-Oscillation Guard**: Detects and halts identical failing tool calls repeated 3+ consecutive times.
- **AbortController Safety**: Halts in-flight loop immediately when `window.isAgentAborted = true` while retaining completed steps.
- **Trajectory Trace & UI**: Structured `TrajectoryStep` data model and Zen Glassmorphic UI rendering (`.trajectory-chip` and collapsible `.trajectory-drawer` with `.trajectory-step-node`).

### Suite 4: `tests/test_dsh_zero_regression_matrix.js` (22 Tests)
- **Static Syntax Gates**: Compiles `app.js` and `redesign.js` with `node -c` (0 errors).
- **CSS Hygiene**: Enforces balanced curly braces `{}` in `styles.css` and `.toast-container { z-index: 10000; }`.
- **StreamParser Compatibility**: Standard text pass-through, inline code preservation, buffer flush.
- **Live Workspace Sync**: Verifies `#artifact-editor-textarea`, `#artifact-iframe`, `#artifacts-panel`.
- **Continuation Engine**: Token ceilings, `stitchContinuationChunks`, multi-tier truncation detection.
- **Storage & Bridges**: User-isolated storage suffixes (`_user`, `_guest`), Mindmap `suna_active_mindmap_data`, Lofi player APIs.
- **DOM Essentials**: Essential navigation, mobile media queries.

---

## 3. Verification Execution Matrix

| Verification Gate | Command | Passing Metric | Target |
|---|---|---|---|
| **Full Automated Harness** | `python run_verification.py` | 100% green exit code 0 | All 735 tests |
| **Mocha Complete Suite** | `npx mocha "tests/**/*.js"` | 0 failures, 0 pending | All 735 tests |
| **DSH Specific Suites** | `npx mocha "tests/test_dsh_*.js"` | 0 failures, 0 pending | 91 tests |
| **Static Syntax Compilation** | `node -c app.js; node -c redesign.js` | 0 syntax errors | Clean parse |
| **DSH Tests Syntax** | `node -c tests/test_dsh_*.js` | 0 syntax errors | Clean parse |
| **CSS Hygiene & Toast** | `python run_verification.py` (Step 2) | Balanced braces & z-index: 10000 | 100% verified |
