# Milestone 2 Contracts & Formal Specification: VfsDiffEngine & AciSchemaValidator

**Document ID:** M2-CONTRACTS-SPEC-01  
**Author:** `explorer_m2_3` (Specification Miner)  
**Milestone:** M2 — Unified Git Diff & JSON Schema Validator (R2)  
**Target File:** `d:\Suna Chat\suna_harness.js`  
**Dependencies:** Pure ECMAScript UMD (Zero npm dependencies)  
**Status:** DEFINITIVE SPECIFICATION & WORKER CHECKLIST  

---

## 1. Architectural Scope & Objectives

Milestone 2 fulfills requirement **R2** of `ORIGINAL_REQUEST.md`:
1. **`VfsDiffEngine`**: Production-grade Git Unified Diff generator conforming to standard Git patch specifications (`--- a/path\n+++ b/path\n@@ -l,s +l,s @@`). Computes minimum edit scripts using Myers/LCS algorithms, supports 3-line context grouping, snapshot-to-snapshot comparisons, pre-save surgical replacement preview, and handles multi-byte Vietnamese UTF-8 text with zero corruption.
2. **`AciSchemaValidator`**: Strict, upfront parameter validator for all 6 SWE-agent ACI tools (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `list_dir`, `run_sandboxed_command`). Detects missing fields, type mismatches, inverted line bounds, prototype pollution, and catastrophic ReDoS regex patterns before execution, returning structured diagnostics.

---

## 2. Formal Specification: VfsDiffEngine

### 2.1 Algorithm & Structural Semantics

```
Myers LCS Diff Engine Pipeline
Input: (oldText, newText, options)
  │
  ├── 1. Line Ending Normalization (CRLF -> LF)
  ├── 2. Unicode Normalization (preserve NFC/NFD integrity)
  ├── 3. Common Prefix & Suffix Stripping (O(N) pruning for >10k lines)
  ├── 4. Myers Greedy / Linear-Space Diff on Residue (O(N*D))
  ├── 5. Hunk Formation with Context Window (default: 3 lines)
  ├── 6. Adjacent Hunk Coalescing (distance <= 2 * context)
  ├── 7. EOF No-Newline Formatting (\ No newline at end of file)
  └── 8. Standard Header Assembly (--- a/... \n +++ b/... \n @@ -l,s +l,s @@)
```

### 2.2 Hunk Header Formatting Rules
The standard Git unified diff header syntax is:
```
@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@
```
1. **Line Indexing**: All line indices are **1-indexed**.
2. **Empty / Creation / Deletion Ranges**:
   - When a file is created or empty on the old side: `oldStart = 0`, `oldCount = 0` $\to$ `@@ -0,0 +1,N @@`.
   - When a file is deleted or truncated to empty on the new side: `newStart = 0`, `newCount = 0` $\to$ `@@ -1,N +0,0 @@`.
   - When both sides are empty: The diff string is completely empty `""` (no hunks generated).
3. **Single Line Counts**:
   - If `oldCount === 1`, Git standard permits `@@ -l +... @@` or `@@ -l,1 +... @@`. The engine must output canonical Git headers `@@ -l,1 +... @@` or shorthand `@@ -l +... @@` consistently.

---

### 2.3 Edge Cases Specification: VfsDiffEngine

