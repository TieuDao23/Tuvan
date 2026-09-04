# SunaChat DeepSeek Harness (dsh) Subsystem & UI Integration Analysis Report

**Author**: Explorer UI & Subsystem Integration (`explorer_codebase_o3`)  
**Date**: 2026-09-04  
**Project**: Suna Chat (`d:\Suna Chat`)  
**Status**: Completed  
**Baseline Test Verification**: 644 / 644 passing (100% green)

---

## 1. Executive Summary

This report delivers a thorough architectural and forensic investigation of the SunaChat frontend codebase (`app.js`, `redesign.js`, `index.html`, `styles.css`) to specify the integration points for the **DeepSeek Harness (dsh)** ecosystem:
1. **3-Pane Live Workspace & Virtual File System (VFS)**: Interfacing `fs_read`, `fs_write`, `fs_list`, `fs_patch` with the dual-resizer 3-pane layout, file tabs, code editor, and live preview iframe bundler.
2. **AI Memory Subsystem**: Interfacing `memory_query` and `memory_store` with `State.memory`, `State.memory.facts`, `getStorageSuffix()`, IndexedDB (`SunaChatDB`), and Firestore optimistic synchronization.
3. **Tabular Intelligence**: Interfacing `analyze_tabular` with the existing Markdown table parser, `.table-responsive-wrapper`, and 1-click `exportTableToCSV(tableOrEl)`.
4. **Visual Analytics & Diagrams**: Interfacing `visualize_diagram` with the inline `.svg-diagram-wrapper`, the `#svg-zoom-modal` full-screen modal, and the interactive `.mindmap-iframe` D3/SVG tree engine (`mindmap.html`).
5. **Chat Message Bubbles & Trajectory View**: Designing the live active tool status indicator and the collapsible DeepSeek Harness-style Trajectory View (chip, collapsible drawer, step-by-step trace timeline) harmonized with SunaChat's **Zen Glassmorphic UI** design system.

---

## 2. Subsystem 1: 3-Pane Live Workspace & Virtual File System (VFS)

### 2.1 Current Workspace Architecture
- **Root Container**: `#artifacts-panel.artifacts-panel` with attribute `data-view="split|editor|preview|chat"` (`index.html` lines 839–919, `styles.css` lines 4688–4940, 5760–5950).
- **Toggle Mechanism**: Handled via `#btn-toggle-workspace` and `#btn-toggle-workspace-mobile`, calling `handleToggleWorkspace()` in `app.js` (lines 1384–1399), or programmatically via `window.openArtifact(contentOrB64)`.
- **3-Pane Column Structure (`data-view="split"`)**:
  - **Pane 1 (Left - 35%)**: `#artifact-editor-container.artifact-editor-container`. Contains `.workspace-editor-toolbar` (`#btn-new-session`, `#select-session-template`) and `#artifact-editor-textarea.artifact-editor-textarea`.
  - **Resizer 1**: `#artifact-resizer-1.artifact-resizer`. Clamps editor width between 10% and 80%, ensuring preview width > 10% (`app.js` lines 1775–1786).
  - **Pane 2 (Center - 35%)**: `#artifact-preview-container.artifact-preview-container`. Contains `#artifact-iframe-wrapper` and `#artifact-iframe` (sandboxed: `allow-scripts allow-modals allow-forms`), plus `#workspace-console-drawer`.
  - **Resizer 2**: `#artifact-resizer-2.artifact-resizer`. Clamps preview + editor width between 20% and 90%, with preview > 10% and chat > 10% (`app.js` lines 1789–1802).
  - **Pane 3 (Right - 30%)**: `#artifact-chat-container.artifact-chat-container`. Contains `#workspace-chat-messages`, `#workspace-chat-input`, and `#btn-send-workspace-chat`.
- **Pointer Lock Safety**:
  - Functions `lockAllIframes()` and `unlockAllIframes()` set `el.style.pointerEvents = 'none'/'auto'` and `previewContainer.style.pointerEvents = 'none'/'auto'` during dragging and release on `mouseup` or `window.blur` (`app.js` lines 1512–1522).
- **Existing Code Application Mechanism**:
  - `extractWorkspaceCode(responseText)` parses code fences, prioritizing `html`, `svg`, `xml`, then `javascript`, `js`, `css` (`app.js` lines 1931–1958).
  - `autoApplyWorkspaceCode(newCode)` assigns `editor.value = newCode`, dispatches `input` event, sets `iframe.srcdoc = newCode`, and fires `window.toast('Đã tự động cập nhật mã nguồn vào Live Workspace!', 'success')` (`app.js` lines 1960–1983).

