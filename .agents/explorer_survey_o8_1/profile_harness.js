const { VfsDiffEngine, VfsSandbox } = require('../../suna_harness.js');

console.log('--- VfsDiffEngine & VfsSandbox Diagnostic Profiler Part 2 ---');

// Case A: 50,000 lines entering _computeEdits (e.g. 1 line differs or called directly)
{
  const lines50k_A = Array.from({ length: 50000 }, (_, i) => 'line ' + i);
  const lines50k_B = lines50k_A.slice();
  lines50k_B[49999] = 'line 49999 modified';
  const strA = lines50k_A.join('\n') + '\n';
  const strB = lines50k_B.join('\n') + '\n';

  const t0 = performance.now();
  const diff = VfsDiffEngine.createUnifiedDiff('file.txt', 'file.txt', strA, strB, { context: 3 });
  const t1 = performance.now();

  console.log(`[Case A] 50,000 lines with 1 modification at end:`);
  console.log(`  Time: ${(t1 - t0).toFixed(2)} ms`);
  console.log(`  Diff output length: ${diff.length}`);
}

// Case B: What if 50,000 lines have edits distributed across the file?
// e.g. 50,000 lines with 15 edits
{
  const lines50k_A = Array.from({ length: 50000 }, (_, i) => 'function f_' + i + '() { return ' + i + '; }');
  const lines50k_B = lines50k_A.slice();
  const editIndices = [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 48000];
  for (const idx of editIndices) {
    lines50k_B[idx] = 'function f_' + idx + '_MOD() { return "MOD"; }';
  }
  const strA = lines50k_A.join('\n') + '\n';
  const strB = lines50k_B.join('\n') + '\n';

  const t0 = performance.now();
  const diff = VfsDiffEngine.createUnifiedDiff('file50k.js', 'file50k.js', strA, strB, { context: 3 });
  const t1 = performance.now();

  console.log(`[Case B] 50,000 lines with 11 edits:`);
  console.log(`  Time: ${(t1 - t0).toFixed(2)} ms`);
  console.log(`  Diff output length: ${diff.length}`);
  const hunkCount = (diff.match(/@@ /g) || []).length;
  console.log(`  Hunk count: ${hunkCount}`);
}

// Case C: Trace _myersRaw fallback threshold (max > 25000)
{
  // If midA has 13,000 lines and midB has 13,000 lines, max = 26,000 > 25,000!
  // In that case, _myersRaw aborts and replaces the entire middle with ALL DELETIONS and ALL INSERTIONS!
  const n = 13000;
  const a = Array.from({ length: n }, (_, i) => ({ text: 'line ' + i, key: 'line ' + i + '\n', noEof: false }));
  const b = a.slice();
  // Modify only line 0 and line 12999
  b[0] = { text: 'line 0 mod', key: 'line 0 mod\n', noEof: false };
  b[12999] = { text: 'line 12999 mod', key: 'line 12999 mod\n', noEof: false };

  const rawEdits = VfsDiffEngine._myersRaw(b, a); // n=13000, m=13000 -> max = 26000 > 25000
  console.log(`[Case C] _myersRaw with max > 25,000 fallback behavior:`);
  console.log(`  Input size: ${n} x ${n}`);
  console.log(`  Edits count returned: ${rawEdits.length}`);
  console.log(`  Did it fail into all-delete/all-insert? ${rawEdits.length === 26000}`);
}