| # | Edge Case Scenario | Inputs (`oldText`, `newText`) | Required Observable Output | Specification Rule & Invariant |
|---|---|---|---|---|
| **E1** | **Empty to Empty** | `oldText = ""`, `newText = ""` | `""` (empty string) | Zero hunks, zero headers. Both files have 0 lines; no patch generated. |
| **E2** | **Identical Content** | `oldText = "A\nB\nC"`, `newText = "A\nB\nC"` | `""` (empty string) | If `oldText === newText`, return empty string immediately without running Myers diff. |
| **E3** | **Empty to Populated (Creation / Population)** | `oldText = ""`, `newText = "alpha\nbeta\n"` | `--- a/file\n+++ b/file\n@@ -0,0 +1,2 @@\n+alpha\n+beta\n` | `oldStart=0, oldCount=0`. New side begins at line 1 with count = 2. |
| **E4** | **Populated to Empty (Deletion / Truncation)** | `oldText = "alpha\nbeta\n"`, `newText = ""` | `--- a/file\n+++ b/file\n@@ -1,2 +0,0 @@\n-alpha\n-beta\n` | `newStart=0, newCount=0`. Old side begins at line 1 with count = 2. |
| **E5** | **Old File Missing Trailing Newline** | `oldText = "alpha\nbeta"`, `newText = "alpha\nbeta\n"` | `--- a/file\n+++ b/file\n@@ -1,2 +1,2 @@\n alpha\n-beta\n\\ No newline at end of file\n+beta\n` | Emit `\ No newline at end of file\n` immediately following the deleted line that lacked `\n`. |
| **E6** | **New File Missing Trailing Newline** | `oldText = "alpha\nbeta\n"`, `newText = "alpha\nbeta"` | `--- a/file\n+++ b/file\n@@ -1,2 +1,2 @@\n alpha\n-beta\n+beta\n\\ No newline at end of file\n` | Emit `\ No newline at end of file\n` immediately following the inserted line that lacked `\n`. |
| **E7** | **Both Files Missing Trailing Newline** | `oldText = "alpha\nbeta"`, `newText = "alpha\ngamma"` | `--- a/file\n+++ b/file\n@@ -1,2 +1,2 @@\n alpha\n-beta\n\\ No newline at end of file\n+gamma\n\\ No newline at end of file\n` | Both deleted and inserted lines receive the EOF warning marker. |
| **E8** | **Windows CRLF vs Unix LF** | `oldText = "line1\r\nline2\r\n"`, `newText = "line1\nline2\n"` | Normalized comparison: If normalized to LF, returns `""`. If raw comparison mode enabled, shows line change. Default: Normalize `\r\n` to `\n` to prevent spurious diffs. | Default behavior: Standardize line endings before computing diff unless `binary: true` is specified. |
| **E9** | **Vietnamese UTF-8 Composite Diacritics** | `oldText = "Tiếng Việt có dấu"`, `newText = "Tiếng Việt có dấu: Ứng dụng AI"` | `--- a/doc.txt\n+++ b/doc.txt\n@@ -1 +1 @@\n-Tiếng Việt có dấu\n+Tiếng Việt có dấu: Ứng dụng AI\n` | UTF-8 code point preservation. No mojibake, no byte splitting. Retains characters `ả, ã, ạ, ắ, ằ, ẳ, ẵ, ặ, ấ, ầ, ẩ, ẫ, ậ, ê, ơ, ư, đ`. |
| **E10** | **Massive Scale (>10,000 Lines)** | `oldText` = 12,000 lines, `newText` = 12,000 lines with 1 line modified at line 6,000 | Computes single hunk `@@ -5997,7 +5997,7 @@` in $< 200\text{ ms}$, heap memory $< 30\text{ MB}$. | Fast prefix/suffix trimming skips 5,996 prefix lines and 6,000 suffix lines, running diff only on remaining 7 lines. |
| **E11** | **Snapshot Diff: Added File** | File `src/new.js` in Snapshot B, missing in Snapshot A | `--- /dev/null\n+++ b/src/new.js\n@@ -0,0 +1,N @@\n+...` | Old file path is `/dev/null`. |
| **E12** | **Snapshot Diff: Deleted File** | File `src/old.js` in Snapshot A, missing in Snapshot B | `--- a/src/old.js\n+++ /dev/null\n@@ -1,N +0,0 @@\n-...` | New file path is `/dev/null`. |
| **E13** | **Snapshot Diff: Unchanged Files** | Files present in both snapshots with identical SHA-256 hash | Omitted from patch | Only files with `status: 'added' | 'modified' | 'deleted'` appear in patch. |

---

### 2.4 Performance Scaling: Common Prefix/Suffix Pruning Algorithm

For large files ($>10,000$ lines), an unoptimized $O(N \times M)$ LCS matrix requires $10,000 \times 10,000 \times 4 \text{ bytes} \approx 400\text{ MB}$ of memory, causing browser tab crashes or call-stack overflow.