### 2.2 Virtual File System (VFS) State Model
Currently, SunaChat only stores a single raw code string inside `#artifact-editor-textarea.value`. To support multi-file projects (`index.html`, `styles.css`, `app.js`), we introduce `State.vfs`:

```javascript
// Add to State in app.js
State.vfs = {
  files: {
    '/index.html': {
      content: '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <div id="app"></div>\n  <script src="app.js"><\/script>\n</body>\n</html>',
      type: 'html',
      updatedAt: Date.now()
    },
    '/styles.css': {
      content: 'body { margin: 0; font-family: sans-serif; background: #0f172a; color: #f8fafc; }',
      type: 'css',
      updatedAt: Date.now()
    },
    '/app.js': {
      content: 'console.log("Suna Virtual Workspace initialized.");',
      type: 'javascript',
      updatedAt: Date.now()
    }
  },
  activeFile: '/index.html'
};
```

### 2.3 UI Widgets & DOM Integration
1. **Workspace File Tabs**:
   - Location: Inserted into `#artifact-editor-container` above `#artifact-editor-textarea`.
   - Selector: `.workspace-file-tabs` with child `.workspace-file-tab` buttons.
   - HTML Structure:
     ```html
     <div class="workspace-file-tabs" id="workspace-file-tabs">
       <div class="workspace-file-tab active" data-path="/index.html">
         <span class="material-icons-round tab-icon">html</span>
         <span class="tab-name">index.html</span>
       </div>
       <div class="workspace-file-tab" data-path="/styles.css">
         <span class="material-icons-round tab-icon">css</span>
         <span class="tab-name">styles.css</span>
       </div>
       <div class="workspace-file-tab" data-path="/app.js">
         <span class="material-icons-round tab-icon">javascript</span>
         <span class="tab-name">app.js</span>
       </div>
       <button id="btn-vfs-add-file" class="btn-tab-add" title="Tạo file mới" aria-label="Tạo file mới">
         <span class="material-icons-round">add</span>
       </button>
     </div>
     ```
2. **Virtual Project Live Preview Bundler**:
   - When any file in `State.vfs.files` is modified, the preview iframe compiler bundles `/index.html`:
     ```javascript
     function compileVfsToSrcDoc() {
       const htmlFile = State.vfs.files['/index.html'] || State.vfs.files['index.html'];
       if (!htmlFile) return editorTextarea.value;
       
       let compiled = htmlFile.content;
       
       // Inline referenced CSS files
       compiled = compiled.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
         const cleanPath = href.startsWith('/') ? href : '/' + href;
         const cssFile = State.vfs.files[cleanPath] || State.vfs.files[href];
         return cssFile ? `<style data-vfs="${href}">\n${cssFile.content}\n</style>` : match;
       });
       
       // Inline referenced JS files
       compiled = compiled.replace(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, (match, src) => {
         const cleanPath = src.startsWith('/') ? src : '/' + src;
         const jsFile = State.vfs.files[cleanPath] || State.vfs.files[src];
         return jsFile ? `<script data-vfs="${src}">\n${jsFile.content}\n<\/script>` : match;
       });
       
       // Inject developer console proxy
       return injectConsoleProxy(compiled);
     }
     ```

### 2.4 Concrete Core Tools Interface: `fs_*`

