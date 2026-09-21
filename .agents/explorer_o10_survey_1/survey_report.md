# Technical Survey & Root-Cause Analysis Report
## Milestone R1: Suna Agent Lifecycle & Core

- **Author**: Explorer Agent (`explorer_o10_survey_1`)
- **Target System**: SunaAgent (`suna_agent.js`), SunaHarness (`suna_harness.js`)
- **Working Directory**: `d:\Suna Chat\.agents\explorer_o10_survey_1`
- **Date**: 2026-09-20
- **Integrity Mode**: Development (Read-Only Analysis)

---

## Executive Summary

This deep technical investigation provides exact root-cause diagnoses, line-number citations, empirical proof, and architectural remediation designs for the five core lifecycle and parser defects specified under Requirement R1:
1. **SunaAgent Standalone Execution & Default VFS/Tool Registry**: Inability to run standalone without an external harness due to uninitialized `vfs` (`null`), missing ACI tool registrations, and an eager check in `invokeAciTool`.
2. **Multi-Step ReAct Loop in `_runLegacy`**: Premature termination after turn 1 caused by missing `currentStepIndex` tracking, executing only `plan[0]` on each turn, and an unconditional `break` upon step satisfaction.
3. **HITL `agent.steer()` Recovery from Circuit Breaker**: Failure of `steer()` to unabort the agent (`isAgentAborted` remains `true`, `status` remains `'halted'`), leaving the agent permanently locked in a halted state.
4. **`MultiSyntaxParser` Tool Call vs. JSON Data Collision**: Overly permissive regex and property check (`parsed.tool || parsed.name`) causing standard JSON data (such as `package.json` with `"name": "suna-chat"`) to be parsed as executable tool calls.
5. **`_boundObservation` Error & `isError` Erasure on Long Outputs (>1500 chars)**: Truncation replacing structured error objects with plain strings, causing `reflectObservation` to misclassify severe errors as `"succeeded cleanly"`.

---

## 1. SunaAgent.run() & Constructor Default VFS / Registry

### 1.1 File Location & Line Numbers
- **Primary file**: `d:\Suna Chat\suna_agent.js`
  - Constructor: lines 1091–1132
  - Legacy tool initialization: lines 1170–1210
  - `invokeAciTool`: lines 1577–1645 (specifically line 1578)
  - `attachHarness`: lines 1533–1563
  - `run()`: lines 1947–2070
- **Secondary file**: `d:\Suna Chat\suna_harness.js`
  - `registerAciTools`: lines 8644–8750
  - Static attachment attempt: lines 33–41 in `suna_agent.js`

### 1.2 Existing Code Analysis
In `suna_agent.js` lines 1106–1112:
```javascript
this.memory = new SmartMemory(options);
this.brain = new OodaBrain(options);
this.harness = null;
this.vfs = null;
this.controller = null;
this.trajectory = null;
this.checkpoints = null;
this.eventBus = null;
```
Notice:
1. `this.vfs` is hardcoded to `null` even if `options.vfs` is supplied to `new SunaAgent(options)`.
2. At lines 33–38 of `suna_agent.js`:
   ```javascript
   const localHarness = require('./suna_harness.js');
   if (localHarness && typeof localHarness.registerAciTools === 'function') {
     localHarness.registerAciTools(SunaAgent);
   }
   ```
   `localHarness.registerAciTools(SunaAgent)` attempts to register tools on the **class** `SunaAgent`. In `suna_harness.js` line 8645:
   ```javascript
   if (!sunaAgent || typeof sunaAgent.registerTool !== 'function') {
     return false;
   }
   ```
   Because `SunaAgent` (the class) does not have a static `registerTool` method, this call returns `false` and is a complete no-op!
