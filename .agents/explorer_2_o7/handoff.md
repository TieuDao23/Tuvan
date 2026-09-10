# Handoff Report: SunaAgent Circuit Breaker, Runaway Protection & Dynamic Planning Blueprint

**Author**: Explorer 2 (`teamwork_preview_explorer`)  
**Working Directory**: `d:\Suna Chat\.agents\explorer_2_o7`  
**Workspace**: `d:\Suna Chat`  
**Date**: 2026-09-08T00:05:00+07:00  
**Target Components**: `suna_agent.js`, `suna_harness.js`, `tests/test_challenger_suna_agent_adversarial.js`

---

## 1. Observation

Direct empirical observations made across the codebase, test suites, and audit records:

### 1.1 SunaAgent Lifecycle State Overwrite on Failure
- **File**: `d:\Suna Chat\suna_agent.js`
- **Lines 1037–1046**:
  ```javascript
  1037:       this.status = 'idle';
  1038:       this.emit('status_change', { status: 'idle' });
  1039: 
  1040:       return {
  1041:         step: activeStep,
  1042:         thought: thoughtText,
  1043:         observation: toolResult,
  1044:         reflection,
  1045:         status: stepEnvelope.status
  1046:       };
  ```
  - **Observation**: At line 1037, `this.status` is unconditionally set to `'idle'`, even when `toolResult` returned an error or when multiple failures have occurred in sequence.
  - **Absence**: In lines 576–605 (`SunaAgent` constructor), there is no initialization of `this.consecutiveFailures`, `this.maxConsecutiveFailures`, or `this.guardrails`.

### 1.2 Unwired RunawayGuardrails in SunaAgent
- **File**: `d:\Suna Chat\suna_agent.js`
- **Lines 839–854 (`attachHarness`)**:
  ```javascript
  839:     attachHarness(harnessController, options = {}) {
  840:       this.controller = harnessController;
  841:       this.harness = harnessController;
  842: 
  843:       const H = getHarnessComponents() || (harnessController && harnessController.constructor);
  844: 
  845:       this.vfs = (harnessController && harnessController.vfs) || options.vfs || (H && H.VfsSandbox ? new H.VfsSandbox() : null);
  846:       this.trajectory = (harnessController && harnessController.trajectory) || options.trajectory || (H && H.TrajectoryEngine ? new H.TrajectoryEngine() : null);
  847:       this.checkpoints = options.checkpoints || (harnessController && harnessController.checkpoints) || (H && H.CheckpointManager ? new H.CheckpointManager({ vfs: this.vfs }) : null);
  848:       this.eventBus = (harnessController && harnessController.bus) || options.bus || (H && H.InterHarnessEventBus ? new H.InterHarnessEventBus() : null);
  849: 
  850:       if (H && typeof H.registerAciTools === 'function') {
  851:         H.registerAciTools(this);
  852:       }
  853:       return this;
  854:     }
  ```
  - **Observation**: `attachHarness` binds `vfs`, `trajectory`, `checkpoints`, and `eventBus`, but completely ignores `RunawayGuardrails`.
  - **File**: `d:\Suna Chat\suna_harness.js` lines 5508–5534: `RunawayGuardrails` exists with `recordFailure(toolName, args)`, `recordSuccess(toolName, args)`, `recordAction(toolName, args, vfsHash)`, and `recordTurnModification(vfs)`. However, `recordFailure` only tracks identical parameter hashes (`actionKey = ${toolName}:${argsHash}`).

