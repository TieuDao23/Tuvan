# SunaAgent Architecture Design Document
## Milestone 1: Core Module Architecture, Dual Runtime & Legacy Invariants

- **Author**: M1 Explorer 3: Dual Runtime & Legacy Invariants Architect (`explorer_m1_3_o6`)
- **Parent Orchestrator**: `42ac3744-8c8f-4be3-ae11-274cf3c1d73d`
- **Target File**: `d:\Suna Chat\suna_agent.js`
- **Target Integration**: `d:\Suna Chat\app.js`, `d:\Suna Chat\suna_harness.js`, `d:\Suna Chat\index.html`
- **Date**: 2026-09-07T16:25:00Z
- **Status**: APPROVED ARCHITECTURE BLUEPRINT

---

## 1. Executive Summary

This specification establishes the architectural blueprint for **`suna_agent.js`**, the autonomous cognitive agent engine for the Suna ecosystem. SunaAgent synthesizes the strengths of HermesAgent (structured function calling & deterministic reasoning), Claude Agent (extended thinking, scratchpads & meticulous planning), and Codex Agent (character-level code surgery & grounded self-correction).

### Key Architectural Mandates
1. **Zero External Dependencies**: 100% Pure Vanilla JavaScript (ES6+), running without npm packages, transpilers, or polyfill bundles.
2. **Dual Runtime Universality**: Universal Module Definition (UMD) executing identically in Node.js (CommonJS `module.exports`, ESM interop) and modern Web Browsers (`window.SunaAgent` / Web Workers).
3. **100% Gate 4 Legacy Invariant Preservation**: Zero regression across existing test suites (`test_dsh_zero_regression_matrix.js`, `test_dsh_tool_registry.js`, `test_dsh_core_tools.js`), strictly retaining `MAX_RECURSION_DEPTH: 4`, `reset()`, `abort()`, `MOODS_WHITELIST`, `THEMES_WHITELIST`, `_registry`, and the 5 legacy tools + `sandbox_exec`.
4. **Symbiotic Integration Hooks**: Seamless auto-wiring with `suna_harness.js` (`registerAciTools`) and `app.js` (UI streaming, Live Workspace 2-way sync, and fallback execution).

---

## 2. System Architecture & Component Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                      DUAL RUNTIME ENVIRONMENT                                     |
|           Node.js (CommonJS / ESM interop)             |            Web Browser / Web Worker      |
|           - headless testing & CI                      |            - DOM, IndexedDB & UI         |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                                      UMD BOOTSTRAPPER WRAPPER                                     |
|  - Root resolution (self / window / globalThis)                                                   |
|  - CommonJS export: module.exports = SunaAgent (with .default and named sub-module properties)     |
|  - AMD export: define([], factory)                                                                |
|  - Browser global export: root.SunaAgent = window.SunaAgent = SunaAgent                           |
|  - Auto-bridging with SunaHarness if present: SunaHarness.registerAciTools(SunaAgent)             |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                                         SunaAgent CORE                                            |
|                                                                                                   |
|  [Static Public Contracts & Invariants]                                                           |
|  - MAX_RECURSION_DEPTH: 4, MAX_RESULT_LENGTH: 1500                                                |
|  - MOODS_WHITELIST, THEMES_WHITELIST, _registry: Map                                              |
|  - reset(), abort(), isAgentAborted                                                               |
|  - registerTool(), unregisterTool(), getTool(), listTools()                                       |
|  - validateParameters(), generatePromptDocs(), executeTool(), handleToolCalls()                   |
|  - tools: { change_lofi_mood, speak_message, save_note_to_firestore,                              |
|             get_system_state, update_user_profile, sandbox_exec, ... }                            |
|                                                                                                   |
|  [Modular Sub-Systems]                                                                            |
|  ├── StreamParser          : Incremental FSM for <suna_tool_call> streaming tag filtering         |
|  ├── JsonAutoRepair        : Resilient fixer for trailing commas, unquoted keys, truncations      |
|  ├── MultiSyntaxParser     : Universal parser for XML tags, Markdown json fences & Native JSON    |
|  ├── SmartMemory           : Working Memory, Episodic Memory & Sliding-Window Token Compactor     |
|  └── OodaBrain             : Closed cognitive loop (Decompose -> Plan -> Think -> Tool -> Reflect)|
|                                                                                                   |
|  [Runtime & Harness Hooks]                                                                        |
|  - attachHarness(harnessController)                                                               |
|  - executeStep({ thought, toolCall, context })                                                    |
|  - HITL Controls: pause(), resume(), steer(text), rewind(stepIndex)                               |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Dual Runtime UMD Specification

