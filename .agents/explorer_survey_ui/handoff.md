# Handoff Report: Top Bar UI & Responsive Layout Architecture Survey for Reasoning Effort Dropdown Widget

**Agent**: `explorer_survey_ui` (Archetype: `teamwork_preview_explorer`)  
**Working Directory**: `d:\Suna Chat\.agents\explorer_survey_ui`  
**Parent**: `orchestrator_9` (Conversation ID: `99148b05-1f2b-41ba-a791-1c55f494f7f5`)  
**Timestamp**: 2026-09-17T10:02:00Z  

---

## 1. Observation

### 1.1 `index.html` Top Bar Header Architecture
- **Location**: `index.html`, lines 308–404.
- **Surrounding Structure**:
  - Main container: `<header class="top-bar">`
  - Left child: `<button id="btn-toggle-sidebar" class="btn-icon" title="Đóng/Mở sidebar" aria-label="Đóng/Mở sidebar">`
  - Center container: `<div class="top-bar-center">` (lines 314–320):
    ```html
    <div class="top-bar-center">
        <div class="current-model-display" id="current-model-display" title="Đổi model & Cài đặt API" aria-label="Đổi model & Cài đặt API" role="button" tabindex="0">
            <span class="material-icons-round model-icon">smart_toy</span>
            <span id="current-model-name">Chưa chọn model</span>
            <div class="mode-badge" id="mode-badge">Flash</div>
        </div>
    </div>
    ```
  - Right child: `<div class="top-bar-right">` (lines 321–403):
    - Suna Lofi Player (`#suna-lofi-player`)
    - User & Sync Group (`.top-user-sync-group` containing `#btn-user-menu`, `#user-dropdown`, and `#sync-indicator`)
    - Divider: `<div class="topbar-divider"></div>`
    - Quick actions: `.top-primary-actions` (`#btn-toggle-workspace`, `#btn-toggle-theme`)
    - Mobile/desktop more actions dropdown: `.mobile-dropdown-container` (`#btn-mobile-more`, `#mobile-more-menu`)
- **Icon Set**:
  - `index.html` line 20 loads Google Fonts: `<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">`.
  - Lucide icons are **not** present in the project. The codebase consistently uses `material-icons-round` (`<span class="material-icons-round">icon_name</span>`), inline SVGs, and native unicode emojis.

### 1.2 `styles.css` Top Bar, Dropdowns, Pills, Badges & Responsive Layout
- **Base styles for `.top-bar-center` and `#current-model-display`**:
  - `styles.css` lines 1005–1063:
    ```css
    .top-bar-center {
      flex: 1;
      display: flex;
      justify-content: center;
      min-width: 0;
    }
    .current-model-display {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      background: var(--bg-card, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-pill);
      font-size: 0.82rem;
      line-height: 1.2;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition);
      user-select: none;
      height: 32px;
      box-sizing: border-box;
    }
    .current-model-display:hover {
      background: var(--bg-hover);
      border-color: var(--accent-1);
      color: var(--text-primary);
      box-shadow: 0 0 12px var(--accent-glow);
    }
    #current-model-name {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
      vertical-align: middle;
      line-height: 1.2;
    }
    .mode-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      background: var(--accent-gradient);
      color: #fff;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      line-height: 1;
    }
    ```
- **Existing Dropdown Patterns (`.user-dropdown`, `.mobile-more-menu`)**:
  - `styles.css` lines 1148–1170 & lines 4620–4642:
    - Wrapper: `.mobile-dropdown-container { position: relative; display: flex; align-items: center; }`
    - Menu: `position: absolute; top: calc(100% + 8px); background: var(--bg-surface, rgba(20, 18, 30, 0.95)); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35); z-index: 250; backdrop-filter: blur(20px);`
    - Display trigger: toggled via `.active` class (`display: flex; animation: fadeIn 0.18s ease;` or `opacity: 1; visibility: visible; transform: translateY(0);`).