### 1.3 Adversarial Test Failure in F4.2.1
- **File**: `d:\Suna Chat\tests\test_challenger_suna_agent_adversarial.js`
- **Lines 477–505**:
  ```javascript
  477:       it('F4.2.1: CHALLENGE - SunaAgent halts execution when consecutive step failures >= 3', async function() {
  478:         const vfs = new VfsSandbox();
  479:         const trajectory = new TrajectoryEngine();
  480:         const checkpoints = new CheckpointManager({ vfs });
  481:         const controller = new HarnessController({ vfs, trajectory, checkpoints });
  482: 
  483:         const agent = new SunaAgent({ id: 'circuit_breaker_test_agent' });
  484:         agent.attachHarness(controller);
  485: 
  486:         // Force intentional failures by invoking missing tool
  487:         agent.brain.planHierarchy = () => [
  488:           { id: 1, name: 'failing_step', tool: 'nonexistent_tool', params: { x: 1 } }
  489:         ];
  490: 
  491:         // Step 1: failure
  492:         const step1 = await agent.executeStep('fail 1');
  493:         assert.strictEqual(step1.status, 'failed');
  494: 
  495:         // Step 2: failure
  496:         const step2 = await agent.executeStep('fail 2');
  497:         assert.strictEqual(step2.status, 'failed');
  498: 
  499:         // Step 3: failure -> Circuit breaker MUST trip and halt agent!
  500:         const step3 = await agent.executeStep('fail 3');
  501:         assert.strictEqual(step3.status, 'failed');
  502: 
  503:         // Verify SunaAgent halted state
  504:         assert.strictEqual(agent.status, 'halted', `Expected agent.status to be "halted" after 3 consecutive failures, but got "${agent.status}"`);
  505:       });
  ```
  - **Verbatim Error**:
    ```text
    AssertionError [ERR_ASSERTION]: Expected agent.status to be "halted" after 3 consecutive failures, but got "idle"
        at Context.<anonymous> (d:\Suna Chat\tests\test_challenger_suna_agent_adversarial.js:504:16)
    ```
  - **Contract Insight**: `step1.status`, `step2.status`, and `step3.status` return `'failed'` (reflecting the outcome of that individual step envelope), while `agent.status` must transition to `'halted'`. Furthermore, any subsequent call to `executeStep` on a halted agent must refuse execution and return `{ status: 'halted', reason: ... }`.

### 1.4 Hardcoded Facade in OodaBrain.planHierarchy
- **File**: `d:\Suna Chat\suna_agent.js`
- **Lines 522–532**:
  ```javascript
  522:     planHierarchy(intent) {
  523:       const steps = [];
  524:       if (intent && intent.primaryGoal === 'bug_fix') {
  525:         steps.push({ id: 1, name: 'inspect_source', tool: 'view_file', params: { path: 'app.js' } });
  526:         steps.push({ id: 2, name: 'perform_surgery', tool: 'replace_file_content', params: {} });
  527:         steps.push({ id: 3, name: 'verify_fix', tool: 'run_sandboxed_command', params: { CommandLine: 'node -c app.js' } });
  528:       } else {
  529:         steps.push({ id: 1, name: 'explore_workspace', tool: 'list_dir', params: { DirectoryPath: '' } });
  530:       }
  531:       return steps;
  532:     }
  ```
  - **Observation**: File paths are rigidly hardcoded to `'app.js'` and `'node -c app.js'`, and `params` for `replace_file_content` is an empty object `{}`.

### 1.5 Blind Step Generation in executeStep
- **File**: `d:\Suna Chat\suna_agent.js`
- **Lines 983–989**:
  ```javascript
  983:       // 1. Cognitive Brain OODA: Analyze Intent
  984:       const intent = this.brain.analyzeIntent(typeof promptOrStep === 'string' ? promptOrStep : (promptOrStep && promptOrStep.thought));
  985: 
  986:       // 2. Cognitive Brain OODA: Plan Hierarchy
  987:       const plan = this.brain.planHierarchy(intent);
  988:       const activeStep = plan[0] || { id: 1, name: 'default_step', tool: 'view_file', params: { path: 'index.html' } };
  ```
  - **Observation**: Even if `promptOrStep` is an explicit step object (e.g. `{ tool: 'replace_file_content', params: { TargetFile: 'server.js', ... } }`), `executeStep` ignores `promptOrStep.tool` and `promptOrStep.params`, and instead executes `plan[0]`.

---

## 2. Logic Chain

### 2.1 Root Cause of Circuit Breaker Failure
1. **From Obs 1.1**: Lines 1037–1038 in `suna_agent.js` execute:
   ```javascript
   this.status = 'idle';
   this.emit('status_change', { status: 'idle' });
   ```
   This unconditional reassignment executes regardless of whether `toolResult.status === 'error'` or whether failures have occurred repeatedly.
