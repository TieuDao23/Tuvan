# Suna Agent Harness: VFS Sandbox & Trajectory Architecture Specification (R1 & R2)

**Author:** Explorer 2 (VFS Sandbox & Trajectory Architecture Investigator)  
**Date:** 2026-09-07  
**Working Directory:** `d:\Suna Chat\.agents\explorer_survey_2`  
**Target System:** SunaChat & SunaAgent Autonomous Execution Engine (`d:\Suna Chat`)

---

## 1. Executive Summary

The **Suna Agent Harness (SunaHarness)** represents the next evolutionary leap for SunaChat. By synthesizing core design patterns from premier open-source autonomous agent frameworks—specifically **SWE-agent** (Agent-Computer Interface & surgical code editing), **OpenHands/OpenDevin** (Event-stream trajectory architecture & execution containment), and **LangGraph** (State checkpointing & time-travel replay)—SunaHarness transforms SunaChat from a single-turn conversational assistant into a robust, observable, and self-correcting autonomous engineering agent.

This architectural survey delivers the exhaustive technical blueprints for:
1. **R1: Virtual File System (VFS) Sandbox & SWE-agent Style ACI**:
   - A fully isolated, in-memory hierarchical file system protecting the host machine and browser environment while giving the agent rich Unix-like filesystem capabilities.
   - A standardized SWE-agent Agent-Computer Interface (ACI) consisting of `view_file` (with sliding window and 1-indexed lines), `replace_file_content` (with strict chunk verification and diagnostic feedback), `grep_search`, `find_by_name`, `list_dir`, and `run_sandboxed_command`.
   - Strict architectural separation between **Controller** (governance, step/token budget, security permissions, timeout/lifecycle management) and **Agent** (pure cognitive reasoning, planning, and tool call generation).
2. **R2: Trajectory Event Stream & State Checkpointing**:
   - An immutable, append-only event stream tracking every thought, action, observation, status code, execution duration, and resource delta.
   - A LangGraph-style checkpointing engine capturing snapshots of the VFS, semantic memory, and tool states after every execution step, enabling time-travel debugging (`rewind`, `pause`, `resume`, and `replay`).
   - Built-in serialization to industry-standard **JSONL** (for benchmark evaluation) and clean **Markdown** executive summaries (for human review and forensic auditing).
3. **Seamless Integration with SunaChat**:
   - 100% backward compatibility with existing `SunaAgent.tools` (`fs_read`, `fs_write`, `fs_list`, `fs_patch`), `State.vfs`, the 3-Pane Live Workspace, and all 828 existing passing Mocha tests.

---

## 2. Current State Assessment & Gap Analysis

### 2.1 Existing Implementation in `app.js`

In the current codebase (`app.js:3566-3718`), the virtual file system and trajectory tracing were introduced during early DeepSeek Harness iterations:

```javascript
// Existing flat VFS in app.js:3575-3587
if (!state.vfs && !state.virtualFS) state.vfs = {};
const targetVfs = state.vfs || state.virtualFS;
targetVfs[path] = {
  content,
  size: byteLength,
  lines: content.split('\n').length,
  updatedAt: Date.now()
};
```

#### Existing VFS Tools (`app.js:3566-3718`):
1. `fs_write({ path, content })`: Writes string directly to `targetVfs[path]`. If `path === 'index.html'`, writes into `#artifact-editor-textarea.value` and `#artifact-iframe.srcdoc`.
2. `fs_read({ path })`: Looks up `targetVfs[path]`. Returns `{ success, path, content, size, lines }`.
3. `fs_list({})`: Iterates keys of `targetVfs` and returns array of file descriptors.
4. `fs_patch({ path, search, replace })`: Performs a raw `original.replace(search, replace)` provided `search` matches exactly once in the entire file.

#### Existing Live Workspace Integration (`app.js:8612-8650`):
- `compileVfsToSrcDoc(vfs)`: Finds `index.html` in `vfs`, resolves linked `<link rel="stylesheet" href="*.css">` by embedding `<style data-vfs="...">`, resolves `<script src="*.js">` by embedding `<script data-vfs="...">`, and outputs a unified HTML string for the live preview iframe.

