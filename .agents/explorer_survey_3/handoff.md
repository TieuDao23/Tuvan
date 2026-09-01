# Handoff Report: Survey Explorer 3 (Test Parity & Ponytail)

## 1. Observation

### 1.1 Test Runner & Execution Status
- **Test Framework**: Mocha runner configured in `package.json` (`"test": "npx mocha \"tests/**/*.js\""`).
- **Execution Command & Result**: Running `npm test` executed `npx mocha "tests/**/*.js"`.
  - Result: **49 passing (411ms)**, 0 failing, 0 pending.
- **Syntax Validation Command & Result**: Running `npm run check` executed `node -c app.js && node -c redesign.js`.
  - Result: Exit code 0 (clean execution, 0 syntax errors).

### 1.2 Existing Test Files Inventory
Directory structure under `tests/`:
1. `tests/test_challenger_adversarial_suite.js` (162 lines, 18 tests):
   - Section 1: Dual Resizers and Left Handle Clamping Bounds (lines 13-35, 4 tests).
   - Section 2: Suna AI Workspace Assistant UI Responsiveness & Edge Cases (lines 37-101, 4 tests).
   - Section 3: Responsive Breakpoints & CSS Layout Stability (lines 103-140, 7 tests).
   - Section 4: Anti-Tautology & Genuine Test Split Verification (lines 142-160, 3 tests). Asserts that `visible_tests` and `hidden_tests` each have >= 4 files and adhere to 50% <= visible ratio <= 60%.
2. `tests/ui_redesign/adversarial_tests/test_adversarial_state_and_resilience.js` (540 lines, 14 tests):
   - Section 1: Storage Resilience & Quota Handling (lines 12-173, 4 tests).
   - Section 2: Resizers, Boundary Clamping & Pointer Lock (lines 175-297, 4 tests).
   - Section 3: Unicode, Malformed Content & Artifact Decoding (lines 299-448, 4 tests).
   - Section 4: Auth Network Listener & Flapping State Resilience (lines 450-476, 1 test).
   - Section 5: Account Switching State Isolation (lines 478-538, 1 test).
3. `tests/ui_redesign/visible_tests/test_color_palette.js` (16 lines, 3 tests).
4. `tests/ui_redesign/visible_tests/test_layout_elements.js` (8 lines, 1 test).
5. `tests/ui_redesign/visible_tests/test_typography.js` (13 lines, 2 tests).
6. `tests/ui_redesign/visible_tests/test_workspace_layout.js` (26 lines, 2 tests).
7. `tests/ui_redesign/hidden_tests/test_contrast_ratio.js` (43 lines, 1 test).
8. `tests/ui_redesign/hidden_tests/test_css_fallbacks.js` (8 lines, 1 test).
9. `tests/ui_redesign/hidden_tests/test_transition_perf.js` (8 lines, 1 test).
10. `tests/ui_redesign/hidden_tests/test_workspace_resizers_and_storage.js` (43 lines, 6 tests).

### 1.3 Codebase State vs Requirements R1–R4

#### R1: Performance, Throttling & Visibility
- `app.js` line 6516:
  ```javascript
  chatArea.addEventListener('scroll', () => {
    if (chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 300) {
      btnScroll.classList.add('show');
    } else {
      btnScroll.classList.remove('show');
    }
  });
  ```
  *Observed:* No `{ passive: true }` option; no `requestAnimationFrame` coordination.
- `app.js` line 6507:
  ```javascript
  searchInput.addEventListener('input', () => {
    renderChatList();
  });
  ```
  *Observed:* No 150ms debounce wrapper around `renderChatList()`.
- `app.js` line 6398:
  ```javascript
  window._particleInterval = setInterval(() => {
    if (document.hidden) return;
    ...
  ```
  *Observed:* Uses `if (document.hidden) return;` inside interval tick, but does NOT attach a `document.addEventListener('visibilitychange', ...)` to suspend/clear and restart the interval when switching tabs.

#### R2: Hybrid Storage & Quota Resilience
- `app.js` line 2859–2950:
  - `initDB()`, `idbSet()`, `idbGet()` implement IndexedDB for `suna_chats` + suffix.
  - `localStorage` is used for `suna_settings`, `suna_mode`, and `suna_deleted_chats`.
  - `saveState()` has basic try-catch for `QuotaExceededError`.
  *Observed:* Current tests check basic `suna_settings` and `suna_chats` fallback, but do not assert that heavy Base64 image payloads are excluded from localStorage.

