# Comprehensive Technical Investigation Report: Milestone R2 (22 Tools Functional Issues)

**Author**: Explorer Subagent (`explorer_o10_survey_2`)  
**Target Milestone**: R2 — Khắc phục các lỗi chức năng trong 22 Công cụ (Tools)  
**Parent Orchestrator**: `orchestrator_10` (Conversation ID: `5c061cb9-df2e-4230-be85-8d036737099c`)  
**Workspace**: `d:\Suna Chat`  
**Date**: 2026-09-20  

---

## Executive Summary

This report delivers a deep technical survey and line-by-line root-cause analysis of the 7 core functional issues identified in the 22-tool execution ecosystem across `app.js`, `suna_harness.js`, and `suna_agent.js`.

| # | Tool / Feature | File & Lines | Core Root Cause | Failure Mode | Recommended Fix |
|---|---|---|---|---|---|
| **1** | `memory_store` deduplication & persistence | `app.js:4642-4655`<br>`app.js:5473-5491` | `state.memory.facts.push(memoryEntry)` is executed **before** calling `addMemoryFact`, causing `addMemoryFact` to self-flag as duplicate and return early without invoking `saveMemory(true)`. | Facts reside only in volatile RAM; page reload completely wipes stored facts. | Perform robust deduplication once, push entry, and directly trigger `saveMemory(true)`. Also sanitize `addMemoryFact` against string/object fact variations. |
| **2** | `fs_patch` byte length calculation | `app.js:4592-4595` | Fallback references undefined identifier `content.length` instead of `patched.length`. | In browser/worker environments without `Buffer` or `TextEncoder`, throws unhandled `ReferenceError: content is not defined`. | Introduce a universal `getByteLength` utility with fallback to `encodeURIComponent(str).replace(...)` or `Blob.size`. |
| **3** | `replace_file_content` deletion newline hygiene | `suna_harness.js:828-834`<br>`suna_harness.js:1816` | Bounded slice replacement pushes empty string `""` into `combined = [before, "", after]`, and `"".split('\n')` creates `[""]`. | Line deletion operations leave an extraneous blank line (`\n\n`), corrupting file line structure. | Flatten lines conditionally: when `replacedSlice` is empty, insert empty array `[]` instead of `[""]` before `.join('\n')`. |
| **4** | `fetch_page_summary` network mock removal | `app.js:4447-4449` | Fallback automatically synthesizes a Vietnamese mock HTML document when network/proxy fetch returns null or errors. | When network is unreachable or proxy fails, AI receives synthetic text ("Tiêu đề trang...") and hallucinates false website contents. | Remove the default synthetic mock HTML block; retain `args.mockHtml` strictly for automated test suites, and return explicit failure `{ success: false, error: ... }`. |
| **5** | `run_sandboxed_command` & `sandbox_exec` | `app.js:4357`<br>`suna_harness.js:3250`<br>`suna_harness.js:3701, 3742` | (a) Statement parenthesization `return (${code})` causes `SyntaxError` on `const`/`let`; (b) `Object.constructor` escapes to host `Function`; (c) `run_sandboxed_command` missing from `mutatingTools` during `readOnly`. | (a) Syntax error executing declarations; (b) sandbox escape via `Function('return window')()`; (c) `echo ... > file` writes in read-only mode. | (a) Execute via IIFE/statement evaluator; (b) sanitize prototype constructors / isolate context; (c) enforce `readOnly` checks on shell write commands (`>`, `>>`, `touch`, `rm`, `mkdir`). |
| **6** | Parameter Aliases normalization | `app.js:4824-4828`<br>`suna_agent.js:1938-1939`<br>`suna_harness.js:2267-2357` | `executeTool` executes `validateParameters` on raw input arguments before invoking `AciSchemaValidator.normalizeArgs`. | `validateParameters` rejects valid alternative names like `path` vs `TargetFile`, `command` vs `CommandLine`, `query` vs `Query` with `Missing required parameter`. | Integrate `AciSchemaValidator.normalizeArgs` prior to parameter validation in `executeTool`. |
| **7** | `vfs_change` Event redirection parsing | `suna_agent.js:1636-1642`<br>`suna_harness.js:2938-2948` | `suna_agent.js` checks `rawArgs.CommandLine.includes('>')`, but attempts to read `normalized.TargetFile || normalized.path` which is `undefined` for shell commands. | `vfs_change` is never emitted when files are created/modified via shell redirection (`>`), breaking Live Workspace sync. | Parse redirection operator (`>`, `>>`) to extract target filename and combine with `cwd`, or attach agent directly to VFS `'change'` event emitter. |