```javascript
// Registered under SunaAgent.tools
SunaAgent.tools.fs_read = async function(args) {
  const path = (args.path || '').trim();
  const normalized = path.startsWith('/') ? path : '/' + path;
  if (!State.vfs || !State.vfs.files) throw new Error('VFS is not initialized.');
  const file = State.vfs.files[normalized] || State.vfs.files[path];
  if (!file) throw new Error(`File "${path}" not found in virtual workspace.`);
  return file.content;
};

SunaAgent.tools.fs_write = async function(args) {
  let { path, content } = args;
  if (!path) throw new Error('Parameter "path" is required for fs_write.');
  path = path.trim();
  const normalized = path.startsWith('/') ? path : '/' + path;
  
  if (!State.vfs) State.vfs = { files: {}, activeFile: normalized };
  const ext = normalized.split('.').pop().toLowerCase();
  
  State.vfs.files[normalized] = {
    content: String(content || ''),
    type: ext === 'js' ? 'javascript' : ext,
    updatedAt: Date.now()
  };
  
  // Update active editor if writing to active file
  if (State.vfs.activeFile === normalized) {
    const ed = document.getElementById('artifact-editor-textarea');
    if (ed) {
      ed.value = content;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  // Re-render tabs and refresh preview
  renderVfsTabs();
  updateLivePreviewFromVfs();
  
  // Ensure workspace panel is active
  const panel = document.getElementById('artifacts-panel');
  if (panel && !panel.classList.contains('active')) panel.classList.add('active');
  
  if (window.toast) window.toast(`Đã ghi tệp ảo ${normalized} vào Live Workspace`, 'success');
  return `File "${normalized}" written successfully (${(content || '').length} bytes).`;
};

SunaAgent.tools.fs_list = async function(args) {
  if (!State.vfs || !State.vfs.files) return JSON.stringify([]);
  const list = Object.entries(State.vfs.files).map(([p, f]) => ({
    path: p,
    type: f.type,
    size: (f.content || '').length,
    updatedAt: f.updatedAt
  }));
  return JSON.stringify(list, null, 2);
};

SunaAgent.tools.fs_patch = async function(args) {
  let { path, search, replace } = args;
  if (!path || search === undefined || replace === undefined) {
    throw new Error('fs_patch requires "path", "search", and "replace" parameters.');
  }
  const normalized = path.startsWith('/') ? path : '/' + path;
  const file = State.vfs?.files?.[normalized];
  if (!file) throw new Error(`File "${path}" not found to patch.`);
  
  if (!file.content.includes(search)) {
    throw new Error(`Target search block not found in "${path}". Search must match file content exactly.`);
  }
  
  file.content = file.content.replace(search, replace);
  file.updatedAt = Date.now();
  
  if (State.vfs.activeFile === normalized) {
    const ed = document.getElementById('artifact-editor-textarea');
    if (ed) {
      ed.value = file.content;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  updateLivePreviewFromVfs();
  return `File "${normalized}" patched successfully.`;
};
```

---

## 3. Subsystem 2: AI Memory Subsystem (`State.memory`, Storage & Firestore)

### 3.1 Existing Memory Architecture
- **State Definition** (`app.js` lines 3274–3278):
  ```javascript
  memory: {
    facts: [],        // [{fact: string, category: string, timestamp: number}]
    lastUpdated: 0
  }
  ```
- **Categories** (`MEMORY_CATEGORIES`, line 3290):
  `identity` (👤 Danh tính), `preference` (⭐ Sở thích), `skill` (💻 Kỹ năng), `work` (💼 Công việc), `context` (📌 Ngữ cảnh), `style` (🎨 Phong cách).
- **Core Operations**:
  - `addMemoryFact(fact, category)` (lines 3317–3335): Deduplicates via `toLowerCase().trim()`, clamps to a maximum of 50 items (evicting oldest via `.shift()`), and invokes `saveMemory()`.
  - `removeMemoryFact(index)` (lines 3337–3342): Splices fact and calls `saveMemory()`.
  - `getMemoryPrompt()` (lines 3344–3359): Injects grouped facts into the LLM system prompt.
  - `extractMemoryFromMessage(text)` (lines 3361–3433): Passive regex heuristics extracting name, job, tech keywords, hobbies, and age.
- **Persistence & User Isolation**:
  - `getStorageSuffix()` (lines 3497–3502): Returns `'_' + AuthState.user.uid` when logged in, or `'_guest'` for anonymous sessions.
  - `loadMemory()` (lines 3299–3306): `await idbGet('suna_memory' + getStorageSuffix())`.
  - `saveMemory()` (lines 3308–3314): `await idbSet('suna_memory' + getStorageSuffix(), State.memory)`.
  - Firestore background write: Pattern demonstrated by `save_note_to_firestore` (lines 3059–3093), performing non-blocking async writes to `users/${uid}/...` via `window._fb.setDoc()`.

### 3.2 Concrete Core Tools Interface: `memory_*`

