const assert = require('assert');
const { VfsDiffEngine } = require('../../suna_harness.js');

function backtrackPushReverse(trace, a, b, d, offset) {
  let x = a.length;
  let y = b.length;
  const edits = [];

  for (let step = d; step >= 0; step--) {
    const rec = trace[step];
    const v = rec.v;
    const base = rec.base;
    const k = x - y;
    const kIdx = offset + k;

    let prevK;
    if (k === -step || (k !== step && v[kIdx - 1 - base] < v[kIdx + 1 - base])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[offset + prevK - base];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.push({ type: 'equal', line: VfsDiffEngine._lineText(a[x - 1]) });
      x--;
      y--;
    }

    if (step > 0) {
      if (x === prevX) {
        edits.push({
          type: 'insert',
          line: VfsDiffEngine._lineText(b[prevY]),
          noEof: VfsDiffEngine._lineNoEof(b[prevY])
        });
        y--;
      } else if (y === prevY) {
        edits.push({
          type: 'delete',
          line: VfsDiffEngine._lineText(a[prevX]),
          noEof: VfsDiffEngine._lineNoEof(a[prevX])
        });
        x--;
      }
    }
  }
  edits.reverse();
  return edits;
}

// 1. Verify exact output equality on Test 4.2 data
const count = 12000;
const baseLines = Array.from({ length: count }, (_, i) => `function fn_${i}() { return ${i}; }`);
const oldText = baseLines.join('\n') + '\n';
const modLines = baseLines.slice();
for (let step = 1000; step < 11000; step += 700) {
  modLines[step] = `function fn_${step}() { return 'PATCHED_${step}'; }`;
}
const newText = modLines.join('\n') + '\n';

const origBacktrack = VfsDiffEngine._backtrack;

const patchOrig = VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });

VfsDiffEngine._backtrack = backtrackPushReverse;
const patchOpt = VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });
VfsDiffEngine._backtrack = origBacktrack;

assert.strictEqual(patchOrig, patchOpt, 'Optimized output must be byte-for-byte identical!');
console.log('✓ Byte-for-byte identical patch verified!');

// 2. Measure speedup over 10 runs
console.log('\n--- Timing Comparison (10 runs) ---');
for (let r = 1; r <= 10; r++) {
  const t0 = Date.now();
  VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });
  const timeOrig = Date.now() - t0;

  VfsDiffEngine._backtrack = backtrackPushReverse;
  const t1 = Date.now();
  VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });
  const timeOpt = Date.now() - t1;
  VfsDiffEngine._backtrack = origBacktrack;

  console.log(`Run ${r}: Orig = ${timeOrig}ms | Opt = ${timeOpt}ms | Diff = ${timeOrig - timeOpt}ms saved`);
}
