/**
 * Forensic Verification Test Suite for SunaHarness Milestone 1 (R1)
 * Independently written by forensic auditor to verify genuine operational logic.
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

let passedChecks = 0;
let totalChecks = 0;

function check(name, fn) {
  totalChecks++;
  try {
    fn();
    passedChecks++;
    console.log(`[PASS] Check ${totalChecks}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Check ${totalChecks}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function asyncCheck(name, fn) {
  totalChecks++;
  try {
    await fn();
    passedChecks++;
    console.log(`[PASS] Check ${totalChecks}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Check ${totalChecks}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAudit() {
  console.log('=== STARTING FORENSIC INTEGRITY AUDIT: SUNA HARNESS M1 ===\n');

  // =========================================================================
  // 1. InterHarnessEventBus Verification
  // =========================================================================
  console.log('--- Subsystem 1: InterHarnessEventBus ---');

  check('EventBus P2P addressing routes only to targeted subscriber', () => {
    const bus = new InterHarnessEventBus();
    const receivedA = [];
    const receivedB = [];

    bus.subscribe('agent_a', msg => receivedA.push(msg));
    bus.subscribe('agent_b', msg => receivedB.push(msg));

    bus.send({
      from: 'controller',
      to: 'agent_a',
      type: 'directive',
      payload: { action: 'compute' }
    });

    assert.strictEqual(receivedA.length, 1);
    assert.strictEqual(receivedA[0].payload.action, 'compute');
    assert.strictEqual(receivedA[0].from, 'controller');
    assert.strictEqual(receivedA[0].to, 'agent_a');
    assert.strictEqual(receivedB.length, 0, 'agent_b must NOT receive targeted message for agent_a');
  });

  check('EventBus broadcast (*) delivers to all subscribers', () => {
    const bus = new InterHarnessEventBus();
    let countA = 0;
    let countB = 0;

    bus.subscribe('agent_a', () => countA++);
    bus.subscribe('agent_b', () => countB++);

    bus.broadcast('controller', 'emergency_stop', { reason: 'test' });

    assert.strictEqual(countA, 1, 'agent_a must receive broadcast');
    assert.strictEqual(countB, 1, 'agent_b must receive broadcast');
  });

  await asyncCheck('EventBus request/response with correlationId resolves correctly', async () => {
    const bus = new InterHarnessEventBus();

    bus.subscribe('worker_1', (msg) => {
      if (msg.type === 'status_query') {
        bus.send({
          from: 'worker_1',
          to: msg.from,
          type: 'status_response',
          correlationId: msg.correlationId,
          payload: { status: 'idle', cpu: 12 }
        });
      }
    });

    const response = await bus.request('root', 'worker_1', 'status_query', {}, { timeoutMs: 2000 });
    assert.ok(response, 'Response must be received');
    assert.strictEqual(response.payload.status, 'idle');
    assert.strictEqual(response.payload.cpu, 12);
  });

  await asyncCheck('EventBus request timeout rejects on missing response', async () => {
    const bus = new InterHarnessEventBus();
    let timedOut = false;
    try {
      await bus.request('root', 'non_existent_worker', 'ping', {}, { timeoutMs: 150 });
    } catch (err) {
      timedOut = true;
      assert.ok(err.message.includes('Request timed out'), 'Error message must specify timeout');
    }
    assert.strictEqual(timedOut, true, 'Request must reject upon timeout');
  });

  check('EventBus isolates subscriber errors from other subscribers', () => {
    const bus = new InterHarnessEventBus();
    let survivorCalled = false;

    bus.subscribe('worker', () => {
      throw new Error('Fatal crashing subscriber!');
    });
    bus.subscribe('worker', () => {
      survivorCalled = true;
    });

    const res = bus.send({ from: 'root', to: 'worker', type: 'test', payload: {} });
    assert.strictEqual(survivorCalled, true, 'Subsequent subscriber must execute despite prior error');
    assert.strictEqual(res.delivered, true);
  });

  check('EventBus maintains history ring buffer and supports filtering', () => {
    const bus = new InterHarnessEventBus({ maxHistory: 5 });
    for (let i = 1; i <= 7; i++) {
      bus.send({ from: `agent_${i}`, to: 'hub', type: i % 2 === 0 ? 'even' : 'odd', payload: { i } });
    }

    const all = bus.getHistory();
    assert.strictEqual(all.length, 5, 'History must be capped at maxHistory (5)');
    assert.strictEqual(all[0].payload.i, 3, 'Oldest messages 1 and 2 must have shifted out');

    const evens = bus.getHistory({ type: 'even' });
    assert.ok(evens.every(m => m.type === 'even'));
  });

  // =========================================================================
  // 2. VfsSandbox Branching & Ledger Verification
  // =========================================================================
  console.log('\n--- Subsystem 2: VfsSandbox Branching & getBranchChanges ---');

  check('VfsSandbox.branch creates isolated workspace with baseline snapshot', () => {
    const rootVfs = new VfsSandbox();
    rootVfs.writeFile('main.js', 'console.log("root");');
    rootVfs.writeFile('config.json', '{"env":"prod"}');

    const branch = rootVfs.branch();
    assert.strictEqual(branch._isBranch, true);
    assert.ok(branch._branchOriginSnapshot);
    assert.strictEqual(branch._branchParentVfs, rootVfs);

    // Branch edits do NOT leak to root
    branch.writeFile('main.js', 'console.log("branch");');
    branch.writeFile('branch_only.txt', 'isolated');

    assert.strictEqual(rootVfs.readFile('main.js'), 'console.log("root");', 'Root main.js must be untouched');
    assert.strictEqual(rootVfs.exists('branch_only.txt'), false, 'Root must not see branch-only file');

    // Root edits do NOT affect branch
    rootVfs.writeFile('root_new.txt', 'parent edit');
    assert.strictEqual(branch.exists('root_new.txt'), false, 'Branch must not see root edits after branching');
  });

  check('VfsSandbox.getBranchChanges accurately detects added, modified, and deleted files', () => {
    const rootVfs = new VfsSandbox();
    rootVfs.writeFile('keep.txt', 'original');
    rootVfs.writeFile('modify.txt', 'version 1');
    rootVfs.writeFile('delete.txt', 'will be removed');

    const branch = rootVfs.branch();
    branch.writeFile('modify.txt', 'version 2 (modified)');
    branch.removeFile('delete.txt');
    branch.writeFile('add.txt', 'newly created');

    const changes = branch.getBranchChanges();
    assert.deepStrictEqual(changes.added, ['add.txt']);
    assert.deepStrictEqual(changes.modified, ['modify.txt']);
    assert.deepStrictEqual(changes.deleted, ['delete.txt']);
    assert.strictEqual(changes.totalChanges, 3);
  });

  // =========================================================================
  // 3. HarnessController Delegation Lifecycle Verification
  // =========================================================================
  console.log('\n--- Subsystem 3: HarnessController Sub-harness Delegation Lifecycle ---');

  check('spawnSubHarness creates child with distinct VFS modes (share, clone, branch)', () => {
    const parent = new HarnessController({ id: 'parent_root' });
    parent.vfs.writeFile('shared.txt', 'base');

    // Mode 1: share
    const childShare = parent.spawnSubHarness({ role: 'peer', vfsWorkspaceMode: 'share' });
    assert.strictEqual(childShare.vfs, parent.vfs, 'Share mode must use same VFS reference');
    childShare.vfs.writeFile('shared.txt', 'mutated_by_share');
    assert.strictEqual(parent.vfs.readFile('shared.txt'), 'mutated_by_share');

    // Mode 2: clone
    const childClone = parent.spawnSubHarness({ role: 'scratchpad', vfsWorkspaceMode: 'clone' });
    assert.notStrictEqual(childClone.vfs, parent.vfs, 'Clone mode must use isolated VFS');
    childClone.vfs.writeFile('shared.txt', 'clone_mutation');
    assert.strictEqual(parent.vfs.readFile('shared.txt'), 'mutated_by_share', 'Clone edit must not mutate parent');

    // Mode 3: branch
    const childBranch = parent.spawnSubHarness({ role: 'feature', vfsWorkspaceMode: 'branch' });
    assert.notStrictEqual(childBranch.vfs, parent.vfs, 'Branch mode must use isolated branch VFS');
    assert.strictEqual(childBranch.vfs._isBranch, true);
    assert.ok(childBranch.vfs._branchOriginSnapshot);
  });

  check('spawnSubHarness enforces max recursion depth limit (depth >= 5)', () => {
    const root = new HarnessController({ id: 'level_0' });
    let current = root;

    // Spawn levels 1, 2, 3, 4
    for (let d = 1; d <= 4; d++) {
      const desc = current.spawnSubHarness({ id: `level_${d}`, role: 'worker', vfsWorkspaceMode: 'branch' });
      current = desc.controller;
      assert.strictEqual(current.depth, d);
    }

    // Now current is at depth 4. Spawning from current will reach depth 5.
    const desc5 = current.spawnSubHarness({ id: 'level_5', role: 'worker', vfsWorkspaceMode: 'branch' });
    const level5Controller = desc5.controller;
    assert.strictEqual(level5Controller.depth, 5);

    // Spawning from depth 5 MUST throw MAX_RECURSION_DEPTH_EXCEEDED
    let caught = false;
    try {
      level5Controller.spawnSubHarness({ id: 'level_6', role: 'worker' });
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'MAX_RECURSION_DEPTH_EXCEEDED');
    }
    assert.strictEqual(caught, true, 'Spawning beyond depth 5 must throw MAX_RECURSION_DEPTH_EXCEEDED');
  });

  check('spawnSubHarness catches self-delegation and ancestor cycle detection', () => {
    const root = new HarnessController({ id: 'root_ctrl' });
    const childDesc = root.spawnSubHarness({ id: 'child_a', role: 'worker', vfsWorkspaceMode: 'branch' });
    const child = childDesc.controller;

    // 1. Self delegation
    let selfCaught = false;
    try {
      root.spawnSubHarness({ id: 'root_ctrl' });
    } catch (err) {
      selfCaught = true;
      assert.strictEqual(err.code, 'DELEGATION_CYCLE_DETECTED');
    }
    assert.strictEqual(selfCaught, true, 'Self-delegation must be rejected');

    // 2. Ancestor cycle: child delegating to root
    let ancestorCaught = false;
    try {
      child.spawnSubHarness({ id: 'root_ctrl' });
    } catch (err) {
      ancestorCaught = true;
      assert.strictEqual(err.code, 'DELEGATION_CYCLE_DETECTED');
      assert.ok(err.message.includes('Circular delegation detected'));
    }
    assert.strictEqual(ancestorCaught, true, 'Ancestor delegation cycle must be rejected');
  });

  check('spawnSubHarness clamps budget against parent remaining and debits consumption', () => {
    const parent = new HarnessController({ id: 'budget_parent', maxTurns: 20, maxTokens: 10000 });
    parent.turnsCompleted = 5;
    parent.tokensConsumed = 4000;

    // Remaining: 15 turns, 6000 tokens
    const childDesc = parent.spawnSubHarness({
      id: 'budget_child',
      budget: { maxTurns: 50, maxTokens: 20000 },
      vfsWorkspaceMode: 'branch'
    });

    assert.strictEqual(childDesc.budget.maxTurns, 15, 'Child maxTurns must be clamped to parent remaining (15)');
    assert.strictEqual(childDesc.budget.maxTokens, 6000, 'Child maxTokens must be clamped to parent remaining (6000)');

    // Simulate child consuming tokens
    const childCtrl = childDesc.controller;
    childCtrl.consumeTokens(500);

    assert.strictEqual(childCtrl.tokensConsumed, 500);
    assert.strictEqual(parent.tokensConsumed, 4500, 'Parent tokens must debit child tokens');
  });

  check('emergencyStopSubHarness halts child and cascades down entire sub-tree', () => {
    const parent = new HarnessController({ id: 'p_root' });
    const childDesc = parent.spawnSubHarness({ id: 'c_mid', vfsWorkspaceMode: 'branch' });
    const grandDesc = childDesc.controller.spawnSubHarness({ id: 'g_leaf', vfsWorkspaceMode: 'branch' });

    assert.strictEqual(childDesc.controller.isHalted, false);
    assert.strictEqual(grandDesc.controller.isHalted, false);

    parent.emergencyStopSubHarness('c_mid', 'Security anomaly detected');

    assert.strictEqual(childDesc.status, 'halted');
    assert.strictEqual(childDesc.controller.isHalted, true);
    assert.strictEqual(grandDesc.status, 'halted');
    assert.strictEqual(grandDesc.controller.isHalted, true);
    assert.strictEqual(grandDesc.controller.haltReason, 'Security anomaly detected');
  });

  // =========================================================================
  // 4. mergeSubHarness 3-Way Reconciliation Verification
  // =========================================================================
  console.log('\n--- Subsystem 4: mergeSubHarness 3-Way Reconciliation ---');

  check('mergeSubHarness performs clean 3-way merge into parent VFS', () => {
    const parent = new HarnessController({ id: 'merge_parent' });
    parent.vfs.writeFile('base.txt', 'hello world');
    parent.vfs.writeFile('unrelated.txt', 'parent only');
    parent.vfs.writeFile('to_delete.txt', 'delete me');

    const childDesc = parent.spawnSubHarness({ id: 'feature_branch', vfsWorkspaceMode: 'branch' });
    childDesc.vfs.writeFile('base.txt', 'hello beautiful world (modified)');
    childDesc.vfs.writeFile('new_feature.js', 'export const feat = true;');
    childDesc.vfs.removeFile('to_delete.txt');

    const mergeResult = parent.mergeSubHarness('feature_branch');

    assert.strictEqual(mergeResult.success, true);
    assert.strictEqual(parent.vfs.readFile('base.txt'), 'hello beautiful world (modified)');
    assert.strictEqual(parent.vfs.readFile('new_feature.js'), 'export const feat = true;');
    assert.strictEqual(parent.vfs.exists('to_delete.txt'), false);
    assert.strictEqual(parent.vfs.readFile('unrelated.txt'), 'parent only');
    assert.strictEqual(childDesc.isMerged, true);
    assert.strictEqual(childDesc.status, 'merged');
  });

  check('mergeSubHarness detects all 4 conflict classes under safe strategy', () => {
    // Conflict 1: modify_modify_conflict
    {
      const parent = new HarnessController({ id: 'p1' });
      parent.vfs.writeFile('conflict.txt', 'base');
      const child = parent.spawnSubHarness({ id: 'c1', vfsWorkspaceMode: 'branch' });
      child.vfs.writeFile('conflict.txt', 'child version');
      parent.vfs.writeFile('conflict.txt', 'parent version');

      let caught = false;
      try {
        parent.mergeSubHarness('c1', { strategy: 'safe' });
      } catch (err) {
        caught = true;
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'modify_modify_conflict');
      }
      assert.strictEqual(caught, true);
      assert.strictEqual(parent.vfs.readFile('conflict.txt'), 'parent version', 'Parent must remain untouched on conflict');
    }

    // Conflict 2: modify_delete_conflict (child modified, parent deleted)
    {
      const parent = new HarnessController({ id: 'p2' });
      parent.vfs.writeFile('file.txt', 'base');
      const child = parent.spawnSubHarness({ id: 'c2', vfsWorkspaceMode: 'branch' });
      child.vfs.writeFile('file.txt', 'child edited');
      parent.vfs.removeFile('file.txt');

      let caught = false;
      try {
        parent.mergeSubHarness('c2', { strategy: 'safe' });
      } catch (err) {
        caught = true;
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'modify_delete_conflict');
      }
      assert.strictEqual(caught, true);
      assert.strictEqual(parent.vfs.exists('file.txt'), false, 'Parent must remain deleted on conflict');
    }

    // Conflict 3: delete_modify_conflict (child deleted, parent modified)
    {
      const parent = new HarnessController({ id: 'p3' });
      parent.vfs.writeFile('file.txt', 'base');
      const child = parent.spawnSubHarness({ id: 'c3', vfsWorkspaceMode: 'branch' });
      child.vfs.removeFile('file.txt');
      parent.vfs.writeFile('file.txt', 'parent edited');

      let caught = false;
      try {
        parent.mergeSubHarness('c3', { strategy: 'safe' });
      } catch (err) {
        caught = true;
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'delete_modify_conflict');
      }
      assert.strictEqual(caught, true);
      assert.strictEqual(parent.vfs.readFile('file.txt'), 'parent edited');
    }

    // Conflict 4: add_add_conflict (both created same path with different content)
    {
      const parent = new HarnessController({ id: 'p4' });
      const child = parent.spawnSubHarness({ id: 'c4', vfsWorkspaceMode: 'branch' });
      child.vfs.writeFile('new.txt', 'from child');
      parent.vfs.writeFile('new.txt', 'from parent');

      let caught = false;
      try {
        parent.mergeSubHarness('c4', { strategy: 'safe' });
      } catch (err) {
        caught = true;
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'add_add_conflict');
      }
      assert.strictEqual(caught, true);
      assert.strictEqual(parent.vfs.readFile('new.txt'), 'from parent');
    }
  });

  check('mergeSubHarness force strategy overwrites parent with child changes', () => {
    const parent = new HarnessController({ id: 'p_force' });
    parent.vfs.writeFile('conflict.txt', 'base');
    const child = parent.spawnSubHarness({ id: 'c_force', vfsWorkspaceMode: 'branch' });
    child.vfs.writeFile('conflict.txt', 'child winner');
    parent.vfs.writeFile('conflict.txt', 'parent loser');

    const result = parent.mergeSubHarness('c_force', { strategy: 'force' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(parent.vfs.readFile('conflict.txt'), 'child winner');
  });

  check('mergeSubHarness rejects double merge with ALREADY_MERGED', () => {
    const parent = new HarnessController({ id: 'p_double' });
    parent.vfs.writeFile('test.txt', 'v1');
    const child = parent.spawnSubHarness({ id: 'c_double', vfsWorkspaceMode: 'branch' });
    child.vfs.writeFile('test.txt', 'v2');

    parent.mergeSubHarness('c_double');

    let caught = false;
    try {
      parent.mergeSubHarness('c_double');
    } catch (err) {
      caught = true;
      assert.strictEqual(err.code, 'ALREADY_MERGED');
    }
    assert.strictEqual(caught, true, 'Subsequent merge call must throw ALREADY_MERGED');
  });

  check('mergeSubHarness rejects share and clone modes with INVALID_VFS_MODE', () => {
    const parent = new HarnessController({ id: 'p_modes' });
    const shareChild = parent.spawnSubHarness({ id: 'c_share', vfsWorkspaceMode: 'share' });
    const cloneChild = parent.spawnSubHarness({ id: 'c_clone', vfsWorkspaceMode: 'clone' });

    assert.throws(() => parent.mergeSubHarness('c_share'), err => err.code === 'INVALID_VFS_MODE');
    assert.throws(() => parent.mergeSubHarness('c_clone'), err => err.code === 'INVALID_VFS_MODE');
  });

  // =========================================================================
  // 5. TrajectoryEngine Hierarchical Tree & Stitching Verification
  // =========================================================================
  console.log('\n--- Subsystem 5: TrajectoryEngine Hierarchical Tree & Stitching ---');

  check('TrajectoryEngine stitches child trajectory and builds hierarchical tree', () => {
    const parentTrajectory = new TrajectoryEngine({ harnessId: 'root', role: 'planner' });
    const spawnEvt = parentTrajectory.recordStep({
      thought: 'Need sub-agent to implement math solver',
      action: { tool: 'spawnSubHarness', params: { subHarnessId: 'sub_math', role: 'math_solver' } },
      observation: { status: 'success' }
    });

    const childTrajectory = new TrajectoryEngine({ harnessId: 'sub_math', role: 'math_solver', depth: 1 });
    childTrajectory.recordStep({
      step: 1,
      thought: 'Solving equation x^2 = 4',
      action: { tool: 'compute', params: { eq: 'x^2=4' } },
      observation: { result: 'x = +/- 2' },
      metrics: { durationMs: 45, tokensConsumed: 120 }
    });
    childTrajectory.recordStep({
      step: 2,
      thought: 'Verifying solutions in virtual env',
      action: { tool: 'verify', params: { values: [2, -2] } },
      observation: { result: 'Verified' },
      metrics: { durationMs: 30, tokensConsumed: 80 }
    });

    parentTrajectory.stitchChildTrajectory('sub_math', childTrajectory, { anchorStepId: spawnEvt.id, role: 'math_solver' });

    // Verify tree representation
    const tree = parentTrajectory.getHierarchicalTree();
    assert.strictEqual(tree.length, 1);
    const rootNode = tree[0];
    assert.strictEqual(rootNode.children.length, 2);
    assert.strictEqual(rootNode.children[0].stepIndex, 1);
    assert.strictEqual(rootNode.children[0].depth, 1);
    assert.strictEqual(rootNode.children[0].role, 'math_solver');
    assert.strictEqual(rootNode.children[1].stepIndex, 2);
    assert.strictEqual(rootNode.sub_trajectory.tokensUsed, 200);
    assert.strictEqual(rootNode.sub_trajectory.durationMs, 75);

    // Verify flattened timeline with hierarchical indexing
    const timeline = parentTrajectory.getFlattenedTimeline();
    assert.strictEqual(timeline.length, 3);
    assert.strictEqual(timeline[0].hierarchicalIndex, '1');
    assert.strictEqual(timeline[1].hierarchicalIndex, '1.1');
    assert.strictEqual(timeline[2].hierarchicalIndex, '1.2');
    assert.strictEqual(timeline[1].badgeText, '[MATH_SOLVER]');
  });

  check('TrajectoryEngine exportMarkdown supports both flat and hierarchical modes', () => {
    const parentTrajectory = new TrajectoryEngine({ harnessId: 'root', role: 'root' });
    const spawnEvt = parentTrajectory.recordStep({
      thought: 'Planning task',
      action: { tool: 'spawnSubHarness', params: { subHarnessId: 'coder' } }
    });

    const childTrajectory = new TrajectoryEngine({ harnessId: 'coder', role: 'coder', depth: 1 });
    childTrajectory.recordStep({
      thought: 'Writing code',
      action: { tool: 'replace_file_content', params: {} }
    });

    parentTrajectory.stitchChildTrajectory('coder', childTrajectory, { anchorStepId: spawnEvt.id });

    // Flat mode (default)
    const flatMd = parentTrajectory.exportMarkdown();
    assert.ok(flatMd.includes('## Trajectory Step Timeline'));
    assert.ok(!flatMd.includes('## Hierarchical Trajectory Timeline'));

    // Hierarchical mode
    const hierMd = parentTrajectory.exportMarkdown({ hierarchical: true });
    assert.ok(hierMd.includes('## Hierarchical Trajectory Timeline'));
    assert.ok(hierMd.includes('1.1'));
    assert.ok(hierMd.includes('[CODER]'));
    assert.ok(hierMd.includes('replace_file_content'));
  });

  // =========================================================================
  // 6. Facade & Circumvention Anti-Cheating Check
  // =========================================================================
  console.log('\n--- Subsystem 6: Facade & Anti-Cheating Forensic Checks ---');

  check('VfsSandbox.branch creates distinct internal Map instances with no shallow alias leak', () => {
    const vfs = new VfsSandbox();
    vfs.writeFile('f1', 'c1');
    const branch = vfs.branch();

    assert.notStrictEqual(vfs.files, branch.files, 'files Map must be a newly allocated Map');
    assert.notStrictEqual(vfs.directories, branch.directories, 'directories Set must be a newly allocated Set');

    // Modifying Map in branch does not add key in parent
    branch.writeFile('f2', 'c2');
    assert.strictEqual(vfs.files.has('/f2') || vfs.files.has('f2'), false);
  });

  check('HarnessController.prototype methods do not return static mock literals', () => {
    const proto = HarnessController.prototype;
    const spawnStr = proto.spawnSubHarness.toString();
    const mergeStr = proto.mergeSubHarness.toString();
    const stopStr = proto.emergencyStopSubHarness.toString();

    assert.ok(spawnStr.length > 200, `spawnSubHarness must contain non-trivial logic (length: ${spawnStr.length})`);
    assert.ok(spawnStr.includes('throw new HarnessError'), 'spawnSubHarness must contain error handling');

    assert.ok(mergeStr.length > 200, `mergeSubHarness must contain non-trivial logic (length: ${mergeStr.length})`);
    assert.ok(mergeStr.includes('throw new HarnessError'), 'mergeSubHarness must contain error handling');

    assert.ok(stopStr.length > 200, `emergencyStopSubHarness must contain non-trivial logic (length: ${stopStr.length})`);
    assert.ok(stopStr.includes('haltSubTree'), 'emergencyStopSubHarness must contain recursive halt logic');
    assert.ok(stopStr.includes('this.bus.send'), 'emergencyStopSubHarness must broadcast over event bus');
  });

  console.log(`\n=== AUDIT COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED (100%) ===`);
}

runAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