```javascript
SunaAgent.tools.memory_store = async function(args) {
  const fact = (args.fact || '').trim();
  const category = (args.category || 'context').trim().toLowerCase();
  if (!fact) throw new Error('Argument "fact" cannot be empty.');
  
  const validCategories = Object.keys(MEMORY_CATEGORIES);
  const matchedCategory = validCategories.includes(category) ? category : 'context';
  
  const added = addMemoryFact(fact, matchedCategory);
  
  // Optimistic sync to Firestore if user is authenticated
  if (window.AuthState && window.AuthState.isLoggedIn && window.AuthState.user && window._fb?.db) {
    const uid = window.AuthState.user.uid;
    const factId = 'fact-' + Date.now();
    const docRef = window._fb.doc(window._fb.db, 'users', uid, 'memory_facts', factId);
    window._fb.setDoc(docRef, {
      fact,
      category: matchedCategory,
      timestamp: Date.now()
    }).catch(err => console.warn('[Memory Cloud Sync] Failed:', err));
  }
  
  return added 
    ? `Memory stored successfully under [${MEMORY_CATEGORIES[matchedCategory] || matchedCategory}]: "${fact}"` 
    : `Fact already exists in memory: "${fact}"`;
};

SunaAgent.tools.memory_query = async function(args) {
  const query = (args.query || '').trim().toLowerCase();
  const category = (args.category || '').trim().toLowerCase();
  const limit = Number(args.limit) || 10;
  
  if (!State.memory || !State.memory.facts || State.memory.facts.length === 0) {
    return 'Memory store is currently empty.';
  }
  
  let results = State.memory.facts;
  if (category) {
    results = results.filter(f => (f.category || '').toLowerCase() === category);
  }
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean);
    results = results.filter(f => {
      const lower = f.fact.toLowerCase();
      return tokens.some(t => lower.includes(t));
    });
  }
  
  results = results.slice(-limit).reverse();
  if (results.length === 0) {
    return `No matching memories found for query: "${query}" (category: "${category || 'all'}").`;
  }
  
  return results.map(f => {
    const catLabel = MEMORY_CATEGORIES[f.category] || f.category;
    return `- [${catLabel}] ${f.fact} (${new Date(f.timestamp).toLocaleDateString('vi-VN')})`;
  }).join('\n');
};
```

---

## 4. Subsystem 3: Table Wrapper & CSV Export (`analyze_tabular`)

### 4.1 Existing Table Infrastructure
- **Markdown Table Parser** (`app.js` lines 5460–5475):
  ```javascript
  html = html.replace(/(?:^|\n)(\|.*\|\n\|[-:| ]+\|\n(?:\|.*\|(?:\n|$))+)/g, (match, table) => {
    const rows = table.trim().split('\n');
    let tableHtml = '<div class="table-responsive-wrapper"><button class="btn-export-table-csv" onclick="exportTableToCSV(this.parentElement.querySelector(\'table\'))" title="Tải bảng dạng CSV/Excel" aria-label="Tải CSV"><span class="material-icons-round">table_view</span><span>Xuất CSV</span></button><table>';
    rows.forEach((row, i) => {
      if (i === 1) return; // Skip separator row
      const cells = row.split('|').filter((_, index, arr) => index > 0 && index < arr.length - 1);
      tableHtml += '<tr>';
      cells.forEach(cell => {
        tableHtml += i === 0 ? `<th>${cell.trim()}</th>` : `<td>${cell.trim()}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</table></div>';
    return tableHtml;
  });
  ```
- **Export Function** (`window.exportTableToCSV`, lines 8868–8910):
  - Extracts rows and cells (`th, td`).
  - Escapes double-quotes (`replace(/"/g, '""')`).
  - Prepend UTF-8 BOM (`\uFEFF`) to support Microsoft Excel Vietnamese diacritics.
  - Automatically triggers download (`suna_table_${Date.now()}.csv`).
- **Styling** (`styles.css` lines 6935–6976):
  - `.table-responsive-wrapper`: `position: relative; overflow-x: auto; border-radius: 8px;`
  - `.btn-export-table-csv`: `position: absolute; top: 6px; right: 6px; backdrop-filter: blur(8px);`

### 4.2 Concrete Core Tool Interface: `analyze_tabular`

```javascript
SunaAgent.tools.analyze_tabular = async function(args) {
  let { data, operation, column, delimiter } = args;
  if (!data) throw new Error('Parameter "data" (CSV, TSV, or JSON string) is required.');
  
  operation = (operation || 'summary').toLowerCase();
  let rows = [];
  
  // Parse input format
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      const sep = delimiter || (trimmed.includes('\t') ? '\t' : ',');
      const lines = trimmed.split(/\r?\n/).filter(Boolean);
      if (lines.length > 0) {
        const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(sep).map(v => v.trim().replace(/^["']|["']$/g, ''));
          const rowObj = {};
          headers.forEach((h, idx) => { rowObj[h] = vals[idx] !== undefined ? vals[idx] : ''; });
          rows.push(rowObj);
        }
      }
    }
  } else if (Array.isArray(data)) {
    rows = data;
  }
  
  if (rows.length === 0) return 'Empty tabular dataset provided.';
  
  const headers = Object.keys(rows[0]);
  
  // Statistical Calculations
  const numericSummary = {};
  headers.forEach(h => {
    const numVals = rows.map(r => Number(r[h])).filter(v => !isNaN(v) && v !== null && v !== '');
    if (numVals.length > 0) {
      numVals.sort((a, b) => a - b);
      const sum = numVals.reduce((acc, v) => acc + v, 0);
      const mean = sum / numVals.length;
      const median = numVals.length % 2 === 0 
        ? (numVals[numVals.length / 2 - 1] + numVals[numVals.length / 2]) / 2 
        : numVals[Math.floor(numVals.length / 2)];
      const min = numVals[0];
      const max = numVals[numVals.length - 1];
      const variance = numVals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numVals.length;
      const stdDev = Math.sqrt(variance);
      
      numericSummary[h] = { count: numVals.length, min, max, mean: mean.toFixed(2), median: median.toFixed(2), stdDev: stdDev.toFixed(2) };
    }
  });
  
  // Render Markdown Table Result (automatically inherits .table-responsive-wrapper & CSV export)
  let md = `\n| Cột (Column) | Số lượng (Count) | Tối thiểu (Min) | Tối đa (Max) | Trung bình (Mean) | Trung vị (Median) | Độ lệch chuẩn (StdDev) |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const [col, stats] of Object.entries(numericSummary)) {
    md += `| **${col}** | ${stats.count} | ${stats.min} | ${stats.max} | ${stats.mean} | ${stats.median} | ${stats.stdDev} |\n`;
  }
  
  return md;
};
```

---

## 5. Subsystem 4: SVG Viewer Modal & Mindmap Engine (`visualize_diagram`)

### 5.1 Existing Visual Capabilities
1. **SVG Viewer Modal** (`app.js` lines 8974–9046, `styles.css` lines 7002–7146):
   - `.svg-diagram-wrapper`: Glassmorphic container (`backdrop-filter: blur(16px)`).
   - Header actions:
     - `.btn-svg-zoom`: Triggers `openSvgModal(svgStr)`.
     - `.btn-svg-sm` (download): Triggers `downloadSvgContent(svgStr)`.
     - `.btn-svg-sm` (workspace): Triggers `openArtifact(svgStr)` to load into the 3-Pane Live Workspace.
   - Modal DOM: `#svg-zoom-modal.svg-zoom-modal` (z-index: 10005) with `#svg-zoom-body`.
