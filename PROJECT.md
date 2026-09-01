# Project: Autonomous Token-Maximizing Multi-Turn Continuation Chaining Engine for Suna Chat & Live Workspace

## Architecture
Suna Chat is a client-side vanilla JavaScript web application. The Autonomous Continuation Engine operates within `app.js` (and `redesign.js`), orchestrating token maximization, streaming consumption, truncation detection, multi-turn chaining, boundary stitching, live rendering, and workspace synchronization.

```
+---------------------------------------------------------------------------------------+
|                 Autonomous Multi-Turn Continuation Chaining Engine                   |
+---------------------------------------------------------------------------------------+
                                           |
                   [User Input in Main Chat or Live Workspace]
                                           |
               +-------------------------------------------------------+
               |  M1: Token Maximization & System Prompt Directives   |
               |  - max_tokens ceiling (8192 - 65536)                  |
               |  - Anti-placeholder mandate (no '// ... rest ...')    |
               +-------------------------------------------------------+
                                           |
               +-------------------------------------------------------+
               |  M4: Single Message Bubble 60fps Live Streaming UI   |
               |  - Single .message-bubble / .workspace-msg-content   |
               |  - requestAnimationFrame render throttle              |
               |  - SSE delta parsing across all provider formats      |
               +-------------------------------------------------------+
                                           |
               +-------------------------------------------------------+
               |  M2: Multi-Tier Truncation Detector & Chaining Loop   |
               |  - 'length' / 'max_tokens' / 'MAX_TOKENS' detection   |
               |  - Unclosed markdown code fences (``` count % 2 == 1) |
               |  - Unclosed HTML tags (<html, <script, <style, etc.)  |
               |  - Background continuation payload with context       |
               |  - Expandable up to 10-20 turns for complex apps      |
               |  - AbortController user cancellation safety           |
               +-------------------------------------------------------+
                                           |
               +-------------------------------------------------------+
               |  M3: Smart Boundary Stitching & Deduplication         |
               |  - Redundant opening fence stripping (```html)        |
               |  - Conversational preamble removal                    |
               |  - Suffix-prefix overlap deduplication (3-300 chars)  |
               |  - Duplicate boundary line stripping                  |
               |  - Single consolidated message in state               |
               +-------------------------------------------------------+
                                           |
               +-------------------------------------------------------+
               |  M5: Direct Workspace Live Sync                      |
               |  - extractWorkspaceCode heuristic extraction          |
               |  - autoApplyWorkspaceCode injection into editor/iframe|
               |  - Synthetic 'input' event dispatch                   |
               |  - Toast notification at z-index: 10000               |
               +-------------------------------------------------------+
                                           |
               +-------------------------------------------------------+
               |  M6: E2E Integration & Adversarial Hardening          |
               |  - 100% E2E test suite pass (Tiers 1-4)               |
               |  - Tier 5 adversarial coverage hardening              |
               |  - 0 syntax errors, 0 regressions in core features    |
               |  - python run_verification.py all green               |
               +-------------------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Model Output Token Ceiling Resolver | Dynamically sets max_tokens to true model ceilings (8,192 / 16,384 / 65,536) in API calls | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Main Chat Anti-Placeholder Prompt | Injects strict prompt directives in buildSystemPrompt() banning code placeholders/elisions | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Workspace Assistant Anti-Placeholder Prompt | Configures workspace system prompt enforcing 100% unabridged code generation | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Multi-Tier Stream Truncation Detector | Detects truncation on length finish_reason, unclosed code fences, or unclosed HTML/structural tags | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Background Continuation Context Builder | Constructs context for Turn N+1: system prompt, original user query, prior turns assistant text | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Standard Continuation Prompt Protocol | Injects standard continuation instruction: "Tiếp tục chính xác từ đoạn mã/câu từ đang dang dở..." | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Expanded Turn Recursion Bound Guard | Supports 10-20 continuation turns with zero-progress and maximum turn safety guards | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Continuation User Abort Propagation | AbortController signal immediately halts continuation turns and preserves partial content | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Boundary Code Fence & Preamble Stripper | Strips redundant opening fences and conversational preamble text from continuation turns | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Suffix-Prefix & Line Overlap Deduplicator | Eliminates duplicate characters and overlapping lines at turn boundaries (stitchContinuationChunks) | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Single State Message Consolidation | Consolidates all continuation turns into 1 single message object in state without garbage turns | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Single Message Bubble Container | Streams all continuation turns into the single active message bubble without creating duplicates | M4 | ORIGINAL_REQUEST §R4 |
| 13 | 60fps rAF Render Throttle | Throttles markdown parsing and DOM updates using requestAnimationFrame and renderPending guard | M4 | ORIGINAL_REQUEST §R4 |
| 14 | Typing Indicator Stream Lifecycle | Displays typing indicator before Turn 1 stream, removes on first delta, never recreates on turn N | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Heuristic Code Extractor | Scans chained response for runnable HTML/Canvas/SVG/JS blocks (extractWorkspaceCode) | M5 | ORIGINAL_REQUEST §R5 |
| 16 | Automatic Editor & Iframe Live Injector | Injects extracted code into #artifact-editor-textarea, dispatches 'input', updates #artifact-iframe.srcdoc | M5 | ORIGINAL_REQUEST §R5 |
| 17 | High-Stacking Toast Notification | Displays confirmation Toast at z-index: 10000 on workspace live sync | M5 | ORIGINAL_REQUEST §R5 |
| 18 | Conversational Response Safe Bypass | Safely ignores pure conversational text without code, avoiding false sync or error toasts | M5 | ORIGINAL_REQUEST §R5 |
| 19 | Core Features Preservation | Preserves Lofi Player, Mindmap, Kanban, Theme, Storage Quota, and Chat navigation | M6 | ORIGINAL_REQUEST §R6 |
| 20 | Automated Verification & E2E Test Parity | Passes node syntax check, CSS hygiene, 100% Mocha tests, and run_verification.py | M6 | ORIGINAL_REQUEST §R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | e2e_testing_track | Design and implement opaque-box E2E test suite (Tiers 1-4), harness, and publish TEST_READY.md | none | DONE |
| 1 | token_maximization_and_system_prompts | R1: Max token ceilings in API calls, anti-placeholder prompts in Main Chat & Workspace | none | DONE |
| 2 | multi_turn_chaining_and_truncation_detection | R2: Multi-tier truncation detector, continuation context builder, 10-20 turn bounds, abort safety | M1 | DONE |
| 3 | smart_boundary_stitching_and_deduplication | R3: Suffix-prefix deduplication, fence/preamble stripping, line overlap removal, single state message | M2 | DONE |
| 4 | single_bubble_live_stream_ui | R4: Single bubble DOM lifecycle across turns, 60fps rAF rendering, typing indicator lifecycle | M3 | DONE |
| 5 | direct_workspace_live_sync | R5: extractWorkspaceCode, autoApplyWorkspaceCode, editor input event, iframe srcdoc, toast z-index | M4 | DONE |
| 6 | e2e_pass_and_adversarial_hardening | R6: Pass 100% E2E tests (Tiers 1-4), Tier 5 adversarial hardening, run_verification.py 100% green | M5, E2E | DONE |

## Interface Contracts
### API Request Engine ↔ LLM Providers
- `makeApiRequest(payload, onChunk, onFinish)`:
  - `payload.max_tokens`: Default 8192 for pro mode / 4096 for flash mode, or model ceiling.
  - `onChunk(delta)`: Called for each parsed SSE delta chunk.
  - `onFinish(result)`: Returns `{ fullText, finishReason, isTruncated }`.

### Truncation Detector ↔ Continuation Engine
- `isResponseTruncated(finishReason, content)`:
  - Input: `finishReason: string`, `content: string`
  - Output: `boolean` (true if finish_reason in ['length','max_tokens','MAX_TOKENS','truncated'] OR unclosed code fences OR unclosed HTML structural tags).

### Boundary Stitcher ↔ Stream Accumulator
- `stitchContinuationChunks(accumulated, nextChunk)`:
  - Input: `accumulated: string`, `nextChunk: string`
  - Output: `string` (clean concatenated string with redundant fences, preambles, and overlapping characters/lines eliminated).

### Multi-Turn Loop ↔ Live Workspace
- `autoApplyWorkspaceCode(code)`:
  - Input: `code: string`
  - Actions:
    1. Sets `$('#artifact-editor-textarea').value = code`
    2. Dispatches `editor.dispatchEvent(new Event('input', { bubbles: true }))`
    3. Sets `$('#artifact-iframe').srcdoc = code`
    4. Triggers `window.toast('Đã tự động cập nhật mã nguồn vào Live Workspace!', 'success')`
  - Output: `boolean`

## Code Layout
- `app.js`: Main application logic, API calling, streaming loop, truncation detection, boundary stitching, DOM rendering, workspace integration, Lofi, Mindmap, Kanban, Storage.
- `redesign.js`: Workspace UI interactions, responsive pane resizers, theme toggles.
- `index.html`: DOM layout, 3-pane workspace container, editor textarea, iframe, toast container.
- `styles.css`: Visual styling, workspace layout, toast container (z-index: 10000).
- `tests/`: Mocha test suites (unit, feature, hidden, adversarial, E2E).
- `run_verification.py`: Authoritative project verification runner.
