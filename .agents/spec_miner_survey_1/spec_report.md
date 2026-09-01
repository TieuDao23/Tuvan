# Suna Chat & Live Workspace — Exhaustive Specification Mining Report

**Date**: 2026-08-27  
**Author**: `spec_miner_survey_1` (Specification Investigator)  
**Target Project**: Suna Chat Web Application (`d:\Suna Chat`)  
**Authoritative Sources**: `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md`, `PROJECT.md`, `LESSONS.md`, `TEST_INFRA.md`, `app.js`, `styles.css`, `index.html`, `redesign.js`, `tests/**/*.js`

---

## 1. Executive Summary & Mission Overview

This specification audit provides a complete, authoritative behavioral and technical blueprint for upgrading Suna Chat & Live Workspace with three transformative capabilities:
1. **Collapsible Long Code & Thinking Blocks (R1)**: Intelligent detection and collapsing of code blocks exceeding 12 lines / 260px across both Main Chat (`#chat-area`) and Workspace Assistant (`#workspace-chat-messages`), featuring line counts, smooth expand/collapse transitions, and full copy/preview button accessibility.
2. **Infinite Token Multi-Turn Auto-Continuation (R2)**: Background recursion detecting token limit truncation (`finish_reason === 'length'` or unclosed markdown code fences) and seamlessly stitching continuation streams into a single message bubble without UI clutter.
3. **Direct Live Workspace Modification (R3)**: Automatic code extraction from Suna Workspace AI responses, directly injecting into `#artifact-editor-textarea` and refreshing `#artifact-iframe` with immediate toast confirmation, eliminating manual button clicks.
4. **Verification Parity & System Integrity (R4)**: Zero-syntax-error guarantee (`node -c`), mocha test suite expansion, and automated verification reporting (`run_verification.py`).

---

## 2. Authoritative Specification Source Analysis

| Spec Source | Role / Authority | Key Constraints & Invariants |
|-------------|------------------|------------------------------|
| `ORIGINAL_REQUEST.md` | **Primary Authoritative User Spec** | Mandates R1 (Collapsible Code >12 lines), R2 (Infinite Token Auto-Continuation), R3 (Direct Workspace Sync), R4 (100% test pass, `run_verification.py`, `LESSONS.md`). |
| `PROJECT.md` | Architectural Baseline | Hybrid storage (LocalStorage for settings, IndexedDB for chats), Iframe sandbox (`allow-scripts allow-modals allow-forms`), KaTeX error containment, 4px scrollbars. |
| `LESSONS.md` | Architectural Invariants | Flexbox nowrap on top-bar, z-index layering hierarchy (Toast: 10000, Modal: 2000, Workspace: 1000, Dropdown: 250), 100dvh mobile containment, font descender protection. |
| `TEST_INFRA.md` | Testing Harness & Thresholds | Multi-tier test taxonomy (Tiers 1–4), 100% mocha pass rate, 0 syntax errors, visible/hidden test split invariant. |
| `app.js` & `styles.css` | Reference Implementation | Pure Vanilla JavaScript, Zen/Ink-wash palette (`#0d0b14`, `#14121e`, `#e8a87c`, `#c0392b`), CSS glassmorphism, responsive breakpoints (360px, 768px, 1024px, 1150px, 2560px). |

---

## 3. Systematic Requirement Breakdown

### 3.1. R1: Collapsible Long Code Blocks & Thinking Blocks

#### A. Trigger & Threshold Logic
- **Line Count Threshold**: Code blocks with **> 12 lines** (or computed height > 260px) are automatically marked with `.is-collapsible.collapsed`.
- **Target Surfaces**: Must apply uniformly across:
  1. Main Chat Area (`#chat-area .message-bubble .code-block-wrapper`)
  2. Live Workspace Assistant Chat (`#workspace-chat-messages .workspace-msg-content .code-block-wrapper`)
- **Thinking Process Blocks**: `<think>...</think>` tags from reasoning models (e.g. DeepSeek R1) are rendered as collapsible `<details class="thinking-block">` or collapsible reasoning containers with animated spinner while streaming, defaulting to collapsed upon completion.

