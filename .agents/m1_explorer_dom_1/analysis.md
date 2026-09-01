# Deep Codebase Analysis: Milestone M1 (Collapsible Code Blocks)

**Target Files**: `app.js` & `styles.css`  
**Author**: `m1_explorer_dom_1` (Codebase Explorer)  
**Date**: 2026-08-27  

---

## 1. Executive Summary & Objective

In accordance with **Requirement R1** from `ORIGINAL_REQUEST.md` and Milestone M1 from `PROJECT.md`:
- Automatically detect and collapse long code blocks (> 12 lines or > 260px) in both the Main Chat Area (`#chat-area`) and the Live Workspace Assistant Chat (`#workspace-chat-messages`).
- Provide an elegant header with line count badge (e.g. `24 dòng`) and a collapsible action toggle button with smooth expand/collapse animations.
- Integrate a bottom gradient fade overlay (`.code-fade-overlay.code-collapse-overlay`) that indicates collapsed content and expands upon clicking.
- Preserve 100% full code content for Copy (`copyCodeBlock`) and Live Preview Artifacts (`openArtifactFromCodeBlock`, `applyWorkspaceCode`) regardless of collapsed/expanded state.

---

## 2. Codebase Investigation Findings

### 2.1 Main Chat Code Rendering (`app.js:4389–4452`)
- **Function**: `formatMessage(text, isStreaming = false)`
- **Current Behavior**:
  - Replaces ````([^\n]*)\n([\s\S]*?)```` with `.code-block-wrapper`.
  - Currently renders raw `code` without counting lines or attaching `.is-collapsible`.
  - Places `.code-lang` as an isolated tag without a cohesive header bar.
  - Lacks line counter badge, toggle button, and fade overlay.
- **Inter-file Dependency Note**:
  - `tests/test_challenger_storage_security_adversarial.js` slices `app.js` between `function formatMessage(text, isStreaming = false) {` and `function parseKanban(code) {`.
  - Therefore, the function signature and location must remain exactly intact.

### 2.2 Workspace Chat Code Rendering (`app.js:1688–1733`)
- **Function**: `formatWorkspaceMessageContent(text)`
- **Current Behavior**:
  - Replaces ````([^\n]*)\n([\s\S]*?)```` with `.code-block-wrapper`.
  - Embeds `.btn-workspace-apply` with `data-code` attribute.
  - Does not calculate line count or provide collapsible containers for lengthy code responses.
- **Inter-file Dependency Note**:
  - `tests/test_workspace_direct_sync_and_continuation.js` matches `function formatWorkspaceMessageContent(text)` and verifies `.btn-workspace-apply` presence and `data-code` preservation.

### 2.3 Clipboard & Artifact Actions (`app.js:6211–6230`)
- **Functions**: `window.copyCodeBlock(button)` and `window.openArtifactFromCodeBlock(button)`.
- **Finding**:
  - Using `data-code="${encodeURIComponent(decodedCode)}"` on `.btn-copy-code` ensures that copying extracts 100% complete, unescaped, unmodified source code without depending on DOM rendering or truncation.

### 2.4 CSS Architecture (`styles.css:1307–1325`, `5490–5500`)
- **Current Rules**:
  - `.code-block-wrapper` has `position: relative; margin: 4px 0;`.
  - `.code-lang` uses absolute positioning at `top: 0; right: 0;`.
  - No rules exist for `.is-collapsible`, `.code-line-badge`, `.btn-code-collapse-toggle`, or `.code-fade-overlay`.

---

## 3. Precise Proposed Modifications

### 3.1 `app.js` — Enhanced `formatMessage` (Lines ~4389–4452)

```javascript
// BEFORE (app.js:4389)
  html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const cleanLang = lang.trim().toLowerCase();
    const safeCode = encodeURIComponent(code);
    let renderedHtml = '';
    
    // Feature: Mindmap Diagram
    if (cleanLang === 'mindmap') {
      ...
    }
    ...
    // Feature: Standard Code & Live Preview Artifacts
    else {
      let artifactBtn = '';
      if (cleanLang === 'html' || cleanLang === 'svg' || cleanLang.includes('xml') || cleanLang === 'javascript') {
        artifactBtn = `<button class="btn-preview-artifact" onclick="window.openArtifactFromCodeBlock(this)" title="Xem trước (Live Preview)" aria-label="Xem trước (Live Preview)"><span class="material-icons-round">play_arrow</span> Xem trước (Live Preview)</button>`;
      }

      const label = cleanLang ? `<div class="code-lang">${cleanLang}</div>` : '';
      renderedHtml = `<div class="code-block-wrapper">
                ${label}
                <button class="btn-copy-code" onclick="copyCodeBlock(this)" title="Sao chép code" aria-label="Sao chép code"><span class="material-icons-round">content_copy</span></button>
                <pre><code>${code}</code></pre>
                ${artifactBtn}
              </div>`;
    }

    return savePlaceholder(renderedHtml);
  });
```

