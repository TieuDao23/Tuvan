# SunaAgent Multi-Syntax Tool Call Parser & Resilient JSON Auto-Repair Engine
## Comprehensive Architectural Design & Implementation Specification

- **Document**: `parser_design.md`
- **Author**: M1 Explorer 2: Parser & Auto-Repair Architect (`explorer_m1_2_o6`)
- **Parent Orchestrator**: `42ac3744-8c8f-4be3-ae11-274cf3c1d73d`
- **Target Milestone**: Milestone 1 (M1: Multi-Syntax Tool Call Parser & Auto-Repair)
- **Target Implementation Files**: `suna_agent.js`, `app.js`
- **Date**: 2026-09-07T16:24:00Z
- **Integrity Mode**: Pure Vanilla JavaScript (ES6+), Dual Runtime (Node.js & Browser), Zero Dependencies

---

## 1. Executive Summary & Architectural Mission

In autonomous agent systems, the interface between the Language Model (LLM) and the execution environment is the **Tool Call Parser**. While human developers expect clean, valid JSON, modern state-of-the-art LLMs (Claude 3.5/3.7, DeepSeek V3/R1, Qwen 2.5, Llama 3.3, Mistral Large) emit tool invocations across diverse syntactic styles:
1. **XML Tags**: `<suna_tool_call>...`, `<suna_tool_call tool="...">...`, `<tool_call>...`, and Anthropic-style `<invoke>`.
2. **Markdown Codeblocks**: ````json\n{"tool": "..."}\n````, ````tool:name\n{...}\n````, and ````json:tool_call\n{...}\n````.
3. **Native JSON Function Calls**: Provider-level function call objects (`{ name, arguments }` or `{ tool, args }`).

Furthermore, streaming LLM outputs frequently suffer from syntax corruption:
- **Trailing commas** in objects (`{"a": 1,}`) and arrays (`[1, 2,]`).
- **Unquoted keys** (`{path: "index.html"}`).
- **Single quotes** (`{'tool': 'view_file'}`) and unescaped inner quotes.
- **Unescaped newlines and control characters** inside multiline string literals (frequent in code surgery tools like `replace_file_content`).
- **Stream cutoff truncation** when tokens hit max limits, leaving unclosed strings, dangling keys, and missing closing braces `}}}]`.

This specification provides the formal architectural blueprint and production-grade algorithms for:
1. **`MultiSyntaxParser`**: A universal demuxing parser capable of detecting and normalizing all three syntax families while cleanly extracting `<think>`, `<thought>`, and `<scratchpad>` reasoning blocks from user-visible conversation text.
2. **`JsonAutoRepair`**: A deterministic, non-destructive, multi-pass lexical auto-repair engine that heals malformed JSON payloads before schema validation.
3. **`StreamParser`**: An upgraded, zero-delay finite state machine (FSM) supporting 1-byte chunk fragmentation, partial tag buffering, real-time thought chunk emission (`thought_chunk`), and 100% backward compatibility with existing SunaChat Gate 3 tests (`ZR-03.1` to `ZR-03.3`, `RL-01` to `RL-04`).

---

## 2. Multi-Syntax Tool Call Parser Architecture (`MultiSyntaxParser`)

### 2.1 Supported Syntactic Formats

The parser recognizes three major syntax families and their variations:

| Family | Syntax Signature | Example | Extraction Target |
|---|---|---|---|
| **XML Standard** | `<suna_tool_call>JSON</suna_tool_call>` | `<suna_tool_call>{"tool":"view_file","args":{"path":"a.js"}}</suna_tool_call>` | JSON body parsed, `tool` and `args` extracted |
| **XML Attribute** | `<suna_tool_call tool="NAME">JSON</suna_tool_call>` | `<suna_tool_call tool="view_file">{"path":"a.js"}</suna_tool_call>` | `tool` taken from attribute, body parsed as `args` |
| **XML Generic** | `<tool_call>JSON</tool_call>` | `<tool_call>{"name":"view_file","arguments":{"path":"a.js"}}</tool_call>` | Generic tool call tag, normalized to canonical format |
| **XML Tagged** | `<tool_call><tool_name>N</tool_name><parameters>...</parameters></tool_call>` | Hermes/Anthropic structured XML tags | XML DOM/regex extracted into `{ tool: N, args: {...} }` |
| **Markdown Fenced** | ````json\n{"tool":"..."}\n```` | ````json\n{"tool":"replace_file_content","parameters":{...}}\n```` | Fenced block detected and JSON body extracted |
| **Markdown Tool** | ````tool:NAME\nJSON\n```` | ````tool:view_file\n{"path":"a.js"}\n```` | Tool name taken from fence header, body parsed as `args` |
| **Native JSON Object** | `{"tool":"...","args":{...}}` or `{"name":"...","arguments":{...}}` | Direct JSON payload without markdown wrappers | Direct object or repaired JSON string |
| **Native Function Call** | `{ "function": { "name": "...", "arguments": "..." } }` | Provider function call envelope | Arguments parsed (if string) and normalized |
| **Parallel Batch** | `[ {"tool": "a"}, {"tool": "b"} ]` | Array of tool call descriptors | Array mapped to multiple normalized tool calls |

### 2.2 Canonical Tool Call Representation

Regardless of the input syntax, `MultiSyntaxParser` always produces normalized tool call descriptors adhering to the following schema:

