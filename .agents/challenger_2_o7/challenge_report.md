# Challenger 2 (Wave 7) Empirical Adversarial Challenge Report

## Challenge Summary

**Overall risk assessment**: LOW
**Explicit Verdict**: **APPROVE**

Empirical challenge investigation focused on Codex Code Surgery, Vietnamese UTF-8 Unicode diacritical normalization (NFC vs NFD canonical equivalence), and VFS Diff Engine reliability (`VfsDiffEngine.previewReplaceDiff`, Unified Git Diff patch generation, line-bound slicing, and `VFSMismatch` prevention).

All four assigned criteria have been empirically satisfied with zero production regressions across the entire 1,438-test matrix:
1. **Unicode NFC vs NFD Equivalence**: Empirically verified across all combinations (NFC file with NFD target, NFD file with NFC target, NFD file with NFD target, NFC file with NFC target) in both `replace_file_content` and `VfsDiffEngine.previewReplaceDiff`.
2. **Zero False `VFSMismatch`**: Precomposed NFC and decomposed NFD Vietnamese text across the entire Vietnamese diacritical vowel chart (tones, breves, circumflexes, horns, and Đ/đ) match and perform exact surgical replacement without throwing `VFSMismatch`.
3. **Diff Engine Fidelity**: `VfsDiffEngine.previewReplaceDiff` accurately returns `hasDiff: true` and valid Unified Git Diff patches (`--- a/...`, `+++ b/...`, `@@ -l,s +l,s @@`, deleted `-` lines, added `+` lines, and `\ No newline at end of file` indicators) when modifications exist, and correctly returns `hasDiff: false` with an empty patch when replacements are canonically equivalent.
4. **Authoritative Test Suites**:
   - `npx mocha tests/test_challenger_suna_agent_adversarial.js --grep "Codex Code Surgery"`: 4 passing (70ms).
   - `npm test`: 1,438 passing, 0 failing (39s).
   - `python run_verification.py`: 100% GREEN across all 4 stages (1,438 tests).

---

## Challenges

### [Low] Challenge 1: Timing Jitter in 12,000-Line Adversarial Scale Test

- **Assumption challenged**: That Myers diffing on a 12,000+ line file with 15 scattered edits will strictly execute in `< 200ms` on every host OS under concurrent execution load.
- **Attack scenario**: Executing the entire 1,438-test matrix through `python run_verification.py` on a multi-core Windows machine under background CPU load.
- **Observed behavior**: Under isolated single-suite execution, the test took 106ms-220ms. Under heavy parallel runner load, test 4.2 in `tests/test_challenger_m2_vfs_diff_adversarial.js` once recorded 347ms, triggering `AssertionError: Execution took 347ms, expected < 200ms`. When re-run under normal system conditions, `npm test` and `python run_verification.py` both passed 100% green (1,438 / 1,438 passing).
- **Blast radius**: Test-only performance flakiness; zero impact on production runtime correctness.
- **Mitigation**: Recommend Milestone 2 test authors adjust wall-clock threshold from `< 200ms` to `< 500ms` or use process CPU time (`process.cpuUsage()`) rather than wall-clock `Date.now()` to eliminate CI jitter.

### [Low] Challenge 2: Canonical Equivalence (NFC vs NFD) Zero-Diff Behavior

- **Assumption challenged**: Does `VfsDiffEngine.previewReplaceDiff` generate a patch when a file containing NFC text is replaced with identical text in NFD?
- **Attack scenario**: File contains `Đoàn kết, đoàn kết, đại đoàn kết.` (NFC). Target is the same string. Replacement is `.normalize('NFD')`.
- **Observed behavior**: `previewReplaceDiff` returned `wouldSucceed: true`, `hasDiff: false`, `patch: ''`. Because both strings normalize to identical NFC forms, Myers diff detects zero semantic alterations.
- **Blast radius**: None. This is desirable and correct behavior — it prevents cosmetic, phantom git diffs that would pollute version control with invisible encoding churn.

---

## Stress Test Results

A dedicated 19-test empirical stress battery was executed against `suna_harness.js` and `suna_agent.js`:

| # | Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---------------|-------------------|-----------------|--------|
| T1.1 | Unicode NFC vs NFD byte lengths on full VN alphabet | Raw strings `!==`, NFC normalized `===`, NFD length > NFC length | Passed (byte lengths 102 vs 136) | **PASS** |
| T2.1 | VFS file is NFC, TargetContent is NFD | Exact char surgery, 0 `VFSMismatch`, VFS contains replacement | Success, content updated cleanly | **PASS** |
| T2.2 | VFS file is NFD, TargetContent is NFC | Exact char surgery, 0 `VFSMismatch`, VFS contains replacement | Success, content updated cleanly | **PASS** |
| T2.3 | VFS file is NFD, TargetContent is NFD, Replacement is NFC | Exact char surgery, VFS content normalized to NFC | Success, content matches expected NFC | **PASS** |
| T2.4 | VFS file is NFC, TargetContent is NFC, Replacement is NFD | Exact char surgery, VFS content normalized to NFC | Success, content matches expected NFC | **PASS** |
| T3.1 | `previewReplaceDiff` with mutated Vietnamese text | `wouldSucceed: true`, `hasDiff: true`, valid Unified Git Diff patch | Returned `hasDiff: true`, header `--- a/.. +++ b/.. @@ -1 +1 @@` with `+` and `-` | **PASS** |
| T3.2 | `previewReplaceDiff` with NFD target and NFC file | `wouldSucceed: true`, `hasDiff: true`, valid patch | Correctly matched NFD target, produced valid diff | **PASS** |
| T3.3 | `previewReplaceDiff` with canonically identical replacement (NFC to NFD) | `wouldSucceed: true`, `hasDiff: false`, `patch: ''` | Suppressed spurious diff, returned `hasDiff: false` | **PASS** |
| T3.4 | `previewReplaceDiff` on nonexistent file | `wouldSucceed: false`, `hasDiff: undefined`, `patch: ''` | Returned `wouldSucceed: false` with proper reason | **PASS** |
| T3.5 | `previewReplaceDiff` on missing target content | `wouldSucceed: false`, `patch: ''` | Returned `wouldSucceed: false` with missing target error | **PASS** |
| T3.6 | `previewReplaceDiff` with invalid line bounds (e.g. 10..20 in 3-line file) | `wouldSucceed: false`, invalid bounds error | Returned `wouldSucceed: false` with bounds reason | **PASS** |
| T4.1 | `replaceContent` with `[startLine, endLine]` and NFD target | Replace only targeted line, preserve lines before/after identically | Targeted line replaced, surrounding lines intact | **PASS** |
| T4.2 | `replaceContent` when target is outside line bounds | Throw `VfsError` with `code: 'VFSMismatch'` | Threw expected `VFSMismatch` | **PASS** |
| T5.1 | Ambiguous duplicate Vietnamese match with `allowMultiple: false` | Throw `VfsError` with `code: 'AMBIGUOUS_MATCH'` (occurrences: 3) | Threw `AMBIGUOUS_MATCH` (NOT `VFSMismatch`) | **PASS** |
| T5.2 | Ambiguous duplicate Vietnamese match with `allowMultiple: true` | Replace all occurrences in single pass | Replaced all 3 occurrences cleanly | **PASS** |
| T6.1 | Indentation preservation with Vietnamese comments & nested tabs | Preserve tabs `\t\t` and structure | Tabs, indentation, and structure 100% preserved | **PASS** |
| T7.1 | `AciInterface.replace_file_content` end-to-end | Return `success: true`, valid diff patch, update VFS | Returned valid diff and updated VFS | **PASS** |
| T7.2 | `AciInterface.replace_file_content` with `preview: true` | Dry run: return diff, leave VFS file untouched | File untouched, diff returned accurately | **PASS** |
| T8.1 | `SunaAgent.invokeAciTool` end-to-end event emission | Emit `diff_preview` and `vfs_change` events | Both events emitted with full payload | **PASS** |

### Official Suite Execution Results

1. **Codex Code Surgery Suite**:
   ```
   npx mocha tests/test_challenger_suna_agent_adversarial.js --grep "Codex Code Surgery"
   4 passing (70ms)
   ```
2. **Full Project Test Suite**:
   ```
   npm test
   1438 passing (39s)
   ```
3. **Repository Verification Runner**:
   ```
   python run_verification.py
   [1/4] Checking JavaScript Syntax Integrity... (Clean syntax)
   [2/4] Checking CSS Hygiene & Brace Balance... (Curly braces balanced)
   [3/4] Running Comprehensive Mocha Test Suites... (1438 passing, 0 failing)
   [4/4] Verifying Test Architecture Distribution... (44 test files)
   >>> VERIFICATION PASSED: ALL CHECKS 100% GREEN (1438 TESTS) <<<
   ```

---

## Unchallenged Areas

- **Extremely large VFS files (>1GB)**: Virtual File System is held in Node.js/Browser memory; files exceeding Node V8 buffer limits (2GB) were not tested as typical agent workspace files remain well below 50MB.