- **Light Mode Overrides**:
  - `styles.css` lines 100–114 & lines 229–233:
    - `body.light-mode .current-model-display { background: rgba(0, 0, 0, 0.04); border-color: rgba(0, 0, 0, 0.08); }`
    - `body.light-mode .mobile-more-menu { background: rgba(255, 255, 255, 0.96); border-color: rgba(0, 0, 0, 0.08); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12); }`
- **Responsive Breakpoints Observed**:
  - `@media (max-width: 1150px)`: Smart collapsing of lofi player and secondary buttons.
  - `@media (max-width: 768px)` (lines 3202–3260 & 6566–6655):
    - `.top-bar { padding: 0 10px; gap: 8px; }`
    - `.current-model-display { padding: 4px 8px; font-size: 0.75rem; gap: 5px; min-width: 0; max-width: 130px; }`
    - `#current-model-name { max-width: 80px; }`
    - `.mode-badge { font-size: 0.6rem; padding: 1px 6px; }`
  - `@media (max-width: 480px)` (lines 3471–3570 & 5833–5864):
    - `.top-bar { padding: 0 8px; gap: 6px; }`
    - `.current-model-display { padding: 4px 8px; font-size: 0.7rem; }`
    - `#current-model-name { max-width: 65px; }`
  - `@media (max-width: 360px)` (lines 5866–5875 & 6958–6975):
    - `.top-bar { padding: 0 4px; gap: 3px; }`
    - `.current-model-display { padding: 3px 5px; font-size: 0.65rem; gap: 3px; }`
    - `#current-model-name { max-width: 55px; }`

### 1.3 `app.js` Dropdown Management, State, and Event Handlers
- **Dropdown Open / Close / Dismissal Patterns**:
  - Click toggle on button (`e.stopPropagation()`).
  - Mutual dismissal: When opening one dropdown, remove `.active` from other active dropdowns (`userDropdown`, `mobileMoreMenu`) (lines 11373–11375).
  - Click-outside dismissal: `document.addEventListener('click', (e) => { if (!e.target.closest(...)) { menu.classList.remove('active'); } })` (lines 1785–1791, 11377–11381).
  - Item click auto-dismiss: clicking any menu item dismisses the menu (lines 11383–11386).
  - Global `Escape` shortcut closes all open dropdowns (`user-dropdown`, `mobile-more-menu`) and modals (lines 11420–11437).
- **Interactive Header Accessibility Pattern**:
  - Element has `role="button"` and `tabindex="0"`.
  - Registered listener for pointer click AND keyboard (`e.key === 'Enter' || e.key === ' '` with `e.preventDefault()`) (lines 11802–11811, tested in `tests/test_topbar_layout_and_css_hygiene.js` lines 148–150).
- **Settings State and Persistence**:
  - `getDefaultSettings()` in `app.js` line 1442 defines the settings object.
  - `loadState()` in `app.js` lines 5649–5710 reads `suna_settings` from localStorage and applies it to `State.settings`.
  - `saveState(true, 'settings')` in `app.js` lines 5496–5550 saves `State.settings` to localStorage (`suna_settings` + suffix) and triggers background Firebase Cloud Sync.
- **Current Model Display Hook**:
  - `updateModelDisplay()` at line 11261 updates `#current-model-name`.

---

## 2. Logic Chain

1. **Placement Decision**:
   - The user specification mandates: "Widget `#reasoning-effort-display` xuất hiện ngay cạnh `#current-model-display` trên top bar".
   - `index.html` lines 314–320 contain `.top-bar-center` which currently holds only `#current-model-display`.
   - Wrapping `#reasoning-effort-display` and its popup `#reasoning-effort-dropdown` in a wrapper `.reasoning-effort-container` right next to `#current-model-display` inside `.top-bar-center` ensures natural flex alignment, shared centering, and absolute positioning anchors for the popup.

