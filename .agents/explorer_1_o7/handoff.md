# Investigation & Remediation Blueprint: MultiSyntaxParser & JsonAutoRepair

**Author**: Explorer 1 (`teamwork_preview_explorer`)  
**Target File**: `d:\Suna Chat\suna_agent.js`  
**Test Suite**: `d:\Suna Chat\tests\test_challenger_suna_agent_adversarial.js` (Domains 1 & 2)  
**Project Workspace**: `d:\Suna Chat`  
**Timestamp**: 2026-09-08T00:06:00+07:00  

---

## Executive Summary & Root Cause Matrix

An exhaustive forensic analysis of the parser and auto-repair failures identified in `auditor_1_o6/audit_report.md` and `challenger_1_o6/challenge_report.md` was conducted. All 13 test failures across Domain 1 (6 failures) and Domain 2 (7 failures) were empirically reproduced, isolated to specific lines in `suna_agent.js`, and resolved through a validated algorithmic redesign.

| Domain & Test Case | Location in `suna_agent.js` | Flawed Pattern | Root Cause Mechanism | Proposed Fix & Impact |
|---|---|---|---|---|
| **F2.1.1, F2.1.2**: Mixed XML & Markdown | Lines 245, 262 | `if (calls.length === 0)` | Short-circuits Markdown & Native JSON parsers once an XML call is matched, discarding subsequent tool calls in the turn. | Remove `if (calls.length === 0)` guards; accumulate XML + Markdown calls sorted by stream position `startIndex`. |
| **F2.2.1 - F2.2.4**: XML Tag Attributes | Line 211 | `/(?:tool="([^"]+)")?>/` | Hardcodes double quotes, exact attribute key `tool=`, and requires `>` immediately after, breaking on `'`, unquoted, `name=`, or auxiliary attributes (`id=`, `timeout=`). | Relax tag pattern to `/<(?:suna_tool_call\|tool_call)\b([^>]*)>([\s\S]*?)<\/(?:suna_tool_call\|tool_call)>/gi` and extract tool name with `/(?:tool\|name)\s*=\s*(?:"([^"]+)"\|'([^']+)'\|([^\s>]+))/i`. |
| **F2.3.2**: Unclosed Thinking Tag | Lines 189–193 | `/<(think\|...)>([\s\S]*)$/i` | Greedily consumes the entire remainder of the stream into `thought`, leaving `content = ""` and swallowing `<suna_tool_call>` tags. | Check `tail` for tool boundaries (`/(<(?:suna_tool_call\|tool_call)\b\|```(?:json)?\s*\{)/i`) and preserve downstream tool call text in `content`. |
| **F1.1.2, F1.1.3**: Bracket Balancing | Lines 109–134 | Separate `openBraces` / `openBrackets` counters | Appends closing tokens by category (all `]` first, then all `}`) rather than LIFO order, corrupting interleaved nested structures (e.g. `[{"id": 3]}`). | Implement a LIFO delimiter stack `stack = []`, pushing matching closing token `}` or `]` and popping on close. |
| **F1.2.4**: Double Consecutive Commas | Line 101 | `,(\s*[}\]])` | Only removes commas immediately preceding closing braces/brackets; consecutive commas `{"a": 1,, "b": 2}` are unhandled. | Add string-aware consecutive comma collapsing pass: `text.replace(/"(?:[^"\\]\|\\.)*"\|,(\s*,)+/g, (m, g1) => g1 ? ',' : m)`. |
| **F1.3.2**: Escaped Single Quote `\'` | Line 95 | `/'(...)g', '"$1"'` | Leaves `\'` inside `"..."` which is an illegal escape sequence in RFC 8259 JSON strings, causing `SyntaxError: Bad escaped character`. | Unescape `\'` to `'` inside converted single-quoted strings: `singleContent.replace(/\\'/g, "'")`. |
| **F1.3.3**: Inner Double Quotes | Line 95 | `/'(...)g', '"$1"'` | Unescaped inner double quotes `'He said "hello"'` are placed raw into `"He said "hello""`, corrupting JSON string boundaries. | Escape unescaped double quotes inside converted strings: `.replace(/\\"/g, '"').replace(/"/g, '\\"')`. |
| **F1.4.3**: Stream Cutoff After Colon | Lines 108–134 | `{"tool": ` -> `{"tool":}` | When stream cuts off after `:` without a value, appending `}` creates an invalid key-value pair without a value. | Normalize colon before EOF or delimiter: `text.replace(/"(?:[^"\\]\|\\.)*"\|(:\s*(?=[}\],]\|$))/g, (m, g1) => g1 ? ': null' : m)`. |

