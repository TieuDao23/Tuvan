# Architectural Survey & Specification Mining Report: DeepSeek Harness (dsh) Integration for SunaChat (SunaAgent)

**Target Codebase**: `d:\Suna Chat`  
**Primary Files Analyzed**: `app.js`, `redesign.js`, `index.html`, `styles.css`, `mindmap.html`, and `tests/`  
**Authoritative References**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, `LESSONS.md`, `TEST_READY.md`  
**Date**: 2026-09-04  
**Author**: Spec Miner (Archetype: `teamwork_preview_spec_miner`)

---

## 1. Executive Summary

This report delivers an exhaustive architectural survey of the SunaChat codebase to guide the integration of **DeepSeek Harness (`dsh`)** into `SunaAgent`. 

Currently, SunaChat features:
1. An **Autonomous Multi-Turn Continuation Chaining Engine** maximizing token ceilings (8,192 to 65,536 tokens), with multi-tier truncation detection (provider finish_reason, unclosed backtick fences, unclosed HTML/SVG tags), smart boundary stitching, and zero-loss deduplication.
2. A rudimentary `SunaAgent` prototype in `app.js` (lines 2914–3250 and 7107–7151) that provides a custom streaming state machine (`StreamParser`), a static whitelist-based tool map (`SunaAgent.tools`), and basic 1-step tool execution chaining back into chat messages as user observations.
3. A rich client-side interactive ecosystem including **Live Workspace (3-Pane Split View)**, **KaTeX math rendering**, **Mermaid diagramming**, **Mindmap canvas engine (`mindmap.html`)**, **Lofi audio player**, and **AI Semantic Memory**.

Integrating DeepSeek Harness (`@deepseek-ai/dsh`) transforms `SunaAgent` from a basic tool-triggering script into a true **Autonomous Agent**:
- **Modular Tool Registry ("Everything is a Plugin")**: Dynamic `registerTool`, `unregisterTool`, `getTool`, `listTools`, and `executeTool` with strict JSON schemas.
- **Autonomous Multi-Step ReAct Loop**: Recursive `Think -> Action -> Observation -> Next Action/Final Answer` cycle with recursion depth safety guards (`MAX_RECURSION_DEPTH`) and self-correction.
- **Core Tool Harness Suite (5 Core Tools)**:
  1. `sandbox_exec`: Safe client-side JavaScript & mathematical execution runner.
  2. `web_search_context` & `fetch_page_summary`: Live Internet knowledge retrieval.
  3. `fs_read`, `fs_write`, `fs_list`, `fs_patch`: Virtual Workspace File System directly bound to the Live Workspace editor and preview iframe.
  4. `memory_query`, `memory_store`: Semantic memory and long-term fact storage.
  5. `visualize_diagram`, `analyze_tabular`: SVG/Mermaid visualization and CSV/tabular data science computations.
