'use strict';
const assert = require('assert');
const VfsDiffEngine = require('./prototype_diff');

console.log('--- Running VfsDiffEngine Prototype Verification Tests ---');

// Test 1: Single file modification
{
  const textA = 'line 1\nline 2\nline 3\nline 4\nline 5';
  const textB = 'line 1\nline 2 (modified)\nline 3\nline 4\nline 5';
  const patch = VfsDiffEngine.createPatch('app.js', 'app.js', textA, textB);
  console.log('[Test 1 Patch]:\n' + patch);
  assert(patch.includes('--- a/app.js'));
  assert(patch.includes('+++ b/app.js'));
  assert(patch.includes('@@ -1,5 +1,5 @@'));
  assert(patch.includes('-line 2'));
  assert(patch.includes('+line 2 (modified)'));
  console.log('✓ Test 1 passed: Single file modification');
}

// Test 2: Added file (/dev/null -> b/file)
{
  const textB = 'first line\nsecond line\nthird line';
  const patch = VfsDiffEngine.createPatch('new.js', 'new.js', '', textB, { isAdded: true });
  console.log('[Test 2 Patch]:\n' + patch);
  assert(patch.includes('--- /dev/null'));
  assert(patch.includes('+++ b/new.js'));
  assert(patch.includes('@@ -0,0 +1,3 @@'));
  assert(patch.includes('+first line'));
  console.log('✓ Test 2 passed: Added file with /dev/null');
}

// Test 3: Deleted file (a/file -> /dev/null)
{
  const textA = 'first line\nsecond line';
  const patch = VfsDiffEngine.createPatch('old.js', 'old.js', textA, '', { isDeleted: true });
  console.log('[Test 3 Patch]:\n' + patch);
  assert(patch.includes('--- a/old.js'));
  assert(patch.includes('+++ /dev/null'));
  assert(patch.includes('@@ -1,2 +0,0 @@'));
  assert(patch.includes('-first line'));
  console.log('✓ Test 3 passed: Deleted file with /dev/null');
}

// Test 4: Vietnamese UTF-8 multi-byte characters
{
  const textA = 'Tiêu đề: Hệ thống Suna Agent\nTác vụ: Khởi tạo mô-đun\nTrạng thái: Đang xử lý\nKết quả: Thành công';
  const textB = 'Tiêu đề: Hệ thống Suna Agent Harness\nTác vụ: Khởi tạo mô-đun VfsDiffEngine\nTrạng thái: Hoàn tất 100%\nKết quả: Thành công mỹ mãn';
  const patch = VfsDiffEngine.createPatch('tieng_viet.txt', 'tieng_viet.txt', textA, textB);
  console.log('[Test 4 Patch]:\n' + patch);
  assert(patch.includes('--- a/tieng_viet.txt'));
  assert(patch.includes('+++ b/tieng_viet.txt'));
  assert(patch.includes('-Trạng thái: Đang xử lý'));
  assert(patch.includes('+Trạng thái: Hoàn tất 100%'));
  assert(patch.includes('+Kết quả: Thành công mỹ mãn'));
  console.log('✓ Test 4 passed: Vietnamese UTF-8 characters preserved');
}

// Test 5: Multiple hunks separated by > 6 context lines
{
  const linesA = [];
  for (let i = 1; i <= 30; i++) linesA.push(`Line ${i}`);
  const linesB = linesA.slice();
  linesB[2] = 'Line 3 MODIFIED';
  linesB[25] = 'Line 26 MODIFIED';

  const patch = VfsDiffEngine.createPatch('multi_hunk.txt', 'multi_hunk.txt', linesA.join('\n'), linesB.join('\n'));
  console.log('[Test 5 Patch]:\n' + patch);
  const hunkHeaders = patch.split('\n').filter(l => l.startsWith('@@'));
  assert.strictEqual(hunkHeaders.length, 2, 'Must have 2 separate hunks');
  console.log('✓ Test 5 passed: Multiple hunks correctly separated');
}

// Test 6: Snapshot comparison (added, modified, deleted)
{
  const snapA = {
    files: {
      'src/keep.js': { content: 'unchanged' },
      'src/modify.js': { content: 'old line' },
      'src/delete.js': { content: 'to delete' }
    }
  };
  const snapB = {
    files: {
      'src/keep.js': { content: 'unchanged' },
      'src/modify.js': { content: 'new line' },
      'src/added.js': { content: 'brand new file' }
    }
  };
  const comparison = VfsDiffEngine.compareSnapshots(snapA, snapB);
  console.log('[Test 6 Comparison]:', {
    filesChanged: comparison.filesChanged,
    insertions: comparison.insertions,
    deletions: comparison.deletions,
    files: comparison.files.map(f => ({ path: f.path, status: f.status }))
  });
  assert.strictEqual(comparison.filesChanged, 3);
  assert(comparison.files.some(f => f.path === 'src/added.js' && f.status === 'added'));
  assert(comparison.files.some(f => f.path === 'src/modify.js' && f.status === 'modified'));
  assert(comparison.files.some(f => f.path === 'src/delete.js' && f.status === 'deleted'));
  console.log('✓ Test 6 passed: compareSnapshots multi-file diff');
}

// Test 7: 10,000 lines performance stress test
{
  console.log('Starting 10,000 lines stress test...');
  const bigA = [];
  for (let i = 1; i <= 10000; i++) bigA.push(`const var_${i} = ${i};`);
  const bigB = bigA.slice();
  bigB[5000] = 'const var_5001 = "MODIFIED VALUE";';

  const t0 = Date.now();
  const patch = VfsDiffEngine.createPatch('big.js', 'big.js', bigA.join('\n'), bigB.join('\n'));
  const elapsed = Date.now() - t0;
  console.log(`10,000 lines diff computed in ${elapsed}ms`);
  assert(elapsed < 500, `Must execute under 500ms (took ${elapsed}ms)`);
  assert(patch.includes('+const var_5001 = "MODIFIED VALUE";'));
  assert(patch.includes('@@ -4998,7 +4998,7 @@'));
  console.log('✓ Test 7 passed: 10,000 lines diff completed in ' + elapsed + 'ms');
}

console.log('All 7 prototype verification tests PASSED successfully!');
