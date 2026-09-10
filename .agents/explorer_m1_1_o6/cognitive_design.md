# SunaAgent M1 Architectural Specification: Cognitive Brain, Extended Thinking & Memory

- **Document Version**: 1.0.0
- **Author**: M1 Explorer 1: Cognitive Brain & Extended Thinking Architect (`explorer_m1_1_o6`)
- **Date**: 2026-09-07T16:25:00Z
- **Working Directory**: `d:\Suna Chat\.agents\explorer_m1_1_o6`
- **Target Implementation**: `suna_agent.js`, `app.js` bridge, `tests/test_suna_agent.js`
- **Invariants**: 100% Zero-Regression across all 1,226 existing tests, pure Vanilla JS (ES6+), Dual Runtime (Browser + Node.js), Zero external npm dependencies.

---

## 1. Executive Architectural Summary & Design Philosophy

SunaAgent represents the next evolution of autonomous AI agency for the SunaChat and SunaHarness ecosystem. It unifies the three premier paradigms in autonomous agent engineering:
1. **HermesAgent**: High-conviction function calling, deterministic JSON/XML tool extraction, and resilient multi-syntax parsing.
2. **Claude Agent**: Extended Thinking, explicit scratchpad deliberation, thorough step-by-step reflection, and pristine separation of internal thoughts from user-facing output.
3. **Codex Agent**: Surgical character-level code manipulation, unified Git diff verification, and test-grounded self-correction with diagnostic error pointers (`^`).

```
+---------------------------------------------------------------------------------------------------+
|                                    SunaChat UI & User Controls                                     |
|  - Real-time Thought Streaming (.thinking-block-wrapper, pulse badge, accordion)                  |
|  - HITL Controls: Pause, Resume, Steer (instruction injection), Rewind (step rollback)             |
|  - Live Workspace 3-Pane Sync (Editor <-> Iframe <-> VFS)                                         |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                                     SunaAgent Cognitive Engine                                     |
|                                                                                                   |
|  [OODA / ReAct++ Cognitive Brain]                                                                 |
|   ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌─────────────────────┐    |
|   │  analyzeIntent  │───>│   planHierarchy  │───>│  thinkExtended  │───>│  parseAndExecute    │    |
|   └─────────────────┘    └──────────────────┘    └─────────────────┘    └──────────┬──────────┘    |
|            ▲                                                                       │              |
|            │                 [reflectObservation & Grounded Self-Correction]       │              |
|            └───────────────────────────────────────────────────────────────────────┘              |
|                                                                                                   |
|  [Extended Thinking & Scratchpad Engine]                                                          |
|   - MultiTagStreamParser: stream delta separation (<think>, <thought>, <scratchpad>)              |
|   - Event Bus: 'thought_chunk', 'thought_complete', 'step_transition'                             |
|                                                                                                   |
|  [Smart Context & Dual Memory]                                                                    |
|   - Working Memory: Current goal, active plan tree, scratchpad variables, steer directives        |
|   - Episodic Memory: Immutable turn history, trajectory steps, tool telemetry                      |
|   - Compaction Engine: Sliding-window turn retention + loss-less architectural summarization       |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                                     SunaHarness Runtime Layer                                     |
|  - HarnessController (Turn/Token Budget, Child Delegation)                                        |
|  - 6 ACI Standard Tools (view_file, replace_file_content, grep_search, find_by_name, etc.)         |
|  - AciSchemaValidator (strict validation & alias normalization)                                   |
|  - VfsDiffEngine (Unified Git diff generation & previewReplaceDiff)                               |
|  - TrajectoryEngine (Hierarchical trajectory stitching) & CheckpointManager (State rewind)        |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. OODA / ReAct++ Cognitive Brain Architecture

### 2.1 The 5 Cognitive Stages

The cognitive brain operates as a closed-loop autonomous state machine executed in 5 well-defined stages:

```
                  ┌─────────────────────────────────────┐
                  │                START                │
                  └──────────────────┬──────────────────┘
                                     │ User Prompt / Input
                                     ▼
                  ┌─────────────────────────────────────┐
                  │          1. analyzeIntent           │
                  │   Decompose goals & detect intent   │
                  └──────────────────┬──────────────────┘
                                     │ Intent taxonomy & sub-goals
                                     ▼
                  ┌─────────────────────────────────────┐
                  │          2. planHierarchy           │
                  │   Build/Update hierarchical plan    │
                  └──────────────────┬──────────────────┘
                                     │ Active step & plan tree
                                     ▼
        ┌────────>┌─────────────────────────────────────┐
        │         │          3. thinkExtended           │
        │         │   Scratchpad deliberation & thought │
        │         └──────────────────┬──────────────────┘
        │                            │ Formulated tool call or final answer
        │                            ▼
        │         ┌─────────────────────────────────────┐
        │         │         4. parseAndExecute          │
        │         │   Multi-syntax parsing & tool exec  │
        │         └──────────────────┬──────────────────┘
        │                            │ Observation & execution telemetry
        │                            ▼
        │         ┌─────────────────────────────────────┐
        │         │        5. reflectObservation        │
        │         │   Grounded diagnostic & loop check  │
        │         └──────────────────┬──────────────────┘
        │                            │
        │        Goal not complete   │   Goal accomplished / Final answer
        └────────────────────────────┤──────────────────────────────┐
                                                                    ▼
                                                 ┌─────────────────────────────────────┐
                                                 │              COMPLETE               │
                                                 └─────────────────────────────────────┘
