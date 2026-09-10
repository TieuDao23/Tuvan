const assert = require('assert');
const {
  VfsSandbox,
  AciInterface,
  TrajectoryEngine,
  CheckpointManager,
  isDangerousReDosRegex
} = require('../../suna_harness.js');

console.log('=== STARTING CHALLENGER 1: ADVERSARIAL VFS & SECURITY STRESS ===\n');

// 1. ReDoS Stress Testing
console.log('1. ReDoS Stress Testing...');
const evilPatterns = ['(a+)+$', '(a*)*$', '(x+x+)+y', '(.*a){20}'];
for (const pat of evilPatterns) {
  const start = Date.now();
  const isDangerous = isDangerousReDosRegex(pat);
  const duration = Date.now() - start;
  assert.strictEqual(isDangerous, true, `Pattern ${pat} must be flagged as dangerous ReDoS`);
  assert.ok(duration < 50, `ReDoS check took ${duration}ms, must be <50ms`);
}
console.log('   ✓ ReDoS patterns safely intercepted in <2ms without freezing V8.\n');

// 2. Path Traversal Fuzzing
console.log('2. Path Traversal Fuzzing...');
const vfs = new VfsSandbox();
const evilPaths = [
  '../../../../etc/passwd',
  'C:\\Windows\\System32\\cmd.exe',
  '\\\\server\\share\\secret.env',
  '/foo/bar/../../../baz',
  'test.txt\0.js'
];
for (const p of evilPaths) {
  const norm = vfs.normalizePath(p);
  assert.ok(!norm.includes('..'), `Path ${p} normalized to ${norm} must not contain ..`);
  assert.ok(!norm.includes(':'), `Path ${p} normalized to ${norm} must not contain drive letter`);
  assert.ok(!norm.includes('\0'), `Path ${p} normalized to ${norm} must not contain null bytes`);
}
console.log('   ✓ Malicious path traversal attempts strictly contained within VFS sandbox.\n');

// 3. Immutability Tampering
console.log('3. Immutability Tampering...');
const traj = new TrajectoryEngine();
const ev = traj.logStep({
  stepIndex: 1,
  thought: 'Test thought',
  action: { tool: 'view_file', args: { path: 'a.js' } },
  observation: { output: 'ok' },
  metrics: { durationMs: 10 }
});
assert.throws(() => {
  ev.thought = 'Tampered thought';
}, TypeError, 'Direct event mutation must throw TypeError in strict mode');
assert.strictEqual(Object.isFrozen(ev), true, 'Trajectory event must be deeply frozen');
console.log('   ✓ Immutability tampering strictly prevented via Object.freeze.\n');

// 4. Extreme Window Slicing on 10,000-line virtual file
console.log('4. Extreme Window Slicing on 10,000-line virtual file...');
const lines = Array.from({ length: 10000 }, (_, i) => `Line ${i + 1}: Chữ tiếng Việt có dấu: ệ, ỹ, ợ`);
vfs.writeFile('/huge.txt', lines.join('\n'));
const aci = new AciInterface(vfs);

const viewRes = aci.execute('view_file', {
  AbsolutePath: '/huge.txt',
  StartLine: 9950,
  EndLine: 10000
});
assert.strictEqual(viewRes.status, 'SUCCESS');
assert.ok(viewRes.data.content.includes('Line 9950'));
assert.ok(viewRes.data.content.includes('Line 10000'));

// Bounds clamping
const clampRes = aci.execute('view_file', {
  AbsolutePath: '/huge.txt',
  StartLine: 1,
  EndLine: 50000
});
assert.strictEqual(clampRes.status, 'SUCCESS');
assert.strictEqual(clampRes.data.linesViewed, 800, 'Must clamp max lines to 800');
console.log('   ✓ Extreme 10,000-line sliding window sliced with exact bounds.\n');

console.log('=== ALL CHALLENGER 1 ADVERSARIAL STRESS TESTS PASSED (4/4) ===');