- **Trajectory Trace & Log UI**: Explainable AI step log (`message.trajectory`) displayed via an elegant Zen Glassmorphic collapsible drawer in the assistant message bubble.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | SunaAgent Core | `StreamParser` | Streaming character-by-character state machine parsing `<suna_tool_call>` XML tags during SSE streaming without showing tags in UI | String chunk delta | Filtered text string; buffers tool call payloads in `this.toolCalls` | Flushes remaining buffer cleanly on stream completion via `flush()` | `app.js:2920-2998` |
| 2 | SunaAgent Core | `SunaAgent.tools` | Static map of local browser tools (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`) | Parameter object | String observation / status feedback | Throws Error on invalid whitelist or schema mismatch | `app.js:3020-3174` |
| 3 | SunaAgent Core | `SunaAgent.executeTool` | Invokes a named tool, parses JSON arguments, limits observation length to `MAX_RESULT_LENGTH` (1500 chars) | `name: string`, `args: object\|string` | Formatted observation string | Catches error, returns `"Error executing tool <name>: <message>"` | `app.js:3177-3193` |
| 4 | SunaAgent Core | `SunaAgent.handleToolCalls` | Iterates array of raw tool call strings, extracts tool name and args (JSON parse + regex fallback), runs tools in parallel/series, formats `[SUNA TOOL EXECUTION OBSERVATIONS]` block | `rawCallsArray: string[]` | Formatted multi-tool observation text block | Formats error entries into observation block without throwing | `app.js:3196-3245` |
| 5 | SunaAgent Core | `MAX_RECURSION_DEPTH` | Safety recursion limit guard for tool calling loop (set to `4`) | Integer depth check | Stops execution if `depth >= 4`, pushes warning system message | Console warning + system message: "⚠️ Lỗi: Đã đạt giới hạn số lần gọi công cụ..." | `app.js:3004, 7110-7120` |
| 6 | SunaAgent Core | `AbortController` Hook | Bi-directional abort propagation between chat request controller and `SunaAgent` (`reset()` / `abort()`) | Abort signal event | Sets `window.isAgentAborted = true` | Cleanly halts pending recursive turns, saves partial message with `*(Đã dừng)*` | `app.js:3008-3013, 6660-6667, 7162-7167` |
| 7 | Prompt Engine | `buildSystemPrompt()` | Central prompt builder injecting identity, user priority, memory facts, pinned context, flash/pro mode guidelines, anti-placeholder rules, and formatting specs | None | Combined system prompt string | Returns fallback identity string if state empty; ignores missing memory/context | `app.js:6388-6473` |
| 8 | Streaming Engine | Multi-Turn Continuation Chaining | Detects response truncation (`length`, unclosed backtick fences, unclosed HTML tags) and sends up to 5 continuation turns with stitcher deduplication | SSE stream deltas | Consolidated single message in state and single message bubble in DOM | Breaks loop on zero-progress or abort signal | `app.js:6944-7072` |
| 9 | Live Workspace | `extractWorkspaceCode` | Heuristic parser extracting primary runnable HTML/SVG/Canvas or JS/CSS block from markdown response | `responseText: string` | Extracted code string, or `null` if purely conversational | Returns `null` safely on conversational text, preventing false sync | `app.js:1931-1958` |
| 10 | Live Workspace | `autoApplyWorkspaceCode` | Injects code into `#artifact-editor-textarea`, dispatches synthetic `input` event, updates `#artifact-iframe.srcdoc`, triggers toast notification | `newCode: string` | `boolean` (true if updated) | Fails gracefully if DOM elements missing, returns `false` | `app.js:1960-1983` |
| 11 | Live Workspace | `sendWorkspaceMessage` | Dedicated assistant for workspace panel; injects current editor code into prompt, streams response, auto-applies code to workspace | User input text | Assistant response + auto-updated editor & iframe | 45s safety timeout, abort controller, error toasts | `app.js:2117-2262` |
| 12 | Visual UI | Thinking Accordion Blocks | Collapsible glassmorphic container for `<think>` / `<thought>` tags with pulse animation during streaming, line counter badge, expand/collapse toggle | Markdown text with `<think>` tags | Interactive HTML accordion | Degrades to closed or open state if stream cut off | `app.js:5198-5248, styles.css:1496-1600` |
| 13 | Web Search | `window.performWebSearch` | Live web search using DuckDuckGo HTML parser through proxy bridge | `query: string` | Top 4 search results with title, URL, snippet | Returns `null` on network/proxy failure, logged to console | `app.js:2572-2613` |
| 14 | Web Fetch | `fetchLinkContext` | Extracts plain text from URLs found in user messages, strips nav/footer/scripts, truncates to 6000 chars | `text: string` | Extracted web text context block | Returns `null` on regex mismatch or CORS/network failure | `app.js:6475-6509` |
| 15 | AI Memory | `extractMemoryFromMessage` & `getMemoryPrompt` | Regex-based extraction of user name, job, tech skills, hobbies, age; stores in `State.memory.facts` and injects into system prompt | User message text | Fact added to `State.memory.facts` | Ignores generic/short tokens; prioritizes current settings over memory | `app.js:3344-3433` |
| 16 | Visualization | `visualizeMessageAsDiagram` | Generates Mermaid, SVG, or Mindmap from message using direct API call | User message content | Diagram code pushed to chat as assistant message | Displays error toast on generation failure | `app.js:9090-9128` |
| 17 | Visual Mindmap | `mindmap.html` | Standalone interactive SVG/Canvas mindmap engine loaded into modal iframe or new tab | Markdown hierarchical text | Interactive visual graph | Displays warning toast if popup blocked | `mindmap.html`, `app.js:8615-8625` |

---

## 3. Edge Cases & Boundary Conditions

| # | Feature | Input / Condition | Observed / Required Behavior |
|---|---------|-------------------|-----------------------------|
| 1 | `StreamParser` | Split tag boundary across SSE chunks (e.g. chunk 1: `text<suna_`, chunk 2: `tool_call>{"tool":...}</suna_tool_call>`) | `StreamParser.buffer` accumulates across `parseChunk` calls; state transitions from `TEXT` -> `IN_TAG` -> `IN_CONTENT` correctly without leaking `<suna_` into `filteredText`. |
| 2 | `StreamParser` | False alarm tag (e.g. `x < 5 && y > 10` or `<div>`) | `StreamParser` checks `'<suna_tool_call>'.startsWith(this.buffer)`. On mismatch, buffer is flushed immediately to `result` and state resets to `TEXT`. No user text is lost. |
| 3 | `StreamParser` | Truncated/unclosed tool call at stream EOF (e.g. network cutoff or token ceiling hit mid-tag) | `flush()` flushes buffered partial tag or tool content to `filteredText` so text is not silently swallowed. |
| 4 | Tool Execution | Malformed JSON inside `<suna_tool_call>` (e.g. unescaped quote in python code or truncated JSON) | Simple `JSON.parse` fails; fallback regex `/(?:tool\|name)"\s*:\s*"([^"]+)"/` attempts extraction. If both fail, error observation is generated: `"Error: Could not parse XML tag contents as JSON tool calls"`. |
| 5 | Tool Execution | Unknown or unregistered tool name requested by LLM | `executeTool` checks `this.tools[name]`. If missing, returns `"Error: Tool \"${name}\" is not registered or not supported."`. Does NOT throw or crash the agent loop. |
| 6 | Tool Execution | Tool throws unhandled exception or rejects Promise | `executeTool` catches error in `try/catch`, logs to `console.error`, and returns sanitized string: `"Error executing tool \"${name}\": ${e.message}"`. |
| 7 | Tool Execution | Tool returns massive payload (>10,000 characters, e.g. giant JSON or whole file dump) | Truncated to `MAX_RESULT_LENGTH` (currently 1500 chars; recommend 3000 chars with `... [truncated N characters]` suffix). Protects model context window from saturation. |
| 8 | ReAct Loop | Model loops indefinitely calling same tool with identical invalid parameters | Current implementation relies solely on `agentRecursionDepth >= 4`. **DSH Requirement**: Add duplicate call fingerprint detection: if exact same tool + args invoked 2 consecutive times with error, break loop early with self-correction prompt. |
| 9 | ReAct Loop | User clicks Stop (Abort) while tool is running asynchronously | `AbortController.abort()` sets `window.isAgentAborted = true`. The ReAct continuation loop checks `!window.isAgentAborted` before triggering next turn. Aborted tool calls do not trigger subsequent LLM turns. |
| 10 | Live Workspace | Tool modifies `index.html` via `fs_write` or `fs_patch` | Virtual filesystem must immediately synchronize with `#artifact-editor-textarea.value`, dispatch `input` event, and update `#artifact-iframe.srcdoc`, showing success toast. |
| 11 | Sandbox Exec | Infinite loop in user/model code (e.g. `while(true) {}`) | Client-side execution will freeze browser UI thread if not guarded. **DSH Requirement**: Run with `Promise.race` and a strict 3,000ms timeout, or in a disposable Web Worker / sandboxed iframe. |
| 12 | Sandbox Exec | Dangerous browser API access (e.g. `window.location.href = ...`, `localStorage.clear()`) | Sandbox execution scope must restrict global object access, providing only safe primitives (`Math`, `JSON`, `Date`, `RegExp`, `Array`, `Object`, `Number`, `String`, etc.). |
| 13 | Tabular Calc | Empty, malformed, or binary CSV input | CSV parser must gracefully handle missing headers, uneven row columns, quotes, and empty data, returning descriptive error string instead of throwing unhandled TypeError. |
| 14 | Diagram Viz | Invalid Mermaid / SVG syntax generated by model | Visualizer must wrap render in `try/catch`. If Mermaid/SVG fails to render, render safe error fallback container with raw code and "Copy" button. |

---

## 4. In-Depth Architectural Analysis of SunaChat

### 4.1 SunaAgent Current Instantiation & Lifecycle
- **Location**: `app.js`, lines 2914 to 3250 (preceded by `// === START OF agent.js ===` and terminated by `// === END OF agent.js ===`).
- **Exposure**: Instantiated as a top-level singleton `const SunaAgent = { ... }` and published globally via `window.SunaAgent = SunaAgent;` (line 3248).
- **Initialization & Reset**:
  - Before sending a message in `generateAIResponse()` (lines 6660-6667):
    ```javascript
    if (window.SunaAgent) {
      window.SunaAgent.reset();
      State.abortController.signal.addEventListener('abort', () => {
        window.isAgentAborted = true;
        window.SunaAgent.abort();
      });
    }
    ```
  - State variable `State.agentRecursionDepth` is reset to `0` in `sendMessage()`, `generateAIResponse()`, `submitEdit()`, and `reloadMessage()`.
  - When tool calls are detected, `State.agentRecursionDepth` increments by 1.

### 4.2 Stream Processing & Chunk Parsing
- **Streaming Pipeline**:
  - `generateAIResponse` calls `makeApiRequest(currentReqMessages)` with `stream: true`.
  - An SSE reader reads chunks:
    ```javascript
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    ```
  - In each delta chunk, `assistantContent += delta` accumulates the full raw text.
  - Simultaneously, `parser.parseChunk(delta)` processes characters:
    - Filters out `<suna_tool_call>...</suna_tool_call>` tags from the display buffer.
    - Accrues clean display text in `parser.filteredText`.
  - UI throttle:
    ```javascript
    if (!bubbleEl._renderPending) {
      bubbleEl._renderPending = true;
      requestAnimationFrame(() => {
        const displayContent = parser ? parser.filteredText : assistantContent;
        bubbleEl.innerHTML = formatMessage(displayContent, true);
        ...
        bubbleEl._renderPending = false;
      });
    }
    ```
  - Upon stream completion, `parser.flush()` retrieves any remaining text.

### 4.3 Continuation Chaining Engine
- **How it works**:
  - Defined in `app.js` (lines 6948–7072) with `MAX_CONTINUATION_TURNS = 5`.
  - At the end of each turn, tests for truncation:
    1. Provider finish reason: `turnFinishReason === 'length'`.
    2. Backtick fence parity: `(assistantContent.match(/```/g) || []).length % 2 === 1`.
    3. HTML/Structural unclosed tags: `isResponseTruncated(turnFinishReason, assistantContent)`.
  - If truncated and not aborted:
    - Constructs continuation messages:
      ```javascript
      currentReqMessages = [
        ...apiMessages,
        { role: 'assistant', content: assistantContent },
        { role: 'user', content: 'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:' }
      ];
      ```
    - Chunks are stitched together seamlessly using `stitchContinuationChunks` (removing redundant fences, preambles, and overlapping boundary lines).
    - Preserves a **single message bubble in the DOM** and a **single message entry in `chat.messages`**.

### 4.4 Tool Invocation & The ReAct Loop Gap
- **Current Flow**:
  1. Stream completes Turn 0.
  2. The assistant message is saved:
     ```javascript
     activeChat.messages.push({
       id: genId(),
       role: 'assistant',
       content: assistantContent,
       timestamp: Date.now(),
       updatedAt: Date.now()
     });
     ```
  3. Lines 7108–7151 inspect `parser.toolCalls`:
     - If `toolCalls.length > 0`:
       - Checks recursion depth limit: `(State.agentRecursionDepth || 0) >= window.SunaAgent.MAX_RECURSION_DEPTH`.
       - Calls `window.SunaAgent.handleToolCalls(toolCalls)`.
       - Receives `observationBlock: string`.
       - Appends observation as a **USER message** into `activeChat.messages`:
         ```javascript
         activeChat.messages.push({
           id: genId(),
           role: 'user',
           content: observationBlock,
           timestamp: Date.now(),
           updatedAt: Date.now()
         });
         ```
       - Invokes `generateAIResponse()` recursively.
- **Architectural Gaps Discovered**:
  1. **No Tool Registration API**: Tools cannot be registered, unregistered, or inspected dynamically (`registerTool`, `unregisterTool`, `listTools` do not exist).
  2. **No Tool Schemas**: Tools do not declare JSON schemas or parameter descriptions.
  3. **No Tool Prompt Injection**: `buildSystemPrompt()` does NOT tell the LLM what tools exist or how to format `<suna_tool_call>`! The LLM cannot invoke tools autonomously because it was never told about them.
  4. **No Trajectory Trace**: The reasoning and tool action trajectory (`Think -> Action -> Observation`) is not saved as structured metadata on the assistant message.
  5. **Polluted Message History**: Feeding observation blocks back as raw `role: 'user'` messages clutters user conversation history, confusing subsequent conversation turns and UI rendering.
  6. **Missing Modern Tool Harnesses**: Lacks math/code runner sandbox, virtual workspace filesystem, tabular data science parser, and long-term memory query tools.

---

## 5. DeepSeek Harness (dsh) Architectural Blueprint

### 5.1 Architecture: "Everything is a Plugin" (Modular Tool Registry)

In alignment with DeepSeek Harness specifications (`@deepseek-ai/dsh` / Cordis plugin kernel), `SunaAgent` should be restructured into an extensible plugin architecture:

```
+---------------------------------------------------------------------------------------+
|                                    SUNA AGENT                                         |
|                               (DeepSeek Harness Core)                                 |
+---------------------------------------------------------------------------------------+
                                           |
                 +-------------------------+-------------------------+
                 |                                                   |
  +-------------------------------+                 +-----------------------------------+
  |     Modular Tool Registry     |                 |    Autonomous ReAct Engine        |
  |  - registerTool(tool)         |                 |  - Think -> Action -> Observation |
  |  - unregisterTool(name)       |                 |  - MAX_RECURSION_DEPTH (5)        |
  |  - listTools()                |                 |  - Self-Correction & Loop Guard   |
  |  - getTool(name)              |                 |  - Trajectory Logger              |
  |  - executeTool(name, params)  |                 +-----------------------------------+
  +-------------------------------+                                  |
                 |                                                   |
  +-------------------------------+                 +-----------------------------------+
  |      Core Tool Harness Suite  |                 |    Trajectory View UI             |
  |  1. sandbox_exec              |                 |  - Collapsible Step Drawer        |
  |  2. web_search_context / fetch|                 |  - Tool & Parameter Badges        |
  |  3. fs_read/write/list/patch  |                 |  - Execution Time & Status        |
  |  4. memory_query / store      |                 |  - Output Preview                 |
  |  5. visualize / analyze_tab   |                 +-----------------------------------+
  |  + Legacy Whitelist Tools     |
  +-------------------------------+