```typescript
interface NormalizedToolCall {
  id: string;             // Unique invocation ID, e.g. "call_1715000000000_abc12"
  tool: string;           // Canonical tool name, e.g. "replace_file_content"
  args: Record<string, any>; // Normalized parameters object
  raw: string;            // Original raw string snippet before repair
  syntax: 'xml' | 'markdown' | 'native_json' | 'native_object';
  repaired: boolean;      // True if JsonAutoRepair modified the payload
  repairNotes?: string[]; // Diagnostics of repairs performed (for trajectory logging)
}

interface MultiSyntaxParseResult {
  visibleText: string;    // Clean conversational text intended for the human user
  thoughts: string[];     // Internal scratchpad reasoning extracted from <think>/<thought>
  toolCalls: NormalizedToolCall[]; // List of executable tool calls
}
```

### 2.3 Parameter Normalization Logic (`normalizeCallPayload`)

LLMs employ diverse field names for the tool identifier and arguments:
- **Tool Name Aliases**: `parsed.tool`, `parsed.name`, `parsed.function`, `parsed.action`, `parsed.tool_name`, `parsed.toolName`.
- **Arguments Aliases**: `parsed.args`, `parsed.arguments`, `parsed.parameters`, `parsed.params`, `parsed.input`.
- **Inline / Flattened Arguments**: When the model omits an `args` wrapper and puts arguments at the root:
  ```json
  { "tool": "view_file", "path": "index.html", "startLine": 1 }
  ```
  The parser must extract `tool: "view_file"`, and collect all remaining keys (`path`, `startLine`) into `args`.
- **Stringified Arguments**: When `arguments` is a string (standard in OpenAI / DeepSeek function calling), it must be passed through `JsonAutoRepair.parse()`.

---

## 3. Resilient JSON Auto-Repair Engine (`JsonAutoRepair`)

### 3.1 Failure Modes & Real-World Edge Cases

| Defect Class | Malformed Input Pattern | Correct Repaired Output | Failure Mechanism if Not Repaired |
|---|---|---|---|
| **Trailing Comma in Object** | `{"a": 1, "b": 2,}` | `{"a": 1, "b": 2}` | `SyntaxError: Unexpected token } in JSON` |
| **Trailing Comma in Array** | `[10, 20, 30,]` | `[10, 20, 30]` | `SyntaxError: Unexpected token ] in JSON` |
| **Unquoted Object Keys** | `{path: "index.html", startLine: 1}` | `{"path": "index.html", "startLine": 1}` | `SyntaxError: Unexpected token p in JSON` |
| **Hyphenated Unquoted Keys** | `{target-file: "a.js"}` | `{"target-file": "a.js"}` | `SyntaxError: Unexpected token - in JSON` |
| **Single-Quoted Strings** | `{'tool': 'view_file'}` | `{"tool": "view_file"}` | `SyntaxError: Unexpected token ' in JSON` |
| **Nested Quotes in String** | `{'msg': 'He said "hi"'}` | `{"msg": "He said \"hi\""}` | Parsing crash or corrupted quotes |
| **Escaped Single Quotes** | `{'text': 'don\'t fail'}` | `{"text": "don't fail"}` | `SyntaxError: Unexpected token \ in JSON` |
| **Raw Unescaped Newlines** | `{"code": "line 1\nline 2"}` | `{"code": "line 1\\nline 2"}` | `SyntaxError: Bad control character in string literal` |
| **Truncated Mid-String** | `{"tool": "view_file", "args": {"path": "in` | `{"tool": "view_file", "args": {"path": "in"}}` | `SyntaxError: Unexpected end of JSON input` |
| **Truncated Dangling Key** | `{"tool": "view_file", "path` | `{"tool": "view_file"}` | Incomplete key stripped cleanly |
| **Truncated Dangling Colon** | `{"tool": "view_file", "args": ` | `{"tool": "view_file", "args": null}` | Value fallback supplied, braces closed |
| **Python / JS Literals** | `{"a": None, "b": True, "c": False}` | `{"a": null, "b": true, "c": false}` | `SyntaxError: Unexpected token N/T/F in JSON` |
| **Comments (Line / Block)** | `{"a": 1 /* note */, // comment\n"b": 2}` | `{"a": 1, "b": 2}` | `SyntaxError: Unexpected token / in JSON` |

### 3.2 Lexer & State Machine Architecture

A single regex cannot reliably fix JSON because regexes cannot distinguish between a comma inside a string literal (`{"msg": "Hello, world,"}`) and a structural trailing comma (`{"a": 1,}`).

`JsonAutoRepair` uses a **multi-stage scanner**:
1. **Pass 1: Comment Removal & Literal Normalization**
   - Strips `// ...` and `/* ... */` outside string literals.
   - Converts `None` -> `null`, `True` -> `true`, `False` -> `false`, `undefined` -> `null`.
2. **Pass 2: String Scanner & Quote Normalization**
   - Tracks whether the scanner is inside a single-quoted (`'`) or double-quoted (`"`) string.
   - Normalizes `'...'` into `"..."`. Escapes internal unescaped `"` as `\"`. Unescapes `\'` to `'`.
   - Converts raw unescaped ASCII control characters (`\n`, `\r`, `\t`) inside string literals into JSON escape sequences `\n`, `\r`, `\t`.
3. **Pass 3: Structural Tokenizer & Unquoted Key Quoting**
   - Scans tokens outside strings.
   - Detects unquoted identifiers immediately followed by `:` (e.g. `foo: 123` or `target-file: "a.js"`).
   - Wraps unquoted identifiers in double quotes: `"foo": 123`, `"target-file": "a.js"`.
4. **Pass 4: Trailing Comma Removal**
   - Detects `,` followed only by whitespace before `}` or `]`. Strips the comma.
5. **Pass 5: Truncation Completion & Delimiter Balancing**
   - Maintains a bracket stack: pushes `}` on `{`, pushes `]` on `[`.
   - If stream cuts off while `inString` is active: appends `"`.
   - Inspects the trailing token:
     - If trailing comma `,`: strips the comma.
     - If trailing colon `:`: appends `null`.
     - If incomplete key without colon: strips the incomplete key.
   - Pops the remaining bracket stack in reverse order and appends the closing delimiters.