---

## Detailed Investigation & Root Cause Analysis

### 1. `memory_store` Deduplication & `saveMemory` Persistence

#### Observed Code:
In `app.js` lines 4621–4656:
```javascript
// 13. memory_store (Core Tool 8: Semantic Memory Store)
async memory_store(args, context = {}) {
  const fact = args && typeof args.fact === 'string' ? args.fact.trim() : '';
  if (!fact) return { success: false, error: 'Error: Parameter "fact" is required.' };

  const category = args && typeof args.category === 'string' ? args.category.trim() : 'general';
  const state = context.State || (typeof State !== 'undefined' ? State : (typeof window !== 'undefined' ? window.State : null));
  if (!state || !state.memory) return { success: false, error: 'Error: State memory not initialized.' };

  if (!Array.isArray(state.memory.facts)) state.memory.facts = [];

  const normalizedFact = fact.toLowerCase();
  const exists = state.memory.facts.some(f => {
    const existingText = typeof f === 'string' ? f : (f.fact || '');
    return existingText.toLowerCase() === normalizedFact;
  });

  if (exists) {
    return { success: true, message: 'Fact already exists in memory (deduplicated).', fact, category };
  }

  const memoryEntry = {
    id: 'fact_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    fact,
    category,
    timestamp: Date.now()
  };

  state.memory.facts.push(memoryEntry); // <--- [POINT A: Fact pushed here]

  if (typeof addMemoryFact === 'function') {
    try { addMemoryFact(fact, category); } catch (e) {} // <--- [POINT B: Calls addMemoryFact]
  }

  return { success: true, message: 'Fact stored successfully.', entry: memoryEntry };
}
```

In `app.js` lines 5473–5491:
```javascript
function addMemoryFact(fact, category = 'context') {
  // Tránh trùng lặp (so sánh nội dung tương tự)
  const isDuplicate = State.memory.facts.some(f => 
    f.fact.toLowerCase().trim() === fact.toLowerCase().trim()
  );
  if (isDuplicate) return false; // <--- [POINT C: Triggers duplicate and returns false!]
  
  // Giới hạn tối đa 50 fact để không phình prompt
  if (State.memory.facts.length >= 50) {
    State.memory.facts.shift();
  }
  State.memory.facts.push({
    fact: fact.trim(),
    category,
    timestamp: Date.now()
  });
  saveMemory(true); // <--- [POINT D: Never reached!]
  return true;
}
```

#### Failure Mechanism:
1. When `memory_store` runs, it checks whether `fact` exists in `state.memory.facts`. If not, it executes `state.memory.facts.push(memoryEntry)` at line 4649.
2. Immediately afterwards, at line 4652, it invokes `addMemoryFact(fact, category)`.
3. In `addMemoryFact`, line 5475 tests `State.memory.facts.some(...)`. Because `memoryEntry` was already pushed to `State.memory.facts` in step 1, `isDuplicate` evaluates to `true`!
4. `addMemoryFact` executes `return false` at line 5478 and exits **before** calling `saveMemory(true)` at line 5489.
5. Furthermore, `memory_store` never invokes `saveMemory(true)` itself.
6. As a result, the fact exists only in ephemeral JavaScript heap memory. On browser reload, `loadMemory()` reads from IndexedDB (`suna_memory`), which was never updated. All stored facts are silently lost.
7. Secondary defect: `f.fact.toLowerCase()` in line 5476 will crash with `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` if any legacy fact element `f` is a raw string.

#### Recommended Remediation:
In `memory_store` (`app.js`):
1. Safely deduplicate:
   ```javascript
   const normalizedFact = fact.toLowerCase().trim();
   const exists = state.memory.facts.some(f => {
     const existingText = typeof f === 'string' ? f : (f && f.fact ? f.fact : '');
     return existingText.toLowerCase().trim() === normalizedFact;
   });
   if (exists) {
     return { success: true, message: 'Fact already exists in memory (deduplicated).', fact, category };
   }
   ```