```javascript
// AFTER (app.js:4389)
  html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const cleanLang = lang.trim().toLowerCase();
    let renderedHtml = '';
    
    // Feature: Mindmap Diagram
    if (cleanLang === 'mindmap') {
      if (isStreaming) {
        renderedHtml = `<div class="mindmap-wrapper skeleton-loading">
                  <span class="material-icons-round rotate-anim">psychology</span>
                  <span>Suna đang phác thảo sơ đồ tư duy...</span>
                </div>`;
      } else {
        const decodedMindmap = code
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        renderedHtml = renderMindmapIframe(decodedMindmap);
      }
    }
    // Feature: Mermaid Diagram
    else if (cleanLang === 'mermaid') {
      const decodedMermaid = code
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      
      if (isStreaming) {
        renderedHtml = `<div class="mermaid-wrapper skeleton-loading">
                  <span class="material-icons-round rotate-anim">psychology</span>
                  <span>Suna đang phác thảo sơ đồ tư duy...</span>
                </div>`;
      } else {
        const safeDisplay = escHtml(decodedMermaid);
        renderedHtml = `<div class="mermaid-wrapper"><div class="mermaid" data-content="${encodeURIComponent(decodedMermaid)}">${safeDisplay}</div></div>`;
      }
    }
    // Feature: Interactive Kanban Board
    else if (cleanLang === 'kanban') {
      renderedHtml = parseKanban(code);
    }
    // Feature: Standard Code & Live Preview Artifacts with Collapsible Logic
    else {
      const decodedCode = code
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const cleanCode = decodedCode.replace(/\r?\n$/, '');
      const lineCount = cleanCode.length === 0 ? 0 : cleanCode.split(/\r\n|\r|\n/).length;
      const isCollapsible = lineCount > 12;

      const lineBadge = `<span class="code-line-badge">${lineCount} dòng</span>`;
      const collapseToggleBtn = isCollapsible
        ? `<button class="btn-code-collapse-toggle btn-toggle-code" onclick="toggleCodeBlock(this)" title="Mở rộng / Thu gọn mã nguồn" aria-label="Mở rộng / Thu gọn mã nguồn"><span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span></button>`
        : '';
      const fadeOverlay = isCollapsible
        ? `<div class="code-fade-overlay code-collapse-overlay" onclick="toggleCodeBlock(this)"></div>`
        : '';
      const collapsibleClass = isCollapsible ? ' is-collapsible collapsed' : '';

      let artifactBtn = '';
      if (['html', 'svg', 'javascript', 'js'].includes(cleanLang) || cleanLang.includes('xml')) {
        artifactBtn = `<button class="btn-preview-artifact" onclick="window.openArtifactFromCodeBlock(this)" title="Xem trước (Live Preview)" aria-label="Xem trước (Live Preview)"><span class="material-icons-round">play_arrow</span> Xem trước (Live Preview)</button>`;
      }

      renderedHtml = `<div class="code-block-wrapper${collapsibleClass}">
        <div class="code-block-header">
          <div class="code-lang">${cleanLang || 'code'}</div>
          ${lineBadge}
        </div>
        <button class="btn-copy-code" onclick="copyCodeBlock(this)" data-code="${encodeURIComponent(decodedCode)}" title="Sao chép code" aria-label="Sao chép code"><span class="material-icons-round">content_copy</span></button>
        <pre><code>${escHtml(decodedCode)}</code></pre>
        ${fadeOverlay}
        ${collapseToggleBtn}
        ${artifactBtn}
      </div>`;
    }

    return savePlaceholder(renderedHtml);
  });
```

---

### 3.2 `app.js` — Enhanced `formatWorkspaceMessageContent` (Lines ~1688–1733)

