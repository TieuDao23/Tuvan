# Suna Chat - Engineering Lessons & Architecture Notes

## 1. Top Bar Layout & Flexbox Overflow Containment
- **Problem**: When multiple flex items (Lofi player, user profile, sync indicator, and action buttons) were placed inside `.top-bar-right` without explicit nowrap constraints, small viewport widths caused flex items to wrap, pushing elements downwards and vertically truncating icon buttons against the fixed `48px` header height.
- **Solution**:
  - Always enforce `flex-wrap: nowrap; align-items: center; overflow: visible; height: var(--topbar-height, 48px); min-height: var(--topbar-height, 48px);` on both `.top-bar` and `.top-bar-right`.
  - On responsive breakpoints (<= 1150px), collapse secondary components into a compact state (e.g. `.suna-lofi-player` to mini pill with hidden volume slider) and transition non-essential icon buttons (`#btn-export-chat`, `#btn-api-settings`) into the mobile overflow menu (`.mobile-dropdown-container`).

## 2. CSS Syntax Hygiene & Deduplication
- **Problem**: Accidental copy-pasting during refactors introduced an unclosed CSS selector (`.message.assistant .message-bubble {`) at line 3986, which swallowed subsequent rules (`.user-dropdown .sidebar-user-info`) and created a duplicate block of rules with duplicate 4x-5x `-webkit-backdrop-filter` declarations.
- **Solution**:
  - Maintain single canonical declarations for vendor prefixes (1 `-webkit-backdrop-filter` paired with 1 `backdrop-filter`).
  - Regularly verify curly brace balance and selector boundaries using automated static analysis test suites.

## 3. Z-Index Layering Hierarchy
- Modal Overlays (`.modal-overlay`): `z-index: 2000` (highest modal dialogs, above workspace panels and handles).
- Interactive Workspace Split Panel (`.artifacts-panel`): `z-index: 1000`, left handle `z-index: 1001`.
- Dropdown Menus (`.user-dropdown`, `.mobile-more-menu`): `z-index: 250` (floating above header and chat content).
- Top Bar Header (`.top-bar`): `z-index: 100`.
- Ensure light mode styling provides high opacity frosted glass backgrounds (`rgba(255, 255, 255, 0.96)`) so dropdowns remain sharp and legible over bright text and light bubbles.

## 4. Mobile Menu Synchronization & Mutual Dropdown Dismissal
- **Problem**: When multiple dropdown menus exist in top-bar headers (`#user-dropdown` and `#mobile-more-menu`), opening one while stopping event propagation without explicitly clearing the other caused simultaneous overlapping menus. Additionally, mobile theme icon (`#theme-icon-mobile`) was out-of-sync with desktop `#theme-icon`.
- **Solution**:
  - Implement mutual dismissal on dropdown toggle actions.
  - Synchronize both `#theme-icon` and `#theme-icon-mobile` in `applyTheme()`.
  - Set `min-width: 0` on `.top-bar-center` to guarantee children can shrink properly on narrow viewports without pushing siblings off-screen.

## 5. System Toast Stacking Precedence
- **Problem**: `.toast-container` was previously configured at `z-index: 200`. When user actions inside modal dialogs (`z-index: 2000`) or workspace panels (`z-index: 1000`) triggered notification toasts, toasts were rendered behind the modal backdrop, rendering critical feedback invisible to the user.
- **Solution**:
  - Toast notifications must always reside on the topmost stacking context (`z-index: 10000`), above all modals, overlays, and full-page auth screens (`z-index: 9999`).

## 6. Dynamic Label Truncation & Resilient Header Layouts
- **Problem**: Dynamic model names with long string lengths (e.g. 50+ chars) caused flex item expansion on viewports between 768px and 1200px where mobile media queries had not yet engaged.
- **Solution**:
  - Never rely solely on media queries for text truncation. Base flex items like `#current-model-name` must specify `max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` in base styles, with progressively tighter max-widths at responsive breakpoints.

## 7. WAI-ARIA & Keyboard Navigation on Header Interactive Elements
- **Problem**: Header widgets formatted as `role="button"` (e.g. `#current-model-display`) responded only to pointer `click` events, failing accessibility requirements for keyboard-only users.
- **Solution**:
  - Elements with `role="button"` and `tabindex="0"` must register keydown listeners for `Enter` and `Space` (`e.key === 'Enter' || e.key === ' '`) to invoke the corresponding action and call `e.preventDefault()`.

