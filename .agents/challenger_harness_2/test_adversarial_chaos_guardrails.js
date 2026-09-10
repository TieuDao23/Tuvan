const assert = require('assert');
const {
  VfsSandbox,
  ChaosFaultInjector,
  RunawayGuardrails,
  CheckpointManager
} = require('../../suna_harness.js');

console.log('=== STARTING CHALLENGER 2: ADVERSARIAL CHAOS, GUARDRAILS & CHECKPOINT STRESS ===\n');

// 1. Cascading Chaos Faults & Handled Interceptions
console.log('1. Testing Cascading Chaos Faults & Exception Containment...');
const chaos = new ChaosFaultInjector();

// Rule 1: 429 Quota Exceeded on network tool
chaos.addRule({
  faultType: 'rate_limit',
  trigger: { toolName: 'fetch_remote_spec' }
});

// Rule 2: Network drop on sync
chaos.addRule({
  faultType: 'network_drop',
  trigger: { toolName: 'sync_workspace' }
});

// Rule 3: File locked on fs_write
chaos.addRule({
  faultType: 'file_locked',
  trigger: { toolName: 'fs_write' }
});

(async () => {
  // 1a. Rate limit returns structured 429
  const res429 = await chaos.interceptToolExecution('fetch_remote_spec', {}, {}, () => ({ status: 200 }));
  assert.strictEqual(res429.status, 429);
  assert.strictEqual(res429.headers['Retry-After'], '2');
  assert.ok(res429.body.error.includes('Quota exceeded'));

  // 1b. Network drop throws catchable TypeError
  let networkCaught = false;
  try {
    await chaos.interceptToolExecution('sync_workspace', {}, {}, () => ({ ok: true }));
  } catch (err) {
    networkCaught = true;
    assert.strictEqual(err.name, 'TypeError');
    assert.ok(err.message.includes('connection dropped'));
  }
  assert.strictEqual(networkCaught, true);

  // 1c. File locked throws catchable EBUSY
  let lockCaught = false;
  try {
    await chaos.interceptToolExecution('fs_write', {}, {}, () => ({ ok: true }));
  } catch (err) {
    lockCaught = true;
    assert.ok(err.message.includes('EBUSY'));
  }
  assert.strictEqual(lockCaught, true);

  console.log('   ✓ Chaos faults cleanly intercepted with structured codes and zero uncaught rejections.\n');

  // 2. Ping-pong (Period-2) and Period-3 Cyclic Loop Traps
  console.log('2. Testing Ping-Pong and Period-3 Loop Detection...');
  const guard = new RunawayGuardrails();

  // Test Ping-Pong: A -> B -> A -> B
  guard.recordAction('tool_read', { file: 'a.js' });
  guard.recordAction('tool_read', { file: 'b.js' });
  guard.recordAction('tool_read', { file: 'a.js' });
  const pingPongRes = guard.recordAction('tool_read', { file: 'b.js' });
  assert.strictEqual(pingPongRes.halted, true);
  assert.strictEqual(pingPongRes.triggered, true);
  assert.ok(pingPongRes.reason.includes('Ping-pong cycle detected'));

  // Test Period-3: A -> B -> C -> A -> B -> C
  const guard3 = new RunawayGuardrails();
  guard3.recordAction('tool_a', { p: 1 });
  guard3.recordAction('tool_b', { p: 2 });
  guard3.recordAction('tool_c', { p: 3 });
  guard3.recordAction('tool_a', { p: 1 });
  guard3.recordAction('tool_b', { p: 2 });
  const period3Res = guard3.recordAction('tool_c', { p: 3 });
  assert.strictEqual(period3Res.halted, true);
  assert.strictEqual(period3Res.triggered, true);
  assert.ok(period3Res.reason.includes('Period-3 cyclic loop detected'));

  console.log('   ✓ Ping-pong (period-2) and cyclic (period-3) runaway loops accurately trapped.\n');

  // 3. Semantic Zero-Progress Stagnation Trap
  console.log('3. Testing Semantic Zero-Progress Trap...');
  const vfs = new VfsSandbox();
  vfs.writeFile('/main.js', 'console.log("hello");');
  const guardStagnant = new RunawayGuardrails({ vfs, zeroProgressTurnLimit: 3 });

  // Turn 1: Initial state recorded
  const t1 = guardStagnant.recordTurnModification(vfs);
  assert.strictEqual(t1.halted, false);

  // Turn 2: Stagnant (no modification to /main.js)
  const t2 = guardStagnant.recordTurnModification(vfs);
  assert.strictEqual(t2.halted, false);

  // Turn 3: 3rd consecutive stagnant turn -> halts execution!
  const t3 = guardStagnant.recordTurnModification(vfs);
  assert.strictEqual(t3.halted, true);
  assert.strictEqual(t3.triggered, true);
  assert.ok(t3.reason.includes('Zero progress: VFS state is stagnant'));

  console.log('   ✓ Stagnant zero-progress loop trapped on 3rd identical state turn.\n');

  // 4. Rapid Checkpoint Snapshot, Deep Freeze & Rewind/Replay
  console.log('4. Testing Rapid Checkpoint Creation, Deep Freeze & Rewind...');
  const checkVfs = new VfsSandbox();
  const chkMgr = new CheckpointManager(checkVfs);

  for (let i = 1; i <= 10; i++) {
    checkVfs.writeFile(`/step_${i}.txt`, `Data at step ${i}`);
    chkMgr.saveCheckpoint(i, { stepNotes: `Step ${i} complete` });
  }

  // Verify checkpoint 4 is frozen
  const chk4 = chkMgr.getCheckpoint(4);
  assert.strictEqual(Object.isFrozen(chk4), true);
  assert.strictEqual(chk4.step_index, 4);

  // Verify VFS currently has all 10 files
  assert.strictEqual(checkVfs.exists('/step_10.txt'), true);

  // Rewind to step 4
  chkMgr.rewind(4);

  // Verify state at step 4
  assert.strictEqual(checkVfs.exists('/step_4.txt'), true);
  assert.strictEqual(checkVfs.exists('/step_5.txt'), false);
  assert.strictEqual(checkVfs.exists('/step_10.txt'), false);
  assert.strictEqual(checkVfs.readFile('/step_4.txt'), 'Data at step 4');

  // Verify forward checkpoints pruned
  assert.strictEqual(chkMgr.getCheckpoint(5), null);
  assert.strictEqual(chkMgr.getCheckpoint(10), null);
  assert.notStrictEqual(chkMgr.getCheckpoint(4), null);

  console.log('   ✓ Checkpoint rewind restores exact VFS state and prunes future branches.\n');

  console.log('=== ALL CHALLENGER 2 ADVERSARIAL STRESS TESTS PASSED (4/4) ===');
})().catch(err => {
  console.error('Challenger 2 Test Failed:', err);
  process.exit(1);
});