#### B. DOM & Visual Architecture
```html
<div class="code-block-wrapper is-collapsible collapsed" data-lines="48">
  <div class="code-block-header">
    <span class="code-lang">html</span>
    <span class="code-line-badge">48 dòng</span>
    <div class="code-block-actions">
      <button class="btn-copy-code" onclick="copyCodeBlock(this)" title="Sao chép code" aria-label="Sao chép code">
        <span class="material-icons-round">content_copy</span>
      </button>
      <button class="btn-toggle-code" onclick="toggleCodeCollapse(this)" title="Mở rộng / Thu gọn" aria-label="Mở rộng / Thu gọn">
        <span class="material-icons-round">unfold_more</span>
      </button>
    </div>
  </div>
  <pre><code>... [code contents] ...</code></pre>
  <div class="code-collapse-overlay" onclick="toggleCodeCollapse(this)">
    <button class="btn-expand-code" type="button">
      <span class="material-icons-round">expand_more</span> Mở rộng mã nguồn (48 dòng)
    </button>
  </div>
  <!-- Live Preview Button for HTML/SVG/JS -->
  <button class="btn-preview-artifact" onclick="window.openArtifactFromCodeBlock(this)">
    <span class="material-icons-round">play_arrow</span> Xem trước (Live Preview)
  </button>
</div>
```

#### C. Interaction & Animation Specs
- **Collapsed State**: `max-height: 260px; overflow: hidden;` with bottom translucent fade gradient (`linear-gradient(to bottom, transparent, var(--bg-secondary))`).
- **Expanded State**: `max-height: none;` (or smooth `max-height: 5000px;` with CSS transition `0.3s cubic-bezier(0.2, 0.8, 0.2, 1)`), fade overlay hidden, toggle icon changes to `unfold_less` / `expand_less`, and button text displays "Thu gọn".
- **Action Button Invariants**:
  - `btn-copy-code` must copy the **full code content** regardless of whether the block is collapsed or expanded.
  - `btn-preview-artifact` / `btn-workspace-apply` must function cleanly in both states.
  - Visual copy feedback: Icon temporarily switches to `check` with tooltip "Đã sao chép" for 1.5s.

---

### 3.2. R2: Seamless Infinite Token Multi-Turn Auto-Continuation

