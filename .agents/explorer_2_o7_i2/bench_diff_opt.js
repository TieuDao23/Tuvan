const assert = require('assert');
const { VfsDiffEngine } = require('../../suna_harness.js');

// Create an optimized clone of VfsDiffEngine to compare
class VfsDiffEngineOpt extends VfsDiffEngine {
  static _backtrack(trace, a, b, d, offset) {
    let x = a.length;
    let y = b.length;
    const edits = [];

    for (let step = d; step >= 0; step--) {
      const v = trace[step];
      const k = x - y;
      const kIdx = offset + k;

      let prevK;
      if (k === -step || (k !== step && v[kIdx - 1] < v[kIdx + 1])) {
        prevK = k + 1;
      } else {
        prevK = k - 1;
      }
      const prevX = v[offset + prevK];
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
}

// Compare results between original and optimized
const count = 12000;
const baseLines = Array.from({ length: count }, (_, i) => `function fn_${i}() { return ${i}; }`);
const oldText = baseLines.join('\n') + '\n';
const modLines = baseLines.slice();
for (let step = 1000; step < 11000; step += 700) {
  modLines[step] = `function fn_${step}() { return 'PATCHED_${step}'; }`;
}
const newText = modLines.join('\n') + '\n';

// 1. Verify exact output equality
const patchOriginal = VfsDiffEngine.createUnifiedDiff('test.js', 'test.js', oldText, newText);
// Override _backtrack on VfsDiffEngine temporarily for testing in this process
const origBacktrack = VfsDiffEngine._backtrack;
VfsDiffEngine._backtrack = VfsDiffEngineOpt._backtrack;
const patchOpt = VfsDiffEngine.createUnifiedDiff('test.js', 'test.js', oldText, newText);
VfsDiffEngine._backtrack = origBacktrack;

assert.strictEqual(patchOriginal, patchOpt, 'Patches MUST be identical!');
console.log('✓ Patch equality verified: 100% IDENTICAL output!');

// 2. Measure performance difference
console.log('\n--- Benchmarking Original vs Optimized _backtrack ---');
for (let i = 1; i <= 5; i++) {
  // Original
  const t0 = Date.now();
  VfsDiffEngine.createUnifiedDiff('test.js', 'test.js', oldText, newText);
  const origTime = Date.now() - t0;

  // Optimized
  VfsDiffEngine._backtrack = VfsDiffEngineOpt._backtrack;
  const t1 = Date.now();
  VfsDiffEngine.createUnifiedDiff('test.js', 'test.js', oldText, newText);
  const optTime = Date.now() - t1;
  VfsDiffEngine._backtrack = origBacktrack;

  console.log(`Run ${i}: Original = ${origTime}ms | Optimized (push+reverse) = ${optTime}ms | Speedup = ${(origTime / optTime).toFixed(2)}x`);
}