```

#### Tool Definition Standard (JSON Schema Compliant):
```typescript
interface SunaToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required?: string[];
  };
  execute: (params: any, context?: any) => Promise<string | object>;
}
```

### 5.2 Dynamic Prompt Injection Protocol
The agent system prompt (`buildSystemPrompt()`) must dynamically retrieve all registered tools via `SunaAgent.listTools()` and format them into an authoritative tool instruction block:

```markdown
[HỆ THỐNG CÔNG CỤ TỰ ĐỘNG - DEEPSEEK HARNESS]:
Bạn có quyền truy cập vào các công cụ sau để giải quyết bài toán của người dùng:

1. sandbox_exec(code: string): Chạy mã JavaScript/toán học an toàn.
2. fs_read(path: string), fs_write(path: string, content: string), fs_list(), fs_patch(path: string, search: string, replace: string): Thao tác Virtual Filesystem & Live Workspace.
3. web_search_context(query: string), fetch_page_summary(url: string): Tìm kiếm và trích xuất dữ liệu Internet.
4. memory_query(query: string), memory_store(fact: string, category: string): Truy vấn và lưu trữ trí nhớ dài hạn.
5. analyze_tabular(data: string, operation: string), visualize_diagram(type: string, code: string): Phân tích số liệu và vẽ biểu đồ.