2. **Responsive Layout Discipline**:
   - On screens `<= 768px`, space on the top bar is tight because the sidebar toggle button (left) and Lofi Player + user profile + more menu (right) occupy significant width.
   - Per requirement R1: *"Trên màn hình hẹp (<= 768px), pill tự động co gọn thành icon huy hiệu năng lượng mà không làm tràn hoặc vỡ bố cục top bar"*.
   - By structuring `#reasoning-effort-display` with an icon (`#reasoning-icon`), a text label (`#reasoning-label`), and an arrow chevron (`.reasoning-arrow`), we can hide the text label and chevron at `<= 768px` via CSS (`display: none;`), condensing the widget into a sleek, circular/compact energy badge pill showing solely the level's emoji/icon (e.g. `⚡`, `💎`, `🔥`, etc.).
   - At `<= 480px` and `<= 360px`, tightening padding to `3px 6px` and lowering height to `28px` keeps the top bar exactly 1-row without horizontal overflow.

3. **Dropdown Positioning & Z-Index Coordination**:
   - Existing dropdowns (`.user-dropdown` and `.mobile-more-menu`) use `z-index: 250`.
   - Modals use `z-index: 1000` or `2000`; toasts use `z-index: 10000`.
   - Setting `#reasoning-effort-dropdown` to `z-index: 250` perfectly complies with the stacking architecture tested by `test_topbar_layout_and_css_hygiene.js`.
   - The popup should be centered under the container via `left: 50%; transform: translateX(-50%) translateY(-6px);`, and at `<= 768px` capped at `width: min(320px, calc(100vw - 20px))` to prevent mobile viewport clipping.

4. **WAI-ARIA Accessibility & Mutual Dismissal**:
   - Following LESSONS.md Rule 7: interactive headers formatted as `role="button"` must support Enter/Space keydown.
   - For a dropdown widget:
     - `#reasoning-effort-display` receives `role="button"`, `tabindex="0"`, `aria-haspopup="true"`, `aria-expanded="false"`, `aria-controls="reasoning-effort-dropdown"`.
     - `#reasoning-effort-dropdown` receives `role="menu"`.
     - Items receive `role="menuitemradio"`, `aria-checked="true|false"`.
     - Arrow keys (`ArrowDown`, `ArrowUp`, `Home`, `End`) navigate between the 6 items.
     - `Escape` closes the dropdown and returns focus to the pill.
     - Opening `#reasoning-effort-dropdown` dismisses `#user-dropdown` and `#mobile-more-menu`; conversely, opening any other menu dismisses `#reasoning-effort-dropdown`.

5. **State Initialization & Synchronization**:
   - `State.settings.reasoningEffort` must be initialized to `'xhigh'` in `getDefaultSettings()`:
     `reasoningEffort: 'xhigh'`.
   - `loadState()` ensures that if undefined in existing saved profiles, it falls back to `'xhigh'`.
   - When the user selects a new level, `setReasoningEffort(level)` immediately updates UI, writes `State.settings.reasoningEffort = level`, and calls `saveState(true, 'settings')`.

---

## 3. Caveats

- **No Lucide Dependency**: Lucide icon library is not installed in the project. All icons must strictly use `Material Icons Round` or UTF-8 emojis as specified.
- **Read-Only Scope**: This report is purely an architectural investigation. No project source files (`index.html`, `styles.css`, `app.js`) were modified during this investigation.
- **Top Bar Text Truncation Safety**: Because `#current-model-name` already has a dynamic max-width (`160px` desktop, `80px` 768px, `65px` 480px), adding `#reasoning-effort-display` (width ~95px desktop, ~34px mobile) requires setting `gap: 6px` on `.top-bar-center` and slightly adjusting `#current-model-name` max-width on mobile to avoid squeezing the Suna Lofi Player.
- **No Test Regression Risk**: As verified, `.top-bar-center` must keep `min-width: 0`, and `.current-model-display` must retain its click/keydown listeners for `openModal('api-modal')`.