---

## 4. Upgraded StreamParser Architecture

### 4.1 Chunk Buffering & Finite State Machine

The existing `StreamParser` in `app.js` handles only `<suna_tool_call>`. The upgraded `StreamParser` supports:
- `<suna_tool_call>` and `<suna_tool_call tool="...">`
- `<tool_call>` and `<tool_call name="...">`
- `<think>`, `<thought>`, `<scratchpad>`
- Arbitrary chunk fragmentation (e.g. 1 character per chunk: `<` -> `s` -> `u` -> `n` -> `a`...)
- False alarm detection and immediate emission to visible text (e.g. `5 < 10` or `<div>`)

### 4.2 State Transition Diagram

```
       [char]
         │
         ▼
     ┌────────┐   '<'    ┌───────────────┐
     │  TEXT  ├─────────►│ TAG_CANDIDATE │
     └────▲───┘          └───────┬───────┘
          │                      │
          │ Non-matching         │ Matches tag prefix
          │ prefix               ▼
          │ (flush buffer) ┌───────────────┐
          └────────────────┤ TAG_MATCHING  │
                           └───────┬───────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │ '>' (Tool Tag Opened)                   │ '>' (Thought Tag Opened)
              ▼                                         ▼
     ┌──────────────────┐                      ┌──────────────────┐
     │  IN_TOOL_CALL    │                      │   IN_THINKING    │
     └────────┬─────────┘                      └────────┬─────────┘
              │                                         │
              │ '<'                                     │ '<'
              ▼                                         ▼
     ┌──────────────────┐                      ┌──────────────────┐
     │ TOOL_END_TAG_CAN │                      │ THINK_END_TAG_CAN│
     └────────┬─────────┘                      └────────┬─────────┘
              │ '</..._call>'                           │ '</think>'
              ▼                                         ▼
       Push to toolCalls;                        Emit thought_chunk;
       Return to TEXT                            Return to TEXT
```

### 4.3 Real-Time Thought Chunk Streaming (`thought_chunk`)

To support Milestone 4 UI Thought Streaming and Live Accordion display:
- When characters arrive inside `IN_THINKING`, they are immediately passed to the `onThoughtChunk(chunk)` callback.
- `this.thinkingContent` accumulates the entire thought process.
- Thinking tags and thought characters are **completely excluded** from the visible return value of `parseChunk(chunk)`.

---

## 5. Concrete Algorithms & Reference Implementation

### 5.1 `JsonAutoRepair` Implementation

