const { VfsDiffEngine } = require('../../suna_harness.js');

// Apply backtrack optimization
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

// Apply groupHunks linear scan optimization
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

// Now run the full mocha test suite for test_challenger_m2_vfs_diff_adversarial.js
console.log('Optimizations hooked. Running test suite via Mocha programmatically...');
const Mocha = require('mocha');
const mocha = new Mocha();
mocha.addFile('tests/test_challenger_m2_vfs_diff_adversarial.js');
mocha.run(failures => {
  console.log('Mocha run finished with failures:', failures);
  process.exit(failures ? 1 : 0);
});
