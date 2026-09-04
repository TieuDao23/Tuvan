# Project: DeepSeek Harness (dsh) Integration for SunaChat (SunaAgent)

## Architecture
SunaChat is an autonomous client-side agent web application. The DeepSeek Harness (dsh) architecture transforms `SunaAgent` in `app.js` into an extensible, plugin-based agent featuring a Modular Tool Registry ("Everything is a Plugin"), a sandbox execution engine, a virtual workspace file system (VFS), long-term semantic memory retrieval, tabular & visual analytics, an autonomous multi-step ReAct loop with recursion guards, and an Explainable AI Trajectory View styled with Zen Glassmorphism.

```
+----------------------------------------------------------------------------------------------------+
|                                    SunaChat Client Architecture                                     |
+----------------------------------------------------------------------------------------------------+
                                                  │
                 [User Message in Chat Bubble or Live Workspace Assistant]
                                                  │
                         ▼                                                ▼
     ┌───────────────────────────────────────┐        ┌──────────────────────────────────────┐
     │          buildSystemPrompt()          │        │        StreamParser (<suna_tool_call>)│
     │ - Model instructions & Zen persona    │        │ - Filters display text               │
     │ - SunaAgent.generatePromptDocs()      │        │ - Extracts raw tool calls & args     │
     └───────────────────────────────────────┘        └──────────────────────────────────────┘
                         │                                                │
                         ▼                                                ▼
     ┌───────────────────────────────────────────────────────────────────────────────────────┐
     │                   Autonomous Multi-Step ReAct Engine (Vòng Lặp Đa Bước)                │
     │ 1. Think: Extracts thought chain & intent                                             │
     │ 2. Action: Validates parameters against JSON schema & executes via Tool Registry      │
     │ 3. Observation: Captures tool result or error, records trajectory step                │
     │ 4. Recurse / Final Answer: Recursion depth guard (<=4), abort safety, error recovery  │
     └───────────────────────────────────────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
     ┌───────────────────────────────────────────────────────────────────────────────────────┐
     │                   Modular Tool Registry (Cordis / DSH Plugin Architecture)             │
     │ SunaAgent.registerTool(tool) | unregisterTool(name) | listTools() | executeTool()      │
     ├───────────────────────────────────┬───────────────────────────────────────────────────┤
     │ 1. sandbox_exec (JS/Math Runner)  │ Client-safe JS eval, Math runner, self-correction │
     │ 2. web_search_context & fetch_page│ Web knowledge retrieval & summary extraction       │
     │ 3. fs_read, write, list, patch    │ Virtual Workspace File System (VFS) in 3-Pane     │
     │ 4. memory_query & memory_store    │ Semantic fact storage & retrieval (IDB/Firestore) │
     │ 5. analyze_tabular                │ CSV/JSON stats calculation & table-wrapper sync   │
     │ 6. visualize_diagram              │ SVG vector diagrams & interactive mindmap JSON    │
     │ 7. Legacy tools (5 tools)         │ change_lofi_mood, speak_message, save_note, etc.  │
     └───────────────────────────────────┴───────────────────────────────────────────────────┘
                                                  │
                                                  ▼
     ┌───────────────────────────────────────────────────────────────────────────────────────┐
     │                   Zen Glassmorphic UI & Explainable AI Trajectory View                │
     │ - Live active status indicator (.agent-active-tool-indicator with pulse spinner)       │
     │ - Trajectory Chip (.trajectory-chip) with step count, latency badge & toggle chevron   │
     │ - Collapsible Trajectory Drawer (.trajectory-drawer) with step-by-step timeline cards │
     │ - Workspace File Tabs (.workspace-file-tabs) & multi-file preview iframe bundler      │
     └───────────────────────────────────────────────────────────────────────────────────────┘
```