---

## 4. Conclusion & Recommended Implementation Specification

### 4.1 Specification Table for the 6 Reasoning Levels
| Key | Emoji | Display Title | Badge Text | Badge Class | Description | Accent Hex | Pill Border / Glow |
|---|---|---|---|---|---|---|---|
| `low` | 🟢 | Low | Tối giản | `badge-low` | Tốc độ nhanh, chuỗi suy luận ngắn | `#10b981` | Border: `rgba(16, 185, 129, 0.4)`, Glow: `rgba(16, 185, 129, 0.25)` |
| `medium` | 🔵 | Medium | Cân bằng | `badge-medium` | Mức độ tiêu chuẩn | `#3b82f6` | Border: `rgba(59, 130, 246, 0.4)`, Glow: `rgba(59, 130, 246, 0.25)` |
| `high` | 🟣 | High | Nâng cao | `badge-high` | Suy luận chuyên sâu | `#a855f7` | Border: `rgba(168, 85, 247, 0.4)`, Glow: `rgba(168, 85, 247, 0.25)` |
| `xhigh` | ⚡ | X-High | Mặc định | `badge-xhigh` | Chuyên sâu mở rộng: Tự kiểm tra giả định | `#f59e0b` | Border: `rgba(245, 158, 11, 0.4)`, Glow: `rgba(245, 158, 11, 0.25)` |
| `max` | 💎 | Max | Đỉnh cao | `badge-max` | Tree-of-Thought, phân tích song song, kiểm tra biên | `#06b6d4` | Border: `rgba(6, 182, 212, 0.4)`, Glow: `rgba(6, 182, 212, 0.35)` |
| `ultra` | 🔥 | Ultra | Tối thượng | `badge-ultra` | Kiến trúc 4 pha: Phân rã, bất biến, phản ví dụ, 100% | `#f43f5e` | Border: `rgba(244, 63, 94, 0.5)`, Glow: `rgba(244, 63, 94, 0.4)` |

---

### 4.2 Exact Proposed HTML Structure (for `index.html` lines 314–320)
Insert `.reasoning-effort-container` right after `#current-model-display` inside `.top-bar-center`:

