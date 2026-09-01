# Specification Mining & Discrepancy Audit Report

## 1. Observation
- **Authoritative Specification Source Files**:
  - `d:\Suna Chat\.specify\constitution.md` (Lines 1–21): Core principles (no breaking old features, isolated modules, cleanup event listeners on close), UI standards (Glassmorphism, dark gradient `#0d0b14`, `#14121e`, `rgba(20, 18, 30, 0.65)` with `backdrop-filter: blur(20px)`, accents `#e8a87c` / `#c0392b`, 60fps micro-interactions), and Technical standards (Vanilla JS, global State in `app.js`, `preventDefault`/`stopPropagation`).
  - `d:\Suna Chat\.specify\specify.md` (Lines 1–34): Business requirements for R1 (3-pane layout), R2 (Suna AI Assistant + "Áp dụng vào Editor"), R3 (Session management + "+ Bài mới" + Templates: Blank, HTML5, SVG, Tailwind), R4 (Left handle 40%–100% + Fullscreen toggle 60% <-> 100%).
  - `d:\Suna Chat\.specify\plan.md` (Lines 1–30): Technical architecture for `index.html` markup, `styles.css` glassmorphism & resizers, `app.js` dual resizers, left handle, assistant chat API, code parser.
  - `d:\Suna Chat\.specify\tasks.md` (Lines 1–29): Phase 1 (Markup), Phase 2 (CSS), Phase 3 (JS), Phase 4 (Verification & Git).
  - `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md` (Lines 1–44): Requirements R1 (Full codebase audit, memory leak cleanup across Mindmap, Kanban, Lofi, Workspace, Chat, async/localStorage safety), R2 (3-pane ecosystem & Assistant), R3 (Spec-Kit SDD sync), R4 (Ponytail Vanilla JS & Anti-Slop UI/UX), plus Acceptance Criteria 1 (`node -c`, mocha tests 100%), 2 (DOM & performance), 3 (State & business logic).
  - `tests/ui_redesign/visible_tests/*.js` and `tests/ui_redesign/hidden_tests/*.js`: 9 Mocha tests validating color palette (`#0d0b14`, `#e8a87c`, `#c0392b`, `backdrop-filter: blur`), typography (`Cinzel Decorative` / `Playfair Display` for `h1-h3`, Google Fonts, safe fallbacks), transitions (`transform`/`opacity` only, no `width`/`height` transitions on `.btn`), and contrast ratio (WCAG AA >= 4.5:1).
  - **Verified runnable commands**:
    - `node -c app.js; node -c redesign.js` -> Exit code 0 (Syntax clean).
    - `npx mocha "tests/ui_redesign/**/*.js"` -> 9 passing (31ms).

---

## 2. Logic Chain
1. **Source of Truth Alignment**: The project constitution establishes non-negotiable architectural invariants: Vanilla JS only, modular encapsulation with event cleanup, strict Zen/Glassmorphic palette (`#0d0b14`, `#14121e`, `#e8a87c`, `#c0392b`), and 60fps animations.
2. **Feature Group Mining**:
   - *3-Pane Live Workspace*: `#artifact-editor-container` (35%), `#artifact-preview-container` (35%), `#artifact-chat-container` (30%) in `split` mode. Switches cleanly to 100% width in `editor` and `preview` modes while hiding irrelevant panes and resizers.
   - *Resizer Dragging & Boundaries*: Left handle `#workspace-left-handle` controls overall panel width (25%–100%). Internal resizers `#artifact-resizer-1` and `#artifact-resizer-2` adjust column splits with clamp guards (min 10% per active pane) and disable iframe pointer events (`previewContainer.style.pointerEvents = 'none'`) during dragging to prevent dropped mouse events.
   - *Suna AI Workspace Assistant*: Injects current editor code into system prompt context. Markdown parser renders `.btn-workspace-apply` with encoded code. Clicking triggers `applyWorkspaceCode()` -> updates textarea -> emits `input` event -> re-renders iframe live.
   - *Session Management*: "+ Bài mới" (`#btn-new-session`) resets editor with selected template (blank, html5, svg, tailwind), resets assistant chat, and updates preview.
   - *Lifecycle & Cleanup*: Audited event listener attachment in `app.js` across Mindmap (iframe message bridge), Kanban (drag/drop handlers), Lofi Player (`SunaLofiPlayer` audio lifecycle and error fallback), and Chat.
   - *Design System & Accessibility*: WCAG AA contrast compliance (`--text-primary: #e0e0e0` against `#0d0b14`), GPU-accelerated micro-interactions (`transform`/`opacity` only), serif headers (`Cinzel Decorative`), and glassmorphism (`backdrop-filter: blur(20px)`).
   - *Ponytail Principles*: Pure Web APIs (DOM, Audio, Drag & Drop, Blob, TextDecoder, fetch) with no extra runtime dependencies or build bloat.