2. Push the memory entry and directly trigger persistence:
   ```javascript
   state.memory.facts.push(memoryEntry);
   if (typeof saveMemory === 'function') {
     try { await saveMemory(true); } catch (e) {}
   } else if (context.saveMemory && typeof context.saveMemory === 'function') {
     try { await context.saveMemory(true); } catch (e) {}
   }
   ```
3. In `addMemoryFact` (`app.js:5475`):
   ```javascript
   const isDuplicate = State.memory.facts.some(f => {
     const existing = typeof f === 'string' ? f : (f && f.fact ? f.fact : '');
     return existing.toLowerCase().trim() === fact.toLowerCase().trim();
   });
   ```

---

### 2. `fs_patch` Byte Length Calculation Without Buffer/TextEncoder

#### Observed Code:
In `app.js` lines 4591–4601:
```javascript
const patched = original.replace(search, replace);
const byteLength = typeof Buffer !== 'undefined'
  ? Buffer.byteLength(patched, 'utf8')
  : (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(patched).length : content.length);

targetVfs[path] = {
  content: patched,
  size: byteLength,
  lines: patched.split('\n').length,
  updatedAt: Date.now()
};
```

#### Failure Mechanism:
1. Notice line 4594: `: (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(patched).length : content.length);`
2. `content` was copied from `fs_read` (line 4532) and `fs_list` (line 4553). In `fs_patch`, the string variable is named `patched`. The variable `content` does **not** exist in `fs_patch`.
3. In browser environments where `Buffer` is undefined and `TextEncoder` is not available or polyfilled, accessing `content.length` immediately throws `ReferenceError: content is not defined`.
4. Furthermore, standard `.length` only counts UTF-16 code units, not UTF-8 bytes.

#### Recommended Remediation:
Implement a universal, safe byte-length calculator accessible globally or within VFS/tool helpers:
```javascript
function getUtf8ByteLength(str) {
  if (typeof str !== 'string') str = String(str || '');
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(str, 'utf8');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
  if (typeof Blob !== 'undefined') {
    try { return new Blob([str]).size; } catch (_) {}
  }
  try {
    return encodeURIComponent(str).replace(/%[A-F0-9]{2}/gi, 'x').length;
  } catch (_) {
    return str.length;
  }
}
```
In `fs_patch` (`app.js:4592`):
```javascript
const byteLength = getUtf8ByteLength(patched);
```

---

### 3. `replace_file_content` Deletion Newline Hygiene

#### Observed Code:
In `suna_harness.js` lines 828–834 (`replaceContent`):
```javascript
const before = allLines.slice(0, startLine - 1);
const after = allLines.slice(endLine);
const combined = [];
if (before.length > 0) combined.push(before.join('\n'));
combined.push(replacedSlice); // <--- [Pushes empty string when deleting]
if (after.length > 0) combined.push(after.join('\n'));
newContent = combined.join('\n'); // <--- [Produces \n\n !]
```

In `suna_harness.js` line 1816 (`previewReplaceDiff`):
```javascript
const replacedChunk = options.allowMultiple
  ? targetChunk.split(targetStr).join(rep)
  : targetChunk.replace(targetStr, rep);
newContent = lines.slice(0, start - 1).concat(replacedChunk.split('\n')).concat(lines.slice(end)).join('\n');
```

#### Failure Mechanism:
1. In `replaceContent`:
   - When deleting line 2 of a 3-line file (`startLine: 2, endLine: 2, replacementContent: ""`), `replacedSlice` is `""`.
   - `combined` is populated with: `['line 1', '', 'line 3']`.
   - `combined.join('\n')` joins `'line 1'` with `''` (giving `'line 1\n'`), and `''` with `'line 3'` (giving `'\nline 3'`).
   - The result is `'line 1\n\nline 3'`. An extra blank line is inserted instead of deleting the line cleanly.
2. In `previewReplaceDiff`:
   - When `replacedChunk` is `""`, `"".split('\n')` evaluates to `[""]` (an array with one empty string element).
   - Concatenating `lines.slice(0, start - 1).concat([""]).concat(lines.slice(end))` inserts `""` into the lines array.
   - Joining with `\n` results in the same extra newline `\n\n`.
