# Synthesized Remediation Blueprint for SunaAgent & SunaHarness

## Overview
This document synthesizes the findings and blueprints from Explorer 1 (`175369e4-2a80-417c-8b95-f114578b22fe`), Explorer 2 (`dcac1092-7139-43d5-987f-0dbdfa792588`), and Explorer 3 (`f17d5ff5-4ff0-48c3-ae17-78a8c0ecc8f4`) to resolve all 15 adversarial test failures and all audit integrity violations.

---

## PART 1: Changes to `suna_agent.js`

### 1.1 `JsonAutoRepair` (Lines 78–159)
Replace with LIFO delimiter stack, string-aware consecutive comma collapsing, RFC 8259 unescaped `\'` to `'` conversion, inner double-quote escaping, and post-colon `: null` handling.
(See `d:\Suna Chat\.agents\explorer_1_o7\handoff.md` §3.1)

### 1.2 `MultiSyntaxParser` (Lines 165–281)
- In `extractThinking`: truncate unclosed `<think>` tag when encountering tool call boundaries `/(<(?:suna_tool_call|tool_call)\b|```(?:json)?\s*\{)/i`.
- In `parse`: remove `if (calls.length === 0)` mutual exclusion; flexibly match XML attributes `/(?:tool|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i` on tag `/<(?:suna_tool_call|tool_call)\b([^>]*)>([\s\S]*?)<\/(?:suna_tool_call|tool_call)>/gi`; accumulate Markdown code blocks; sort accumulated calls chronologically by stream `startIndex`.
(See `d:\Suna Chat\.agents\explorer_1_o7\handoff.md` §3.2)

### 1.3 `StreamParser.push` (Lines 322–325)
Update `toolMatch` to use `openTag.match(/(?:tool|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)`.
(See `d:\Suna Chat\.agents\explorer_1_o7\handoff.md` §3.3)

### 1.4 `OodaBrain.analyzeIntent` and `planHierarchy` (Lines 502–532)
Dynamically extract target file names from prompts (regex `/(?:in|file|path|at|inspect|edit|fix|update)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i` and extension pattern) with fallback to `app.js`.
(See `d:\Suna Chat\.agents\explorer_2_o7\handoff.md` §4 Blueprint 4)

### 1.5 `SunaAgent` Constructor & Properties (Lines 576–605)
Initialize `this.consecutiveFailures = 0`, `this.maxConsecutiveFailures = 3`, `this.haltReason = null`, and wire `this.guardrails`.
(See `d:\Suna Chat\.agents\explorer_2_o7\handoff.md` §4 Blueprint 1)

### 1.6 `SunaAgent.reset`, `abort`, and `steer`
- `reset()`: reset `this.consecutiveFailures = 0`, `this.haltReason = null`, call `this.guardrails.reset()`.
- `abort(reason)`: set `this.status = 'halted'`, `this.isAgentAborted = true`.
- `steer(instruction)`: reset `this.consecutiveFailures = 0`, `this.haltReason = null`.
(See `d:\Suna Chat\.agents\explorer_2_o7\handoff.md` §4 Blueprint 3)

### 1.7 `SunaAgent.attachHarness` (Lines 839–854)
Wire `RunawayGuardrails` into `this.guardrails` and attach `this.vfs`.
(See `d:\Suna Chat\.agents\explorer_2_o7\handoff.md` §4 Blueprint 2)

### 1.8 `SunaAgent.invokeAciTool` (Lines 883–893)
Ensure `TargetContent` / `targetContent` and `ReplacementContent` / `replacementContent` are normalized with `.normalize('NFC')` before passing to `previewReplaceDiff`.
(See `d:\Suna Chat\.agents\explorer_3_o7\handoff.md` §4 Blueprint Item 2)

### 1.9 `SunaAgent.executeStep` (Lines 973–1047)
- Pre-condition: if `this.status === 'halted' || this.isAgentAborted`, return `{ status: 'halted', halted: true, reason: ... }`.
- Handle explicit step objects directly when passed.
- On tool error: increment `this.consecutiveFailures++`, record failure in `this.guardrails`. If `consecutiveFailures >= maxConsecutiveFailures (3)` or guardrails halted, set `this.status = 'halted'`, `this.isAgentAborted = true`, emit `circuit_breaker_tripped` and `status_change`.
- On tool success: reset `this.consecutiveFailures = 0`, record success in guardrails, check action/stagnant VFS loop.
- In lifecycle resolution: only transition to `idle` if `this.status === 'running'`. Return `halted: this.status === 'halted'`.
(See `d:\Suna Chat\.agents\explorer_2_o7\handoff.md` §4 Blueprint 5)

---

## PART 2: Changes to `suna_harness.js`

### 2.1 `findValidMatchIndices` (Lines 127–142)
Apply `.normalize('NFC')` to both `text` and `target` before `indexOf`.
(See `d:\Suna Chat\.agents\explorer_3_o7\handoff.md` §4 Blueprint Item 1.1)

### 2.2 `VfsSandbox.prototype.replaceContent` (Lines 706–709)
Apply `.normalize('NFC')` to `fileNode.content`, `targetContent`, and `replacementContent`.
(See `d:\Suna Chat\.agents\explorer_3_o7\handoff.md` §4 Blueprint Item 1.2)

### 2.3 `VfsDiffEngine.previewReplaceDiff` (Lines 1553–1622)
Normalize `oldContent`, `targetContent`, `replacementContent` to NFC; return `hasDiff: Boolean(patch && patch.trim().length > 0)`.
(See `d:\Suna Chat\.agents\explorer_3_o7\handoff.md` §4 Blueprint Item 1.3)

### 2.4 `AciSchemaValidator.normalizeArgs` (Lines 2087–2093)
Normalize `TargetContent`, `targetContent`, `ReplacementContent`, `replacementContent` to NFC.
(See `d:\Suna Chat\.agents\explorer_3_o7\handoff.md` §4 Blueprint Item 1.4)

### 2.5 `RunawayGuardrails` (Lines 5508–5540)
Add `this.consecutiveFailures = 0`. In `recordFailure`, increment `this.consecutiveFailures` and halt if `count >= maxConsecutiveFailures || this.consecutiveFailures >= maxConsecutiveFailures`. In `recordSuccess` and `reset`, reset `this.consecutiveFailures = 0`.
(See `d:\Suna Chat\.agents\explorer_2_o7\handoff.md` §4 Blueprint 6)

---

## PART 3: Changes to `tests/test_suna_agent.js`

Replace all 14 facade/self-certifying assertions with genuine invocations:
- `T1-F14-6`: test `OodaBrain.reflectObservation` with clean observation.
- `T1-F19-2`, `T1-F19-3`, `T1-F19-4`: test `ScorecardReporter.calculateMetrics` and `SunaHarnessVisualizer.setBenchmarkResults` & `_generateScorecardHtml()`.
- `T1-F20-4`: test async tool execution with `testAgent.executeTool('delayed_probe')`.
- `T1-F20-6`: compile `suna_agent.js` in isolated Node `vm` context and instantiate `new sandbox.SunaAgent()`.
- `T1-F21-1`: execute `child_process.execSync('npx mocha tests/test_dsh_zero_regression_matrix.js')`.
- `T1-F21-2`, `T1-F21-3`, `T1-F21-4`: execute `child_process.execFileSync('node', ['-c', appFile / redesignFile / harnessFile])`.
- `T1-F21-5`: verify `styles.css` brace balance and `z-index: 10000`.
- `T1-F21-6`: verify `run_verification.py` stage functions and execute `python -m py_compile run_verification.py`.
- `T1-F22-1`: verify all 4 tiers exist in the test file.
- `T1-F22-4`: verify concurrent deterministic agent execution with `Promise.all`.
- `T2-B15`: verify `SmartMemory.estimateTokens()` throws on circular reference.
(See `d:\Suna Chat\.agents\explorer_3_o7\handoff.md` §4 Blueprint Item 3)