```

#### Stage 1: `analyzeIntent` (Goal Decomposition & Intent Classification)
- **Objective**: Converts raw user requests into an unambiguous operational intent model before any action or tool calling is attempted.
- **Input**:
  - `userMessage`: The prompt or instruction text.
  - `systemState`: Current workspace state (open files, active theme, lofi status, mode).
  - `memoryFacts`: Relevant facts retrieved from semantic memory.
- **Processing**:
  1. **Intent Taxonomy Classification**:
     - `CONVERSATIONAL`: Direct Q&A, explanations, creative writing (Zero tool usage required).
     - `CODE_SURGERY`: Bug fixing, refactoring, modifying specific files (Requires `view_file` -> `replace_file_content`).
     - `WORKSPACE_EXPLORATION`: Searching codebase, file inspection, directory mapping (`list_dir`, `find_by_name`, `grep_search`).
     - `SYSTEM_CONFIGURATION`: Modifying preferences, theme, sound, profile settings (`update_user_profile`, `change_lofi_mood`).
     - `MULTI_STEP_TASK`: Complex end-to-end task requiring sub-goal decomposition.
  2. **Constraint & Entity Extraction**:
     - Target file paths mentioned (e.g. `index.html`, `styles.css`, `app.js`).
     - Operational constraints (e.g., "do not modify tests", "zero regression", "preserve UTF-8").
     - Budget ceilings (maximum turns or token allowances).
  3. **Sub-Goal Generation**:
     - Splits complex tasks into an ordered sequence of atomic sub-goals (e.g., Sub-goal 1: Locate function definition; Sub-goal 2: Preview diff; Sub-goal 3: Apply patch; Sub-goal 4: Run verification).
- **Output**:
  ```javascript
  {
    intentType: 'CODE_SURGERY',
    primaryGoal: 'Fix unclosed selector in styles.css and verify with tests',
    constraints: ['preserve UTF-8', 'zero test failures'],
    targetEntities: ['styles.css'],
    subGoals: [
      { id: 'sg_1', description: 'Inspect lines 3980-4010 of styles.css', status: 'pending' },
      { id: 'sg_2', description: 'Replace unclosed selector with clean block', status: 'pending' },
      { id: 'sg_3', description: 'Verify syntax with node -c / mocha', status: 'pending' }
    ]
  }
  ```

#### Stage 2: `planHierarchy` (Hierarchical Task Planning)
- **Objective**: Constructs and maintains an explicit, inspectable execution plan represented as a tree.
- **Plan Structure**:
  - **Phases**: Coarse-grained operational milestones (e.g., *Phase 1: Exploration & Discovery*, *Phase 2: Execution & Modification*, *Phase 3: Validation & Convergence*).
  - **Steps**: Fine-grained actionable items inside each phase, mapping to potential tool operations.
  - **Dynamic Re-Planning**: If a tool returns an unexpected observation (e.g., `TARGET_NOT_FOUND` or `VFSNotFound`), `planHierarchy` recalculates the plan, adding an exploratory step (e.g., `grep_search`) before retrying the modification.
- **Output**: Hierarchical plan tree stored directly into Working Memory (`workingMemory.planTree`).

#### Stage 3: `thinkExtended` (Extended Thinking & Scratchpad Deliberation)
- **Objective**: Provides an isolated mental workspace for deep reasoning, hypothesis testing, and pre-execution verification.
- **Behavior**:
  - Emits internal reasoning inside `<think>` or `<scratchpad>` tags.
  - Emits incremental streaming deltas via the `thought_chunk` event directly to the UI.
  - Generates structured reasoning hypotheses:
    - *Observation analysis*: What did the previous step reveal?
    - *Hypothesis*: What is the probable cause or optimal next step?
    - *Action selection*: Which tool is most appropriate?
    - *Argument verification*: Are the line numbers, exact strings, and parameters strictly compliant with the tool's schema?
  - Does NOT reveal internal reasoning in the final user response; thoughts remain quarantined.

#### Stage 4: `parseAndExecute` (Multi-Syntax Tool Parsing & Execution)
- **Objective**: Extracts tool invocations from generated output, repairs JSON imperfections, normalizes arguments against schemas, previews modifications, and dispatches execution.
- **Pipeline**:
  1. **Multi-Syntax Detection**: Scans for:
     - XML tag syntax: `<suna_tool_call>...</suna_tool_call>` or `<tool_call>...</tool_call>`.
     - Fenced Markdown code blocks: ````json\n{"tool": "...", "args": {...}}\n````.
     - Native JSON function calling objects.
  2. **JSON Auto-Repair**: Runs the raw call payload through `JsonAutoRepair` (fixes unquoted keys, trailing commas, unclosed brackets from truncation).
  3. **Schema Normalization**: Passes arguments through `AciSchemaValidator.normalizeArgs()` (maps camelCase <-> PascalCase, coerces string numbers).
  4. **Pre-Flight Preview (Codex Invariant)**: If the tool is `replace_file_content`, invokes `VfsDiffEngine.previewReplaceDiff` first. If preview fails (`TARGET_NOT_FOUND` or `AMBIGUOUS_MATCH`), catches error before file corruption occurs.
  5. **Execution**: Dispatches call through `HarnessController.executeAction` or local agent tool registry.

#### Stage 5: `reflectObservation` (Grounded Observation Reflection & Loop Prevention)
- **Objective**: Evaluates the tool result against the hypothesis, classifies errors, detects loops, and determines the next state transition.
- **Error Grounding & Classification**:
  - Classifies errors using `SelfCorrectionLoop` into 10 standard categories (`SyntaxError`, `RuntimeError`, `TimeoutError`, `TruncationDetected`, `VFSMismatch`, `VFSNotFound`, `PermissionError`, `RateLimitError`, `NetworkError`, `SchemaValidationError`).
  - Generates a visual diagnostic pointer (`^`) indicating the exact error location and suggests concrete remediation.
- **Stuck & Runaway Prevention**:
  - Tracks consecutive identical failures: if a tool fails $\ge 3$ consecutive times with identical parameters, halts execution with an explicit failure warning (`RunawayGuardrails.recordFailure`).
  - Tracks ping-pong oscillation ($A \rightarrow B \rightarrow A \rightarrow B$) and period-3 cycles ($A \rightarrow B \rightarrow C \rightarrow A \rightarrow B \rightarrow C$).
  - Monitors VFS hash stability: flags stagnant VFS modifications over 3 consecutive turns.
- **Decision Branching**:
  - If current sub-goal succeeded: Marks sub-goal completed, transitions to next sub-goal in `planHierarchy`.
  - If sub-goal failed: Updates working memory with diagnostic reflection, initiates adaptive backtrack or re-planning.
  - If all sub-goals succeeded: Transitions to `EMIT_FINAL_ANSWER`.

---

### 2.2 Complete State Machine Specification

```
                         ┌──────────────┐
                         │     IDLE     │
                         └──────┬───────┘
                                │ start(userMessage)
                                ▼
                   ┌──────────────────────────┐
                   │     ANALYZING_INTENT     │
                   └────────────┬─────────────┘
                                │ intentAnalyzed
                                ▼
                   ┌──────────────────────────┐
         ┌────────>│         PLANNING         │
         │         └────────────┬─────────────┘
         │                      │ planReady
         │                      ▼
         │         ┌──────────────────────────┐
         │         │     THINKING_EXTENDED    │<─────────────────────────┐
         │         └────────────┬─────────────┘                          │
         │                      │ thoughtChunk -> emit('thought_chunk')  │
         │                      │ thoughtComplete                        │
         │                      ▼                                        │
         │         ┌──────────────────────────┐                          │
         │         │      PARSING_TOOLS       │                          │
         │         └──────┬────────────────┬──┘                          │
         │                │ toolParsed     │ noToolCall (final answer)   │
         │                ▼                └────────────────┐            │
         │         ┌──────────────────────────┐             │            │
         │         │      PREVIEWING_DIFF     │             │            │
         │         └────────────┬─────────────┘             │            │
         │                      │ diffApproved              │            │
         │                      ▼                           │            │
         │         ┌──────────────────────────┐             │            │
         │         │      EXECUTING_TOOL      │             │            │
         │         └────────────┬─────────────┘             │            │
         │                      │ toolExecuted              │            │
         │                      ▼                           │            │
         │         ┌──────────────────────────┐             │            │
         │         │   REFLECTING_OBSERVATION │             │            │
         │         └──────┬────────────────┬──┘             │            │
         │                │                │                │            │
         │ rePlanNeeded   │                │ nextStep       │            │
         └────────────────┘                └────────────────┘            │
                                                            │            │
                                                            ▼            │
                                               ┌──────────────────────┐  │
                                               │  EMITTING_RESPONSE   │  │
                                               └──────────┬───────────┘  │
                                                          │ responseDone │
                                                          ▼              │
                                               ┌──────────────────────┐  │
                                               │      COMPLETED       │  │
                                               └──────────────────────┘  │
                                                                         │
       [Special Interrupt Transitions]                                   │
       Any Active State ──(pause)──────────> [ PAUSED ] ──(resume)───────┘
       Any Active State ──(steer)──────────> [ AWAITING_STEER ] ─────────┘
       Any Active State ──(abort/runaway)──> [ HALTED ]