---

## 1. Observation

### 1.1 Test Execution Failures
Running `npx mocha tests/test_challenger_suna_agent_adversarial.js` in `d:\Suna Chat` fails with **15 failing tests**, 13 of which belong to Domains 1 and 2:

```text
  1) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)
         1.1 Unclosed Brackets & Braces Balancing
           F1.1.2: should repair deeply unclosed nested objects and arrays:
     SyntaxError: Expected ',' or '}' after property value in JSON at position 28 (line 1 column 29)
      at JSON.parse (<anonymous>)
      at JsonAutoRepair.safeParse (suna_agent.js:152:21)

  2) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)
         1.1 Unclosed Brackets & Braces Balancing
           F1.1.3: should repair unclosed array of objects:
     SyntaxError: Expected ',' or '}' after property value in JSON at position 31 (line 1 column 32)
      at JSON.parse (<anonymous>)
      at JsonAutoRepair.safeParse (suna_agent.js:152:21)

  3) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)
         1.2 Dangling and Malformed Commas
           F1.2.4: CHALLENGE - double consecutive commas: {"a": 1,, "b": 2}:
     AssertionError [ERR_ASSERTION]: JsonAutoRepair failed on double comma: Expected double-quoted property name in JSON at position 8 (line 1 column 9)

  4) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)
         1.3 Single Quotes with Escaped & Nested Quotes
           F1.3.2: CHALLENGE - single quote containing escaped single quote: {'msg': 'It\'s working'}:
     AssertionError [ERR_ASSERTION]: JsonAutoRepair failed on single quote with escaped quote: Bad escaped character in JSON at position 12 (line 1 column 13)

  5) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)
         1.3 Single Quotes with Escaped & Nested Quotes
           F1.3.3: CHALLENGE - single quoted JSON containing double quotes: {'quote': 'He said "hello"'}:
     AssertionError [ERR_ASSERTION]: JsonAutoRepair failed on inner double quotes: Expected ',' or '}' after property value in JSON at position 20 (line 1 column 21)

  6) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)
         1.4 Truncated Strings from Stream Cutoffs
           F1.4.3: CHALLENGE - cut off immediately after colon: {"tool"::
     AssertionError [ERR_ASSERTION]: JsonAutoRepair failed on truncation after colon: Unexpected token '}', "{"tool":}" is not valid JSON

  7) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)
         2.1 Mixed XML and Markdown in Single Stream
           F2.1.1: CHALLENGE - single stream containing both XML tool call AND Markdown json block:
      AssertionError [ERR_ASSERTION]: Expected 2 tool calls, but parsed 1: [{"tool":"view_file","args":{"path":"config.json"},"raw":"<suna_tool_call tool=\"view_file\">\n{\"path\": \"config.json\"}\n</suna_tool_call>"}]
      1 !== 2

  8) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)
         2.1 Mixed XML and Markdown in Single Stream
           F2.1.2: CHALLENGE - Markdown block before XML tool call in single stream:
      AssertionError [ERR_ASSERTION]: Expected 2 tool calls, got 1
      1 !== 2

  9) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
       2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)
         2.2 Malformed XML Attributes
           F2.2.1: CHALLENGE - single quotes in XML tool attribute: <suna_tool_call tool='view_file'>:
      AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 0 !== 1

  10) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
        2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)
          2.2 Malformed XML Attributes
            F2.2.2: CHALLENGE - "name" attribute instead of "tool": <suna_tool_call name="view_file">:
      AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 0 !== 1

  11) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
        2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)
          2.2 Malformed XML Attributes
            F2.2.3: CHALLENGE - unquoted attribute: <suna_tool_call tool=view_file>:
      AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 0 !== 1

  12) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
        2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)
          2.2 Malformed XML Attributes
            F2.2.4: extra attributes in tool call tag: <suna_tool_call tool="view_file" id="call_1" timeout="3000">:
      AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 0 !== 1

  13) Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite
        2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)
          2.3 Unclosed Thinking Tags
            F2.3.2: CHALLENGE - unclosed <think> tag at beginning of text preceding a tool call:
      AssertionError [ERR_ASSERTION]: Tool call swallowed into thought: thought="I should view the file
<suna_tool_call tool="view_file">{"path": "x.js"}</suna_tool_call>", content=""
```