```html
<div class="top-bar-center">
    <div class="current-model-display" id="current-model-display" title="Đổi model & Cài đặt API" aria-label="Đổi model & Cài đặt API" role="button" tabindex="0">
        <span class="material-icons-round model-icon">smart_toy</span>
        <span id="current-model-name">Chưa chọn model</span>
        <div class="mode-badge" id="mode-badge">Flash</div>
    </div>

    <!-- Reasoning Effort Dropdown Widget -->
    <div class="reasoning-effort-container" id="reasoning-effort-container">
        <div class="reasoning-effort-display" id="reasoning-effort-display" title="Mức độ suy luận: X-High (Chuyên sâu mở rộng)" aria-label="Mức độ suy luận: X-High (Chuyên sâu mở rộng)" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false" data-level="xhigh">
            <span class="reasoning-icon" id="reasoning-icon">⚡</span>
            <span class="reasoning-label" id="reasoning-label">X-High</span>
            <span class="material-icons-round reasoning-arrow">expand_more</span>
        </div>
        <div class="reasoning-effort-dropdown" id="reasoning-effort-dropdown" role="menu" aria-label="Chọn mức độ suy luận">
            <div class="reasoning-dropdown-header">
                <span class="material-icons-round">psychology</span>
                <span>Mức độ suy luận (Reasoning Effort)</span>
            </div>
            <div class="reasoning-options-list" role="none">
                <button type="button" class="reasoning-option-btn" data-level="low" role="menuitemradio" aria-checked="false" tabindex="-1">
                    <div class="reasoning-option-left">
                        <span class="reasoning-option-icon">🟢</span>
                        <div class="reasoning-option-info">
                            <div class="reasoning-option-header-row">
                                <span class="reasoning-option-name">Low</span>
                                <span class="reasoning-badge badge-low">Tối giản</span>
                            </div>
                            <span class="reasoning-option-desc">Tốc độ nhanh, chuỗi suy luận ngắn</span>
                        </div>
                    </div>
                    <span class="material-icons-round reasoning-check">check</span>
                </button>
                <button type="button" class="reasoning-option-btn" data-level="medium" role="menuitemradio" aria-checked="false" tabindex="-1">
                    <div class="reasoning-option-left">
                        <span class="reasoning-option-icon">🔵</span>
                        <div class="reasoning-option-info">
                            <div class="reasoning-option-header-row">
                                <span class="reasoning-option-name">Medium</span>
                                <span class="reasoning-badge badge-medium">Cân bằng</span>
                            </div>
                            <span class="reasoning-option-desc">Mức độ tiêu chuẩn</span>
                        </div>
                    </div>
                    <span class="material-icons-round reasoning-check">check</span>
                </button>
                <button type="button" class="reasoning-option-btn" data-level="high" role="menuitemradio" aria-checked="false" tabindex="-1">
                    <div class="reasoning-option-left">
                        <span class="reasoning-option-icon">🟣</span>
                        <div class="reasoning-option-info">
                            <div class="reasoning-option-header-row">
                                <span class="reasoning-option-name">High</span>
                                <span class="reasoning-badge badge-high">Nâng cao</span>
                            </div>
                            <span class="reasoning-option-desc">Suy luận chuyên sâu</span>
                        </div>
                    </div>
                    <span class="material-icons-round reasoning-check">check</span>
                </button>
                <button type="button" class="reasoning-option-btn active" data-level="xhigh" role="menuitemradio" aria-checked="true" tabindex="0">
                    <div class="reasoning-option-left">
                        <span class="reasoning-option-icon">⚡</span>
                        <div class="reasoning-option-info">
                            <div class="reasoning-option-header-row">
                                <span class="reasoning-option-name">X-High</span>
                                <span class="reasoning-badge badge-xhigh">Mặc định</span>
                            </div>
                            <span class="reasoning-option-desc">Chuyên sâu mở rộng: Tự kiểm tra giả định</span>
                        </div>
                    </div>
                    <span class="material-icons-round reasoning-check">check</span>
                </button>
                <button type="button" class="reasoning-option-btn" data-level="max" role="menuitemradio" aria-checked="false" tabindex="-1">
                    <div class="reasoning-option-left">
                        <span class="reasoning-option-icon">💎</span>
                        <div class="reasoning-option-info">
                            <div class="reasoning-option-header-row">
                                <span class="reasoning-option-name">Max</span>
                                <span class="reasoning-badge badge-max">Đỉnh cao</span>
                            </div>
                            <span class="reasoning-option-desc">Tree-of-Thought, phân tích song song, kiểm tra biên</span>
                        </div>
                    </div>
                    <span class="material-icons-round reasoning-check">check</span>
                </button>
                <button type="button" class="reasoning-option-btn" data-level="ultra" role="menuitemradio" aria-checked="false" tabindex="-1">
                    <div class="reasoning-option-left">
                        <span class="reasoning-option-icon">🔥</span>
                        <div class="reasoning-option-info">
                            <div class="reasoning-option-header-row">
                                <span class="reasoning-option-name">Ultra</span>
                                <span class="reasoning-badge badge-ultra">Tối thượng</span>
                            </div>
                            <span class="reasoning-option-desc">Kiến trúc 4 pha: Phân rã, bất biến, phản ví dụ, 100%</span>
                        </div>
                    </div>
                    <span class="material-icons-round reasoning-check">check</span>
                </button>
            </div>
        </div>
    </div>
</div>
```

---

### 4.3 Exact Proposed CSS Styling (for `styles.css`)