To guarantee 100% platform independence without npm dependencies, `suna_agent.js` must implement the following universal loader:

```javascript
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    const SunaAgent = factory();
    module.exports = SunaAgent;
    module.exports.SunaAgent = SunaAgent;
    module.exports.default = SunaAgent;
    
    // Auto-attach SunaHarness if present in Node environment
    try {
      const localHarness = require('./suna_harness.js');
      if (localHarness && typeof localHarness.registerAciTools === 'function') {
        localHarness.registerAciTools(SunaAgent);
      }
    } catch (e) {
      // Local harness optional in isolated test suites
    }
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else {
    // Browser Global / Web Worker
    const SunaAgent = factory();
    root.SunaAgent = SunaAgent;
    if (typeof window !== 'undefined') {
      window.SunaAgent = SunaAgent;
      
      // Auto-bridge with SunaHarness if already loaded in window
      if (window.SunaHarness && typeof window.SunaHarness.registerAciTools === 'function') {
        window.SunaHarness.registerAciTools(SunaAgent);
      }
    }
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  'use strict';

  // SunaAgent Implementation...
  return SunaAgent;
}));
```

### Dual Runtime Interoperability Matrix
| Environment | Import Style | Export Object | Availability |
|---|---|---|---|
| **Node.js (CJS)** | `const SunaAgent = require('./suna_agent.js');` | Class/Object `SunaAgent` | `SunaAgent.MAX_RECURSION_DEPTH === 4` |
| **Node.js (Destructured CJS)** | `const { SunaAgent, OodaBrain, SmartMemory } = require('./suna_agent.js');` | Individual components | All sub-modules available |
| **Node.js (ESM Interop)** | `import SunaAgent, { MultiSyntaxParser } from './suna_agent.js';` | Default & Named exports | Standard Node.js CJS-ESM interop |
| **Browser Script** | `<script src="suna_agent.js"></script>` | `window.SunaAgent` | Attached to `window` and `root` |
| **Web Worker** | `importScripts('suna_agent.js');` | `self.SunaAgent` | Attached to worker scope |

---

## 4. Preservation of Legacy Invariants (Gate 4 Zero-Regression)

To guarantee that all 1,226 existing tests continue to pass with 0 regressions, `SunaAgent` must preserve the exact structure, whitelists, signatures, and default values tested in `test_dsh_zero_regression_matrix.js`, `test_dsh_tool_registry.js`, and `test_dsh_core_tools.js`.

### 4.1 Strict Constant & State Invariants
```javascript
// Strict public constants
SunaAgent.MAX_RECURSION_DEPTH = 4;
SunaAgent.MAX_RESULT_LENGTH = 1500;

// Strict whitelists (tested in test_dsh_core_tools.js:862)
SunaAgent.MOODS_WHITELIST = ['calm', 'excited', 'sad', 'stressed', 'creative'];
SunaAgent.THEMES_WHITELIST = ['aurora', 'sunset', 'ocean', 'forest', 'midnight'];

// Abort state management (tested in test_dsh_zero_regression_matrix.js:136-139)
SunaAgent.reset = function () {
  if (typeof window !== 'undefined') window.isAgentAborted = false;
  if (typeof globalThis !== 'undefined') globalThis.isAgentAborted = false;
};

SunaAgent.abort = function () {
  if (typeof window !== 'undefined') window.isAgentAborted = true;
  if (typeof globalThis !== 'undefined') globalThis.isAgentAborted = true;
};
```

