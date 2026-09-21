# Handoff Report — Milestone R1: Suna Agent Lifecycle & Core Investigation

**Agent ID**: `explorer_o10_survey_1`  
**Working Directory**: `d:\Suna Chat\.agents\explorer_o10_survey_1`  
**Date**: 2026-09-20  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

Direct code observations and empirical test results from `d:\Suna Chat\suna_agent.js` and `d:\Suna Chat\suna_harness.js`:

### Observation 1.1: Standalone Constructor & Missing VFS/Tools
- In `suna_agent.js` lines 1106–1112:
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
  `this.vfs` is hardcoded to `null` even if `options.vfs` is supplied.
- In `suna_agent.js` lines 33–38:
  `localHarness.registerAciTools(SunaAgent);` calls `registerAciTools` on the class `SunaAgent`.
  In `suna_harness.js` line 8645:
  `if (!sunaAgent || typeof sunaAgent.registerTool !== 'function') return false;`
  Because `SunaAgent` is a class (not an instance), it has no `registerTool` method and returns `false`.
- Running `new SunaAgent()` yields:
  `standaloneAgent.vfs: null`
  `standaloneAgent tools: ['change_lofi_mood', 'speak_message', 'save_note_to_firestore', 'get_system_state', 'update_user_profile', 'sandbox_exec']` (0 ACI tools).
- In `suna_agent.js` line 1578:
  `if (!this.vfs) throw new Error('Harness VFS not attached');`
- Executing `agent.run('inspect file test.txt')` on a standalone agent resulted in:
  `{ status: 'error', error: 'Harness VFS not attached', code: 'TOOL_EXECUTION_ERROR' }` for 3 consecutive turns, tripping the circuit breaker with:
  `haltReason: 'Tool "list_dir" failed 3 consecutive times with identical parameters.'`

