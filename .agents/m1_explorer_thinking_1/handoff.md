# Handoff Report — Milestone M1: Thinking Blocks & Anti-Slop UI Architecture

## 1. Observation
- **`app.js:4368-4369` (`formatMessage`)**:
  ```javascript
  let cleanText = text.replace(/<suna_tool_call>[\s\S]*?<\/suna_tool_call>/g, '');
  cleanText = cleanText.replace(/<suna_tool_call\s+[^>]*>[\s\S]*?<\/suna_tool_call>/g, '');
  let html = escHtml(cleanText);
  ```
  `formatMessage` strips `<suna_tool_call>` tags, but has no logic for `<think>` or `<thought>` tags. `escHtml` converts them into raw text `&lt;think&gt;` and renders them directly into the chat bubble.
- **`app.js:2327-2405` (`StreamParser`)**:
  `StreamParser` maintains a 4-state character buffer (`TEXT`, `IN_TAG`, `IN_CONTENT`, `IN_END_TAG`) exclusively targeting `<suna_tool_call>`. It does not parse or isolate `<think>` or `<thought>` tags, flushing all thinking tokens straight into `this.filteredText`.
- **`app.js:5917-6003` (`generateAIResponse`)**:
  During live SSE streaming, `bubbleEl.innerHTML = formatMessage(displayContent, true)` is called on every animation frame. At stream completion, `activeChat.messages.push(...)` commits the raw message to state and triggers `renderMessages()`.
- **`styles.css:1-60, 1307-1370` (Theme & UI Tokens)**:
  Dark theme uses `--bg-primary: #0d0b14`, `--bg-secondary: #14121e`, `--accent-1: #e8a87c`, `--accent-2: #c0392b`, and `--transition: 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)`. No CSS classes exist yet for `.thinking-block-wrapper`, `.thinking-header`, `.thinking-badge`, or `.thinking-body`.
- **`tests/test_collapsible_code_and_continuation.js:378-449` (Test T1-F10)**:
  Validates that reasoning stream parser separates `<think>...</think>` / `<thought>...</thought>` into `this.thinkingContent` while keeping `this.filteredText` clean of raw tags.

## 2. Logic Chain
1. **From Observation §1 & §3**: Because `formatMessage` is the unified markdown rendering engine for both active streams and persisted chat messages, introducing thinking block extraction (`/<(?:think|thought)\b[^>]*>([\s\S]*?)<\/(?:think|thought)>/gi` and unclosed `/<(?:think|thought)\b[^>]*>([\s\S]*)$/gi`) inside `formatMessage` ensures that all thinking content is captured and encapsulated into `.thinking-block-wrapper`.
2. **From Observation §3 & §4**: When `isStreaming === true` (or unclosed tag during streaming), the thinking block should render with `.is-streaming.is-open` and an animated pulsing badge (`@keyframes thinking-badge-pulse`). When the stream ends (`isStreaming === false` or closed tag), it transitions to `.is-collapsed`, defaulting to a compact 1-line accordion with summary (`${lineCount} dòng suy luận`).
3. **From Observation §2 & §5**: Enhancing `StreamParser` to track `IN_THINK` and `IN_END_THINK` states isolates `thinkingContent` from `filteredText`, cleanly satisfying T1-F10 while preserving tool execution capabilities for `<suna_tool_call>`.
4. **From Observation §4**: Styling the components with Zen Dark aesthetic (`rgba(20, 18, 30, 0.55)`, left border `3px solid #e8a87c`, glass blur, and `0.2s cubic-bezier` transitions) ensures strict compliance with Anti-Slop UI guidelines.

## 3. Caveats
- **Historical Chat Migrations**: Historical messages already saved in `localStorage` / `IndexedDB` that contain `<think>` tags will automatically benefit from the new accordion format when re-rendered by `formatMessage()`. No database migration script is needed.
- **Nested Markdown within Thinking**: Thinking content is HTML-escaped and line-break converted (`\n` -> `<br>`). Arbitrary HTML tags inside thinking blocks will be safely escaped to prevent XSS.

## 4. Conclusion
- A dual-layer approach solves thinking blocks cleanly:
  1. **Rendering Layer (`formatMessage`)**: Regex-based tokenization of closed & unclosed `<think>` / `<thought>` blocks into `.thinking-block-wrapper` accordions with dynamic streaming vs. collapsed states.
  2. **Stream Processing Layer (`StreamParser`)**: State-machine tracking for `<think>` / `<thought>` to isolate reasoning content and tool calls from final text.
  3. **Interaction & Style Layer (`styles.css` & `toggleThinkingBlock`)**: Zen Dark accordion styling, pulse badge animation, and smooth 0.2s cubic-bezier toggle handler.

## 5. Verification Method
1. **Syntax Check**:
   ```bash
   node -c app.js
   ```
2. **Unit & Integration Test Suite**:
   ```bash
   npx mocha tests/test_collapsible_code_and_continuation.js --grep "T1-F10"
   npx mocha tests/test_collapsible_code_and_continuation.js
   ```
3. **Automated Verification**:
   ```bash
   python run_verification.py
   ```
4. **Visual & Interaction Check**:
   - Inspect `.thinking-block-wrapper`, `.thinking-header`, `.thinking-badge.is-pulsing`, `.thinking-body` in browser devtools.
   - Verify click on `.thinking-header` toggles `aria-expanded` and visibility without layout shift.