### 4.2 StreamParser Class Invariant
Tested in `test_dsh_zero_regression_matrix.js:97` and `test_dsh_tool_registry.js:591`:
```javascript
class StreamParser {
  constructor() {
    this.buffer = '';       // Temporary buffer for partial tag matching
    this.state = 'TEXT';    // 'TEXT', 'IN_TAG', 'IN_CONTENT', 'IN_END_TAG'
    this.currentToolContent = '';
    this.toolCalls = [];
    this.filteredText = '';
  }

  parseChunk(chunk) {
    let result = '';
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      if (this.state === 'TEXT') {
        if (char === '<') {
          this.state = 'IN_TAG';
          this.buffer = '<';
        } else {
          result += char;
        }
      } else if (this.state === 'IN_TAG') {
        this.buffer += char;
        if (this.buffer === '<suna_tool_call>') {
          this.state = 'IN_CONTENT';
          this.currentToolContent = '';
          this.buffer = '';
        } else if (this.buffer.startsWith('<suna_tool_call ') && char === '>') {
          this.state = 'IN_CONTENT';
          this.currentToolContent = '';
          this.buffer = '';
        } else if (!'<suna_tool_call>'.startsWith(this.buffer) && !'<suna_tool_call '.startsWith(this.buffer)) {
          result += this.buffer;
          this.buffer = '';
          this.state = 'TEXT';
        }
      } else if (this.state === 'IN_CONTENT') {
        if (char === '<') {
          this.state = 'IN_END_TAG';
          this.buffer = '<';
        } else {
          this.currentToolContent += char;
        }
      } else if (this.state === 'IN_END_TAG') {
        this.buffer += char;
        if (this.buffer === '</suna_tool_call>') {
          this.toolCalls.push(this.currentToolContent.trim());
          this.currentToolContent = '';
          this.buffer = '';
          this.state = 'TEXT';
        } else if (!'</suna_tool_call>'.startsWith(this.buffer)) {
          this.currentToolContent += this.buffer;
          this.buffer = '';
          this.state = 'IN_CONTENT';
        }
      }
    }
    this.filteredText += result;
    return result;
  }

  flush() {
    let extra = '';
    if (this.state === 'IN_TAG') {
      extra += this.buffer;
    } else if (this.state === 'IN_END_TAG') {
      this.currentToolContent += this.buffer;
    }
    this.buffer = '';
    this.state = 'TEXT';
    this.filteredText += extra;
    return extra;
  }
}
```

### 4.3 Tool Registry & Parameter Validation Methods
`SunaAgent` maintains an internal `_registry: new Map()` and provides:
1. `registerTool(definition)`:
   - Validates `definition` is an object.
   - Validates `definition.name` is non-empty string matching `/^[a-zA-Z0-9_-]+$/`.
   - Validates `definition.execute` is a function.
   - Stores entry `{ name, description, parameters, execute }` in `this._registry`.
   - Also maps to `this.tools[trimmedName] = toolEntry.execute`.
2. `unregisterTool(name)`: Removes from `_registry` and `this.tools`.
3. `getTool(name)`: Returns tool entry from `_registry`.
4. `listTools()`: Returns array of `{ name, description, parameters }`.
5. `validateParameters(schema, args)`:
   - Validates all `schema.required` keys exist and are non-null/non-undefined.
   - Validates `enum` restrictions.
   - Coerces/validates types: `string`, `number` (coerces valid numeric strings), `boolean` (coerces `'true'`/`'false'`), `object`, `array`.
   - Returns `{ valid: true, sanitized }`.
