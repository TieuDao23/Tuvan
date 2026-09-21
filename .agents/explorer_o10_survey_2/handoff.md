# Handoff Report — Explorer Survey 2 (Milestone R2: 22 Tools Functional Issues)

**Agent**: `explorer_o10_survey_2`  
**Milestone**: R2 — Khắc phục các lỗi chức năng trong 22 Công cụ (Tools)  
**Parent Orchestrator**: `orchestrator_10` (`5c061cb9-df2e-4230-be85-8d036737099c`)  
**Working Directory**: `d:\Suna Chat\.agents\explorer_o10_survey_2`  
**Date**: 2026-09-20  

---

## 1. Observation

Direct observations from source code inspection:

### Item 1: `memory_store` Deduplication & Persistence
- **File & Lines**: `d:\Suna Chat\app.js:4642-4654` and `app.js:5473-5491`.
- **Verbatim Code**:
  - `app.js:4649`: `state.memory.facts.push(memoryEntry);`
  - `app.js:4651-4653`:
    ```javascript
    if (typeof addMemoryFact === 'function') {
      try { addMemoryFact(fact, category); } catch (e) {}
    }
    ```
  - `app.js:5474-5478`:
    ```javascript
    const isDuplicate = State.memory.facts.some(f => 
      f.fact.toLowerCase().trim() === fact.toLowerCase().trim()
    );
    if (isDuplicate) return false;
    ```
  - `app.js:5489`: `saveMemory(true);`

### Item 2: `fs_patch` Byte Length Without Buffer/TextEncoder
- **File & Lines**: `d:\Suna Chat\app.js:4591-4595`.
- **Verbatim Code**:
  ```javascript
  const patched = original.replace(search, replace);
  const byteLength = typeof Buffer !== 'undefined'
    ? Buffer.byteLength(patched, 'utf8')
    : (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(patched).length : content.length);
  ```
- **Error Condition**: `content` is not defined anywhere in `fs_patch`. In environments lacking `Buffer` and `TextEncoder`, evaluating `content.length` throws `ReferenceError: content is not defined`.

### Item 3: `replace_file_content` Deletion Newline Hygiene
- **File & Lines**: `d:\Suna Chat\suna_harness.js:828-834` and `suna_harness.js:1816`.
- **Verbatim Code**:
  - `suna_harness.js:830-834`:
    ```javascript
    const before = allLines.slice(0, startLine - 1);
    const after = allLines.slice(endLine);
    const combined = [];
    if (before.length > 0) combined.push(before.join('\n'));
    combined.push(replacedSlice);
    if (after.length > 0) combined.push(after.join('\n'));
    newContent = combined.join('\n');
    ```
  - `suna_harness.js:1816`:
    ```javascript
    newContent = lines.slice(0, start - 1).concat(replacedChunk.split('\n')).concat(lines.slice(end)).join('\n');
    ```
- **Error Condition**: When deleting lines (`replacedSlice === ""`), `combined.push("")` pushes an empty string between `before` and `after`. Calling `.join('\n')` inserts `\n\n`. Similarly, `"".split('\n')` produces `[""]`, inserting an empty element that creates `\n\n`.

### Item 4: `fetch_page_summary` Network Error Mock Removal
- **File & Lines**: `d:\Suna Chat\app.js:4447-4449`.
- **Verbatim Code**:
  ```javascript
  if (!rawHtml) {
    rawHtml = `<html><head><script>alert('xss')<\/script><style>body{}<\/style></head><body><nav>Menu</nav><main><h1>Tiêu đề trang</h1><p>Nội dung văn bản chính được trích xuất an toàn từ trang web.</p></main><footer>Bản quyền 2026</footer></body></html>`;
  }
  ```
- **Error Condition**: When network/proxy fails and `args.mockHtml` is absent, the tool synthesizes a fake Vietnamese HTML page and returns `{ success: true, content: "Tiêu đề trang..." }`, inducing AI hallucinations.

### Item 5: `run_sandboxed_command` & `sandbox_exec` Execution & Security
- **File & Lines**:
  - `d:\Suna Chat\app.js:4357`: `safeEval = new Function(..., '"use strict";\\nreturn (' + code + ');');`
  - `d:\Suna Chat\suna_harness.js:3250`: `fn = new Function('sandbox', 'with(sandbox) { return (' + code + '); }');`
  - `d:\Suna Chat\suna_harness.js:3701, 3742`: `const mutatingTools = ['replace_file_content', 'fs_write', 'fs_patch'];`
- **Error Condition**:
  - Statements like `const x = 1;` wrapped in `return (...)` trigger `SyntaxError: Unexpected token 'const'`.
  - Re-evaluating top-level `const x` in the same VM context throws `SyntaxError: Identifier 'x' has already been declared`.
  - Calling `({}).constructor.constructor('return this')()` escapes to host `Function` to access `window`/`process`.
  - `run_sandboxed_command` is excluded from `mutatingTools`, allowing `touch`, `mkdir`, `rm`, and `>` redirection during `readOnly` mode.

### Item 6: Parameter Aliases Normalization
- **File & Lines**:
  - `d:\Suna Chat\app.js:4824-4828` (`executeTool`)
  - `d:\Suna Chat\suna_agent.js:1938-1939` (`executeTool`)
  - `d:\Suna Chat\suna_harness.js:2267-2357` (`AciSchemaValidator.normalizeArgs`)
- **Error Condition**: `validateParameters` runs on raw arguments before `AciSchemaValidator.normalizeArgs`. When a caller provides `{ TargetFile: 'app.js' }` but schema requires `path`, `validateParameters` immediately throws `Missing required parameter: "path"`.

