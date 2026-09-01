# Suna Chat & Live Workspace — Comprehensive Codebase Map & Technical Architecture Report

**Explorer ID**: `explorer_codebase_1`  
**Date**: 2026-08-27  
**Project Root**: `d:\Suna Chat`  
**Target Scope**: R1 (Collapsible Code Blocks), R2 (Seamless Infinite Token Auto-Continuation), R3 (Direct Workspace Live Sync), R4 (Verification & System Integrity)

---

## 1. Executive Summary & Codebase Architecture

Suna Chat is a high-performance, single-page conversational and live workspace web application built entirely on native Vanilla JavaScript (ECMAScript 2022+), modern CSS3 (Zen Dark / Ink-Wash Glassmorphism design tokens), and HTML5. It has zero heavy runtime JavaScript framework dependencies (React/Vue/Angular), following a strict **Ponytail Minimalist Architecture**.

### 1.1 High-Level Architecture Diagram

```
+---------------------------------------------------------------------------------------+
|                                    Suna Chat Web App                                  |
+---------------------------------------------------------------------------------------+
|                                    UI / Presentation                                  |
|  - index.html: Semantic DOM (Header, Modals, Chat Area, 3-Pane Live Workspace)        |
|  - styles.css: Zen Dark & Light Tokens, Frosted Glass, 4px Scrollbars, Responsive     |
+---------------------------------------------------------------------------------------+
|                                  Core Logic (app.js)                                  |
|  - State Manager: Global single source of truth `State`                               |
|  - Streaming Engine: SSE parser, fetchWithProxy, multi-chamber routing, vision tasks  |
|  - Markdown & Code Parser: Placeholders, KaTeX, Mermaid, Kanban, Code Wrappers        |
|  - Live Workspace: 3-pane layout, resizers, editor textarea, sandbox iframe, AI chat  |
|  - Storage Engine: Hybrid localStorage (config) + IndexedDB (chats/payloads)          |
|  - SunaAgent: Local autonomous tool call recursive dispatcher                         |
+---------------------------------------------------------------------------------------+
|                                  External / CDN Layer                                 |
|  - KaTeX: Math typesetting with try-catch error fallback                              |
|  - Mermaid: Client-side diagram generation                                            |
|  - PDF.js: Document analysis and text extraction                                      |
|  - Firebase SDK: Optional real-time cloud sync & auth                                 |
+---------------------------------------------------------------------------------------+
|                                   Verification Layer                                  |
|  - Mocha & Chai / Assert (`tests/**/*.js`): 122 automated unit & adversarial tests    |
|  - Node syntax validator: `node -c app.js && node -c redesign.js`                      |
+---------------------------------------------------------------------------------------+
```

---

## 2. Detailed File Inventory & Component Mapping

### 2.1 File Map

| File Path | Size / Lines | Primary Responsibility |
|---|---|---|
| `app.js` | 292 KB / 7,284 lines | Monolithic client runtime: State management, streaming API communication, markdown parsing, workspace 3-pane split management, auth, storage, TTS, export. |
| `index.html` | 58 KB / 851 lines | Application HTML structure: Auth screen, top bar, sidebar chat list, `#chat-area`, modals (API, settings, memory, export, translator), `#artifacts-panel` (3-pane workspace). |
| `styles.css` | 129 KB / 5,898 lines | Complete design system: `--bg-primary: #0d0b14`, `--accent-1: #e8a87c`, glassmorphism, 4px scrollbars, code blocks, workspace split panes, responsive breakpoints (1150px, 768px, 360px). |
| `redesign.js` | 18 KB / 508 lines | Test generation utility for visual regression, contrast ratio calculations, CSS validation, and Mocha test generation. |
| `mindmap.html` | 88 KB / 2,397 lines | Embedded interactive mindmap engine with neon branches, canvas rendering, pan/zoom, and export. |
| `package.json` | 375 bytes / 14 lines | Project scripts (`npm test`, `npm run check`) and metadata. |
| `tests/` | 122 test cases | Comprehensive multi-tier test suites (Tiers 1-4, Visible, Hidden, Adversarial). |

---

## 3. Subsystem Deep-Dive

### 3.1 Markdown Parsing & Code Block Rendering Pipeline

**Source Location**: `app.js` lines 4365–4595 (`formatMessage`) and lines 1688–1733 (`formatWorkspaceMessageContent`).

#### Mechanism:
1. **Tool Stripping**: Cleans `<suna_tool_call>` tags from LLM responses (`app.js:4368-4369`).
2. **Placeholder Registry**: Uses an immutable tokenization system (`%%SUNA_PLACEHOLDER_X%%` / `%%WS_CODE_X%%`) to isolate fenced blocks before regex markdown rules and `<br>` transformations occur (`app.js:4379-4386`).
3. **Fenced Code Handler**:
   - `mindmap`: Renders `renderMindmapIframe` (`app.js:4395-4410`).
   - `mermaid`: Renders `<div class="mermaid" ...>` (`app.js:4412-4430`).
   - `kanban`: Renders `parseKanban` (`app.js:4432-4434`).
   - Standard code: Wraps in `<div class="code-block-wrapper">` containing `<div class="code-lang">`, `<button class="btn-copy-code">`, `<pre><code>`, and optional `<button class="btn-preview-artifact">` (`app.js:4443-4448`).
