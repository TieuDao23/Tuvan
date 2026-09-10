'use strict';

/**
 * tests/test_challenger_m2_vfs_diff_adversarial.js
 *
 * EMPIRICAL ADVERSARIAL STRESS HARNESS — Milestone 2: VfsDiffEngine
 * Challenger Agent: challenger_m2_1
 *
 * Empirically stress-tests VfsDiffEngine with adversarial inputs and edge cases:
 * 1. Myers diff mathematical and algorithmic soundness (reversibility, edge topologies)
 * 2. Trailing newline edge cases and POSIX patch warning integrity
 * 3. Vietnamese UTF-8 composite diacritics, normalization (NFC vs NFD), and multilingual Unicode
 * 4. Scale, memory, and worst-case execution limits (10,000+ line scale, 30,000+ line fallback)
 * 5. Hunk grouping, coalescing calculus, and header line-count invariants
 * 6. Side-by-side formatting stress and column alignment invariants
 * 7. AST patch parser (parsePatch) robustness against malformed inputs and multi-file patches
 * 8. VFS snapshot comparison and dry-run preview contract verification
 */

const assert = require('assert');
const path = require('path');
const SunaHarness = require(path.resolve(__dirname, '../suna_harness.js'));

describe('Challenger M2: Adversarial VfsDiffEngine & Unified Git Patch Stress Harness', function () {
  this.timeout(25000);

  const { VfsDiffEngine, VfsSandbox, AciInterface, VfsError } = SunaHarness;

  assert.ok(VfsDiffEngine, 'VfsDiffEngine must be exported by SunaHarness');

  // =========================================================================
  // SECTION 1: MYERS DIFF MATHEMATICAL & ALGORITHMIC SOUNDNESS
  // =========================================================================
  describe('1. Myers LCS Algorithmic Soundness & Reversibility', () => {

    it('1.1 Edit reversibility: applying Myers edits reconstructs target text identically', () => {
      const testCases = [
        {
          name: 'interleaved edits',
          oldLines: ['a', 'b', 'c', 'd', 'e', 'f'],
          newLines: ['a', 'b_mod', 'c', 'd_mod', 'e', 'f_mod', 'g']
        },
        {
          name: 'complete inversion / reversal',
          oldLines: ['one', 'two', 'three', 'four', 'five'],
          newLines: ['five', 'four', 'three', 'two', 'one']
        },
        {
          name: 'repeated identical tokens',
          oldLines: ['dup', 'dup', 'other', 'dup', 'dup'],
          newLines: ['dup', 'inserted', 'dup', 'dup']
        },
        {
          name: 'pure deletions from middle',
          oldLines: ['header', 'remove1', 'remove2', 'footer'],
          newLines: ['header', 'footer']
        },
        {
          name: 'pure insertions at boundary',
          oldLines: ['middle'],
          newLines: ['top', 'middle', 'bottom']
        }
      ];

      for (const tc of testCases) {
        const edits = VfsDiffEngine._computeEdits(tc.oldLines, tc.newLines);
        // Reconstruct target text by applying edits
        const reconstructed = [];
        let oldIdx = 0;

        for (const e of edits) {
          if (e.type === 'equal') {
            assert.strictEqual(e.line, tc.oldLines[oldIdx], `Equal line mismatch in ${tc.name}`);
            reconstructed.push(e.line);
            oldIdx++;
          } else if (e.type === 'delete') {
            assert.strictEqual(e.line, tc.oldLines[oldIdx], `Deleted line mismatch in ${tc.name}`);
            oldIdx++;
          } else if (e.type === 'insert') {
            reconstructed.push(e.line);
          }
        }

        assert.strictEqual(oldIdx, tc.oldLines.length, `All old lines must be consumed in ${tc.name}`);
        assert.deepStrictEqual(reconstructed, tc.newLines, `Reconstructed text must match target in ${tc.name}`);
      }
    });

    it('1.2 Extreme boundary conditions: empty, single characters, and whitespace only', () => {
      // Empty vs Empty
      assert.strictEqual(VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', '', ''), '');
      assert.strictEqual(VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', null, null), '');
      assert.strictEqual(VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', undefined, undefined), '');

      // Single newline vs Empty
      const patchDelNl = VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', '\n', '');
      assert.ok(patchDelNl.includes('@@ -1 +0,0 @@'));
      assert.ok(patchDelNl.includes('-\n') || patchDelNl.includes('-\r\n') || patchDelNl.includes('-'));

      // Empty vs Single newline
      const patchAddNl = VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', '', '\n');
      assert.ok(patchAddNl.includes('@@ -0,0 +1 @@'));

      // Single character without newline
      const patchSingleNoNl = VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', 'x', 'y');
      assert.ok(patchSingleNoNl.includes('-x'));
      assert.ok(patchSingleNoNl.includes('+y'));
      assert.strictEqual((patchSingleNoNl.match(/\\ No newline at end of file/g) || []).length, 2);
    });

    it('1.3 Common affix linear pruning efficiency: prefix/suffix trimming isolates diff window', () => {
      const prefix = Array.from({ length: 500 }, (_, i) => `common_prefix_${i}`);
      const suffix = Array.from({ length: 500 }, (_, i) => `common_suffix_${i}`);
      const oldMid = ['target_old'];
      const newMid = ['target_new'];

      const linesA = prefix.concat(oldMid).concat(suffix);
      const linesB = prefix.concat(newMid).concat(suffix);

      const edits = VfsDiffEngine._computeEdits(linesA, linesB);
      assert.strictEqual(edits.length, 1000 + 2); // 500 equal prefix + 1 del + 1 ins + 500 equal suffix

      // Middle edits must be exactly delete oldMid and insert newMid
      const nonEqual = edits.filter(e => e.type !== 'equal');
      assert.strictEqual(nonEqual.length, 2);
      assert.strictEqual(nonEqual[0].type, 'delete');
      assert.strictEqual(nonEqual[0].line, 'target_old');
      assert.strictEqual(nonEqual[1].type, 'insert');
      assert.strictEqual(nonEqual[1].line, 'target_new');
    });
  });

  // =========================================================================
  // SECTION 2: TRAILING NEWLINE & POSIX PATCH WARNING INTEGRITY
  // =========================================================================
  describe('2. Trailing Newline Edge Cases & POSIX Warnings', () => {

    it('2.1 Emits "\\ No newline at end of file" on deleted EOF line missing newline', () => {
      const oldText = 'alpha\nbeta';
      const newText = 'alpha\nbeta\n';
      const patch = VfsDiffEngine.createUnifiedDiff('file.txt', 'file.txt', oldText, newText);

      assert.ok(patch.includes('-beta\n\\ No newline at end of file\n+beta'));
      assert.ok(!patch.includes('+beta\n\\ No newline at end of file'));
    });

    it('2.2 Emits "\\ No newline at end of file" on added EOF line missing newline', () => {
      const oldText = 'alpha\nbeta\n';
      const newText = 'alpha\nbeta';
      const patch = VfsDiffEngine.createUnifiedDiff('file.txt', 'file.txt', oldText, newText);

      assert.ok(patch.includes('-beta\n+beta\n\\ No newline at end of file'));
    });

    it('2.3 Emits dual warnings when both old and new files omit trailing newline', () => {
      const oldText = 'line1\nline2_old';
      const newText = 'line1\nline2_new';
      const patch = VfsDiffEngine.createUnifiedDiff('file.txt', 'file.txt', oldText, newText);

      const warnings = patch.match(/\\ No newline at end of file/g);
      assert.strictEqual(warnings ? warnings.length : 0, 2, 'Must contain exactly 2 EOF newline warnings');
      assert.ok(patch.includes('-line2_old\n\\ No newline at end of file'));
      assert.ok(patch.includes('+line2_new\n\\ No newline at end of file'));
    });

    it('2.4 Distinguishes trailing empty line with newline from no-newline file', () => {
      // File A: 'line1\n' (1 line, ending in \n)
      // File B: 'line1\n\n' (2 lines, second line is empty, ending in \n)
      const patch = VfsDiffEngine.createUnifiedDiff('file.txt', 'file.txt', 'line1\n', 'line1\n\n');
      assert.ok(patch.includes('@@ -1 +1,2 @@'));
      assert.ok(patch.includes(' line1'));
      assert.ok(patch.includes('+'));
      assert.ok(!patch.includes('\\ No newline at end of file'));
    });

    it('2.5 CRLF to LF normalization avoids spurious diffs and supports explicit disable', () => {
      const crlfText = 'row1\r\nrow2\r\nrow3\r\n';
      const lfText = 'row1\nrow2\nrow3\n';

      // Default stripTrailingCr: true -> no diff
      const noDiff = VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', crlfText, lfText);
      assert.strictEqual(noDiff, '', 'Default normalization must treat CRLF and LF as identical');

      // stripTrailingCr: false -> detects differences
      const withDiff = VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', crlfText, lfText, { stripTrailingCr: false });
      assert.ok(withDiff.length > 0, 'Disabling stripTrailingCr must detect carriage return differences');
      assert.ok(withDiff.includes('-row1\r'));
      assert.ok(withDiff.includes('+row1'));
    });
  });

  // =========================================================================
  // SECTION 3: UTF-8 & MULTILINGUAL UNICODE ADVERSARIAL STRESS
  // =========================================================================
  describe('3. UTF-8 & Vietnamese Composite Diacritics Stress', () => {

    it('3.1 NFC vs NFD Vietnamese normalization prevents false-positive diffs', () => {
      // NFC (composed) vs NFD (decomposed combining diacritics)
      const nfc = 'Tiếng Việt có dấu: Ứng dụng AI chất lượng cao';
      const nfd = nfc.normalize('NFD');

      // JavaScript considers them different strings without normalization
      assert.notStrictEqual(nfc, nfd);

      // VfsDiffEngine with default normalizeUnicode: true must treat them as identical
      const diff = VfsDiffEngine.createUnifiedDiff('doc.md', 'doc.md', nfc + '\n', nfd + '\n');
      assert.strictEqual(diff, '', 'NFC and NFD representations of Vietnamese must not yield diffs');

      // When normalizeUnicode: false is set, the difference is detected
      const diffRaw = VfsDiffEngine.createUnifiedDiff('doc.md', 'doc.md', nfc + '\n', nfd + '\n', { normalizeUnicode: false });
      assert.ok(diffRaw.length > 0, 'Disabling normalizeUnicode must capture byte-level codepoint differences');
    });

    it('3.2 Detects fine-grained Vietnamese diacritic alterations without Unicode corruption', () => {
      const oldText = 'thời tiết hôm nay rất đẹp, trời trong xanh.\n';
      const newText = 'thời tiết hôm nay rất đẹp, trời trong lành.\n';

      const patch = VfsDiffEngine.createUnifiedDiff('vn.txt', 'vn.txt', oldText, newText);
      assert.ok(patch.includes('-thời tiết hôm nay rất đẹp, trời trong xanh.'));
      assert.ok(patch.includes('+thời tiết hôm nay rất đẹp, trời trong lành.'));
      assert.ok(!patch.includes('\uFFFD'), 'Must not produce replacement characters');
    });

    it('3.3 Handles multibyte emojis, ZWJ clusters, CJK, and RTL scripts cleanly', () => {
      const oldText = 'Status: 🚀 In Progress | Team: 👨‍👩‍👧‍👦 | 日本語: テスト | עברית: שלום\n';
      const newText = 'Status: ✅ Completed | Team: 👨‍👩‍👧‍👦 | 日本語: テスト完了 | עברית: שלום\n';

      const patch = VfsDiffEngine.createUnifiedDiff('multi.txt', 'multi.txt', oldText, newText);
      assert.ok(patch.includes('-Status: 🚀 In Progress | Team: 👨‍👩‍👧‍👦 | 日本語: テスト | עברית: שלום'));
      assert.ok(patch.includes('+Status: ✅ Completed | Team: 👨‍👩‍👧‍👦 | 日本語: テスト完了 | עברית: שלום'));
      assert.ok(!patch.includes('\uFFFD'));
    });

    it('3.4 Preserves Unicode file paths with diacritics in diff patch headers', () => {
      const pathVn = 'Thư mục tài liệu/Báo cáo quý 3.txt';
      const patch = VfsDiffEngine.createUnifiedDiff(pathVn, pathVn, 'dòng 1\n', 'dòng 1 đã sửa\n');
      assert.ok(patch.includes(`--- a/${pathVn}`));
      assert.ok(patch.includes(`+++ b/${pathVn}`));
    });
  });

  // =========================================================================
  // SECTION 4: SCALE, MEMORY & WORST-CASE EXECUTION LIMITS
  // =========================================================================
  describe('4. Scale, Memory & Worst-Case Execution Limits', () => {

    it('4.1 Diffs 10,000+ line file with single edit in < 300ms via affix pruning', () => {
      const count = 10000;
      const baseLines = Array.from({ length: count }, (_, i) => `const val_${i} = ${i * 2};`);
      const oldText = baseLines.join('\n') + '\n';
      const modLines = baseLines.slice();
      modLines[5000] = 'const val_5000 = "MODIFIED_SCALE";';
      const newText = modLines.join('\n') + '\n';

      const t0 = Date.now();
      const patch = VfsDiffEngine.createUnifiedDiff('scale.js', 'scale.js', oldText, newText, { context: 3 });
      const elapsed = Date.now() - t0;

      assert.ok(elapsed < 300, `Execution took ${elapsed}ms, expected < 300ms`);
      assert.ok(patch.includes('-const val_5000 = 10000;'));
      assert.ok(patch.includes('+const val_5000 = "MODIFIED_SCALE";'));
      assert.ok(patch.includes('@@ -4998,7 +4998,7 @@'));
    });

    it('4.2 Diffs 12,000+ line file with 15 scattered edits in < 600ms', () => {
      const count = 12000;
      const baseLines = Array.from({ length: count }, (_, i) => `function fn_${i}() { return ${i}; }`);
      const oldText = baseLines.join('\n') + '\n';
      const modLines = baseLines.slice();

      for (let step = 1000; step < 11000; step += 700) {
        modLines[step] = `function fn_${step}() { return 'PATCHED_${step}'; }`;
      }
      const newText = modLines.join('\n') + '\n';

      const t0 = Date.now();
      const patch = VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });
      const elapsed = Date.now() - t0;

      assert.ok(elapsed < 600, `Execution took ${elapsed}ms, expected < 600ms`);
      assert.ok(patch.includes("PATCHED_1000"));
      assert.ok(patch.includes("PATCHED_10100"));
    });

    it('4.3 Pathological scale safeguard: max > 25000 triggers safe fallback chunked del/ins', () => {
      // Two files of 15,000 completely disjoint lines -> max = 30,000 > 25,000
      const aLines = Array.from({ length: 15000 }, (_, i) => `unique_old_line_${i}`);
      const bLines = Array.from({ length: 15000 }, (_, i) => `unique_new_line_${i}`);

      const t0 = Date.now();
      const patch = VfsDiffEngine.createUnifiedDiff('disjoint.txt', 'disjoint.txt', aLines.join('\n') + '\n', bLines.join('\n') + '\n');
      const elapsed = Date.now() - t0;

      assert.ok(elapsed < 500, `Fallback diff should complete in < 500ms, took ${elapsed}ms`);
      assert.ok(patch.includes('-unique_old_line_0'));
      assert.ok(patch.includes('+unique_new_line_0'));
      assert.ok(patch.includes('-unique_old_line_14999'));
      assert.ok(patch.includes('+unique_new_line_14999'));
    });

    it('4.4 50,000 identical lines produce instant empty diff in < 50ms', () => {
      const bigText = 'ident_line\n'.repeat(50000);
      const t0 = Date.now();
      const patch = VfsDiffEngine.createUnifiedDiff('same.txt', 'same.txt', bigText, bigText);
      const elapsed = Date.now() - t0;

      assert.strictEqual(patch, '');
      assert.ok(elapsed < 50, `Identical diff check took ${elapsed}ms, expected < 50ms`);
    });
  });

  // =========================================================================
  // SECTION 5: HUNK GROUPING, COALESCING & BOUNDARY CALCULUS
  // =========================================================================
  describe('5. Hunk Grouping, Coalescing Calculus & Header Invariants', () => {

    it('5.1 Exact coalescing threshold: distance <= 6 merges; distance >= 7 splits', () => {
      // Case A: 6 unchanged lines between edits (distance = 6 <= 2 * 3) -> 1 hunk
      const lines6Old = ['EDIT_1', 'same1', 'same2', 'same3', 'same4', 'same5', 'same6', 'EDIT_2'];
      const lines6New = ['EDIT_1_MOD', 'same1', 'same2', 'same3', 'same4', 'same5', 'same6', 'EDIT_2_MOD'];
      const patch6 = VfsDiffEngine.createUnifiedDiff('c.txt', 'c.txt', lines6Old.join('\n') + '\n', lines6New.join('\n') + '\n', { context: 3 });
      const hunks6 = (patch6.match(/@@/g) || []).length / 2;
      assert.strictEqual(hunks6, 1, '6 unchanged lines must coalesce into 1 hunk');

      // Case B: 7 unchanged lines between edits (distance = 7 > 2 * 3) -> 2 hunks
      const lines7Old = ['EDIT_1', 'same1', 'same2', 'same3', 'same4', 'same5', 'same6', 'same7', 'EDIT_2'];
      const lines7New = ['EDIT_1_MOD', 'same1', 'same2', 'same3', 'same4', 'same5', 'same6', 'same7', 'EDIT_2_MOD'];
      const patch7 = VfsDiffEngine.createUnifiedDiff('c.txt', 'c.txt', lines7Old.join('\n') + '\n', lines7New.join('\n') + '\n', { context: 3 });
      const hunks7 = (patch7.match(/@@/g) || []).length / 2;
      assert.strictEqual(hunks7, 2, '7 unchanged lines must split into 2 distinct hunks');
    });

    it('5.2 Configurable context radius: context=0 yields zero-context surgical diff', () => {
      const oldLines = ['line1', 'line2', 'line3', 'line4', 'line5'];
      const newLines = ['line1', 'line2', 'LINE_3_MOD', 'line4', 'line5'];

      const patchContext0 = VfsDiffEngine.createUnifiedDiff('f.txt', 'f.txt', oldLines.join('\n') + '\n', newLines.join('\n') + '\n', { context: 0 });
      assert.ok(patchContext0.includes('@@ -3 +3 @@'));
      assert.ok(!patchContext0.includes(' line2'));
      assert.ok(!patchContext0.includes(' line4'));
      assert.ok(patchContext0.includes('-line3'));
      assert.ok(patchContext0.includes('+LINE_3_MOD'));
    });

    it('5.3 Hunk header line-count invariants strictly match hunk line counts across 50 random diffs', () => {
      for (let iter = 0; iter < 50; iter++) {
        const lenA = Math.floor(Math.random() * 40) + 1;
        const lenB = Math.floor(Math.random() * 40) + 1;
        const a = Array.from({ length: lenA }, () => `tok_${Math.floor(Math.random() * 15)}`).join('\n') + '\n';
        const b = Array.from({ length: lenB }, () => `tok_${Math.floor(Math.random() * 15)}`).join('\n') + '\n';

        const patch = VfsDiffEngine.createUnifiedDiff('test.txt', 'test.txt', a, b);
        if (!patch) continue;

        const parsed = VfsDiffEngine.parsePatch(patch);
        for (const file of parsed) {
          for (const hunk of file.hunks) {
            let actualOld = 0;
            let actualNew = 0;
            for (const l of hunk.lines) {
              if (l.startsWith(' ') || l.startsWith('-')) actualOld++;
              if (l.startsWith(' ') || l.startsWith('+')) actualNew++;
            }
            assert.strictEqual(hunk.oldCount, actualOld, `Old count mismatch in hunk ${hunk.header}`);
            assert.strictEqual(hunk.newCount, actualNew, `New count mismatch in hunk ${hunk.header}`);
          }
        }
      }
    });
  });

  // =========================================================================
  // SECTION 6: SIDE-BY-SIDE FORMATTING STRESS
  // =========================================================================
  describe('6. Side-by-Side Formatting Stress & Layout Invariants', () => {

    it('6.1 Monotonic line number invariants hold across asymmetrical insertions and deletions', () => {
      const oldText = 'a\nb\nc\nd\ne';
      const newText = 'a\nx\ny\nc\ne\nz';
      const rows = VfsDiffEngine.formatSideBySide(oldText, newText);

      let prevLeft = 0;
      let prevRight = 0;

      for (const row of rows) {
        if (row.type === 'equal') {
          assert.strictEqual(row.left.lineNum, prevLeft + 1);
          assert.strictEqual(row.right.lineNum, prevRight + 1);
          assert.strictEqual(row.left.text, row.right.text);
          assert.strictEqual(row.left.type, 'context');
          assert.strictEqual(row.right.type, 'context');
          prevLeft++;
          prevRight++;
        } else if (row.type === 'delete') {
          assert.strictEqual(row.left.lineNum, prevLeft + 1);
          assert.strictEqual(row.right.lineNum, null);
          assert.strictEqual(row.right.type, 'empty');
          assert.strictEqual(row.left.type, 'delete');
          prevLeft++;
        } else if (row.type === 'insert') {
          assert.strictEqual(row.left.lineNum, null);
          assert.strictEqual(row.right.lineNum, prevRight + 1);
          assert.strictEqual(row.left.type, 'empty');
          assert.strictEqual(row.right.type, 'add');
          prevRight++;
        }
      }

      assert.strictEqual(prevLeft, 5, 'All 5 old lines must be accounted for');
      assert.strictEqual(prevRight, 6, 'All 6 new lines must be accounted for');
    });

    it('6.2 Handles empty inputs and pure additions/deletions gracefully in side-by-side', () => {
      // Both empty
      assert.deepStrictEqual(VfsDiffEngine.formatSideBySide('', ''), []);

      // Pure additions
      const addRows = VfsDiffEngine.formatSideBySide('', 'line1\nline2');
      assert.strictEqual(addRows.length, 2);
      assert.ok(addRows.every(r => r.type === 'insert' && r.left.lineNum === null));

      // Pure deletions
      const delRows = VfsDiffEngine.formatSideBySide('line1\nline2', '');
      assert.strictEqual(delRows.length, 2);
      assert.ok(delRows.every(r => r.type === 'delete' && r.right.lineNum === null));
    });
  });

  // =========================================================================
  // SECTION 7: AST PATCH PARSER (parsePatch) ROBUSTNESS & FUZZING
  // =========================================================================
  describe('7. AST Patch Parser (parsePatch) Robustness', () => {

    it('7.1 Parses multi-file unified diff patch stream cleanly', () => {
      const patch1 = VfsDiffEngine.createUnifiedDiff('src/app.js', 'src/app.js', 'const x = 1;\n', 'const x = 2;\n');
      const patch2 = VfsDiffEngine.createUnifiedDiff('package.json', 'package.json', '{"v":"1"}', '{"v":"2"}');
      const combined = patch1 + patch2;

      const parsed = VfsDiffEngine.parsePatch(combined);
      assert.strictEqual(parsed.length, 2, 'Must discover both files');
      assert.strictEqual(parsed[0].oldFile, 'a/src/app.js');
      assert.strictEqual(parsed[0].newFile, 'b/src/app.js');
      assert.strictEqual(parsed[1].oldFile, 'a/package.json');
      assert.strictEqual(parsed[1].newFile, 'b/package.json');
    });

    it('7.2 Preserves "\\ No newline at end of file" warning in hunk line arrays', () => {
      const patch = VfsDiffEngine.createUnifiedDiff('a.txt', 'a.txt', 'foo', 'bar');
      const parsed = VfsDiffEngine.parsePatch(patch);

      assert.strictEqual(parsed.length, 1);
      const hunk = parsed[0].hunks[0];
      const noNlCount = hunk.lines.filter(l => l.startsWith('\\')).length;
      assert.strictEqual(noNlCount, 2, 'Must record both no-newline warning lines');
    });

    it('7.3 Defensively absorbs malformed, empty, and non-patch inputs without throwing', () => {
      assert.deepStrictEqual(VfsDiffEngine.parsePatch(null), []);
      assert.deepStrictEqual(VfsDiffEngine.parsePatch(undefined), []);
      assert.deepStrictEqual(VfsDiffEngine.parsePatch(''), []);
      assert.deepStrictEqual(VfsDiffEngine.parsePatch(12345), []);
      assert.deepStrictEqual(VfsDiffEngine.parsePatch('Random log output with no diff headers\nJust text\n'), []);

      const headerOnly = VfsDiffEngine.parsePatch('--- a/empty.txt\n+++ b/empty.txt\n');
      assert.strictEqual(headerOnly.length, 1);
      assert.strictEqual(headerOnly[0].hunks.length, 0);
    });

    it('7.4 Tolerates enclosing function heading text after @@ header', () => {
      const patchWithFunc = '--- a/main.js\n+++ b/main.js\n@@ -10,4 +10,4 @@ function computeTotal(items) {\n-let t = 0;\n+let total = 0;\n';
      const parsed = VfsDiffEngine.parsePatch(patchWithFunc);

      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].hunks.length, 1);
      assert.strictEqual(parsed[0].hunks[0].oldStart, 10);
      assert.strictEqual(parsed[0].hunks[0].oldCount, 4);
    });
  });

  // =========================================================================
  // SECTION 8: VFS INTEGRATION & PREVIEW CONTRACT VERIFICATION
  // =========================================================================
  describe('8. VFS Integration & Dry-Run Preview Contract', () => {
    let vfs, aci;

    beforeEach(() => {
      vfs = new VfsSandbox();
      aci = new AciInterface(vfs);
    });

    it('8.1 vfs.diffFiles compares two VFS files and throws on nonexistent file', () => {
      vfs.writeFile('alpha.txt', 'one\ntwo\n');
      vfs.writeFile('beta.txt', 'one\nthree\n');

      const diff = vfs.diffFiles('alpha.txt', 'beta.txt');
      assert.ok(diff.includes('-two'));
      assert.ok(diff.includes('+three'));

      assert.throws(() => {
        vfs.diffFiles('nonexistent.txt', 'beta.txt');
      }, (err) => {
        assert(err instanceof VfsError);
        assert.strictEqual(err.code, 'VFSNotFound');
        return true;
      });
    });

    it('8.2 vfs.getWorkspaceDiff tracks multi-file additions, modifications, and deletions', () => {
      vfs.writeFile('mod.txt', 'initial\n');
      vfs.writeFile('del.txt', 'to_delete\n');
      const snap1 = vfs.createSnapshot();

      vfs.writeFile('mod.txt', 'mutated\n');
      vfs.removeFile('del.txt');
      vfs.writeFile('add.txt', 'brand_new\n');

      const wsDiff = vfs.getWorkspaceDiff(snap1);
      assert.strictEqual(wsDiff.filesChanged, 3);
      assert.strictEqual(wsDiff.files.length, 3);

      const added = wsDiff.files.find(f => f.path === 'add.txt');
      const deleted = wsDiff.files.find(f => f.path === 'del.txt');
      const modified = wsDiff.files.find(f => f.path === 'mod.txt');

      assert.ok(added && added.status === 'added' && added.oldPath === '/dev/null');
      assert.ok(deleted && deleted.status === 'deleted' && deleted.newPath === '/dev/null');
      assert.ok(modified && modified.status === 'modified');
    });

    it('8.3 previewReplaceDiff strictly guarantees zero VFS state mutation', () => {
      const originalCode = 'function greeting() {\n  console.log("hello");\n}\n';
      vfs.writeFile('script.js', originalCode);

      const preview = VfsDiffEngine.previewReplaceDiff(
        vfs,
        'script.js',
        'console.log("hello");',
        'console.log("hello world");'
      );

      assert.strictEqual(preview.wouldSucceed, true);
      assert.ok(preview.patch.includes('-  console.log("hello");'));
      assert.ok(preview.patch.includes('+  console.log("hello world");'));

      // Verify VFS file content is 100% unaltered
      assert.strictEqual(vfs.readFile('script.js'), originalCode, 'VFS content must not be modified by preview');
    });

    it('8.4 Contract Check: verifies dry-run failure modes on nonexistent files and missing targets', () => {
      // Nonexistent file
      const nonExistent = VfsDiffEngine.previewReplaceDiff(vfs, 'missing.js', 'foo', 'bar');
      assert.strictEqual(nonExistent.wouldSucceed, false);
      assert.ok(nonExistent.reason.includes('does not exist'));

      // Target content not found in file
      vfs.writeFile('exists.js', 'const a = 10;\n');
      const targetMissing = VfsDiffEngine.previewReplaceDiff(vfs, 'exists.js', 'const b = 20;', 'const b = 30;');
      assert.strictEqual(targetMissing.wouldSucceed, false);
      assert.ok(targetMissing.reason.includes('Target content not found'));
    });
  });
});
