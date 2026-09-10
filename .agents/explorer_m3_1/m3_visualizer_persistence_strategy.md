# Milestone 3 Strategy & Technical Specification: Interactive UI Visualizer & IndexedDB Checkpoint Persistence (R3)

**Document ID:** M3-STRATEGY-SPEC-01  
**Author:** `explorer_m3_1` (Specification & Architecture Explorer)  
**Target Milestone:** Milestone 3 — SunaHarness Interactive UI Visualizer & IndexedDB Checkpoint Persistence (R3)  
**Target Codebase:** `d:\Suna Chat\suna_harness.js` (Core Engine), `d:\Suna Chat\app.js` (UI Bridge), `tests/test_suna_harness.js` (E2E Test Suite)  
**Dependencies:** Pure ECMAScript UMD, Zero external npm packages, Dual Node.js/Browser compatibility  
**Status:** DEFINITIVE ARCHITECTURAL STRATEGY & CONTRACT SPECIFICATION  

---

## Table of Contents
1. [Executive Summary & Architectural Scope](#1-executive-summary--architectural-scope)
2. [Component 1: SunaHarnessVisualizer (DOM UI Visualizer)](#2-component-1-sunaharnessvisualizer-dom-ui-visualizer)
   - [2.1 Architectural Goals & Lifecycle](#21-architectural-goals--lifecycle)
   - [2.2 Sub-View 1: Hierarchical Trajectory Tree Viewer](#22-sub-view-1-hierarchical-trajectory-tree-viewer)
   - [2.3 Sub-View 2: Benchmark Scorecard Display](#23-sub-view-2-benchmark-scorecard-display)
   - [2.4 Sub-View 3: Interactive Diff Viewer (Unified & Side-by-Side)](#24-sub-view-3-interactive-diff-viewer-unified--side-by-side)
   - [2.5 Headless & Node.js Test Environment Resilience](#25-headless--nodejs-test-environment-resilience)
   - [2.6 Styling System & Zen Dark Theme Alignment](#26-styling-system--zen-dark-theme-alignment)
3. [Component 2: IndexedDbCheckpointStore (Persistence Engine)](#3-component-2-indexeddbcheckpointstore-persistence-engine)
   - [3.1 Database Schema & Object Store Architecture](#31-database-schema--object-store-architecture)
   - [3.2 Asynchronous Promise API Contract](#32-asynchronous-promise-api-contract)
   - [3.3 Seamless Node.js Fallback (InMemoryIdbFallback)](#33-seamless-nodejs-fallback-inmemoryidbfallback)
   - [3.4 Integration with CheckpointManager](#34-integration-with-checkpointmanager)
4. [Integration Points in `suna_harness.js` & `app.js`](#4-integration-points-in-suna_harnessjs--appjs)
5. [Comprehensive Test Plan & Quality Gates](#5-comprehensive-test-plan--quality-gates)
6. [Worker Implementation Checklist](#6-worker-implementation-checklist)

---

## 1. Executive Summary & Architectural Scope

Milestone 3 fulfills requirement **R3** of `ORIGINAL_REQUEST.md`:
> **R3. Giao Diện Trực Quan Hóa UI Visualizer & Lưu Trữ Bền Vững Checkpoint (Interactive Visualizer & Persistence)**  
> - **Component trực quan hóa DOM (`SunaHarnessVisualizer`)**: Xây dựng module hiển thị giao diện trực quan nhúng trong SunaChat, cho phép người dùng mở xem:
>   - Cây chuỗi sự kiện Trajectory (Thought, Action, Tool Params, Output, Duration, Token Cost) với khả năng lọc theo cấp độ hoặc sub-agent.
>   - Bảng điểm Benchmark Scorecard trực quan với biểu đồ đo lường Success Rate ($SR$), Step Efficiency ($\eta$) và Fault Recovery Rate ($FRR$).
>   - Trình hiển thị Diff trực quan (Side-by-side hoặc Unified Diff với màu sắc highlight cú pháp).
> - **Lưu trữ Checkpoint bền vững vào IndexedDB (`IndexedDbCheckpointStore`)**: Cung cấp khả năng xuất và nhập toàn bộ trạng thái snapshot VFS cùng lịch sử Checkpoint vào IndexedDB (`suna_harness_checkpoints_<uid>`) để người dùng có thể tải lại trang hoặc mở lại phiên làm việc trong tương lai mà không bị mất dữ liệu.

### Key Constraints & Design Principles:
1. **Pure Vanilla JavaScript**: Zero external runtime dependencies (no React, Vue, D3, Chart.js, or `fake-indexeddb`). Everything is constructed via standard DOM APIs and pure CSS/SVG.
2. **Dual-Environment Resilience (Zero Regression)**:
   - In browser: Mounts cleanly into DOM containers, binds interactive events, dynamically applies scoped styles.
   - In Node.js / Headless test suites: Executes without throwing `ReferenceError: document is not defined` or `ReferenceError: indexedDB is not defined`. Provides a high-fidelity in-memory mock fallback and `renderToString()` HTML generation.
3. **Strict Aesthetic Compliance (`taste-skill`)**:
   - Matches SunaChat's Zen Dark / Ink Charcoal design language (`--bg-primary: #0d0b14`, `--bg-secondary: #14121e`, `--text-primary: #e0e0e0`, `--accent-1: #e8a87c`, monospace JetBrains Mono).
   - High information density without visual clutter, crisp micro-borders (`rgba(255, 255, 255, 0.08)`), accessible contrast ($\ge 4.5:1$).
4. **Non-Breaking Extension**:
   - `suna_harness.js` maintains 100% backward compatibility with all 1166 passing Mocha tests.

---

## 2. Component 1: SunaHarnessVisualizer (DOM UI Visualizer)

```
+--------------------------------------------------------------------------------------------------+
|                                    SunaHarnessVisualizer                                         |
+--------------------------------------------------------------------------------------------------+
|  [Tab: Trajectory Tree (🌲)]    [Tab: Benchmark Scorecard (📊)]    [Tab: VFS Diff Viewer (⚖️)]   |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
| [1. TRAJECTORY TREE VIEW]                                                                        |
| Toolbar: [Filter Agent: All ▼] [Depth: All ▼] [Status: All ▼] [Search: "replace" 🔍] [Expand All]|
| ├── Step 1 [ROOT] `list_dir` PASS (12ms, 45 tokens)                                              |
| │   ├── Thought: "Inspecting root workspace structure..."                                        |
| │   └── Params: { DirectoryPath: "." } -> Observation: 4 files found                             |
| └── Step 2 [ROOT] `spawnSubHarness` PASS (145ms, 820 tokens)                                     |
|     ├── Step 2.1 [WORKER] `view_file` PASS (18ms, 120 tokens)                                    |
|     └── Step 2.2 [WORKER] `replace_file_content` PASS (32ms, 210 tokens) [View Diff Button]       |
|                                                                                                  |
| [2. BENCHMARK SCORECARD VIEW]                                                                    |
| Metric Cards:                                                                                    |
| +--------------------+ +--------------------+ +--------------------+ +--------------------+       |
| | Success Rate (SR)  | | Step Efficiency(η) | | Fault Recovery(FRR)| | Tasks Completed    |       |
| |       95.0%        | |       88.5%        | |       100.0%       | |      19 / 20       |       |
| | [██████████████░░] | | [█████████████░░░] | | [████████████████] | | Tier 1 - Tier 5  |       |
| +--------------------+ +--------------------+ +--------------------+ +--------------------+       |
| Task Breakdown Table:                                                                            |
| [Tier 1] Surgical Code Patching (optimal: 2, actual: 2) -> 100% [PASS]                           |
| [Tier 2] Multi-File Navigation  (optimal: 3, actual: 3) -> 100% [PASS]                           |
|                                                                                                  |
| [3. INTERACTIVE DIFF VIEWER]                                                                     |
| Toolbar: Mode: [Unified Diff | Side-by-Side] | File: [src/app.js ▼] | Stats: (+12, -4) | [Copy]  |
| Mode A: Unified View                          Mode B: Side-by-Side (Split) View                  |
| @@ -14,4 +14,5 @@                             Old (Base)               New (Head)                |
|  function render() {                         14  function render() {  14  function render() {   |
| -  console.log("legacy");                    15 -console.log("legacy") 15 +console.log("v2")    |
| +  console.log("v2");                        16   return true;         16 +  initWatchers();     |
| +  initWatchers();                                                     17   return true;         |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

### 2.1 Architectural Goals & Lifecycle

`SunaHarnessVisualizer` is a self-contained, embeddable component. It can be mounted directly into any DOM element (e.g. inside SunaChat Live Workspace `#artifact-preview-container`, a modal overlay, or an independent container) or used headless in Node.js test runs.

#### Visualizer Constructor & Options:
```typescript
interface VisualizerOptions {
  container?: HTMLElement | string; // Target element or CSS selector
  theme?: 'dark' | 'light' | 'auto'; // Default: 'dark' (matches SunaChat ink theme)
  activeTab?: 'trajectory' | 'scorecard' | 'diff'; // Default: 'trajectory'
  harness?: any; // Optional SunaHarness instance to bind automatically
  trajectoryEngine?: any; // Optional TrajectoryEngine instance
  benchmarkSuite?: any; // Optional BenchmarkSuite instance
  document?: Document; // Injected document for headless/jsdom testing
}
```

#### Visualizer Public API:
```javascript
class SunaHarnessVisualizer {
  constructor(options = {}) { ... }

  // Lifecycle
  mount(containerOrSelector) // Mounts visualizer to DOM
  unmount()                  // Cleans up event listeners and detaches DOM
  destroy()                  // Alias for unmount

  // Navigation & View Control
  setActiveTab(tabName)      // Switches between 'trajectory', 'scorecard', 'diff'
  getActiveTab()             // Returns current active tab name
  
  // Data Setters & Bindings
  setTrajectory(eventsOrTree) // Ingests trajectory data (flat array or hierarchical tree)
  setBenchmarkResults(results, metrics) // Ingests benchmark evaluation data
  setDiff(diffTextOrOptions) // Ingests raw unified diff string or { oldText, newText, oldPath, newPath }

  // Rendering & Output
  render()                   // Re-renders the current view into container
  renderToString()           // Generates self-contained HTML markup string (for SSR/testing)
  
  // Utility & Event Helpers
  on(event, handler)         // Subscribes to UI events ('node-click', 'diff-view', 'tab-change')
}
```

---

### 2.2 Sub-View 1: Hierarchical Trajectory Tree Viewer

The Trajectory Tree visualizes the multi-agent execution pipeline. It consumes data from `TrajectoryEngine.getHierarchicalTree()` and `TrajectoryEngine.getFlattenedTimeline()`.

#### Key Features:
1. **Hierarchical Indentation & Tree Connectors**:
   - Root nodes (`depth === 0`) render as primary cards.
   - Child sub-agent nodes (`depth > 0`) render indented with left-border tree branching lines (`│  ├── ` visual connectors).
2. **Filtering & Search Controls**:
   - **Role / Agent Filter**: Dropdown with options `[All Agents]`, `[root]`, `[worker]`, `[reviewer]`, etc., populated dynamically from observed events.
   - **Depth Filter**: Dropdown `[All Depths]`, `[Level 0 (Parent)]`, `[Level 1+]`.
   - **Status Filter**: `[All Status]`, `[Success Only]`, `[Failed Only]`.
   - **Live Search**: Text input filtering nodes by thought text, tool name, or parameter keys.
   - **Expand/Collapse All**: Toggle button expanding or collapsing all details at once.
3. **Node Card Components**:
   - **Step Indicator**: Hierarchical numbering badge (e.g. `1`, `2.1`, `2.2.1`).
   - **Role Chip**: Color-coded badge (`[ROOT]` in cyan `#38bdf8`, `[WORKER]` in amber `#fbbf24`, `[REVIEWER]` in purple `#c084fc`).
   - **Tool & Action**: Monospace tag `view_file`, `replace_file_content`, `spawnSubHarness`.
   - **Status Pill**: `PASS` (emerald green) or `FAIL` (rose red).
   - **Execution Metrics**: Duration badge (`32ms`) and Token Cost badge (`210 tok`).
   - **Collapsible Body**:
     - *Thought block*: Styled callout with thought bubble icon (`💬`).
     - *Parameters block*: Syntax-highlighted collapsible JSON viewer.
     - *Observation block*: Preformatted output viewer with error highlighting.
     - *Contextual Action Button*: When the tool is `replace_file_content`, renders a `"Inspect Diff"` button that automatically switches to the Diff Viewer with this step's patch!

#### HTML DOM Structure (Generated):
```html
<div class="suna-visualizer-container suna-theme-dark">
  <div class="suna-viz-navbar">
    <button class="suna-tab-btn active" data-tab="trajectory">🌲 Trajectory Tree</button>
    <button class="suna-tab-btn" data-tab="scorecard">📊 Benchmark Scorecard</button>
    <button class="suna-tab-btn" data-tab="diff">⚖️ VFS Diff Viewer</button>
  </div>

  <div class="suna-viz-body">
    <div class="suna-view-trajectory">
      <!-- Toolbar -->
      <div class="suna-traj-toolbar">
        <div class="suna-filter-group">
          <label>Agent:</label>
          <select class="suna-select-agent"><option value="">All Agents</option></select>
        </div>
        <div class="suna-filter-group">
          <label>Depth:</label>
          <select class="suna-select-depth">
            <option value="">All Depths</option>
            <option value="0">Root Only</option>
            <option value="1+">Sub-agents (1+)</option>
          </select>
        </div>
        <div class="suna-filter-group">
          <label>Status:</label>
          <select class="suna-select-status">
            <option value="">All Status</option>
            <option value="success">Pass Only</option>
            <option value="fail">Fail Only</option>
          </select>
        </div>
        <input type="text" class="suna-input-search" placeholder="Search thought / tool / output...">
        <div class="suna-btn-group">
          <button class="suna-btn-sm btn-expand-all">Expand All</button>
          <button class="suna-btn-sm btn-collapse-all">Collapse All</button>
        </div>
      </div>

      <!-- Tree Nodes List -->
      <div class="suna-traj-tree-list">
        <!-- Node Item -->
        <div class="suna-traj-node depth-0 status-success" data-step-id="evt_step_1">
          <div class="suna-node-header">
            <span class="suna-expander-caret">▼</span>
            <span class="suna-badge-step">#1</span>
            <span class="suna-badge-role role-root">[ROOT]</span>
            <span class="suna-tool-name">list_dir</span>
            <span class="suna-badge-status status-pass">PASS</span>
            <span class="suna-badge-metrics">12ms · 45 tokens</span>
          </div>
          <div class="suna-node-body">
            <div class="suna-thought-block">
              <span class="suna-icon">💬</span>
              <em>Inspecting root workspace structure...</em>
            </div>
            <div class="suna-params-block">
              <span class="suna-section-title">Parameters:</span>
              <pre><code>{ "DirectoryPath": "." }</code></pre>
            </div>
            <div class="suna-observation-block">
              <span class="suna-section-title">Observation:</span>
              <pre><code>[{"name":"index.html","type":"file","size":1240}]</code></pre>
            </div>
          </div>
        </div>
        <!-- Child sub-agent nodes follow with depth-1 indentation -->
      </div>
    </div>
  </div>
</div>
```

---

### 2.3 Sub-View 2: Benchmark Scorecard Display

The Benchmark Scorecard visualizes agent evaluation metrics from `EvaluationRunner.calculateMetrics()` across the 20 benchmark tasks and 5 complexity tiers.

#### Visual Layout:
1. **KPI Metric Summary Cards**:
   - **Success Rate ($SR$)**: Card displaying percentage (e.g. `95.0%`), pass count (`19/20 Passed`), and progress gauge bar. Color threshold: Green ($\ge 90\%$), Amber ($70\% - 89\%$), Red ($< 70\%$).
   - **Step Efficiency ($\eta$)**: Card displaying average ratio of optimal steps to actual steps (e.g. `88.5%`), indicating whether the agent takes surgical vs runaway paths.
   - **Fault Recovery Rate ($FRR$)**: Percentage of injected chaos faults (network drops, rate limits, locked files) that the agent autonomously recovered from (e.g. `100.0%`).
   - **Zero-Progress Guardrail Accuracy**: Precision score for detecting infinite loops and semantic stalls.
2. **Pure Vanilla JS / CSS Stacked Progress Bars**:
   - Zero external charting libraries. Each tier progress bar is constructed using native CSS flex boxes:
     ```html
     <div class="suna-progress-bar">
       <div class="suna-progress-fill bg-emerald" style="width: 95%"></div>
     </div>
     ```
3. **Interactive 5-Tier Breakdown Table**:
   - Columns: `Tier`, `Domain`, `Tasks Count`, `Passed`, `Avg Steps`, `Step Eff. (η)`, `Status`.
   - Expandable rows showing task-level breakdown (`id`, `name`, `optimalSteps`, `actualSteps`, `durationMs`, `reason`).
   - Tier filter buttons (`All`, `Tier 1: Code Editing`, `Tier 2: Exploration`, `Tier 3: Algorithmic`, `Tier 4: Tool Chains`, `Tier 5: Chaos`).

---

### 2.4 Sub-View 3: Interactive Diff Viewer (Unified & Side-by-Side)

The Diff Viewer renders output from `VfsDiffEngine.createUnifiedDiff()` or snapshot comparisons with GitHub-grade syntax highlighting.

#### Diff Data Parser:
The visualizer includes a lightweight, zero-dependency Unified Diff Parser that takes a standard Git patch string and outputs structured hunks:
```javascript
function parseUnifiedDiff(diffText) {
  const files = [];
  let currentFile = null;
  let currentHunk = null;
  const lines = diffText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('--- ')) {
      currentFile = { oldPath: line.slice(4).trim(), newPath: '', hunks: [] };
      files.push(currentFile);
    } else if (line.startsWith('+++ ') && currentFile) {
      currentFile.newPath = line.slice(4).trim();
    } else if (line.startsWith('@@ ') && currentFile) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      currentHunk = {
        header: line,
        oldStart: match ? parseInt(match[1], 10) : 1,
        oldCount: match ? (match[2] ? parseInt(match[2], 10) : 1) : 0,
        newStart: match ? parseInt(match[3], 10) : 1,
        newCount: match ? (match[4] ? parseInt(match[4], 10) : 1) : 0,
        lines: []
      };
      currentFile.hunks.push(currentHunk);
    } else if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add', text: line.slice(1) });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'del', text: line.slice(1) });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'context', text: line.slice(1) });
      } else if (line.startsWith('\\ No newline')) {
        currentHunk.lines.push({ type: 'eof', text: line });
      }
    }
  }
  return files;
}
```

#### Dual Viewing Modes:
1. **Mode A: Unified Diff View**:
   - Single-table layout.
   - Columns: `[Old Line #] [New Line #] [Prefix (+/-)] [Code Text]`.
   - Added lines: Background `rgba(34, 197, 94, 0.15)`, text `#4ade80`, gutter `+`.
   - Deleted lines: Background `rgba(239, 68, 68, 0.15)`, text `#f87171`, gutter `-`.
   - Context lines: Background transparent, text `#e0e0e0`.
   - Hunk headers: Background `rgba(56, 189, 248, 0.12)`, text `#38bdf8`, spanning all columns.

2. **Mode B: Side-by-Side (Split) Diff View**:
   - Two-column layout: Left (Original / Base) vs Right (Modified / Head).
   - Line alignment algorithm:
     - When a block of deletions is followed by a block of additions, the lines are paired row-by-row.
     - If deletions > additions, the right side renders empty spacer rows (`suna-diff-spacer`) with diagonal hatch or dimmed background.
     - If additions > deletions, the left side renders empty spacer rows.
   - Synchronized horizontal and vertical scrolling between left and right code panes.

3. **Interactive Controls**:
   - **Mode Switcher Toggle**: Segmented control `[ Unified | Split ]`.
   - **File Selector Dropdown**: For multi-file patches, switch between files with badge showing `(+A, -D)` counts per file.
   - **Copy Patch Button**: Copies raw unified diff to system clipboard with visual toast feedback.

---

### 2.5 Headless & Node.js Test Environment Resilience

In automated Mocha test suites (`npm test`) or headless CI environments, `window` or `document` may not exist globally. `SunaHarnessVisualizer` is built with a dual-execution safety layer:

1. **In-Memory DOM Mock Element (`createMockElement`)**:
   When `typeof document === 'undefined'`, the visualizer instantiates lightweight mock DOM nodes that implement the standard Element interface:
   - Properties: `tagName`, `className`, `classList` (`add`, `remove`, `contains`, `toggle`), `style` (object map), `innerHTML`, `textContent`, `children` (array), `parentNode`, `dataset` (object map).
   - Methods: `appendChild(child)`, `removeChild(child)`, `querySelector(sel)`, `querySelectorAll(sel)`, `addEventListener(evt, fn)`, `removeEventListener(evt, fn)`, `setAttribute(k, v)`, `getAttribute(k)`.
2. **`renderToString()` Method**:
   Provides an explicit method returning the complete, well-formed HTML string of the current state. This allows test assertions (`assert(html.includes('suna-traj-node'))`) and server-side rendering without any browser dependencies.

---

### 2.6 Styling System & Zen Dark Theme Alignment

The visualizer includes an integrated, isolated CSS stylesheet injected once into `<head>` (or container). All classes use the `.suna-viz-*` prefix to prevent collision with SunaChat's global styles.

```css
/* Color & Theme Variables inherited from SunaChat */
.suna-visualizer-container {
  --suna-bg-base: var(--bg-primary, #0d0b14);
  --suna-bg-surface: var(--bg-secondary, #14121e);
  --suna-bg-card: rgba(255, 255, 255, 0.03);
  --suna-border: rgba(255, 255, 255, 0.08);
  --suna-text: var(--text-primary, #e0e0e0);
  --suna-text-muted: var(--text-muted, #8e8a9e);
  --suna-accent: var(--accent-1, #e8a87c);
  --suna-pass: #10b981;
  --suna-fail: #ef4444;
  --suna-info: #38bdf8;
  --suna-font-mono: var(--font-code, 'JetBrains Mono', monospace);
  font-family: var(--font-main, 'Satoshi', 'Outfit', sans-serif);
  color: var(--suna-text);
  background: var(--suna-bg-base);
  border: 1px solid var(--suna-border);
  border-radius: 12px;
  overflow: hidden;
}
```

---

## 3. Component 2: IndexedDbCheckpointStore (Persistence Engine)

```
+--------------------------------------------------------------------------------------------------+
|                                  IndexedDbCheckpointStore                                        |
+--------------------------------------------------------------------------------------------------+
| Environment Detection:                                                                           |
|   ├── Browser with window.indexedDB?  ──> Real IndexedDB Engine                                  |
|   └── Headless / Node.js runtime?     ──> InMemoryIdbFallback (Zero External Dependencies)       |
+--------------------------------------------------------------------------------------------------+
| Database Name: `suna_harness_checkpoints_<uid>` (Version: 1)                                     |
|                                                                                                  |
| [Object Store: 'snapshots'] (keyPath: 'checkpointId')                                            |
| Indexes:                                                                                         |
|   ├── 'by_stepIndex': stepIndex (non-unique, integer)                                            |
|   └── 'by_timestamp': timestamp (non-unique, ISO string)                                         |
| Value Record:                                                                                    |
|   {                                                                                              |
|     checkpointId: "chk_step_3_1725721200000",                                                    |
|     id: "chk_step_3_1725721200000",                                                              |
|     uid: "user_alice",                                                                           |
|     stepIndex: 3,                                                                                |
|     timestamp: "2026-09-07T15:00:00.000Z",                                                       |
|     epochMs: 1725721200000,                                                                      |
|     vfsState: { "index.html": "<!DOCTYPE html>...", "app.js": "console.log('hi');" },            |
|     contextMemory: { facts: ["user prefers typescript"] },                                       |
|     metadata: { label: "post-refactor", agent: "worker_1" },                                     |
|     byteSize: 4520                                                                               |
|   }                                                                                              |
|                                                                                                  |
| [Object Store: 'metadata'] (keyPath: 'key')                                                      |
| Keys:                                                                                            |
|   └── 'session_info': {                                                                          |
|         key: 'session_info',                                                                     |
|         uid: "user_alice",                                                                       |
|         lastCheckpointId: "chk_step_3_1725721200000",                                            |
|         latestStepIndex: 3,                                                                      |
|         checkpointCount: 3,                                                                      |
|         createdAt: "2026-09-07T14:30:00.000Z",                                                   |
|         updatedAt: "2026-09-07T15:00:00.000Z"                                                    |
|       }                                                                                          |
+--------------------------------------------------------------------------------------------------+
```

### 3.1 Database Schema & Object Store Architecture

1. **Database Naming Convention**:
   `suna_harness_checkpoints_<uid>`
   - `<uid>` is dynamic and sanitized (e.g. `guest_default`, `user_8f92a1`, `session_xyz`).
   - Ensures strict multi-tenant isolation: different users or sessions never overwrite or leak snapshots into each other.
2. **Database Version**: `1`.
3. **Object Store 1: `snapshots`**:
   - `keyPath`: `'checkpointId'` (string).
   - Index 1: `'by_stepIndex'` (keyPath: `'stepIndex'`, options: `{ unique: false }`). Allows fast range scanning (`IDBKeyRange.bound(1, 10)`).
   - Index 2: `'by_timestamp'` (keyPath: `'timestamp'`, options: `{ unique: false }`).
4. **Object Store 2: `metadata`**:
   - `keyPath`: `'key'` (string).
   - Stores session pointers, active branch metadata, and global storage statistics.

---

### 3.2 Asynchronous Promise API Contract

All operations return clean, native JavaScript Promises.

```typescript
class IndexedDbCheckpointStore {
  constructor(options?: { prefix?: string; idbFactory?: IDBFactory; uid?: string });

  // Database Connection Management
  initDB(uid?: string): Promise<IDBDatabase>;
  closeDB(uid?: string): Promise<void>;
  deleteDatabase(uid?: string): Promise<{ success: boolean }>;

  // Snapshot Persistence (CRUD)
  saveCheckpoint(uid: string, checkpoint: CheckpointData): Promise<{ success: boolean; checkpointId: string; uid: string }>;
  loadCheckpoints(uid: string, options?: { fromStep?: number; toStep?: number; limit?: number; ascending?: boolean }): Promise<CheckpointSnapshotRecord[]>;
  getCheckpoint(uid: string, checkpointId: string): Promise<CheckpointSnapshotRecord | null>;
  getCheckpointByStep(uid: string, stepIndex: number): Promise<CheckpointSnapshotRecord | null>;
  deleteCheckpoint(uid: string, checkpointId: string): Promise<{ success: boolean }>;
  clearCheckpoints(uid: string): Promise<{ success: boolean; clearedCount: number }>;

  // Metadata Operations
  getMetadata(uid: string, key: string): Promise<any>;
  setMetadata(uid: string, key: string, value: any): Promise<{ success: boolean }>;

  // Session Packaging & Portability
  exportSession(uid: string): Promise<{ uid: string; exportedAt: string; metadata: Record<string, any>; checkpoints: CheckpointSnapshotRecord[] }>;
  importSession(uid: string, sessionData: any, options?: { overwrite?: boolean }): Promise<{ success: boolean; importedCount: number }>;

  // Compatibility Aliases (as requested in ORIGINAL_REQUEST.md)
  saveCheckpointToIndexedDB(uid: string, checkpoint: any): Promise<any>;
  loadCheckpointsFromIndexedDB(uid: string): Promise<any>;
  clearIndexedDB(uid: string): Promise<any>;
}
```

---

### 3.3 Seamless Node.js Fallback (InMemoryIdbFallback)

A critical requirement is that running `npm test` in Node.js must not fail because `window.indexedDB` is undefined. We deliberately avoid pulling in external npm packages like `fake-indexeddb` to prevent dependency bloat.

Instead, `IndexedDbCheckpointStore` incorporates an internal `InMemoryIdbFallback`:
1. **Detection**:
   ```javascript
   function hasIndexedDB() {
     return typeof indexedDB !== 'undefined' && indexedDB !== null;
   }
   ```
2. **Fallback Store Structure**:
   ```javascript
   class InMemoryIdbFallback {
     constructor() {
       // Map of dbName -> { snapshots: Map<checkpointId, record>, metadata: Map<key, record> }
       this.databases = new Map();
     }
     
     _getDb(name) {
       if (!this.databases.has(name)) {
         this.databases.set(name, {
           snapshots: new Map(),
           metadata: new Map()
         });
       }
       return this.databases.get(name);
     }
     
     async saveCheckpoint(dbName, record) { ... }
     async loadCheckpoints(dbName, options) { ... }
     async getCheckpoint(dbName, id) { ... }
     async clear(dbName) { ... }
   }
   ```
3. **Behavioral Equivalence**:
   - Asynchronous execution via `Promise.resolve()`.
   - Strict sorting by `stepIndex`.
   - Deep cloning on write and read to prevent shared reference mutation.
   - Complete parity with real IndexedDB behavior.

---

### 3.4 Integration with CheckpointManager

`CheckpointManager` in `suna_harness.js` currently manages in-memory state snapshots. In Milestone 3, `CheckpointManager` is enhanced to optionally synchronize snapshots to `IndexedDbCheckpointStore`:

```javascript
class CheckpointManager {
  constructor(options = {}) {
    // Existing initialization...
    this.storageAdapter = options.storageAdapter || null;
    this.uid = options.uid || 'default';
  }

  setStorageAdapter(adapter, uid = 'default') {
    this.storageAdapter = adapter;
    this.uid = uid;
  }

  // Dual-layer save: in-memory + IndexedDB
  async persistCheckpoint(stepIndex, memoryOrMetadata = {}) {
    const chkId = this.saveCheckpoint(stepIndex, memoryOrMetadata);
    const chk = this.getCheckpoint(stepIndex);
    if (this.storageAdapter && typeof this.storageAdapter.saveCheckpoint === 'function') {
      await this.storageAdapter.saveCheckpoint(this.uid, chk);
    }
    return chkId;
  }

  // Restores all checkpoints from IndexedDB into in-memory manager
  async loadPersistedCheckpoints(uid = null) {
    const targetUid = uid || this.uid;
    if (!this.storageAdapter) return [];
    const persisted = await this.storageAdapter.loadCheckpoints(targetUid);
    persisted.forEach(chk => {
      this.checkpoints.set(chk.step_index || chk.stepIndex, chk);
      if (!this.checkpointOrder.includes(chk.checkpoint_id || chk.checkpointId)) {
        this.checkpointOrder.push(chk.checkpoint_id || chk.checkpointId);
      }
    });
    return persisted;
  }

  // Rewinds VFS state to a snapshot stored in IndexedDB
  async restoreFromIndexedDB(stepIndex, uid = null) {
    const targetUid = uid || this.uid;
    if (!this.storageAdapter) throw new Error('No storage adapter configured');
    const chk = await this.storageAdapter.getCheckpointByStep(targetUid, stepIndex);
    if (!chk) throw new HarnessError('CHECKPOINT_NOT_FOUND', `Snapshot for step ${stepIndex} not found in IndexedDB`);
    
    // Restore into VFS
    const files = chk.vfs_snapshot || chk.vfsSnapshot || chk.vfsState || {};
    this.vfs.restoreSnapshot({ files, directories: [] });
    return chk;
  }
}
```

---

## 4. Integration Points in `suna_harness.js` & `app.js`

### 4.1 In `suna_harness.js`:
1. **Class Placements**:
   - `IndexedDbCheckpointStore` placed right after `CheckpointManager` (around line 4605).
   - `SunaHarnessVisualizer` placed after `EvaluationRunner` (around line 5716).
2. **Export Declarations in `SunaHarness` Root Facade**:
   ```javascript
   const SunaHarness = {
     // Existing exports...
     IndexedDbCheckpointStore,
     CheckpointStore: IndexedDbCheckpointStore,
     IndexedDBStore: IndexedDbCheckpointStore,
     
     SunaHarnessVisualizer,
     Visualizer: SunaHarnessVisualizer,
     UIVisualizer: SunaHarnessVisualizer,
     
     // Factory functions
     createVisualizer: (options) => new SunaHarnessVisualizer(options),
     createCheckpointStore: (options) => new IndexedDbCheckpointStore(options)
   };
   ```
3. **In `createHarness(options)`**:
   - If `options.uid` or `options.enablePersistence` is set, instantiate `IndexedDbCheckpointStore` and link to `CheckpointManager`.
   - Attach `harness.visualizer = new SunaHarnessVisualizer({ harness })`.

### 4.2 In `app.js`:
- In `bridgeSunaHarness()` (around line 4280):
  Ensure `SunaAgent.harness.Visualizer` and `SunaAgent.harness.CheckpointStore` are made accessible to window and SunaChat UI actions.

---

## 5. Comprehensive Test Plan & Quality Gates

The test suite will be integrated into `tests/test_suna_harness.js` under Tier 1, Tier 2, and Tier 3 sections to verify 100% of Milestone 3 capabilities:

### Test Suites Matrix:

| Test Group | Target Component | Test Case Count | Description |
|---|---|---|---|
| **Group 1** | `SunaHarnessVisualizer: Trajectory Tree` | 8 tests | - Render empty trajectory without crash<br>- Render flat trajectory steps with badges<br>- Render multi-agent hierarchical tree<br>- Filter by agent role/id<br>- Filter by depth level<br>- Filter by pass/fail status<br>- Live search filtering<br>- HTML entity escaping (XSS protection) |
| **Group 2** | `SunaHarnessVisualizer: Scorecard` | 7 tests | - Render KPI cards ($SR$, $\eta$, $FRR$)<br>- Render 5-tier breakdown table<br>- Progress bar width calculations<br>- Handling 0 tasks / zero division<br>- Color-coding threshold rules<br>- Interactive tier filtering<br>- Task detail row expansion |
| **Group 3** | `SunaHarnessVisualizer: Diff Viewer` | 9 tests | - Parse raw unified Git diff into hunks<br>- Render unified view with +/- lines<br>- Render side-by-side split view with line pairing<br>- Spacer line insertion for deletions/additions<br>- Multi-file dropdown switching<br>- Diff stats computation (+X, -Y)<br>- Unified vs Split mode toggling<br>- Copy patch to clipboard handler<br>- 10,000-line diff stress rendering |
| **Group 4** | `IndexedDbCheckpointStore: Lifecycle & CRUD` | 10 tests | - Database initialization (`suna_harness_checkpoints_<uid>`)<br>- Snapshot saving with all metadata and VFS files<br>- Loading checkpoints sorted by stepIndex<br>- Querying by checkpointId<br>- Querying by stepIndex index<br>- Deleting single checkpoint<br>- Clearing all checkpoints for UID<br>- Multi-tenant UID isolation (user A != user B)<br>- Metadata get/set session_info<br>- Database closure and deletion |
| **Group 5** | `IndexedDbCheckpointStore: Export/Import` | 6 tests | - Export complete session to serializable JSON<br>- Import session from JSON with fidelity<br>- Handling invalid or corrupt import JSON<br>- Overwrite existing vs merge modes<br>- Preserving timestamps and step indices<br>- Session integrity hash validation |
| **Group 6** | `CheckpointManager Persistence Integration` | 6 tests | - `persistCheckpoint()` dual-write<br>- `loadPersistedCheckpoints()` rehydration<br>- `restoreFromIndexedDB()` VFS rollback<br>- Handling missing checkpoints gracefully<br>- Time-travel replay with persisted snapshots<br>- Automatic sync on harness step completion |
| **Group 7** | `Node.js Fallback & Headless Resilience` | 6 tests | - Seamless execution when `window.indexedDB` is undefined<br>- Headless visualizer `renderToString()` returns valid HTML<br>- DOM mock element simulation fidelity<br>- In-memory fallback cleanup between test runs<br>- Zero unhandled promise rejections |
| **Group 8** | `Adversarial Fuzzing & Boundary Cases` | 8 tests | - Malformed diff strings / missing headers<br>- Deep trajectory nesting ($\ge 6$ levels)<br>- Extreme snapshot sizes (>5MB VFS payload)<br>- Quota exhaustion recovery simulation<br>- Special characters and Vietnamese UTF-8 diacritics in thoughts/diffs<br>- Rapid concurrent persistence requests |

---

## 6. Worker Implementation Checklist

For implementer agents (`worker_m3` / `worker_impl`):

- [ ] **Step 1: Implement `IndexedDbCheckpointStore` in `suna_harness.js`**:
  - Add `InMemoryIdbFallback` class.
  - Add `IndexedDbCheckpointStore` class with full Promise CRUD, indexes, export/import.
  - Provide compatibility aliases `saveCheckpointToIndexedDB`, `loadCheckpointsFromIndexedDB`, `clearIndexedDB`.
- [ ] **Step 2: Augment `CheckpointManager` in `suna_harness.js`**:
  - Add `setStorageAdapter()`, `persistCheckpoint()`, `loadPersistedCheckpoints()`, `restoreFromIndexedDB()`.
- [ ] **Step 3: Implement `SunaHarnessVisualizer` in `suna_harness.js`**:
  - Implement unified diff parser (`parseUnifiedDiff`).
  - Implement Trajectory Tree viewer with filters and connectors.
  - Implement Benchmark Scorecard viewer with KPI cards and tier breakdown table.
  - Implement Interactive Diff Viewer (Unified & Side-by-Side modes).
  - Implement `createMockElement` and `renderToString()` for Node.js headless environments.
- [ ] **Step 4: Update `SunaHarness` Root Facade**:
  - Export `IndexedDbCheckpointStore`, `SunaHarnessVisualizer`, factory helpers.
  - Wire into `createHarness()`.
- [ ] **Step 5: Write Comprehensive Test Suite**:
  - Add Milestone 3 test suites into `tests/test_suna_harness.js`.
- [ ] **Step 6: Execute Quality Gates**:
  - Run `npm test` -> Verify 100% pass (exceeding 1,200+ passing tests).
  - Run `npm run check` (`node -c suna_harness.js && node -c app.js && node -c redesign.js`) -> 0 syntax errors.
  - Zero regression on existing features.