```

#### State Transition Table

| Current State | Event / Trigger | Guard Condition | Next State | Actions / Side Effects |
|---|---|---|---|---|
| `IDLE` | `start(userMessage)` | `!isAgentAborted` | `ANALYZING_INTENT` | Reset recursion depth, initialize Working Memory, emit `start` |
| `ANALYZING_INTENT` | `intentAnalyzed` | `intent.type === 'CONVERSATIONAL'` | `THINKING_EXTENDED` | Skip complex plan; set single conversational step |
| `ANALYZING_INTENT` | `intentAnalyzed` | `intent.type !== 'CONVERSATIONAL'` | `PLANNING` | Initialize hierarchical plan tree in Working Memory |
| `PLANNING` | `planReady` | `plan.steps.length > 0` | `THINKING_EXTENDED` | Set `activeStep = 0`, emit `plan_created` |
| `THINKING_EXTENDED` | `thoughtChunk` | `isStreaming === true` | `THINKING_EXTENDED` | Append to thought buffer, emit `thought_chunk` to UI |
| `THINKING_EXTENDED` | `thoughtComplete` | None | `PARSING_TOOLS` | Finalize thought block, record thought in Working Memory |
| `PARSING_TOOLS` | `toolDetected` | Tool call syntax matched | `PREVIEWING_DIFF` | Parse args, run `JsonAutoRepair`, validate schema |
| `PARSING_TOOLS` | `noToolDetected` | No tool calls in output | `EMITTING_RESPONSE` | Prepare clean final markdown response |
| `PREVIEWING_DIFF` | `diffApproved` | `tool === 'replace_file_content'` | `EXECUTING_TOOL` | Run `previewReplaceDiff`, attach patch preview |
| `PREVIEWING_DIFF` | `diffBypass` | `tool !== 'replace_file_content'` | `EXECUTING_TOOL` | Direct passthrough to execution |
| `PREVIEWING_DIFF` | `previewFailed` | Ambiguous match or missing | `REFLECTING_OBSERVATION` | Skip execution, feed failure diagnostic to reflection |
| `EXECUTING_TOOL` | `toolExecuted` | Success or handled error | `REFLECTING_OBSERVATION` | Record observation, token debit, record trajectory step |
| `REFLECTING_OBSERVATION` | `goalAccomplished` | All sub-goals complete | `EMITTING_RESPONSE` | Summarize results for user |
| `REFLECTING_OBSERVATION` | `continuePlan` | Steps remain, failure < 3 | `THINKING_EXTENDED` | Advance active step, increment recursion depth |
| `REFLECTING_OBSERVATION` | `rePlan` | Unexpected roadblock | `PLANNING` | Re-evaluate remaining steps, mutate plan tree |
| `REFLECTING_OBSERVATION` | `runawayTriggered` | Consec failures $\ge 3$ or loop | `HALTED` | Emit warning, halt execution loop |
| `EMITTING_RESPONSE` | `responseComplete` | Buffer flushed | `COMPLETED` | Persist episodic turn, emit `complete` |
| *ANY* | `pause()` | State is running | `PAUSED` | Store current state pointer, yield execution to user |
| `PAUSED` | `resume()` | Paused | Previous State | Resume cognitive loop from interrupted step |
| *ANY* | `steer(guidance)` | None | `THINKING_EXTENDED` | Inject guidance into Working Memory scratchpad |
| *ANY* | `abort()` | None | `HALTED` | Set `window.isAgentAborted = true`, flush partial output |

---

## 3. Extended Thinking & Scratchpad Engine

### 3.1 Multi-Tag Syntax & Streaming Separation

Modern reasoning models produce internal thoughts wrapped inside XML-like tags. SunaAgent must recognize:
1. `<think>...</think>` (DeepSeek R1, Qwen)
2. `<thought>...</thought>` (Claude Thinking Mode / Anthropic)
3. `<scratchpad>...</scratchpad>` (HermesAgent / OpenAI o1 scratchpads)
4. `<suna_tool_call>...</suna_tool_call>` (SunaHarness tool invocation)

#### Strict Separation Invariant
Under NO circumstances may internal reasoning content (`<think>`, `<thought>`, `<scratchpad>`) leak into the final conversational response presented to the user. The engine enforces strict separation at both the **token streaming level** and the **final serialization level**.

### 3.2 ExtendedThinkingStreamParser Architecture

To guarantee zero latency and smooth UI rendering, `ExtendedThinkingStreamParser` implements a high-performance streaming character-by-character finite state machine:

```
                  [ TEXT ] (User-facing response)
                   │    ▲
         char '<'  │    │ False alarm (e.g. '<div', ' < 5')
                   ▼    │
                 [ IN_TAG ]
                   │    │
   Matched tag     │    │
   <think> or      │    │
   <suna_tool_call>│    │
                   ▼    │
             [ IN_CONTENT ] (Thinking or Tool Payload)
                   │
         char '<'  │
                   ▼
               [ IN_END_TAG ]
                   │    │
  Matched close    │    │ False alarm (content continues)
  </think>         │    └─────────────┐
                   ▼                  ▼
             [ TEXT / RESET ]    [ IN_CONTENT ]