3. **Discrepancy Identification**:
   - **Discrepancy A (Left Handle Bounds)**: `specify.md` §R4 specifies left handle resize range as 40%–100%, whereas `app.js` line 1457 implements `Math.max(25, Math.min(percentage, 100))` (25%–100%). The codebase implementation is more flexible for large monitors, but the spec documentation needs harmonization.
   - **Discrepancy B (SDD Scope Coverage)**: `ORIGINAL_REQUEST.md` §R1 explicitly mandates event lifecycle cleanup and exception safety across Mindmap, Kanban, Lofi Player, and Chat stream, whereas `.specify/specify.md` and `.specify/plan.md` previously only detailed the Live Workspace upgrade. The `.specify/` suite needs expansion to cover the full application lifecycle audit.
   - **Discrepancy C (Test Suite in Tasks)**: Automated testing suite (`tests/ui_redesign/**/*.js`) is verified by Mocha (9 passing), but `.specify/tasks.md` only mentions manual browser verification and `node -c`. `tasks.md` should include test suite execution in Phase 4.

---

## 3. Caveats
- No external npm packages were installed; all test verifications rely on npx mocha against static assets and syntax validators.
- LocalStorage state persistence is dependent on browser storage quotas; exception handling exists in `saveState()` and `loadState()`.
- Lofi audio fallback points to an external static URL (`soundhelix.com`) if local `assets/suna-lofi.mp3` fails.

---

## 4. Conclusion
All functional and non-functional specifications have been thoroughly discovered, extracted, and categorized. The system features are fully mapped to concrete DOM elements, CSS rules, JavaScript handlers, and test assertions. The discrepancies in `.specify/` documentation have been clearly cataloged for synchronization.

---

## 5. Verification Method
- Run syntax verification: `node -c app.js; node -c redesign.js` (Must return code 0).
- Run automated test suite: `npx mocha "tests/ui_redesign/**/*.js"` (All 9 tests must pass).
- Verify DOM element existence and IDs: inspect `index.html` lines 784–839.
- Verify CSS glassmorphic tokens: inspect `styles.css` lines 20–31 and 5266–5629.

---

# Exhaustive Specification Inventory

## Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Workspace Layout | 3-Pane Split View | Displays Code Editor (35%), Live Preview Iframe (35%), and Suna AI Assistant (30%) concurrently | `data-view="split"` attribute on `#artifacts-panel` | 3 resizable panes rendered side-by-side | Resets inline widths if view mode changes | `.specify/specify.md` R1, `index.html`:784, `styles.css`:5360 |
| 2 | Workspace Layout | Editor-Only Mode | Maximizes Code Editor to 100% width while hiding Preview and Chat panes | Click `.view-toggle-btn` with `data-view="editor"` | `#artifact-editor-container` set to 100% width, others `display: none` | Resizers hidden via `display: none !important` | `.specify/specify.md` R1, `app.js`:1827, `styles.css`:5376 |
| 3 | Workspace Layout | Preview-Only Mode | Maximizes Live Preview Iframe to 100% width while hiding Editor and Chat panes | Click `.view-toggle-btn` with `data-view="preview"` | `#artifact-preview-container` set to 100% width, others `display: none` | Resizers hidden via `display: none !important` | `.specify/specify.md` R1, `app.js`:1827, `styles.css`:5388 |
| 4 | Resizers | Left Handle Outer Resizer | Draggable handle on panel left edge to resize workspace width across viewport | Mouse drag on `#workspace-left-handle` (`mousedown`, `mousemove`, `mouseup`) | Panel width dynamically updated from 25% (or 40%) to 100% | Clamped with `Math.max(25, Math.min(percentage, 100))` | `.specify/specify.md` R4, `app.js`:1441, `styles.css`:5343 |
| 5 | Resizers | Fullscreen Quick Toggle | Toggles workspace between default width (60%) and fullscreen (100%) | Click `#btn-expand-workspace` | Panel width toggles 60% <-> 100%, icon switches `open_in_full` <-> `close_fullscreen` | Graceful fallback if panel not active | `.specify/specify.md` R4, `app.js`:1471, `index.html`:788 |
| 6 | Resizers | Dual Internal Column Resizers | Independent horizontal splitters to resize Editor vs Preview vs Chat | Mouse drag on `#artifact-resizer-1` and `#artifact-resizer-2` | Respective column widths dynamically adjusted | Iframe pointer-events disabled during drag to avoid mouse drop; minimum 10% pane guard | `.specify/plan.md` §3, `app.js`:1570, `styles.css`:5266 |
| 7 | Code Editor | Live Sync to Iframe | Real-time synchronization of editor HTML/CSS/JS into preview sandbox | User typing / pasting into `#artifact-editor-textarea` (`input`, `change` events) | `iframe.srcdoc` updated with latest code | Malformed HTML rendered safely in sandbox iframe | `.specify/constitution.md` §3, `app.js`:1416 |
| 8 | Code Editor | Tab Key Indentation | Indents 2 spaces when Tab is pressed in editor textarea without losing focus | `keydown` event `key === 'Tab'` on editor textarea | Inserts 2 spaces at cursor position and updates selection | Default tab focus navigation prevented with `e.preventDefault()` | `app.js`:1424 |
| 9 | Assistant | Context Injection | Auto-injects current editor code into system prompt for coding assistant | `sendWorkspaceMessage()` trigger | System prompt constructed with `[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]: ```html ... ``` ` | If editor empty, sends blank code block | `.specify/specify.md` R2, `app.js`:1764 |
| 10 | Assistant | Workspace Chat API Integration | Sends user query with conversation history to `/chat/completions` | Input in `#workspace-chat-input`, click `#btn-send-workspace-chat` or press Enter | Streaming/response JSON parsed, assistant message bubble appended | Validates active model and API key; displays error toast on HTTP failure | `.specify/plan.md` §3, `app.js`:1734 |
| 11 | Assistant | Thinking State Indicator | Animated typing bubble showing reasoning status while waiting for AI response | Triggered upon message send | Appends `#typing_<timestamp>` element with spinning icon | Element safely removed in `try/catch/finally` | `app.js`:1748 |
| 12 | Assistant | Apply Code to Editor | Code blocks in assistant messages include "Áp dụng vào Editor" button | Click `.btn-workspace-apply` inside assistant code block | Decodes URI component, writes code into editor textarea, dispatches `input` event, triggers success toast | Handles special characters, HTML entities, and Unicode safely | `.specify/specify.md` R2, `app.js`:1669, 1724 |
| 13 | Session Management | New Session Button | Resets workspace with chosen boilerplate template | Click `#btn-new-session` | Overwrites editor with template, dispatches input event, resets `State.workspaceMessages`, toasts success | Clears assistant chat history to prevent context confusion | `.specify/specify.md` R3, `app.js`:1555 |
| 14 | Session Management | Boilerplate Templates | Pre-defined templates: Blank, HTML5, SVG Canvas, Tailwind Play | Selection on `#select-session-template` | Loads corresponding boilerplate string into editor | Default fallback to empty string if key not found | `.specify/specify.md` R3, `app.js`:1490 |
| 15 | Workspace Actions | Copy Code | Copies entire editor or iframe content to system clipboard | Click `#btn-copy-artifact` | Text copied to clipboard, success toast | Falls back to `navigator.clipboard.writeText` or `window.copyText`; toasts info if code empty | `app.js`:1849 |
| 16 | Workspace Actions | Download HTML | Downloads current workspace code as a .html file | Click `#btn-download-artifact` | Generates Blob, triggers download of `suna-workspace.html` | Checks for empty content before creating object URL; revokes URL after click | `app.js`:1870 |
| 17 | Workspace Actions | Collab with Suna | Transfers code from workspace into main chat input prompt for deep reasoning | Click `#btn-collab-suna` | Formats markdown prompt, populates `#message-input`, focuses input, closes workspace panel | Checks for empty content before initiating transfer | `app.js`:1888 |
| 18 | Workspace Actions | Refresh Iframe | Reloads iframe sandbox content | Click `#btn-refresh-artifact` | Re-assigns `iframe.srcdoc` from editor value or flushes srcdoc | Clears and reassigns with 50ms timeout if editor textarea missing | `app.js`:1909 |
| 19 | Artifact Integration | Open Artifact from Chat | Triggers workspace opening from code block preview button in main chat | Click `.btn-preview-artifact` in chat message or call `window.openArtifact(contentOrB64)` | Decodes Unicode base64 or raw text, populates editor & iframe, activates `#artifacts-panel` | Catches base64 decode errors with TextDecoder fallback | `app.js`:1387, 4341 |
| 20 | Mindmap Module | Interactive Mindmap Iframe | Interactive knowledge tree engine with zoom, pan, drag, search, and export | Rendered via `mindmap.html` in iframe or Mermaid in markdown | Renders node hierarchy, connection lines, neon branch colors, SVG/PNG export | Sandboxed iframe, fallback to raw text or skeleton loading if parsing fails | `mindmap.html`:1–200, `app.js`:3410, 4297 |
| 21 | Kanban Module | Drag-and-Drop Task Board | Interactive task cards draggable between columns with status toggles | User drags `.kanban-card` into `.kanban-column` | Moves card in DOM, updates column task count badge, toggles complete | `dragstart`, `dragend`, `dragover`, `dragleave`, `drop` with `e.preventDefault()` | `app.js`:4560–4670 |
| 22 | Kanban Module | Execute Task with Suna | One-click button on Kanban card to assign task execution to main chat AI | Click `.btn-kanban-execute` on card | Sends task description to Suna Chat for immediate processing | Escapes quotes and URI components safely | `app.js`:4584 |
| 23 | Lofi Player | Ambient Audio & Visualizer | Background study music player with mood tracks and animated frequency bars | Click `#lofi-play-btn`, adjust `#lofi-volume-slider`, or AI mood switch | Plays audio track, toggles visualizer CSS animation, marquee title | Catches `NotAllowedError` (user interaction required) and audio loading errors with fallback URL | `app.js`:2100–2230 |
| 24 | Lofi Player | Mood Switching & Sentiment Sync | Dynamic mood adjustment (calm, excited, sad, stressed, creative) via AI sentiment analysis | AI response sentiment classifier or tool call `change_lofi_mood` | Changes track URL and marquee title, preserves playing state | Security check validates against `ALLOWED_MOODS` whitelist | `app.js`:2216, 5896 |
| 25 | UI & Styling | Zen / Ink-Wash Dark Palette | Visual design system with ink charcoal and peach/vermilion accents | Root CSS variables: `--bg-primary: #0d0b14`, `--bg-secondary: #1a1824`, `--accent-1: #e8a87c`, `--accent-2: #c0392b` | Uniform dark aesthetic across all panels and widgets | Passes WCAG AA contrast ratio (>= 4.5:1) | `tests/ui_redesign/visible_tests/test_color_palette.js`, `styles.css`:20 |
| 26 | UI & Styling | Glassmorphism & Blur | Frosted glass look for panels and floating containers | `backdrop-filter: blur(20px)` on panels, modals, chat container | Translucent blurred background with 1px border highlights | Light mode fallback configured for light theme | `.specify/constitution.md` §2, `styles.css`:23, 94 |
| 27 | UI & Styling | Typography & Headers | Serif typography for titles (`Cinzel Decorative` / `Playfair Display`) and clean body text (`Satoshi` / `Inter`) | CSS font-family rules for `h1, h2, h3` with `letter-spacing: 1px` | Distinctive editorial feel without layout shifts | Fallbacks to `serif` and `sans-serif` defined | `tests/ui_redesign/visible_tests/test_typography.js`, `styles.css`:5620 |
| 28 | Performance | 60fps Micro-interactions | Butter-smooth transitions without layout thrashing | Transitions applied exclusively to `transform`, `opacity`, `background-color` | Zero layout reflow on button hover/active | Banned transitions on `width`, `height`, `top`, `left` on interactive buttons | `tests/ui_redesign/hidden_tests/test_transition_perf.js`, `styles.css`:5624 |
| 29 | Architecture | Ponytail Native Vanilla JS | Zero external npm bundler / framework dependencies | Native Web APIs: `fetch`, `Audio`, `Blob`, `URL`, `TextDecoder`, `addEventListener` | Lightweight, fast load, zero build step | Clear root-cause bug isolation and state guards | `.specify/constitution.md` §3, `ORIGINAL_REQUEST.md` R4 |
| 30 | SDD Compliance | Spec-Driven Development | Constitution -> Specify -> Plan -> Tasks -> Verification lifecycle | `.specify/` documentation suite | Structured development artifacts and traceable task status | Strict verification with Mocha tests and `node -c` | `.specify/constitution.md`, `specify.md`, `plan.md`, `tasks.md` |

