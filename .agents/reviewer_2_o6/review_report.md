# Review & Adversarial Critic Report: SunaAgent Autonomous Engine

- **Reviewer**: Reviewer 2 (o6)
- **Working Directory**: `d:\Suna Chat\.agents\reviewer_2_o6`
- **Target Components**: `suna_agent.js`, `app.js`, `suna_harness.js`, `tests/test_suna_agent.js`
- **Date**: 2026-09-07T16:53:00Z
- **Verdict**: **REQUEST_CHANGES**

---

## 1. Review Summary

**Verdict**: **REQUEST_CHANGES**  
**Adversarial Risk Assessment**: **CRITICAL**

While `suna_agent.js` establishes a clean UMD scaffold and successfully passes the 178 tests in `tests/test_suna_agent.js`, independent adversarial verification and regression execution revealed that:
1. **Verification Gate Failed**: `python run_verification.py` exited with code 1 due to 15 failing tests in `tests/test_challenger_suna_agent_adversarial.js`.
2. **Missing Core Requirement (Runaway Protection)**: `SunaAgent.executeStep()` lacks runaway loop detection and circuit breaker enforcement for $\ge 3$ consecutive errors. The agent unconditionally returns to `status = 'idle'`, failing to halt.
3. **Facade Implementation in `OodaBrain`**: `planHierarchy` embeds hardcoded file paths (`path: 'app.js'`, `CommandLine: 'node -c app.js'`) and rigid dummy steps copied directly from test fixture oracles, failing to parse explicit actions passed to `executeStep()`.
4. **Fragile Parsers (`MultiSyntaxParser` & `JsonAutoRepair`)**: `MultiSyntaxParser` cannot parse mixed XML and Markdown tool calls in a single message, breaks on single quotes or extra attributes in `<suna_tool_call>`, and swallows tool calls when `<think>` tags are unclosed. `JsonAutoRepair` fails on double commas, nested quotes, and deep truncation.
5. **Unicode Normalization Mismatch in Code Surgery**: NFC vs NFD mismatch causes code surgery (`replace_file_content`) to fail on Vietnamese strings.

---

## 2. Findings

### [Critical] Finding 1: Absence of Runaway Loop Protection ($\ge 3$ Consecutive Errors) in SunaAgent
- **Tag**: REQUIREMENT VIOLATION & SAFETY RISK
- **Where**: `suna_agent.js:973-1047` (`executeStep()`)
- **What**: Requirement R3 explicitly mandates: *"Cơ chế phát hiện bế tắc (Stuck Detection) ngăn chặn lặp lại cùng một hành động lỗi quá 3 lần."* However, `suna_agent.js` maintains no consecutive failure counter. On step failure, `executeStep()` records the failed step in trajectory and memory, but unconditionally sets `this.status = 'idle'`.
- **Why**: In `tests/test_suna_agent.js` line 1615-1622 (Feature 15), the test manually instantiated `new RunawayGuardrails()` and manually called `if (res.halted) agent.abort()`. SunaAgent itself never integrated the guardrail into its autonomous execution loop.
- **Empirical Evidence**: Adversarial test `F4.2.1` in `tests/test_challenger_suna_agent_adversarial.js` failed:
  ```text
  AssertionError [ERR_ASSERTION]: Expected agent.status to be "halted" after 3 consecutive failures, but got "idle"
  ```
- **Suggestion**:
  - In `SunaAgent` constructor, initialize `this.consecutiveFailures = 0;` and instantiate `this.guardrails = new RunawayGuardrails({ maxConsecutiveFailures: 3, vfs: this.vfs });`.
  - In `executeStep()`, if `toolResult.status === 'error'` or execution throws, increment `this.consecutiveFailures++` and call `this.guardrails.recordFailure(activeStep.tool, activeStep.params)`.
  - If `this.consecutiveFailures >= 3` or `guardrails.isHalted()`, set `this.status = 'halted'`, `this.isAgentAborted = true`, emit `status_change`, and return `{ status: 'halted', reason: 'Consecutive failure limit reached' }`.
  - Reset `this.consecutiveFailures = 0` upon any successful tool execution or when `resume()` / `reset()` / `steer()` is invoked.

---

### [Critical] Finding 2: Facade / Hardcoded Planning in `OodaBrain`
- **Tag**: INTEGRITY CONCERN & FACADE IMPLEMENTATION
- **Where**: `suna_agent.js:522-532` (`OodaBrain.planHierarchy`), `suna_agent.js:984-989` (`executeStep`)
- **What**: `planHierarchy` has hardcoded steps:
  ```javascript
  if (intent && intent.primaryGoal === 'bug_fix') {
    steps.push({ id: 1, name: 'inspect_source', tool: 'view_file', params: { path: 'app.js' } });
    steps.push({ id: 2, name: 'perform_surgery', tool: 'replace_file_content', params: {} });
    steps.push({ id: 3, name: 'verify_fix', tool: 'run_sandboxed_command', params: { CommandLine: 'node -c app.js' } });
  } else {
    steps.push({ id: 1, name: 'explore_workspace', tool: 'list_dir', params: { DirectoryPath: '' } });
  }
  ```
  In `executeStep(promptOrStep)`, if `promptOrStep` is an object representing a specific action or tool call (e.g. `{ tool: 'replace_file_content', params: { ... } }`), `executeStep()` ignores it completely and runs `plan[0]`.