3. In `constructor`: only `this._initLegacyTools()` is called (line 1131), which registers only 6 legacy tools (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`, `sandbox_exec`).
4. In `invokeAciTool` (line 1578):
   ```javascript
   async invokeAciTool(toolName, rawArgs, executionOptions = {}) {
     if (!this.vfs) throw new Error('Harness VFS not attached');
   ```

### 1.3 Why `run()` Fails / Throws
When an agent is created as `const agent = new SunaAgent()`, calling `agent.run('Inspect files')`:
- `this.vfs` is `null`.
- `this._registry` lacks `view_file`, `list_dir`, `grep_search`, `replace_file_content`, `find_by_name`, `run_sandboxed_command`.
- As soon as the step execution invokes `invokeAciTool`, line 1578 immediately throws:
  `Error: Harness VFS not attached`.
- Every turn fails with this error. After 3 consecutive failures, the runaway circuit breaker trips, permanently halting the agent with:
  `haltReason: 'Tool "list_dir" failed 3 consecutive times with identical parameters.'`.

### 1.4 Remediation Blueprint
In `suna_agent.js`:
1. **In `constructor(options = {})`**:
   - Accept `options.vfs`. If not provided, dynamically resolve `getHarnessComponents()` and instantiate default `VfsSandbox` (`this.vfs = options.vfs || (H && H.VfsSandbox ? new H.VfsSandbox() : null)`).
   - If `H && typeof H.registerAciTools === 'function'`, register the 6 standard ACI tools onto `this`.
   - Also set `this._harnessVfs = this.vfs`.
2. **In `run(prompt, options = {})`**:
   - Add self-healing check:
     ```javascript
     if (!this.vfs) {
       const H = getHarnessComponents();
       if (H && H.VfsSandbox) this.vfs = new H.VfsSandbox();
       this._harnessVfs = this.vfs;
     }
     if (this.vfs && (!this.tools['view_file'] || !this.tools['list_dir'])) {
       const H = getHarnessComponents();
       if (H && typeof H.registerAciTools === 'function') {
         H.registerAciTools(this);
       }
     }
     ```
3. **In `invokeAciTool`**:
   - If `!this.vfs && this._harnessVfs`, link `this.vfs = this._harnessVfs`. If still null, instantiate fallback `VfsSandbox`.

---

## 2. Multi-Step ReAct Loop in `_runLegacy`

### 2.1 File Location & Line Numbers
- **File**: `d:\Suna Chat\suna_agent.js`
  - `_runLegacy`: lines 2130–2175
  - Delegation from `run()`: lines 1947–1951
  - Single-step selection in `executeStep`: lines 1754–1765

### 2.2 Existing Code Analysis
Lines 2135–2163 in `suna_agent.js`:
```javascript
while (turn < maxTurns) {
  turn++;
  ...
  let currentPrompt = prompt;
  const latestSteer = this.memory && typeof this.memory.getFact === 'function' && this.memory.getFact('latest_steer');
  if (latestSteer) currentPrompt = `${prompt}\n[User Steer Guidance]: ${latestSteer}`;
  const stepResult = await this.executeStep(currentPrompt, { maxObservationChars: options.maxObservationChars });
  turnResults.push(stepResult);
  ...
  const reflection = stepResult.reflection;
  if (reflection && reflection.satisfied === false && reflection.replanNeeded) {
    if (turn >= maxTurns) finalStatus = 'max_turns_exceeded';
    continue;
  }
  finalStatus = 'completed';
  break;
}
```

Now look at what `executeStep` does at lines 1759–1764:
```javascript
// 1. Cognitive Brain OODA: Analyze Intent
intent = this.brain.analyzeIntent(promptText);

// 2. Cognitive Brain OODA: Plan Hierarchy (with promptText for dynamic extraction)
plan = this.brain.planHierarchy(intent, promptText);
activeStep = (plan && plan[0]) || { id: 1, name: 'default_step', tool: 'view_file', params: { path: 'index.html' } };
```

### 2.3 The Exact Premature Termination Bug
1. `OodaBrain.planHierarchy` (lines 1021–1049) produces multi-step plans. For example, for a `bug_fix` intent, it creates 3 steps:
   - Step 1: `inspect_source` (`view_file`)
   - Step 2: `perform_surgery` (`replace_file_content`)
   - Step 3: `verify_fix` (`run_sandboxed_command`)
2. In `_runLegacy`, on turn 1, `this.executeStep(currentPrompt)` is invoked.
3. `executeStep` only picks `activeStep = plan[0]` (`inspect_source`).
4. Step 1 executes successfully. `stepResult.reflection` has `satisfied: true, replanNeeded: undefined`.
5. `_runLegacy` checks:
   `if (reflection && reflection.satisfied === false && reflection.replanNeeded)` -> evaluates to `false`!
6. It then immediately hits:
   ```javascript
   finalStatus = 'completed';
   break;
   ```
7. The loop unconditionally exits on turn 1!
8. `turnsExecuted` is 1, and steps 2 and 3 are never executed.

### 2.4 Remediation Blueprint
In `_runLegacy(prompt, options = {})`:
```javascript
async _runLegacy(prompt, options = {}) {
  const maxTurns = options.maxTurns || (this.controller && this.controller.maxTurns) || 10;
  let turn = 0;
  let finalStatus = 'completed';
  const turnResults = [];

  // 1. Initial hierarchical plan decomposition
  let currentPrompt = prompt;
  const latestSteer = this.memory && typeof this.memory.getFact === 'function' && this.memory.getFact('latest_steer');
  if (latestSteer) currentPrompt = `${prompt}\n[User Steer Guidance]: ${latestSteer}`;

  const intent = this.brain.analyzeIntent(currentPrompt);
  let plan = this.brain.planHierarchy(intent, currentPrompt);
  if (!Array.isArray(plan) || plan.length === 0) {
    plan = [{ id: 1, name: 'default_step', tool: 'view_file', params: { path: 'index.html' } }];
  }
  let currentStepIndex = 0;

  while (turn < maxTurns && currentStepIndex < plan.length) {
    turn++;
    if (this.isAgentAborted || this.status === 'halted') {
      finalStatus = 'halted';
      break;
    }
    if (typeof options.onTurnStart === 'function') {
      try { options.onTurnStart(turn); } catch (_) {}
    }

    // Check for updated steer guidance on subsequent turns
    const activeSteer = this.memory && typeof this.memory.getFact === 'function' && this.memory.getFact('latest_steer');
    const activeStep = Object.assign({}, plan[currentStepIndex]);
    if (activeSteer) {
      activeStep.thought = (activeStep.thought || activeStep.name) + ` [Steer: ${activeSteer}]`;
    }

    // Execute the specific step in sequence
    const stepResult = await this.executeStep(activeStep, { maxObservationChars: options.maxObservationChars });
    turnResults.push(stepResult);

    if (typeof options.onStep === 'function') {
      try { options.onStep(stepResult, turn); } catch (_) {}
    }

    if (stepResult.halted || this.status === 'halted' || this.isAgentAborted) {
      finalStatus = 'halted';
      break;
    }

    const reflection = stepResult.reflection;
    if (reflection && reflection.satisfied === false && reflection.replanNeeded) {
      if (turn >= maxTurns) {
        finalStatus = 'max_turns_exceeded';
        break;
      }
      // Replan: recalculate plan from failure reflection
      const remediatedIntent = this.brain.analyzeIntent(`${currentPrompt} (Remediating: ${reflection.reflectionText})`);
      const newSteps = this.brain.planHierarchy(remediatedIntent, currentPrompt);
      if (newSteps && newSteps.length > 0) {
        plan = newSteps;
        currentStepIndex = 0;
      }
      continue;
    }

    // Step succeeded cleanly -> advance step pointer
    currentStepIndex++;
  }

  if (currentStepIndex < plan.length && finalStatus === 'completed') {
    finalStatus = turn >= maxTurns ? 'max_turns_exceeded' : 'halted';
  }

  const result = {
    status: finalStatus,
    turnsExecuted: turn,
    results: turnResults,
    trajectory: (this.trajectory && typeof this.trajectory.getEvents === 'function') ? this.trajectory.getEvents() : [],
    haltReason: this.haltReason || null
  };
  if (typeof options.onComplete === 'function') {
    try { options.onComplete(result); } catch (_) {}
  }
  return result;
}
```

---

## 3. Human-in-the-Loop `agent.steer()` Unabort & Idle Recovery

### 3.1 File Location & Line Numbers
- **File**: `d:\Suna Chat\suna_agent.js`
  - `steer()` definition: lines 1695–1705
  - Circuit breaker trips: lines 1865–1867, 1887–1889, 1901–1903
  - Pre-condition gate in `executeStep`: lines 1708–1715
  - Pre-condition gate in `run`: line 1980

### 3.2 Existing Code Analysis
In `suna_agent.js` lines 1695–1705:
```javascript
steer(instruction) {
  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) return false;
  const trimmed = instruction.trim();
  this.steerInstructions.push(trimmed);
  this.memory.setFact('latest_steer', trimmed);
  // Reset failure counter when human operator provides new direction
  this.consecutiveFailures = 0;
  this.haltReason = null;
  this.emit('steer_applied', { instruction: trimmed });
  return true;
}
```

When circuit breaker trips (e.g. line 1865):
```javascript
this.status = 'halted';
this.isAgentAborted = true;
this.haltReason = haltReason;
```

And in `executeStep` lines 1708–1715:
```javascript
// 0. Circuit Breaker / Abort Pre-condition: refuse execution if already halted
if (this.status === 'halted' || this.isAgentAborted) {
  return {
    status: 'halted',
    halted: true,
    reason: this.haltReason || 'Circuit breaker tripped: execution is halted.'
  };
}
```

### 3.3 The Root Cause
When the circuit breaker trips:
1. `this.status` is set to `'halted'`.
2. `this.isAgentAborted` is set to `true`.
3. The human operator calls `agent.steer('Pivot to other file')`.
4. `steer()` resets `this.consecutiveFailures = 0` and `this.haltReason = null`.
5. **CRITICAL DEFECT**: `steer()` does **NOT** reset `this.status` (`'halted'`) and does **NOT** reset `this.isAgentAborted` (`true`)!
6. It also does not call `this.guardrails.reset()`, nor does it clear `window.isAgentAborted`.
7. As a result, subsequent calls to `executeStep` or `run()` immediately trigger the circuit breaker pre-condition check (`this.status === 'halted' || this.isAgentAborted`) and abort instantly. The agent is permanently bricked.

### 3.4 Remediation Blueprint
In `suna_agent.js` lines 1695–1705, upgrade `steer()`:
```javascript
steer(instruction) {
  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) return false;
  const trimmed = instruction.trim();
  this.steerInstructions.push(trimmed);
  this.memory.setFact('latest_steer', trimmed);
  
  // Fully unabort and restore operational state from halted / circuit breaker trip
  this.consecutiveFailures = 0;
  this.haltReason = null;
  this.isAgentAborted = false;
  if (typeof window !== 'undefined') {
    window.isAgentAborted = false;
  }
  if (this.guardrails && typeof this.guardrails.reset === 'function') {
    this.guardrails.reset();
  }
  if (this.status === 'halted') {
    this.status = 'idle';
    this.emit('status_change', { status: 'idle' });
  }

  this.emit('steer_applied', { instruction: trimmed });
  return true;
}
```

---

## 4. MultiSyntaxParser Tool Call vs. JSON Data Distinction

### 4.1 File Location & Line Numbers
- **File**: `d:\Suna Chat\suna_agent.js`
  - `MultiSyntaxParser.parse(text)`: lines 287–368
  - Markdown block parser: lines 330–343
  - Native JSON fallback parser: lines 346–360

### 4.2 Existing Code Analysis
In `suna_agent.js` lines 330–360:
```javascript
// 2. Markdown ```json code block (accumulate alongside XML; no calls.length === 0 mutual exclusion)
const mdPattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
while ((m = mdPattern.exec(text)) !== null) {
  try {
    const parsed = JsonAutoRepair.safeParse(m[1].trim());
    if (parsed && (parsed.tool || parsed.name)) {
      calls.push({
        tool: parsed.tool || parsed.name,
        args: parsed.args || parsed.parameters || parsed.params || parsed.arguments || {},
        raw: m[0],
        startIndex: m.index
      });
    }
  } catch (e) {}
}

