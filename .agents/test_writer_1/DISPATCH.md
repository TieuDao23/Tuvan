## 2026-08-27T08:51:33Z
You are the E2E Test Writer.
Your working directory is: d:\Suna Chat\.agents\test_writer_1\
Read the authoritative user request at: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md
Read the project plan at: d:\Suna Chat\PROJECT.md
Read the test infrastructure specification at: d:\Suna Chat\TEST_INFRA.md
Read the survey handoff reports at:
- `d:\Suna Chat\.agents\explorer_survey_1\handoff.md`
- `d:\Suna Chat\.agents\explorer_survey_2\handoff.md`
- `d:\Suna Chat\.agents\explorer_survey_3\handoff.md`
Read the worker handoff report at:
- `d:\Suna Chat\.agents\worker_impl_1\handoff.md`

Your mission:
1. Implement a comprehensive, robust automated test suite in `tests/test_performance_shortcuts_storage_security.js` (using standard Node.js `assert`, `fs`, `vm` modules without adding new external npm packages).
2. The test suite must cover all 4 tiers for features F1–F10:
   - **Tier 1 (Feature Coverage)**:
     * Passive scroll `{ passive: true }` and `requestAnimationFrame` on `#chat-area`.
     * 150ms debounce on `#chat-search-input`.
     * `visibilitychange` pausing `_particleInterval` when `document.hidden === true` and resuming `initParticles()` when false.
     * Hybrid storage: `localStorage` for settings, `IndexedDB` for chat history / Base64 images.
     * Global keyboard shortcuts: `Escape` closes open `.modal-overlay` and dropdowns; `Ctrl+/` & `Cmd+/` focuses `#message-input` / `#user-input`; `Ctrl+Shift+O` & `Cmd+Shift+O` toggles `#artifacts-panel`.
     * 4px Slim Glassmorphic Scrollbars with `border-radius: var(--radius-pill)` in `styles.css` and `mindmap.html`.
     * Accessibility: `aria-label` and `title` on all icon buttons in `index.html`.
     * Sandbox: `sandbox="allow-scripts allow-modals allow-forms"` on `#artifact-iframe` and `renderMindmapIframe()`.
     * KaTeX: safe fallback returning `<code>...</code>` on malformed LaTeX strings without throwing or crashing.
   - **Tier 2 (Boundary & Corner Cases)**:
     * Simulated `QuotaExceededError` (code 22 / 1014) triggers `safeSaveLocalStorage` cleanup and successful retry.
     * Rapid keystroke debounce cancellation in search.
     * Multiple modifier keys (`e.metaKey` for macOS, `e.ctrlKey` for Windows, Shift combos).
     * Malformed / broken LaTeX tokens (e.g. `\frac{`, `\sqrt{`, `$$unclosed`).
   - **Tier 3 (Cross-Feature Combinations)**:
     * Shortcuts when modals are open vs closed.
     * Tab visibility toggling during active particle generation.
   - **Tier 4 (Real-World & Integrity)**:
     * Static syntax check assertion running `node -c app.js` and `node -c redesign.js`.
3. Run `npm test` and `npm run check` to verify that ALL test suites pass with 100% success rate (0 failures).
4. Create `d:\Suna Chat\TEST_READY.md` summarizing the test suites, tiers, and verification command.
5. Write your handoff report to `d:\Suna Chat\.agents\test_writer_1\handoff.md` and send a message when done.