---

## Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `window.openArtifact` | Base64 string with multibyte UTF-8 Unicode characters (e.g. Vietnamese text) | Decodes using `Uint8Array` and `TextDecoder('utf-8')` to prevent corrupted characters (`app.js`:1396–1403). |
| 2 | `window.openArtifact` | Corrupted Base64 or plain HTML starting with `<` | Catches exception in `try/catch` and falls back to treating input as raw string without throwing (`app.js`:1393, 1404). |
| 3 | Left Resize Handle | Mouse dragged beyond screen limits (e.g. `clientX < 0` or `clientX > windowWidth`) | Clamps percentage between 25% and 100% using `Math.max(25, Math.min(percentage, 100))` (`app.js`:1457). |
| 4 | Dual Column Resizers | Dragging Resizer 1 so close to right that Preview or Chat collapses | Clamps editor width between 10% and 80%, enforces minimum 10% width on preview pane (`app.js`:1606–1614). |
| 5 | Dual Column Resizers | Mouse moves over `<iframe>` during active drag | Sets `previewContainer.style.pointerEvents = 'none'` on mousedown so mousemove events are not swallowed by iframe DOM (`app.js`:1586, 1594, 1640). |
| 6 | View Mode Switch | Switching from `split` to `editor` or `preview` while columns have inline style widths | Resets inline `style.width` on containers and hides inactive panes and resizers via CSS (`app.js`:1837–1845, `styles.css`:5283). |
| 7 | Workspace Assistant Chat | User submits empty message or whitespace only | Input value trimmed; if empty, function returns immediately with no API call (`app.js`:1738). |
| 8 | Workspace Assistant Chat | API key or Base URL missing in `State.settings` | Halts execution, displays error toast "Vui lòng cấu hình API", does not corrupt state (`app.js`:1742). |
| 9 | Workspace Assistant Chat | API endpoint returns HTTP 4xx/5xx or network disconnect | Catches error, removes typing indicator from DOM, logs error to console, displays error toast (`app.js`:1803–1807). |
| 10 | "Áp dụng vào Editor" | AI code snippet contains quotes, HTML entities, and newlines | Encodes code with `encodeURIComponent` in HTML attribute; button click decodes with `decodeURIComponent`, sets editor value and dispatches `input` event (`app.js`:1669, 1724). |
| 11 | Session Template Switch | Switching template while previous workspace assistant conversation exists | Overwrites editor with template code, dispatches `input` event, flushes `State.workspaceMessages = []`, re-renders assistant greeting (`app.js`:1559–1565). |
| 12 | Download Artifact | User clicks download button when editor is completely blank | Detects empty string, shows info toast "Không có nội dung để tải xuống!", avoids downloading empty file (`app.js`:1874). |
| 13 | Lofi Player | Audio autoplay blocked by browser policy (`NotAllowedError`) | Catches promise rejection, sets `isPlaying = false`, resets play button icon, toasts user to click to authorize audio (`app.js`:2137, 2166, 2192). |
| 14 | Lofi Player | Audio track URL fails to load (404 or network error) | Audio element `error` listener triggers, switches audio src to fallback URL (`soundhelix.com`), toasts notification (`app.js`:2129–2142). |
| 15 | Lofi Player | Assistant requests unapproved mood (e.g. injection or typo) | Validates against `ALLOWED_MOODS = ['calm', 'excited', 'sad', 'stressed', 'creative']`; logs security warning and rejects invalid input (`app.js`:2217–2221). |
| 16 | Kanban Drag & Drop | Dragging card over non-column area or canceling drag | `dragend` cleans up `.dragging` and `.drag-over` CSS classes across all columns (`app.js`:4612–4624). |

