# Challenge Report — Adversarial Fuzzing & Stress Verification of SunaAgent

**Timestamp**: 2026-09-07T16:53:00Z  
**Agent**: Challenger 1 (critic, specialist)  
**Target**: `suna_agent.js` & `suna_harness.js` (Milestones 1-4 Adversarial Verification)  
**Overall Risk Assessment**: **CRITICAL**  
**Explicit Verdict**: **FAIL**

---

## Executive Summary

An adversarial fuzzing and stress test suite (`tests/test_challenger_suna_agent_adversarial.js`) comprising 34 targeted test cases was authored and executed against `suna_agent.js` and `suna_harness.js`. 
The execution yielded **19 passes** and **15 failures** (44.1% failure rate under adversarial conditions).

Critical vulnerabilities were empirically confirmed across all 4 required operational domains:
1. **Malformed JSON Repair**: Stack-less bracket balancing produces corrupt JSON for interleaved nested structures; `\'` in single-quoted strings produces invalid RFC 8259 escape sequences; inner double quotes break parser; double commas and post-colon stream truncations throw syntax errors.
2. **Multi-Syntax Tool Parsing**: Mutual-exclusion logic (`if (calls.length === 0)`) discards Markdown code blocks when XML tags are present in the same stream; XML regex fails on single-quoted attributes, alternative `name=` attributes, and multi-attribute tags; unclosed `<think>` tags at the start of text swallow subsequent tool calls.
3. **Codex Code Surgery**: Strict byte comparison without Unicode `normalize('NFC')` causes exact-replacement code surgery to fail when Vietnamese diacritical text is encoded in NFD form.
4. **Circuit Breaker**: `SunaAgent.executeStep` has zero integration with `RunawayGuardrails` and does not track consecutive failures; after 3 consecutive tool failures, `agent.status` remains `'idle'` instead of halting with `'halted'`, risking runaway execution loops.

---

## Detailed Empirical Findings

### Domain 1: Malformed JSON Auto-Repair Fuzzing (`JsonAutoRepair`)

#### 1.1 Stack-less Bracket Balancing Corrupts Interleaved JSON
- **Observation**:
  - Test `F1.1.2`: `{"a": {"b": [1, {"c": [2, 3` -> `SyntaxError: Expected ',' or '}' after property value in JSON at position 28`
  - Test `F1.1.3`: `[{"id": 1}, {"id": 2}, {"id": 3` -> `SyntaxError: Expected ',' or '}' after property value in JSON at position 31`
- **Logic Chain**:
  In `suna_agent.js` lines 132-133:
  ```javascript
  while (openBrackets > 0) { text += ']'; openBrackets--; }
  while (openBraces > 0) { text += '}'; openBraces--; }
  ```
  Closing delimiters are appended by category (all `]` first, then all `}`) rather than respecting Last-In First-Out (LIFO) stack order. For input `[{"id": 1}, {"id": 2}, {"id": 3`, open order is `[`, `{`. It appends `]}` yielding `[{"id": 1}, {"id": 2}, {"id": 3]}`, which is syntactically invalid.
- **Blast Radius**: High. Real-world LLM stream truncation on nested structures will crash `safeParse`.
- **Mitigation**: Replace separate `openBraces` / `openBrackets` counters with a delimiter stack (`delimiterStack = []`), pushing `{` or `[` and popping corresponding closing token on close, then appending inverted stack elements at cutoff.

#### 1.2 Uncleaned Double Consecutive Commas
- **Observation**:
  - Test `F1.2.4`: `{"a": 1,, "b": 2}` -> `AssertionError: JsonAutoRepair failed on double comma: Expected double-quoted property name in JSON at position 8`
- **Logic Chain**:
  Line 101 of `suna_agent.js` only removes commas immediately preceding closing braces: `text = text.replace(/,(\s*[}\]])/g, '$1');`. Consecutive commas between properties remain unhandled.
- **Mitigation**: Add regex pass: `text = text.replace(/,(\s*,)+/g, ',');`.