#### A. Truncation Detection Triggers
The auto-continuation loop must trigger when any of the following conditions occur at the end of a stream turn:
1. `choice.finish_reason === 'length'` returned by the API chunk / response.
2. Odd count of triple backticks (```) in the aggregated `assistantContent` (indicating an unclosed fenced code block).
3. Trailing dangling code or syntax tokens cut off mid-expression.

#### B. Recursive Multi-Turn Chaining Engine
- **Turn Limit Guard**: Maximum 5–10 continuation turns per user request to guard against infinite API loops while allowing massive generation (HTML5 games, 3D Three.js scenes, multi-file codebases).
- **Continuation Prompt Construction**:
  - Keep full prior conversation history.
  - Append `{ role: 'assistant', content: fullAssistantContent }`.
  - Append system continuation instruction: `[HỆ THỐNG]: Phản hồi trước đó của bạn bị ngắt quãng do đạt giới hạn token. Hãy TIẾP TỤC CHÍNH XÁC từ ký tự/dòng cuối cùng mà bạn đã dừng, KHÔNG lặp lại nội dung đã viết, KHÔNG giải thích thêm, chỉ tiếp tục nội dung dang dở cho đến khi hoàn tất 100%.`
- **Single-Bubble UI Invariant**:
  - All subsequent tokens are appended directly to the **same DOM message bubble** (`bubbleEl`).
  - No duplicate message entries or garbage cards created in `chat.messages`.
  - Typing indicator displays: `"Suna đang viết tiếp (Lượt X)..."`.
  - AbortController propagates to all continuation turns: clicking "Dừng" aborts immediately.

---

### 3.3. R3: Direct Live Workspace Modification (Direct Sync)

#### A. Automatic Code Extraction
- When the Suna AI Workspace Assistant returns a response in `#workspace-chat-messages`:
- The parser inspects the response for fenced code blocks:
  ```javascript
  const codeMatch = reply.match(/```(?:html|xml|svg|javascript|js|css)?\s*\n([\s\S]*?)```/i) || reply.match(/```([\s\S]*?)```/);
  ```
- If a complete code block is detected:
  1. Extract the raw unescaped code string.
  2. Directly assign to `#artifact-editor-textarea.value = extractedCode`.
  3. Dispatch `input` and `change` events on `#artifact-editor-textarea` so internal listeners are triggered.
  4. Immediately assign `#artifact-iframe.srcdoc = extractedCode`.
  5. Fire toast: `window.toast('Đã tự động cập nhật mã nguồn vào Live Workspace!', 'success')`.

#### B. Fallbacks & Boundary Handling
- If response contains only natural language explanation (no code block), preserve current editor content and do not overwrite.
- The manual "Áp dụng vào Editor" (`.btn-workspace-apply`) button remains rendered inside the code block as a manual fallback.
- If `#artifact-editor-textarea` or `#artifact-iframe` are temporarily null, log warning and avoid runtime exceptions.

---

### 3.4. R4: System Integrity, Verification Harness & Anti-Slop (taste-skill)

#### A. Automated Verification Protocol (`run_verification.py`)
- Must execute:
  1. `node -c app.js` -> 0 syntax errors.
  2. `node -c redesign.js` -> 0 syntax errors.
  3. `npm test` (`npx mocha "tests/**/*.js"`) -> 100% pass rate across all suites.
  4. Output `VERIFICATION PASSED` on success, exit code 0.

#### B. UI Anti-Slop Guidelines (taste-skill)
- **Zen Dark Theme Tokens**:
  - `--bg-primary: #0d0b14;`
  - `--bg-secondary: #14121e;`
  - `--accent-1: #e8a87c;` (Peach Gold)
  - `--accent-2: #c0392b;` (Zen Vermilion)
- **Three Dials**:
  - `DESIGN_VARIANCE = 8` (Distinctive asymmetric layout, glassmorphic floating pills).
  - `MOTION_INTENSITY = 6` (Smooth 60fps GPU transitions on `transform` and `opacity`).
  - `VISUAL_DENSITY = 4` (Clean, breathable spacing, no clutter).
- **Z-Index Layering**: Toast (10000) > Modals (2000) > Workspace (1000) > Dropdowns (250) > Header (100).
- **Accessibility**: Minimum 4.5:1 contrast ratio for all text elements.

---

## 4. Exhaustive Feature Inventory

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Collapsible UI | Auto Code Collapse Detection | Detects code blocks > 12 lines and wraps in collapsible container | Code block markdown | `.code-block-wrapper.is-collapsible.collapsed` | Code <= 12 lines rendered normally without collapse button | `ORIGINAL_REQUEST.md` R1, `app.js`:4389 |
| 2 | Collapsible UI | Line Count Badge | Displays exact line count in code block header | Parsed code string | `<span class="code-line-badge">N dòng</span>` | Empty code defaults to `0 dòng` | `ORIGINAL_REQUEST.md` R1 |
| 3 | Collapsible UI | Expand / Collapse Toggle | Smoothly expands code block or collapses back to 260px | Click on `.btn-toggle-code` or `.code-collapse-overlay` | Toggles `.collapsed` class, updates icon `unfold_more` <-> `unfold_less` | Smooth transition via CSS `max-height` | `ORIGINAL_REQUEST.md` R1, `styles.css` |
| 4 | Collapsible UI | Collapsible Thinking Blocks | Renders `<think>...</think>` tags as expandable reasoning accordion | `<think>` tags in AI stream | `<details class="thinking-block">` with spinner & header | Fallback to standard text if closing tag missing | Prompt R1, `app.js` formatMessage |
| 5 | Collapsible UI | Dual-Surface Code Collapsing | Collapsible logic active in both main chat and workspace chat | Message rendering in `#chat-area` or `#workspace-chat-messages` | Uniform collapsible styling across all chat contexts | Isolated DOM scope per container | `ORIGINAL_REQUEST.md` R1 |
| 6 | Infinite Tokens | Token Limit Truncation Detection | Detects `finish_reason === 'length'` or unclosed triple backticks | Stream chunk JSON or final response content | Triggers auto-continuation loop | If not truncated (`stop`), terminates normally | `ORIGINAL_REQUEST.md` R2, `app.js`:5940 |
| 7 | Infinite Tokens | Background Multi-Turn Chaining | Calls API recursively to continue truncated generation | Truncated message state | New API turn initiated with continuation prompt | Max 5-10 turns guard to prevent infinite loop | `ORIGINAL_REQUEST.md` R2 |
| 8 | Infinite Tokens | Seamless Single-Bubble Stitching | Stitches continuation chunks directly into original message bubble | Continuation stream chunks | Single continuous message bubble without duplicate entries | Re-renders Markdown dynamically | `ORIGINAL_REQUEST.md` R2, `app.js`:5970 |
| 9 | Infinite Tokens | Multi-Turn Abort Propagation | AbortController cancels all active and pending continuation turns | Click "Dừng" button / `abort()` call | Cancels fetch immediately, saves partial content with `(Đã dừng)` | No orphaned network requests | `ORIGINAL_REQUEST.md` R2, `app.js`:6063 |
| 10 | Infinite Tokens | Mode Equivalence (Flash & Pro) | Unlimited generation supported in both Flash and Pro modes | `State.mode` setting | Configures appropriate `max_tokens` and continuation thresholds | Graceful fallback on rate limits | `ORIGINAL_REQUEST.md` R2 |
| 11 | Workspace Sync | Direct Code Extraction | Auto-extracts complete HTML/JS/CSS code from assistant response | Suna Workspace AI response text | Extracted clean code string | Ignores natural language responses without code | `ORIGINAL_REQUEST.md` R3, `app.js`:1850 |
| 12 | Workspace Sync | Direct Editor Injection | Automatically writes extracted code into `#artifact-editor-textarea` | Extracted code | Updates `editor.value`, dispatches `input` and `change` events | Guard against null editor reference | `ORIGINAL_REQUEST.md` R3, `app.js`:1760 |
| 13 | Workspace Sync | Live Preview Auto-Refresh | Immediately updates `#artifact-iframe.srcdoc` without manual click | Injected editor code | Live preview rendered inside sandboxed iframe | Catches iframe render errors gracefully | `ORIGINAL_REQUEST.md` R3, `app.js`:1423 |
| 14 | Workspace Sync | Sync Success Toast | Displays confirmation toast when workspace is auto-updated | Successful code injection | `window.toast('Đã tự động cập nhật mã nguồn...', 'success')` | Displays at topmost z-index (10000) | `ORIGINAL_REQUEST.md` R3, `app.js`:1767 |
| 15 | Workspace Sync | Manual Apply Fallback | Preserves `.btn-workspace-apply` button for manual re-application | Click `.btn-workspace-apply` | Decodes data-code, applies to editor and preview | Safe URI component decoding | `ORIGINAL_REQUEST.md` R3, `app.js`:1759 |
| 16 | Action Buttons | Copy Code with Feedback | Copies code to clipboard and temporarily shows checkmark icon | Click `.btn-copy-code` | Copies to clipboard, icon changes to `check` for 1.5s | Fallback to `textarea` selection copy | `ORIGINAL_REQUEST.md` §1, `app.js`:6211 |
| 17 | Action Buttons | Live Preview Action Button | Opens Artifacts Panel and loads HTML/SVG/JS code | Click `.btn-preview-artifact` | Activates panel, loads editor, sets `iframe.srcdoc` | Toasts error if feature unavailable | `PROJECT.md` F8, `app.js`:6219 |
| 18 | Verification | Syntax Integrity Check | Validates zero syntax errors across JS files | `node -c app.js && node -c redesign.js` | Exit code 0 | Non-zero exit code if syntax error exists | `ORIGINAL_REQUEST.md` R4, `package.json` |
| 19 | Verification | Automated Mocha Test Suite | Runs all automated unit, integration, and hidden tests | `npm test` (`npx mocha "tests/**/*.js"`) | Test results with 100% pass rate | Fails if any assertion is unmet | `ORIGINAL_REQUEST.md` R4, `TEST_INFRA.md` |
| 20 | Verification | Unified Verification Script | Automated Python script running checks and tests | `python run_verification.py` | Prints `VERIFICATION PASSED` on success | Returns non-zero on failure | `ORIGINAL_REQUEST.md` R4 |
| 21 | Layout & Style | 3-Pane Workspace Split | Split view for Editor (35%), Preview (35%), and Assistant (30%) | `data-view="split"` | 3 columns with draggable resizers | Clamps resizers with 10% min guard | `PROJECT.md` F8, `styles.css`:5516 |
| 22 | Storage | Hybrid Storage Engine | Stores settings in LocalStorage, chats/images in IndexedDB | State changes | Persistent state with QuotaExceeded recovery | Evicts legacy keys on storage pressure | `PROJECT.md` F4, `app.js`:140 |
| 23 | Accessibility | WAI-ARIA & Keyboard Navigation | Full keyboard access (Enter, Space, Escape, Shortcuts) | Keydown events | Focus management and action execution | `e.preventDefault()` on handled combos | `PROJECT.md` F5, F7, `LESSONS.md` §7 |

---

## 5. Edge Cases & Boundary Conditions

## Edge Cases

| # | Feature | Input / Scenario | Expected / Observed Behavior |
|---|---------|------------------|------------------------------|
| 1 | Collapsible Code | Code block with exactly 12 lines vs 13 lines | Blocks with <= 12 lines render full height without collapse toggle; blocks with >= 13 lines render with `.is-collapsible.collapsed`. |
| 2 | Collapsible Code | Rapid expand/collapse clicking | CSS `transition` cleanly animates `max-height` without jumping or layout thrashing. |
| 3 | Collapsible Code | Copy button clicked while block is collapsed | Copies the **entire 100% code content**, not just the visible 260px slice. |
| 4 | Collapsible Code | Live Preview clicked while block is collapsed | Correctly opens workspace and loads full code into editor and iframe. |
| 5 | Collapsible Code | Code block contains unescaped HTML (`<div>`, `<script>`) or special entities | HTML entities are safely escaped before line splitting; pre code preserves exact characters. |
| 6 | Auto-Continuation | Model response cuts off inside an open triple backtick block | System detects odd delimiter count, sends continuation request, and closes block properly. |
| 7 | Auto-Continuation | Model response cuts off mid-word or mid-sentence | Continuation tokens are appended directly to `assistantContent` with zero leading whitespace drift. |
| 8 | Auto-Continuation | User clicks "Dừng" (Abort) during continuation turn 3 of 5 | Abort signal is received immediately, active fetch is terminated, loop breaks, and partial message is saved. |
| 9 | Auto-Continuation | Flapping API failure / 500 error on continuation turn 2 | Error is captured, partial response from turn 1 is preserved and rendered, user receives clear error toast. |
| 10 | Direct Workspace Sync | Assistant returns response with multiple code blocks (e.g. HTML + CSS + JS) | Extract primary/largest executable HTML block or composite structure for editor and preview. |
| 11 | Direct Workspace Sync | Assistant returns text-only explanation without code blocks | Editor content is preserved intact; no empty code or accidental overwriting occurs. |
| 12 | Direct Workspace Sync | Editor contains unsaved user edits when assistant response arrives | Editor is updated with new code and dispatches `input` event so undo stack / preview stays in sync. |
| 13 | Direct Workspace Sync | Code contains Unicode Vietnamese characters and emojis (🚀, 🇻🇳) | Correctly decoded and rendered in editor and preview without garbled UTF-8 artifacts. |
| 14 | Thinking Blocks | Model output contains unclosed `<think>` tag while streaming | Thinking container displays active pulsing state; auto-closes if stream finishes without explicit `</think>`. |
| 15 | Storage / State | Message containing 5,000 lines of code saved to IndexedDB | IndexedDB stores full payload; LocalStorage is not clogged with multi-megabyte strings. |

---

## 6. Implementation Recommendations & Verification Plan

### A. Recommended Implementation Sequence
1. **Phase 1 (Collapsible UI)**:
   - Enhance `formatMessage()` and `formatWorkspaceMessageContent()` in `app.js` with line-count computation and `.code-block-wrapper.is-collapsible.collapsed` markup.
   - Add `window.toggleCodeCollapse(button)` and copy feedback visual logic.
   - Update `styles.css` with `.code-block-wrapper.is-collapsible`, `.code-collapse-overlay`, `.btn-toggle-code`, and smooth `max-height` transitions.
2. **Phase 2 (Direct Workspace Modification)**:
   - In `sendWorkspaceMessage()` in `app.js`, add automatic code extraction on API response.
   - Inject into `#artifact-editor-textarea`, dispatch `input`, refresh `#artifact-iframe`, and trigger success toast.
3. **Phase 3 (Auto-Continuation Infinite Token Engine)**:
   - Update `generateAIResponse()` in `app.js` with multi-turn loop detecting `finish_reason === 'length'` and unclosed code fences.
   - Stream continuation tokens into existing `assistantContent` and single `bubbleEl`.
4. **Phase 4 (Testing & Verification)**:
   - Create `run_verification.py` automated script.
   - Expand `tests/` with new test suites for Collapsible Code, Auto-continuation loop, and Direct Workspace Sync.
   - Run `node -c app.js && node -c redesign.js` and `npm test` to achieve 100% pass rate.
