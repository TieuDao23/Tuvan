'use strict';

class VfsDiffEngine {
  /**
   * Generates a standard Git unified diff between two text strings.
   */
  static createPatch(filePathA, filePathB, textA, textB, options = {}) {
    const contextLines = typeof options.contextLines === 'number' ? options.contextLines : 3;
    const isAdded = Boolean(options.isAdded);
    const isDeleted = Boolean(options.isDeleted);
    const normalizeUnicode = options.normalizeUnicode !== false;
    const stripTrailingCr = options.stripTrailingCr !== false;

    let a = textA !== undefined && textA !== null ? String(textA) : '';
    let b = textB !== undefined && textB !== null ? String(textB) : '';

    if (normalizeUnicode) {
      if (typeof a.normalize === 'function') a = a.normalize('NFC');
      if (typeof b.normalize === 'function') b = b.normalize('NFC');
    }
    if (stripTrailingCr) {
      a = a.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      b = b.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    if (!isAdded && !isDeleted && a === b) {
      return '';
    }

    const cleanPathA = (filePathA || 'file').replace(/^(\.\/|\/)/, '');
    const cleanPathB = (filePathB || 'file').replace(/^(\.\/|\/)/, '');

    const oldHeaderPath = isAdded ? '/dev/null' : (options.oldHeader || `a/${cleanPathA}`);
    const newHeaderPath = isDeleted ? '/dev/null' : (options.newHeader || `b/${cleanPathB}`);

    const linesA = a === '' && isAdded ? [] : (a === '' ? [] : a.split('\n'));
    const linesB = b === '' && isDeleted ? [] : (b === '' ? [] : b.split('\n'));

    // Special cases: Empty to content (added file) or content to empty (deleted file)
    if (isAdded || linesA.length === 0) {
      const hunkLines = linesB.map(l => '+' + l);
      const header = `@@ -0,0 +1,${linesB.length} @@`;
      return `--- ${oldHeaderPath}\n+++ ${newHeaderPath}\n${header}\n${hunkLines.join('\n')}\n`;
    }

    if (isDeleted || linesB.length === 0) {
      const hunkLines = linesA.map(l => '-' + l);
      const header = `@@ -1,${linesA.length} +0,0 @@`;
      return `--- ${oldHeaderPath}\n+++ ${newHeaderPath}\n${header}\n${hunkLines.join('\n')}\n`;
    }

    const edits = VfsDiffEngine._computeEdits(linesA, linesB);
    const hunks = VfsDiffEngine._groupHunks(edits, contextLines);

    if (hunks.length === 0) {
      return '';
    }

    let out = `--- ${oldHeaderPath}\n+++ ${newHeaderPath}\n`;
    for (const hunk of hunks) {
      out += hunk.header + '\n';
      out += hunk.lines.join('\n') + '\n';
    }
    return out;
  }

  /**
   * Compares two VFS snapshots and produces a multi-file unified diff and summary.
   */
  static compareSnapshots(snapshotA, snapshotB, options = {}) {
    const filesA = (snapshotA && snapshotA.files) ? snapshotA.files : {};
    const filesB = (snapshotB && snapshotB.files) ? snapshotB.files : {};

    const getFileContent = (filesObj, path) => {
      if (!filesObj) return null;
      if (filesObj instanceof Map) {
        const node = filesObj.get(path);
        return node ? (node.content !== undefined ? node.content : null) : null;
      }
      const node = filesObj[path];
      return node ? (node.content !== undefined ? node.content : null) : null;
    };

    const getKeys = (filesObj) => {
      if (!filesObj) return [];
      if (filesObj instanceof Map) return Array.from(filesObj.keys());
      return Object.keys(filesObj);
    };

    const allPaths = Array.from(new Set([...getKeys(filesA), ...getKeys(filesB)])).sort();

    const result = {
      patch: '',
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      files: []
    };

    const patchParts = [];

    for (const p of allPaths) {
      const contentA = getFileContent(filesA, p);
      const contentB = getFileContent(filesB, p);

      const existsA = contentA !== null;
      const existsB = contentB !== null;

      if (!existsA && existsB) {
        // Added file
        const filePatch = VfsDiffEngine.createPatch(p, p, '', contentB, Object.assign({}, options, { isAdded: true }));
        const linesB = contentB === '' ? 0 : contentB.replace(/\r\n/g, '\n').split('\n').length;
        result.filesChanged++;
        result.insertions += linesB;
        patchParts.push(filePatch);
        result.files.push({
          path: p,
          status: 'added',
          oldPath: '/dev/null',
          newPath: `b/${p.replace(/^(\.\/|\/)/, '')}`,
          insertions: linesB,
          deletions: 0,
          patch: filePatch
        });
      } else if (existsA && !existsB) {
        // Deleted file
        const filePatch = VfsDiffEngine.createPatch(p, p, contentA, '', Object.assign({}, options, { isDeleted: true }));
        const linesA = contentA === '' ? 0 : contentA.replace(/\r\n/g, '\n').split('\n').length;
        result.filesChanged++;
        result.deletions += linesA;
        patchParts.push(filePatch);
        result.files.push({
          path: p,
          status: 'deleted',
          oldPath: `a/${p.replace(/^(\.\/|\/)/, '')}`,
          newPath: '/dev/null',
          insertions: 0,
          deletions: linesA,
          patch: filePatch
        });
      } else if (existsA && existsB) {
        if (contentA !== contentB) {
          // Modified file
          const filePatch = VfsDiffEngine.createPatch(p, p, contentA, contentB, options);
          if (filePatch) {
            result.filesChanged++;
            let fileIns = 0;
            let fileDel = 0;
            const hunkLines = filePatch.split('\n');
            for (const hl of hunkLines) {
              if (hl.startsWith('+') && !hl.startsWith('+++')) fileIns++;
              else if (hl.startsWith('-') && !hl.startsWith('---')) fileDel++;
            }
            result.insertions += fileIns;
            result.deletions += fileDel;
            patchParts.push(filePatch);
            result.files.push({
              path: p,
              status: 'modified',
              oldPath: `a/${p.replace(/^(\.\/|\/)/, '')}`,
              newPath: `b/${p.replace(/^(\.\/|\/)/, '')}`,
              insertions: fileIns,
              deletions: fileDel,
              patch: filePatch
            });
          }
        } else if (options.includeUnchanged) {
          result.files.push({
            path: p,
            status: 'unchanged',
            oldPath: `a/${p.replace(/^(\.\/|\/)/, '')}`,
            newPath: `b/${p.replace(/^(\.\/|\/)/, '')}`,
            insertions: 0,
            deletions: 0,
            patch: ''
          });
        }
      }
    }

    result.patch = patchParts.join('\n');
    return result;
  }

  /**
   * Previews what a replace_file_content operation would look like as a Git patch.
   */
  static previewReplaceDiff(vfs, targetFile, targetContent, replacementContent, options = {}) {
    if (!vfs) throw new Error('VfsDiffEngine.previewReplaceDiff: vfs instance is required');
    try {
      const oldContent = vfs.readFile(targetFile);
      if (!oldContent.includes(targetContent)) {
        return {
          wouldSucceed: false,
          reason: `Target content not found in "${targetFile}"`,
          patch: ''
        };
      }
      let newContent;
      if (options.allowMultiple) {
        newContent = oldContent.split(targetContent).join(replacementContent !== undefined ? replacementContent : '');
      } else {
        newContent = oldContent.replace(targetContent, replacementContent !== undefined ? replacementContent : '');
      }
      const patch = VfsDiffEngine.createPatch(targetFile, targetFile, oldContent, newContent, options);
      return {
        wouldSucceed: true,
        patch,
        oldContent,
        newContent
      };
    } catch (err) {
      return {
        wouldSucceed: false,
        reason: err.message,
        patch: ''
      };
    }
  }

  /**
   * Internal Myers Diff with prefix/suffix trimming.
   */
  static _computeEdits(linesA, linesB) {
    const N = linesA.length;
    const M = linesB.length;

    // 1. Common prefix trimming
    let start = 0;
    while (start < N && start < M && linesA[start] === linesB[start]) {
      start++;
    }

    // 2. Common suffix trimming
    let endA = N - 1;
    let endB = M - 1;
    while (endA >= start && endB >= start && linesA[endA] === linesB[endB]) {
      endA--;
      endB--;
    }

    const prefixEdits = [];
    for (let i = 0; i < start; i++) {
      prefixEdits.push({ type: 'equal', line: linesA[i] });
    }

    const suffixEdits = [];
    for (let i = endA + 1; i < N; i++) {
      suffixEdits.push({ type: 'equal', line: linesA[i] });
    }

    const midA = linesA.slice(start, endA + 1);
    const midB = linesB.slice(start, endB + 1);

    let midEdits = [];
    if (midA.length > 0 || midB.length > 0) {
      midEdits = VfsDiffEngine._myersRaw(midA, midB);
    }

    return prefixEdits.concat(midEdits, suffixEdits);
  }

  /**
   * Raw Myers diff implementation on array slices.
   */
  static _myersRaw(a, b) {
    const n = a.length;
    const m = b.length;
    const max = n + m;

    // Fast path: all deleted or all added
    if (n === 0) {
      return b.map(line => ({ type: 'insert', line }));
    }
    if (m === 0) {
      return a.map(line => ({ type: 'delete', line }));
    }

    // Safety fallback for extremely large differences with zero commonalities
    if (max > 20000) {
      const del = a.map(line => ({ type: 'delete', line }));
      const ins = b.map(line => ({ type: 'insert', line }));
      return del.concat(ins);
    }

    const offset = max;
    const v = new Int32Array(2 * max + 1);
    v[offset + 1] = 0;

    const trace = [];

    for (let d = 0; d <= max; d++) {
      const vCopy = new Int32Array(v);
      trace.push(vCopy);

      for (let k = -d; k <= d; k += 2) {
        let x;
        const kIdx = offset + k;
        if (k === -d || (k !== d && v[kIdx - 1] < v[kIdx + 1])) {
          x = v[kIdx + 1]; // insert (down)
        } else {
          x = v[kIdx - 1] + 1; // delete (right)
        }
        let y = x - k;

        while (x < n && y < m && a[x] === b[y]) {
          x++;
          y++;
        }
        v[kIdx] = x;

        if (x >= n && y >= m) {
          // Backtrack
          return VfsDiffEngine._backtrack(trace, a, b, d, offset);
        }
      }
    }

    // Fallback if loop finishes without match
    const del = a.map(line => ({ type: 'delete', line }));
    const ins = b.map(line => ({ type: 'insert', line }));
    return del.concat(ins);
  }

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
        edits.unshift({ type: 'equal', line: a[x - 1] });
        x--;
        y--;
      }