#### R3: Shortcuts, Slim Scrollbar & Accessibility
- Global keyboard shortcuts:
  *Observed:* `app.js` currently only binds `keydown` to `#message-input` (line 6632), `#rename-input` (line 6971), and login/register forms (line 927). No global `document.addEventListener('keydown', ...)` exists for `Escape` (dismiss modals), `Ctrl+/` (focus `#message-input`), or `Ctrl+Shift+O` (toggle `#artifacts-panel`).
- Scrollbars:
  *Observed:* `styles.css` has duplicate scrollbar definitions:
  - Line 541: `::-webkit-scrollbar { width: 6px; }`
  - Line 4016: `::-webkit-scrollbar { width: 6px; height: 6px; }` with `border-radius: var(--radius-sm);`
  - Requirement requires 4px slim scrollbars with `border-radius: var(--radius-pill);`.
- Accessibility:
  *Observed:* Several modal buttons (e.g. `index.html` line 450, 503, 555 `<button class="btn-close-modal" data-close="...">`) lack explicit `aria-label="Đóng"` and `title="Đóng"`.

#### R4: Security Hardening (Iframe Sandbox & KaTeX Fallback)
- Iframe Sandbox:
  - `index.html` line 820: `<iframe id="artifact-iframe" sandbox="allow-scripts" ...>`
  - `app.js` line 3473: `sandbox="allow-scripts"` in `renderMindmapIframe()`
  *Observed:* Both use only `sandbox="allow-scripts"`, missing `allow-modals allow-forms`.
- KaTeX Fallback:
  - `app.js` line 3437: `renderKatex(math, displayMode)` wraps `katex.renderToString` in `try-catch` and returns `null` on error; `formatMessageContent` falls back to `<code>...</code>`.
  *Observed:* Present in code, but lacks dedicated automated tests validating malformed math edge cases.

### 1.4 Ponytail Analysis & Redundant Code
- **Temporary / Orphaned Files**: No `.tmp`, `.bak`, or orphan files exist in the repository root.
- **CSS Bloat**: Duplicate `::-webkit-scrollbar` rules at lines 541 and 4016 in `styles.css`.
- **Vanilla JS Alignment**: Native browser APIs (`addEventListener`, `requestAnimationFrame`, `clearTimeout`, `document.hidden`, `postMessage`, `indexedDB`) are used directly without unnecessary heavy libraries.

---

## 2. Logic Chain

1. **Test Runner Parity**:
   - *Observation 1.1*: `package.json` executes `npx mocha "tests/**/*.js"`, which traverses all subdirectories of `tests/`.
   - *Inference*: Any new test file added under `tests/` or subdirectories will be automatically discovered and executed during `npm test`.
2. **Visible/Hidden Test Split Constraint**:
   - *Observation 1.2*: `test_challenger_adversarial_suite.js` (lines 142-160) validates that `tests/ui_redesign/visible_tests` and `tests/ui_redesign/hidden_tests` each have >= 4 test files and maintain a 50% <= visible ratio <= 60% ratio.
   - *Inference*: New test suites for R1-R4 can either be added as top-level files in `tests/` (e.g., `tests/test_performance_shortcuts_storage_security.js`), or balanced equally across `visible_tests/` and `hidden_tests/` to preserve this invariant.
3. **Syntax Integrity**:
   - *Observation 1.1*: `node -c app.js && node -c redesign.js` is part of `"check"` and `ORIGINAL_REQUEST.md` acceptance criteria.
   - *Inference*: All modifications to `app.js` and `redesign.js` must be strictly valid ECMAScript without syntax errors.
4. **Coverage Gaps Identification**:
   - *Observation 1.3*: Gaps were pinpointed across all 4 functional areas (R1: missing passive/rAF scroll, missing search debounce, missing visibilitychange listener; R2: missing large Base64 IDB separation test; R3: missing global shortcut keydown listeners, 6px vs 4px scrollbar mismatch, missing a11y aria-labels; R4: `allow-scripts` missing `allow-modals allow-forms`, untested KaTeX raw fallback).
   - *Inference*: A comprehensive test suite specifically testing these 10 distinct behaviors must be implemented to ensure 100% test pass rate upon implementation.

---

## 3. Caveats

1. **Browser Headless DOM Environment**: Tests running in Node.js via Mocha do not possess a native browser layout engine (Blink/WebKit). Therefore, DOM interactions, scroll events, `requestAnimationFrame`, and `document.hidden` are tested via regex AST analysis and sandboxed VM contexts (`vm.createContext` with mocked DOM/event objects).
2. **IndexedDB in Node VM**: Native Node.js does not include `indexedDB`. Behavioral tests for `idbSet`/`idbGet` mock the transaction lifecycle to verify resolution/rejection and payload routing.
3. **External Dependencies**: No new `npm` dependencies should be introduced; standard Node.js `fs`, `assert`, and `vm` are sufficient for all test suites.