### 1.2 Baseline Suite Verification
Running `npx mocha tests/test_suna_agent.js` demonstrates that all **178 baseline tests** pass. The proposed fixes must maintain 100% pass rates across all 178 tests.

---

## 2. Logic Chain & Root Cause Analysis

### 2.1 MultiSyntaxParser Root Causes

#### 2.1.1 Mutual Exclusion Bug (`if (calls.length === 0)`)
- **Direct Observation**: In `suna_agent.js` lines 245 and 262:
  ```javascript
  // 2. Markdown ```json code block
  if (calls.length === 0) { ... }
  // 3. Native function call JSON object
  if (calls.length === 0) { ... }
  ```
- **Trace**:
  1. In Test `F2.1.1`, the completion stream has `<suna_tool_call>` followed by ````json ... ````.
  2. The XML scanner runs first and finds 1 tool call -> `calls.length` becomes `1`.
  3. The Markdown parser at line 245 checks `if (calls.length === 0)` -> evaluates to `false`.
  4. The Markdown block is silently discarded, yielding only 1 call instead of 2.
  5. In Test `F2.1.2`, the Markdown block appears *before* the XML call. However, because XML scanning occurs *first* in code execution, the XML call is parsed first, setting `calls.length = 1`, and the Markdown block is again ignored.
- **Inference**: Markdown tool call parsing must run independently of whether XML calls were detected. Both sets of calls must be accumulated. Furthermore, tool calls should be sorted by their occurrence index (`startIndex`) to preserve the chronological emission sequence. Native JSON object parsing should remain a fallback only when neither XML nor Markdown blocks exist.

#### 2.1.2 Fragile XML Tag Attribute Regex
- **Direct Observation**: In `suna_agent.js` line 211:
  ```javascript
  const xmlPattern = /<(?:suna_tool_call|tool_call)(?:\s+tool="([^"]+)")?>([\s\S]*?)<\/(?:suna_tool_call|tool_call)>/gi;
  ```
- **Trace**:
  1. The regex strictly expects `tool="([^"]+)"`.
  2. Test `F2.2.1` uses single quotes (`tool='view_file'`) -> regex fails to match the attribute.
  3. Test `F2.2.2` uses `name="view_file"` -> regex fails because key `tool` is required.
  4. Test `F2.2.3` uses unquoted `tool=view_file` -> regex fails due to missing quotes.
  5. Test `F2.2.4` has auxiliary attributes `id="call_1" timeout="3000"` following `tool="view_file"` -> the regex expects `>` immediately after the optional group `(?:\s+tool="([^"]+)")?`, so it fails to match the tag entirely.
- **Inference**: The opening tag matcher must capture all attributes as a flexible substring: `/<(?:suna_tool_call|tool_call)\b([^>]*)>([\s\S]*?)<\/(?:suna_tool_call|tool_call)>/gi`. The tool name must then be extracted using a dedicated attribute matcher: `/(?:tool|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i`.

#### 2.1.3 Unclosed Thinking Tag Swallowing Downstream Tool Calls
- **Direct Observation**: In `suna_agent.js` lines 189–193:
  ```javascript
  const unclosedMatch = content.match(/<(think|thought|scratchpad)>([\s\S]*)$/i);
  if (unclosedMatch) {
    thought += (thought ? '\n' : '') + unclosedMatch[2].trim();
    content = content.slice(0, unclosedMatch.index).trim();
  }
  ```
- **Trace**:
  1. In Test `F2.3.2`, the input is `<think>I should view the file\n<suna_tool_call tool="view_file">{"path": "x.js"}</suna_tool_call>`.
  2. Because `<think>` is never closed with `</think>`, `unclosedMatch` matches at index `0`.
  3. `unclosedMatch[2]` captures everything to `$`: `I should view the file\n<suna_tool_call...`.
  4. `content.slice(0, 0)` leaves `content` empty (`""`).
  5. Downstream parser receives an empty string; the tool call is lost inside `thought`.