2. **Mindmap Viewer/Engine** (`app.js` lines 4250–5060, 8611–8627):
   - Triggered by ````mindmap ... ```` markdown fence.
   - Inline iframe: `.mindmap-container-wrapper` with `.mindmap-iframe` running D3/SVG neon tree.
   - Fullscreen Canvas Button: `.btn-mindmap-fullscreen` -> calls `openFullMindmapCanvas(markdownText)` which sets `localStorage.setItem('suna_active_mindmap_data', markdownText)` and opens `mindmap.html`.

### 5.2 Concrete Core Tool Interface: `visualize_diagram`

```javascript
SunaAgent.tools.visualize_diagram = async function(args) {
  const { type, content, title } = args;
  if (!content) throw new Error('Parameter "content" is required for visualize_diagram.');
  
  const diagramType = (type || 'svg').toLowerCase();
  
  if (diagramType === 'svg') {
    let cleanSvg = content.trim();
    if (!cleanSvg.startsWith('<svg')) {
      const svgMatch = cleanSvg.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) cleanSvg = svgMatch[0];
      else throw new Error('Invalid SVG content provided: Missing <svg> root element.');
    }
    // Return formatted markdown code block for SVG
    return `\`\`\`svg\n${cleanSvg}\n\`\`\``;
  } else if (diagramType === 'mindmap') {
    let mmContent = content.trim();
    if (mmContent.startsWith('```')) {
      mmContent = mmContent.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
    }
    // Return formatted mindmap code fence
    return `\`\`\`mindmap\n${mmContent}\n\`\`\``;
  } else {
    throw new Error(`Unsupported diagram type "${type}". Supported types: "svg", "mindmap".`);
  }
};
```

---

## 6. Subsystem 5: Chat Message Bubbles, Trajectory View & Live Status Indicators

### 6.1 Current Chat Message Bubble Rendering Lifecycle
1. **Normal Flow (`renderMessages()`, `app.js` lines 4088–4223)**:
   - Message container: `.message ${m.role}` (`assistant` / `user`).
   - Inner structure:
     - `.message-avatar`: User avatar or `assets/avatar.png`.
     - `.message-content`:
       - `.message-header`: `.msg-name` (`✨ Suna Chat`) and timestamp.
       - `.message-bubble`: Markdown-formatted content with `m.htmlCache` optimization.
       - `.message-actions`: Copy, quote, reload, delete, visualize buttons.
2. **Streaming Flow (`generateAIResponse()`, lines 6674–7050)**:
   - Starts with `typingEl` showing `.typing-indicator` with `.typing-text` ("Đang suy nghĩ...").
   - Reader receives chunks: `assistantContent += delta`.
   - `StreamParser` intercepts `<suna_tool_call>...</suna_tool_call>` in real-time, removing tool call syntax from `parser.filteredText` so raw tool tags never flicker on the user's screen.
   - Throttled `requestAnimationFrame` formats `parser.filteredText` into `bubbleEl`.

### 6.2 Trajectory View & Live Status Architecture (Zen Glassmorphic UI)

#### A. Active Tool Status Indicator (During Tool Execution)
When SunaAgent identifies a tool call during streaming or between ReAct turns, replace the generic "Suna đang chạy công cụ..." with an animated Zen Glassmorphic Status Indicator:

```html
<!-- Inserted inside typing indicator or top of assistant message -->
<div class="agent-active-tool-indicator">
  <div class="tool-spinner-pulse"></div>
  <span class="material-icons-round tool-icon">terminal</span>
  <span class="tool-status-text">Đang thực thi trong Sandbox: <code>sandbox_exec</code>...</span>
  <span class="tool-step-badge">Bước 1/4</span>