---

## 4. Conclusion & Test Suite Design Blueprint

To achieve 100% test pass rate and full requirement parity, the test architecture should be expanded with the following structured test cases:

### Blueprint of Automated Test Cases to Implement

| Test ID | Suite / Group | Test Description | Assertion Method |
|---|---|---|---|
| **T-R1.1** | Performance & Throttling | `#chat-area` scroll listener uses `{ passive: true }` | Regex match on `app.js`: `chatArea\.addEventListener\(\s*['"]scroll['"]\s*,\s*[^,]+,\s*\{\s*passive:\s*true\s*\}\s*\)` |
| **T-R1.2** | Performance & Throttling | `#chat-area` scroll listener coordinates via `requestAnimationFrame` | AST / VM test ensuring rAF callback is scheduled and deduplicated |
| **T-R1.3** | Performance & Throttling | `#chat-search-input` implements 150ms debounce | AST / VM test verifying `renderChatList()` is debounced with ~150ms timeout |
| **T-R1.4** | Performance & Throttling | Tab visibility (`visibilitychange`) pauses `initParticles()` | VM simulation testing that `document.hidden === true` suspends particle loop and `document.hidden === false` resumes |
| **T-R2.1** | Hybrid Storage | Isolated storage separates light config and heavy IndexedDB payloads | VM test confirming `localStorage` keys only store config and heavy chat/base64 is sent to `idbSet` |
| **T-R2.2** | Hybrid Storage | `QuotaExceededError` triggers safe auto-pruning without crash | VM test throwing simulated `QuotaExceededError` and verifying recovery |
| **T-R3.1** | UX & Shortcuts | `Escape` key closes active modals | VM `keydown` event simulation with `key: 'Escape'` verifying `closeModal()` invocation |
| **T-R3.2** | UX & Shortcuts | `Ctrl + /` (and `Cmd + /`) focuses `#message-input` | VM `keydown` event simulation with `ctrlKey/metaKey: true, key: '/'` verifying `preventDefault()` and `input.focus()` |
| **T-R3.3** | UX & Shortcuts | `Ctrl + Shift + O` (and `Cmd + Shift + O`) toggles Live Workspace | VM `keydown` event simulation verifying `artifactsPanel.classList.toggle('active')` |
| **T-R3.4** | UX & Scrollbar | Universal 4px Slim Glassmorphism Scrollbar | Regex match on `styles.css`: `::-webkit-scrollbar\s*\{[^}]*width:\s*4px` and `border-radius:\s*var\(--radius-pill\)` |
| **T-R3.5** | Accessibility (A11y) | All icon buttons have `aria-label` and `title` | DOM scanner on `index.html` ensuring all `<button>` with icons contain `aria-label` and `title` |
| **T-R4.1** | Security Hardening | `#artifact-iframe` sandbox contains `allow-scripts allow-modals allow-forms` | Regex match on `index.html`: `sandbox="allow-scripts allow-modals allow-forms"` |
| **T-R4.2** | Security Hardening | `renderMindmapIframe` dynamically produces hardened sandbox | Regex match on `app.js`: `sandbox="allow-scripts allow-modals allow-forms"` |
| **T-R4.3** | Security Hardening | KaTeX rendering gracefully falls back to raw formula on parse errors | VM test passing malformed LaTeX strings to `renderKatex()` and asserting safe fallback return |
| **T-R5.1** | Code Integrity | Syntax validation check | Running `node -c app.js` and `node -c redesign.js` with exit code 0 |

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Result:* All tests pass (0 failures, 0 timeouts).
2. **Run Static Syntax Validation**:
   ```powershell
   npm run check
   ```
   *Expected Result:* `node -c app.js && node -c redesign.js` exits with code 0.

### 5.2 Files to Inspect
- `tests/test_challenger_adversarial_suite.js`
- `tests/ui_redesign/adversarial_tests/test_adversarial_state_and_resilience.js`
- `app.js` (lines 2850–2970, 3435–3475, 6320–6430, 6505–6530, 6630–6650)
- `styles.css` (lines 540–555, 4015–4025)
- `index.html` (lines 450, 503, 555, 820)

### 5.3 Invalidation Conditions
- Any test in `tests/**/*.js` failing or throwing uncaught exceptions.
- `node -c app.js` or `node -c redesign.js` returning syntax errors.
- The visible/hidden test ratio in `tests/ui_redesign/` falling outside [50%, 60%].