3. In unbounded replacement (lines 858–861):
   - When whole lines are deleted without `\n` boundary handling, adjacent newlines merge into `\n\n`.

#### Recommended Remediation:
In `replaceContent` (`suna_harness.js:828-834`):
```javascript
const before = allLines.slice(0, startLine - 1);
const after = allLines.slice(endLine);
const middle = replacedSlice.length > 0 ? replacedSlice.split('\n') : [];
const finalLines = before.concat(middle).concat(after);
newContent = finalLines.join('\n');
```
In `previewReplaceDiff` (`suna_harness.js:1816`):
```javascript
const middle = replacedChunk.length > 0 ? replacedChunk.split('\n') : [];
newContent = lines.slice(0, start - 1).concat(middle).concat(lines.slice(end)).join('\n');
```
In unbounded replacement (`suna_harness.js:858-861`):
If `targetStr` is an exact line match or accompanied by trailing newline, handle the newline boundary to prevent leaving double blank lines.

---

### 4. `fetch_page_summary` Network Error Mock Removal

#### Observed Code:
In `app.js` lines 4439–4449:
```javascript
let rawHtml = args.mockHtml || '';
if (!rawHtml && typeof fetchLinkContext === 'function') {
  try {
    const linkTxt = await fetchLinkContext(url);
    if (linkTxt) return { success: true, url, length: linkTxt.length, content: linkTxt.slice(0, maxLength) };
  } catch (e) {}
}

if (!rawHtml) {
  rawHtml = `<html><head><script>alert('xss')<\/script><style>body{}<\/style></head><body><nav>Menu</nav><main><h1>Tiêu đề trang</h1><p>Nội dung văn bản chính được trích xuất an toàn từ trang web.</p></main><footer>Bản quyền 2026</footer></body></html>`;
}
```

#### Failure Mechanism:
1. If `url` cannot be fetched (CORS failure, network timeout, cloudflare worker unreachable, or offline mode), `fetchLinkContext` returns empty or throws.
2. At line 4447, because `rawHtml` is still empty, the code falls back to a hardcoded synthetic HTML string with title `"Tiêu đề trang"` and body `"Nội dung văn bản chính được trích xuất an toàn từ trang web."`.
3. The function strips HTML tags and returns `{ success: true, url, length, content: "Tiêu đề trang Nội dung văn bản chính..." }`.
4. The AI model thinks it successfully fetched the live webpage and hallucinates fake facts based on this synthetic text.

#### Recommended Remediation:
Keep `args.mockHtml` support strictly for testing (to preserve backward compatibility with `test_dsh_core_tools.js`), but remove the automatic mock fallback on network failure:
```javascript
let rawHtml = args.mockHtml || '';
if (!rawHtml && typeof fetchLinkContext === 'function') {
  try {
    const linkTxt = await fetchLinkContext(url);
    if (linkTxt) {
      return { success: true, url, length: linkTxt.length, content: linkTxt.slice(0, maxLength) };
    }
  } catch (err) {
    return { success: false, error: `Error fetching URL content: ${err.message || String(err)}` };
  }
}

if (!rawHtml) {
  return {
    success: false,
    error: `Error: Failed to fetch content from "${url}". Network or proxy error, or URL is unreachable.`
  };
}
```

---

### 5. `run_sandboxed_command` & `sandbox_exec`

#### Observed Code & Architecture:
In `app.js` lines 4354–4361 (`sandbox_exec` browser fallback):
```javascript
const safeEval = new Function(
  'Math', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'window', 'document', 'localStorage',
  `"use strict";\nreturn (${code});`
);
```

In `suna_harness.js` line 3250 (`_executeNodeSandboxSync` fallback):
```javascript
const fn = new Function('sandbox', `with(sandbox) { return (${code}); }`);
result = fn(sandbox);
```

In `suna_harness.js` lines 3700–3709 and 3741–3750:
```javascript
if (this.readOnly) {
  const mutatingTools = ['replace_file_content', 'fs_write', 'fs_patch'];
  if (mutatingTools.includes(toolName)) {
    return {
      allowed: false,
      reason: `Permission denied: Tool "${toolName}" is prohibited in read-only mode.`,
      code: 'PERMISSION_DENIED'
    };
  }
}
```