- **Why**: This was copied from `SpecOodaBrain` in the test file, which was only intended as an oracle skeleton. In production, an agent must execute the action specified in the step or dynamically decompose the prompt instead of hardcoding `app.js` and `node -c app.js`.
- **Suggestion**:
  - In `executeStep(promptOrStep)`, check if `promptOrStep` is already an explicit step object with `.tool` or `.action`:
    ```javascript
    if (promptOrStep && typeof promptOrStep === 'object' && (promptOrStep.tool || promptOrStep.action)) {
      activeStep = {
        id: promptOrStep.id || 1,
        name: promptOrStep.name || promptOrStep.tool,
        tool: promptOrStep.tool || (promptOrStep.action && promptOrStep.action.tool),
        params: promptOrStep.params || promptOrStep.args || (promptOrStep.action && promptOrStep.action.params) || {}
      };
    }
    ```
  - In `planHierarchy(intent, promptText)`, extract target file names from `promptText` (e.g. via regex `/(?:in|file|path)\s+([a-zA-Z0-9_\-\.\/]+)/i`) rather than hardcoding `'app.js'`.

---

### [Critical] Finding 3: Authoritative Verification Script Failure (`python run_verification.py`)
- **Tag**: ZERO REGRESSION & VERIFICATION FAILURE
- **Where**: Project Root (`run_verification.py`)
- **What**: Running `python run_verification.py` fails with exit code 1:
  ```text
  [-] Mocha test execution FAILED:
  15 tests failing in tests/test_challenger_suna_agent_adversarial.js
  ==================================================================
  >>> VERIFICATION FAILED: ONE OR MORE INTEGRITY CHECKS FAILED <<<
  ==================================================================
  ```
- **Why**: The project rules strictly mandate 100% green verification in `python run_verification.py`. The presence of adversarial stress tests exposed real functional defects in `suna_agent.js`.
- **Suggestion**: Resolve Findings 1, 4, 5, and 6 so that all tests pass 100%.

---

### [Major] Finding 4: Fragility in `MultiSyntaxParser`
- **Tag**: PARSER ROBUSTNESS & SPEC CONFORMANCE
- **Where**: `suna_agent.js:206-280` (`MultiSyntaxParser.parse`) and `suna_agent.js:171-199` (`extractThinking`)
- **What**:
  1. **Premature parsing cutoff**: `MultiSyntaxParser.parse` checks `if (calls.length === 0)` before evaluating Markdown code blocks or Native JSON. If a model response contains an XML tool call followed by or preceded by a Markdown block, only the first syntax is parsed.
  2. **Strict attribute regex**: The XML regex `tool="([^"]+)"` fails on single-quoted attributes `tool='view_file'`, `name="view_file"`, unquoted attributes `tool=view_file`, or tags with auxiliary attributes like `id="call_1"`.
  3. **Greedy unclosed thinking extraction**: An unclosed `<think>` tag at the beginning of the text matches until the end of the text, swallowing subsequent `<suna_tool_call>` blocks and wiping the content to empty string.
- **Suggestion**:
  - Do not gate syntax parsers behind `if (calls.length === 0)`. Run XML tag parsing, Markdown block parsing, and fallback JSON parsing, accumulating all distinct tool calls.
  - Relax the XML tool call regex: `/<(?:suna_tool_call|tool_call)(?:\s+[^>]*?)?>([\s\S]*?)<\/(?:suna_tool_call|tool_call)>/gi`. Extract attributes from the opening tag using `/(?:tool|name)=["']?([a-zA-Z0-9_\-]+)["']?/i`.
  - In `extractThinking()`, when handling unclosed `<think>` tags, ensure that any embedded `<suna_tool_call>` or `<tool_call>` is NOT swallowed into `thought`.

---

### [Major] Finding 5: Defects in `JsonAutoRepair`
- **Tag**: ENGINE DEFECT & RESILIENCE FAILURE
- **Where**: `suna_agent.js:78-136` (`JsonAutoRepair.repair`)
- **What**:
  1. `text.replace(/,(\s*[}\]])/g, '$1')` does not handle consecutive commas `{"a": 1,, "b": 2}`.
  2. Replacing single quotes with `/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"'` corrupts inner quotes like `{'msg': 'It\'s working'}` into invalid JSON `"It\"s working"`.
  3. Stream cutoff immediately after a colon `{"tool": ` produces `{"tool":}` which throws `SyntaxError: Unexpected token '}'`.
  4. Truncated deep nested structures like `{"a": {"b": [1, {"c": [2, 3` are not properly closed because the balance pass doesn't account for missing values.
