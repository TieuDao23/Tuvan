const { VfsSandbox, HarnessController } = require('../../suna_harness.js');

console.log('--- Memory Leak & Lifecycle Verification ---');

// Simulate 50 iterative sessions of creating a HarnessController,
// writing 100 files, branching, creating checkpoints, and destroying.
function runSession(sessionIndex) {
  const sandbox = new VfsSandbox();
  for (let i = 0; i < 50; i++) {
    sandbox.writeFile(`src/module_${i}.js`, `// Module ${i}\nexport function run() { return ${i} * 42; }\n` + '/* data */ '.repeat(50));
  }
  
  // Create a branch
  const branch = sandbox.branch();
  branch.writeFile('src/module_0.js', '// Modified module 0\nexport function run() { return 999; }');
  branch.writeFile('src/new_file.js', '// Brand new file');
  
  // Get diff
  const diff = sandbox.getWorkspaceDiff(branch);
  
  // Now imagine resetting/destroying:
  // With CURRENT code: no destroy() exists on VfsSandbox!
  return { sandbox, branch, diffLen: diff.patch.length };
}

// Baseline heap
if (global.gc) global.gc();
const baseHeap = process.memoryUsage().heapUsed;

const sessions = [];
for (let s = 0; s < 20; s++) {
  const res = runSession(s);
  // If we hold onto instances or they leak into global State:
  // res.sandbox has no destroy() method
  sessions.push(res);
}

const peakHeap = process.memoryUsage().heapUsed;
console.log(`Peak heap with 20 uncleaned sessions: ${((peakHeap - baseHeap) / 1024 / 1024).toFixed(2)} MB`);

// Now let's simulate calling a proper destroy() method:
for (const s of sessions) {
  s.sandbox.files.clear();
  s.sandbox.directories.clear();
  s.sandbox.listeners.clear();
  if (s.sandbox._branchLedger) {
    s.sandbox._branchLedger.added.clear();
    s.sandbox._branchLedger.modified.clear();
    s.sandbox._branchLedger.deleted.clear();
  }
  s.branch.files.clear();
  s.branch.directories.clear();
  s.branch.listeners.clear();
  s.branch._branchOriginSnapshot = null;
  s.branch._branchParentVfs = null;
}
sessions.length = 0;

if (global.gc) global.gc();
const afterCleanHeap = process.memoryUsage().heapUsed;
console.log(`Heap after manual disposal: ${((afterCleanHeap - baseHeap) / 1024 / 1024).toFixed(2)} MB`);