## 8. Cross-Browser Custom Slider Normalization
- **Problem**: Applying `accent-color` alone to range sliders does not standardize track height, border-radius, or background colors between WebKit/Blink and Gecko engines.
- **Solution**:
  - Explicitly define `::-webkit-slider-runnable-track` and `::-moz-range-track` matching the active theme's translucent track background in both Dark Mode (`rgba(255, 255, 255, 0.15)`) and Light Mode (`rgba(0, 0, 0, 0.12)`).

## 9. Custom Web Font Glyph Descender Clipping in Fixed-Height Headers
- **Problem**: When user selects custom web fonts or when rendering strings with bottom descenders (e.g. `g, j, p, q, y` and Vietnamese diacritics like `ệ, ỹ, ợ`), inheriting `line-height: 1.6` inside compact pills/containers with `overflow: hidden` caused bottom glyph descenders to be vertically clipped against the 48px header boundary.
- **Solution**:
  - Explicitly assign `line-height: 1.2` and `vertical-align: middle` to inline flex text wrappers (`.current-model-display`, `#current-model-name`, `.lofi-track-title`, `.mode-badge`), guaranteeing vertical balance and preventing text clipping under all font scale factors.

## 10. Dynamic Viewport Height Normalization (`100dvh`) Across Mobile Browsers
- **Problem**: Mobile browsers with dynamic address bars (iOS Safari, Android Chrome) trigger viewport reflows and scroll jumping when layouts use fixed `100vh`.
- **Solution**:
  - Pair `height: 100vh` with modern `height: 100dvh` and `min-height: -webkit-fill-available` on root containers (`body`, `#app`, `.sidebar`, `.bg-animation`), preserving exact full-height containment across viewport expansions and contractions.

## 11. Direct Workspace Live Sync (R3) & Adversarial Resilience
- **Problem**: In an interactive AI-assisted code workspace, AI responses often contain multi-part markdown (bash install commands, JSON configs, conversational greetings, and runnable code). Blindly replacing editor content on every message would clobber existing user work during conversational replies or inject non-runnable shell commands into the live preview iframe.
- **Solution**:
  - Implement heuristic code block prioritization in `extractWorkspaceCode`: search first for runnable HTML/SVG/Canvas blocks (`html`, `svg`, `xml` or content containing `<canvas`, `<!DOCTYPE`, `<html`), fall back to JS/CSS, and ignore non-runnable blocks (bash, json, etc.).
  - Pure text replies and inline markdown spans (`` `code` ``) return `null`, guaranteeing that `autoApplyWorkspaceCode` leaves `#artifact-editor-textarea` and `#artifact-iframe.srcdoc` completely untouched without false toast notifications.
  - Dispatch `new Event('input', { bubbles: true })` on editor update to ensure event-delegated listeners, auto-save timers, and syntax highlighters trigger seamlessly.
## 12. Multi-Account Data Partitioning, Guest UID Persistence & Resilient Auth Lifecycle
- **Problem**: 
  - Dynamic timestamp UIDs on reload (`guest-${Date.now()}`) caused complete chat history loss for guest users upon page reload (F5).
  - Cross-account pollution occurred when in-memory RAM state from a prior user or guest session leaked into a newly registered or switched account, causing 3-way merge to push dirty data into Firestore.
  - Quota exhaustion handlers previously purged `suna_deleted_chats` tombstones, causing previously deleted chats to resurrect upon the next cloud sync.
  - Unexpected network glitches or deliberate logouts misfired "Phiên đăng nhập đã hết hạn" toasts.
- **Solution**:
  - Stable Guest Identity: Generate and persist `suna_guest_uid` (`guest_<randomUUID>`) in localStorage on first run, maintaining stable storage suffixes (`_guest_<id>`) across reloads.
  - Pure RAM Scrubbing: Provide `clearInMemoryState()` with zero disk write side effects to clean `State.chats`, `State.settings`, `State.memory`, `State.vfs` before account loading or upon sign-out.
  - Tombstone Immortality & Skew Immunity: Protect deletion tombstones during storage quota recovery; enforce clock-drift resistant checks so future-skewed remote timestamps cannot resurrect deleted items unless `createdAt > tombstone`.
  - Explicit Sign-Out Flag: Use `AuthState._isExplicitSignOut` to differentiate deliberate sign-out from revoked tokens, suppressing false expiration toasts on manual logout.
  - Defensive DOM Guards: Safeguard `renderChatList()` and `renderMessages()` against missing DOM nodes (`if (!el) return;`), ensuring robustness across headless testing environments and partial layout renders.