</div>
```

#### B. Completed Trajectory View (Zen Glassmorphic Drawer)
Rendered inside `.message-content` directly above `.message-bubble`:

```html
<div class="trajectory-container" id="trajectory-${msgId}">
  <!-- 1. Trajectory Summary Chip -->
  <button class="trajectory-chip" onclick="toggleTrajectoryDrawer(this)" aria-expanded="false" title="Xem chuỗi suy luận ReAct">
    <span class="material-icons-round trajectory-icon">alt_route</span>
    <span class="trajectory-title">Truy vết suy luận &amp; Công cụ</span>
    <span class="trajectory-badge">3 bước (sandbox_exec, fs_write)</span>
    <span class="trajectory-latency">340ms</span>
    <span class="material-icons-round trajectory-chevron">expand_more</span>
  </button>
  
  <!-- 2. Collapsible Trajectory Drawer -->
  <div class="trajectory-drawer collapsed">
    <div class="trajectory-timeline">
      
      <!-- Step 1 -->
      <div class="trajectory-step-node">
        <div class="step-indicator">
          <span class="step-number">1</span>
          <div class="step-line"></div>
        </div>
        <div class="step-card">
          <div class="step-header">
            <div class="step-tool-tag">
              <span class="material-icons-round">terminal</span>
              <span class="step-tool-name">sandbox_exec</span>
            </div>
            <span class="step-tag-latency">85ms</span>
          </div>
          <div class="step-thought">
            <span class="thought-badge">Suy luận:</span> Cần tính toán căn bậc hai và phân tích dữ liệu đầu vào.
          </div>
          <div class="step-details">
            <div class="step-subblock">
              <span class="subblock-label">Tham số đầu vào:</span>
              <pre class="step-pre"><code>{"code": "Math.sqrt(144) * 2"}</code></pre>
            </div>
            <div class="step-subblock">
              <span class="subblock-label">Quan sát (Observation):</span>
              <pre class="step-pre observation-pre"><code>24</code></pre>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Step 2 -->
      <div class="trajectory-step-node">
        <div class="step-indicator">
          <span class="step-number">2</span>
        </div>
        <div class="step-card">
          <div class="step-header">
            <div class="step-tool-tag">
              <span class="material-icons-round">folder_open</span>
              <span class="step-tool-name">fs_write</span>
            </div>
            <span class="step-tag-latency">12ms</span>
          </div>
          <div class="step-thought">
            <span class="thought-badge">Suy luận:</span> Cập nhật kết quả tính toán vào tệp index.html trong Live Workspace.
          </div>
          <div class="step-details">
            <div class="step-subblock">
              <span class="subblock-label">Tham số đầu vào:</span>
              <pre class="step-pre"><code>{"path": "/index.html", "content": "<h1>Kết quả: 24</h1>"}</code></pre>
            </div>
            <div class="step-subblock">
              <span class="subblock-label">Quan sát (Observation):</span>
              <pre class="step-pre observation-pre"><code>File "/index.html" written successfully (24 bytes).</code></pre>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  </div>
