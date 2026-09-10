const assert = require('assert');
const { VfsDiffEngine } = require('../../suna_harness.js');

function groupHunksOpt(edits, contextLines = 3) {
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
}

// Test on multiple diffs
const count = 12000;
const baseLines = Array.from({ length: count }, (_, i) => `function fn_${i}() { return ${i}; }`);
const oldText = baseLines.join('\n') + '\n';
const modLines = baseLines.slice();
for (let step = 1000; step < 11000; step += 700) {
  modLines[step] = `function fn_${step}() { return 'PATCHED_${step}'; }`;
}
const newText = modLines.join('\n') + '\n';

const origGroup = VfsDiffEngine._groupHunks;
const patchOrig = VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });

VfsDiffEngine._groupHunks = groupHunksOpt;
const patchOpt = VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });
VfsDiffEngine._groupHunks = origGroup;

assert.strictEqual(patchOrig, patchOpt, 'groupHunksOpt must produce identical diffs!');
console.log('✓ groupHunksOpt verified: 100% IDENTICAL output!');