- **Suggestion**:
  - Add pass to normalize multiple commas: `text.replace(/,(\s*,)+/g, ',');`.
  - Handle trailing colons before closing braces: `text.replace(/:\s*([}\]])/g, ': null$1');`.
  - Refine quote replacement or employ a token-based JSON auto-closer.

---

### [Major] Finding 6: Vietnamese Unicode NFC/NFD Equivalence & Diff Header Bug
- **Tag**: CODEX CODE SURGERY DEFECT
- **Where**: `suna_harness.js` / `suna_agent.js` ACI code surgery bridge
- **What**:
  1. In `replace_file_content`, if the file in VFS is stored in NFC form (`Tiếng Việt`) and the input `TargetContent` is in NFD form (`Tie^'ng Vie^.t`), exact string matching fails with `TargetContent not found in file`.
  2. In `VfsDiffEngine.previewReplaceDiff`, `diff.hasDiff` was `undefined` instead of boolean `true`.
- **Suggestion**:
  - In `replace_file_content`, apply `.normalize('NFC')` to both file content and `TargetContent` / `ReplacementContent` before searching and slicing.
  - In `VfsDiffEngine.previewReplaceDiff`, ensure `hasDiff: Boolean(patch && patch.trim().length > 0)` is always returned.

---

## 3. Verified Claims

| Claim from Worker Handoff | Independent Verification Result | Notes |
|---------------------------|----------------------------------|-------|
| `npx mocha tests/test_suna_agent.js` passes 178 tests | **VERIFIED (PASS)** | Passes 178 tests in 754ms |
| `npm run check` passes with 0 syntax errors | **VERIFIED (PASS)** | `node -c app.js && node -c redesign.js` clean |
| `node -c suna_agent.js` clean syntax | **VERIFIED (PASS)** | Exit code 0 |
| `suna_agent.js` UMD dual runtime exports | **VERIFIED (PASS)** | Works in Node.js and Browser |
| HITL controls (pause, resume, steer, rewind) | **VERIFIED (PASS)** | State transitions and listeners work |
| Live Workspace 2-way sync event emission | **VERIFIED (PASS)** | Emits `vfs_change` on file mutations |
| Runaway loop protection ($\ge 3$ consecutive errors) | **FAILED (DEFECT)** | Not implemented in `SunaAgent.executeStep()`; `F4.2.1` fails |
| MultiSyntaxParser robustness | **FAILED (DEFECT)** | Cannot parse mixed XML/Markdown; fails on XML attributes |
| `python run_verification.py` 100% green | **FAILED (REGRESSION)** | Exits with code 1; 15 tests fail in challenger suite |

---

## 4. Adversarial Challenge Results

- **Scenario 1: 3 Consecutive Step Failures**  
  *Expected*: `agent.status` transitions to `'halted'`.  
  *Actual*: `agent.status` remains `'idle'`.  
  *Result*: **FAIL (Critical)**.

- **Scenario 2: Mixed XML `<suna_tool_call>` and Markdown ````json` in single stream**  
  *Expected*: Both tools parsed into call array.  
  *Actual*: Only XML parsed; Markdown block skipped.  
  *Result*: **FAIL (Major)**.

- **Scenario 3: Single quotes in XML tag `<suna_tool_call tool='view_file'>`**  
  *Expected*: Tool name resolved to `'view_file'`.  
  *Actual*: Tool name unresolved (returns 0 calls).  
  *Result*: **FAIL (Major)**.

- **Scenario 4: Vietnamese Code Surgery with NFD targetContent**  
  *Expected*: Target located and replaced cleanly.  
  *Actual*: Throws `TargetContent not found in file`.  
  *Result*: **FAIL (Major)**.

- **Scenario 5: Malformed JSON with double commas `{"a": 1,, "b": 2}`**  
  *Expected*: Successfully repaired and parsed.  
  *Actual*: Throws `Unexpected token ','`.  
  *Result*: **FAIL (Major)**.

---

## 5. Conclusion & Actionable Next Steps

The work delivered by `worker_m1_o6` provides a solid foundation but cannot be approved in its current state due to:
1. Missing runaway loop protection ($\ge 3$ consecutive errors).
2. Hardcoded facade in `OodaBrain.planHierarchy`.
3. Parser vulnerabilities failing the adversarial test suite.
4. `python run_verification.py` failing with exit code 1.

**Required Actions for Worker**:
1. Wire `RunawayGuardrails` into `SunaAgent.executeStep()`: track consecutive errors and halt when $\ge 3$.
2. Fix `MultiSyntaxParser` to accumulate all tool calls across XML and Markdown blocks and support flexible attribute quoting.
3. Fix `JsonAutoRepair` for double commas, trailing colons, and escaped quotes.
4. Normalize Unicode NFC in `replace_file_content` and ensure `previewReplaceDiff` returns `hasDiff: true`.
5. Remove hardcoded dummy paths from `OodaBrain.planHierarchy` and support explicit step execution in `executeStep()`.
6. Run `npm test` and `python run_verification.py` until 100% of all suites (including `test_challenger_suna_agent_adversarial.js`) pass green.