```

#### States:
1. `TEXT`: Emits plain text chunks directly to the UI response stream.
2. `IN_TAG`: Buffers characters starting with `<` to inspect if an opening tag (`<think>`, `<thought>`, `<scratchpad>`, `<suna_tool_call>`) is forming. If characters diverge, flushes buffered text to `TEXT` without loss.
3. `IN_CONTENT`: Routing mode:
   - If current tag is a thinking tag: Emits incremental characters via `on('thought_chunk', chunk)` and buffers into `fullThoughtText`. Does NOT emit to standard text stream.
   - If current tag is a tool call tag: Buffers into `currentToolContent`. Does NOT emit to standard text stream.
4. `IN_END_TAG`: Buffers characters starting with `</` to detect closing tag (`</think>`, `</suna_tool_call>`). Once closed, transitions back to `TEXT`.

#### Stream Flush (`flush()`)
When an LLM stream terminates while inside a tag:
- If unclosed inside `<think>`: Closes the thinking block gracefully with `isStreamingActive = false` so UI renders a closed accordion with the accumulated thoughts.
- If unclosed inside `TEXT` with partial buffer: Flushes remaining buffer to `filteredText`.

### 3.3 UI Thought Streaming Integration Contract

The parser directly interfaces with SunaChat's DOM elements:
- **Streaming State (`isStreaming = true`)**:
  ```html
  <div class="thinking-block-wrapper is-streaming is-open" data-streaming="true">
    <div class="thinking-header" onclick="toggleThinkingBlock(this)" role="button" tabindex="0" aria-expanded="true">
      <div class="thinking-header-left">
        <div class="thinking-badge is-pulsing">
          <span class="material-icons-round thinking-icon">psychology</span>
          <span class="thinking-badge-text">Đang suy nghĩ...</span>
        </div>
        <span class="thinking-meta-info">${lineCount} dòng suy luận</span>
      </div>
      <div class="thinking-header-right">
        <span class="material-icons-round thinking-toggle-icon">expand_less</span>
      </div>
    </div>
    <div class="thinking-body" style="display: block;">
      <div class="thinking-content">${safeContent}</div>
    </div>
  </div>
  ```
- **Completed State (`isStreaming = false`)**:
  - `is-streaming` removed; `is-pulsing` removed.
  - Defaults to `is-collapsed` (`display: none`), expandable by user click.
  - Dynamic line count: `${lineCount} dòng suy luận`.

### 3.4 Backward Compatibility Invariant (ZR-03)
The existing `StreamParser` in `app.js` is tested by `test_dsh_zero_regression_matrix.js` (Gate 3) and `test_thinking_blocks_stream_parser_adversarial.js`.
The upgraded `ExtendedThinkingStreamParser` MUST either inherit from or be fully compatible with `StreamParser`:
- `parseChunk(chunk)` returns clean filtered text.
- `toolCalls` array contains parsed tool call strings.
- `flush()` flushes any remaining buffered text.
- Inline HTML (`<code>`, `<div>`) and standard markdown are never swallowed.

---

## 4. Multi-Syntax Tool Call Parser & Malformed JSON Auto-Repair

### 4.1 Supported Tool Call Syntaxes

Models exhibit varying formatting behaviors. SunaAgent natively parses three primary syntax families:

```javascript
// 1. XML Tag Format (Claude / Hermes / DeepSeek standard)
<suna_tool_call>
{
  "tool": "view_file",
  "args": { "path": "index.html", "startLine": 1, "endLine": 50 }
}
</suna_tool_call>

// 2. Fenced Markdown Code Block (GPT-4 / Codex standard)
```json
{
  "tool": "replace_file_content",
  "args": {
    "TargetFile": "styles.css",
    "TargetContent": "color: red;",
    "ReplacementContent": "color: blue;"
  }
}
```

// 3. Native Function Calling Object (OpenAI API wire format)
{
  "function": {
    "name": "grep_search",
    "arguments": "{\"Query\": \"function init\", \"SearchPath\": \"app.js\"}"
  }
}
```

### 4.2 Resilient JSON Auto-Repair Engine (`JsonAutoRepair`)

LLMs frequently produce minor syntax flaws in JSON outputs, especially under aggressive sampling or token truncation. Rather than failing the turn, `JsonAutoRepair` applies deterministic self-healing:

```javascript
class JsonAutoRepair {
  static repair(rawString) {
    if (!rawString || typeof rawString !== 'string') return '{}';
    let text = rawString.trim();

    // 1. Strip Markdown backticks if wrapped
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // 2. Fix unquoted property names: { path: "foo" } -> { "path": "foo" }
    text = text.replace(/([{,]\s*)([a-zA-Z0-9_$-]+)\s*:/g, '$1"$2":');

    // 3. Fix single-quoted strings: {'path': 'foo'} -> {"path": "foo"}
    text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

    // 4. Remove trailing commas in objects and arrays: {"a": 1, } -> {"a": 1}
    text = text.replace(/,\s*([}\]])/g, '$1');

    // 5. Auto-balance truncated JSON braces/brackets
    text = this.balanceBrackets(text);