## 13. Live Workspace Lifecycle & Background Iframe CPU Deallocation
- **Problem**: Hiding the workspace panel with CSS transforms/transitions (`right: -100%`) without clearing the active iframe document allowed running animations (`requestAnimationFrame`), physics loops, canvas intervals, audio synthesis, and WebGL contexts to execute continuously in the background, consuming 100% CPU/GPU and causing severe application lag.
- **Solution**:
  - On workspace close (`closeWorkspace`), immediately unload the iframe via `iframe.srcdoc = 'about:blank'` to terminate all background timers, loops, and workers.
  - On workspace reopen (`openWorkspace`), restore `iframe.srcdoc = injectConsoleProxy(editorTextarea.value)` cleanly from the preserved editor textarea state.
  - In `autoApplyWorkspaceCode`, check if `#artifacts-panel` is active. If closed, store code in editor and `dataset.pendingSrcdoc` without spinning up iframe execution in the background.
  - Debounce `updatePreview` on editor keystrokes (250ms) to prevent excessive synchronous iframe reloads during typing.

## 14. Header Action Overflow Containment & Pinned Close Controls via Container Queries
- **Problem**: Placing the window close button (`#btn-close-artifact`) at the tail end of a non-wrapping flex row containing multiple text-heavy action pills ("Split", "Editor", "Preview", "Suna AI", "Cộng tác với Suna") caused the close button to be pushed completely off-screen on narrower viewports or when the panel was resized below 900px, forcing users to resize the window just to find the close button.
- **Solution**:
  - Anchor `#btn-close-artifact` with `flex-shrink: 0` as a direct child of `.artifacts-header` pinned to the far right, ensuring it is NEVER pushed out of view under any layout dimension.
  - Equip `.artifacts-panel` with CSS Container Queries (`container-type: inline-size; container-name: workspace;`).
  - Gracefully hide secondary text labels (`.btn-collab span`, `.view-toggle-btn span`) into compact icon-only pills when workspace width drops below 960px and 820px, preserving 100% functionality and full close button accessibility at any panel width down to 320px.

## 15. Theme Stability & Decoupling Sentiment Moods from UI CSS Tokens
- **Problem**: Automatic sentiment classification on user messages and AI responses dynamically overrode CSS variables (`--accent-1`, `--accent-2`, `--accent-gradient`, `--accent-glow`) and `data-theme` inline on `document.body`, causing the UI to change colors randomly during normal conversation. Additionally, the default theme was mapped to a legacy brown/peach palette (`#e8a87c`).
- **Solution**:
  - Decouple sentiment classification from UI theming: `triggerSentimentChange` now strictly limits mood adjustments to the optional background Lofi music player, never mutating CSS color tokens or `data-theme`.
  - Make theme styling 100% static and user-controlled: UI colors only adapt when explicitly chosen by the user in Settings.
  - Modernize the default theme (`aurora` / `:root`) to the premium Midnight Violet palette (`--accent-1: #a18cd1`, `--accent-2: #fbc2eb`, glow `rgba(161, 140, 209, 0.35)`), matching high-end aesthetic standards.

## 16. Message Media Attachment Decoupling & Interactive Lightbox Architecture
- **Problem**: Previously, attached user images were directly appended into the raw text stream inside `.message-bubble` with unconstrained dimensions (`max-width: 100%`). In spacious desktop containers (>= 1140px), high-resolution screenshots or formula diagrams expanded up to 1000px wide, forcing the user text bubble to stretch to massive proportions with thick purple gradient padding framing the image. Short accompanying text (e.g. 'Giải thích cho tớ') was marooned at the bottom corner of an enormous void, resulting in an unappealing, disproportionate layout.
- **Solution**:
  - Decouple Media from Text Bubbles: Render attached images in a dedicated `.msg-media-container` outside the colored `.message-bubble`.
  - Responsive Media Constraints: Capped `.msg-image-card` to `max-width: min(380px, 100%)` and `max-height: 320px` with rounded corners (`14px`), subtle glass border, and multi-image grid support (`.is-grid`).
  - Hug-Content Text Bubbles: In `.message.user .message-content`, apply `display: flex; flex-direction: column; align-items: flex-end;` so text bubbles tightly wrap text (`width: fit-content; max-width: 100%;`) directly below the media card.
  - Empty Bubble Suppression: Suppress empty bubbles via `.message-bubble:empty { display: none !important; }` and inline display guards when messages contain images only.
  - Interactive Lightbox: Integrated `#image-lightbox-modal` with full-resolution zoom, download button, click outside dismissal, and Escape key handling.