```javascript
class JsonAutoRepair {
  /**
   * Main entry point: attempts native parse, falls back to auto-repair.
   * @param {string} raw - Raw, potentially malformed JSON string.
   * @returns {any} Parsed JavaScript value.
   * @throws {SyntaxError} If repair is impossible.
   */
  static parse(raw) {
    if (typeof raw !== 'string') return raw;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Fast path: valid JSON passes immediately with 0ms overhead
    try {
      return JSON.parse(trimmed);
    } catch (initialErr) {
      // Proceed to multi-pass repair
    }

    const repaired = this.repair(trimmed);
    try {
      return JSON.parse(repaired);
    } catch (secondErr) {
      // Aggressive fallback: AST extraction for key-values
      const fallbackObj = this.aggressiveExtract(repaired);
      if (fallbackObj !== null) return fallbackObj;
      throw new SyntaxError(`JsonAutoRepair failed: ${secondErr.message}\nRepaired text:\n${repaired}`);
    }
  }

  /**
   * Multi-pass deterministic string repair.
   * @param {string} input 
   * @returns {string} Repaired JSON string
   */
  static repair(input) {
    if (!input || typeof input !== 'string') return '';
    let text = input.trim();

    // Pass 1: Strip comments & normalize language literals
    text = this.stripCommentsAndLiterals(text);

    // Pass 2: Normalize quotes & control characters in strings
    text = this.normalizeQuotesAndControlChars(text);

    // Pass 3: Quote unquoted object keys
    text = this.quoteUnquotedKeys(text);

    // Pass 4: Remove trailing commas
    text = this.removeTrailingCommas(text);

    // Pass 5: Complete truncated brackets & braces
    text = this.completeTruncatedJson(text);

    return text;
  }

  /**
   * Pass 1: Comments and language literals outside quotes
   */
  static stripCommentsAndLiterals(input) {
    let result = '';
    let inString = null;
    let escaped = false;
    let i = 0;

    while (i < input.length) {
      const ch = input[i];
      const next = input[i + 1];

      if (inString) {
        result += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === inString) {
          inString = null;
        }
        i++;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = ch;
        result += ch;
        i++;
        continue;
      }

      // Line comment // ...
      if (ch === '/' && next === '/') {
        i += 2;
        while (i < input.length && input[i] !== '\n' && input[i] !== '\r') i++;
        continue;
      }

      // Block comment /* ... */
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i++;
        i += 2;
        continue;
      }

      // Python / JS literals
      if (input.startsWith('None', i) && this.isWordBoundary(input, i - 1, i + 4)) {
        result += 'null';
        i += 4;
        continue;
      }
      if (input.startsWith('True', i) && this.isWordBoundary(input, i - 1, i + 4)) {
        result += 'true';
        i += 4;
        continue;
      }
      if (input.startsWith('False', i) && this.isWordBoundary(input, i - 1, i + 5)) {
        result += 'false';
        i += 5;
        continue;
      }
      if (input.startsWith('undefined', i) && this.isWordBoundary(input, i - 1, i + 9)) {
        result += 'null';
        i += 9;
        continue;
      }

      result += ch;
      i++;
    }

    return result;
  }

  /**
   * Pass 2: Normalize single quotes to double quotes and escape unescaped control chars
   */
  static normalizeQuotesAndControlChars(input) {
    let result = '';
    let inString = null; // null | '"' | "'"
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (!inString) {
        if (ch === '"') {
          inString = '"';
          result += '"';
        } else if (ch === "'") {
          inString = "'";
          result += '"'; // Start double-quoted string
        } else {
          result += ch;
        }
        continue;
      }

      if (escaped) {
        if (inString === "'" && ch === "'") {
          // Unescape escaped single quote in single-quoted string: \' -> '
          result += "'";
        } else {
          result += '\\' + ch;
        }
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (inString === "'") {
        if (ch === "'") {
          // Closing single-quote -> output closing double quote
          inString = null;
          result += '"';
        } else if (ch === '"') {
          // Escape nested double quote inside single-quoted string
          result += '\\"';
        } else if (ch === '\n') {
          result += '\\n';
        } else if (ch === '\r') {
          result += '\\r';
        } else if (ch === '\t') {
          result += '\\t';
        } else {
          result += ch;
        }
        continue;
      }

      if (inString === '"') {
        if (ch === '"') {
          inString = null;
          result += '"';
        } else if (ch === '\n') {
          result += '\\n';
        } else if (ch === '\r') {
          result += '\\r';
        } else if (ch === '\t') {
          result += '\\t';
        } else {
          result += ch;
        }
        continue;
      }
    }

    // If stream ended with unclosed string
    if (inString) {
      result += '"';
    }

    return result;
  }

  /**
   * Pass 3: Quote unquoted keys in objects: { foo: 1, bar-baz: 2 } -> { "foo": 1, "bar-baz": 2 }
   */
  static quoteUnquotedKeys(input) {
    let result = '';
    let inString = false;
    let escaped = false;
    let i = 0;

    while (i < input.length) {
      const ch = input[i];

      if (inString) {
        result += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        i++;
        continue;
      }

      if (ch === '"') {
        inString = true;
        result += ch;
        i++;
        continue;
      }

      // Check if this character could be the start of an unquoted key
      // Unquoted keys start after '{', ',', or whitespace, and end before ':'
      if (/[a-zA-Z_$]/.test(ch)) {
        // Look ahead for identifier ending with ':'
        let id = '';
        let j = i;
        while (j < input.length && /[a-zA-Z0-9_$-]/.test(input[j])) {
          id += input[j];
          j++;
        }

        // Check if next non-whitespace char is ':'
        let k = j;
        while (k < input.length && /\s/.test(input[k])) k++;

        if (k < input.length && input[k] === ':') {
          // This is an unquoted key!
          result += `"${id}"`;
          i = j;
          continue;
        }
      }

      result += ch;
      i++;
    }

    return result;
  }

  /**
   * Pass 4: Strip trailing commas in objects and arrays: {"a": 1,} -> {"a": 1}
   */
  static removeTrailingCommas(input) {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (inString) {
        result += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        result += ch;
        continue;
      }

      if (ch === ',') {
        // Check if next non-whitespace character is '}' or ']'
        let j = i + 1;
        while (j < input.length && /\s/.test(input[j])) j++;
        if (j < input.length && (input[j] === '}' || input[j] === ']')) {
          // Skip the trailing comma!
          continue;
        }
        if (j >= input.length) {
          // Trailing comma at EOF! Skip it.
          continue;
        }
      }

      result += ch;
    }

    return result;
  }

  /**
   * Pass 5: Complete truncated brackets and braces at end of stream
   */
  static completeTruncatedJson(input) {
    let text = input.trim();
    if (!text) return '{}';

    const stack = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') {
        stack.push('}');
      } else if (ch === '[') {
        stack.push(']');
      } else if (ch === '}' || ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }

    // If still in string at EOF, close string
    if (inString) {
      text += '"';
    }

    // Strip trailing commas or colons
    text = text.trim();
    if (text.endsWith(',')) {
      text = text.slice(0, -1).trim();
    }
    if (text.endsWith(':')) {
      text += ' null';
    }

    // Close remaining open brackets in reverse order
    while (stack.length > 0) {
      text += stack.pop();
    }

    return text;
  }

  /**
   * Helper: checks if index boundary is not part of a larger identifier
   */
  static isWordBoundary(str, beforeIdx, afterIdx) {
    const beforeOk = beforeIdx < 0 || !/[a-zA-Z0-9_$]/.test(str[beforeIdx]);
    const afterOk = afterIdx >= str.length || !/[a-zA-Z0-9_$]/.test(str[afterIdx]);
    return beforeOk && afterOk;
  }

  /**
   * Aggressive key-value AST extractor for severely corrupted payloads
   */
  static aggressiveExtract(text) {
    try {
      const obj = {};
      const pairRegex = /"([a-zA-Z0-9_$-]+)"\s*:\s*("([^"\\]*(\\.[^"\\]*)*)"|true|false|null|-?\d+(?:\.\d+)?)/g;
      let match;
      let matchedAny = false;

      while ((match = pairRegex.exec(text)) !== null) {
        matchedAny = true;
        const key = match[1];
        let valRaw = match[2];
        try {
          obj[key] = JSON.parse(valRaw);
        } catch (e) {
          obj[key] = valRaw;
        }
      }

      return matchedAny ? obj : null;
    } catch (e) {
      return null;
    }
  }
}
```

---

### 5.2 `MultiSyntaxParser` Implementation