[QUY TẮC GỌI CÔNG CỤ]:
Khi cần tính toán, thao tác file, tra cứu web hoặc lưu trí nhớ, hãy xuất thẻ gọi công cụ theo định dạng:
<suna_tool_call>
{"name": "<tên_công_cụ>", "parameters": {<tham_số_json>}}
</suna_tool_call>

Hệ thống sẽ thực thi công cụ và trả về kết quả quan sát [OBSERVATION]. Bạn có thể suy nghĩ từng bước và gọi nhiều công cụ liên tiếp trước khi đưa ra câu trả lời cuối cùng.
```

### 5.3 Core Tool Harness Suite Implementation Specifications

#### 1. `sandbox_exec` (Code & Math Runner - `dsh-sandbox`)
- **Purpose**: Solves equations, probability, data transformations, and algorithm logic with 100% precision. Ends mathematical hallucinations.
- **Parameters**: `{ code: string, timeout?: number }`
- **Execution Mechanism**:
  - Client-side execution in a controlled function scope.
  - Safe global scope: injects `Math`, `JSON`, `Date`, `Array`, `Object`, `Number`, `String`, `RegExp`, and an intercepted `console.log` accumulator.
  - Guard: Blocks access to `window`, `document`, `localStorage`, `fetch`, `location`.
  - Wrapped in `Promise.race` with a 3,000ms timeout.
- **Output**: Returns captured `logs` and evaluated return value:
  ```json
  { "result": 42, "logs": ["Computing fibonacci(8)..."] }
  ```

#### 2. Virtual Workspace Filesystem (`fs_read`, `fs_write`, `fs_list`, `fs_patch` - `dsh-at-file`)
- **Purpose**: Enables full multi-file project management and direct synchronization with the 3-Pane Live Workspace.
- **State Storage**: `State.virtualFS = { 'index.html': '...', 'style.css': '...', 'app.js': '...' }`, backed by `localStorage['suna_virtual_fs']`.
- **Tools**:
  - `fs_read({ path })`: Returns file content; if `path === 'index.html'`, reads live from `#artifact-editor-textarea.value`.
  - `fs_write({ path, content })`: Writes content to virtual file. If writing to `index.html`, automatically invokes `autoApplyWorkspaceCode(content)` to update the live preview!
  - `fs_list()`: Returns list of virtual files, byte sizes, and modification timestamps.
  - `fs_patch({ path, search, replace })`: Performs surgical string replacement on existing file. Replaces only specified snippet without re-transmitting entire file (saves 90%+ tokens!).

