const { VfsDiffEngine } = require('../../suna_harness.js');

// Implement a pure Myers without the bogus `max > 25000` check,
// but with a bound on D (e.g. maxD = 4000)
function myersOptimized(a, b, maxD = 10000) {
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (n === 0) return b.map(line => ({ type: 'insert', line: VfsDiffEngine._lineText(line), noEof: VfsDiffEngine._lineNoEof(line) }));
  if (m === 0) return a.map(line => ({ type: 'delete', line: VfsDiffEngine._lineText(line), noEof: VfsDiffEngine._lineNoEof(line) }));

  // Limit search to maxD to avoid O(D^2) memory explosion on completely different files
  const limitD = Math.min(max, maxD);
  const offset = limitD;
  // v only needs to be size 2 * limitD + 1! NOT 2 * max + 1!
  const v = new Int32Array(2 * limitD + 1);
  v[offset + 1] = 0;

  const trace = [];

  for (let d = 0; d <= limitD; d++) {
    const base = Math.max(0, offset - d - 1);
    const vCopy = v.slice(base, Math.min(v.length, offset + d + 2));
    trace.push({ base, v: vCopy });

    for (let k = -d; k <= d; k += 2) {
      let x;
      const kIdx = offset + k;
      if (k === -d || (k !== d && v[kIdx - 1] < v[kIdx + 1])) {
        x = v[kIdx + 1];
      } else {
        x = v[kIdx - 1] + 1;
      }
      let y = x - k;

      while (x < n && y < m && VfsDiffEngine._lineKey(a[x]) === VfsDiffEngine._lineKey(b[y])) {
        x++;
        y++;
      }
      v[kIdx] = x;

      if (x >= n && y >= m) {
        return VfsDiffEngine._backtrack(trace, a, b, d, offset);
      }
    }
  }

  // Fallback if D > limitD (files are too different)
  const del = a.map(line => ({ type: 'delete', line: VfsDiffEngine._lineText(line), noEof: VfsDiffEngine._lineNoEof(line) }));
  const ins = b.map(line => ({ type: 'insert', line: VfsDiffEngine._lineText(line), noEof: VfsDiffEngine._lineNoEof(line) }));
  return del.concat(ins);
}

// Test on 50,000 lines with 15 edits
const lines50k_A = Array.from({ length: 50000 }, (_, i) => ({ text: 'function f_' + i + '() { return ' + i + '; }', key: 'function f_' + i + '() { return ' + i + '; }\n', noEof: false }));
const lines50k_B = lines50k_A.slice();
const editIndices = [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 48000];
for (const idx of editIndices) {
  lines50k_B[idx] = { text: 'function f_' + idx + '_MOD() { return "MOD"; }', key: 'function f_' + idx + '_MOD() { return "MOD"; }\n', noEof: false };
}

const t0 = performance.now();
const edits = myersOptimized(lines50k_A, lines50k_B);
const t1 = performance.now();

console.log(`[myersOptimized] 50,000 lines with 11 edits:`);
console.log(`  Time: ${(t1 - t0).toFixed(2)} ms`);
console.log(`  Edits length: ${edits.length}`);

// Test hunk grouping on these edits
const t2 = performance.now();
const hunks = VfsDiffEngine._groupHunks(edits, 3);
const t3 = performance.now();
console.log(`  Hunk grouping time: ${(t3 - t2).toFixed(2)} ms`);
console.log(`  Hunks count: ${hunks.length}`);
