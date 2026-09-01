# Specification Mining Report: Autonomous Token-Maximizing Multi-Turn Continuation Chaining Engine

- **Agent**: `spec_miner_0` (teamwork_preview_spec_miner)
- **Target**: Suna Chat & Live Workspace
- **Authoritative Source**: `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md`, `d:\Suna Chat\app.js`, `d:\Suna Chat\styles.css`, `d:\Suna Chat\tests/`, `d:\Suna Chat\run_verification.py`
- **Timestamp**: 2026-08-27T15:10:00Z
- **Status**: COMPLETE / READY FOR ARCHITECTURE & IMPLEMENTATION

---

## Executive Summary
This report formalizes the complete, authoritative specification for the **Autonomous Token-Maximizing Multi-Turn Continuation Chaining Engine** across Suna Main Chat and Live Workspace. It covers token ceiling maximization (R1), multi-tier truncation detection and background chaining loops (R2), boundary stitching and overlap deduplication (R3), 60fps single-bubble streaming UI (R4), direct workspace auto-sync (R5), and system integrity / test verification (R6).

---

## 1. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1: Token Ceiling | Model Output Ceiling Parameter Resolver | Dynamically maps model names to their true maximum output token limits (e.g. 8,192 / 16,384 / 65,536) instead of artificial 1024/4096 caps | `model` string, `State.mode` | `max_tokens` / `max_output_tokens` numerical parameter in request payload | Fallback to 8,192 default if model is unrecognized | `ORIGINAL_REQUEST.md` §R1, `app.js:6248`, `app.js:2077` |
| 2 | R1: Token Ceiling | Main Chat Anti-Placeholder System Prompt | Injects strict directives into `buildSystemPrompt()` prohibiting placeholder comments (`// ... rest of code ...`, `/* unchanged */`) and enforcing 100% explicit unabridged code/content generation | `State.settings`, `State.mode` | Enhanced `systemPrompt` string | N/A (deterministic string builder) | `ORIGINAL_REQUEST.md` §R1, `app.js:5813-5917` |
| 3 | R1: Token Ceiling | Workspace Assistant Anti-Placeholder Prompt | Configures system prompt in `sendWorkspaceMessage()` enforcing 100% complete runnable HTML/CSS/JS code generation without elisions or shortcuts | `currentCode`, user instruction | Enhanced Workspace Assistant `systemPrompt` | Falls back to empty string if editor is empty | `ORIGINAL_REQUEST.md` §R1, `app.js:1920-1926` |
| 4 | R2: Multi-Turn Chaining | Multi-Tier Stream Truncation Detector | Detects when an API stream has been truncated via `finish_reason === 'length'`, unclosed code block fences (`` ```` count % 2 !== 0 ``), or unclosed HTML/JSON structures | `turnFinishReason`, `assistantContent` string | Boolean `isTruncated` | Defaults to false if stream completed normally or aborted | `ORIGINAL_REQUEST.md` §R2, `app.js:6450-6454` |
| 5 | R2: Multi-Turn Chaining | Background Continuation Context Builder | Constructs context for Turn N+1: preserves System Prompt, original user prompt/attachments, and cumulative assistant output, with standard continuation prompt | `apiMessages`, cumulative `assistantContent`, continuation turn index | Continuation `currentReqMessages` array | Preserves existing content if memory or payload limits approach | `ORIGINAL_REQUEST.md` §R2, `app.js:6344-6353`, `app.js:1978-1984` |
| 6 | R2: Multi-Turn Chaining | Standard Continuation Prompt Protocol | Enforces canonical continuation prompt: `"Tiếp tục chính xác từ đoạn mã/câu từ đang dang dở từ chỗ bị ngắt, không lặp lại bất kỳ đoạn nào đã tạo."` | Continuation trigger | User message `{ role: 'user', content: '...' }` in continuation payload | N/A | `ORIGINAL_REQUEST.md` §R2 |
| 7 | R2: Multi-Turn Chaining | Configurable Turn Recursion Guard | Bounds continuation loops to a configurable upper bound (e.g. 5 default, expandable to 10–20 for heavy 3D/Canvas tasks) to prevent infinite loops | `turnCount`, `MAX_CONTINUATION_TURNS` | Loop termination signal | Clean loop exit, appends closing fences if unclosed | `ORIGINAL_REQUEST.md` §R2, `test_challenger_continuation_adversarial.js:1077` |
| 8 | R2: Multi-Turn Chaining | User Abort Propagation | AbortController signal halts background continuation turns immediately upon user stop command without starting subsequent turns | `State.abortController.signal` | Generates `*(Đã dừng)*` marker and saves accumulated partial content | Safely clears typing indicator, catches `AbortError` | `ORIGINAL_REQUEST.md` §R2, `app.js:6539-6546` |
| 9 | R3: Boundary Stitching | Boundary Splice & Overlap Deduplicator | Compares tail lines of Turn N with head lines of Turn N+1 (up to 10 lines) and eliminates duplicated overlapping lines at the splice boundary | `chunkA` (prior accumulated string), `chunkB` (next turn incoming string) | Stitched, deduplicated string | Returns `chunkA + chunkB` if no overlap found | `ORIGINAL_REQUEST.md` §R3, `tests/test_collapsible_code_and_continuation.js:231-256` |
| 10 | R3: Boundary Stitching | Unified State Consolidation | Consolidates all continuation turn outputs into exactly 1 message item in `activeChat.messages` and `State.workspaceMessages`, persisted to IndexedDB/localStorage | Cumulative stitched content | Single message object saved in state | Prunes oldest messages if storage quota exceeded | `ORIGINAL_REQUEST.md` §R3, `app.js:6474-6479`, `app.js:2001-2003` |
| 11 | R4: Streaming UI | Single Message Bubble Container | Instantiates a single `.message-bubble` element (or `.workspace-msg-content`) prior to Turn 1 and appends subsequent turn deltas into the same element without recreation | `assistantEl`, `bubbleEl` | Continuous live DOM node | Falls back to re-attaching if DOM disconnected | `ORIGINAL_REQUEST.md` §R4, `app.js:6327-6336`, `app.js:1943-1953` |
| 12 | R4: Streaming UI | 60fps rAF Render Throttle | Uses `requestAnimationFrame` and `_renderPending` flag to throttle markdown parsing and DOM updates during high-throughput multi-turn streams | Incoming chunk deltas, `bubbleEl` | Smooth 60fps DOM updates without UI freezing | Resets `_renderPending` on animation frame execution | `ORIGINAL_REQUEST.md` §R4, `app.js:6430-6440` |
| 13 | R4: Streaming UI | Typing Indicator Lifecycle | Displays typing animation during pre-processing and removes it upon the first valid delta of Turn 1; does not re-add typing indicator on continuation turns | SSE chunk arrival | Typing element removal | Removes typing indicator in `finally`/`catch` blocks | `ORIGINAL_REQUEST.md` §R4, `app.js:6416-6419`, `app.js:1998-1999` |
| 14 | R5: Workspace Sync | Heuristic Code Block Extractor (`extractWorkspaceCode`) | Scans assistant response for markdown code blocks, prioritizing runnable HTML/Canvas/SVG/JS/CSS applications over auxiliary bash/json blocks | Full assistant reply string | Clean unescaped code string OR `null` (if purely conversational) | Returns `null` on text-only responses | `ORIGINAL_REQUEST.md` §R5, `app.js:1811-1838` |
| 15 | R5: Workspace Sync | Automatic Editor & Live Preview Injector (`autoApplyWorkspaceCode`) | Injects extracted code into `#artifact-editor-textarea`, dispatches `input` event, updates `#artifact-iframe.srcdoc`, and triggers toast | Extracted code string | Boolean `true` on success | Safely skips missing elements without throwing TypeError | `ORIGINAL_REQUEST.md` §R5, `app.js:1840-1863` |
| 16 | R5: Workspace Sync | High-Stacking Toast Notification | Displays confirmation Toast at `z-index: 10000` above all modals, full-page overlays, and workspace panels | Toast message string, type ('success'/'error') | Rendered toast notification DOM element | Auto-dismisses after duration | `ORIGINAL_REQUEST.md` §R5, `LESSONS.md` §5, `styles.css` |
| 17 | R6: Test Parity | Automated Syntax Integrity Check | Verifies JavaScript syntax validity for `app.js` and `redesign.js` via Node compiler | `app.js`, `redesign.js` | 0 syntax errors, exit code 0 | Non-zero exit code if syntax errors exist | `ORIGINAL_REQUEST.md` §R6, `run_verification.py:23-37` |
| 18 | R6: Test Parity | CSS Hygiene & Balance Verifier | Ensures balanced curly braces, no corrupt nested selectors, and `z-index: 10000` for `.toast-container` | `styles.css` | Verification pass result | Flags brace mismatches or unclosed selectors | `ORIGINAL_REQUEST.md` §R6, `run_verification.py:39-68` |
| 19 | R6: Test Parity | 4-Tier Automated Mocha Test Suite | Executes all visible, hidden, adversarial, and feature test suites under `tests/**/*.js` | Test files | Comprehensive test execution report | Identifies failing assertions with exact stack traces | `ORIGINAL_REQUEST.md` §R6, `run_verification.py:70-90` |
| 20 | R6: Feature Preservation | Core Feature Suite Preservation | Preserves 100% existing functionality: Lofi Player, Mindmap generation, Kanban board, Theme engine, Hybrid Storage & Quota handling | State, DOM events, IndexedDB | Fully functional features | Graceful fallbacks for storage quota or iframe sandbox | `ORIGINAL_REQUEST.md` §R6, `PROJECT.md` |