#### 1.3 Escaped Single Quotes Turned into Invalid JSON Escape Sequences
- **Observation**:
  - Test `F1.3.2`: `{'msg': 'It\'s working'}` -> `Bad escaped character in JSON at position 12 (line 1 column 13)`
- **Logic Chain**:
  Line 95: `text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');` converts `'It\'s working'` to `"It\'s working"`. Under RFC 8259, `\'` is an invalid escape sequence in JSON strings.
- **Mitigation**: Unescape `\'` to `'` within the converted double-quoted string: `.replace(/\\'/g, "'")`.

#### 1.4 Unescaped Inner Double Quotes in Single-Quoted Strings
- **Observation**:
  - Test `F1.3.3`: `{'quote': 'He said "hello"'}` -> `SyntaxError: Expected ',' or '}' after property value in JSON at position 20`
- **Logic Chain**:
  Inner double quotes are not escaped when outer single quotes are converted to double quotes, resulting in `{"quote": "He said "hello""}`.
- **Mitigation**: Escape any unescaped `"` characters inside matched single-quoted segments prior to wrapping with `"`.

#### 1.5 Cutoff Immediately Following Colon
- **Observation**:
  - Test `F1.4.3`: `{"tool": ` -> `Unexpected token '}', "{"tool":}" is not valid JSON`
- **Logic Chain**:
  When stream truncates after `: `, appending `}` produces `{"tool":}` without a value.
- **Mitigation**: Check for trailing colon before balancing braces: `text = text.replace(/:\s*$/, ': null');`.

---

### Domain 2: Multi-Syntax Tool Parsing Fuzzing (`MultiSyntaxParser`)

#### 2.1 Mutual Exclusion Prevents Mixed-Syntax Multi-Tool Parsing
- **Observation**:
  - Test `F2.1.1`: Single stream containing `<suna_tool_call>` followed by ````json {"tool": "list_dir"} ```` returned only 1 tool call instead of 2.
  - Test `F2.1.2`: Single stream with Markdown block before XML returned only 1 tool call instead of 2.
- **Logic Chain**:
  In `suna_agent.js` lines 245 and 262:
  ```javascript
  // 2. Markdown ```json code block
  if (calls.length === 0) { ... }
  // 3. Native function call JSON object
  if (calls.length === 0) { ... }
  ```
  Markdown parsing and Native JSON parsing are mutually exclusive with XML parsing. If an XML call is detected, all other valid tool calls in the turn are silently dropped.
- **Blast Radius**: High. LLM agents combining explanatory code fences and tool calls lose critical actions.
- **Mitigation**: Remove `if (calls.length === 0)` guards or aggregate all syntax matches across the stream.

#### 2.2 Fragile XML Attribute Matching
- **Observation**:
  - Test `F2.2.1`: `<suna_tool_call tool='view_file'>` -> 0 calls found.
  - Test `F2.2.2`: `<suna_tool_call name="view_file">` -> 0 calls found.
  - Test `F2.2.3`: `<suna_tool_call tool=view_file>` -> 0 calls found.
  - Test `F2.2.4`: `<suna_tool_call tool="view_file" id="call_1" timeout="3000">` -> 0 calls found.
- **Logic Chain**:
  Line 211 hardcodes: `/<(?:suna_tool_call|tool_call)(?:\s+tool="([^"]+)")?>/gi`.
  Any deviation in quoting (single quotes, no quotes), attribute name (`name=`), or additional attributes (`id=`, `timeout=`) causes regex matching to fail completely.
- **Mitigation**: Use flexible attribute regex: `/<(?:suna_tool_call|tool_call)\b([^>]*)>([\s\S]*?)<\/(?:suna_tool_call|tool_call)>/gi`, parsing attributes flexibly (`/(?:tool|name)=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i`).