4. **Workspace Chat Parser**:
   - `formatWorkspaceMessageContent` wraps code in `<div class="code-block-wrapper">` with `<button class="btn-workspace-apply" onclick="applyWorkspaceCode(this)">` (`app.js:1704-1712`).
5. **Interactive Actions**:
   - `window.copyCodeBlock`: Targets `button.closest('.code-block-wrapper').querySelector('pre code')` (`app.js:6211-6217`).
   - `window.openArtifactFromCodeBlock`: Extracts `textContent` and calls `window.openArtifact` (`app.js:6219-6229`).
   - `window.applyWorkspaceCode`: Reads `data-code` from attribute, sets `#artifact-editor-textarea.value`, fires `input` event, updates `#artifact-iframe.srcdoc` (`app.js:1759-1769`).

---

### 3.2 SSE Streaming & LLM Client Pipeline

**Source Location**: `app.js` lines 5647–6112 (`generateAIResponse`).

#### Mechanism:
1. **Proxy Dispatch**: `getProxyForModel(model)` routes requests to primary (`baseUrl`) or secondary (`baseUrl2`) proxy endpoints (`app.js:5198-5206`).
2. **Pre-Processing & Multi-Chamber Routing**:
   - Vision detection & pre-description (`describeImagesWithVision`, `app.js:5693-5730`).
   - Real-time web search (`performWebSearch`, `app.js:5732-5747`).
   - Implicit Lượt 1 Chamber reasoning (`chamberModel`, `app.js:5854-5888`).
3. **Main Stream Ingestion**:
   - Reads `res.body.getReader()` with `TextDecoder` (`app.js:5917-5935`).
   - Buffers SSE chunks split by `\n` matching `data: ...` (`app.js:5936-5943`).
   - Parses `delta = parsed.choices?.[0]?.delta?.content` and appends to `assistantContent` (`app.js:5945-5950`).
4. **Throttled DOM Update**:
   - Uses `requestAnimationFrame` and `bubbleEl._renderPending` lock to prevent layout thrashing (`app.js:5966-5976`).
5. **Stream Finalization**:
   - Pushes `{ id, role: 'assistant', content: assistantContent, ... }` to `activeChat.messages`.
   - Calls `saveState(true)` (IndexedDB + Cloud) and `renderMessages()` (`app.js:5998-6003`).

---

### 3.3 Live Workspace & 3-Pane Split System

**Source Location**: `app.js` lines 1343–2046 (`initArtifactsAndSearch`) and `index.html` lines 787–842.

#### Mechanism:
1. **Container Elements**:
   - `#artifacts-panel`: Main split panel with `data-view="split|editor|preview"`.
   - `#workspace-left-handle`: Resizes workspace width between 25% and 100% of viewport (`app.js:1458-1481`).
   - `#artifact-resizer-1`: Dual column resizer between Editor and Preview (`app.js:1483-1517`).
   - `#artifact-resizer-2`: Dual column resizer between Preview and Workspace Chat (`app.js:1519-1553`).
2. **Iframe Pointer-Locking Invariant**:
   - `lockAllIframes()` sets `pointer-events: none` on all iframes during dragging (`app.js:1445-1449`).
   - `unlockAllIframes()` restores `pointer-events: auto` on `mouseup` and `window.blur` (`app.js:1451-1456`).
3. **Editor & Preview Synchronization**:
   - `#artifact-editor-textarea` listens to `input` event -> writes to `#artifact-iframe.srcdoc` (`app.js:1584-1596`).
4. **Workspace AI Assistant**:
   - `sendWorkspaceMessage()` (`app.js:1771-1867`) injects `#artifact-editor-textarea.value` into the system prompt.
   - Receives assistant advice and code snippets.

---

## 4. Mapping for Requirements R1, R2, R3, R4