#### Existing Trajectory Tracking (`app.js:3958-4064, 8566-8610`):
- `handleToolCalls` pushes plain mutable objects into `trajectory`:
  `{ step, tool, thought, params, result, error, durationMs, timestamp }`.
- `renderTrajectoryView(trajectory)` builds a `.trajectory-container` with a `.trajectory-chip` and collapsible `.trajectory-drawer` containing timeline nodes.

### 2.2 Comprehensive Gap Analysis Matrix

| Feature Dimension | Current Implementation (`app.js`) | Required SunaHarness Standard | Gap Severity |
| :--- | :--- | :--- | :--- |
| **VFS Hierarchy & Directory Tree** | Flat dictionary (`targetVfs[path]`). Paths are arbitrary string keys; no folder structure, no directory nodes. | Hierarchical in-memory tree (`VfsDirectoryNode` & `VfsFileNode`). Full path normalization, parent/child resolution, `mkdir -p` intermediate directory creation. | **High** |
| **Directory Navigation (`list_dir`)** | None. Only flat `fs_list` returning all keys. | Structured `list_dir(dirPath, recursive, maxDepth)` returning entries with `name`, `isDir`, `sizeBytes`, `childCount`, and timestamps. | **High** |
| **Code Replacement (`replace_file_content`)** | Simple string search/replace (`fs_patch`). Requires exact global substring match; no line bounds, no context window. | SWE-agent surgical chunk replacement: 1-indexed `startLine` & `endLine`, unique search chunk verification within range, strict whitespace/indent preservation, diagnostic error feedback when target content is missed. | **Critical** |
| **File Viewing (`view_file`)** | Only `fs_read` which dumps the full file. Dumps whole files into context window, causing token blowup on files > 100 lines. | SWE-agent sliding window: 1-indexed line numbering `<line_num>: <line>`, bounded line ranges (`startLine`, `endLine`), byte caps (46KB limit) with `contentOffset` pagination. | **Critical** |
| **Code Pattern Matching (`grep_search`)** | None. AI must dump whole files to find text. | In-memory ripgrep emulation: regex and literal query modes, line-numbered matches (`matchPerLine`), case-insensitivity, and glob `includes` filtering. | **High** |
| **File Discovery (`find_by_name`)** | None. | Glob and pattern file/directory search with extension filtering and depth limits. | **Medium** |
| **Sandboxed Command Execution (`run_sandboxed_command`)** | None. (Only `sandbox_exec` for JS expressions). | Safe in-memory virtual shell supporting POSIX-like utilities (`ls`, `cat`, `grep`, `head`, `tail`, `wc`, `diff`, `echo`, `node -e`) with pipe emulation, 100% isolated from host OS. | **Critical** |
| **Controller vs Agent Separation** | Monolithic `SunaAgent` object handles parsing, execution, whitelist checks, recursion guard, and state writes. | Formal decoupling: `HarnessController` manages lifecycle, token budgets, execution safety, and permissions; `HarnessAgent` handles cognition and tool invocation. | **High** |
| **Trajectory Immutability** | Mutable JavaScript array; properties can be overwritten during turn progression. | Immutable append-only event stream (`TrajectoryEventStream`) with `Object.freeze()` enforcement and typed event categories. | **High** |
| **State Checkpointing & Replay** | None. State mutations in `State.vfs` and `State.memory` are irreversible during a multi-step session. | LangGraph-style Checkpointing (`CheckpointManager`): full snapshots of VFS, context memory, and tool state after each step. Time-travel operations (`rewind`, `pause`, `resume`, `replay`). | **Critical** |
| **Export Formats** | None. Only HTML drawer DOM rendering. | One-click export to standard **JSONL** (OpenHands/SWE-bench compatible) and rich **Markdown summary** report. | **High** |

---

## 3. Deep Architecture Design: R1 Virtual File System (VFS) Sandbox & SWE-agent ACI

### 3.1 In-Memory Storage & Isolation Engine (`VfsSandbox`)