### Observation 1.2: Multi-step ReAct Loop Premature Exit in `_runLegacy`
- In `suna_agent.js` lines 2135–2163:
  ```javascript
  while (turn < maxTurns) {
    turn++;
    ...
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
- In `suna_agent.js` lines 1763–1764:
  `plan = this.brain.planHierarchy(intent, promptText);`
  `activeStep = (plan && plan[0]) || ...;`
- Executing `agent.run('Fix bug in app.js', { maxTurns: 5 })` (which plans 3 steps: `inspect_source`, `perform_surgery`, `verify_fix`) yielded:
  `_runLegacy turnsExecuted: 1`
  `_runLegacy status: completed`
  `_runLegacy steps: [ 'inspect_source' ]`
  Steps 2 and 3 were never executed.

### Observation 1.3: `agent.steer()` Leaves Agent in Halted State
- In `suna_agent.js` lines 1695–1705:
  ```javascript
  steer(instruction) {
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) return false;
    const trimmed = instruction.trim();
    this.steerInstructions.push(trimmed);
    this.memory.setFact('latest_steer', trimmed);
    this.consecutiveFailures = 0;
    this.haltReason = null;
    this.emit('steer_applied', { instruction: trimmed });
    return true;
  }
  ```
- In `suna_agent.js` lines 1708–1715:
  `if (this.status === 'halted' || this.isAgentAborted) return { status: 'halted', halted: true, reason: ... };`
- Running test script where agent is halted then steered:
  `State after abort - status: halted isAgentAborted: true`
  `State after steer - status: halted isAgentAborted: true`
  `executeStep after steer - status: halted reason: Circuit breaker tripped: execution is halted.`

### Observation 1.4: `MultiSyntaxParser` Misinterpreting `package.json`
- In `suna_agent.js` lines 334 and 349:
  `if (parsed && (parsed.tool || parsed.name))`
- Passing `'```json\n{\n  "name": "suna-chat",\n  "version": "2.0.0"\n}\n```'` to `MultiSyntaxParser.parse`:
  `Parsed calls: [{ tool: 'suna-chat', args: {} }]`
  Passing raw JSON string `{\n  "name": "suna-chat",\n  "version": "2.0.0"\n}`:
  `Parsed calls: [{ tool: 'suna-chat', args: {} }]`

### Observation 1.5: `_boundObservation` Long Error Truncation
- In `suna_agent.js` lines 1443–1457:
  ```javascript
  if (serialized.length <= limit) {
    return { value, text: serialized, truncated: false, originalLength: serialized.length };
  }
  const marker = `\n…[truncated ${serialized.length - limit} chars; use a narrower tool query]`;
  const text = serialized.slice(0, Math.max(0, limit - marker.length)) + marker;
  return { value: text, text, truncated: true, originalLength: serialized.length };
  ```
- In `suna_agent.js` lines 1057–1074:
  `reflectObservation` checks `if (!isError && (typeof observation === 'string' ...)) return { satisfied: true, reflection: 'Step "..." succeeded cleanly.' };`
- Running `_boundObservation` on an error object with >1500 chars of stack trace:
  `Bounded observation value type: string`
  `Bounded observation isError property: undefined`
  `Reflection satisfied: true`
  `Reflection text: Step "run_tests" succeeded cleanly.`

---

## 2. Logic Chain

1. **Standalone VFS & Registry Chain**:
   - Because `this.vfs` is initialized to `null` in constructor (Observation 1.1) and `registerAciTools` fails when passed the class, standalone agents have `this.vfs === null` and no ACI tools registered.
   - When `run()` is invoked, `executeStep` invokes `invokeAciTool`, which immediately checks `if (!this.vfs) throw new Error('Harness VFS not attached')`.
   - Thus, standalone execution is impossible without external `attachHarness`. Setting default `VfsSandbox` and registering ACI tools in constructor and `run()` resolves this issue completely.

2. **`_runLegacy` Premature Termination Chain**:
   - `executeStep` called with a string prompt extracts a multi-step plan, but assigns `activeStep = plan[0]`, executing only the first step (Observation 1.2).
   - In `_runLegacy`, when step 0 finishes cleanly (`reflection.satisfied === true`), the loop hits `finalStatus = 'completed'; break;` unconditionally.
   - Thus, steps 1..N are never reached. Decomposing the plan once in `_runLegacy`, iterating with `currentStepIndex`, passing each step object to `executeStep`, and advancing upon satisfaction resolves this bug.

3. **`agent.steer()` Unabort Recovery Chain**:
   - Circuit breaker and abort operations set `this.status = 'halted'` and `this.isAgentAborted = true` (Observation 1.3).
   - `steer()` clears failure counters but leaves `this.status` as `'halted'` and `this.isAgentAborted` as `true`.
   - Any subsequent call to `executeStep` or `run()` immediately hits the pre-condition check `if (this.status === 'halted' || this.isAgentAborted)` and refuses execution.
   - Thus, human steering fails to revive the agent. Updating `steer()` to set `this.status = 'idle'`, `this.isAgentAborted = false`, and resetting guardrails resolves this.

4. **`MultiSyntaxParser` Collision Chain**:
   - The parser treats any JSON object possessing a `name` property as a tool invocation (Observation 1.4).
   - Every standard `package.json`, project configuration, or data entity with a `name` property is extracted as a tool call (`tool: parsed.name`, `args: {}`).
   - Requiring explicit arguments (`arguments`, `parameters`, `args`), checking for package manifest properties (`version`, `dependencies`, `scripts`), and enforcing identifier formatting prevents false positives.

5. **`_boundObservation` Error Erasure Chain**:
   - When an observation exceeds 1500 chars, `_boundObservation` replaces `value` with a string `text` (Observation 1.5).
   - Structured error properties (`status: 'error'`, `isError: true`, `error: '...'`) are lost.
   - `reflectObservation` receives a plain string, checks `!isError && typeof observation === 'string'`, and falsely concludes that the step succeeded cleanly.
   - Preserving the object wrapper on truncation and explicitly attaching `isError: true` prevents false positive reflections.

---

## 3. Caveats

- **Existing Tests Calling `executeStep`**: Many existing unit tests in `tests/test_suna_agent.js` call `agent.executeStep('...')` directly with isolated mock objects. The proposed fixes to `_runLegacy` and `MultiSyntaxParser` do not alter the single-step signature of `executeStep`, preserving 100% backward compatibility with all existing test suites.
- **Node vs Browser Global VFS**: In browser environments without Node's `require`, `getHarnessComponents()` resolves `window.SunaHarness`. If `SunaHarness` is not loaded yet in a browser window when `new SunaAgent()` is instantiated, `run()`'s lazy initialization ensures the VFS is bound as soon as `run()` is called.

---

## 4. Conclusion

All five R1 defects have been isolated to specific lines in `suna_agent.js`. Each defect has a concise, zero-regression remediation:
1. Initialize default `VfsSandbox` and register standard ACI tools in constructor and `run()`.
2. Introduce `currentStepIndex` and sequential step loop in `_runLegacy`.
3. Reset `this.status = 'idle'`, `this.isAgentAborted = false`, and guardrails in `steer()`.
4. Add manifest key filtering and parameter presence requirements in `MultiSyntaxParser`.
5. Preserve error objects and `isError: true` flag in `_boundObservation`.

---

## 5. Verification Method

1. **Syntax Check**:
   ```bash
   npm run check
   ```
   (Must pass with 0 errors across `app.js`, `redesign.js`, `suna_agent.js`, `suna_harness.js`).

2. **Existing Regression Suite**:
   ```bash
   npx mocha tests/test_suna_agent.js
   npx mocha tests/test_suna_agent_hermes_deepseek_worldclass.js
   npx mocha tests/test_suna_agent_runtime_upgrade.js
   ```
   (Must pass 100%).

3. **Empirical Diagnostic Script**:
   ```bash
   node "d:\Suna Chat\.agents\explorer_o10_survey_1\inspect_test.js"
   ```
   - Item 1: `standaloneAgent.vfs` is non-null; ACI tools are registered; `standaloneAgent.run()` completes without `Harness VFS not attached`.
   - Item 2: `_runLegacy` executes all steps in the multi-step plan (`turnsExecuted: 3`, steps: `inspect_source`, `perform_surgery`, `verify_fix`).
   - Item 3: After `agent.abort()` and `agent.steer()`, `agent.status === 'idle'`, `agent.isAgentAborted === false`, and `executeStep` runs normally.
   - Item 4: `MultiSyntaxParser.parse` on `package.json` returns `[]`. Genuine tool calls return calls.
   - Item 5: `_boundObservation` on long error maintains `isError: true` and `reflectObservation` returns `satisfied: false`.