`VfsDiffEngine` must implement **Prefix/Suffix Pruning**:
```javascript
function pruneCommonAffixes(linesA, linesB) {
  let start = 0;
  const lenA = linesA.length;
  const lenB = linesB.length;
  
  // 1. Scan common prefix
  while (start < lenA && start < lenB && linesA[start] === linesB[start]) {
    start++;
  }
  
  // 2. Scan common suffix
  let endA = lenA - 1;
  let endB = lenB - 1;
  while (endA >= start && endB >= start && linesA[endA] === linesB[endB]) {
    endA--;
    endB--;
  }
  
  return {
    prefixCount: start,
    suffixCount: (lenA - 1) - endA,
    trimmedA: linesA.slice(start, endA + 1),
    trimmedB: linesB.slice(start, endB + 1)
  };
}
```
*Complexity Benefit*: If a single line changes in a 10,000 line file, `trimmedA` has length 1, `trimmedB` has length 1. Myers executes in $O(1)$ time ($< 0.1\text{ ms}$).

---

### 2.5 VfsDiffEngine Public API Contract

```typescript
class VfsDiffEngine {
  /**
   * Generates a standard unified Git diff between two texts.
   */
  static createUnifiedDiff(
    oldPath: string,
    newPath: string,
    oldText: string,
    newText: string,
    options?: {
      context?: number;          // Default: 3
      oldHeader?: string;        // Override '--- a/oldPath'
      newHeader?: string;        // Override '+++ b/newPath'
      stripTrailingCr?: boolean; // Default: true
    }
  ): string;

  /**
   * Compares two VFS snapshot states and generates a multi-file Git patch.
   */
  static compareSnapshots(
    snapshotA: { files: Record<string, { content: string }> },
    snapshotB: { files: Record<string, { content: string }> },
    options?: { context?: number }
  ): {
    patch: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
    details: Array<{
      path: string;
      status: 'added' | 'modified' | 'deleted';
      diff: string;
      insertions: number;
      deletions: number;
    }>;
  };

  /**
   * Previews the unified diff that replace_file_content WOULD produce without mutating VFS.
   */
  static previewReplaceDiff(
    vfs: VfsSandbox,
    targetFile: string,
    targetContent: string,
    replacementContent: string,
    options?: {
      startLine?: number;
      endLine?: number;
      allowMultiple?: boolean;
      context?: number;
    }
  ): {
    wouldSucceed: boolean;
    patch: string;
    reason?: string;
    oldContent?: string;
    newContent?: string;
  };

  /**
   * Formats side-by-side line comparison for UI visualizer.
   */
  static formatSideBySide(
    oldText: string,
    newText: string,
    options?: { context?: number }
  ): Array<{
    left: { line: number | null; text: string; type: 'context' | 'delete' | 'empty' };
    right: { line: number | null; text: string; type: 'context' | 'add' | 'empty' };
  }>;
}
```

---

## 3. Formal Specification: AciSchemaValidator

### 3.1 Architecture & Pipeline

```
AciInterface.execute(toolName, rawArgs)
  │
  ├── 1. Prototype Pollution Defense (strip __proto__, constructor, prototype)
  ├── 2. Alias Resolution (map path/AbsolutePath, startLine/StartLine, etc.)
  ├── 3. Type Checking & Coercion (string, integer, boolean, array)
  ├── 4. Boundary & Range Verification (startLine >= 1, startLine <= endLine)
  ├── 5. Enum & String Constraint Validation (type in ['file','directory','any'])
  ├── 6. Security Defense (ReDoS detection on regex queries)
  │
  ├── [IF INVALID] ──> Reject immediately with structured diagnostic
  │                    (Returns { status: 'ERROR', code: 'SCHEMA_VALIDATION_ERROR', validationErrors })
  │
  └── [IF VALID] ────> Proceed to tool method execution with normalizedArgs
```

---

### 3.2 Canonical Schemas for All 6 ACI Tools

#### Tool 1: `view_file`
- **Primary Fields**:
  - `path`: `string` (required, non-empty)
  - `startLine`: `integer >= 1` (optional, default: 1)
  - `endLine`: `integer >= 1` (optional, default: startLine + maxViewLines - 1)
  - `contentOffset`: `integer >= 0` (optional, default: 0)
- **Aliases**:
  - `path` $\leftarrow$ `['AbsolutePath', 'absolutePath', 'Path', 'targetFile', 'TargetFile']`
  - `startLine` $\leftarrow$ `['StartLine']`
  - `endLine` $\leftarrow$ `['EndLine']`
  - `contentOffset` $\leftarrow$ `['ContentOffset']`