#### Failure Mechanisms:
1. **`const`/`let` Syntax Errors**:
   - `return (${code});` wraps `code` in parentheses as an expression.
   - Declarations like `const x = 10;` or `let y = 20;` are JavaScript **statements**, not expressions.
   - Evaluating `return (const x = 10;);` causes an immediate `SyntaxError: Unexpected token 'const'`.
   - On repeated executions within a persistent VM context (if context is reused across steps), re-declaring top-level `const x` in the same lexical environment throws `SyntaxError: Identifier 'x' has already been declared`.
2. **Sandbox Escape via `Object.constructor` & `window`**:
   - The sandbox provides standard objects `{ Object, Array, Math, ... }` originating from the host realm.
   - Any script can execute `({}).constructor.constructor('return this')()`. Because `({}).constructor` is `Object`, its constructor is the host's `Function` constructor.
   - Executing `Function('return window')()` or `Function('return process')()` completely escapes the sandbox to obtain the global `window` or Node `process`.
   - In `app.js`, `globalThis` is not shadowed, enabling direct escape via `globalThis.window` or `globalThis.document`.
3. **`readOnly` Enforcement Failure**:
   - `mutatingTools` only checks `['replace_file_content', 'fs_write', 'fs_patch']`.
   - Neither `run_sandboxed_command` nor `write_to_file` is in `mutatingTools`.
   - `run_sandboxed_command` allows shell commands `touch <file>`, `mkdir <dir>`, `rm <file>`, and shell redirection `echo "foo" > file.txt` and `>>`.
   - `run_sandboxed_command` does not check `this.readOnly` and calls `this.vfs.writeFile(fullRedir, ...)` directly.
   - Consequently, read-only mode fails to prevent file mutations via shell execution.

#### Recommended Remediation:
1. **Fix `const`/`let` execution**:
   Wrap code execution in an IIFE or statement-completion evaluator instead of raw parentheses:
   ```javascript
   // Attempt expression evaluation first; if statement/syntax error, evaluate as function body:
   let evalFn;
   try {
     evalFn = new Function(paramNames, `"use strict";\nreturn (${code});`);
   } catch (syntaxErr) {
     evalFn = new Function(paramNames, `"use strict";\n${code}`);
   }
   ```
   For Node `vm.Script`: ensure each execution runs in a freshly isolated context or wraps code in a block `{ ${code} }` to prevent identifier collisions.
2. **Prevent Prototype & Constructor Escape**:
   - In browser fallback, shadow `globalThis`, `self`, `top`, `parent`, `window`, `document`, `localStorage`:
     ```javascript
     const blocked = ['window', 'document', 'localStorage', 'globalThis', 'self', 'top', 'parent'];
     ```
   - Nullify or freeze prototype constructors on sandbox primitives, or execute in an iframe sandbox with null prototype.
3. **Enforce `readOnly` on `run_sandboxed_command`**:
   - In `checkGuardrails` and `executeAction` (`suna_harness.js`):
     ```javascript
     if (this.readOnly) {
       const mutatingTools = ['replace_file_content', 'fs_write', 'fs_patch', 'write_to_file'];
       if (mutatingTools.includes(toolName)) {
         return { allowed: false, reason: `Permission denied: Tool "${toolName}" is prohibited in read-only mode.`, code: 'PERMISSION_DENIED' };
       }
       if (toolName === 'run_sandboxed_command') {
         const cmd = (args && (args.CommandLine || args.commandLine || args.command || args.cmd)) || '';
         const tokens = cmd.trim().split(/\s+/);
         const prog = (tokens[0] || '').toLowerCase();
         const isWriteCmd = ['touch', 'mkdir', 'rm'].includes(prog) || cmd.includes('>') || cmd.includes('>>');
         if (isWriteCmd) {
           return { allowed: false, reason: `Permission denied: Command "${cmd}" mutates VFS and is prohibited in read-only mode.`, code: 'PERMISSION_DENIED' };
         }
       }
     }
     ```

---

### 6. Parameter Aliases Normalization