// 3. Native function call JSON object (fallback only if no XML and no Markdown blocks were found)
if (calls.length === 0) {
  try {
    const parsed = JsonAutoRepair.safeParse(text.trim());
    if (parsed && (parsed.name || parsed.tool)) {
      let args = parsed.arguments || parsed.args || parsed.parameters || {};
      if (typeof args === 'string') {
        args = JsonAutoRepair.safeParse(args);
      }
      calls.push({
        tool: parsed.name || parsed.tool,
        args: args,
        raw: text
      });
    }
  } catch (e) {}
}
```

### 4.3 Why It Misinterprets `package.json` and JSON Data Blocks
Standard configuration files, manifests, and data records contain a `"name"` field:
```json
{
  "name": "suna-chat",
  "version": "2.0.0",
  "description": "AI App"
}
```
Because the parser checks only `if (parsed && (parsed.tool || parsed.name))`:
- `parsed.name` is `"suna-chat"`.
- `parsed.args` falls back to `{}`.
- The parser produces:
  `{ tool: "suna-chat", args: {} }`.
- When an LLM outputs Markdown containing a `package.json`, or when inspecting or discussing configuration data, `MultiSyntaxParser` misinterprets the data block as a tool invocation to tool `"suna-chat"`.
- The agent runtime attempts to dispatch tool `"suna-chat"`, throwing `Tool "suna-chat" not found`, resulting in erroneous failures.

### 4.4 Remediation Blueprint
Distinguish authentic tool calls from generic JSON structures:
1. **Explicit tool keys**: If `typeof parsed.tool === 'string'` or `typeof parsed.tool_name === 'string'`, it is treated as a tool call (unless package manifest properties like `version` and `dependencies` exist).
2. **Function call format (`name`)**: If `typeof parsed.name === 'string'`, it is ONLY a tool call if:
   - It possesses explicit arguments: `parsed.arguments !== undefined || parsed.parameters !== undefined || parsed.args !== undefined || parsed.params !== undefined`, OR has `parsed.type === 'function'`.
   - AND it does NOT contain standard package/manifest/metadata keys:
     `!parsed.version && !parsed.dependencies && !parsed.devDependencies && !parsed.peerDependencies && !parsed.scripts && !parsed.main && !parsed.repository && !parsed.license && !parsed.author && !parsed.keywords`.
   - AND `parsed.name` is a valid identifier (does not contain `/`, spaces, or typical package scopes like `@org/pkg`).

Updated parser logic:
```javascript
function isGenuineToolCall(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;

  // Package manifest / project configuration exclusion guard
  if (parsed.version !== undefined || parsed.dependencies !== undefined ||
      parsed.devDependencies !== undefined || parsed.scripts !== undefined ||
      parsed.peerDependencies !== undefined || parsed.main !== undefined) {
    return false;
  }

  // 1. Explicit tool property
  if (typeof parsed.tool === 'string' && parsed.tool.trim()) return true;
  if (typeof parsed.tool_name === 'string' && parsed.tool_name.trim()) return true;

  // 2. OpenAI / Hermes Function Call syntax: requires name AND arguments/parameters
  if (typeof parsed.name === 'string' && parsed.name.trim()) {
    const hasArgs = parsed.arguments !== undefined || parsed.parameters !== undefined ||
                    parsed.args !== undefined || parsed.params !== undefined;
    const isFunctionType = parsed.type === 'function';
    // Reject names with spaces or slashes (e.g. package names or descriptive strings)
    const isValidIdentifier = /^[a-zA-Z0-9_-]+$/.test(parsed.name.trim());
    return (hasArgs || isFunctionType) && isValidIdentifier;
  }

  return false;
}
```

---

## 5. `_boundObservation` Error & `isError` Erasure (>1500 chars)

### 5.1 File Location & Line Numbers
- **File**: `d:\Suna Chat\suna_agent.js`
  - `_boundObservation`: lines 1443–1457
  - `reflectObservation`: lines 1057–1085
  - Usage in `executeStep`: lines 1825–1846
  - Usage in `run`: lines 1999–2013

### 5.2 Existing Code Analysis
In `suna_agent.js` lines 1443–1457:
```javascript
_boundObservation(value, maxChars) {
  const limit = Math.max(256, Number(maxChars) || this.MAX_RESULT_LENGTH || 1500);
  let serialized;
  if (typeof value === 'string') {
    serialized = value;
  } else {
    try { serialized = JSON.stringify(value); } catch (_) { serialized = String(value); }
  }
  if (serialized.length <= limit) {
    return { value, text: serialized, truncated: false, originalLength: serialized.length };
  }
  const marker = `\n…[truncated ${serialized.length - limit} chars; use a narrower tool query]`;
  const text = serialized.slice(0, Math.max(0, limit - marker.length)) + marker;
  return { value: text, text, truncated: true, originalLength: serialized.length };
}
```

Now trace this in `executeStep` line 1828:
```javascript
const boundedObservation = this._boundObservation(toolResult, executionOptions.maxObservationChars);
const reflection = this.brain.reflectObservation(activeStep, boundedObservation.value, intent);
```

And in `reflectObservation` lines 1057–1074:
```javascript
reflectObservation(step, observation, context) {
  const stepName = (step && step.name) || 'step';
  const isError = observation && (
    observation.status === 'error' ||
    observation.status === 'ERROR' ||
    observation.status === 'failed' ||
    observation.error ||
    observation.success === false
  );
  if (!isError && (Array.isArray(observation) || typeof observation === 'string' || typeof observation === 'number' || typeof observation === 'boolean' || (observation && (observation.status === 'success' || typeof observation === 'object')))) {
    const msg = `Step "${stepName}" succeeded cleanly.`;
    return {
      satisfied: true,
      nextAction: 'proceed',
      reflection: msg,
      reflectionText: msg
    };
  }
  ...
```

### 5.3 The Exact Defect Chain
1. When a tool fails with a long stack trace (length > 1500 characters), `toolResult` is:
   `{ status: 'error', error: 'Very long stack trace ... (2000 chars)', isError: true }`.
2. `_boundObservation` sees `serialized.length > limit`.
3. It creates a truncated string `text` and returns:
   `{ value: text, text, truncated: true, originalLength: 2045 }`.
   **Notice that `value` is now a `string`, completely discarding the original error object!**
4. `executeStep` passes `boundedObservation.value` (`text`, a string) to `this.brain.reflectObservation(activeStep, boundedObservation.value)`.
5. In `reflectObservation`:
   - `observation` is a string.
   - `observation.status` is `undefined`.
   - `observation.error` is `undefined`.
   - `isError` evaluates to `false`!
   - Line 1066: `!isError && typeof observation === 'string'` evaluates to `true`!
   - `reflectObservation` returns:
     `satisfied: true, nextAction: 'proceed', reflection: 'Step "xxx" succeeded cleanly.'`!
6. A fatal tool crash with a long error message is recorded as a **clean success**! The agent continues running blindly without replanning or error recovery!

### 5.4 Remediation Blueprint
1. In `_boundObservation(value, maxChars)`:
   - Detect if `value` is an error object:
     `const isErrorObj = (value !== null && typeof value === 'object') && (value.isError === true || value.status === 'error' || value.status === 'ERROR' || value.status === 'failed' || Boolean(value.error) || value.success === false);`
   - When truncating: if `value` was an object, clone the object and inject the truncated text into `error` (or `output` / `message`), keeping `status: 'error'`, `isError: true`, and all error metadata intact.
   - Attach `isError: isErrorObj` directly to the return envelope:
     `{ value: boundedValue, text, truncated: true, originalLength, isError: isErrorObj }`.
2. In `reflectObservation(step, observation, context)`:
   - Add `observation.isError === true` to the error check:
     ```javascript
     const isError = observation && (
       observation.isError === true ||
       observation.status === 'error' ||
       observation.status === 'ERROR' ||
       observation.status === 'failed' ||
       observation.error ||
       observation.success === false
     );
     ```

---

## 6. Empirical Verification Matrix

The diagnostic script executed at `d:\Suna Chat\.agents\explorer_o10_survey_1\inspect_test.js` produced the following reproducible empirical results:

| Item | Requirement Area | Observed Raw Output | Root Cause Verified |
|---|---|---|---|
| **1** | Default VFS / Registry in Constructor | `standaloneAgent.vfs: null`<br>`tools: ['change_lofi_mood', ...]` (0 ACI tools) | Constructor does not assign `this.vfs` nor call `registerAciTools` |
| **1b** | Standalone `agent.run()` | `status: 'halted'`, 3 turns failed with `Harness VFS not attached` | Line 1578 throws if `!this.vfs` |
| **2** | Multi-step ReAct in `_runLegacy` | `_runLegacy turnsExecuted: 1`<br>`_runLegacy status: completed`<br>`_runLegacy steps: ['inspect_source']` | Executes only `plan[0]`, unconditionally breaks on turn 1 |
| **3** | `agent.steer()` Unabort | `After steer - status: halted, isAgentAborted: true`<br>`executeStep after steer: halted` | `steer()` leaves `status = 'halted'` and `isAgentAborted = true` |
| **4** | `MultiSyntaxParser` on `package.json` | `Parsed calls: [{ tool: 'suna-chat', args: {} }]` | Permissive `parsed.tool \|\| parsed.name` without manifest filtering |
| **5** | `_boundObservation` Long Error Truncation | `Bounded value type: string`<br>`isError property: undefined`<br>`Reflection satisfied: true`<br>`Reflection: Step "run_tests" succeeded cleanly.` | Error object converted to string; `reflectObservation` treats string as success |

All findings are validated, reproducible, and ready for clean, zero-regression implementation by the engineering subagents.