```javascript
class MultiSyntaxParser {
  /**
   * Main demuxing method: extracts thoughts, tool calls, and clean user text.
   * @param {string} fullText - Full LLM completion text.
   * @returns {MultiSyntaxParseResult}
   */
  static parse(fullText) {
    if (!fullText || typeof fullText !== 'string') {
      return { visibleText: '', thoughts: [], toolCalls: [] };
    }

    const thoughts = [];
    const toolCalls = [];

    // Step 1: Extract and strip thinking tags (<think>, <thought>, <scratchpad>)
    let cleaned = fullText.replace(/<(think|thought|scratchpad)>([\s\S]*?)<\/\1>/gi, (_, tag, content) => {
      thoughts.push(content.trim());
      return '';
    });

    // Also strip dangling unclosed <think> at end of text
    cleaned = cleaned.replace(/<(think|thought|scratchpad)>([\s\S]*)$/gi, (_, tag, content) => {
      thoughts.push(content.trim());
      return '';
    });

    // Step 2: Extract XML tool calls: <suna_tool_call ...> and <tool_call ...>
    const xmlTagRegex = /<(suna_tool_call|tool_call)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    cleaned = cleaned.replace(xmlTagRegex, (_, tagName, attrsStr, body) => {
      const parsedCall = this.parseXmlToolCall(tagName, attrsStr, body);
      if (parsedCall) {
        toolCalls.push(parsedCall);
      }
      return '';
    });

    // Step 3: Extract Markdown code block tool calls: ```json { "tool": ... } ``` or ```tool:name
    const codeBlockRegex = /```(?:json:(?:tool_call|suna_tool_call)|tool:([a-zA-Z0-9_-]+)|json)\s*\n([\s\S]*?)\n```/gi;
    cleaned = cleaned.replace(codeBlockRegex, (match, toolFromLang, body) => {
      // Check if body looks like a tool call
      const parsedCall = this.parseMarkdownToolCall(toolFromLang, body, match);
      if (parsedCall) {
        toolCalls.push(parsedCall);
        return ''; // Strip from visible text
      }
      return match; // Keep standard code blocks (like HTML/CSS) in visible text!
    });

    // Step 4: Standalone JSON Function Call Objects (if entire response is JSON)
    const trimmedCleaned = cleaned.trim();
    if (toolCalls.length === 0 && (trimmedCleaned.startsWith('{') || trimmedCleaned.startsWith('['))) {
      const nativeCall = this.parseNativeJsonToolCall(trimmedCleaned);
      if (nativeCall) {
        if (Array.isArray(nativeCall)) {
          toolCalls.push(...nativeCall);
        } else {
          toolCalls.push(nativeCall);
        }
        cleaned = ''; // Entire response was tool call
      }
    }

    return {
      visibleText: cleaned.trim(),
      thoughts,
      toolCalls
    };
  }

  /**
   * Parses XML tool call tag with attributes and body.
   */
  static parseXmlToolCall(tagName, attrsStr, body) {
    let toolName = null;
    let callId = null;

    if (attrsStr) {
      const toolMatch = attrsStr.match(/\b(?:tool|name)="([^"]+)"/i);
      if (toolMatch) toolName = toolMatch[1];
      const idMatch = attrsStr.match(/\bid="([^"]+)"/i);
      if (idMatch) callId = idMatch[1];
    }

    let parsedBody = null;
    let repaired = false;

    try {
      parsedBody = JsonAutoRepair.parse(body);
      repaired = (typeof body === 'string' && JSON.stringify(parsedBody) !== body.trim());
    } catch (e) {
      console.warn('Failed to parse XML tool call body:', e.message);
      return null;
    }

    return this.normalizeToolCallDescriptor(toolName, parsedBody, body, 'xml', callId, repaired);
  }

  /**
   * Parses Markdown fenced code block tool call.
   */
  static parseMarkdownToolCall(toolFromLang, body, rawMatch) {
    let parsedBody = null;
    try {
      parsedBody = JsonAutoRepair.parse(body);
    } catch (e) {
      return null;
    }

    if (!parsedBody || typeof parsedBody !== 'object') return null;

    // Check if it qualifies as a tool call
    const hasToolKey = parsedBody.tool || parsedBody.name || parsedBody.function || toolFromLang;
    if (!hasToolKey) return null;

    const toolName = toolFromLang || parsedBody.tool || parsedBody.name || parsedBody.function;
    return this.normalizeToolCallDescriptor(toolName, parsedBody, rawMatch, 'markdown');
  }

  /**
   * Parses native JSON object or array.
   */
  static parseNativeJsonToolCall(rawJson) {
    let parsed = null;
    try {
      parsed = JsonAutoRepair.parse(rawJson);
    } catch (e) {
      return null;
    }

    if (!parsed) return null;

    if (Array.isArray(parsed)) {
      const calls = parsed.map(item => this.normalizeToolCallDescriptor(null, item, JSON.stringify(item), 'native_json')).filter(Boolean);
      return calls.length > 0 ? calls : null;
    }

    if (typeof parsed === 'object') {
      const isToolCall = parsed.tool || parsed.name || parsed.function || (parsed.type === 'function' && parsed.function);
      if (isToolCall) {
        return this.normalizeToolCallDescriptor(null, parsed, rawJson, 'native_json');
      }
    }

    return null;
  }

  /**
   * Unifies diverse payload structures into canonical NormalizedToolCall.
   */
  static normalizeToolCallDescriptor(explicitTool, payload, rawString, syntax, callId = null, repaired = false) {
    if (!payload || typeof payload !== 'object') return null;

    let toolName = explicitTool;
    let toolArgs = {};
    let id = callId || payload.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Provider function calling: { function: { name, arguments } }
    if (payload.function && typeof payload.function === 'object') {
      toolName = toolName || payload.function.name;
      let fnArgs = payload.function.arguments;
      if (typeof fnArgs === 'string') {
        try { fnArgs = JsonAutoRepair.parse(fnArgs); } catch (e) { fnArgs = {}; }
      }
      toolArgs = fnArgs || {};
    } else {
      toolName = toolName || payload.tool || payload.name || payload.tool_name;

      if (payload.args && typeof payload.args === 'object') {
        toolArgs = payload.args;
      } else if (payload.arguments && typeof payload.arguments === 'object') {
        toolArgs = payload.arguments;
      } else if (payload.parameters && typeof payload.parameters === 'object') {
        toolArgs = payload.parameters;
      } else {
        // Flattened arguments
        toolArgs = { ...payload };
        delete toolArgs.tool;
        delete toolArgs.name;
        delete toolArgs.tool_name;
        delete toolArgs.id;
        delete toolArgs.type;
      }
    }

    if (!toolName) return null;

    return {
      id,
      tool: String(toolName).trim(),
      args: toolArgs,
      raw: rawString,
      syntax,
      repaired
    };
  }
}
```

---

### 5.3 Upgraded `StreamParser` Implementation

```javascript
class StreamParser {
  constructor(options = {}) {
    this.buffer = '';            // Buffer for partial tag matching
    this.state = 'TEXT';         // 'TEXT', 'IN_TAG', 'IN_TOOL_CONTENT', 'IN_TOOL_END_TAG', 'IN_THINK_CONTENT', 'IN_THINK_END_TAG'
    this.currentToolContent = '';
    this.currentToolTag = '';    // 'suna_tool_call' or 'tool_call'
    this.currentToolAttrs = '';
    this.currentThinkTag = '';   // 'think', 'thought', or 'scratchpad'
    this.toolCalls = [];         // Legacy compatibility: array of strings!
    this.parsedToolCalls = [];   // Modern rich descriptors: NormalizedToolCall[]
    this.thinkingContent = '';   // Accumulated thoughts
    this.filteredText = '';      // Visible conversational text
    this.onThoughtChunk = options.onThoughtChunk || null; // Streaming thought hook
  }