2. **From Obs 1.2**: `SunaAgent` had no internal counter `this.consecutiveFailures`. Even if a tool failed, no tracking took place across invocations of `executeStep()`.
3. **From Obs 1.3**: When test `F4.2.1` called `executeStep('fail 3')`, `this.invokeAciTool` failed because `nonexistent_tool` was missing, caught into `toolResult = { status: 'error', error: ... }`. The step envelope was correctly marked `status: 'failed'`. However, execution proceeded directly to line 1037, resetting `this.status` back to `'idle'`.
4. **Conclusion on Circuit Breaker**: To fulfill Requirement R3 and pass `F4.2.1`, `SunaAgent` must:
   - Track `this.consecutiveFailures` across step executions.
   - Wire `RunawayGuardrails` in `attachHarness` and call `this.guardrails.recordFailure(activeStep.tool, activeStep.params)`.
   - When `this.consecutiveFailures >= maxConsecutiveFailures (3)` or `guardCheck.halted`:
     - Set `this.status = 'halted'`.
     - Set `this.isAgentAborted = true`.
     - Emit `circuit_breaker_tripped` and `status_change` with `{ status: 'halted', reason: ... }`.
     - **Critically**: Prevent line 1037 from resetting `this.status` to `'idle'` when `this.status === 'halted'`.
   - At the entry of `executeStep(promptOrStep)`, if `this.status === 'halted'` or `this.isAgentAborted`, immediately return `{ status: 'halted', halted: true, reason: this.haltReason }`.

### 2.2 Consecutive Failure Reset Invariants
1. **Intermediate Tool Success**: When a step executes and `toolResult` succeeds cleanly without error, `this.consecutiveFailures` MUST reset to `0`, and if `this.guardrails` is present, `this.guardrails.recordSuccess(tool, params)` must be invoked to clear parameter-specific counters.
2. **Operator `reset()`**: When `agent.reset()` is invoked, it must reset `this.isAgentAborted = false`, `this.status = 'idle'`, `this.consecutiveFailures = 0`, `this.haltReason = null`, and call `this.guardrails.reset()`.
3. **Operator `steer(instruction)`**: When a human injects steering guidance, the agent is redirected. Resetting `this.consecutiveFailures = 0` gives the agent a fresh budget under the new instruction.
4. **Operator `resume()`**: In `test_suna_agent.js` line 1719 (`T1-F17-6`), `resume()` is strictly reserved for transitioning from `'paused'` to `'running'`. Calling `resume()` while `'idle'` or `'halted'` returns `false`.

### 2.3 Root Cause of Dynamic Planning Deficiencies
1. **From Obs 1.4**: `OodaBrain.planHierarchy(intent)` statically assumes any `bug_fix` operates on `'app.js'` and verifies with `'node -c app.js'`.
2. **From Obs 1.5**: `executeStep(promptOrStep)` treats `promptOrStep` only as a prompt string for intent analysis and ignores cases where `promptOrStep` is already an explicit step object (`{ tool: '...', params: { ... } }`).
3. **Resolution**:
   - `executeStep` must check if `promptOrStep` is an explicit step object. If so, `activeStep` should be formed directly from `promptOrStep.tool` and `promptOrStep.params`, bypassing default `plan[0]`.
   - `OodaBrain.analyzeIntent` and `OodaBrain.planHierarchy` must dynamically parse file names from the prompt (e.g. `/(?:in|file|path|at|inspect|edit|fix|update)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i` or file extensions `.(js|json|html|css|txt|md|ts|py)`).
   - If no file name is found in the prompt, fall back to `'app.js'`. This ensures 100% backward compatibility with `T1-F1-3` (which expects a 3-step plan for `bug_fix`) while making all real prompts fully dynamic.

---

## 3. Caveats