6. `generatePromptDocs()`: Emits Markdown specification matching:
   ```markdown
   ### DeepSeek Harness Available Tools
   To invoke a tool, output a single JSON block wrapped inside <suna_tool_call> tags:
   <suna_tool_call>
   {
     "tool": "tool_name",
     "args": { ... }
   }
   </suna_tool_call>
   ```
7. `executeTool(name, args, context)`:
   - Validates tool presence.
   - Parses stringified arguments safely.
   - Validates parameters against schema.
   - Calls tool execution.
   - Truncates serialized output to `MAX_RESULT_LENGTH` (1500 characters) with suffix `\n[Truncated: output exceeded max result limit]`.
8. `handleToolCalls(rawCallsArray, context)`:
   - Iterates through tool calls.
   - Protects against duplicate failure runaway (halts if identical tool and args fail $\ge 3$ consecutive times).
   - Records steps to `trajectory`.
   - Returns aggregated observation string formatted as:
     `\n\n[SUNA TOOL EXECUTION OBSERVATIONS]:\n- Tool [toolName]:\n  Result: ...`

### 4.4 The 5 Legacy Tools + Sandbox Exec
Must be implemented in `SunaAgent.tools`:
1. `change_lofi_mood(args)`: Validates against `MOODS_WHITELIST`, triggers `window.sunaLofiPlayer.changeMood(mood)` and `triggerSentimentChange(mood)`.
2. `speak_message(args)`: Validates string message, clamps to 500 characters, calls `window.speakText(msg, lang)` or `window.readAloud(msg)`.
3. `save_note_to_firestore(args)`: Optimistic 0ms write; checks `window.AuthState.isLoggedIn`, writes to Firestore `users/{uid}/notes/{noteId}` or falls back to localStorage.
4. `get_system_state()`: Gathers active user settings, active chat ID/title, active Lofi mood, sentiment, memory fact count, and app mode.
5. `update_user_profile(args)`: Updates `userName` ($\le 50$ chars), `theme` (validated against `THEMES_WHITELIST`), `fontSize` (12 to 24), and triggers `saveStateOnly()`.
6. `sandbox_exec(args, context)`: Cross-platform isolated code runner (Node.js `vm.Script` with timeout in Node; `new Function` with safe globals isolation in browser).
7. Legacy workspace tools retained for compatibility: `web_search_context`, `fetch_page_summary`, `fs_write`, `fs_read`, `fs_list`, `fs_patch`, `memory_store`, `memory_query`, `visualize_diagram`, `analyze_tabular`.

---

## 5. Sub-Module Specifications for SunaAgent

`suna_agent.js` houses the complete cognitive architecture organized into modular ES6 classes:

### 5.1 JsonAutoRepair Class
A robust, regex- and token-driven auto-repair utility capable of fixing common LLM generation defects:
- **Capabilities**:
  1. Trailing comma removal: `,(\s*[}\]])` -> `$1`.
  2. Unquoted object keys: `([{,]\s*)([a-zA-Z0-9_$-]+)\s*:` -> `$1"$2":`.
  3. Single-quote normalization: converts `'value'` to `"value"` without corrupting escaped internal quotes.
  4. Truncation bracket repair: tallies unclosed `{` and `[` braces and appends corresponding closing symbols `}` and `]`.
  5. Stripping Markdown fences or surrounding conversational text from inside the tag.
- **Interface**:
  ```javascript
  class JsonAutoRepair {
    static repair(rawText) { ... } // returns string
    static parse(rawText) { ... }  // returns parsed object or throws
  }
  ```