  /**
   * Processes a chunk of incoming text and returns the visible text to display.
   * Preserves 100% contract with Gate 3 tests (ZR-03.1 to ZR-03.3, RL-01 to RL-04).
   * @param {string} chunk 
   * @returns {string} Visible filtered text
   */
  parseChunk(chunk) {
    if (!chunk || typeof chunk !== 'string') return '';
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

        // Check for opening tool call tags: <suna_tool_call> or <tool_call>
        if (this.buffer === '<suna_tool_call>' || this.buffer === '<tool_call>') {
          this.currentToolTag = this.buffer.slice(1, -1);
          this.currentToolAttrs = '';
          this.currentToolContent = '';
          this.buffer = '';
          this.state = 'IN_TOOL_CONTENT';
        } else if ((this.buffer.startsWith('<suna_tool_call ') || this.buffer.startsWith('<tool_call ')) && char === '>') {
          const spaceIdx = this.buffer.indexOf(' ');
          this.currentToolTag = this.buffer.slice(1, spaceIdx);
          this.currentToolAttrs = this.buffer.slice(spaceIdx + 1, -1);
          this.currentToolContent = '';
          this.buffer = '';
          this.state = 'IN_TOOL_CONTENT';
        } else if (this.buffer === '<think>' || this.buffer === '<thought>' || this.buffer === '<scratchpad>') {
          this.currentThinkTag = this.buffer.slice(1, -1);
          this.buffer = '';
          this.state = 'IN_THINK_CONTENT';
        } else {
          // Check if buffer is still a valid prefix of any supported tag
          const isPrefixOfAny = 
            '<suna_tool_call>'.startsWith(this.buffer) ||
            '<suna_tool_call '.startsWith(this.buffer) ||
            '<tool_call>'.startsWith(this.buffer) ||
            '<tool_call '.startsWith(this.buffer) ||
            '<think>'.startsWith(this.buffer) ||
            '<thought>'.startsWith(this.buffer) ||
            '<scratchpad>'.startsWith(this.buffer);

          if (!isPrefixOfAny) {
            // False alarm tag: flush buffer to visible text immediately!
            result += this.buffer;
            this.buffer = '';
            this.state = 'TEXT';
          }
        }
      } else if (this.state === 'IN_TOOL_CONTENT') {
        if (char === '<') {
          this.state = 'IN_TOOL_END_TAG';
          this.buffer = '<';
        } else {
          this.currentToolContent += char;
        }
      } else if (this.state === 'IN_TOOL_END_TAG') {
        this.buffer += char;
        const expectedEndTag = `</${this.currentToolTag}>`;

        if (this.buffer === expectedEndTag || (this.currentToolTag === 'tool_call' && this.buffer === '</suna_tool_call>')) {
          // Tool call successfully closed!
          this.finalizeToolCall();
          this.buffer = '';
          this.state = 'TEXT';
        } else if (!expectedEndTag.startsWith(this.buffer) && !'</suna_tool_call>'.startsWith(this.buffer)) {
          // False alarm: character sequence after '<' was not the closing tag
          this.currentToolContent += this.buffer;
          this.buffer = '';
          this.state = 'IN_TOOL_CONTENT';
        }
      } else if (this.state === 'IN_THINK_CONTENT') {
        if (char === '<') {
          this.state = 'IN_THINK_END_TAG';
          this.buffer = '<';
        } else {
          this.thinkingContent += char;
          if (typeof this.onThoughtChunk === 'function') {
            this.onThoughtChunk(char);
          }
        }
      } else if (this.state === 'IN_THINK_END_TAG') {
        this.buffer += char;
        const expectedThinkEndTag = `</${this.currentThinkTag}>`;

        if (this.buffer === expectedThinkEndTag) {
          // Thinking block closed!
          this.buffer = '';
          this.state = 'TEXT';
        } else if (!expectedThinkEndTag.startsWith(this.buffer)) {
          // False alarm: not end of thinking tag
          this.thinkingContent += this.buffer;
          if (typeof this.onThoughtChunk === 'function') {
            this.onThoughtChunk(this.buffer);
          }
          this.buffer = '';
          this.state = 'IN_THINK_CONTENT';
        }
      }
    }

    this.filteredText += result;
    return result;
  }

  /**
   * Finalizes an extracted tool call tag.
   * Populates both legacy string toolCalls and normalized parsedToolCalls.
   */
  finalizeToolCall() {
    const rawContent = this.currentToolContent.trim();
    let effectiveContent = rawContent;

    // If tag had attributes like tool="foo", synthesize into content string for legacy compatibility
    if (this.currentToolAttrs && this.currentToolAttrs.includes('tool=')) {
      const match = this.currentToolAttrs.match(/tool="([^"]+)"/);
      if (match && !rawContent.includes('"tool"')) {
        try {
          const repairedObj = JsonAutoRepair.parse(rawContent) || {};
          repairedObj.tool = match[1];
          effectiveContent = JSON.stringify(repairedObj);
        } catch (e) {
          // keep raw
        }
      }
    }

    // Legacy invariant: array of strings!
    this.toolCalls.push(effectiveContent);

    // Modern rich descriptor
    const parsedDesc = MultiSyntaxParser.parseXmlToolCall(this.currentToolTag, this.currentToolAttrs, rawContent);
    if (parsedDesc) {
      this.parsedToolCalls.push(parsedDesc);
    }

    this.currentToolContent = '';
    this.currentToolAttrs = '';
  }

  /**
   * Flushes any remaining buffered text when stream ends.
   * Repairs truncated unclosed tool calls if stream cut off.
   * @returns {string} Remaining visible text
   */
  flush() {
    let extra = '';

    if (this.state === 'IN_TAG') {
      extra += this.buffer;
    } else if (this.state === 'IN_TOOL_END_TAG') {
      this.currentToolContent += this.buffer;
      this.finalizeToolCall();
    } else if (this.state === 'IN_TOOL_CONTENT') {
      // Stream cutoff mid-tool-call! Attempt auto-repair and finalize
      this.finalizeToolCall();
    } else if (this.state === 'IN_THINK_END_TAG') {
      this.thinkingContent += this.buffer;
    }

    this.buffer = '';
    this.state = 'TEXT';
    this.filteredText += extra;
    return extra;
  }
}
```

---

## 6. Integration with SunaAgent & SunaHarness

### 6.1 Call Chain & Error Boundaries

```
[LLM Response / Stream]
         │
         ▼
