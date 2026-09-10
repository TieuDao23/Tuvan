## 2026-09-07T17:08:39Z

Implement the complete remediation per `REMEDIATION_BLUEPRINT.md`:
1. In `suna_agent.js`:
   - Replace `JsonAutoRepair.repair` with LIFO stack delimiter balancing, double-comma collapsing, RFC 8259 escape fixing, inner quote escaping, and colon `: null` handling (Explorer 1 §3.1).
   - Update `MultiSyntaxParser`: remove `if (calls.length === 0)` mutual exclusion, support flexible XML tag & attribute regex, protect `<think>` tag boundaries from swallowing tools, and sort calls chronologically (Explorer 1 §3.2).
   - Update `StreamParser.push` attribute regex (Explorer 1 §3.3).
   - Update `OodaBrain.analyzeIntent` and `planHierarchy` to extract target file dynamically with fallback to `app.js` (Explorer 2 §4 Blueprint 4).
   - Update `SunaAgent` constructor & properties: `consecutiveFailures`, `maxConsecutiveFailures = 3`, `guardrails`, `haltReason` (Explorer 2 §4 Blueprint 1).
   - Update `SunaAgent.attachHarness`: wire `RunawayGuardrails` (Explorer 2 §4 Blueprint 2).
   - Update `SunaAgent.reset`, `abort`, `steer` (Explorer 2 §4 Blueprint 3).
   - Update `SunaAgent.invokeAciTool`: apply `.normalize('NFC')` to `TargetContent` and `ReplacementContent` for `replace_file_content` (Explorer 3 §4 Blueprint Item 2).
   - Update `SunaAgent.executeStep`: refuse execution if halted, execute explicit step objects directly, record consecutive failures on error and halt when >= 3, reset to 0 on success, preserve `status = 'halted'` (Explorer 2 §4 Blueprint 5).
2. In `suna_harness.js`:
   - Update `findValidMatchIndices`: apply `.normalize('NFC')` to `text` and `target` (Explorer 3 §4 Blueprint Item 1.1).
   - Update `VfsSandbox.prototype.replaceContent`: apply `.normalize('NFC')` (Explorer 3 §4 Blueprint Item 1.2).
   - Update `VfsDiffEngine.previewReplaceDiff`: apply `.normalize('NFC')` and return `hasDiff: Boolean(patch && patch.trim().length > 0)` (Explorer 3 §4 Blueprint Item 1.3).
   - Update `AciSchemaValidator.normalizeArgs`: apply `.normalize('NFC')` for `replace_file_content` (Explorer 3 §4 Blueprint Item 1.4).
   - Update `RunawayGuardrails`: add `this.consecutiveFailures`, track consecutive errors, halt when >= maxConsecutiveFailures (Explorer 2 §4 Blueprint 6).
3. In `tests/test_suna_agent.js`:
   - Add imports `child_process` and `vm` at top.
   - Replace the 14 facade/self-certifying tests with genuine, robust assertions per Explorer 3 §4 Blueprint Item 3 (`T1-F14-6`, `T1-F19-2/3/4`, `T1-F20-4/6`, `T1-F21-1..6`, `T1-F22-1/4`, `T2-B15`).
   - Ensure zero occurrences of `assert.ok(true)` remain.