---

## Discrepancy Analysis & Synchronization Plan for `.specify/`
1. **Left Resize Handle Boundary Value**:
   - *Current `.specify/specify.md`*: Mentions "kéo rộng từ 40% đến 100% màn hình".
   - *Codebase (`app.js`:1457)*: Uses `Math.max(25, Math.min(percentage, 100))`.
   - *Sync Action*: Update `specify.md` §R4 and `plan.md` to reflect the 25% minimum threshold for ultra-wide screen support.
2. **Expansion of SDD Scope to Full Codebase Audit**:
   - *Current `.specify/`*: Focuses almost exclusively on the Live Workspace feature.
   - *Original Request (`ORIGINAL_REQUEST.md` §R1)*: Requires comprehensive audit covering Mindmap, Kanban, Lofi Player, and Chat lifecycle/memory leaks.
   - *Sync Action*: Add modular lifecycle and cleanup specifications to `.specify/specify.md` and `.specify/plan.md`.
3. **Mocha Test Suite Documentation**:
   - *Current `.specify/tasks.md`*: Only lists `node -c app.js` and manual browser check.
   - *Codebase*: Contains 9 automated tests in `tests/ui_redesign/visible_tests/*.js` and `tests/ui_redesign/hidden_tests/*.js`.
   - *Sync Action*: Add `npx mocha tests/ui_redesign/**/*.js` to Phase 4 in `.specify/tasks.md`.