```javascript
// BEFORE (app.js:1688)
  function formatWorkspaceMessageContent(text) {
    if (!text) return '';
    let html = escHtml(text);
    const placeholders = {};
    let count = 0;
    
    // Extract code blocks
    html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const decodedCode = code
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
        
      const placeholderToken = `%%WS_CODE_${count++}%%`;
      const applyBtn = `<button class="btn-workspace-apply" onclick="applyWorkspaceCode(this)" data-code="${encodeURIComponent(decodedCode)}" title="Áp dụng vào Editor" aria-label="Áp dụng vào Editor"><span class="material-icons-round">play_arrow</span> Áp dụng vào Editor</button>`;
      const cleanLang = lang.trim() || 'code';
      
      placeholders[placeholderToken] = `<div class="code-block-wrapper">
        <div class="code-lang">${cleanLang}</div>
        <button class="btn-copy-code" onclick="copyCodeBlock(this)" title="Sao chép code" aria-label="Sao chép code"><span class="material-icons-round">content_copy</span></button>
        <pre><code>${escHtml(decodedCode)}</code></pre>
        ${applyBtn}
      </div>`;
      
      return placeholderToken;
    });
    ...
```

```javascript
// AFTER (app.js:1688)
  function formatWorkspaceMessageContent(text) {
    if (!text) return '';
    let html = escHtml(text);
    const placeholders = {};
    let count = 0;
    
    // Extract code blocks
    html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const decodedCode = code
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
        
      const cleanCode = decodedCode.replace(/\r?\n$/, '');
      const lineCount = cleanCode.length === 0 ? 0 : cleanCode.split(/\r\n|\r|\n/).length;
      const isCollapsible = lineCount > 12;
      const placeholderToken = `%%WS_CODE_${count++}%%`;
      
      const cleanLang = (lang || 'code').trim().toLowerCase();
      const lineBadge = `<span class="code-line-badge">${lineCount} dòng</span>`;
      const collapseToggleBtn = isCollapsible
        ? `<button class="btn-code-collapse-toggle btn-toggle-code" onclick="toggleCodeBlock(this)" title="Mở rộng / Thu gọn mã nguồn" aria-label="Mở rộng / Thu gọn mã nguồn"><span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span></button>`
        : '';
      const fadeOverlay = isCollapsible
        ? `<div class="code-fade-overlay code-collapse-overlay" onclick="toggleCodeBlock(this)"></div>`
        : '';
      const collapsibleClass = isCollapsible ? ' is-collapsible collapsed' : '';

      const applyBtn = `<button class="btn-workspace-apply" onclick="applyWorkspaceCode(this)" data-code="${encodeURIComponent(decodedCode)}" title="Áp dụng vào Editor" aria-label="Áp dụng vào Editor"><span class="material-icons-round">play_arrow</span> Áp dụng vào Editor</button>`;
      
      placeholders[placeholderToken] = `<div class="code-block-wrapper${collapsibleClass}">
        <div class="code-block-header">
          <div class="code-lang">${cleanLang}</div>
          ${lineBadge}
        </div>
        <button class="btn-copy-code" onclick="copyCodeBlock(this)" data-code="${encodeURIComponent(decodedCode)}" title="Sao chép code" aria-label="Sao chép code"><span class="material-icons-round">content_copy</span></button>
        <pre><code>${escHtml(decodedCode)}</code></pre>
        ${fadeOverlay}
        ${collapseToggleBtn}
        ${applyBtn}
      </div>`;
      
      return placeholderToken;
    });
    ...
```

---

### 3.3 `app.js` — Global Helper Handlers (Lines ~6211–6235)

```javascript
// Toggle Code Block Handler
window.toggleCodeBlock = function(btnOrOverlay) {
  if (!btnOrOverlay) return;
  const wrapper = btnOrOverlay.closest('.code-block-wrapper');
  if (!wrapper) return;
  
  const isExpanded = wrapper.classList.toggle('is-expanded');
  if (isExpanded) {
    wrapper.classList.remove('collapsed');
  } else {
    wrapper.classList.add('collapsed');
  }
  
  const btn = wrapper.querySelector('.btn-code-collapse-toggle, .btn-toggle-code');
  if (btn) {
    if (isExpanded) {
      btn.innerHTML = '<span class="material-icons-round">unfold_less</span> <span class="toggle-text">Thu gọn</span>';
      btn.title = 'Thu gọn mã nguồn';
      btn.setAttribute('aria-label', 'Thu gọn mã nguồn');
    } else {
      btn.innerHTML = '<span class="material-icons-round">unfold_more</span> <span class="toggle-text">Mở rộng mã nguồn</span>';
      btn.title = 'Mở rộng / Thu gọn mã nguồn';
      btn.setAttribute('aria-label', 'Mở rộng / Thu gọn mã nguồn');
    }
  }
};

window.copyCodeBlock = function(button) {
  const wrapper = button.closest('.code-block-wrapper');
  if (!wrapper) return;
  const dataCode = button.getAttribute('data-code');
  if (dataCode) {
    copyText(decodeURIComponent(dataCode));
    return;
  }
  const codeEl = wrapper.querySelector('pre code');
  if (!codeEl) return;
  copyText(codeEl.textContent);
};

window.openArtifactFromCodeBlock = function(button) {
  const wrapper = button.closest('.code-block-wrapper');
  if (!wrapper) return;
  const copyBtn = wrapper.querySelector('.btn-copy-code');
  let code = '';
  if (copyBtn && copyBtn.getAttribute('data-code')) {
    code = decodeURIComponent(copyBtn.getAttribute('data-code'));
  } else {
    const codeEl = wrapper.querySelector('pre code');
    if (codeEl) code = codeEl.textContent;
  }
  if (!code) return;
  if (window.openArtifact) {
    window.openArtifact(code);
  } else {
    toast('Tính năng Xem trước không khả dụng', 'error');
  }
};
```