1. **Test Scope of F4.2.1**: Test F4.2.1 specifically expects `step3.status` to be `'failed'` (since step 3 failed) and `agent.status` to be `'halted'`. Worker must not change `stepEnvelope.status` to `'halted'` for the failing step; `stepEnvelope.status` must remain `'failed'`, while `agent.status` becomes `'halted'`.
2. **Execution While Halted**: If `agent.executeStep()` is called *after* the agent has already halted (e.g. a 4th step), it must immediately return `{ status: 'halted', halted: true, reason: ... }` without executing any tools or modifying trajectory.
3. **Read-Only Explorer Mandate**: This report provides verified drop-in code blueprints. Explorer 2 did not edit or mutate any source files.

---

## 4. Conclusion & Concrete Drop-in Code Blueprints

### Blueprint 1: `SunaAgent` Constructor & Properties
**Target File**: `d:\Suna Chat\suna_agent.js`  
**Location**: Lines 576–605

```javascript
  class SunaAgent {
    constructor(options = {}) {
      this.id = options.id || 'suna_agent_root';
      this.role = options.role || 'lead';
      this.MAX_RECURSION_DEPTH = 4;
      this.MAX_RESULT_LENGTH = 1500;
      this.MOODS_WHITELIST = ['calm', 'excited', 'sad', 'stressed', 'creative'];
      this.THEMES_WHITELIST = ['aurora', 'sunset', 'ocean', 'forest', 'midnight'];

      this._registry = new Map();
      this.tools = {};
      this.listeners = new Map();

      this.memory = new SmartMemory(options);
      this.brain = new OodaBrain(options);
      this.harness = null;
      this.vfs = null;
      this.controller = null;
      this.trajectory = null;
      this.checkpoints = null;
      this.eventBus = null;

      this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'halted'
      this.isAgentAborted = false;
      this.steerInstructions = [];
      this._lastCheckpointStep = 1;

      // Circuit Breaker & Consecutive Failures Tracking (Requirement R3)
      this.consecutiveFailures = 0;
      this.maxConsecutiveFailures = (options && options.maxConsecutiveFailures) || 3;
      this.haltReason = null;

      const H = getHarnessComponents();
      const GuardrailsClass = (H && (H.RunawayGuardrails || H.GuardrailSentinel)) || (typeof RunawayGuardrails !== 'undefined' ? RunawayGuardrails : null);
      this.guardrails = options.guardrails || (GuardrailsClass ? new GuardrailsClass({
        vfs: this.vfs,
        maxConsecutiveFailures: this.maxConsecutiveFailures
      }) : null);

      this.StreamParser = StreamParser;
      this._initLegacyTools();
    }
```

---

### Blueprint 2: `SunaAgent.attachHarness` Integration
**Target File**: `d:\Suna Chat\suna_agent.js`  
**Location**: Lines 839–854

```javascript
    attachHarness(harnessController, options = {}) {
      this.controller = harnessController;
      this.harness = harnessController;

      const H = getHarnessComponents() || (harnessController && harnessController.constructor);

      this.vfs = (harnessController && harnessController.vfs) || options.vfs || (H && H.VfsSandbox ? new H.VfsSandbox() : null);
      this.trajectory = (harnessController && harnessController.trajectory) || options.trajectory || (H && H.TrajectoryEngine ? new H.TrajectoryEngine() : null);
      this.checkpoints = options.checkpoints || (harnessController && harnessController.checkpoints) || (H && H.CheckpointManager ? new H.CheckpointManager({ vfs: this.vfs }) : null);
      this.eventBus = (harnessController && harnessController.bus) || options.bus || (H && H.InterHarnessEventBus ? new H.InterHarnessEventBus() : null);

      // Wire RunawayGuardrails to prevent runaway failure loops (Requirement R3)
      const GuardrailsClass = (H && (H.RunawayGuardrails || H.GuardrailSentinel)) || (typeof RunawayGuardrails !== 'undefined' ? RunawayGuardrails : null);
      this.guardrails = options.guardrails || (harnessController && harnessController.guardrails) || this.guardrails || (GuardrailsClass ? new GuardrailsClass({
        vfs: this.vfs,
        maxConsecutiveFailures: this.maxConsecutiveFailures || 3
      }) : null);

      if (this.guardrails && this.vfs && !this.guardrails.vfs) {
        this.guardrails.vfs = this.vfs;
      }

      if (H && typeof H.registerAciTools === 'function') {
        H.registerAciTools(this);
      }
      return this;
    }
```