#### 2.3 Unclosed Thinking Tags Swallow Tool Calls
- **Observation**:
  - Test `F2.3.2`: `<think>I should view the file\n<suna_tool_call tool="view_file">{"path": "x.js"}</suna_tool_call>`
  - Result: `thought` captured the entire input including the tool call; `content` was left completely empty `""`.
- **Logic Chain**:
  Line 189: `content.match(/<(think|thought|scratchpad)>([\s\S]*)$/i);` greedily consumes all text to EOF if an opening tag is unclosed, swallowing any subsequent XML tool calls or instructions.
- **Mitigation**: Stop unclosed thinking tag capture at the first occurrence of `<suna_tool_call` or code fence.

---

### Domain 3: Codex Code Surgery Unicode Normalization

#### 3.1 NFC vs NFD Normalization Mismatch in `replace_file_content`
- **Observation**:
  - Test `F3.2`: File written with NFC `Tiếng Việt có dấu`, replacement requested with NFD decomposed string.
  - Result: `AssertionError: TargetContent not found in file "test_nfc.txt"`.
- **Logic Chain**:
  `AciInterface.replace_file_content` and `VfsDiffEngine.previewReplaceDiff` perform exact string comparison without NFC normalization: `findValidMatchIndices(oldContent, String(targetContent))`.
  In Vietnamese, decomposed NFD bytes differ from precomposed NFC bytes despite visual identity.
- **Blast Radius**: Medium. Fails code surgery unexpectedly on systems or tokenizers that emit NFD text.
- **Mitigation**: Normalize both file content and `TargetContent` to NFC form: `const normTarget = String(targetContent).normalize('NFC');`.

---

### Domain 4: Circuit Breaker & Runaway Detection

#### 4.1 SunaAgent Autonomous Execution Loop Never Halts on Consecutive Failures
- **Observation**:
  - Test `F4.2.1`: `SunaAgent.executeStep` failed 3 consecutive times with missing tool.
  - Result: `AssertionError: Expected agent.status to be "halted" after 3 consecutive failures, but got "idle"`.
- **Logic Chain**:
  1. In `suna_agent.js`, `attachHarness` does not link `RunawayGuardrails`.
  2. `executeStep` catches tool errors into `toolResult = { status: 'error', error: err.message };` but contains zero logic to record failures in guardrails, check thresholds, or halt.
  3. At the end of `executeStep`, line 1037 unconditionally sets `this.status = 'idle'`.
  4. The required circuit breaker threshold ($\ge 3$ consecutive failures) is completely inoperative at the agent level.
- **Blast Radius**: Critical. Agent will loop endlessly in automated workflows upon encountering repeated failures.
- **Mitigation**: Wire `RunawayGuardrails` into `SunaAgent.attachHarness`. In `executeStep`, invoke `guardrails.recordFailure(step.tool, step.params)` upon error, and if `halted === true`, set `this.abort()`, `this.status = 'halted'`, and return `{ status: 'halted', reason: check.reason }`.

---

## Stress Test Scorecard

| Domain | Tests Executed | Passed | Failed | Success Rate | Risk Level |
|---|---|---|---|---|---|
| 1. Malformed JSON Auto-Repair | 12 | 7 | 5 | 58.3% | HIGH |
| 2. Multi-Syntax Tool Parsing | 10 | 3 | 7 | 30.0% | CRITICAL |
| 3. Codex Code Surgery & Diff | 4 | 3 | 1 | 75.0% | MEDIUM |
| 4. Circuit Breaker & Guardrails | 4 | 3 | 1 | 75.0% | CRITICAL |
| **Total** | **34** | **19** | **15** | **55.9%** | **CRITICAL** |

---

## Conclusion & Recommendations

The implementation of `suna_agent.js` and its integration with `suna_harness.js` contains architectural and algorithmic defects that prevent robust autonomous operation under adversarial conditions. 

**Explicit Recommendation**: **FAIL**
Do NOT promote to Milestone 5 until all 15 empirical defects identified in `tests/test_challenger_suna_agent_adversarial.js` are resolved.