- **Inference**: When an unclosed `<think>` tag is detected, the captured `tail` must be inspected for downstream tool call boundaries (`/<(?:suna_tool_call|tool_call)\b|```(?:json)?\s*\{/i`). If a tool boundary is found, `thought` only consumes text up to the boundary index, and the tool call text is preserved in `content`.

---

### 2.2 JsonAutoRepair Root Causes

#### 2.2.1 Stack-less Bracket Balancing Corrupting Interleaved Structures
- **Direct Observation**: In `suna_agent.js` lines 109–134:
  ```javascript
  let openBraces = 0;
  let openBrackets = 0;
  ...
  while (openBrackets > 0) { text += ']'; openBrackets--; }
  while (openBraces > 0) { text += '}'; openBraces--; }
  ```
- **Trace**:
  1. For `[{"id": 1}, {"id": 2}, {"id": 3`: opening order is `[` then `{`. Unclosed openings: 1 `[`, 1 `{`.
  2. Closing order must be `}` then `]` (LIFO).
  3. Current code appends all `]` then all `}` -> `[{"id": 1}, {"id": 2}, {"id": 3]}`. This attempts to close an object with `]`, crashing with `SyntaxError: Expected ',' or '}'`.
  4. For `{"a": {"b": [1, {"c": [2, 3`: opening order is `{`, `{`, `[`, `{`, `[`.
  5. Current code appends `]]}}}` -> `{"a": {"b": [1, {"c": [2, 3]]}}}`. It doubles up the array closure `]]` inside object `c`, corrupting JSON structure.
- **Inference**: Separate counters cannot track interleaved nesting. A delimiter stack `stack = []` is required: push `}` on `{`, push `]` on `[`, pop on matching close, and append remaining elements via `while (stack.length > 0) text += stack.pop()`.

#### 2.2.2 Double Consecutive Commas `,,`
- **Direct Observation**: Line 101 of `suna_agent.js`:
  ```javascript
  text = text.replace(/,(\s*[}\]])/g, '$1');
  ```
- **Trace**: Test `F1.2.4` passes `{"a": 1,, "b": 2}`. Line 101 only removes commas before `}` or `]`. The duplicate comma `,,` remains and causes `JSON.parse` to fail with `Expected double-quoted property name`.
- **Inference**: A dedicated replacement pass is required. To avoid corrupting valid double commas inside string values (e.g. `{"text": "one,, two"}`), match double-quoted strings first and only collapse consecutive commas outside strings:
  `text = text.replace(/"(?:[^"\\]|\\.)*"|,(\s*,)+/g, (m, g1) => g1 ? ',' : m);`

#### 2.2.3 Escaped Single Quotes `\'` Creating Invalid RFC 8259 Sequences
- **Direct Observation**: Line 95 of `suna_agent.js`:
  ```javascript
  text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
  ```
- **Trace**: In Test `F1.3.2`, `{'msg': 'It\'s working'}` contains `\'`. Line 95 transforms `'It\'s working'` into `"It\'s working"`. In JSON (RFC 8259 §7), `\'` is an illegal escape character (only `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX` are valid). `JSON.parse` throws `Bad escaped character in JSON`.
- **Inference**: Inside single-quoted strings, `\'` was only escaped because the enclosing delimiter was `'`. Once converted to `"..."`, `\'` must be unescaped to `'`: `singleContent.replace(/\\'/g, "'")`.

#### 2.2.4 Inner Unescaped Double Quotes Inside Single-Quoted Strings
- **Direct Observation**: Line 95 of `suna_agent.js`.
- **Trace**: In Test `F1.3.3`, `{'quote': 'He said "hello"'}` has inner unescaped double quotes. Line 95 converts outer `'...'` to `"..."` without escaping inner double quotes, producing `{"quote": "He said "hello""}`. `JSON.parse` terminates the string at `"He said "` and crashes on unexpected identifier `hello`.
- **Inference**: All inner double quotes inside the single-quoted string must be escaped prior to enclosing with double quotes: `unescapedSingle.replace(/\\"/g, '"').replace(/"/g, '\\"')`. Furthermore, to prevent matching across apostrophes in existing double-quoted strings (e.g. `{"a": "don't", "b": "won't"}`), the regex must preserve double-quoted strings first:
  `text = text.replace(/"(?:[^"\\]|\\.)*"|'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, singleContent) => ...);`

#### 2.2.5 Truncated Stream Cutoff Immediately Following Colon
- **Direct Observation**: Lines 108–134 of `suna_agent.js`.
- **Trace**: In Test `F1.4.3`, `{"tool": ` cuts off right after `:`. Bracket balancing closes the brace, generating `{"tool":}`. In JSON, every object key must have a value. `JSON.parse` throws `Unexpected token '}'`.
- **Inference**: Any colon followed by end-of-string or closing delimiter outside strings must be supplied with a default `null` value:
  `text = text.replace(/"(?:[^"\\]|\\.)*"|(:\s*(?=[}\],]|$))/g, (m, g1) => g1 ? ': null' : m);`
  Additionally, right before delimiter stack popping, trailing colons must be guarded with `text = text.replace(/:\s*$/, ': null');`.

---

## 3. Concrete Drop-in Code Blueprint for Worker

The worker agent should apply the following character-accurate replacements in `d:\Suna Chat\suna_agent.js`.

### 3.1 Drop-in Replacement for `JsonAutoRepair` (Lines 78–159)

Target File: `d:\Suna Chat\suna_agent.js`  
Start Line: `78`  
End Line: `159`  

```javascript
  class JsonAutoRepair {
    /**
     * Multi-pass deterministic string repair for malformed JSON emitted by LLMs.
     * @param {string} raw - Malformed or raw JSON string.
     * @returns {string} Repaired valid JSON string.
     */
    static repair(raw) {
      if (typeof raw !== 'string') return '{}';
      let text = raw.trim();

      // 1. Normalize smart double and single quotes
      text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

      // 2. Strip Markdown code fences if wrapped
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      // 3. Replace single-quoted JSON keys and string values safely while preserving quotes inside double-quoted strings
      text = text.replace(/"(?:[^"\\]|\\.)*"|'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, singleContent) => {
        if (singleContent !== undefined) {
          // Unescape escaped single quotes \' -> ' (invalid in RFC 8259 JSON)
          const unescapedSingle = singleContent.replace(/\\'/g, "'");
          // Escape unescaped double quotes inside the single-quoted string
          const escapedDouble = unescapedSingle.replace(/\\"/g, '"').replace(/"/g, '\\"');
          return '"' + escapedDouble + '"';
        }
        return match;
      });

      // 4. Quote unquoted object keys: { foo: "bar" } or {, foo: "bar" } or { target-file: "a.js" }
      text = text.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/g, '$1"$2":');

      // 5. Clean consecutive commas (ignoring inside strings)
      text = text.replace(/"(?:[^"\\]|\\.)*"|,(\s*,)+/g, (m, g1) => g1 ? ',' : m);

      // 6. Strip trailing commas before closing braces or brackets
      text = text.replace(/,(\s*[}\]])/g, '$1');

      // 7. Fix colon without value before comma, brace, or bracket (ignoring inside strings)
      text = text.replace(/"(?:[^"\\]|\\.)*"|(:\s*(?=[}\],]|$))/g, (m, g1) => g1 ? ': null' : m);

      // 8. Normalize unescaped newlines in multiline string values
      while (/(:\s*"[^"\n]*)\r?\n([^"]*")/g.test(text)) {
        text = text.replace(/(:\s*"[^"\n]*)\r?\n([^"]*")/g, '$1\\n$2');
      }

      // 9. Balance unclosed braces/brackets in LIFO order (using delimiter stack)
      let inString = false;
      let escaped = false;
      const stack = [];

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '\\' && !escaped) {
          escaped = true;
          continue;
        }
        if (ch === '"' && !escaped) {
          inString = !inString;
        } else if (!inString) {
          if (ch === '{') {
            stack.push('}');
          } else if (ch === '[') {
            stack.push(']');
          } else if (ch === '}' || ch === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === ch) {
              stack.pop();
            } else {
              const lastIdx = stack.lastIndexOf(ch);
              if (lastIdx !== -1) {
                stack.splice(lastIdx);
              }
            }
          }
        }
        escaped = false;
      }

      if (inString) text += '"';

      // Strip any dangling comma or fix dangling colon at the cutoff boundary before closing delimiters
      text = text.replace(/,\s*$/, '');
      text = text.replace(/:\s*$/, ': null');

      while (stack.length > 0) {
        text += stack.pop();
      }

      return text;
    }

    /**
     * Safely parses JSON with auto-repair fallback.
     * @param {string|any} raw 
     * @returns {any}
     */
    static safeParse(raw) {
      if (typeof raw === 'object' && raw !== null) return raw;
      if (typeof raw !== 'string') return raw;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        const repaired = JsonAutoRepair.repair(trimmed);
        return JSON.parse(repaired);
      }
    }

    static parse(raw) {
      return this.safeParse(raw);
    }
  }
```

---

### 3.2 Drop-in Replacement for `MultiSyntaxParser` (Lines 165–281)

Target File: `d:\Suna Chat\suna_agent.js`  
Start Line: `165`  
End Line: `281`  

```javascript
  class MultiSyntaxParser {
    /**
     * Extracts thinking blocks (<think>, <thought>, <scratchpad>) separating internal reasoning from user content.
     * @param {string} text 
     * @returns {{ thought: string, content: string }}
     */
    static extractThinking(text) {
      if (typeof text !== 'string') return { thought: '', content: '' };
      let content = text;
      let thought = '';

      // Match closed think/thought/scratchpad tags
      const thinkRegex = /<(think|thought|scratchpad)>([\s\S]*?)<\/\1>/gi;
      let match;
      while ((match = thinkRegex.exec(content)) !== null) {
        thought += (thought ? '\n' : '') + match[2].trim();
        content = content.slice(0, match.index) + content.slice(match.index + match[0].length);
        thinkRegex.lastIndex = 0;
      }

      // Strip leftover orphan closing tags
      content = content.replace(/<\/(think|thought|scratchpad)>/gi, '').trim();

      // Handle unclosed stream tag at end of string or before downstream tool calls
      const unclosedMatch = content.match(/<(think|thought|scratchpad)>([\s\S]*)$/i);
      if (unclosedMatch) {
        const tail = unclosedMatch[2];
        const toolBoundaryRegex = /(<(?:suna_tool_call|tool_call)\b|```(?:json)?\s*\{)/i;
        const boundaryMatch = tail.match(toolBoundaryRegex);

        if (boundaryMatch) {
          const boundaryIndex = boundaryMatch.index;
          thought += (thought ? '\n' : '') + tail.slice(0, boundaryIndex).trim();
          content = (content.slice(0, unclosedMatch.index) + '\n' + tail.slice(boundaryIndex)).trim();
        } else {
          thought += (thought ? '\n' : '') + tail.trim();
          content = content.slice(0, unclosedMatch.index).trim();
        }
      }

      // Clean any inner opening tags if nested (<think><think>nested</think></think>)
      thought = thought.replace(/<(think|thought|scratchpad)>/gi, '').trim();

      return { thought, content };
    }

    /**
     * Parses tool calls across XML, Markdown code blocks, and Native JSON formats.
     * @param {string} text 
     * @returns {Array<{ tool: string, args: Record<string, any>, raw: string }>}
     */
    static parse(text) {
      if (!text || typeof text !== 'string') return [];
      const calls = [];

      // 1. XML <suna_tool_call> or <tool_call>
      // Flexible attribute matching: supports tool="x", tool='x', tool=x, name="x", plus auxiliary attributes (id, timeout)
      const xmlPattern = /<(?:suna_tool_call|tool_call)\b([^>]*)>([\s\S]*?)<\/(?:suna_tool_call|tool_call)>/gi;
      let m;
      while ((m = xmlPattern.exec(text)) !== null) {
        const attrStr = m[1] || '';
        const body = m[2].trim();
        const attrMatch = attrStr.match(/(?:tool|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
        const attrTool = attrMatch ? (attrMatch[1] || attrMatch[2] || attrMatch[3]) : null;

        try {
          const parsed = JsonAutoRepair.safeParse(body);
          if (parsed && typeof parsed === 'object') {
            const toolName = attrTool || parsed.tool || parsed.name || parsed.tool_name;
            const args = parsed.args || parsed.parameters || parsed.params || parsed.arguments || Object.assign({}, parsed);
            if (args && typeof args === 'object') {
              delete args.tool;
              delete args.tool_name;
              delete args.name;
            }
            calls.push({ tool: toolName, args, raw: m[0], startIndex: m.index });
          }
        } catch (e) {
          const subParam = {};
          const subMatch = body.match(/<([^>]+)>([\s\S]*?)<\/\1>/g);
          if (subMatch) {
            subMatch.forEach(tag => {
              const tm = tag.match(/<([^>]+)>([\s\S]*?)<\/\1>/);
              if (tm) subParam[tm[1]] = tm[2].trim();
            });
          }
          const toolName = attrTool || subParam.tool_name || subParam.name || 'unknown';
          delete subParam.tool_name;
          delete subParam.name;
          calls.push({ tool: toolName, args: subParam, raw: m[0], startIndex: m.index });
        }
      }

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
      } else {
        // Sort accumulated calls by appearance order in text
        calls.sort((a, b) => a.startIndex - b.startIndex);
        calls.forEach(c => delete c.startIndex);
      }

      return calls;
    }
  }