### 5.2 MultiSyntaxParser Class
Parses tool calls across disparate model prompting conventions:
1. **XML Tags**: `<suna_tool_call>...</suna_tool_call>`, `<tool_call>...</tool_call>`, or `<invoke name="...">...</invoke>`.
2. **Markdown Code Blocks**: ````json\n{"tool": "view_file", "args": {...}}\n````.
3. **Native Function Calling Objects**: `{ "name": "...", "arguments": { ... } }` or `{ "function": { ... } }`.
- **Interface**:
  ```javascript
  class MultiSyntaxParser {
    static extractToolCalls(rawResponse) {
      // returns Array<{ tool: string, args: object, syntaxType: string, raw: string }>
    }
    static extractThoughtBlocks(rawResponse) {
      // extracts <think>...</think>, <thought>...</thought>, <scratchpad>...</scratchpad>
      // returns { cleanedText: string, thoughts: string[] }
    }
  }
  ```

### 5.3 SmartMemory Class
Dual memory management separating short-term operational state from historical interactions:
- **Working Memory**: Current user prompt, active sub-goals, scratchpad reasoning, and immediate tool call results.
- **Episodic Memory**: Sequence of past conversation turns, tool trajectories, and user steering interventions.
- **Sliding-Window Token Compactor**:
  - Estimates token usage using character heuristic (`Math.ceil(chars / 4)`).
  - When history exceeds budget (e.g. 16,000 tokens), compacts oldest episodic turns into a structured summary block:
    `[COMPACTED CONTEXT SUMMARY]: Key facts, touched files, completed steps.`
  - Preserves critical file paths, error messages, and human steering directives verbatim.
- **Interface**:
  ```javascript
  class SmartMemory {
    constructor(options = {}) {
      this.maxTokens = options.maxTokens || 32000;
      this.workingMemory = {};
      this.episodicMemory = [];
    }
    setWorkingState(key, val) { ... }
    getWorkingState(key) { ... }
    appendTurn(turnData) { ... }
    compactIfExceeded() { ... }
    formatContextForPrompt() { ... }
  }
  ```

### 5.4 OodaBrain Class
Implements the closed cognitive loop:
```
Intent Analysis -> Hierarchical Planning -> Extended Thinking -> Tool Selection -> Reflection
```
- **Cycle Steps**:
  1. `analyzeIntent(userGoal)`: Decomposes goal into prerequisite requirements and constraints.
  2. `planHierarchy(subGoals)`: Generates actionable multi-tier execution steps.
  3. `thinkExtended(step, state)`: Populates `<thought>` scratchpad with rationale and risks.
  4. `selectAndValidateTool(action)`: Normalizes arguments through `AciSchemaValidator` if harness is attached.
  5. `reflectObservation(observation)`: Assesses whether the action achieved the sub-goal or requires self-correction.
- **Interface**:
  ```javascript
  class OodaBrain {
    constructor(agentInstance) {
      this.agent = agentInstance;
      this.currentPhase = 'IDLE'; // 'ANALYZING', 'PLANNING', 'THINKING', 'EXECUTING', 'REFLECTING'
    }
    async step(inputContext) { ... }
  }
  ```

---

## 6. SunaAgent Core Class & Harness Integration Hooks

### 6.1 Constructor & Instance Architecture
`SunaAgent` is designed as a hybrid: it is an ES6 Class that can be instantiated (`new SunaAgent(options)`), while the class itself exposes all static legacy methods and properties so legacy call sites `SunaAgent.executeTool(...)` or `window.SunaAgent.tools` work seamlessly.