```css
/* ===================================================
   Reasoning Effort Dropdown Widget Styling
   =================================================== */

.top-bar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.reasoning-effort-container {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.reasoning-effort-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-card, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-pill);
  font-size: 0.82rem;
  line-height: 1.2;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition);
  user-select: none;
  height: 32px;
  box-sizing: border-box;
}

.reasoning-effort-display:hover,
.reasoning-effort-display:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}

/* Color accents on pill based on active data-level */
.reasoning-effort-display[data-level="low"]:hover,
.reasoning-effort-display[data-level="low"]:focus-visible {
  border-color: #10b981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
}
.reasoning-effort-display[data-level="medium"]:hover,
.reasoning-effort-display[data-level="medium"]:focus-visible {
  border-color: #3b82f6;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
}
.reasoning-effort-display[data-level="high"]:hover,
.reasoning-effort-display[data-level="high"]:focus-visible {
  border-color: #a855f7;
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);
}
.reasoning-effort-display[data-level="xhigh"] {
  border-color: rgba(245, 158, 11, 0.28);
}
.reasoning-effort-display[data-level="xhigh"]:hover,
.reasoning-effort-display[data-level="xhigh"]:focus-visible {
  border-color: #f59e0b;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.3);
}
.reasoning-effort-display[data-level="max"]:hover,
.reasoning-effort-display[data-level="max"]:focus-visible {
  border-color: #06b6d4;
  box-shadow: 0 0 10px rgba(6, 182, 212, 0.35);
}
.reasoning-effort-display[data-level="ultra"] {
  border-color: rgba(244, 63, 94, 0.35);
}
.reasoning-effort-display[data-level="ultra"]:hover,
.reasoning-effort-display[data-level="ultra"]:focus-visible {
  border-color: #f43f5e;
  box-shadow: 0 0 14px rgba(244, 63, 94, 0.4);
}

.reasoning-icon {
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.reasoning-label {
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.reasoning-arrow {
  font-size: 16px;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.reasoning-effort-display[aria-expanded="true"] .reasoning-arrow {
  transform: rotate(180deg);
}

/* Dropdown Menu Popup */
.reasoning-effort-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(-6px);
  background: var(--bg-surface, rgba(20, 18, 30, 0.96));
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-md);
  padding: 8px;
  width: 320px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  display: none;
  flex-direction: column;
  gap: 4px;
  z-index: 250;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.reasoning-effort-dropdown.active {
  display: flex;
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.reasoning-dropdown-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
  margin-bottom: 2px;
}

.reasoning-dropdown-header .material-icons-round {
  font-size: 15px;
  color: var(--accent-1);
}

.reasoning-options-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.reasoning-option-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  user-select: none;
  box-sizing: border-box;
}

.reasoning-option-btn:hover,
.reasoning-option-btn:focus-visible {
  background: var(--bg-hover);
  border-color: var(--border-color);
  transform: translateX(2px);
  outline: none;
}

.reasoning-option-btn.active {
  background: rgba(161, 140, 209, 0.1);
  border-color: rgba(161, 140, 209, 0.25);
}

.reasoning-option-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.reasoning-option-icon {
  font-size: 16px;
  line-height: 1;
  margin-top: 2px;
  flex-shrink: 0;
}

.reasoning-option-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.reasoning-option-header-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.reasoning-option-name {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
}

.reasoning-badge {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  line-height: 1.1;
}

.badge-low {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.badge-medium {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}
.badge-high {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}
.badge-xhigh {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
.badge-max {
  background: rgba(6, 182, 212, 0.15);
  color: #06b6d4;
}
.badge-ultra {
  background: linear-gradient(135deg, rgba(244, 63, 94, 0.25), rgba(251, 146, 60, 0.25));
  color: #f43f5e;
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.reasoning-option-desc {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.25;
  white-space: normal;
}

.reasoning-check {
  font-size: 18px;
  color: var(--accent-1);
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
  margin-left: 8px;
}

.reasoning-option-btn.active .reasoning-check {
  opacity: 1;
}

/* Light Mode Overrides */
body.light-mode .reasoning-effort-display {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}
body.light-mode .reasoning-effort-display:hover,
body.light-mode .reasoning-effort-display:focus-visible {
  background: rgba(0, 0, 0, 0.07);
}
body.light-mode .reasoning-effort-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
body.light-mode .reasoning-dropdown-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}
body.light-mode .reasoning-option-btn:hover,
body.light-mode .reasoning-option-btn:focus-visible {
  background: rgba(0, 0, 0, 0.04);
}
body.light-mode .reasoning-option-btn.active {
  background: rgba(161, 140, 209, 0.12);
  border-color: rgba(161, 140, 209, 0.3);
}

/* Responsive Media Queries */
@media (max-width: 768px) {
  .top-bar-center {
    gap: 5px;
  }
  .reasoning-effort-display {
    padding: 4px 7px;
    font-size: 0.75rem;
    gap: 0;
  }
  .reasoning-label {
    display: none;
  }
  .reasoning-arrow {
    display: none;
  }
  .reasoning-icon {
    font-size: 15px;
  }
  .reasoning-effort-dropdown {
    width: min(310px, calc(100vw - 20px));
    left: 50%;
    transform: translateX(-50%) translateY(-4px);
  }
  .reasoning-effort-dropdown.active {
    transform: translateX(-50%) translateY(0);
  }
}

@media (max-width: 480px) {
  .reasoning-effort-display {
    padding: 3px 6px;
    height: 30px;
  }
  .reasoning-icon {
    font-size: 14px;
  }
  .reasoning-effort-dropdown {
    width: calc(100vw - 16px);
  }
}

@media (max-width: 360px) {
  .reasoning-effort-display {
    padding: 2px 5px;
    height: 28px;
  }
}
```