#### 3.1.1 Isolation Guarantees
- **Host Disk Isolation**: The VFS operates entirely in RAM (`Map<string, VfsNode>`). It never calls Node.js `fs.readFile`, `fs.writeFile`, or any browser native file handle.
- **Path Traversal Containment**: All paths are sanitized through `VfsSandbox.normalizePath(path)`. Any attempt to escape the root via `../`, leading slashes, Windows drive letters (`C:\`), or UNC paths (`\\server\share`) is strictly resolved within the virtual sandbox root `/`.

```javascript
/**
 * Path Normalization & Sandboxing
 * Clamps paths strictly within virtual root '/'
 */
function normalizeVfsPath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  // Convert Windows backslashes to standard POSIX slashes
  let clean = rawPath.replace(/\\/g, '/').trim();
  // Strip leading slashes to maintain uniform relative index
  clean = clean.replace(/^\/+/, '');
  
  const segments = clean.split('/').filter(Boolean);
  const stack = [];
  
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 0) stack.pop();
      // If stack is empty, cannot escape root; ignore extra '..'
      continue;
    }
    stack.push(seg);
  }
  return stack.join('/');
}
```

#### 3.1.2 Internal Node Model
The VFS maintains an internal registry of nodes:

```typescript
interface VfsBaseNode {
  name: string;           // File or folder name, e.g. "index.html"
  path: string;           // Normalized full path, e.g. "src/components/Header.js"
  type: 'file' | 'directory';
  createdAt: number;      // Epoch ms
  updatedAt: number;      // Epoch ms
}

interface VfsFileNode extends VfsBaseNode {
  type: 'file';
  content: string;        // Text content
  size: number;           // Byte length (UTF-8)
  lines: number;          // Line count (split '\n')
  version: number;        // Incrementing mutation version
}