- **Cross-Field Invariants**:
  - If both `startLine` and `endLine` provided: `startLine <= endLine`.

#### Tool 2: `replace_file_content`
- **Primary Fields**:
  - `TargetFile`: `string` (required, non-empty)
  - `TargetContent`: `string` (required, non-empty)
  - `ReplacementContent`: `string` (required, can be empty string `""`)
  - `StartLine`: `integer >= 1` (optional)
  - `EndLine`: `integer >= 1` (optional)
  - `AllowMultiple`: `boolean` (optional, default: false)
- **Aliases**:
  - `TargetFile` $\leftarrow$ `['targetFile', 'path', 'Path', 'AbsolutePath', 'absolutePath']`
  - `TargetContent` $\leftarrow$ `['targetContent']`
  - `ReplacementContent` $\leftarrow$ `['replacementContent']`
  - `StartLine` $\leftarrow$ `['startLine']`
  - `EndLine` $\leftarrow$ `['endLine']`
  - `AllowMultiple` $\leftarrow$ `['allowMultiple']`
- **Cross-Field Invariants**:
  - If both `StartLine` and `EndLine` provided: `StartLine <= EndLine`.
  - `TargetContent` must not be empty string.

#### Tool 3: `grep_search`
- **Primary Fields**:
  - `Query`: `string` (required, non-empty)
  - `SearchPath`: `string` (optional, default: `""`)
  - `IsRegex`: `boolean` (optional, default: false)
  - `CaseInsensitive`: `boolean` (optional, default: false)
  - `MatchPerLine`: `boolean` (optional, default: true)
  - `Includes`: `array<string>` (optional, default: `[]`)
- **Aliases**:
  - `Query` $\leftarrow$ `['query']`
  - `SearchPath` $\leftarrow$ `['searchPath', 'path', 'Path']`
  - `IsRegex` $\leftarrow$ `['isRegex']`
  - `CaseInsensitive` $\leftarrow$ `['caseInsensitive']`
  - `MatchPerLine` $\leftarrow$ `['matchPerLine']`
  - `Includes` $\leftarrow$ `['includes']`
- **Security Invariants**:
  - If `IsRegex === true`, `Query` must pass `isDangerousReDosRegex(Query)`.
  - Pattern must compile with `new RegExp(Query)` without throwing `SyntaxError`.

#### Tool 4: `find_by_name`
- **Primary Fields**:
  - `Pattern`: `string` (required, non-empty, default: `'*'`)
  - `SearchDirectory`: `string` (optional, default: `""`)
  - `Type`: `string` enum `['file', 'directory', 'any']` (optional, default: `'any'`)
  - `MaxDepth`: `integer >= 0` (optional, default: null / unlimited)
  - `Extensions`: `array<string>` (optional, default: null)
- **Aliases**:
  - `Pattern` $\leftarrow$ `['pattern']`
  - `SearchDirectory` $\leftarrow$ `['searchDirectory', 'dir', 'directory']`
  - `Type` $\leftarrow$ `['type']`
  - `MaxDepth` $\leftarrow$ `['maxDepth']`
  - `Extensions` $\leftarrow$ `['extensions']`

#### Tool 5: `list_dir`
- **Primary Fields**:
  - `DirectoryPath`: `string` (optional, default: `""`)
  - `Recursive`: `boolean` (optional, default: false)
  - `MaxDepth`: `integer >= 0` (optional, default: null)
- **Aliases**:
  - `DirectoryPath` $\leftarrow$ `['directoryPath', 'dirPath', 'DirPath', 'path', 'Path']`
  - `Recursive` $\leftarrow$ `['recursive']`
  - `MaxDepth` $\leftarrow$ `['maxDepth']`

#### Tool 6: `run_sandboxed_command`
- **Primary Fields**:
  - `CommandLine`: `string` (required, non-empty)
  - `TimeoutMs`: `integer` between 1 and 60000 (optional, default: 3000)
  - `Cwd`: `string` (optional, default: `""`)
- **Aliases**:
  - `CommandLine` $\leftarrow$ `['commandLine', 'command', 'cmd']`
  - `TimeoutMs` $\leftarrow$ `['timeoutMs']`
  - `Cwd` $\leftarrow$ `['cwd']`

---

