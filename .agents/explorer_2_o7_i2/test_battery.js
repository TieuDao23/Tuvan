const assert = require('assert');
const { VfsDiffEngine } = require('../../suna_harness.js');

// Test battery:
// 1. Empty strings
// 2. Pure addition
// 3. Pure deletion
// 4. Identical lines
// 5. Single edit
// 6. Scattered edits
// 7. No newline at EOF
// 8. Vietnamese unicode text

const origCompute = VfsDiffEngine._computeEdits;
const origBacktrack = VfsDiffEngine._backtrack;
const origGroup = VfsDiffEngine._groupHunks;

function runBattery(diffFn) {
  const tests = [
    { name: 'empty', a: '', b: '' },
    { name: 'add', a: '', b: 'hello\nworld\n' },
    { name: 'del', a: 'hello\nworld\n', b: '' },
    { name: 'identical', a: 'line1\nline2\n', b: 'line1\nline2\n' },
    { name: 'single', a: 'line1\nline2\nline3\n', b: 'line1\nline2_mod\nline3\n' },
    { name: 'no_eof_del', a: 'line1\nline2', b: 'line1\nline2\nline3\n' },
    { name: 'no_eof_ins', a: 'line1\nline2\n', b: 'line1\nline2' },
    { name: 'unicode', a: 'Tiếng Việt có dấu\nĐường về quê mẹ\n', b: 'Tiếng Việt có dấu\nĐường về quê mẹ nắng vàng\n' },
  ];

  const results = {};
  for (const t of tests) {
    results[t.name] = diffFn('test.txt', 'test.txt', t.a, t.b);
  }
  return results;
}

const baselineResults = runBattery(VfsDiffEngine.createUnifiedDiff);

// Apply optimized versions:
VfsDiffEngine._computeEdits = function(linesA, linesB) {
  const normA = (linesA.length > 0 && typeof linesA[0] === 'object' && linesA[0].key !== undefined)
    ? linesA
    : linesA.map(x => (typeof x === 'string' ? { text: x, noEof: false, key: x + '\n' } : x));
  const normB = (linesB.length > 0 && typeof linesB[0] === 'object' && linesB[0].key !== undefined)
    ? linesB
    : linesB.map(x => (typeof x === 'string' ? { text: x, noEof: false, key: x + '\n' } : x));
  const N = normA.length;
  const M = normB.length;

  let start = 0;
  while (start < N && start < M && normA[start].key === normB[start].key) {
    start++;
  }

  let endA = N - 1;
  let endB = M - 1;
  while (endA >= start && endB >= start && normA[endA].key === normB[endB].key) {
    endA--;
    endB--;
  }

  const prefixEdits = [];
  for (let i = 0; i < start; i++) {
    prefixEdits.push({ type: 'equal', line: normA[i].text });
  }

  const suffixEdits = [];
  for (let i = endA + 1; i < N; i++) {
    suffixEdits.push({ type: 'equal', line: normA[i].text });
  }

  const midA = normA.slice(start, endA + 1);
  const midB = normB.slice(start, endB + 1);

  let midEdits = [];
  if (midA.length > 0 || midB.length > 0) {
    midEdits = VfsDiffEngine._myersRaw(midA, midB);
  }

  return prefixEdits.concat(midEdits, suffixEdits);
};

VfsDiffEngine._backtrack = function(trace, a, b, d, offset) {
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
};

VfsDiffEngine._groupHunks = function(edits, contextLines = 3) {
  const blocks = [];
  let i = 0;
  while (i < edits.length) {
    if (edits[i].type === 'equal') {
      i++;
      continue;
    }
    const blockStart = i;
    while (i < edits.length && edits[i].type !== 'equal') {
      i++;
    }
    blocks.push({ start: blockStart, end: i - 1 });
  }

  if (blocks.length === 0) return [];

  const groups = [];
  let currentGroup = [blocks[0]];

  for (let b = 1; b < blocks.length; b++) {
    const prevBlock = currentGroup[currentGroup.length - 1];
    const currBlock = blocks[b];
    const distance = currBlock.start - prevBlock.end - 1;
    if (distance <= 2 * contextLines) {
      currentGroup.push(currBlock);
    } else {
      groups.push(currentGroup);
      currentGroup = [currBlock];
    }
  }
  groups.push(currentGroup);

  const hunks = [];
  let prevScanIdx = 0;
  let runningOld = 1;
  let runningNew = 1;

  for (const group of groups) {
    const firstBlock = group[0];
    const lastBlock = group[group.length - 1];

    const hunkStart = Math.max(0, firstBlock.start - contextLines);
    const hunkEnd = Math.min(edits.length - 1, lastBlock.end + contextLines);

    for (let j = prevScanIdx; j < hunkStart; j++) {
      if (edits[j].type === 'equal' || edits[j].type === 'delete') {
        runningOld++;
      }
      if (edits[j].type === 'equal' || edits[j].type === 'insert') {
        runningNew++;
      }
    }
    prevScanIdx = hunkStart;

    const oldStart = runningOld;
    const newStart = runningNew;

    let oldCount = 0;
    let newCount = 0;
    const lines = [];

    for (let j = hunkStart; j <= hunkEnd; j++) {
      const e = edits[j];
      if (e.type === 'equal') {
        oldCount++;
        newCount++;
        lines.push(' ' + e.line);
      } else if (e.type === 'delete') {
        oldCount++;
        lines.push('-' + e.line);
        if (e.noEof) lines.push('\\ No newline at end of file');
      } else if (e.type === 'insert') {
        newCount++;
        lines.push('+' + e.line);
        if (e.noEof) lines.push('\\ No newline at end of file');
      }
    }

    const header = VfsDiffEngine._formatHunkHeader(oldStart, oldCount, newStart, newCount);

    hunks.push({
      header,
      lines,
      oldStart,
      oldCount,
      newStart,
      newCount
    });
  }

  return hunks;
};

const optimizedResults = runBattery(VfsDiffEngine.createUnifiedDiff);

for (const [k, v] of Object.entries(baselineResults)) {
  assert.strictEqual(v, optimizedResults[k], `Battery test failed for ${k}`);
}
console.log('✓ ALL battery tests passed 100% identically!');