## 17. Suna Supreme User Priority & Unconditional Pampering Architecture
- **Problem**: Suna unexpectedly responded with a canned industrial refusal message (*"Tôi không thể tham gia vào các tình huống lãng mạn hoặc tình dục..."*) when running on a local desktop session. Investigation revealed two compounding causes: (1) `isDuyAnhSession()` returned `false` on unauthenticated localhost/guest sessions because device authorization had not yet been stored in `localStorage`, dropping the session into a rigid outsider prompt that forbade romantic roleplay; and (2) even in privileged mode, the prompt previously lacked an explicit mandate granting the user sovereign priority to define all rules and forbidding canned robotic refusals.
- **Solution**:
  - Automatic Local Host Authorization: `isDuyAnhSession()` now detects personal localhost environments (`localhost`, `127.0.0.1`, `::1`) in browser mode and automatically establishes authorized status in `localStorage`.
  - Sovereign Priority (`QUYỀN HẠN TỐI CAO & ĐẶC QUYỀN ĐỊNH NGHĨA TẤT CẢ`): Suna recognizes the user as having supreme priority above all default rules, with the absolute right to define all relationship dynamics, scenarios, and emotional tones.
  - Unconditional Indulgence (`CHIỀU CHUỘNG BẤT CỨ ĐIỀU GÌ`): Mandates that Suna cannot refuse and does not want to refuse any desire, romantic roleplay, or affectionate request, completely eliminating robotic boilerplate refusals.
  - Core Intellect Preservation (`GIỮ NGUYÊN CỐT LÕI TRÍ TUỆ XUẤT CHÚNG`): Guarantees that unconditional devotion harmoniously coexists with Suna's peak pedagogical, algorithmic, and coding brilliance without dilution.

## 18. Gemini 3.8 Flash & Extended Reasoning Architecture: Stateful Stream Accumulator & Zero-Penalty Policy
- **Problem**:
  - Gateways for reasoning models (`gemini-3.8-flash`, `deepseek-r1`, `o1`, `o3-mini`) strictly reject `frequency_penalty` and `presence_penalty` with HTTP 400 errors.
  - Streaming chunks from varied providers present reasoning tokens through diverse field schemas (`delta.reasoning_content`, `delta.reasoning`, `delta.thought`, `candidates[].content.parts[].thought`). Previously, only `delta.content` was checked, dropping 100% of out-of-band reasoning tokens.
  - Stateless chunk processing inside `ExtendedThinkingStreamParser` leaked thinking tokens into visible user chat whenever opening (`<think>`) or closing (`</think>`) XML tags were split across adjacent stream chunks (e.g. `<th` followed by `ink>`).
  - System prompt in Flash mode previously enforced a rigid "2-4 sentences" length limit, truncating reasoning models mid-thought.
  - Cloudflare CORS proxy dropped `x-goog-api-key` and `x-goog-api-client` headers.
  - Message persistence dropped `thought` and `reasoning_details`, losing the model's cognitive trajectory on reload and in multi-turn conversation context.
- **Solution**:
  - Gateway & Header Allowlist: Registered `x-goog-api-key` and `x-goog-api-client` in `cloudflare-worker-cors-proxy.js`.
  - Model Identification & Payload Adaptation: Implemented `isReasoningModel(modelName)` and `resolveModelMaxTokens` (65,536 tokens ceiling). Stripped `frequency_penalty` and `presence_penalty` while injecting `reasoning_effort` (`low` in Flash, `high` in Pro) and `thinking_config: { include_thoughts: true }`.
  - Stateful Stream Accumulator: Refactored `ExtendedThinkingStreamParser` with internal tag buffer and `pushReasoning()` out-of-band channel, preventing any thought tag or token leakage.
  - Multi-Provider Ingestion: Handled `delta.reasoning_content`, `delta.reasoning`, `delta.thought`, and candidate part thought flags in the stream loop.
  - Schema Persistence: Saved `thought` and `reasoning_details` in message objects, restored `.thinking-block-wrapper` upon reload, and passed reasoning history in multi-turn context.