interface VfsDirectoryNode extends VfsBaseNode {
  type: 'directory';
  children: Set<string>;  // Set of child normalized paths
}
```

#### 3.1.3 Core VFS Primitives
1. `writeFile(path, content, options = { overwrite: true, createDirs: true })`:
   - Normalizes path.
   - Recursively ensures all parent directories exist.
   - Calculates exact UTF-8 byte length via `TextEncoder` (browser) or `Buffer.byteLength` (Node.js).
   - Counts total lines (`content.split('\n').length`).
   - Increments node `version`.
   - Triggers file change callbacks (e.g. Live Workspace sync if `index.html` or linked CSS/JS).
2. `readFile(path)`:
   - Returns string content and metadata `{ content, size, lines, updatedAt }`.
   - If not found, throws structured `VfsError('FILE_NOT_FOUND', `File "${path}" does not exist in virtual workspace.`)`.
3. `deletePath(path, options = { recursive: false })`:
   - Deletes file or directory.
   - If directory contains children and `recursive === false`, throws `VfsError('DIRECTORY_NOT_EMPTY')`.
4. `listDir(dirPath = '', options = { recursive: false, maxDepth: null })`:
   - Returns directory listing array:
     ```javascript
     [
       {
         name: "app.js",
         path: "src/app.js",
         isDir: false,
         sizeBytes: 4096,
         lines: 120,
         updatedAt: 1725712345000
       },
       {
         name: "styles",
         path: "src/styles",
         isDir: true,
         childCount: 3,
         updatedAt: 1725712345000
       }
     ]
     ```
5. `exists(path)` & `stat(path)`:
   - High-speed existence and metadata lookup.

---

### 3.2 SWE-agent Style Agent-Computer Interface (ACI)

The SWE-agent ACI standardizes how LLM agents perceive and manipulate codebases. Rather than expecting an LLM to dump thousands of lines of code into conversation context or make sloppy string replacements, ACI provides precision surgical instruments:

```
+---------------------------------------------------------------+
|                 SWE-agent ACI Tool Suite                      |
+-------------------------------+-------------------------------+
| Inspection & Search           | Surgical Editing & Execution   |
+-------------------------------+-------------------------------+
| 1. view_file (sliding window) | 4. replace_file_content (chunk)|
| 2. grep_search (regex/literal)| 5. run_sandboxed_command (sh)  |
| 3. find_by_name (glob finder) | 6. list_dir (tree inspector)   |
+-------------------------------+-------------------------------+
```

#### 3.2.1 `view_file` (Sliding Window File Inspector)
- **Problem Solved**: Reading an entire 2,000-line file blows up LLM context, exhausts token budgets, and triggers hallucination.
- **Specification**:
  - Arguments: `{ path: string, startLine?: number, endLine?: number, maxLines?: number, contentOffset?: number }`.
  - Default: `startLine = 1`, `maxLines = 800`.
  - Line Numbers: Output formatted with exact 1-indexed line numbers: `<line_num>: <line_content>`.
  - Byte Ceiling: Clamped to 46,080 bytes per view. If exceeded, indicates `[Content truncated at byte limit. Use contentOffset to view remaining content]`.
  - Response Format:
    ```text
    File: src/index.html (Total lines: 142)
    10: <div id="app">
    11:   <header class="header">
    12:     <h1>SunaChat</h1>
    13:   </header>
    14: </div>
    ```

#### 3.2.2 `replace_file_content` (Surgical Chunk Replacement)
- **Problem Solved**: Substring search/replace fails when duplicate code exists elsewhere in a file; full file rewriting wastes tokens and causes syntax regressions.
- **Specification**:
  - Arguments:
    * `path`: string (relative path)
    * `startLine`: number (1-indexed start line of replacement window)
    * `endLine`: number (1-indexed end line of replacement window)
    * `targetContent`: string (verbatim lines to replace, matching whitespace & indentation)
    * `replacementContent`: string (new code content to inject)
    * `allowMultiple`: boolean (default: `false`)
  - Verification Algorithm:
    1. Validate `1 <= startLine <= endLine <= totalLines`.
    2. Extract slice: lines `[startLine - 1 ... endLine]` from file.
    3. Verify `targetContent` exists within that exact line slice.
    4. If not found: Generate diagnostic feedback showing the actual lines in `[startLine, endLine]` so the agent can immediately self-correct without guessing.
    5. If found multiple times within the slice and `allowMultiple === false`: Throw `Ambiguous replacement target` error.
    6. Perform contiguous replacement of `targetContent` with `replacementContent`.
    7. Save to VFS and synchronize Live Workspace if file is active in preview.

#### 3.2.3 `grep_search` (Pattern Matching Engine)
- **Specification**:
  - Arguments: `{ query: string, searchPath?: string, isRegex?: boolean, caseInsensitive?: boolean, matchPerLine?: boolean, includes?: string[] }`.
  - Features:
    * Scans all virtual files within `searchPath`.
    * Supports file globs via `includes` (e.g. `["*.js", "!vendor/*"]`).
    * When `isRegex === true`: Evaluates JavaScript `RegExp`. Includes execution timeout guard against catastrophic backtracking (ReDoS).
    * When `matchPerLine === true`: Returns list of `{ file: string, lineNumber: number, lineContent: string }` (capped at 50 results).
    * When `matchPerLine === false`: Returns list of unique matching file paths.

#### 3.2.4 `find_by_name` (Virtual File Finder)
- **Specification**:
  - Arguments: `{ pattern: string, searchDirectory?: string, type?: 'file' | 'directory' | 'any', maxDepth?: number, extensions?: string[] }`.
  - Supports glob patterns (`*`, `?`, `**/*.css`).
  - Returns array of `{ name, path, type, sizeBytes, updatedAt }`.

#### 3.2.5 `run_sandboxed_command` (Virtual Shell Runner)
- **Problem Solved**: AI agents often attempt to run shell commands (`ls`, `cat`, `head`, `grep`, `wc`, `diff`). Running real shell commands on the user's operating system exposes security risks (malicious code execution, host file deletion).
- **Specification**:
  - Implements an **in-memory command emulator**:
    * `ls [-laR] [dir]`: Formatted directory listing.
    * `cat <file>`: Dumps virtual file content.
    * `head [-n count] <file>`: First N lines of virtual file.
    * `tail [-n count] <file>`: Last N lines of virtual file.
    * `grep [-i] <pattern> <file>`: Searches virtual file.
    * `find [dir] -name <pattern>`: Emulated find.
    * `wc [-lwm] <file>`: Counts lines, words, characters.
    * `echo <text> [> or >> file]`: Writes or appends to virtual file.
    * `diff <file1> <file2>`: Unified line-by-line diff between two virtual files.
    * `node -e "<code>"`: Executes JavaScript in the safe VM sandbox (`sandbox_exec`), returning evaluated result.
  - Zero OS Process Spawning: 100% in-memory, instant response (< 5ms), zero host access.

---

### 3.3 Controller vs Agent Separation Architecture

To prevent runaway loops, resource exhaustion, or unauthorized operations, SunaHarness enforces strict separation between the **Cognitive Layer** (Agent) and the **Execution & Governance Layer** (Controller):

```
+-------------------------------------------------------------------------+
|                        HARNESS CONTROLLER                               |
|                                                                         |
|  +--------------------+  +--------------------+  +-------------------+  |
|  | Budget & Quota     |  | Security & Policy  |  | State & Trajectory|  |
|  | - Max Steps (10-25)|  | - Read-Only Mode   |  | - Checkpoints     |  |
|  | - Token Ceiling    |  | - Path Whitelist   |  | - Event Stream    |  |
|  | - Timeout Safety   |  | - Safe Sandbox VM  |  | - Replay & Rewind |  |
|  +--------------------+  +--------------------+  +-------------------+  |
+------------------------------------+------------------------------------+
                                     | Dispatches Tool Call
                                     v
                 +---------------------------------------+
                 |            VFS SANDBOX & ACI          |
                 |  view_file, replace_file_content...   |
                 +---------------------------------------+
                                     | Returns Structured Observation
                                     v
+------------------------------------+------------------------------------+
|                         HARNESS AGENT                                   |
|                                                                         |
|  - Prompts & System Instructions                                        |
|  - Multi-Turn Reasoning & Plan Formation                                |
|  - Tool Call Selection & Argument Formatting                            |
|  - Pure Cognition (Stateless across step execution)                     |
+-------------------------------------------------------------------------+
```

#### Responsibilities Matrix

| Responsibility | HarnessController | HarnessAgent |
| :--- | :---: | :---: |
| **System Prompt Generation & Tool Docs** | Coordinates | Formats / Consumes |
| **Tool Selection & Reasoning (`<think>`)** | ❌ (Passive) | ✅ (Active) |
| **Argument Validation & Sanitization** | ✅ (Enforces) | ❌ |
| **Execution Permission (Read-Only / Full)** | ✅ (Enforces) | ❌ |
| **Timeout & Resource Containment** | ✅ (Enforces) | ❌ |
| **Step & Token Budget Ceiling** | ✅ (Enforces) | ❌ |
| **VFS Mutation & Rollback** | ✅ (Manages) | ❌ (Requests only) |
| **Trajectory Event Stream Append** | ✅ (Enforces) | ❌ |
| **State Checkpointing** | ✅ (Automatic) | ❌ |

---

## 4. Deep Architecture Design: R2 Trajectory Event Stream & State Checkpointing

### 4.1 Immutable Trajectory Event Stream (`TrajectoryEventStream`)

#### 4.1.1 Event Schema Standard
Inspired by the OpenHands event-stream architecture, every interaction in SunaHarness is recorded as a discrete, typed, immutable event.

```typescript
type TrajectoryEventType = 
  | 'session_start'
  | 'step_start'
  | 'thought'
  | 'action'
  | 'observation'
  | 'checkpoint'
  | 'step_finish'
  | 'session_finish'
  | 'error';

interface TrajectoryEvent {
  id: string;                      // E.g. "evt_step1_act_1725712345678"
  step_index: number;              // 1-indexed step count
  timestamp: string;               // ISO 8601 UTC string
  epoch_ms: number;                // Exact timestamp for elapsed time calculation
  type: TrajectoryEventType;       // Event category
  thought?: string;                // Agent's reasoning/plan
  action?: {
    tool: string;                  // Tool name, e.g. "replace_file_content"
    params: Record<string, any>;   // Sanitized input parameters
    call_id?: string;
  };
  observation?: {
    status: 'success' | 'error' | 'timeout';
    result?: any;                  // Tool return payload
    error?: string;                // Diagnostic error message
    error_code?: string;           // E.g. "CHUNK_NOT_FOUND", "TIMEOUT"
  };
  metrics?: {
    duration_ms: number;           // Tool execution time in milliseconds
    memory_delta_bytes?: number;   // RAM delta for step
    vfs_file_count?: number;       // Current count of virtual files
    vfs_total_bytes?: number;      // Total size of virtual workspace
    token_usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
}
```

#### 4.1.2 Immutability & Event Emitter
- **Frozen Records**: Upon generation, each event object is sealed via `Object.freeze()`. Internal arrays prevent external splicing.
- **Reactive Streaming**: Components (such as the UI's active tool indicator or live trajectory drawer) subscribe to the event stream via `stream.on('event', (evt) => ...)`:
  - When `action` fires: UI displays `"⚡ Đang thực thi replace_file_content trên index.html..."`.
  - When `observation` fires: UI animates completion badge with exact elapsed milliseconds.

---

### 4.2 LangGraph-Style State Checkpointing & Time-Travel Replay

#### 4.2.1 Checkpoint Data Model
At the completion of each step (after tool execution and VFS mutation), the `CheckpointManager` generates an atomic snapshot of the entire runtime state:

```typescript
interface StateCheckpoint {
  checkpoint_id: string;               // E.g. "chk_step_3_1725712345000"
  step_index: number;                  // Integer step number (0 = initial state)
  timestamp: string;                   // ISO 8601 UTC timestamp
  parent_checkpoint_id: string | null; // Pointer to predecessor for branch/tree support
  vfs_snapshot: Record<string, {       // Full or CoW virtual file snapshot
    content: string;
    size: number;
    lines: number;
    updatedAt: number;
  }>;
  context_memory_snapshot: {           // Semantic memory snapshot
    facts: Array<{ id: string; fact: string; category: string; timestamp: number }>;
  };
  tool_state_snapshot: Record<string, any>;
  controller_state: {
    recursion_depth: number;
    is_aborted: boolean;
    total_duration_ms: number;
  };
}
```

#### 4.2.2 Structural Sharing & Copy-on-Write (CoW) Optimization
- **Problem**: In a 20-step debugging session with 20 files (totaling 1 MB), naive deep-cloning at every step produces 20 MB of redundant heap memory.
- **Solution**: The `CheckpointManager` uses **Copy-on-Write (CoW)**:
  - Unmodified file nodes maintain identical object references across checkpoints.
  - Only files mutated in the current step generate fresh node clones.
  - Memory overhead per checkpoint drops from ~1 MB to ~2 KB (just the delta!).

#### 4.2.3 Time-Travel Debugging Primitives
1. **`rewind(targetStepIndex)`**:
   - Finds checkpoint where `step_index === targetStepIndex`.
   - Restores `VfsSandbox` files to the exact snapshot contents.
   - Restores `State.memory.facts` to the historical snapshot.
   - Synchronizes the Live Workspace UI (`#artifact-editor-textarea` and `#artifact-iframe.srcdoc`).
   - Truncates or branches the trajectory event stream from `targetStepIndex`.
2. **`pause()`**:
   - Signals the Controller to halt before the next turn starts. Checkpoint state remains preserved.
3. **`resume(fromStepIndex = null)`**:
   - If `fromStepIndex` is specified, performs a `rewind(fromStepIndex)` first, then continues the autonomous ReAct loop.
4. **`replay(fromStepIndex, options = { mockObservations: true })`**:
   - Re-executes the trajectory from `fromStepIndex` forward.
   - If `mockObservations === true`: Plays back recorded observations to inspect state evolution at each step without re-calling models or tools.
   - If `mockObservations === false`: Re-invokes tools with alternative parameters to branch into a new execution tree.

---

### 4.3 Standard Data Export Engine: JSONL & Markdown

#### 4.3.1 JSONL Export Standard
For seamless interoperability with evaluation benchmarks (OpenHands, SWE-bench, AgentBench), SunaHarness exports sessions as standard JSON Lines (`.jsonl`):

```jsonl
{"step_index":1,"timestamp":"2026-09-07T12:00:01.120Z","type":"action","action":{"tool":"view_file","params":{"path":"index.html","startLine":1,"endLine":50}},"metrics":{"duration_ms":4}}
{"step_index":1,"timestamp":"2026-09-07T12:00:01.125Z","type":"observation","observation":{"status":"success","result":"File: index.html (Lines 1-50)..."},"metrics":{"duration_ms":5}}
{"step_index":2,"timestamp":"2026-09-07T12:00:02.340Z","type":"action","action":{"tool":"replace_file_content","params":{"path":"index.html","startLine":12,"endLine":14,"targetContent":"<h1>Old</h1>","replacementContent":"<h1>New</h1>"}},"metrics":{"duration_ms":14}}
```

#### 4.3.2 Markdown Summary Generation
For human auditability, compliance, and quick debugging, SunaHarness generates clean, formatted Markdown reports:

```markdown
# SunaHarness Execution Trajectory Audit

- **Session ID**: `harness_sess_1725712345000`
- **Status**: `COMPLETED (SUCCESS)`
- **Total Steps**: 3
- **Total Duration**: 142ms
- **VFS Files**: 4 files (12.4 KB)

### Trajectory Timeline
| Step | Tool | Target | Status | Duration |
| :---: | :--- | :--- | :---: | :---: |
| 1 | `view_file` | `index.html:1-50` | `SUCCESS` | 4ms |
| 2 | `grep_search` | `query: "main-header"` | `SUCCESS` | 8ms |
| 3 | `replace_file_content` | `index.html:12-14` | `SUCCESS` | 14ms |

### Step Details & Code Diffs
#### Step 3: `replace_file_content`
- **Thought**: *"Updating the header text to match brand identity."*
- **Diff Applied**:
```diff
- <h1>Old</h1>
+ <h1>New</h1>
```
- **Live Workspace Sync**: Verified (iframe re-rendered).
```

---

## 5. Integration Blueprint with Existing SunaChat Systems

### 5.1 Backward Compatibility with Existing Tool Harness

SunaChat currently possesses 828 passing tests in Mocha. To ensure zero regression:
1. `State.vfs` remains the authoritative memory store.
2. `VfsSandbox` wraps around `State.vfs` as an active proxy or adapter. When `State.vfs` is modified, `VfsSandbox` updates its internal indices; conversely, when `VfsSandbox` performs an operation, it reflects directly into `State.vfs[path] = { content, size, lines, updatedAt }`.
3. Existing legacy tools (`fs_read`, `fs_write`, `fs_list`, `fs_patch`) remain registered in `SunaAgent.tools` and delegate cleanly to `VfsSandbox`:
   - `fs_write` -> `vfs.writeFile` + live workspace trigger.
   - `fs_read` -> `vfs.readFile`.
   - `fs_list` -> `vfs.listAll`.
   - `fs_patch` -> `vfs.patchExact`.
4. New SWE-agent ACI tools (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `list_dir`, `run_sandboxed_command`) are registered into `SunaAgent._registry` via `registerTool()`.

### 5.2 Live Workspace 3-Pane Auto-Sync Pipeline

Whenever an ACI tool (`replace_file_content`, `fs_write`, `fs_patch`) mutates `index.html`, `styles.css`, or `app.js`:
1. The VFS emits an internal `file:change` event.
2. The Live Workspace auto-sync subscriber checks if the changed file affects the active preview:
   - If `index.html`: updates `#artifact-editor-textarea.value` and dispatches an `'input'` event.
   - Compiles the entire virtual workspace into a unified `srcdoc` via `compileVfsToSrcDoc(vfs)`.
   - Injects the compiled HTML into `#artifact-iframe.srcdoc`.
   - Emits a non-intrusive toast notification: `"Virtual workspace updated: [path]"`.

### 5.3 Upgraded Trajectory View UI

The existing `renderTrajectoryView(trajectory)` (`app.js:8566-8610`) renders the chip and collapsible drawer. The new SunaHarness enhances this without breaking existing styles:
1. Retains `.trajectory-chip` and `.trajectory-drawer` CSS classes.
2. Adds action buttons inside the drawer header:
   - **`[Tua lại (Rewind)]`**: Allows the user to click any step node to rewind the workspace to that exact step.
   - **`[Xuất JSONL]`**: Triggers 1-click browser download of `trajectory.jsonl`.
   - **`[Xuất Markdown]`**: Copies the formatted Markdown trajectory summary to clipboard.
3. Node timeline displays expandable diffs for `replace_file_content` steps.

---

## 6. Implementation Architecture & Module Layout

To achieve maximum modularity, code cleanliness, and testability across both Browser and Node.js environments, we recommend organizing the harness into a dedicated module file:

```
d:\Suna Chat\
├── suna_harness.js           # Core Suna Agent Harness module
│   ├── VfsSandbox            # In-memory VFS & SWE-agent ACI
│   ├── TrajectoryEventStream # Immutable event logging & JSONL/MD exporter
│   ├── CheckpointManager     # State snapshotting & Time-travel engine
│   └── HarnessController     # Governance, budgets, lifecycle manager
├── app.js                    # SunaChat Core (bridges SunaHarness into SunaAgent)
├── index.html                # Includes suna_harness.js before app.js
└── tests/
    └── test_suna_harness_vfs_and_trajectory.js  # Comprehensive test suite
```

### Module Export Pattern (Universal Browser + Node.js)
```javascript
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SunaHarness = factory();
  }
})(typeof window !== 'undefined' ? window : global, function() {
  // SunaHarness exports:
  return {
    VfsSandbox,
    TrajectoryEventStream,
    CheckpointManager,
    HarnessController,
    version: '1.0.0'
  };
});
```

---

## 7. Verification & Testing Strategy

### 7.1 Test Matrix for SunaHarness VFS & Trajectory

| Suite | Test Area | Target Invariants |
| :--- | :--- | :--- |
| **VFS-01 to 05** | VFS Core & Isolation | In-memory storage, path normalization, path traversal blocking, `mkdir -p` behavior, recursive deletion. |
| **ACI-01 to 04** | `view_file` | 1-indexed line formatting, sliding window bounds, byte ceiling truncation, offset pagination. |
| **ACI-05 to 09** | `replace_file_content` | Exact line slicing, character/indent preservation, unique match enforcement, diagnostic mismatch error feedback, single contiguous replacement. |
| **ACI-10 to 13** | `grep_search` & `find_by_name` | Literal vs regex search, line numbering, glob includes, maxDepth, ReDoS safety. |
| **ACI-14 to 17** | `run_sandboxed_command` | Virtual `ls`, `cat`, `grep`, `head`, `tail`, `wc`, `diff`, `echo`, `node -e`, zero OS execution. |
| **CTL-01 to 04** | Controller Separation | Max steps ceiling, token budget monitoring, read-only mode permissions, timeout safety. |
| **TRJ-01 to 04** | Immutable Event Stream | Typed event schema, `Object.freeze()` immutability, duration calculation, reactive event listeners. |
| **CHK-01 to 05** | Checkpoint & Time-Travel | Snapshot creation, CoW structural sharing, `rewind()` restoring VFS & memory, `pause()`, `resume()`, `replay()`. |
| **EXP-01 to 03** | Data Export | Valid JSONL generation, parsing compliance, clean Markdown audit report generation. |
| **REG-01 to 03** | Zero-Regression Matrix | All 828 existing Mocha tests pass 100%, `node -c` passes with 0 syntax errors, `run_verification.py` 100% green. |

---

## 8. Summary & Next Steps for Team

1. **Implementer Roadmap**:
   - Implement `suna_harness.js` containing `VfsSandbox`, `TrajectoryEventStream`, `CheckpointManager`, and `HarnessController`.
   - Wire `SunaHarness` into `SunaAgent` in `app.js` and load script in `index.html`.
   - Connect Live Workspace synchronization to `VfsSandbox` file modification events.
2. **Reviewer & QA**:
   - Construct `tests/test_suna_harness_vfs_and_trajectory.js` verifying all 35+ new test cases.
   - Run verification suite: `npm run check`, `npm test` (all 828 + new tests = 860+ passing), and `python run_verification.py`.