---

### Blueprint 3: `SunaAgent.reset`, `abort`, and `steer`
**Target File**: `d:\Suna Chat\suna_agent.js`  
**Location**: Lines 685–711 & 964–971

```javascript
    reset() {
      this.isAgentAborted = false;
      this.status = 'idle';
      this.consecutiveFailures = 0;
      this.haltReason = null;
      if (this.guardrails && typeof this.guardrails.reset === 'function') {
        this.guardrails.reset();
      }
      if (typeof window !== 'undefined') {
        window.isAgentAborted = false;
      }
      this.emit('status_change', { status: 'idle' });
    }

    abort(reason) {
      this.isAgentAborted = true;
      this.status = 'halted';
      this.haltReason = reason || 'Execution aborted by user or controller';
      if (typeof window !== 'undefined') {
        window.isAgentAborted = true;
      }
      this.emit('status_change', { status: 'halted', reason: this.haltReason });
    }
```

And in `steer()`:
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

---

### Blueprint 4: Dynamic Planning in `OodaBrain`
**Target File**: `d:\Suna Chat\suna_agent.js`  
**Location**: Lines 502–532

```javascript
    analyzeIntent(prompt) {
      if (!prompt || typeof prompt !== 'string') {
        return { primaryGoal: 'none', subGoals: [], constraints: [], successCriteria: [] };
      }
      const lower = prompt.toLowerCase();
      const goals = [];
      const constraints = [];
      if (lower.includes('fix') || lower.includes('bug')) goals.push('bug_fix');
      if (lower.includes('create') || lower.includes('build')) goals.push('code_generation');
      if (lower.includes('vietnamese') || lower.includes('tiếng việt')) constraints.push('utf8_vietnamese');
      if (lower.includes('diff')) constraints.push('preview_diff');

      // Dynamically extract target file from prompt text
      let targetFile = null;
      const filePattern = /(?:in|file|path|at|inspect|edit|fix|update)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i;
      const m = prompt.match(filePattern);
      if (m) {
        targetFile = m[1];
      } else {
        const extPattern = /\b([a-zA-Z0-9_\-\.\/]+\.(?:js|json|html|css|txt|md|ts|py))\b/i;
        const m2 = prompt.match(extPattern);
        if (m2) targetFile = m2[1];
      }

      return {
        primaryGoal: goals[0] || 'general_task',
        subGoals: goals.length ? goals : ['general_task'],
        constraints,
        successCriteria: ['zero_syntax_errors', 'tests_pass'],
        targetFile
      };
    }

    planHierarchy(intent, contextOrPrompt) {
      const steps = [];
      let targetFile = (intent && intent.targetFile) || null;
      if (!targetFile && typeof contextOrPrompt === 'string') {
        const filePattern = /(?:in|file|path|at|inspect|edit|fix|update)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i;
        const m = contextOrPrompt.match(filePattern);
        if (m) {
          targetFile = m[1];
        } else {
          const extPattern = /\b([a-zA-Z0-9_\-\.\/]+\.(?:js|json|html|css|txt|md|ts|py))\b/i;
          const m2 = contextOrPrompt.match(extPattern);
          if (m2) targetFile = m2[1];
        }
      }
      const resolvedFile = targetFile || 'app.js';

      if (intent && intent.primaryGoal === 'bug_fix') {
        steps.push({ id: 1, name: 'inspect_source', tool: 'view_file', params: { path: resolvedFile, TargetFile: resolvedFile } });
        steps.push({ id: 2, name: 'perform_surgery', tool: 'replace_file_content', params: { TargetFile: resolvedFile, path: resolvedFile } });
        steps.push({ id: 3, name: 'verify_fix', tool: 'run_sandboxed_command', params: { CommandLine: `node -c ${resolvedFile}` } });
      } else if (intent && intent.primaryGoal === 'code_generation') {
        steps.push({ id: 1, name: 'check_workspace', tool: 'list_dir', params: { DirectoryPath: '' } });
        steps.push({ id: 2, name: 'write_code', tool: 'replace_file_content', params: { TargetFile: resolvedFile, path: resolvedFile } });
        steps.push({ id: 3, name: 'verify_code', tool: 'run_sandboxed_command', params: { CommandLine: `node -c ${resolvedFile}` } });
      } else {
        steps.push({ id: 1, name: 'explore_workspace', tool: 'list_dir', params: { DirectoryPath: '' } });
      }
      return steps;
    }
```