#### 3. Web Knowledge Fetcher (`web_search_context`, `fetch_page_summary`)
- **Purpose**: Live internet search and page extraction.
- **Tools**:
  - `web_search_context({ query, limit = 4 })`: Calls `window.performWebSearch(query)`.
  - `fetch_page_summary({ url, maxLength = 3000 })`: Calls `fetchLinkContext(url)` using `window.fetchWithProxy`.

#### 4. Semantic Memory & Retrieval (`memory_query`, `memory_store` - `dsh-mnemon`)
- **Purpose**: Long-term persistent fact storage and contextual retrieval.
- **Tools**:
  - `memory_query({ query, category? })`: Filters `State.memory.facts` matching keyword search or category.
  - `memory_store({ fact, category = 'context' })`: Adds fact via `addMemoryFact(fact, category)` and saves state.

#### 5. Data & Visual Analytics (`analyze_tabular`, `visualize_diagram` - `dsh-tabular-calc` & `dsh-vision-toolkit`)
- **Purpose**: Data science analytics and visual diagramming.
- **Tools**:
  - `analyze_tabular({ data, operation, column? })`: Parses CSV, TSV, or JSON table; computes `mean`, `median`, `sum`, `stddev`, `min`, `max`, `count`, `filter`, or `sort`; returns clean Markdown summary table.
  - `visualize_diagram({ type, code, title? })`: Validates SVG, Mermaid, or Mindmap syntax and prepares visual rendering block.