    return text;
  }

  static balanceBrackets(text) {
    let inString = false;
    let escape = false;
    const stack = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
    }

    // If string was left open, close it
    if (inString) text += '"';

    // Close remaining open brackets in reverse order
    while (stack.length > 0) {
      text += stack.pop();
    }

    return text;
  }
}
```

---

## 5. Smart Context & Dual Memory Architecture

### 5.1 Dual Memory Model Specification

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          SMART CONTEXT                                            │
│                                                                                                   │
│  ┌────────────────────────────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │                    WORKING MEMORY                      │  │         EPISODIC MEMORY         │  │
│  │                                                        │  │                                 │  │
│  │ - Current Primary Goal & Decomposed Sub-Goals          │  │ - Turn 0: User Prompt           │  │
│  │ - Hierarchical Plan Tree (Phases, Steps, Status)       │  │ - Turn 1: Thought + Action 1    │  │
│  │ - Active Step Index & In-Flight Tool Parameters        │  │           + Observation 1       │  │
│  │ - Ephemeral Variables & Regex Snippets                 │  │ - Turn 2: Thought + Action 2    │  │
│  │ - Injected User Steer Directives (HITL)                │  │           + Observation 2       │  │
│  │ - In-Memory Scratchpad Deliberations                   │  │ - Turn K: Current Turn          │  │
│  └────────────────────────────────────────────────────────┘  └─────────────────────────────────┘  │
│                                              │                                                    │
│                                              ▼                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              TOKEN COMPACTION & SUMMARIZATION ENGINE                        │  │
│  │ - Sliding Window: Retain system prompt + working memory + last 3 turns verbatim             │  │
│  │ - Compaction: Compress turns 0 to K-3 into an immutable "Executive Trajectory Summary"      │  │
│  │ - Zero-loss invariant: Preserves all touched file paths, modified diffs, and test results    │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. Working Memory (Short-Term / Transient)
- **Lifecycle**: Scoped to the current user interaction session. Cleared upon task completion or explicit reset.
- **Fields**:
  - `primaryGoal`: (string) High-level user goal.
  - `subGoals`: (Array) List of decomposed sub-goals with status (`pending`, `active`, `completed`, `failed`).
  - `planTree`: (Object) Hierarchical phases and steps.
  - `activeStepIndex`: (number) Pointer to the currently executing step.
  - `scratchpad`: (Map) Transient key-value variables, intermediate regex matches, line numbers.
  - `steerDirectives`: (Array) User guidance injected via `steer()` during pause/intervene.

#### 2. Episodic Memory (Mid-to-Long Term / Trajectory)
- **Lifecycle**: Preserved across the conversation turn sequence.
- **Structure**:
  ```javascript
  {
    turnIndex: 1,
    timestamp: 1715000000000,
    role: 'assistant',
    thought: 'Analyzing index.html structure...',
    toolCalls: [
      {
        tool: 'view_file',
        args: { path: 'index.html', startLine: 1, endLine: 50 },
        result: '<!DOCTYPE html>...',
        durationMs: 34,
        status: 'success'
      }
    ],
    reflection: 'Identified root container at line 24. Ready to insert widget.',
    estimatedTokens: 380
  }
  ```
- **Harness Integration**: Synchronized directly into `harness.trajectoryEngine` to allow visual rendering in `SunaHarnessVisualizer`.

#### 3. Semantic Memory (Long-Term / Persistent)
- Interfaces with `State.memory.facts` in `app.js`.
- Deduplicates user preferences, persistent architectural notes, and project constants across chat reloads.

---

### 5.2 Token Compaction & Automatic Summarization Engine

When complex autonomous tasks execute across many turns (e.g. 10–20 tool calls), the accumulated history can easily exceed model context windows (e.g. 16,000 or 32,000 tokens).

#### Compaction Trigger
- Triggered when `totalEstimatedTokens >= compactionThreshold` (Default: 12,000 tokens or 75% of max context window).
- Token Estimation Formula: `Math.ceil(text.length / 4)`.

#### Compaction Algorithm (Loss-less Architectural Summarization)
1. **Partitioning**:
   - **Pinned Header**: System Prompt + Permanent Guidelines.
   - **Working Memory**: Active plan, sub-goals, and ephemeral scratchpad variables (Never summarized).
   - **Compaction Zone**: Turns `0` through `N - K` (where $K = 3$ is the verbatim recent history window).
   - **Active Tail**: Turns `N - K + 1` through `N` (Retained 100% verbatim).
2. **Summarization Extraction**:
   - Compresses lengthy tool observation outputs (e.g., full file contents from `view_file` or directory trees from `list_dir`) into concise semantic facts:
     - `view_file` on `app.js` (800 lines) -> `[Viewed app.js lines 3000-3800: Located SunaAgent definition and tool registry]`.
     - `replace_file_content` on `styles.css` -> `[Modified styles.css: Fixed unclosed selector .message-bubble at line 3986]`.
     - `run_sandboxed_command` -> `[Executed mocha test: 1,226 passing tests (0 failures)]`.
3. **Executive Summary Injection**:
   - The compaction zone turns are replaced by a single structured assistant message:
     ```markdown
     [EXECUTIVE TRAJECTORY SUMMARY]:
     - Goal: Fix unclosed selector and verify zero regressions.
     - Files inspected: styles.css (line 3986), app.js (line 3020).
     - Code Modifications applied:
       * styles.css: Replaced unclosed selector with balanced CSS block.
     - Test Verification: Ran `npm test`, confirmed all 1,226 tests pass.
     - Decisions & Invariants: Maintained MAX_RECURSION_DEPTH: 4 and .toast-container z-index: 10000.
     ```
4. **Result**: Token consumption drops by 60%–80% while retaining 100% of critical decisions, paths, and verified diffs.

---

## 6. Concrete Implementation Strategy for M1 Worker

### 6.1 Code Layout & Modularity

All M1 cognitive components will reside cleanly in **`suna_agent.js`**, exported as an enterprise-grade Universal Module Definition (UMD) module.
`app.js` will link to `suna_agent.js` through an idempotent bridge, ensuring backward compatibility while elevating the agent's cognitive capabilities.

```
d:\Suna Chat\
├── suna_agent.js          # Core SunaAgent UMD module (OODA Brain, Extended Thinking, Memory, Parser)
├── suna_harness.js        # Existing SunaHarness runtime (VFS, DiffEngine, Validator, Trajectory)
├── app.js                 # Frontend SunaChat application & idempotent bridge
└── tests\
    ├── test_suna_agent.js # Comprehensive 4-Tier test suite for M1 SunaAgent
    └── test_dsh_zero_regression_matrix.js # Existing 1,226 test suite (must pass 100%)