#### Observed Code:
In `app.js` lines 4824–4828 (`executeTool`):
```javascript
let sanitized = parsedArgs;
if (tool && tool.parameters) {
  const validated = this.validateParameters(tool.parameters, parsedArgs);
  sanitized = validated.sanitized;
}
```

In `suna_agent.js` lines 1938–1939 (`executeTool`):
```javascript
const { sanitized } = this.validateParameters(tool.parameters, args);
return await tool.execute(sanitized, context);
```

In `suna_harness.js` lines 2267–2357 (`AciSchemaValidator.normalizeArgs`):
```javascript
static normalizeArgs(toolName, rawArgs) {
  // Normalizes path <-> TargetFile, commandLine <-> CommandLine, query <-> Query, etc.
  ...
}
```

#### Failure Mechanism:
1. `validateParameters` inspects `schema.required`:
   ```javascript
   for (const reqField of required) {
     if (args === undefined || args === null || !(reqField in args) || args[reqField] === undefined || args[reqField] === null) {
       throw new Error(`Missing required parameter: "${reqField}"`);
     }
   }
   ```
2. When an agent or LLM calls `view_file` with `{ path: "index.html" }`, but the tool schema requires `TargetFile`, `!( 'TargetFile' in args )` triggers an immediate validation exception.
3. Conversely, when `run_sandboxed_command` receives `{ command: "ls -l" }`, but schema requires `commandLine` or `CommandLine`, it fails with `Missing required parameter: "CommandLine"`.
4. `AciSchemaValidator.normalizeArgs` is already equipped with full bidirectional alias mappings for all 6 ACI tools, but neither `app.js.executeTool` nor `suna_agent.js.executeTool` calls `normalizeArgs` before passing arguments to `validateParameters`.

#### Recommended Remediation:
In `executeTool` (`app.js:4824` and `suna_agent.js:1938`):
Normalize arguments via `AciSchemaValidator.normalizeArgs` **before** invoking `validateParameters`:
```javascript
let normalizedArgs = parsedArgs;
const validator = (typeof AciSchemaValidator !== 'undefined' ? AciSchemaValidator : (typeof window !== 'undefined' ? window.AciSchemaValidator : null));
if (validator && typeof validator.normalizeArgs === 'function') {
  normalizedArgs = validator.normalizeArgs(trimmedName, parsedArgs);
}

if (tool && tool.parameters) {
  const validated = this.validateParameters(tool.parameters, normalizedArgs);
  sanitized = validated.sanitized;
}
```
Because `normalizeArgs` populates both canonical and alias properties (e.g., both `path` and `TargetFile`, both `commandLine` and `CommandLine`, both `query` and `Query`), `validateParameters` succeeds regardless of which parameter name convention is specified in `required`.

---

### 7. `vfs_change` Event Redirection Path Parsing

#### Observed Code:
In `suna_agent.js` lines 1636–1642:
```javascript
// If file modified, emit vfs_change for Live Workspace synchronization
if (toolName === 'replace_file_content' || (toolName === 'run_sandboxed_command' && rawArgs && rawArgs.CommandLine && rawArgs.CommandLine.includes('>'))) {
  const targetPath = normalized.TargetFile || normalized.path; // <--- [BUG: Always undefined for run_sandboxed_command!]
  if (targetPath && this.vfs && typeof this.vfs.exists === 'function' && this.vfs.exists(targetPath)) {
    const fileContent = this.vfs.readFile(targetPath);
    this.emit('vfs_change', { path: targetPath, content: fileContent });
  }
}
```

In `suna_harness.js` lines 2938–2948:
```javascript
if (cmdLine.includes('>>')) {
  const parts = cmdLine.split('>>');
  coreCmd = parts[0].trim();
  redirectFile = parts[1].trim();
  redirectAppend = true;
} else if (cmdLine.includes('>')) {
  const parts = cmdLine.split('>');
  coreCmd = parts[0].trim();
  redirectFile = parts[1].trim();
  redirectAppend = false;
}
```