---

### 4.4 UI Event Binding Architecture (for `app.js`)

```js
// ===== Reasoning Effort Dropdown Widget Initialization =====
function initReasoningEffortEvents() {
  const container = document.getElementById('reasoning-effort-container');
  const display = document.getElementById('reasoning-effort-display');
  const dropdown = document.getElementById('reasoning-effort-dropdown');
  if (!container || !display || !dropdown) return;

  // Toggle dropdown on pointer click
  display.addEventListener('click', (e) => {
    e.stopPropagation();
    // Mutual dismissal: close other open dropdowns
    const userDropdown = document.getElementById('user-dropdown');
    if (userDropdown) userDropdown.classList.remove('active');
    const mobileMoreMenu = document.getElementById('mobile-more-menu');
    if (mobileMoreMenu) mobileMoreMenu.classList.remove('active');

    const willOpen = !dropdown.classList.contains('active');
    dropdown.classList.toggle('active');
    display.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  // WAI-ARIA Keyboard Navigation on Pill trigger
  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      const userDropdown = document.getElementById('user-dropdown');
      if (userDropdown) userDropdown.classList.remove('active');
      const mobileMoreMenu = document.getElementById('mobile-more-menu');
      if (mobileMoreMenu) mobileMoreMenu.classList.remove('active');

      dropdown.classList.add('active');
      display.setAttribute('aria-expanded', 'true');
      const activeBtn = dropdown.querySelector('.reasoning-option-btn.active') || dropdown.querySelector('.reasoning-option-btn');
      if (activeBtn) activeBtn.focus();
    }
  });

  // Option item selection
  dropdown.querySelectorAll('.reasoning-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const level = btn.dataset.level;
      setReasoningEffort(level);
      dropdown.classList.remove('active');
      display.setAttribute('aria-expanded', 'false');
      display.focus();
    });
  });

  // Keyboard navigation inside dropdown menu
  dropdown.addEventListener('keydown', (e) => {
    const btns = Array.from(dropdown.querySelectorAll('.reasoning-option-btn'));
    const currentIndex = btns.indexOf(document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % btns.length;
      btns[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + btns.length) % btns.length;
      btns[prevIndex].focus();
    } else if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      dropdown.classList.remove('active');
      display.setAttribute('aria-expanded', 'false');
      display.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      btns[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      btns[btns.length - 1]?.focus();
    }
  });

  // Click-outside dismissal
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#reasoning-effort-container')) {
      if (dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
        display.setAttribute('aria-expanded', 'false');
      }
    }
  });
}

function setReasoningEffort(level) {
  const validLevels = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
  if (!validLevels.includes(level)) level = 'xhigh';

  if (!State.settings) State.settings = typeof getDefaultSettings === 'function' ? getDefaultSettings() : {};
  State.settings.reasoningEffort = level;
  State.settings.updatedAt = Date.now();

  updateReasoningEffortDisplay(level);
  if (typeof saveState === 'function') {
    saveState(true, 'settings');
  }
}

function updateReasoningEffortDisplay(level) {
  const config = {
    low: { emoji: '🟢', label: 'Low', title: 'Mức độ suy luận: Low (Tối giản - Tốc độ nhanh)' },
    medium: { emoji: '🔵', label: 'Medium', title: 'Mức độ suy luận: Medium (Cân bằng - Tiêu chuẩn)' },
    high: { emoji: '🟣', label: 'High', title: 'Mức độ suy luận: High (Nâng cao - Chuyên sâu)' },
    xhigh: { emoji: '⚡', label: 'X-High', title: 'Mức độ suy luận: X-High (Chuyên sâu mở rộng - Mặc định)' },
    max: { emoji: '💎', label: 'Max', title: 'Mức độ suy luận: Max (Đỉnh cao - Tree-of-Thought)' },
    ultra: { emoji: '🔥', label: 'Ultra', title: 'Mức độ suy luận: Ultra (Siêu suy luận tối thượng - Kiến trúc 4 pha)' }
  };

  const current = config[level] || config.xhigh;
  const display = document.getElementById('reasoning-effort-display');
  const icon = document.getElementById('reasoning-icon');
  const label = document.getElementById('reasoning-label');
  const dropdown = document.getElementById('reasoning-effort-dropdown');

  if (display) {
    display.dataset.level = level;
    display.title = current.title;
    display.setAttribute('aria-label', current.title);
  }
  if (icon) icon.textContent = current.emoji;
  if (label) label.textContent = current.label;

  if (dropdown) {
    dropdown.querySelectorAll('.reasoning-option-btn').forEach(btn => {
      const isActive = btn.dataset.level === level;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.tabIndex = isActive ? 0 : -1;
    });
  }
}
```