#### 6. Legacy Whitelist Tools (Preserved for 100% Backward Compatibility)
- `change_lofi_mood`: Changes lofi mood (`calm`, `excited`, `sad`, `stressed`, `creative`).
- `speak_message`: Vocal speech synthesis.
- `save_note_to_firestore`: Optimistic notes persistence.
- `get_system_state`: Inspects app mode, theme, active chat, etc.
- `update_user_profile`: Updates username, theme, fontSize.

### 5.4 Autonomous Multi-Step ReAct Engine & Trajectory Log

#### Trajectory Step Data Structure
```typescript
interface TrajectoryStep {
  step: number;
  timestamp: number;
  type: 'action' | 'observation' | 'thought';
  tool: string;
  parameters?: Record<string, any>;
  observation?: string;
  status: 'running' | 'success' | 'error';
  durationMs: number;
}
```

#### ReAct Cycle:
1. **Turn N Stream**:
   - `parser.parseChunk(delta)` strips `<suna_tool_call>` tags from the display text.
   - Any `<think>` content renders in the existing thinking accordion.
2. **Turn N Finish**:
   - If `parser.toolCalls` contains calls and `!window.isAgentAborted`:
     - Checks `State.agentRecursionDepth < SunaAgent.MAX_RECURSION_DEPTH` (default 5).
     - Loops detected: if identical call repeated consecutively with error, halts.
     - Executes tools via `SunaAgent.executeTool(name, params)`.
     - Appends structured step to `message.trajectory`.
     - Formats observation block:
       ```
       [OBSERVATION for sandbox_exec]:
       {"result": 28, "logs": []}
       ```
     - Feeds observation back to next LLM turn.
     - Triggers recursive `generateAIResponse()`.