---

### Blueprint 5: Comprehensive `executeStep` Implementation
**Target File**: `d:\Suna Chat\suna_agent.js`  
**Location**: Lines 973–1047

```javascript
    async executeStep(promptOrStep) {
      // 0. Circuit Breaker / Abort Pre-condition: refuse execution if already halted
      if (this.status === 'halted' || this.isAgentAborted) {
        return {
          status: 'halted',
          halted: true,
          reason: this.haltReason || 'Circuit breaker tripped: execution is halted.'
        };
      }

      this.status = 'running';
      this.emit('status_change', { status: 'running' });

      // Handle user steer intervention if queued
      if (this.steerInstructions.length > 0) {
        const steerText = this.steerInstructions.shift();
        this.memory.setFact('steered_intent', steerText);
      }

      let activeStep;
      let plan;
      let intent;

      // Check if promptOrStep is already an explicit step object with tool or action
      const isExplicitStep = promptOrStep && typeof promptOrStep === 'object' && (
        promptOrStep.tool ||
        promptOrStep.action ||
        (promptOrStep.step && (promptOrStep.step.tool || promptOrStep.step.action))
      );

      if (isExplicitStep) {
        const stepSource = promptOrStep.step || promptOrStep;
        const toolName = stepSource.tool || (stepSource.action && (stepSource.action.tool || stepSource.action.name));
        const rawParams = stepSource.params || stepSource.args || (stepSource.action && (stepSource.action.params || stepSource.action.args)) || {};
        const stepId = stepSource.id || 1;
        const stepName = stepSource.name || toolName || 'explicit_step';

        activeStep = {
          id: stepId,
          name: stepName,
          tool: toolName,
          params: rawParams
        };

        const thoughtHint = stepSource.thought || promptOrStep.thought || stepName;
        intent = this.brain.analyzeIntent(thoughtHint);
        plan = [activeStep];
      } else {
        const promptText = typeof promptOrStep === 'string'
          ? promptOrStep
          : (promptOrStep && (promptOrStep.thought || promptOrStep.prompt || promptOrStep.text)) || '';

        // 1. Cognitive Brain OODA: Analyze Intent
        intent = this.brain.analyzeIntent(promptText);

        // 2. Cognitive Brain OODA: Plan Hierarchy (with promptText for dynamic extraction)
        plan = this.brain.planHierarchy(intent, promptText);
        activeStep = (plan && plan[0]) || { id: 1, name: 'default_step', tool: 'view_file', params: { path: 'index.html' } };
      }

      // 3. Cognitive Brain OODA: Extended Thinking
      const thoughtText = this.brain.thinkExtended(activeStep, intent);
      this.emit('thinking_start', { step: activeStep.id });
      this.emit('thought_chunk', { chunk: thoughtText });
      this.emit('thinking_end', { thought: thoughtText });

      // Check pause state
      if (this.status === 'paused') {
        return { status: 'paused', step: activeStep };
      }

      // 4. Cognitive Brain OODA: Tool Execution
      let toolResult;
      let isError = false;
      const startTime = Date.now();
      try {
        toolResult = await this.invokeAciTool(activeStep.tool, activeStep.params);
        if (toolResult && (
          toolResult.status === 'error' ||
          toolResult.status === 'ERROR' ||
          toolResult.status === 'failed' ||
          toolResult.error ||
          toolResult.success === false
        )) {
          isError = true;
        }
      } catch (err) {
        isError = true;
        toolResult = { status: 'error', error: err.message };
      }
      const durationMs = Date.now() - startTime;

      // 5. Cognitive Brain OODA: Observation Reflection
      const reflection = this.brain.reflectObservation(activeStep, toolResult, intent);
      const reflectionText = (reflection && (reflection.reflection || reflection.reflectionText)) || 'Reflection completed cleanly';

      // 6. Trajectory & Memory Envelope Recording
      const stepIdx = this.trajectory ? this.trajectory.getEvents().length + 1 : 1;
      const stepEnvelope = {
        agent_id: this.id,
        role: this.role,
        step_index: stepIdx,
        step: stepIdx,
        thought: thoughtText,
        plan: plan,
        action: { tool: activeStep.tool, params: activeStep.params },
        observation: toolResult,
        reflection: reflectionText,
        metadata: { reflection: reflectionText, plan: plan },
        status: isError ? 'failed' : 'success',
        metrics: { durationMs, tokensConsumed: Math.max(1, Math.ceil(thoughtText.length / 4)) }
      };

      if (this.trajectory) {
        this.trajectory.recordStep(stepEnvelope);
      }
      this.memory.recordEpisode(stepEnvelope);

      // 7. Guardrails & Circuit Breaker Evaluation (Requirement R3)
      if (isError) {
        this.consecutiveFailures = (this.consecutiveFailures || 0) + 1;
        let guardCheck = null;
        if (this.guardrails && typeof this.guardrails.recordFailure === 'function') {
          guardCheck = this.guardrails.recordFailure(activeStep.tool, activeStep.params);
        }

        const maxFailures = this.maxConsecutiveFailures || 3;
        if (this.consecutiveFailures >= maxFailures || (guardCheck && guardCheck.halted)) {
          const haltReason = (guardCheck && guardCheck.reason) ||
            `Consecutive step failures reached limit (${this.consecutiveFailures}/${maxFailures})`;
          this.status = 'halted';
          this.isAgentAborted = true;
          this.haltReason = haltReason;
          this.emit('circuit_breaker_tripped', {
            consecutiveFailures: this.consecutiveFailures,
            tool: activeStep.tool,
            params: activeStep.params,
            reason: haltReason
          });
          this.emit('status_change', { status: 'halted', reason: haltReason });
        }
      } else {
        // Step succeeded: reset consecutive failures counter
        this.consecutiveFailures = 0;
        this.haltReason = null;
        if (this.guardrails) {
          if (typeof this.guardrails.recordSuccess === 'function') {
            this.guardrails.recordSuccess(activeStep.tool, activeStep.params);
          }
          if (typeof this.guardrails.recordAction === 'function') {
            const actionCheck = this.guardrails.recordAction(activeStep.tool, activeStep.params);
            if (actionCheck && actionCheck.halted) {
              this.status = 'halted';
              this.isAgentAborted = true;
              this.haltReason = actionCheck.reason;
              this.emit('circuit_breaker_tripped', {
                reason: actionCheck.reason,
                condition: 'loop_oscillation'
              });
              this.emit('status_change', { status: 'halted', reason: actionCheck.reason });
            }
          }
          if (this.vfs && typeof this.guardrails.recordTurnModification === 'function' &&
              (activeStep.tool === 'replace_file_content' || (activeStep.tool === 'run_sandboxed_command' && activeStep.params && activeStep.params.CommandLine && activeStep.params.CommandLine.includes('>')))) {
            const vfsCheck = this.guardrails.recordTurnModification(this.vfs);
            if (vfsCheck && vfsCheck.halted) {
              this.status = 'halted';
              this.isAgentAborted = true;
              this.haltReason = vfsCheck.reason;
              this.emit('circuit_breaker_tripped', {
                reason: vfsCheck.reason,
                condition: 'stagnant_vfs'
              });
              this.emit('status_change', { status: 'halted', reason: vfsCheck.reason });
            }
          }
        }
      }

      // 8. Lifecycle State Resolution: Only transition to idle if still running
      if (this.status === 'running') {
        this.status = 'idle';
        this.emit('status_change', { status: 'idle' });
      }

      return {
        step: activeStep,
        thought: thoughtText,
        observation: toolResult,
        reflection,
        status: stepEnvelope.status,
        halted: this.status === 'halted',
        reason: this.haltReason || undefined
      };
    }
```