### 3.3 Edge Cases Specification: AciSchemaValidator

| # | Edge Case Scenario | Test Input | Required Behavior | Diagnostic Error Structure |
|---|---|---|---|---|
| **V1** | **Prototype Pollution Attempt** | `{ "__proto__": { "polluted": true }, "TargetFile": "app.js", "TargetContent": "foo" }` | Strips `__proto__`, `constructor`, `prototype`. `Object.prototype.polluted` remains `undefined`. | Arguments sanitized; validation continues safely. |
| **V2** | **Inverted Line Range** | `{ "path": "math.js", "startLine": 50, "endLine": 20 }` | Rejects before VFS call. Returns `valid: false`. | `code: 'INVALID_RANGE_BOUNDS'`, message: `"startLine (50) cannot be greater than endLine (20)"`. |
| **V3** | **Zero or Negative Line Number** | `{ "path": "math.js", "startLine": 0 }` or `startLine: -3` | Rejects with `valid: false`. Line numbers must be $\ge 1$. | `field: 'startLine'`, `keyword: 'minimum'`, expected: `integer >= 1`. |
| **V4** | **Non-Integer Line Number** | `{ "path": "math.js", "startLine": 2.7 }` | Rejects with `valid: false`. Float lines not permitted. | `field: 'startLine'`, `keyword: 'type'`, expected: `'integer'`. |
| **V5** | **Empty Required String** | `{ "TargetFile": "app.js", "TargetContent": "" }` | Rejects with `valid: false`. `TargetContent` cannot be empty. | `field: 'TargetContent'`, `keyword: 'minLength'`. |
| **V6** | **Missing Required Property** | `{ "StartLine": 1 }` to `view_file` | Rejects with `valid: false`. Missing `path`. | `field: 'path'`, `keyword: 'required'`, message: `"Parameter 'path' is required"`. |
| **V7** | **Invalid Enum Value** | `{ "Pattern": "*.js", "Type": "socket" }` to `find_by_name` | Rejects with `valid: false`. Enum must be `file|directory|any`. | `field: 'Type'`, `keyword: 'enum'`, expected: `['file', 'directory', 'any']`. |
| **V8** | **ReDoS Nested Quantifier** | `{ "Query": "(a+)+$", "IsRegex": true }` | Scanned by `isDangerousReDosRegex`; rejected immediately. | `field: 'Query'`, `keyword: 'redos'`, message: `"Dangerous ReDoS regex pattern detected"`. |
| **V9** | **ReDoS Overlapping Alternation** | `{ "Query": "(a|a)+", "IsRegex": true }` | Detected as catastrophic backtracking risk; rejected. | `field: 'Query'`, `keyword: 'redos'`. |
| **V10** | **Invalid Regex Syntax** | `{ "Query": "[a-z", "IsRegex": true }` | Catches `SyntaxError`; does not crash process; returns validation error. | `field: 'Query'`, `keyword: 'regex_syntax'`, message: `"Invalid regular expression: Unterminated character class"`. |
| **V11** | **Extra Unknown Properties (Pass-Through)** | `{ "path": "app.js", "toolAction": "Inspecting", "Description": "Checking exports" }` | `valid: true`. Unknown fields are harmlessly passed through or stripped. | LLM / SWE-agent annotations must NOT trigger false positive rejections. |
| **V12** | **Timeout Bounds Exceeded** | `{ "CommandLine": "ls", "TimeoutMs": 999999 }` | Rejects with `valid: false`. Timeout exceeds max 60,000 ms. | `field: 'TimeoutMs'`, `keyword: 'maximum'`, expected: `<= 60000`. |
| **V13** | **Type Mismatch** | `{ "path": 12345 }` to `view_file` | Rejects with `valid: false`. Path must be string. | `field: 'path'`, `keyword: 'type'`, expected: `'string'`, received: `'number'`. |

---

### 3.4 Structured Diagnostic Return Schema

When validation succeeds:
```javascript
{
  valid: true,
  tool: 'replace_file_content',
  normalizedArgs: {
    TargetFile: 'math.js',
    TargetContent: 'return a - b;',
    ReplacementContent: 'return a + b;',
    StartLine: 1,
    EndLine: 4,
    AllowMultiple: false
  },
  errors: []
}
```