#### Failure Mechanism:
1. In `suna_agent.js` line 1636, the condition correctly identifies that `run_sandboxed_command` contains `>`.
2. However, line 1637 tries to retrieve `targetPath` using `normalized.TargetFile || normalized.path`.
3. For `run_sandboxed_command`, `normalized` holds `{ CommandLine, TimeoutMs, Cwd }`. `normalized.TargetFile` and `normalized.path` are both `undefined`.
4. As a result, `targetPath` is `undefined`, line 1638 evaluates to `false`, and `vfs_change` is **never emitted**.
5. Live Workspace never synchronizes changes made via shell redirection (`echo "..." > index.html`), leaving `#artifact-editor-textarea` and `#artifact-iframe` stale.
6. Moreover, if `cwd` is supplied (e.g. `{ cwd: 'src', CommandLine: 'echo 1 > app.js' }`), the file path in VFS is `src/app.js`. Missing `cwd` prefixing causes `vfs.exists(targetPath)` to fail.

#### Recommended Remediation:
In `suna_agent.js` lines 1636–1642:
```javascript
if (toolName === 'replace_file_content' || (toolName === 'run_sandboxed_command' && rawArgs)) {
  let targetPath = normalized.TargetFile || normalized.path;
  if (!targetPath && toolName === 'run_sandboxed_command') {
    const cmd = (rawArgs.CommandLine || rawArgs.commandLine || rawArgs.command || rawArgs.cmd || '').trim();
    if (cmd.includes('>')) {
      const parts = cmd.includes('>>') ? cmd.split('>>') : cmd.split('>');
      if (parts.length > 1) {
        let candidate = parts[parts.length - 1].trim();
        candidate = candidate.split(/\s+/)[0].replace(/^['"]|['"]$/g, '');
        const cwd = rawArgs.Cwd || rawArgs.cwd || normalized.Cwd || normalized.cwd || '';
        targetPath = cwd ? (cwd.replace(/\/$/, '') + '/' + candidate.replace(/^\//, '')) : candidate;
      }
    }
  }

  if (targetPath && this.vfs && typeof this.vfs.exists === 'function' && this.vfs.exists(targetPath)) {
    const fileContent = this.vfs.readFile(targetPath);
    this.emit('vfs_change', { path: targetPath, content: fileContent });
  }
}
```
Additionally, ensure `SunaAgent` subscribes to VFS `'change'` events when attached:
```javascript
if (this.vfs && typeof this.vfs.on === 'function') {
  this.vfs.on('change', (path, node) => {
    this.emit('vfs_change', { path, content: node ? node.content : '' });
  });
}
```

---

## Verification & Test Plan for Milestone R2

To guarantee zero regression across existing 1,768+ tests while proving 100% resolution of the 7 issues:

1. **Test Suite R2-1 (`test_r2_tool_functional_integrity.js`)**:
   - `memory_store`: Store 3 distinct facts and 1 duplicate. Assert `saveMemory(true)` called. Reload state and verify `memory_query` returns all 3 facts.
   - `fs_patch`: Execute patch in a context where `Buffer = undefined` and `TextEncoder = undefined`. Assert successful patch and correct byte length without `ReferenceError`.
   - `replace_file_content`: Delete line 2 of a 3-line file (`"a\nb\nc"` -> `"a\nc"`). Assert exact match with no double `\n\n`.
   - `fetch_page_summary`: Call with simulated network failure (no `mockHtml`). Assert `{ success: false, error: ... }` is returned, with zero synthetic mock HTML text.
   - `run_sandboxed_command` / `sandbox_exec`:
     - Execute code with `const x = 10; const y = 20; x + y;` multiple times in succession. Assert clean computation without `SyntaxError`.
     - Attempt sandbox escape via `Object.constructor('return window')()`. Assert failure or safe containment.
     - Execute `echo "fail" > test.txt` with `readOnly: true`. Assert `PERMISSION_DENIED` and VFS remains unmodified.
   - Parameter Aliases: Call `executeTool` with `{ TargetFile: 'test.js' }`, `{ command: 'pwd' }`, and `{ query: 'findme' }`. Assert successful execution without missing parameter errors.
   - `vfs_change`: Execute `run_sandboxed_command({ CommandLine: 'echo "hello" > main.js' })`. Assert `vfs_change` event fired with `{ path: 'main.js', content: 'hello\n' }`.
2. **Regression Gate**:
   - `npm test`: 1,768+ tests pass.
   - `node -c app.js && node -c suna_harness.js && node -c suna_agent.js`: 0 syntax errors.
   - `python run_verification.py`: 100% green across all tiers.
