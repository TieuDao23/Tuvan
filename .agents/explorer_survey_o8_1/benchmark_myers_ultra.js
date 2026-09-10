const { VfsDiffEngine } = require('../../suna_harness.js');

// 1. Integer hashing of lines
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

// Optimized Myers diff with integer line hashing and compact trace
function myersUltra(linesA, linesB, maxD = 4000) {
  const n = linesA.length;
  const m = linesB.length;
  const max = n + m;

  if (n === 0) return linesB.map(l => ({ type: 'insert', line: l.text, noEof: l.noEof }));
  if (m === 0) return linesA.map(l => ({ type: 'delete', line: l.text, noEof: l.noEof }));

  // Precompute 32-bit hashes for mid lines
  const hashA = new Uint32Array(n);
  const hashB = new Uint32Array(m);
  for (let i = 0; i < n; i++) hashA[i] = linesA[i].hash;
  for (let i = 0; i < m; i++) hashB[i] = linesB[i].hash;

  const limitD = Math.min(max, maxD);
  const offset = limitD;
  const v = new Int32Array(2 * limitD + 1);
  v[offset + 1] = 0;

  // Store trace in flat typed array or array of slices
  const trace = [];

  for (let d = 0; d <= limitD; d++) {
    const base = Math.max(0, offset - d - 1);
    const len = Math.min(v.length, offset + d + 2) - base;
    const vCopy = new Int32Array(len);
    vCopy.set(v.subarray(base, base + len));
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

      // Integer hash check first, then exact text check on collision
      while (x < n && y < m && hashA[x] === hashB[y] && linesA[x].key === linesB[y].key) {
        x++;
        y++;
      }
      v[kIdx] = x;

      if (x >= n && y >= m) {
        return VfsDiffEngine._backtrack(trace, linesA, linesB, d, offset);
      }
    }
  }

  // Fallback if D > limitD
  const del = linesA.map(l => ({ type: 'delete', line: l.text, noEof: l.noEof }));
  const ins = linesB.map(l => ({ type: 'insert', line: l.text, noEof: l.noEof }));
  return del.concat(ins);
}

// Run benchmark on 12,000 lines with 15 edits
const lines12k_A = Array.from({ length: 12000 }, (_, i) => {
  const text = `function item_${i}() { return ${i}; }`;
  const key = text + '\n';
  return { text, key, noEof: false, hash: hashString(key) };
});
const lines12k_B = lines12k_A.slice();
const editIndices = [500, 1200, 2000, 2800, 3500, 4200, 5000, 6000, 7000, 8000, 9000, 9800, 10500, 11200, 11800];
for (const idx of editIndices) {
  const text = `function item_${idx}_MOD() { return "MOD_${idx}"; }`;
  const key = text + '\n';
  lines12k_B[idx] = { text, key, noEof: false, hash: hashString(key) };
}

// Prefix and suffix trim
const t0 = performance.now();
let start = 0;
while (start < 12000 && lines12k_A[start].hash === lines12k_B[start].hash && lines12k_A[start].key === lines12k_B[start].key) {
  start++;
}
let endA = 11999, endB = 11999;
while (endA >= start && endB >= start && lines12k_A[endA].hash === lines12k_B[endB].hash && lines12k_A[endA].key === lines12k_B[endB].key) {
  endA--;
  endB--;
}
const midA = lines12k_A.slice(start, endA + 1);
const midB = lines12k_B.slice(start, endB + 1);

const midEdits = myersUltra(midA, midB);
const t1 = performance.now();

console.log(`[myersUltra Benchmark]`);
console.log(`  12,000 lines / 15 edits compute time: ${(t1 - t0).toFixed(2)} ms`);
console.log(`  MidEdits count: ${midEdits.length}`);