      if (step > 0) {
        if (x === prevX) {
          edits.unshift({ type: 'insert', line: b[prevY] });
          y--;
        } else if (y === prevY) {
          edits.unshift({ type: 'delete', line: a[prevX] });
          x--;
        }
      }
    }
    return edits;
  }

  /**
   * Groups change edits into unified hunks separated by context lines.
   */
  static _groupHunks(edits, contextLines = 3) {
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

    // Coalesce blocks separated by <= 2 * contextLines
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

    // For each group, construct the hunk with context
    for (const group of groups) {
      const firstBlock = group[0];
      const lastBlock = group[group.length - 1];

      const hunkStart = Math.max(0, firstBlock.start - contextLines);
      const hunkEnd = Math.min(edits.length - 1, lastBlock.end + contextLines);

      // Compute 1-indexed oldStart and newStart
      let oldStart = 1;
      let newStart = 1;
      for (let j = 0; j < hunkStart; j++) {
        if (edits[j].type === 'equal' || edits[j].type === 'delete') {
          oldStart++;
        }
        if (edits[j].type === 'equal' || edits[j].type === 'insert') {
          newStart++;
        }
      }

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
        } else if (e.type === 'insert') {
          newCount++;
          lines.push('+' + e.line);
        }
      }

      const oldPart = oldCount === 1 ? `-${oldStart}` : `-${oldStart},${oldCount}`;
      const newPart = newCount === 1 ? `+${newStart}` : `+${newStart},${newCount}`;
      const header = `@@ ${oldPart} ${newPart} @@`;

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
}

if (typeof module !== 'undefined') {
  module.exports = VfsDiffEngine;
}