---

## 2. Edge Cases Matrix

| # | Feature | Input / Condition | Observed & Required Behavior |
|---|---------|-------------------|-----------------------------|
| E1 | Token Ceiling | Model ceiling lookup for unknown or custom model name | Defaults safely to 8,192 (or omits `max_tokens` if model natively allows maximum) without throwing runtime exception |
| E2 | Truncation Detection | Truncation occurs precisely inside a triple-backtick delimiter (e.g. ```` `` ```` split across turns) | Correctly identifies odd fence parity, triggers continuation, stitches backticks cleanly without syntax error |
| E3 | Truncation Detection | Model completes full response but happens to include an escaped backtick inside a template literal (e.g. `` \` ``) | Escaped backticks do not throw off the fence parity counter; correctly recognizes completed response and terminates loop |
| E4 | Boundary Stitching | Model repeats 1 to 5 lines of code at the start of Turn N+1 (common continuation artifact) | Overlap deduplication detects matching lines at tail(Turn N) and head(Turn N+1) and removes duplicated lines, avoiding double variable declarations |
| E5 | Boundary Stitching | Multi-byte UTF-8 Vietnamese characters or Emojis split across turn boundary (e.g. `Trí Tuệ Nhân Tạo 🚀`) | Buffer decoding and string stitching preserve UTF-8 character integrity without replacement characters (``) |
| E6 | Multi-Turn Loop | Adversarial model continuously returns `finish_reason: "length"` on every turn indefinitely | Loop strictly terminates upon reaching `MAX_CONTINUATION_TURNS` (e.g. 5 or 10-20 configured limit), preventing memory exhaustion and infinite loops |
| E7 | Multi-Turn Loop | User clicks "Stop Generation" (`AbortController.abort()`) during Turn 2 or Turn 3 | Continuation loop halts immediately, stops sending subsequent requests, appends `*(Đã dừng)*` marker, and preserves all content generated up to that moment |
| E8 | Multi-Turn Loop | API network error or HTTP 500 occurs during continuation Turn 2 after Turn 1 succeeded | Engine logs warning, catches error, preserves accumulated Turn 1 content in `State.chats`, and saves state cleanly without crashing the UI |
| E9 | Live Stream UI | User switches active chat tab while multi-turn continuation is streaming in background | Background loop continues accumulating stream into the generating chat object in `State.chats`; does not corrupt current active chat DOM |
| E10 | Workspace Live Sync | Assistant response is purely conversational (e.g. "Tôi đã hiểu yêu cầu...") with no code blocks | `extractWorkspaceCode()` returns `null`, `autoApplyWorkspaceCode()` takes no action, Editor and Iframe remain untouched, 0 false toast notifications |
| E11 | Workspace Live Sync | Assistant response contains auxiliary bash install command (`npm install three`) before the main HTML/JS code block | `extractWorkspaceCode()` prioritizes the runnable HTML/Canvas/SVG block over auxiliary shell/config blocks and injects the executable application |
| E12 | Workspace Live Sync | Rapid consecutive prompts submitted to Workspace Assistant | Active `_workspaceAbortController` aborts previous in-flight request before launching new request, preventing state race conditions |

---

## 3. Five-Component Handoff Report

### 1. Observation
1. **`ORIGINAL_REQUEST.md`** specifies the complete functional requirements for the Autonomous Token-Maximizing Multi-Turn Continuation Chaining Engine (R1–R6, Acceptance Criteria 1–4).
2. **Current Codebase State**:
   - `app.js:6248`: Currently contains `...(requiresUnlimited ? {} : { max_tokens: State.mode === 'flash' ? 1024 : 4096 })` which artificially caps token output unless explicit prompt keywords are present.
   - `app.js:2077`: Workspace Assistant fallback payload specifies `max_tokens: 4096`.
   - `app.js:5813-5917` (`buildSystemPrompt`): Contains mode and persona guidelines, but lacks the explicit mandatory anti-placeholder directive required by R1 (`Nghiêm cấm chú thích rút gọn kiểu // ... code tiếp theo ở đây ...`).
   - `app.js:1920-1926`: Workspace system prompt lacks explicit anti-placeholder / token-maximization instruction.
   - `app.js:6338-6457`: Implements `while (turnCount < MAX_CONTINUATION_TURNS)` with `MAX_CONTINUATION_TURNS = 5`. Continuation prompt is `'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:'`.
   - `app.js:1972-1994`: Workspace Assistant implements `while (continuationTurns < 4)` with backtick parity check and continuation prompt.
   - `tests/test_collapsible_code_and_continuation.js` and `tests/test_challenger_continuation_adversarial.js`: Contain specifications and mock helpers for `specStitchContinuationChunks` (boundary deduplication) and adversarial multi-turn testing.
3. **Verification Harness**: `run_verification.py` enforces JavaScript syntax checks (`node -c app.js && node -c redesign.js`), CSS brace and selector hygiene, and Mocha test execution across 19 test files (currently 281 tests passing).

### 2. Logic Chain
- *From Observation 1 & 2*: In order to satisfy R1, `max_tokens` must be updated to leverage true model ceilings (8,192 to 65,536 tokens) across all providers/models, and system prompts must explicitly forbid code omissions or placeholders.
- *From Observation 2 & R2*: To support deep continuation on complex workloads, the continuation loop must reliably detect truncation (`finish_reason === 'length'`, unclosed code fences, unclosed HTML/JSON), construct context-retaining payloads, and support higher turn thresholds (10-20 turns) while maintaining safety recursion bounds and abort handling.
- *From Observation 2, 3 & R3*: When continuation turns return overlapping lines at splice points, a boundary stitching algorithm (as defined in `specStitchContinuationChunks`) prevents duplicate code lines and syntax errors before saving to `State.chats`.
- *From Observation 2 & R4*: Delivering chunks from all turns directly into a single `bubbleEl` / `workspace-msg-content` throttled via `requestAnimationFrame` ensures smooth 60fps streaming without bubble flickering.
- *From Observation 2 & R5*: Post-stream execution of `extractWorkspaceCode` and `autoApplyWorkspaceCode` ensures full runnable code is synced into `#artifact-editor-textarea` and `#artifact-iframe.srcdoc` with a high-priority toast.
- *From Observation 3 & R6*: All updates must pass `run_verification.py` (syntax checks, CSS hygiene, Mocha test suite) with zero regressions.

### 3. Caveats
- Model providers differ in parameter names (e.g. OpenAI `max_tokens` vs Anthropic/Google `max_output_tokens` or `max_completion_tokens`). Standard OpenAI-compatible proxies handle `max_tokens`, but ceilings should not exceed provider limits to prevent 400 Bad Request errors.
- Existing tests in `test_challenger_continuation_adversarial.js` verify `MAX_CONTINUATION_TURNS = 5` statically via regex (`app.js:1305`). Any change to default turn limits must ensure backwards test compatibility or support configurable options.

### 4. Conclusion
The specification for the Autonomous Token-Maximizing Multi-Turn Continuation Chaining Engine is fully extracted, structured, and cataloged. All 6 requirement areas (R1 through R6) and 4 acceptance criteria have concrete interface contracts, edge case definitions, and verification targets ready for the planning, implementation, and review phases.

### 5. Verification Method
1. **Static Analysis & Syntax Check**:
   ```bash
   node -c app.js && node -c redesign.js
   ```
2. **Comprehensive Test Suite & Verification Runner**:
   ```bash
   python run_verification.py
   ```
3. **Targeted Continuation & Workspace Test Execution**:
   ```bash
   npx mocha tests/test_collapsible_code_and_continuation.js
   npx mocha tests/test_challenger_continuation_adversarial.js
   npx mocha tests/test_workspace_direct_sync_and_continuation.js
   ```
