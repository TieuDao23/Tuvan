const { VfsDiffEngine } = require('../../suna_harness.js');

const a = ['line1', 'line2', 'line3'];
const b = ['line1', 'line2_mod', 'line3'];

function backtrackOpt(trace, a, b, d, offset) {
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

const orig = VfsDiffEngine._backtrack;
const editsOrig = orig;
VfsDiffEngine._backtrack = backtrackOpt;

const p = VfsDiffEngine.createUnifiedDiff('t.txt', 't.txt', a.join('\n') + '\n', b.join('\n') + '\n');
console.log('Result with backtrackOpt:');
console.log(p);