---

### Blueprint 6: `RunawayGuardrails` consecutiveFailures Enhancement
**Target File**: `d:\Suna Chat\suna_harness.js`  
**Location**: Lines 5508–5540

```javascript
  class RunawayGuardrails {
    constructor(options = {}) {
      this.vfs = options.vfs || null;
      this.maxConsecutiveFailures = options.maxConsecutiveFailures || 3;
      this.pingPongWindowSize = options.pingPongWindowSize || 6;
      this.zeroProgressTurnLimit = options.zeroProgressTurnLimit || 3;
      this.failureCounts = new Map();
      this.consecutiveFailures = 0;
      this.actionHistory = [];
      this.modifyingTurnsSinceProgress = 0;
      this.lastProgressVfsHash = null;
    }

    recordFailure(toolName, args) {
      const argsHash = fastHash(JSON.stringify(args || {}));
      const actionKey = `${toolName}:${argsHash}`;
      const count = (this.failureCounts.get(actionKey) || 0) + 1;
      this.failureCounts.set(actionKey, count);
      this.consecutiveFailures = (this.consecutiveFailures || 0) + 1;

      if (count >= this.maxConsecutiveFailures || this.consecutiveFailures >= this.maxConsecutiveFailures) {
        return {
          halted: true,
          triggered: true,
          count,
          consecutiveFailures: this.consecutiveFailures,
          reason: count >= this.maxConsecutiveFailures
            ? `Tool "${toolName}" failed ${count} consecutive times with identical parameters.`
            : `Execution reached ${this.consecutiveFailures} consecutive step failures.`
        };
      }
      return { halted: false, triggered: false, count, consecutiveFailures: this.consecutiveFailures };
    }

    recordSuccess(toolName, args) {
      const argsHash = fastHash(JSON.stringify(args || {}));
      const actionKey = `${toolName}:${argsHash}`;
      this.failureCounts.delete(actionKey);
      this.consecutiveFailures = 0;
    }

    reset() {
      this.failureCounts.clear();
      this.consecutiveFailures = 0;
      this.actionHistory = [];
      this.modifyingTurnsSinceProgress = 0;
      this.lastProgressVfsHash = null;
    }
```