```javascript
class SunaAgent {
  constructor(options = {}) {
    this.id = options.id || ('agent_' + Date.now());
    this.name = options.name || 'SunaAgent';
    this.maxRecursionDepth = options.maxRecursionDepth || SunaAgent.MAX_RECURSION_DEPTH;
    
    // Sub-systems
    this.memory = new SmartMemory(options.memoryOptions);
    this.brain = new OodaBrain(this);
    this.harness = options.harness || null;
    
    // Event listeners
    this._listeners = new Map();
    this.isPaused = false;
    this.isAborted = false;
  }

  // Harness Attachment
  attachHarness(harnessInstance) {
    this.harness = harnessInstance;
    if (typeof harnessInstance.registerAciTools === 'function') {
      harnessInstance.registerAciTools(this);
    }
    return this;
  }

  // HITL Controls
  pause() {
    this.isPaused = true;
    this.emit('paused', { agentId: this.id });
  }

  resume() {
    this.isPaused = false;
    this.emit('resumed', { agentId: this.id });
  }

  steer(guidanceText) {
    this.memory.setWorkingState('steeringDirective', guidanceText);
    this.emit('steered', { guidance: guidanceText });
  }

  rewind(stepIndex) {
    if (this.harness && this.harness.checkpointManager) {
      return this.harness.checkpointManager.rewind(stepIndex);
    }
    return false;
  }

  // Event Emitter
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
  }

  emit(event, payload) {
    const handlers = this._listeners.get(event) || [];
    handlers.forEach(fn => {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  }
}
```

### 6.2 Symbiotic Bridge with `app.js`
In `app.js`:
1. `app.js` retains its literal declaration of `const SunaAgent = { ... }` so tests checking `fs.readFileSync('app.js')` pass 100%.
2. At the end of `app.js` (line 4303), the bridge preserves the global instance:
```javascript
if (typeof window !== 'undefined') {
  if (window.SunaAgent && typeof window.SunaAgent.upgradeWithLegacy === 'function') {
    window.SunaAgent.upgradeWithLegacy(SunaAgent);
  } else if (!window.SunaAgent) {
    window.SunaAgent = SunaAgent;
  }
}
```
3. In `index.html`:
```html
<script src="suna_harness.js"></script>
<script src="suna_agent.js"></script>
<script src="app.js?v=7"></script>
```

---

## 7. Concrete File Layout & Code Scaffolding for M1 Worker

The upcoming M1 Worker will generate `d:\Suna Chat\suna_agent.js` using this exact structural blueprint:

```
suna_agent.js
├── Lines 1–45     : UMD Header & Dual Runtime Resolution
├── Lines 46–85    : Core Constants, Whitelists & Invariants (MAX_RECURSION_DEPTH: 4, MOODS, THEMES)
├── Lines 86–175   : StreamParser Class (FSM for <suna_tool_call> streaming tag filtering)
├── Lines 176–290  : JsonAutoRepair Utility Class (trailing commas, quotes, bracket balancing)
├── Lines 291–420  : MultiSyntaxParser Class (XML, Markdown, JSON, Extended Thinking extraction)
├── Lines 421–580  : SmartMemory Class (Working Memory, Episodic Memory, Auto-Compactor)
├── Lines 581–780  : OodaBrain Class (Cognitive Loop: Decompose, Plan, Think, Tool, Reflect)
├── Lines 781–1050 : Legacy Tools Implementation (5 legacy tools, sandbox_exec, workspace tools)
├── Lines 1051–1380: SunaAgent Core Class & Static Facade (Registration, Validation, Dispatch)
├── Lines 1381–1430: Integration Hooks (attachHarness, upgradeWithLegacy, initCoreTools)
└── Lines 1431–1460: UMD Export Packaging & Sub-module Bindings
```

---

## 8. Zero-Regression Verification Gate

To verify this architecture without regression:
1. **Compilation Check**: `node -c suna_agent.js` must exit with code 0 (zero syntax errors).
2. **Mocha Full Suite**: `npm test` must continue to pass all 1,226 existing tests.
3. **Gate 4 Matrix**: `npx mocha tests/test_dsh_zero_regression_matrix.js` must pass Gate 4 (ZR-04.1, ZR-04.2, ZR-04.3).
4. **Tool Registry Matrix**: `npx mocha tests/test_dsh_tool_registry.js` must pass TR-01 through TR-25.
5. **Authoritative Gate**: `python run_verification.py` must report ALL CHECKS 100% GREEN.