---

## 5. Verification Method

1. **DOM Elements Verification**:
   - Inspect `index.html` lines 314–320 to verify `#top-bar-center` contains both `#current-model-display` and `#reasoning-effort-container`.
   - Verify `#reasoning-effort-display`, `#reasoning-effort-dropdown`, `#reasoning-icon`, `#reasoning-label` exist with correct ARIA roles and labels.

2. **CSS Hygiene & Balanced Syntax Verification**:
   - Count open and closing braces: `assert.strictEqual(openCount, closeCount)`.
   - Ensure `z-index: 250` matches existing dropdown stacking context.
   - Run CSS verification: verify media queries at 768px, 480px, and 360px collapse `#reasoning-label` and `.reasoning-arrow` into a badge.

3. **Runtime & Keyboard Accessibility Verification**:
   - Simulate keydown on `#reasoning-effort-display` with `Enter` / `Space` -> opens dropdown, sets `aria-expanded="true"`.
   - Simulate `Escape` key -> closes dropdown, resets `aria-expanded="false"`.
   - Simulate outside click -> dismisses dropdown.
   - Simulate item selection -> triggers `setReasoningEffort`, updates `State.settings.reasoningEffort`, and updates DOM attributes.

4. **Automated Test Command Verification**:
   - `npm test`: verify all test suites continue passing with 0 regressions.
   - `node -c app.js`: verify zero syntax errors.
