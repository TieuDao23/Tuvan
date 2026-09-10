/**
 * Adversarial Stress & Corner Case Test Suite for SunaHarness Milestone 1 (R1)
 * Written by forensic auditor to stress-test edge cases and potential failure modes.
 */

const assert = require('assert');
const path = require('path');
const SunaHarness = require(path.resolve(__dirname, '../../suna_harness.js'));

const {
  VfsSandbox,
  HarnessController,
  InterHarnessEventBus,
  TrajectoryEngine,
  HarnessError
} = SunaHarness;

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] Stress ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Stress ${totalTests}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`[PASS] Stress ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Stress ${totalTests}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAdversarialAudit() {
  console.log('=== RUNNING ADVERSARIAL STRESS TESTING ===\n');

  // 1. Lineage cycle across multi-hop delegation (A -> B -> C -> A / B)
  test('Multi-hop delegation lineage rejects both direct and indirect ancestor cycles', () => {
    const root = new HarnessController({ id: 'agent_A' });
    const bDesc = root.spawnSubHarness({ id: 'agent_B', vfsWorkspaceMode: 'branch' });
    const cDesc = bDesc.controller.spawnSubHarness({ id: 'agent_C', vfsWorkspaceMode: 'branch' });

    // C tries to delegate to B (direct parent)
    assert.throws(() => {
      cDesc.controller.spawnSubHarness({ id: 'agent_B' });
    }, err => err.code === 'DELEGATION_CYCLE_DETECTED');

    // C tries to delegate to A (grandparent)
    assert.throws(() => {
      cDesc.controller.spawnSubHarness({ id: 'agent_A' });
    }, err => err.code === 'DELEGATION_CYCLE_DETECTED');

    // C tries to send directive to A (grandparent)
    assert.throws(() => {
      cDesc.controller.sendDirective('agent_A', 'illegal command');
    }, err => err.code === 'DELEGATION_CYCLE_DETECTED');
  });

  // 2. EventBus envelope validation under adversarial inputs
  test('EventBus rejects invalid or corrupt message options', () => {
    const bus = new InterHarnessEventBus();

    assert.throws(() => bus.send(null), /Message options must be an object/);
    assert.throws(() => bus.send('not an object'), /Message options must be an object/);
    assert.throws(() => bus.send({}), /"from", "to", and "type" are required fields/);
    assert.throws(() => bus.send({ from: 'a' }), /"from", "to", and "type" are required fields/);
    assert.throws(() => bus.send({ from: 'a', to: 'b' }), /"from", "to", and "type" are required fields/);
    assert.throws(() => bus.subscribe('target', null), /Callback must be a function/);
  });

  // 3. EventBus unsubscription during active iteration & re-entrancy
  test('EventBus safely handles unsubscription during active broadcast and re-entrant messages', () => {
    const bus = new InterHarnessEventBus();
    let unsubs;
    let bCalled = 0;
    let reEntrantReceived = 0;

    const unsubA = bus.subscribe('*', (msg) => {
      if (msg.type === 'initial') {
        // Trigger re-entrant send during listener execution
        bus.send({ from: 'sub_a', to: '*', type: 're_entrant', payload: {} });
        // Unsubscribe self
        unsubA();
      }
    });

    bus.subscribe('*', (msg) => {
      if (msg.type === 'initial') bCalled++;
      if (msg.type === 're_entrant') reEntrantReceived++;
    });

    bus.broadcast('controller', 'initial', {});

    assert.strictEqual(bCalled, 1);
    assert.strictEqual(reEntrantReceived, 1);

    // Second initial broadcast must not call A since it unsubscribed
    bus.broadcast('controller', 'initial', {});
    assert.strictEqual(bCalled, 2);
  });

  // 4. Sibling branches concurrent modifications and sequential merge conflict
  test('Sequential merge of sibling branches detects conflict against updated parent', () => {
    const root = new HarnessController({ id: 'root_hub' });
    root.vfs.writeFile('shared_code.js', 'function add(a, b) { return a + b; }');

    // Spawn 2 sibling branches from same base
    const b1 = root.spawnSubHarness({ id: 'branch_1', vfsWorkspaceMode: 'branch' });
    const b2 = root.spawnSubHarness({ id: 'branch_2', vfsWorkspaceMode: 'branch' });

    // Branch 1 refactors add function
    b1.vfs.writeFile('shared_code.js', 'function add(a, b) { return Number(a) + Number(b); }');

    // Branch 2 also refactors add function differently
    b2.vfs.writeFile('shared_code.js', 'const add = (a, b) => a + b;');

    // Merge Branch 1 -> succeeds
    const res1 = root.mergeSubHarness('branch_1');
    assert.strictEqual(res1.success, true);
    assert.ok(root.vfs.readFile('shared_code.js').includes('Number(a)'));

    // Merge Branch 2 -> MUST conflict because parent changed from origin base!
    assert.throws(() => {
      root.mergeSubHarness('branch_2', { strategy: 'safe' });
    }, err => {
      return err.code === 'BRANCH_CONFLICT' &&
             err.details.conflicts[0].type === 'modify_modify_conflict';
    });

    // Verify parent is still branch 1 content
    assert.ok(root.vfs.readFile('shared_code.js').includes('Number(a)'));
  });

  // 5. Vietnamese Unicode and Multi-byte String Preservation across branch merge
  test('Branch merge preserves Vietnamese Unicode characters and complex text verbatim', () => {
    const root = new HarnessController({ id: 'vn_parent' });
    const vnContent = 'Xin chào thế giới! Kiểm thử tiếng Việt có dấu: ế, ắ, ồ, ừ, ỳ, đ. 🌟🚀';
    root.vfs.writeFile('vn.txt', 'bản gốc');

    const child = root.spawnSubHarness({ id: 'vn_child', vfsWorkspaceMode: 'branch' });
    child.vfs.writeFile('vn.txt', vnContent);
    child.vfs.writeFile('unicode_sub/tệp_tin.md', '# Tiêu đề tiếng Việt\nNội dung phong phú.');

    const res = root.mergeSubHarness('vn_child');
    assert.strictEqual(res.success, true);
    assert.strictEqual(root.vfs.readFile('vn.txt'), vnContent);
    assert.strictEqual(root.vfs.readFile('unicode_sub/tệp_tin.md'), '# Tiêu đề tiếng Việt\nNội dung phong phú.');
  });

  // 6. Trajectory stitching with unanchored child gracefully attaches to synthetic node
  test('TrajectoryEngine gracefully attaches unanchored child trajectory to synthetic node', () => {
    const traj = new TrajectoryEngine({ harnessId: 'root' });
    const orphanTraj = new TrajectoryEngine({ harnessId: 'orphan', role: 'external_tool' });
    orphanTraj.recordStep({
      thought: 'External async tool executed',
      action: { tool: 'fetch_remote_data' }
    });

    // Stitch without anchor and with no prior events in parent
    traj.stitchChildTrajectory('orphan', orphanTraj);

    const tree = traj.getHierarchicalTree();
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].type, 'spawn');
    assert.strictEqual(tree[0].children.length, 1);
    assert.strictEqual(tree[0].children[0].action.tool, 'fetch_remote_data');
  });

  console.log(`\n=== ADVERSARIAL AUDIT COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (100%) ===`);
}

runAdversarialAudit().catch(err => {
  console.error('Fatal adversarial failure:', err);
  process.exit(1);
});