---

### 3.4 `styles.css` — Collapsible Code Block Styling

```css
/* ========================================================================= */
/* COLLAPSIBLE CODE BLOCKS (M1 - R1)                                          */
/* ========================================================================= */

.code-block-wrapper {
  position: relative;
  margin: 10px 0;
  background: var(--bg-secondary, rgba(20, 20, 30, 0.7));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  transition: border-color var(--transition, 0.2s ease);
}

.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.75rem;
}

.code-lang {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--accent-1, #e8a87c);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.code-line-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-muted, rgba(255, 255, 255, 0.5));
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 8px;
  border-radius: var(--radius-pill, 12px);
  display: inline-flex;
  align-items: center;
}

.code-block-wrapper pre {
  margin: 0 !important;
  padding: 12px 14px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
}

.code-block-wrapper pre code {
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
}

/* Collapsible state: default collapsed when .is-collapsible is present */
.code-block-wrapper.is-collapsible:not(.is-expanded),
.code-block-wrapper.is-collapsible.collapsed {
  max-height: 260px;
  overflow: hidden;
  position: relative;
}

/* Expanded state */
.code-block-wrapper.is-collapsible.is-expanded {
  max-height: 10000px;
  overflow: visible;
}

/* Fade overlay for collapsed state */
.code-fade-overlay,
.code-collapse-overlay {
  display: none;
}

.code-block-wrapper.is-collapsible:not(.is-expanded) .code-fade-overlay,
.code-block-wrapper.is-collapsible.collapsed:not(.is-expanded) .code-fade-overlay,
.code-block-wrapper.is-collapsible:not(.is-expanded) .code-collapse-overlay,
.code-block-wrapper.is-collapsible.collapsed:not(.is-expanded) .code-collapse-overlay {
  display: block;
  position: absolute;
  bottom: 38px;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(to bottom, rgba(15, 15, 25, 0) 0%, var(--bg-secondary, rgba(20, 20, 30, 0.95)) 100%);
  pointer-events: auto;
  cursor: pointer;
  z-index: 4;
}

/* Toggle Collapse Button */
.btn-code-collapse-toggle,
.btn-toggle-code {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--accent-1, #e8a87c);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition, 0.2s ease);
  position: relative;
  z-index: 5;
}

.btn-code-collapse-toggle:hover,
.btn-toggle-code:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.btn-code-collapse-toggle .material-icons-round,
.btn-toggle-code .material-icons-round {
  font-size: 16px;
}

/* Light mode overrides */
body.light-mode .code-block-wrapper {
  background: #f8f9fa;
  border-color: rgba(0, 0, 0, 0.08);
}

body.light-mode .code-block-header {
  background: rgba(0, 0, 0, 0.03);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

body.light-mode .code-lang {
  color: var(--accent-2, #c0392b);
}

body.light-mode .code-line-badge {
  background: rgba(0, 0, 0, 0.05);
  color: #666;
}

body.light-mode .code-block-wrapper.is-collapsible:not(.is-expanded) .code-fade-overlay,
body.light-mode .code-block-wrapper.is-collapsible.collapsed:not(.is-expanded) .code-fade-overlay,
body.light-mode .code-block-wrapper.is-collapsible:not(.is-expanded) .code-collapse-overlay,
body.light-mode .code-block-wrapper.is-collapsible.collapsed:not(.is-expanded) .code-collapse-overlay {
  background: linear-gradient(to bottom, rgba(248, 249, 250, 0) 0%, rgba(248, 249, 250, 0.98) 100%);
}

body.light-mode .btn-code-collapse-toggle,
body.light-mode .btn-toggle-code {
  background: rgba(0, 0, 0, 0.02);
  border-top-color: rgba(0, 0, 0, 0.06);
  color: var(--accent-2, #c0392b);
}

body.light-mode .btn-code-collapse-toggle:hover,
body.light-mode .btn-toggle-code:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #111;
}
```