3. **Turn N Final**:
   - When the model returns a final text response without any tool calls, the ReAct loop concludes.
   - Trajectory log is attached to the final message: `finalAssistantMessage.trajectory = accumulatedTrajectory`.

### 5.5 Trajectory View UI Specification (Zen Glassmorphic)

Rendered above or below the message content in `formatMessage()`:
- Wrapper: `<div class="trajectory-drawer is-collapsed">`
- Header:
  - Icon: `<span class="material-icons-round">account_tree</span>`
  - Badge text: `Truy vết suy luận & công cụ`
  - Meta badge: `X bước thực thi [duration]`
  - Expand/collapse toggle arrow.
- Drawer Body:
  - Step timeline showing tool name badge (e.g. `sandbox_exec`, `fs_read`).
  - Inputs formatted in syntax-highlighted code pill.
  - Execution status chip: `✓ Thành công` (green) or `⚠ Thất bại` (amber).
  - Observation preview with copy action.

---

## 6. Recommended Exact File Modifications & Code Placement

To maintain 100% zero-regression and pass all 644 tests and `run_verification.py`:

| File | Target Location | Planned Modifications |
|---|---|---|
| `app.js` | Lines 2914–3250 (`// === START OF agent.js ===` to `// === END OF agent.js ===`) | 1. Replace static `SunaAgent.tools` object with `ToolRegistry` implementation.<br>2. Add `registerTool`, `unregisterTool`, `getTool`, `listTools`, `executeTool`.<br>3. Implement the 5 Core Tool Harnesses (`sandbox_exec`, `fs_*`, `web_search_context`, `memory_*`, `analyze_tabular`, `visualize_diagram`).<br>4. Re-register the 5 existing whitelist tools.<br>5. Preserve `window.SunaAgent` API surface and `MAX_RECURSION_DEPTH`. |
| `app.js` | Lines 6388–6473 (`buildSystemPrompt`) | Append dynamic tool instructions block from `SunaAgent.generatePromptDocs()`, giving the model explicit capability to use tools autonomously. |
| `app.js` | Lines 7107–7151 (`generateAIResponse` tool execution block) | 1. Implement Trajectory step tracking.<br>2. Record `trajectory` array on the assistant message object.<br>3. Update typing indicator text with active tool name (e.g. `Đang tính toán trong sandbox...`).<br>4. Maintain recursion limit and zero-progress guards. |
| `app.js` | Lines 5175–5250 (`formatMessage`) | Render the Trajectory View accordion component (`trajectory-drawer`) when `message.trajectory` is present, alongside existing thinking blocks. |
| `styles.css` | After line 1600 (following Thinking Block styles) | Add styling for `.trajectory-drawer`, `.trajectory-header`, `.trajectory-badge`, `.trajectory-step-item`, `.trajectory-chip`. |
| `redesign.js` | Lines 1–12 | Retain clean exports (`version: '2.0.0'`), add optional tool helper re-exports if needed, maintaining 0 syntax errors on `node -c redesign.js`. |
| `tests/` | New test file `tests/test_deepseek_harness_react.js` | Comprehensive Mocha test suite covering Tool Registry, 5 Core Tools, Trajectory Trace, and ReAct loop. |

---

## 7. Verification Strategy & Integrity Contract

1. **Syntax Integrity**:
   - `node -c app.js && node -c redesign.js` must yield exit code 0 and empty output.
2. **CSS Balance**:
   - All open `{` match closed `}` in `styles.css`.
   - `.toast-container` preserves `z-index: 10000`.
3. **Existing Test Parity**:
   - Run `python run_verification.py`.
   - All 644 existing tests must pass 100% (0 failures).
4. **New DSH Test Suite**:
   - Unit tests verifying `registerTool`, `unregisterTool`, `listTools`, `getTool`.
   - Execution tests for `sandbox_exec` (math evaluation, timeout, error handling).
   - Execution tests for `fs_read`, `fs_write`, `fs_patch` with workspace sync.
   - Multi-step ReAct loop test verifying trajectory generation and recursion safety.