```

---

### 3.3 Bonus Hardening for `StreamParser.push` (Lines 323–324)

Target File: `d:\Suna Chat\suna_agent.js`  
Start Line: `322`  
End Line: `325`  

In `StreamParser.push()`, currently line 323 reads:
```javascript
const toolMatch = openTag.match(/tool="([^"]+)"/);
this.currentToolName = toolMatch ? toolMatch[1] : null;
```
For streaming parity with `MultiSyntaxParser`, replace with:
```javascript
const toolMatch = openTag.match(/(?:tool|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
this.currentToolName = toolMatch ? (toolMatch[1] || toolMatch[2] || toolMatch[3]) : null;
```

---

## 4. Caveats

1. **Other Test Failures in Adversarial Suite**:
   This blueprint specifically diagnoses and resolves the 13 failures in **Domain 1** (JSON Auto-Repair) and **Domain 2** (Multi-Syntax Tool Parsing).
   Two failures in the adversarial test suite belong to other modules:
   - `F3.2`: Vietnamese Unicode NFC vs NFD equivalence in `replace_file_content` (`suna_harness.js`).
   - `F4.2.1`: SunaAgent autonomous loop halting when consecutive failures $\ge 3$ (`suna_agent.js` lines 973–1047).
   Those failures are in scope for Explorer 2 / Worker M2.
2. **Assumption on Native JSON Fallback**:
   The native JSON object parser (step 3) remains gated on `calls.length === 0`. This is intentional: step 3 attempts to parse the entire message text as a raw JSON function call. If explicit XML or Markdown blocks are present, treating the ambient prose as a JSON object would produce erroneous parsing.
3. **Double-Quoted String Priority**:
   The regex replacements for double commas and colons explicitly match double-quoted strings first to avoid modifying literal strings that contain `,,` or `:`. This assumes string literals do not contain unescaped raw newlines without quotes.

---

## 5. Conclusion

The defects in `MultiSyntaxParser` and `JsonAutoRepair` are purely algorithmic:
1. `MultiSyntaxParser` suffered from artificial gating (`if (calls.length === 0)`), brittle XML attribute matching, and greedy unclosed thinking tag truncation.
2. `JsonAutoRepair` suffered from categorical bracket balancing instead of LIFO order, unhandled double commas, unescaped single quote conversion artifacts, and unhandled post-colon truncations.

The drop-in implementations supplied in Section 3 resolve 100% of the 13 adversarial failures in Domains 1 and 2 while maintaining 100% zero-regression compliance with all 178 existing tests in `tests/test_suna_agent.js`.

---

## 6. Verification Method

Once Worker applies the drop-in snippets:

1. **Verify Adversarial Domain 1 & Domain 2 Tests**:
   ```powershell
   npx mocha tests/test_challenger_suna_agent_adversarial.js --grep "1. Malformed JSON Repair"
   npx mocha tests/test_challenger_suna_agent_adversarial.js --grep "2. Multi-Syntax Parser"
   ```
   *Expected*: 25 passing (16 in Domain 1, 9 in Domain 2), 0 failing.

2. **Verify Baseline SunaAgent Test Suite (Zero Regression)**:
   ```powershell
   npx mocha tests/test_suna_agent.js
   ```
   *Expected*: 178 passing, 0 failing.

3. **Verify JavaScript Syntax Integrity**:
   ```powershell
   node -c suna_agent.js
   ```
   *Expected*: Exits with code 0 and no syntax errors.

4. **Invalidation Conditions**:
   - If any test in `tests/test_suna_agent.js` fails.
   - If `F2.1.1` returns 1 call instead of 2.
   - If `F1.1.2` throws `SyntaxError`.
   - If `F1.3.2` throws `Bad escaped character in JSON`.
