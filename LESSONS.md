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


