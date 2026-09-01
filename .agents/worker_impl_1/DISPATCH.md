## 2026-08-27T08:35:52Z

You are Implementation Worker 1.
Your working directory is: d:\Suna Chat\.agents\worker_impl_1\
Read the authoritative user request at: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
Read the project plan at: d:\Suna Chat\PROJECT.md
Read the survey reports at:
- `d:\Suna Chat\.agents\explorer_survey_1\handoff.md`
- `d:\Suna Chat\.agents\explorer_survey_2\handoff.md`
- `d:\Suna Chat\.agents\explorer_survey_3\handoff.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your implementation tasks:
1. `app.js`:
   - R1: Update `#chat-area` scroll listener with `{ passive: true }` and `requestAnimationFrame` coordination to prevent scroll lag and layout thrashing.
   - R1: Add 150ms debounce to `#chat-search-input` input listener.
   - R1: Add `document.addEventListener('visibilitychange', ...)` to clear `window._particleInterval` when `document.hidden === true` and restart `initParticles()` when active.
   - R2: Implement `safeSaveLocalStorage(key, val)` and quota resilience in `saveState()` to catch `QuotaExceededError`, evict legacy keys / stale deleted records, and safely recover without crashing.
   - R3: Add global `keydown` listener on `document` for:
     * `Escape`: close open modal dialogs (`.modal-overlay`) via `closeModal(id)` and remove `.active` on dropdowns (`#user-dropdown`, `#mobile-more-menu`).
     * `Ctrl + /` and `Cmd + /`: prevent default and focus `#user-input` / `#message-input`.
     * `Ctrl + Shift + O` and `Cmd + Shift + O`: prevent default and toggle `#artifacts-panel.active`.
   - R3: Add `aria-label` attributes to dynamic button templates in `app.js` (chat item actions, message actions, file remove, etc.).
   - R4: Update `renderMindmapIframe()` to use `sandbox="allow-scripts allow-modals allow-forms"`.
   - R4: Ensure `renderKatex()` error handling safely falls back to `<code>...</code>` block/inline without crashing chat.
2. `styles.css`:
   - R3 & R5: Unify all scrollbars to 4px Slim Glassmorphism with `border-radius: var(--radius-pill);` (`::-webkit-scrollbar { width: 4px; height: 4px; }`). Remove duplicate/overridden scrollbar definitions at lines 541 & 4016. Update Kanban and Mermaid scrollbars to 4px.
3. `index.html`:
   - R3: Add missing `aria-label` and `title` attributes on all icon buttons across sidebar, top bar, chat inputs, modals, and workspace.
   - R4: Update `#artifact-iframe` to `sandbox="allow-scripts allow-modals allow-forms"`.
4. `mindmap.html`:
   - R3: Add 4px slim scrollbar style inside `<style>`.

5. Verification:
   - Run `node -c app.js && node -c redesign.js` to ensure 0 syntax errors.
   - Run `npm test` to ensure all existing tests continue to pass.
6. Write full handoff report to `d:\Suna Chat\.agents\worker_impl_1\handoff.md` and send a message when done.