### Item 7: `vfs_change` Event Redirection Path Parsing
- **File & Lines**: `d:\Suna Chat\suna_agent.js:1636-1642`.
- **Verbatim Code**:
  ```javascript
  if (toolName === 'replace_file_content' || (toolName === 'run_sandboxed_command' && rawArgs && rawArgs.CommandLine && rawArgs.CommandLine.includes('>'))) {
    const targetPath = normalized.TargetFile || normalized.path;
    if (targetPath && this.vfs && typeof this.vfs.exists === 'function' && this.vfs.exists(targetPath)) {
      const fileContent = this.vfs.readFile(targetPath);
      this.emit('vfs_change', { path: targetPath, content: fileContent });
    }
  }
  ```
- **Error Condition**: `normalized.TargetFile` and `normalized.path` are `undefined` for `run_sandboxed_command`. The redirection target path from `CommandLine` is never parsed, so `targetPath` remains `undefined` and `vfs_change` is never emitted.

---

## 2. Logic Chain

1. **Item 1**:
   - `app.js:4649` appends the fact to `state.memory.facts` before calling `addMemoryFact`.
   - `addMemoryFact` checks if the fact already exists in `State.memory.facts` (`isDuplicate`).
   - Because the fact was just added, `isDuplicate` is always `true`.
   - `addMemoryFact` returns early at line 5478, never reaching line 5489 `saveMemory(true)`.
   - Therefore, facts are never persisted to IndexedDB across reloads.
2. **Item 2**:
   - `app.js:4594` attempts to use `content.length` in the third tier of the ternary.
   - The variable containing the string in `fs_patch` is `patched`, not `content`.
   - In environments without `Buffer` and `TextEncoder`, referencing an undeclared identifier `content` throws `ReferenceError`.
3. **Item 3**:
   - `suna_harness.js:832` pushes `replacedSlice` into `combined`. When deleting code, `replacedSlice` is `""`.
   - `combined.join('\n')` places newlines before and after `""`, resulting in `\n\n`.
   - `previewReplaceDiff` similarly splits `""` with `\n`, producing `[""]` instead of an empty array `[]`.
   - Replacing this with `const middle = replacedSlice.length > 0 ? replacedSlice.split('\n') : []` eliminates the extra newline cleanly.
4. **Item 4**:
   - In `app.js:4447`, `if (!rawHtml)` supplies hardcoded fallback HTML when `fetchLinkContext` returns null/errors.
   - Stripping and returning this mock text deceives the model into thinking the fetch succeeded, causing hallucinated summaries.
   - Removing the automatic fallback and returning `{ success: false, error: ... }` forces explicit error propagation.
5. **Item 5**:
   - Evaluating code wrapped in `(${code})` attempts expression evaluation, failing on `const`/`let` statements with `SyntaxError`.
   - Top-level `const`/`let` in the same VM environment cannot be re-declared without error.
   - Accessible object prototypes provide access to host `Function` via `constructor`.
   - `mutatingTools` whitelist in `suna_harness.js:3701` omits `run_sandboxed_command`, allowing shell writes in `readOnly` mode.
6. **Item 6**:
   - `executeTool` invokes `validateParameters` directly on raw arguments.
   - `validateParameters` checks exact required property keys.
   - Calling `AciSchemaValidator.normalizeArgs` beforehand mirrors canonical and alias keys, enabling `validateParameters` to pass for any valid alias.
7. **Item 7**:
   - `suna_agent.js:1637` reads `targetPath` from `normalized.TargetFile || normalized.path`.
   - For `run_sandboxed_command`, these fields are undefined; the path resides in `rawArgs.CommandLine` after `>`.
   - Parsing the right-hand side of `>` extracts the file path, allowing `this.vfs.readFile(targetPath)` to find the file and emit `vfs_change`.

---

## 3. Caveats

- **Existing Tests**: 1,768+ Mocha tests currently pass. In `test_dsh_core_tools.js`, tests for `fetch_page_summary` explicitly provide `mockHtml: "..."`. Keeping `args.mockHtml` support when explicitly passed ensures existing unit tests do not break while preventing default synthetic hallucination in production.
- **Node vs Browser dual runtime**: `sandbox_exec` operates differently in Node.js (via `vm` module) vs browser (via `new Function`). Both branches must be remediated in tandem.
- **Redirection syntax**: Shell redirection may be `>` or `>>`, and may specify relative paths (with or without `cwd`), or be enclosed in quotes. The parser must handle all these variants cleanly.

---

## 4. Conclusion

All 7 functional issues have been thoroughly traced to exact source files and line numbers. The root causes are deterministic, self-contained, and can be cleanly repaired without architectural churn or breaking changes to existing test suites.

Detailed remediation blueprints and code blocks are documented in:
`d:\Suna Chat\.agents\explorer_o10_survey_2\survey_report.md`

---

## 5. Verification Method

To verify the investigation and ensure zero regression:
1. **Syntax Check**:
   ```powershell
   node -c app.js
   node -c suna_harness.js
   node -c suna_agent.js
   ```
2. **Current Test Suites Execution**:
   ```powershell
   npx mocha tests/test_dsh_core_tools.js
   npx mocha tests/test_suna_agent.js
   npx mocha tests/test_suna_harness.js
   npm test
   ```
3. **Invalidation Conditions**:
   - If `saveMemory(true)` fails to trigger on new `memory_store` calls.
   - If `fs_patch` throws `ReferenceError` when `Buffer` is deleted.
   - If line deletion via `replace_file_content` leaves `\n\n`.
   - If `fetch_page_summary` outputs "Tiêu đề trang" on network error.
   - If repeated `const x = 1` in sandbox fails with `SyntaxError`.
   - If `executeTool('view_file', { path: 'x' })` is rejected for missing `TargetFile`.
   - If `run_sandboxed_command({ CommandLine: 'echo 1 > a.txt' })` fails to emit `vfs_change`.