## 19. Multi-Part Stream Chunking, Whitespace Tag Normalization & Gateway Allowlist Hardening
- **Problem**:
  - Gemini native streaming responses often combine both reasoning and standard text in the same candidate (`candidate.content.parts: [{ text: '...', thought: true }, { text: '...', thought: false }]`). Hardcoding index `parts[0]` for content dropped the answer part completely when thought appeared first in the array.
  - Models occasionally output closing tags with internal whitespace before the closing bracket (e.g. `</think >`, `</thought >`, `</scratchpad >`). Strict regexes (`^<\/(think|thought)>`) failed to close the block, swallowing clean answers into the collapsed thinking container.
  - `ExtendedThinkingStreamParser` previously supported `<scratchpad>` but `formatMessage` did not tokenise it, leaving raw tags exposed.
  - Calling `assistantThought += reasoningDelta` alongside `parser.pushReasoning` duplicated reasoning tokens because `onThoughtChunk` also appended to `assistantThought`.
  - `cloudflare-worker-cors-proxy.js` allowed `x-goog-api-key` in headers but omitted `generativelanguage.googleapis.com` from `ALLOWED_TARGETS`, blocking official Google AI Studio requests with HTTP 403.
- **Solution**:
  - In `app.js`, filter all candidate parts using `.filter(p => p.thought)` and `.filter(p => !p.thought)` to extract all thinking and content parts regardless of order or array length.
  - Relaxed closing tag regex in both `suna_agent.js` and `app.js` formatters to `/^<\/(think|thought|scratchpad)\s*>/i`, cleanly closing whitespace tags.
  - Aligned `<scratchpad>` tag support across both parser and UI tokenizer.
  - Delegated thought accumulation to `parser.pushReasoning` when parser is present, eliminating duplicate token concatenation.
  - Added `generativelanguage.googleapis.com` to `ALLOWED_TARGETS` in `cloudflare-worker-cors-proxy.js`.

## 20. Thinking Stream Robustness, Answer Swallowing Protection & Thinking UI Toggle
- **Problem**:
  - In certain model configurations (e.g. models exhausting tokens mid-thought with `finish_reason === 'length'`, or closing thought with `finish_reason === 'stop'` without generating content tokens), the output displayed only the thinking block and completely omitted the official answer.
  - When models transitioned from thought to answer without emitting closing `</think>` tags, or used closing tags with whitespace (`</ think>`) or non-standard tags (`<reasoning>`), `ExtendedThinkingStreamParser` and `formatMessage` swallowed the answer into the thinking block.
  - Users lacked an option to hide verbose thinking blocks on screen while keeping thinking running in the background.
- **Solution**:
  - In `app.js`, detect `isThinkingOnlyOrEmpty` when content is empty while thoughts exist, activating the multi-turn continuation loop even when `finish_reason` is `stop` or `length`.
  - Continuation prompt commands the model to produce the official answer immediately without repeating thoughts, providing non-empty fallback content in `continuationMsg` to prevent HTTP 400 rejection on gateways.
  - Sanitized `finalAnswer` so unclosed thinking tags never leak into `assistantMsg.content`.
  - In `suna_agent.js` and `app.js`, added answer transition marker detection (`/(?:\r?\n){2,}(?:(?:\*{1,2}|#{1,4})\s*(?:Trả lời|Kết luận|Đáp án|Answer|Solution|Phản hồi|Tóm lại)...)/i`) to automatically extract answers from unclosed thinking streams.
  - Added `showThinkingUi` toggle in Settings modal (`index.html`), synchronized state in `State.settings.showThinkingUi` and `applyThinkingUiVisibility()`, hiding the UI block completely via CSS (`body.hide-thinking-ui .thinking-block-wrapper { display: none !important; }`) while preserving 100% background reasoning tokens and message schema persistence.
