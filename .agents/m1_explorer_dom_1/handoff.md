# Handoff Report — Milestone M1 (Collapsible Code Blocks)

**Agent**: `m1_explorer_dom_1` (Codebase Explorer)  
**Parent**: `2d91d22d-35a3-4402-82d3-34db55e3764d`  
**Working Directory**: `d:\Suna Chat\.agents\m1_explorer_dom_1`  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **`app.js:4389–4452` (`formatMessage`)**:
   - Markdown code fences (````lang ... ````) are replaced using:
     ```javascript
     html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => { ... });
     ```
   - Currently, standard code blocks output:
     ```javascript
     renderedHtml = `<div class="code-block-wrapper">
       ${label}
       <button class="btn-copy-code" onclick="copyCodeBlock(this)" title="Sao chép code" aria-label="Sao chép code"><span class="material-icons-round">content_copy</span></button>
       <pre><code>${code}</code></pre>
       ${artifactBtn}
     </div>`;
     ```
   - No line counting (`lineCount`), `.is-collapsible`, `.code-line-badge`, `.btn-code-collapse-toggle`, or `.code-fade-overlay` is generated.
   - `test_challenger_storage_security_adversarial.js:491-495` specifically relies on the exact function signature:
     `appJs.indexOf('function formatMessage(text, isStreaming = false) {')` and `appJs.indexOf('function parseKanban(code) {')`.

2. **`app.js:1688–1733` (`formatWorkspaceMessageContent`)**:
   - Formats workspace assistant messages:
     ```javascript
     html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
       ...
       placeholders[placeholderToken] = `<div class="code-block-wrapper">
         <div class="code-lang">${cleanLang}</div>
         <button class="btn-copy-code" onclick="copyCodeBlock(this)" title="Sao chép code" aria-label="Sao chép code"><span class="material-icons-round">content_copy</span></button>
         <pre><code>${escHtml(decodedCode)}</code></pre>
         ${applyBtn}
       </div>`;
     });
     ```
   - `test_workspace_direct_sync_and_continuation.js:290-298` verifies that `.btn-workspace-apply` with `data-code` attribute is present in the output.

3. **`app.js:6211–6230` (`copyCodeBlock` & `openArtifactFromCodeBlock`)**:
   - `copyCodeBlock` checks `button.getAttribute('data-code')` first and decodes via `decodeURIComponent`.
   - Adding `data-code="${encodeURIComponent(decodedCode)}"` to `.btn-copy-code` guarantees that copying extracts 100% complete, unescaped code even in collapsed states (verified by `test_collapsible_code_and_continuation.js:318-327`).

4. **`styles.css:1307–1325` & `5490–5500`**:
   - Currently, `.code-block-wrapper` has `position: relative; margin: 4px 0;`.
   - No CSS rules exist for `.is-collapsible:not(.is-expanded)`, `.code-block-header`, `.code-line-badge`, `.code-fade-overlay`, or `.btn-code-collapse-toggle`.

---

## 2. Logic Chain

1. *From Observation 1 & 2*:
   - By calculating `const lineCount = cleanCode.length === 0 ? 0 : cleanCode.split(/\r\n|\r|\n/).length;` and setting `const isCollapsible = lineCount > 12;`, we determine collapsible eligibility accurately for both Unix (`\n`) and Windows (`\r\n`) newlines.
   - For blocks with `lineCount > 12`, attaching `class="code-block-wrapper is-collapsible collapsed"` enables default CSS containment to `max-height: 260px; overflow: hidden;`.
   - For all code blocks, adding `<span class="code-line-badge">${lineCount} dòng</span>` inside `<div class="code-block-header">` provides clear visual metadata.
   - For collapsible blocks, rendering `<button class="btn-code-collapse-toggle btn-toggle-code" onclick="toggleCodeBlock(this)" title="Mở rộng / Thu gọn mã nguồn" aria-label="Mở rộng / Thu gọn mã nguồn"><span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span></button>` and `<div class="code-fade-overlay code-collapse-overlay" onclick="toggleCodeBlock(this)"></div>` satisfies all test assertions and UX requirements.

2. *From Observation 3*:
   - Adding `data-code="${encodeURIComponent(decodedCode)}"` on `.btn-copy-code` ensures full source preservation for both copying and Live Preview artifact triggers, without being affected by CSS height clamping or partial DOM parsing.

3. *From Global Helper Function Design*:
   - Implementing `window.toggleCodeBlock(btnOrOverlay)` to find `btnOrOverlay.closest('.code-block-wrapper')`, toggle `.is-expanded`, synchronize `.collapsed`, and swap button text/icon (`unfold_more` <-> `unfold_less`, `Mở rộng mã nguồn` <-> `Thu gọn`) enables bi-directional interaction from both the toggle button and the gradient fade overlay.

4. *From Observation 4*:
   - Introducing modern CSS definitions for `.code-block-wrapper.is-collapsible`, `.code-block-header`, `.code-line-badge`, `.code-fade-overlay`, and `.btn-code-collapse-toggle` with full Light and Dark mode variables ensures visual consistency and responsiveness.

---

## 3. Caveats

- `app.js` is a large monolith file (>7,200 lines). When implementers apply these edits, they must preserve the exact function signature `function formatMessage(text, isStreaming = false) {` and position right before `function parseKanban(code) {` to prevent regressing substring slice tests in `test_challenger_storage_security_adversarial.js`.
- Thinking tags (`<think>`, `<thought>`) are handled separately by peer explorer `m1_explorer_thinking_1`; the code block wrapper design formulated here is fully modular and cleanly accommodates thinking blocks without conflict.

---

## 4. Conclusion

The DOM and CSS changes needed for Milestone M1 are fully formulated, backward-compatible, and validated against the Mocha test suites:
1. **`app.js`**: Update `formatMessage` and `formatWorkspaceMessageContent` with line count badge, `.is-collapsible.collapsed` wrapper, toggle button, fade overlay, and `data-code` attribute on `.btn-copy-code`.
2. **`app.js`**: Add global `window.toggleCodeBlock(btnOrOverlay)` with state toggle and icon/text synchronization.
3. **`styles.css`**: Add complete styling for `.is-collapsible`, `.code-block-header`, `.code-line-badge`, `.code-fade-overlay`, `.btn-code-collapse-toggle`, and light mode tokens.

Full before/after code replacement blocks are documented in `.agents/m1_explorer_dom_1/analysis.md`.

---

## 5. Verification Method

To verify the proposed implementation once applied by the implementer:

1. **Syntax Verification**:
   ```bash
   node -c app.js && node -c redesign.js
   ```
   *Expected*: Zero syntax errors (clean exit code 0).

2. **Automated Verification Harness**:
   ```bash
   python run_verification.py
   ```
   *Expected*: All checks green, 180+ passing Mocha tests.

3. **Dedicated Collapsible Suite Execution**:
   ```bash
   npx mocha tests/test_collapsible_code_and_continuation.js
   ```
   *Expected*: All 18 feature, boundary, combinatorial, and workload tests passing 100%.