### 4.1 Requirement R1: Collapsible Long Code Blocks
- **Target Files**:
  - `app.js`:
    - `formatMessage()` (lines 4443–4448): Calculate line count (`code.split('\n').length`). If lines > 12, add class `collapsible collapsed`, attach `data-lines`, add header toggle button and bottom gradient collapse overlay.
    - `formatWorkspaceMessageContent()` (lines 1707–1712): Mirror collapsible structure in workspace chat code blocks.
    - New global function: `window.toggleCodeCollapse(btn)`: Toggles `.collapsed` and `.expanded` on `.code-block-wrapper`, updates button text and icon.
    - Validate `copyCodeBlock`, `openArtifactFromCodeBlock`, `applyWorkspaceCode`: Verified compatible because they query `.code-block-wrapper pre code` which remains intact inside the DOM.
  - `styles.css`:
    - Define `.code-block-wrapper.collapsible.collapsed` (`max-height: 260px; overflow: hidden; position: relative;`).
    - Define `.code-block-wrapper.collapsible.expanded` (`max-height: none;`).
    - Define `.code-block-collapse-overlay` (glassmorphic gradient fade with expand button).
    - Define `.btn-toggle-collapse` header styling with Zen Dark & Light mode compatibility.

### 4.2 Requirement R2: Multi-Turn Auto-Continuation (Infinite Token Streaming)
- **Target Files**:
  - `app.js`:
    - `generateAIResponse()` (lines 5647–6112):
      - Wrap the primary API stream in an auto-continuation loop (`let turn = 0; turn < MAX_CONTINUATION_TURNS; turn++`).
      - In stream chunk parsing, capture `finish_reason = parsed.choices?.[0]?.finish_reason`.
      - At the end of each stream reader turn:
        - Check continuation trigger condition:
          `const needsContinuation = finish_reason === 'length' || (assistantContent.split('```').length % 2 === 0);`
        - If `needsContinuation` is true and not aborted:
          - Construct continuation turn messages:
            `apiMessages.push({ role: 'assistant', content: assistantContent });`
            `apiMessages.push({ role: 'user', content: 'Tiếp tục chính xác từ chỗ bị ngắt quãng, không lặp lại nội dung đã viết.' });`
          - Execute next stream turn directly appending to `assistantContent` and updating the active `bubbleEl`.
      - Ensure `State.abortController` cleanly breaks out of the loop on user abort.
      - Ensure compatibility with both `flash` and `pro` modes.

### 4.3 Requirement R3: Direct Live Workspace Modification & Live Sync
- **Target Files**:
  - `app.js`:
    - `sendWorkspaceMessage()` (lines 1845–1855):
      - When assistant response `reply` is received:
      - Automatically detect and extract complete HTML/JS/CSS code blocks from `reply` using regex (`/```(?:html|xml|svg|javascript|css)?\s*\n([\s\S]*?)```/i`).
      - If valid code is extracted:
        - Update `#artifact-editor-textarea.value = extractedCode`.
        - Dispatch `new Event('input')` on `#artifact-editor-textarea`.
        - Update `#artifact-iframe.srcdoc = extractedCode`.
        - Show confirmation toast: `if (window.toast) window.toast('Suna AI đã tự động cập nhật Live Workspace!', 'success');`.
      - Preserve `window.applyWorkspaceCode` for manual click fallback and test compliance.

### 4.4 Requirement R4: Verification, Test Parity & Code Hygiene
- **Target Files**:
  - `tests/test_collapsible_continuation_workspace_sync.js` (new automated test suite) & existing test files in `tests/`.
  - Add assertions for:
    - R1: Collapsible CSS rules, `.collapsible.collapsed`, `.btn-toggle-collapse`, `window.toggleCodeCollapse`.
    - R2: Multi-turn continuation loop detection, `finish_reason === 'length'`, unclosed backtick detection, abort safety.
    - R3: Automated code extraction, direct textarea injection, iframe srcdoc update, toast confirmation.
  - Zero syntax errors on `node -c app.js && node -c redesign.js`.
  - 100% pass rate across all existing (122 tests) + new test suites.

---

## 5. Architectural Invariants, Regression Risks & Mitigations

| Risk | Cause | Mitigation |
|---|---|---|
| **Test String Invalidation** | Existing tests in `test_challenger_adversarial_suite.js` and `test_workspace_resizers_and_storage.js` assert specific regex patterns like `_workspaceAbortController.abort()`, `sessionTemplates`, `window.applyWorkspaceCode`. | Do NOT delete or rename existing function names, class names, or timeout constants (`45000`). Extend logic additively. |
| **Markdown Placeholder Collision** | Introducing new HTML wrappers around code blocks might break regex placeholder replacement if not properly protected. | Ensure all HTML generation happens inside the protected placeholder return value before regex restore (`app.js:4451` and `app.js:1714`). |
| **Streaming UI Flashing** | Multiple continuation turns could trigger re-rendering flashes if the DOM message is recreated between turns. | Keep the exact same `assistantEl` and `bubbleEl` references across all continuation turns and throttle updates via `requestAnimationFrame`. |
| **Workspace Code Overwrite Glitch** | If Suna Workspace AI replies with a conversational answer that contains a tiny snippet, overwriting the entire editor could delete user's existing work. | Check code block size / completeness (e.g. valid HTML structure or substantial code length) or match intent before auto-applying, and always trigger `input` event so undo history remains intact. |