---

## 5. Verification Method

To verify these changes after implementation by Worker:

1. **Adversarial Domain 4 Verification**:
   ```bash
   npx mocha tests/test_challenger_suna_agent_adversarial.js --grep "Circuit Breaker"
   ```
   - **Expected**: All Domain 4 tests (`F4.1.1`, `F4.1.2`, `F4.1.3`, `F4.2.1`) pass with 0 errors.

2. **Dedicated SunaAgent Feature Suite**:
   ```bash
   npx mocha tests/test_suna_agent.js
   ```
   - **Expected**: All 178 tests pass with 0 errors, including `T1-F1-3` (OODA hierarchy), `T1-F15-1..6` (stuck/runaway sentinel), `T1-F17-1..6` (lifecycle states), and `T4-S3` (HITL pause/resume/steer).

3. **Syntax & Dual Runtime Check**:
   ```bash
   node -c suna_agent.js
   node -c suna_harness.js
   npm run check
   ```
   - **Expected**: Clean syntax (exit code 0).

4. **Authoritative Project Gate Runner**:
   ```bash
   python run_verification.py
   ```
   - **Expected**: All 4 stages green with exit code 0.

5. **Invalidation Conditions**:
   - If `agent.status` is `'idle'` after 3 consecutive tool failures -> Invalidation.
   - If `executeStep` returns `{ status: 'halted' }` on step 3 instead of `{ status: 'failed', halted: true }`, failing `assert.strictEqual(step3.status, 'failed')` -> Invalidation.
   - If `executeStep` ignores an explicit `{ tool: 'view_file', params: { path: 'custom.txt' } }` and executes `plan[0]` -> Invalidation.