## Feature Inventory
Every feature identified during the Survey phase mapped to its assigned milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Modular Tool Registry | `registerTool`, `unregisterTool`, `listTools`, `getTool`, `executeTool` with schema validation | M1 | dsh-market / Cordis |
| 2 | Code & Math Sandbox Runner | `sandbox_exec`: client-side safe JavaScript & math evaluation with syntax/runtime error capture | M1 | dsh-sandbox |
| 3 | Web Context & Knowledge Fetcher | `web_search_context`, `fetch_page_summary`: web search and page summary extraction | M1 | dsh-at-file / web |
| 4 | Virtual Workspace File System | `fs_read`, `fs_write`, `fs_list`, `fs_patch`: multi-file VFS synced with 3-Pane Live Workspace | M1 | dsh-at-file |
| 5 | Deep Semantic Memory & Facts | `memory_query`, `memory_store`: query/store facts in `State.memory.facts` + IndexedDB + Firestore | M1 | dsh-mnemon |
| 6 | Tabular Data Analytics | `analyze_tabular`: parse CSV/JSON, compute stats (mean, median, stdDev, etc.), Markdown table output | M1 | dsh-tabular-calc |
| 7 | Visual Analytics & SVG Diagrams | `visualize_diagram`: generate SVG vector graphics and Mindmap tree definitions | M1 | dsh-vision-toolkit |
| 8 | Legacy Tools Backward Compatibility | Retain `change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile` | M1 | survey |
| 9 | Dynamic Tool System Prompting | `SunaAgent.generatePromptDocs()` injected into `buildSystemPrompt()` | M2 | dsh-session / survey |
| 10 | Autonomous Multi-Step ReAct Loop | Think -> Action -> Observation -> Next Action/Final Answer execution loop | M2 | dsh-session |
| 11 | Loop Guards & Error Recovery | `MAX_RECURSION_DEPTH = 4`, cycle detection, self-correction on tool error, AbortController safety | M2 | survey / dsh-session |
| 12 | Trajectory Data Model | Structured `trajectory: TrajectoryStep[]` on assistant messages tracking execution path | M2 | dsh-session |
| 13 | Active Tool Status Widget | Live animated indicator (`.agent-active-tool-indicator`) during in-flight tool execution | M3 | dsh UI / Zen UI |
| 14 | Glassmorphic Trajectory View | `.trajectory-chip` and collapsible `.trajectory-drawer` with timeline cards in message bubble | M3 | dsh UI / Zen UI |
| 15 | Live Workspace File Tabs & Bundler | `.workspace-file-tabs` UI bar and `compileVfsToSrcDoc` multi-file bundler in Editor/Preview | M3 | Live Workspace |
| 16 | CSS Design System & Hygiene | Zen Glassmorphic styles in `styles.css` (balanced braces, `.toast-container { z-index: 10000; }`) | M3 | styles.css / audit |
| 17 | Comprehensive Test Suite | Mocha tests in `tests/test_dsh_*.js` (~73 tests) covering 100% of new tools and ReAct loop | M4 | test harness |
| 18 | Zero-Regression Verification | 100% pass on all 644 existing tests, 0 errors on `npm run check`, Python verification script green | M4 | test harness |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Modular Tool Registry & Core Tool Suite | Tool Registry architecture, parameter validation, 11 core tools, legacy tool retention in `app.js` | none | DONE |
| M2 | Autonomous ReAct Loop & Trajectory Engine | Dynamic prompt injection, multi-step ReAct loop, recursion guard, error recovery, trajectory logging | M1 | DONE |
| M3 | Trajectory View UI & Live Workspace VFS | Trajectory chip & drawer UI, active tool status widget, VFS file tabs & bundler, CSS in `styles.css` | M1, M2 | DONE |
| M4 | E2E Integration, Full Test Suite & Audit | Full Mocha test suites (`test_dsh_*.js`), 644 legacy tests verification, syntax checks, forensic audit | M1, M2, M3 | DONE |

## Interface Contracts

### M1 ↔ M2: Tool Registry & Execution Contract
- `SunaAgent.registerTool(toolDefinition)`:
  ```typescript
  interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
    execute: (args: Record<string, any>, context?: any) => Promise<{ success: boolean; result?: any; error?: string }>;
  }
  ```
- `SunaAgent.executeTool(name: string, args: Record<string, any>): Promise<ToolResult>`:
  Validates args against `parameters.required` and property types. Returns standardized `{ success: boolean, result?: any, error?: string }`.
- `SunaAgent.listTools(): ToolDefinition[]`:
  Returns array of active registered tool definitions.
- `SunaAgent.generatePromptDocs(): string`:
  Returns formatted Markdown documentation of all registered tools and `<suna_tool_call>` syntax for prompt injection.

### M2 ↔ M3: Trajectory Data & UI Rendering Contract
- `TrajectoryStep`:
  ```typescript
  interface TrajectoryStep {
    step: number;
    tool: string;
    thought?: string;
    params: Record<string, any>;
    result?: any;
    error?: string;
    durationMs: number;
    timestamp: number;
  }
  ```
- Assistant message data structure:
  ```javascript
  message.trajectory = [ /* TrajectoryStep[] */ ];
  ```
- `formatMessage(msg)`:
  If `msg.trajectory && msg.trajectory.length > 0`, renders `<div class="trajectory-chip">...</div><div class="trajectory-drawer collapsed">...</div>` above or below message bubble content.

### Code Layout
- `app.js`:
  - Lines ~2914–3250: `SunaAgent` Modular Tool Registry, 11 Core Tool implementations, parameter validator, legacy tool bridges.
  - Lines ~6388–6473: `buildSystemPrompt()` tool documentation injection.
  - Lines ~7107–7152: `generateAIResponse()` ReAct multi-step recursion loop, trajectory recording, active tool indicator state, abort signal propagation.
  - Lines ~1931–1983 & ~5198–5248: Workspace VFS synchronization, `formatMessage` Trajectory View rendering.
- `styles.css`:
  - Zen Glassmorphic UI styles for `.trajectory-chip`, `.trajectory-drawer`, `.trajectory-timeline`, `.trajectory-step-node`, `.agent-active-tool-indicator`, and `.workspace-file-tabs`.
- `tests/`:
  - `tests/test_dsh_tool_registry.js`: Tool registry lifecycle, schema validation, execution tests.
  - `tests/test_dsh_core_tools.js`: Unit tests for all 11 core tools.
  - `tests/test_dsh_react_loop_and_trajectory.js`: Multi-step ReAct loop, depth guard, trajectory structure tests.
  - `tests/test_dsh_zero_regression_matrix.js`: Full integration and backward compatibility tests.