[StreamParser.parseChunk() / flush()]
         │
         ├──> UI Display: Visible conversational text (zero XML leaks)
         ├──> UI Thought Accordion: onThoughtChunk() stream
         └──> toolCalls (Raw strings / descriptors)
                   │
                   ▼
         [MultiSyntaxParser.parse()]
                   │
                   ▼
         [JsonAutoRepair.parse()]
         - Heals trailing commas, unquoted keys, single quotes,
           unescaped newlines, and truncated brackets.
                   │
                   ▼
         [AciSchemaValidator.normalizeArgs(tool, args)]
         - Bidirectional alias mapping (camelCase <-> PascalCase)
         - Type coercion ("10" -> 10)
         - ReDoS prevention & prototype pollution defense
                   │
                   ├── If Invalid: Schema error envelope + SelfCorrectionLoop ^ pointer
                   │
                   └── If Valid:
                            │
                            ▼
                   [VfsDiffEngine.previewReplaceDiff()] (if code surgery)
                            │
                            ▼
                   [HarnessController.executeAction()]
```

### 6.2 Schema Validation Hand-off Example

When `MultiSyntaxParser` extracts a call to `replace_file_content`:
```json
{
  "tool": "replace_file_content",
  "args": {
    "TargetFile": "app.js",
    "TargetContent": "const a = 1;",
    "ReplacementContent": "const a = 2;",
    "StartLine": "10",
    "EndLine": "15"
  }
}
```
1. `JsonAutoRepair` resolves any control characters or quote defects.
2. `AciSchemaValidator.normalizeArgs('replace_file_content', args)`:
   - Coerces `StartLine: "10"` -> `10`.
   - Coerces `EndLine: "15"` -> `15`.
   - Populates both `path` and `TargetFile`.
3. Validation succeeds without friction, preventing rejection before tool execution.

---

## 7. Adversarial Test Matrix & Verification Cases

The following test matrix must be implemented in `tests/test_suna_agent.js` and `tests/test_challenger_suna_agent_adversarial.js`:

| Test ID | Test Name | Input Fixture | Expected Outcome |
|---|---|---|---|
| **P-01** | Standard XML Tool Call | `<suna_tool_call>{"tool": "view_file", "args": {"path": "a.js"}}</suna_tool_call>` | Extracted 1 tool call: `tool="view_file"`, `args.path="a.js"`, cleanText empty |
| **P-02** | XML Attribute Tool Call | `<suna_tool_call tool="grep_search">{"query": "foo"}</suna_tool_call>` | Extracted 1 tool call: `tool="grep_search"`, `args.query="foo"` |
| **P-03** | Generic Tool Call Tag | `<tool_call>{"name": "list_dir", "arguments": {"dirPath": "src"}}</tool_call>` | Extracted 1 tool call: `tool="list_dir"`, `args.dirPath="src"` |
| **P-04** | Markdown Codeblock Syntax | ````json\n{"tool": "view_file", "args": {"path": "main.js"}}\n```` | Extracted 1 tool call: `tool="view_file"`, cleanText empty |
| **P-05** | Markdown Tool Header | ````tool:run_sandboxed_command\n{"commandLine": "ls -l"}\n```` | Extracted 1 tool call: `tool="run_sandboxed_command"`, `args.commandLine="ls -l"` |
| **P-06** | Native JSON Parallel Calls | `[{"tool": "view_file", "args": {"path": "a"}}, {"tool": "view_file", "args": {"path": "b"}}]` | Extracted 2 tool calls in parallel sequence |
| **P-07** | Trailing Commas Object | `{"tool": "view_file", "args": {"path": "a.js",},}` | Auto-repaired; parsed without throwing SyntaxError |
| **P-08** | Trailing Commas Array | `{"tool": "grep", "args": {"includes": ["*.js", "*.ts",],}}` | Auto-repaired; array contains 2 elements |
| **P-09** | Unquoted Keys | `{tool: "view_file", args: {path: "index.html", startLine: 1}}` | Auto-repaired; keys quoted and parsed successfully |
| **P-10** | Hyphenated Unquoted Keys | `{target-file: "app.js", start-line: 5}` | Auto-repaired; keys `"target-file"` and `"start-line"` quoted |
| **P-11** | Single-Quoted Strings | `{'tool': 'view_file', 'args': {'path': 'styles.css'}}` | Auto-repaired; normalized to double quotes |
| **P-12** | Nested Quotes | `{'tool': 'speak_message', 'args': {'message': 'He said "hello"'}}` | Auto-repaired; inner quotes escaped as `\"` |
| **P-13** | Escaped Single Quotes | `{'args': {'text': 'It\'s working fine'}}` | Auto-repaired; apostrophe preserved cleanly |
| **P-14** | Raw Unescaped Newlines | `{"tool": "replace", "args": {"code": "line 1\nline 2"}}` | Raw newlines in string converted to `\\n` |
| **P-15** | Stream Cutoff Mid-String | `{"tool": "view_file", "args": {"path": "src/co` | Completed to `{"tool": "view_file", "args": {"path": "src/co"}}` |
| **P-16** | Stream Cutoff Dangling Comma | `{"tool": "view_file", "args": {"path": "a.js", ` | Comma stripped, brackets closed: `{"tool": "view_file", "args": {"path": "a.js"}}` |
| **P-17** | Stream Cutoff Dangling Colon | `{"tool": "view_file", "args": ` | Value completed to `null`, braces closed |
| **P-18** | Python Literals | `{"tool": "a", "args": {"flag": True, "opt": False, "noneVal": None}}` | Converted to `true`, `false`, `null` |
| **P-19** | JS/C++ Comments | `{"tool": "view_file" /* note */, // line comment\n"args": {"path": "a"}}` | Comments stripped without corrupting structure |
| **P-20** | Thinking Block Extraction | `Chào bạn! <think>Phân tích logic</think> Đây là kết quả: <suna_tool_call>...</suna_tool_call>` | Visible text has only `"Chào bạn!  Đây là kết quả:"`, thought has `"Phân tích logic"` |
| **P-21** | Stream 1-Byte Slicing | Stream chunks of 1 character: `<` `s` `u` `n` `a` `_` `t` `o` `o` `l` `_` `c` `a` `l` `l` `>` | Buffers without leaking any characters to visible text |
| **P-22** | False Alarm Tag Flushing | `"Kiểm tra toán tử nhỏ hơn: 5 < 10 và 3 < 7"` | All text and `<` preserved in visible text, zero tool calls |
| **P-23** | Inline HTML Tag Preservation | `"Sử dụng thẻ <code>&lt;div class='box'&gt;</code>"` | `<code>` tag preserved in visible text without false triggering |
| **P-24** | Trailing False Alarm Flush | `"Kết thúc dòng với dấu <"` + `parser.flush()` | `flush()` returns `'<'` |
| **P-25** | High-Volume Fuzzing Stress | 1,000 randomized corruptions of JSON payloads | Engine never throws uncaught exceptions; either heals or returns clean diagnostic |