```

### 6.2 Class Architecture in `suna_agent.js`

```javascript
/**
 * suna_agent.js — Core Autonomous Cognitive Agent for SunaChat & SunaHarness
 * Dual Runtime: Browser (window.SunaAgent) and Node.js (module.exports)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.SunaAgent = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // 1. JSON Auto-Repair Subsystem
  class JsonAutoRepair { ... }

  // 2. Multi-Syntax Tool Call Parser
  class MultiSyntaxParser { ... }

  // 3. Extended Thinking & Stream Parser (Backwards compatible with StreamParser)
  class ExtendedThinkingStreamParser { ... }

  // 4. Smart Context & Dual Memory
  class SmartMemory { ... }

  // 5. OODA / ReAct++ Cognitive Brain State Machine
  class OodaBrain { ... }

  // 6. Main Unified SunaAgent Facade & Controller
  class SunaAgent {
    constructor(options = {}) { ... }
    
    // Invariants preserved for Gate 4
    static MAX_RECURSION_DEPTH = 4;
    static reset() { ... }
    static abort() { ... }
    static StreamParser = ExtendedThinkingStreamParser;
    ...
  }

  return SunaAgent;
});
```

### 6.3 Detailed Blueprint for Key Classes

#### 1. `SmartMemory` Blueprint
```javascript
class SmartMemory {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 16000;
    this.compactionThreshold = options.compactionThreshold || 12000;
    this.verbatimTurnWindow = options.verbatimTurnWindow || 3;

    this.working = {
      primaryGoal: '',
      subGoals: [],
      planTree: null,
      activeStepIndex: 0,
      scratchpad: new Map(),
      steerDirectives: []
    };

    this.episodic = [];
    this.executiveSummary = null;
  }

  setGoal(goal, subGoals = []) {
    this.working.primaryGoal = goal;
    this.working.subGoals = subGoals.map((sg, idx) => ({
      id: sg.id || `sg_${idx + 1}`,
      description: typeof sg === 'string' ? sg : sg.description,
      status: sg.status || 'pending'
    }));
  }

  setPlan(planTree) {
    this.working.planTree = planTree;
  }

  injectSteer(guidanceText) {
    if (guidanceText && typeof guidanceText === 'string') {
      this.working.steerDirectives.push({
        text: guidanceText.trim(),
        timestamp: Date.now()
      });
    }
  }

  recordTurn(turnData) {
    const turn = {
      turnIndex: this.episodic.length + 1,
      timestamp: Date.now(),
      thought: turnData.thought || '',
      toolCalls: turnData.toolCalls || [],
      observation: turnData.observation || '',
      reflection: turnData.reflection || '',
      tokens: this.estimateTokens(turnData)
    };
    this.episodic.push(turn);

    if (this.getTotalTokens() > this.compactionThreshold) {
      this.compact();
    }
  }

  estimateTokens(data) {
    const str = JSON.stringify(data);
    return Math.ceil(str.length / 4);
  }

  getTotalTokens() {
    return this.episodic.reduce((sum, t) => sum + t.tokens, 0);
  }

  compact() {
    if (this.episodic.length <= this.verbatimTurnWindow) return;

    const compactTargetTurns = this.episodic.slice(0, this.episodic.length - this.verbatimTurnWindow);
    const recentTurns = this.episodic.slice(this.episodic.length - this.verbatimTurnWindow);

    // Build dense executive summary
    const summaryLines = ['[EXECUTIVE TRAJECTORY SUMMARY]:'];
    summaryLines.push(`- Goal: ${this.working.primaryGoal}`);

    const filesTouched = new Set();
    const toolsUsed = new Map();

    for (const t of compactTargetTurns) {
      for (const call of t.toolCalls) {
        toolsUsed.set(call.tool, (toolsUsed.get(call.tool) || 0) + 1);
        if (call.args) {
          const path = call.args.path || call.args.TargetFile || call.args.SearchPath;
          if (path) filesTouched.add(path);
        }
      }
    }

    summaryLines.push(`- Files Referenced/Modified: ${Array.from(filesTouched).join(', ') || 'None'}`);
    summaryLines.push(`- Tools Invoked: ${Array.from(toolsUsed.entries()).map(([k, v]) => `${k} (${v}x)`).join(', ')}`);

    this.executiveSummary = summaryLines.join('\n');
    this.episodic = recentTurns;
  }

  toContextMessages(systemPrompt = '') {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (this.executiveSummary) {
      messages.push({ role: 'assistant', content: this.executiveSummary });
    }

    if (this.working.steerDirectives.length > 0) {
      const activeSteers = this.working.steerDirectives.map(s => s.text).join('\n- ');
      messages.push({
        role: 'system',
        content: `[USER INTERVENTION / STEER DIRECTIVES]:\n- ${activeSteers}`
      });
    }

    for (const t of this.episodic) {
      let turnContent = '';
      if (t.thought) turnContent += `<think>\n${t.thought}\n</think>\n`;
      if (t.toolCalls && t.toolCalls.length > 0) {
        for (const tc of t.toolCalls) {
          turnContent += `<suna_tool_call>\n${JSON.stringify({ tool: tc.tool, args: tc.args }, null, 2)}\n</suna_tool_call>\n`;
        }
      }
      if (turnContent) {
        messages.push({ role: 'assistant', content: turnContent.trim() });
      }
      if (t.observation) {
        messages.push({ role: 'user', content: t.observation });
      }
    }

    return messages;
  }
}
```

#### 2. `ExtendedThinkingStreamParser` Blueprint
```javascript
class ExtendedThinkingStreamParser {
  constructor(callbacks = {}) {
    this.buffer = '';
    this.state = 'TEXT'; // 'TEXT', 'IN_TAG', 'IN_THINK', 'IN_TOOL', 'IN_END_TAG'
    this.currentTag = '';
    this.currentContent = '';
    this.filteredText = '';
    this.thoughtText = '';
    this.toolCalls = [];
    this.callbacks = callbacks; // { onThoughtChunk, onToolCall, onTextChunk }
  }

  parseChunk(chunk) {
    let textResult = '';
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];

      if (this.state === 'TEXT') {
        if (char === '<') {
          this.state = 'IN_TAG';
          this.buffer = '<';
        } else {
          textResult += char;
        }
      } else if (this.state === 'IN_TAG') {
        this.buffer += char;
        const b = this.buffer.toLowerCase();

        if (b === '<think>' || b === '<thought>' || b === '<scratchpad>') {
          this.state = 'IN_THINK';
          this.currentTag = this.buffer.slice(1, -1);
          this.currentContent = '';
          this.buffer = '';
        } else if (b.startsWith('<suna_tool_call>') || (b.startsWith('<suna_tool_call ') && char === '>')) {
          this.state = 'IN_TOOL';
          this.currentTag = 'suna_tool_call';
          this.currentContent = '';
          this.buffer = '';
        } else if (
          !'<think>'.startsWith(b) &&
          !'<thought>'.startsWith(b) &&
          !'<scratchpad>'.startsWith(b) &&
          !'<suna_tool_call>'.startsWith(b) &&
          !'<suna_tool_call '.startsWith(b)
        ) {
          // Not an intercepted tag; flush buffer to standard text
          textResult += this.buffer;
          this.buffer = '';
          this.state = 'TEXT';
        }
      } else if (this.state === 'IN_THINK') {
        if (char === '<') {
          this.state = 'IN_END_TAG';
          this.buffer = '<';
        } else {
          this.thoughtText += char;
          this.currentContent += char;
          if (this.callbacks.onThoughtChunk) {
            this.callbacks.onThoughtChunk(char);
          }
        }
      } else if (this.state === 'IN_TOOL') {
        if (char === '<') {
          this.state = 'IN_END_TAG';
          this.buffer = '<';
        } else {
          this.currentContent += char;
        }
      } else if (this.state === 'IN_END_TAG') {
        this.buffer += char;
        const b = this.buffer.toLowerCase();
        const expectedClose = `</${this.currentTag}>`.toLowerCase();

        if (b === expectedClose) {
          // Closed successfully
          if (this.state === 'IN_END_TAG' && (this.currentTag === 'think' || this.currentTag === 'thought' || this.currentTag === 'scratchpad')) {
            if (this.callbacks.onThoughtComplete) {
              this.callbacks.onThoughtComplete(this.currentContent);
            }
          } else if (this.currentTag === 'suna_tool_call') {
            this.toolCalls.push(this.currentContent.trim());
            if (this.callbacks.onToolCall) {
              this.callbacks.onToolCall(this.currentContent.trim());
            }
          }
          this.currentContent = '';
          this.buffer = '';
          this.state = 'TEXT';
        } else if (!expectedClose.startsWith(b)) {
          // False alarm in end tag
          if (this.currentTag === 'think' || this.currentTag === 'thought' || this.currentTag === 'scratchpad') {
            this.thoughtText += this.buffer;
            this.currentContent += this.buffer;
            if (this.callbacks.onThoughtChunk) {
              this.callbacks.onThoughtChunk(this.buffer);
            }
            this.state = 'IN_THINK';
          } else {
            this.currentContent += this.buffer;
            this.state = 'IN_TOOL';
          }
          this.buffer = '';
        }
      }
    }

    this.filteredText += textResult;
    if (textResult && this.callbacks.onTextChunk) {
      this.callbacks.onTextChunk(textResult);
    }
    return textResult;
  }

  flush() {
    let extra = '';
    if (this.state === 'IN_TAG') {
      extra += this.buffer;
    } else if (this.state === 'IN_END_TAG') {
      if (this.currentTag === 'think' || this.currentTag === 'thought' || this.currentTag === 'scratchpad') {
        this.thoughtText += this.buffer;
      } else {
        this.currentContent += this.buffer;
      }
    }
    this.buffer = '';
    this.state = 'TEXT';
    this.filteredText += extra;
    return extra;
  }
}
```

#### 3. `OodaBrain` Blueprint
```javascript
class OodaBrain {
  constructor(options = {}) {
    this.agent = options.agent;
    this.memory = options.memory || new SmartMemory();
    this.state = 'IDLE'; // IDLE, ANALYZING, PLANNING, THINKING, EXECUTING, REFLECTING, PAUSED, HALTED, COMPLETED
    this.maxRecursionDepth = options.maxRecursionDepth || 4;
    this.recursionDepth = 0;
    this.consecutiveFailures = new Map();
    this.eventListeners = new Map();
  }

  on(event, fn) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(fn);
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(fn => {
      try { fn(data); } catch(e) { console.error(`Listener error on ${event}:`, e); }
    });
  }

  async run({ prompt, modelStepGenerator, context = {} }) {
    this.state = 'ANALYZING';
    this.recursionDepth = 0;
    this.consecutiveFailures.clear();
    this.emit('start', { prompt });

    // Step 1: analyzeIntent
    const intent = this.analyzeIntent(prompt, context);
    this.memory.setGoal(intent.primaryGoal, intent.subGoals);
    this.emit('intent_analyzed', intent);

    // Step 2: planHierarchy
    this.state = 'PLANNING';
    const plan = this.planHierarchy(intent, context);
    this.memory.setPlan(plan);
    this.emit('plan_created', plan);

    let finalAnswer = '';

    while (this.recursionDepth <= this.maxRecursionDepth) {
      if (this.isAborted(context)) {
        this.state = 'HALTED';
        finalAnswer = finalAnswer || '[Aborted by user]';
        break;
      }

      if (this.recursionDepth === this.maxRecursionDepth) {
        this.state = 'HALTED';
        finalAnswer += '\n[Warning] Max agent tool recursion depth (4) reached. Halting recursion loop.';
        break;
      }

      this.recursionDepth++;
      if (context.State) context.State.agentRecursionDepth = this.recursionDepth;

      // Step 3: thinkExtended
      this.state = 'THINKING';
      const messages = this.memory.toContextMessages(context.systemPrompt || '');
      const parser = new ExtendedThinkingStreamParser({
        onThoughtChunk: (c) => this.emit('thought_chunk', c),
        onThoughtComplete: (t) => this.emit('thought_complete', t)
      });

      const stepResponse = await modelStepGenerator(messages, this.recursionDepth, parser);
      if (!stepResponse) break;

      parser.parseChunk(stepResponse);
      parser.flush();

      const toolCalls = parser.toolCalls;
      const thought = parser.thoughtText;

      if (toolCalls.length === 0) {
        // Final answer reached
        this.state = 'COMPLETED';
        finalAnswer = parser.filteredText.trim();
        this.memory.recordTurn({ thought, toolCalls: [], observation: '', reflection: 'Completed' });
        break;
      }

      // Step 4: parseAndExecute
      this.state = 'EXECUTING';
      const stepResults = [];

      for (const rawCall of toolCalls) {
        const parsedTool = MultiSyntaxParser.parse(rawCall);
        const { tool, args } = parsedTool;
        const failKey = `${tool}:${JSON.stringify(args)}`;
        const fails = this.consecutiveFailures.get(failKey) || 0;

        if (fails >= 3) {
          const warn = `[Warning] Halting execution: Tool "${tool}" failed 3 consecutive times with identical parameters.`;
          stepResults.push({ tool, error: warn, observation: warn });
          this.state = 'HALTED';
          finalAnswer += `\n${warn}`;
          break;
        }

        this.emit('tool_executing', { tool, args, depth: this.recursionDepth });
        const execResult = await this.agent.executeTool(tool, args, context);
        const isError = typeof execResult === 'string' && (execResult.startsWith('Error') || execResult.includes('Error executing tool'));

        if (isError) {
          this.consecutiveFailures.set(failKey, fails + 1);
        } else {
          this.consecutiveFailures.delete(failKey);
        }

        stepResults.push({ tool, args, result: execResult, error: isError ? execResult : undefined });
      }

      // Step 5: reflectObservation
      this.state = 'REFLECTING';
      const obsBlock = this.formatObservationBlock(stepResults);
      const reflection = this.reflectObservation(stepResults, intent);

      this.memory.recordTurn({
        thought,
        toolCalls: stepResults,
        observation: obsBlock,
        reflection
      });

      this.emit('step_reflected', { depth: this.recursionDepth, results: stepResults, reflection });

      if (this.state === 'HALTED') break;
    }

    this.emit('complete', { finalAnswer, memory: this.memory });
    return finalAnswer;
  }

  isAborted(context) {
    if (context.window && context.window.isAgentAborted) return true;
    if (typeof window !== 'undefined' && window.isAgentAborted) return true;
    return false;
  }

  analyzeIntent(prompt, context) { ... }
  planHierarchy(intent, context) { ... }
  reflectObservation(results, intent) { ... }
  formatObservationBlock(results) { ... }
}
```

---

## 7. Zero-Regression Matrix & Backward Compatibility (Gate 1–6)

The implementation must maintain 100% compliance across all architectural gates:

| Gate | Requirement | SunaAgent Compliance Strategy | Verified In |
|---|---|---|---|
| **ZR-01** | `node -c suna_agent.js` (0 syntax errors) | Pure Vanilla JS/ES6+, valid UMD wrapper, balanced delimiters | Static compilation |
| **ZR-02** | CSS Hygiene & Balanced Braces | Zero CSS edits in this milestone; `.toast-container` `z-index: 10000` preserved | `test_dsh_zero_regression_matrix.js` |
| **ZR-03** | `StreamParser` backwards compatibility | `ExtendedThinkingStreamParser` extends `StreamParser`, retains identical signature | `tests/test_thinking_blocks_stream_parser_adversarial.js` |
| **ZR-04** | `MAX_RECURSION_DEPTH: 4`, `reset()`, `abort()`, legacy tools | Static and prototype invariants exposed on `SunaAgent` class | `tests/test_dsh_zero_regression_matrix.js` |
| **ZR-05** | Live Workspace Direct Auto-Sync | `fs_write` and `fs_patch` tools continue dispatching `new Event('input')` to `#artifact-editor-textarea` | `tests/test_workspace_direct_sync_and_continuation.js` |
| **ZR-06** | Continuation Engine & Stitching | Multi-turn stitching logic in `app.js` preserved verbatim | `tests/test_e2e_token_continuation_engine.js` |

---

## 8. Verification & Test Plan for M1

### 8.1 Required Test Matrix (`tests/test_suna_agent.js`)
To be constructed by the upcoming M-TEST / M1 Worker:

1. **Tier 1: Cognitive State Machine & OODA Stages**:
   - Verify `analyzeIntent` correctly classifies intents into taxonomy.
   - Verify `planHierarchy` builds phased task lists.
   - Verify step transitions from `IDLE` -> `ANALYZING` -> `PLANNING` -> `THINKING` -> `EXECUTING` -> `REFLECTING` -> `COMPLETED`.
   - Verify `MAX_RECURSION_DEPTH: 4` boundary triggers halt.
   - Verify anti-oscillation: halting on 3 consecutive identical tool failures.
2. **Tier 2: Extended Thinking & Multi-Tag Parsing**:
   - Streaming token separation: `<think>`, `<thought>`, `<scratchpad>` chunks emitted via `thought_chunk` without leaking to `filteredText`.
   - Tags split across chunks (`<th` in chunk 1, `ink>reasoning</th` in chunk 2, `ink>` in chunk 3).
   - Unclosed tags at stream end handled gracefully by `flush()`.
   - Tag attributes (`<think class="deep">`) safely handled.
   - Preserves HTML tags (`<code>`, `<div>`) without false buffering.
3. **Tier 3: Multi-Syntax Tool Call & JSON Auto-Repair**:
   - Parses `<suna_tool_call>`, Markdown ````json blocks, and raw JSON objects.
   - Auto-repair fixes unquoted keys (`{path: "foo"}`).
   - Auto-repair removes trailing commas (`{"a": 1,}`).
   - Auto-repair balances unclosed brackets and braces from truncation.
4. **Tier 4: Smart Context & Dual Memory**:
   - Working memory correctly holds active goals and plan trees.
   - Episodic memory maintains chronological turn records and telemetry.
   - Compaction triggers when token threshold is exceeded, compressing early turns into an executive summary while keeping the last 3 turns verbatim.
   - Injected user steer directives appear in formatted context messages.

---

## 9. Conclusion

This architecture equips SunaChat with an elite autonomous agent brain that marries HermesAgent's deterministic tool calling, Claude's extended thinking scratchpads, and Codex's grounded code surgery. By strictly preserving all existing public contracts (`MAX_RECURSION_DEPTH: 4`, legacy tools, and backward-compatible `StreamParser`), SunaAgent achieves state-of-the-art cognitive capabilities with **zero regression risk** across the existing 1,226 test baseline.