When validation fails:
```javascript
{
  valid: false,
  tool: 'replace_file_content',
  errors: [
    {
      field: 'StartLine',
      keyword: 'range',
      message: 'StartLine (50) cannot be greater than EndLine (20).',
      received: { StartLine: 50, EndLine: 20 }
    }
  ],
  diagnostic: 'SCHEMA_VALIDATION_ERROR: Tool "replace_file_content" rejected invalid arguments. StartLine (50) cannot be greater than EndLine (20).'
}
```

---

## 4. M2 Worker Implementation Checklist

To ensure a seamless, zero-regression implementation, the M2 Worker (`worker_m2`) must follow this exact checklist:

### Phase 1: Code Placement & Engine Setup
- [ ] **Step 1.1**: Open `d:\Suna Chat\suna_harness.js`.
- [ ] **Step 1.2**: Locate insertion point between `VfsSandbox` and `AciInterface` (around line 980).
- [ ] **Step 1.3**: Insert `class VfsDiffEngine`:
  - Implement Myers LCS line diff with common prefix & suffix pruning.
  - Implement `createUnifiedDiff(oldPath, newPath, oldText, newText, options)`.
  - Implement `compareSnapshots(snapshotA, snapshotB, options)`.
  - Implement `previewReplaceDiff(vfs, targetFile, targetContent, replacementContent, options)`.
  - Implement `formatSideBySide(oldText, newText, options)`.
  - Implement `\ No newline at end of file` EOF formatting for deleted and added lines.
  - Implement UTF-8 safe line splitting (`\n` and `\r\n` handling).
- [ ] **Step 1.4**: Insert `class AciSchemaValidator`:
  - Implement `TOOL_SCHEMAS` map for all 6 tools.
  - Implement `validate(toolName, args, options)` returning `{ valid, tool, normalizedArgs, errors, diagnostic }`.
  - Implement `assertValid(toolName, args, options)`.
  - Implement prototype pollution sanitization (stripping `__proto__`, `constructor`, `prototype`).
  - Implement ReDoS detection and regex syntax verification.
  - Implement alias normalization for parameter parity across tools.

### Phase 2: Subsystem Hook Integrations
- [ ] **Step 2.1**: Hook `AciInterface.prototype.execute(toolName, args)`:
  - Call `AciSchemaValidator.validate(toolName, args)`.
  - If `!validation.valid`, return:
    ```javascript
    return {
      status: 'ERROR',
      error: validation.diagnostic,
      code: 'SCHEMA_VALIDATION_ERROR',
      validationErrors: validation.errors
    };
    ```
  - Pass `validation.normalizedArgs` to the tool implementation.
- [ ] **Step 2.2**: Hook shell `diff` command in `AciInterface.prototype._executeSingleCommand`:
  - Replace lines 1521–1537 naive `_computeUnifiedDiff` with call to `VfsDiffEngine.createUnifiedDiff(file1, file2, text1, text2, { context: 3 })`.
- [ ] **Step 2.3**: Hook `AciInterface.prototype.replace_file_content`:
  - Add optional preview mode or attach diff preview metadata when requested.
- [ ] **Step 2.4**: Expose components in UMD factory return (around line 3240):
  - `VfsDiffEngine`, `AciSchemaValidator` exported on `SunaHarness` object.
  - Aliases `DiffEngine = VfsDiffEngine`, `SchemaValidator = AciSchemaValidator`.

### Phase 3: Verification & Zero-Regression Gates
- [ ] **Gate 3.1 Syntax Check**: Run `node -c suna_harness.js && node -c app.js`. Must exit with 0 errors.
- [ ] **Gate 3.2 Backward Compatibility**: Run `npm test`. All 982 existing tests must pass with 0 failures.
- [ ] **Gate 3.3 New Feature Unit Tests**: Add M2 tests to `tests/test_suna_harness.js`:
  - Test E1–E13: Empty files, identical files, no newline at EOF, large files (>10k lines), Vietnamese UTF-8.
  - Test V1–V13: Prototype pollution, inverted bounds, negative line numbers, enum validation, ReDoS queries, alias normalization.
- [ ] **Gate 3.4 Verification Runner**: Run `python run_verification.py`. Must report 100% green.

---
*Contract certified by `explorer_m2_3` for Suna Agent Harness Core Engineering Team.*