---

## 8. Concrete Implementation Plan & Migration Guide for M1 Worker

When the M1 Worker starts implementation:

1. **Scaffolding `suna_agent.js`**:
   - Place `JsonAutoRepair`, `MultiSyntaxParser`, and `StreamParser` in `suna_agent.js`.
   - Export them via UMD wrapper:
     ```javascript
     if (typeof module !== 'undefined' && module.exports) {
       module.exports = { SunaAgent, StreamParser, MultiSyntaxParser, JsonAutoRepair };
     }
     if (typeof window !== 'undefined') {
       window.SunaAgent = window.SunaAgent || {};
       window.SunaAgent.StreamParser = StreamParser;
       window.SunaAgent.MultiSyntaxParser = MultiSyntaxParser;
       window.SunaAgent.JsonAutoRepair = JsonAutoRepair;
       window.StreamParser = StreamParser;
     }
     ```
2. **Upgrading `app.js`**:
   - In `app.js:3020`, replace the legacy `StreamParser` with the upgraded `StreamParser`.
   - In `app.js:3970-3990` (`handleToolCalls`), update the JSON parsing logic to call `JsonAutoRepair.parse(callText)` and `MultiSyntaxParser.normalizeToolCallDescriptor()`.
3. **Verification Gate**:
   - Run `npm test` -> must achieve 1,226 passing tests with zero regressions.
   - Run `npm run check` -> must show 0 syntax errors across `app.js`, `redesign.js`, `suna_harness.js`, and `suna_agent.js`.