</div>
```

### 6.3 Zen Glassmorphic CSS Implementation (`styles.css`)

```css
/* ===== DeepSeek Harness Trajectory View (Zen Glassmorphism) ===== */
.trajectory-container {
  margin: 6px 0 10px 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.trajectory-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-pill, 9999px);
  padding: 5px 14px;
  color: var(--text-secondary, #a0a0a0);
  font-family: var(--font-primary, inherit);
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  user-select: none;
  width: fit-content;
}

.trajectory-chip:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--accent-1, #e8a87c);
  color: var(--text-primary, #e0e0e0);
  box-shadow: 0 0 12px var(--accent-glow, rgba(232, 168, 124, 0.35));
}

.trajectory-chip .trajectory-icon {
  font-size: 16px;
  color: var(--accent-1, #e8a87c);
}

.trajectory-chip .trajectory-badge {
  background: rgba(232, 168, 124, 0.12);
  color: var(--accent-1, #e8a87c);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 0.72rem;
  font-weight: 600;
}

.trajectory-chip .trajectory-latency {
  font-size: 0.7rem;
  color: var(--text-muted, #8e8a9e);
}

.trajectory-chip .trajectory-chevron {
  font-size: 16px;
  transition: transform 0.25s ease;
}

.trajectory-chip[aria-expanded="true"] .trajectory-chevron {
  transform: rotate(180deg);
}

/* Collapsible Drawer */
.trajectory-drawer {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin 0.2s ease;
  margin-top: 0;
}

.trajectory-drawer:not(.collapsed) {
  max-height: 1200px;
  opacity: 1;
  margin-top: 10px;
}

.trajectory-timeline {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, rgba(20, 18, 30, 0.65));
  border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md, 16px);
  padding: 16px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  gap: 14px;
}

.trajectory-step-node {
  display: flex;
  gap: 12px;
  position: relative;
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 24px;
}

.step-number {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-gradient, linear-gradient(135deg, #e8a87c, #c0392b));
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 8px var(--accent-glow, rgba(232, 168, 124, 0.35));
}

.step-line {
  flex-grow: 1;
  width: 2px;
  background: linear-gradient(to bottom, var(--accent-1, #e8a87c), var(--border-glass, rgba(255, 255, 255, 0.08)));
  margin: 4px 0;
  min-height: 24px;
}

.step-card {
  flex-grow: 1;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-sm, 12px);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.step-tool-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent-1, #e8a87c);
}

.step-tool-tag .material-icons-round {
  font-size: 16px;
}

.step-tag-latency {
  font-size: 0.7rem;
  color: var(--text-muted, #8e8a9e);
}

.step-thought {
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--text-primary, #e0e0e0);
}

.thought-badge {
  color: var(--accent-1, #e8a87c);
  font-weight: 600;
}

.step-subblock {
  margin-top: 4px;
}

.subblock-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted, #8e8a9e);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.step-pre {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 6px 10px;
  margin: 4px 0 0 0;
  font-family: var(--font-code, monospace);
  font-size: 0.75rem;
  color: var(--text-primary, #e0e0e0);
  overflow-x: auto;
  max-height: 180px;
}

.observation-pre {
  border-left: 3px solid var(--accent-1, #e8a87c);
}

/* Active Tool Pulse Indicator (During Execution) */
.agent-active-tool-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(232, 168, 124, 0.08);
  border: 1px solid rgba(232, 168, 124, 0.25);
  border-radius: var(--radius-pill, 9999px);
  padding: 6px 14px;
  margin: 6px 0;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: toolPulseGlow 2s infinite ease-in-out;
}

.tool-spinner-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-1, #e8a87c);
  box-shadow: 0 0 8px var(--accent-glow, rgba(232, 168, 124, 0.35));
  animation: typingPulse 1.2s infinite ease-in-out;
}

.tool-status-text {
  font-size: 0.78rem;
  color: var(--text-primary, #e0e0e0);
  font-weight: 500;
}

.tool-status-text code {
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--accent-1, #e8a87c);
}

.tool-step-badge {
  font-size: 0.7rem;
  background: var(--accent-gradient, linear-gradient(135deg, #e8a87c, #c0392b));
  color: #fff;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 700;
}

@keyframes toolPulseGlow {
  0%, 100% { border-color: rgba(232, 168, 124, 0.25); box-shadow: 0 0 8px rgba(232, 168, 124, 0.1); }
  50% { border-color: rgba(232, 168, 124, 0.5); box-shadow: 0 0 16px rgba(232, 168, 124, 0.3); }
}

/* Light Mode Support */
body.light-mode .trajectory-chip {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: var(--text-secondary, #6e6e73);
}

body.light-mode .trajectory-timeline {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(0, 0, 0, 0.08);
}

body.light-mode .step-card {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}

body.light-mode .step-pre {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.06);
}
```

---

## 7. Zero-Regression & Invariant Analysis

The existing test suite of **644 tests** has strict constraints that must be preserved:

| Test Suite / Category | Critical Assertion / Invariant | Impact on dsh Implementation & Guard |
| :--- | :--- | :--- |
| **Dual Resizers & Left Handle Bounds** | `percentage = Math.max(25, Math.min(percentage, 100))` | Never alter the left handle clamping bounds. |
| **Resizer 1 (Editor/Preview)** | `editorWidthPercent = Math.max(10, Math.min(editorWidthPercent, 80))` and `previewWidthPercent > 10` | Do not adjust column width formulas when adding file tabs. |
| **Resizer 2 (Preview/Chat)** | `leftWidthPercent = Math.max(20, Math.min(leftWidthPercent, 90))` and `previewWidthPercent > 10 && chatWidthPercent > 10` | Keep Pane 3 chat container bounds intact. |
| **Pointer Lock Safety** | `lockAllIframes()` on mousedown, `unlockAllIframes()` on mouseup/blur | All iframe operations during VFS preview compilation must obey pointer lock state. |
| **Workspace Assistant Safety** | `_workspaceAbortController.abort()` and 45s safety timeout | Tool executions must respect abort signals from `State.abortController`. |
| **Direct Workspace Sync (Tier 1-4)** | `autoApplyWorkspaceCode` must dispatch `input` event on `#artifact-editor-textarea` and update `#artifact-iframe.srcdoc` | When `fs_write` modifies active file, it must trigger the same input event and preview sync. |
| **Storage Suffix Synchronization** | All `localStorage.setItem('suna_settings' + suffix)` and memory IDB keys must use `getStorageSuffix()` | `memory_store` and VFS storage keys MUST append `getStorageSuffix()` to preserve account isolation. |
| **CSS Hygiene & Z-Index** | `.toast-container` must have `z-index: 10000`, balanced `{}` braces | Trajectory View and modal styles must avoid duplicate backdrop filters and retain balanced braces. |
| **Syntax Validation** | `node -c app.js` and `node -c redesign.js` must return 0 syntax errors | All additions to `app.js` and `redesign.js` must be strictly valid ECMAScript. |

---

## 8. Summary of Integration Points for Implementer

| Tool / Widget | Subsystem | DOM Target / Method | Primary Integration Point |
| :--- | :--- | :--- | :--- |
| `fs_read` | 3-Pane Workspace | `State.vfs.files[path]` | Reads in-memory virtual file contents. |
| `fs_write` | 3-Pane Workspace | `#artifact-editor-textarea`, `#artifact-iframe` | Creates/updates file, syncs tab UI, triggers live bundler. |
| `fs_list` | 3-Pane Workspace | `Object.keys(State.vfs.files)` | Returns array of virtual project files. |
| `fs_patch` | 3-Pane Workspace | `State.vfs.files[path].content.replace(...)` | Atomic replacement diff on virtual file. |
| `memory_store` | AI Memory | `addMemoryFact(fact, cat)`, Firestore | Deduplicates, caps at 50, persists to IDB and Firestore. |
| `memory_query` | AI Memory | `State.memory.facts.filter(...)` | Token/keyword fuzzy match against structured facts. |
| `analyze_tabular` | Tabular Engine | `.table-responsive-wrapper`, `exportTableToCSV` | Returns markdown table which automatically gains 1-click CSV export. |
| `visualize_diagram` | Visual Analytics | `#svg-zoom-modal`, `.mindmap-iframe` | Returns SVG code or mindmap fence for interactive rendering. |
| `Trajectory View` | Chat Message Bubble | `.trajectory-chip`, `.trajectory-drawer` | Renders collapsible ReAct reasoning steps with Zen Glassmorphism. |
| `Active Tool Indicator` | Chat Message Bubble | `.agent-active-tool-indicator` | Displays glowing pulse chip showing currently executing tool. |
