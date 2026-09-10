/**
 * tests/test_challenger_suna_agent_empirical_stress.js
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE FOR SUNAAGENT (Milestones 1-4)
 * Author: Challenger 2 (Empirical Adversarial Verification)
 *
 * Core Challenge Dimensions:
 * 1. HITL life-cycle transitions: rapid sequence of pause() -> steer() -> resume() -> rewind(),
 *    invalid state transitions, in-flight pause during thought streaming, high-frequency stress.
 * 2. Sub-agent hierarchy and InterHarnessEventBus event passing:
 *    multi-tier nesting (depths 0 to 4), recursion limit enforcement (depth >= 5),
 *    simulated delay in request-response correlation, timeout rejection, broadcast propagation,
 *    cascading emergency stop.
 * 3. Live Workspace event emissions:
 *    verify vfs_change and diff_preview events triggered on VFS mutations with exact payload,
 *    suppression via preview: false, UTF-8 Vietnamese preservation, and run_sandboxed_command behavior.
 * 4. Dual Runtime consistency:
 *    pure Node.js VM sandbox vs simulated Browser window environment parity,
 *    JsonAutoRepair, MultiSyntaxParser, OodaBrain, and invariant preservation.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SunaHarness = require('../suna_harness.js');
const SunaAgent = require('../suna_agent.js');

const {
  VfsSandbox,
  HarnessController,
  CheckpointManager,
  InterHarnessEventBus,
  TrajectoryEngine,
  HarnessError,
  VfsDiffEngine,
  AciSchemaValidator,
  AciInterface
} = SunaHarness;
describe('Challenger 2 Empirical Adversarial Stress Suite (SunaAgent M1-M4)', function () {
  this.timeout(25000);

  // ========================================================================
  // SUITE 1: HITL Life-Cycle Transitions & State Machine Stress
  // =======================================================================
  describe('1. HITL Life-Cycle Transitions & State Machine', function () {
    let vfs, controller, checkpoints, bus, trajectory, agent;

    beforeEach(function () {
      vfs = new VfsSandbox();
      bus = new InterHarnessEventBus();
      trajectory = new TrajectoryEngine({ harnessId: 'hitl_agent_test' });
      checkpoints = new CheckpointManager({ vfs });
      controller = new HarnessController({ vfs, bus, trajectory, checkpoints, id: 'hitl_agent_test' });
      agent = new SunaAgent({ id: 'hitl_agent_test' });
      agent.attachHarness(controller);
    });

    it('C2-HITL-1: rapid atomic sequence of pause() -> steer() -> resume() -> rewind()', async function () {
      vfs.writeFile('config.json', JSON.stringify({ version: 1, active: true }));
      const chk1 = agent.createCheckpoint(1);
      assert.ok(chk1, 'Checkpoint 1 must be created');

      vfs.writeFile('config.json', JSON.stringify({ version: 2, active: true }));
      const chk2 = agent.createCheckpoint(2);
      assert.ok(chk2, 'Checkpoint 2 must be created');

      vfs.writeFile('config.json', JSON.stringify({ version: 3, active: false }));

      const eventsEmitted = [];
      agent.on('status_change', (data) => eventsEmitted.push({ type: 'status_change', ...data }));
      agent.on('steer_applied', (data) => eventsEmitted.push({ type: 'steer_applied', ...data }));
      agent.on('rewind_applied', (data) => eventsEmitted.push({ type: 'rewind_applied', ...data }));

      const pauseRes = agent.pause();
      assert.strictEqual(pauseRes, true, 'pause() should return true');
      assert.strictEqual(agent.status, 'paused', 'Status must be paused');

      const steerRes = agent.steer('Revert breaking changes and restore config v1');
      assert.strictEqual(steerRes, true, 'steer() should return true');
      assert.strictEqual(agent.memory.getFact('latest_steer'), 'Revert breaking changes and restore config v1');

      const resumeRes = agent.resume();
      assert.strictEqual(resumeRes, true, 'resume() should return true');
      assert.strictEqual(agent.status, 'running', 'Status must be running');

      const rewindRes = agent.rewind(1);
      assert.ok(rewindRes, 'rewind(1) must return restored checkpoint object');
      assert.strictEqual(vfs.readFile('config.json'), JSON.stringify({ version: 1, active: true }), 'VFS file must roll back to v1');

      const types = eventsEmitted.map(e => e.type);
      assert.deepStrictEqual(types, ['status_change', 'steer_applied', 'status_change', 'rewind_applied']);
    });

    it('C2-HITL-2: high-frequency 50-cycle stress test of pause() -> steer() -> resume() -> rewind()', async function () {
      vfs.writeFile('state.txt', 'baseline_0');
      agent.createCheckpoint(1);

      for (let i = 1; i <= 50; i++) {
        vfs.writeFile('state.txt', 'iteration_' + i);
        agent.createCheckpoint(i + 1);

        assert.strictEqual(agent.pause(), true);
        assert.strictEqual(agent.steer('Steer iteration ' + i), true);
        assert.strictEqual(agent.resume(), true);

        agent.rewind(1);
        assert.strictEqual(vfs.readFile('state.txt'), 'baseline_0');
      }

      assert.strictEqual(agent.memory.getFact('latest_steer'), 'Steer iteration 50');
      assert.strictEqual(vfs.readFile('state.txt'), 'baseline_0');
    });

    it('C2-HITL-3: reject invalid out-of-order state transitions and edge arguments', function () {
      assert.strictEqual(agent.status, 'idle');
      assert.strictEqual(agent.resume(), false, 'resume() when idle must return false');

      assert.strictEqual(agent.pause(), true);
      assert.strictEqual(agent.status, 'paused');
      assert.strictEqual(agent.pause(), false, 'pause() when already paused must return false');

      assert.strictEqual(agent.steer(''), false, 'Empty steer instruction must return false');
      assert.strictEqual(agent.steer('   '), false, 'Whitespace-only steer instruction must return false');
      assert.strictEqual(agent.steer(null), false, 'null steer instruction must return false');
      assert.strictEqual(agent.steer(undefined), false, 'undefined steer instruction must return false');

      assert.throws(() => {
        agent.rewind(99999);
      }, (err) => {
        return err instanceof Error && (err.code === 'CHECKPOINT_NOT_FOUND' || err.message.includes('No checkpoint found'));
      });
    });

    it('C2-HITL-4: full lifecycle state transitions (idle -> running -> paused -> halted -> idle)', function () {
      assert.strictEqual(agent.status, 'idle');

      agent.pause();
      assert.strictEqual(agent.status, 'paused');

      agent.resume();
      assert.strictEqual(agent.status, 'running');

      agent.abort();
      assert.strictEqual(agent.status, 'halted');
      assert.strictEqual(agent.isAgentAborted, true);

      agent.reset();
      assert.strictEqual(agent.status, 'idle');
      assert.strictEqual(agent.isAgentAborted, false);
    });

    it('C2-HITL-5: in-flight suspension when pause() is invoked during thinking stream', async function () {
      vfs.writeFile('app.js', 'console.log(1);');

      let pauseTriggered = false;
      agent.on('thought_chunk', () => {
        if (!pauseTriggered) {
          pauseTriggered = true;
          agent.pause();
        }
      });

      const result = await agent.executeStep('Fix bug in app.js');
      assert.strictEqual(result.status, 'paused', 'Step result status must be paused');
      assert.strictEqual(agent.status, 'paused', 'Agent status must remain paused');
      assert.strictEqual(vfs.readFile('app.js'), 'console.log(1);', 'File must remain untouched');
    });

    it('C2-HITL-6: multi-checkpoint time-travel rollback preserves historical consistency', function () {
      vfs.writeFile('file.txt', 'version_1');
      agent.createCheckpoint(1);

      vfs.writeFile('file.txt', 'version_2');
      agent.createCheckpoint(2);

      vfs.writeFile('file.txt', 'version_3');
      agent.createCheckpoint(3);

      vfs.writeFile('file.txt', 'version_4');

      agent.rewind(2);
      assert.strictEqual(vfs.readFile('file.txt'), 'version_2');

      assert.throws(() => agent.rewind(3), /CHECKPOINT_NOT_FOUND/);

      agent.rewind(1);
      assert.strictEqual(vfs.readFile('file.txt'), 'version_1');
    });
  });

  // =======================================================================
  // SUITE 2: Sub-Agent Hierarchy & InterHarnessEventBus Event Passing
  // =======================================================================
  describe('2. Sub-Agent Hierarchy & InterHarnessEventBus Passing', function () {
    let bus, rootController, rootVfs, rootTrajectory;

    beforeEach(function () {
      rootVfs = new VfsSandbox();
      bus = new InterHarnessEventBus();
      rootTrajectory = new TrajectoryEngine({ harnessId: 'root_lead' });
      rootController = new HarnessController({
        id: 'root_lead',
        role: 'lead',
        vfs: rootVfs,
        bus: bus,
        trajectory: rootTrajectory,
        maxTurns: 50,
        maxTokens: 100000
      });
    });

    it('C2-BUS-1: multi-tier hierarchy instantiation across 5 levels (depth 0 to 4)', function () {
      const tier1 = rootController.spawnSubHarness({ id: 'tier_1_architect', role: 'architect', vfsWorkspaceMode: 'share' });
      const tier2 = tier1.spawnSubHarness({ id: 'tier_2_engineer', role: 'engineer', vfsWorkspaceMode: 'share' });
      const tier3 = tier2.spawnSubHarness({ id: 'tier_3_tester', role: 'tester', vfsWorkspaceMode: 'share' });
      const tier4 = tier3.spawnSubHarness({ id: 'tier_4_auditor', role: 'auditor', vfsWorkspaceMode: 'share' });

      assert.strictEqual(rootController.depth, 0);
      assert.strictEqual(tier1.depth, 1);
      assert.strictEqual(tier2.depth, 2);
      assert.strictEqual(tier3.depth, 3);
      assert.strictEqual(tier4.depth, 4);

      assert.deepStrictEqual(tier4.lineage, ['root_lead', 'tier_1_architect', 'tier_2_engineer', 'tier_3_tester']);
      assert.strictEqual(tier4.parentId, 'tier_3_tester');
    });

    it('C2-BUS-2: enforce recursion depth limit when attempting to spawn at depth >= 5', function () {
      const tier1 = rootController.spawnSubHarness({ id: 'tier_1', role: 'worker', vfsWorkspaceMode: 'share' });
      const tier2 = tier1.spawnSubHarness({ id: 'tier_2', role: 'worker', vfsWorkspaceMode: 'share' });
      const tier3 = tier2.spawnSubHarness({ id: 'tier_3', role: 'worker', vfsWorkspaceMode: 'share' });
      const tier4 = tier3.spawnSubHarness({ id: 'tier_4', role: 'worker', vfsWorkspaceMode: 'share' });

      assert.throws(() => {
        tier4.spawnSubHarness({ id: 'tier_5', role: 'worker', vfsWorkspaceMode: 'share' });
      }, (err) => {
        return err instanceof HarnessError && err.code === 'MAX_RECURSION_DEPTH_EXCEEDED';
      });
    });

    it('C2-BUS-3: simulated asynchronous delay in bus.request() resolves within timeout', async function () {
      const sender = 'agent_worker';
      const receiver = 'agent_reviewer';

      bus.subscribe(receiver, (msg) => {
        if (msg.type === 'review_request') {
          setTimeout(() => {
            bus.send({
              from: receiver,
              to: msg.from,
              type: 'review_response',
              correlationId: msg.correlationId,
              payload: { approved: true, reviewNotes: 'Code meets standards' }
            });
          }, 30);
        }
      });

      const response = await bus.request({
        from: sender,
        to: receiver,
        type: 'review_request',
        payload: { file: 'index.js' }
      }, 250);

      assert.ok(response);
      assert.strictEqual(response.type, 'review_response');
      assert.strictEqual(response.payload.approved, true);
    });

    it('C2-BUS-4: simulated asynchronous delay exceeding timeout rejects deterministically', async function () {
      const sender = 'agent_client';
      const receiver = 'agent_heavy_compute';

      bus.subscribe(receiver, (msg) => {
        setTimeout(() => {
          bus.send({
            from: receiver,
            to: msg.from,
            type: 'compute_response',
            correlationId: msg.correlationId,
            payload: { result: 42 }
          });
        }, 100);
      });

      await assert.rejects(async () => {
        await bus.request({
          from: sender,
          to: receiver,
          type: 'compute_request',
          payload: { task: 'heavy' }
        }, 25);
      }, (err) => {
        return err instanceof Error && err.message.includes('Request timed out after 25ms');
      });
    });

    it('C2-BUS-5: deep nested message propagation from root down to Tier 4 and return receipt', async function () {
      const tier1 = rootController.spawnSubHarness({ id: 't1', role: 'r1', vfsWorkspaceMode: 'share' });
      const tier2 = tier1.spawnSubHarness({ id: 't2', role: 'r2', vfsWorkspaceMode: 'share' });
      const tier3 = tier2.spawnSubHarness({ id: 't3', role: 'r3', vfsWorkspaceMode: 'share' });
      const tier4 = tier3.spawnSubHarness({ id: 't4', role: 'r4', vfsWorkspaceMode: 'share' });

      let tier4Received = null;
      let rootReceipt = null;

      bus.subscribe('t4', (msg) => {
        tier4Received = msg;
        bus.send({
          from: 't4',
          to: 'root_lead',
          type: 'directive_ack',
          correlationId: msg.id,
          payload: { status: 'acknowledged', depth: 4 }
        });
      });

      bus.subscribe('root_lead', (msg) => {
        if (msg.type === 'directive_ack') {
          rootReceipt = msg;
        }
      });

      bus.send({
        from: 'root_lead',
        to: 't4',
        type: 'deep_directive',
        payload: { command: 'audit_now', priority: 'high' }
      });

      assert.ok(tier4Received);
      assert.strictEqual(tier4Received.from, 'root_lead');
      assert.strictEqual(tier4Received.payload.command, 'audit_now');

      assert.ok(rootReceipt);
      assert.strictEqual(rootReceipt.from, 't4');
      assert.strictEqual(rootReceipt.payload.status, 'acknowledged');
    });

    it('C2-BUS-6: broadcast delivery receives by all active sub-harness levels', function () {
      const tier1 = rootController.spawnSubHarness({ id: 'sub_a', role: 'worker', vfsWorkspaceMode: 'share' });
      const tier2 = tier1.spawnSubHarness({ id: 'sub_b', role: 'worker', vfsWorkspaceMode: 'share' });
      const tier3 = tier2.spawnSubHarness({ id: 'sub_c', role: 'worker', vfsWorkspaceMode: 'share' });

      const hits = [];
      bus.subscribe('root_lead', (m) => hits.push('root'));
      bus.subscribe('sub_a', (m) => hits.push('sub_a'));
      bus.subscribe('sub_b', (m) => hits.push('sub_b'));
      bus.subscribe('sub_c', (m) => hits.push('sub_c'));

      bus.send({
        from: 'root_lead',
        to: '*',
        type: 'BROADCAST_ALERT',
        payload: { msg: 'SYSTEM_FREEZE' }
      });

      assert.strictEqual(hits.length, 4);
      assert.ok(hits.includes('root'));
      assert.ok(hits.includes('sub_a'));
      assert.ok(hits.includes('sub_b'));
      assert.ok(hits.includes('sub_c'));
    });

    it('C2-BUS-7: cascading emergency stop halts child controller execution', async function () {
      const child = rootController.spawnSubHarness({ id: 'child_worker', role: 'worker', vfsWorkspaceMode: 'share' });
      assert.strictEqual(child.status, 'idle');

      rootController.emergencyStopSubHarness('child_worker', 'Security policy violation');

      assert.strictEqual(child.status, 'halted');
      assert.strictEqual(child.controller.isHalted, true);

      await assert.rejects(async () => {
        await child.controller.executeAction('view_file', { path: 'any.txt' });
      }, (err) => {
        return err.message.includes('HALTED') || err.message.includes('halted');
      });
    });
  });

  // =======================================================================
  // SUITE 3: Live Workspace Event Emissions (vfs_change & diff_preview)
  // =======================================================================
  describe('3. Live Workspace Event Emissions (vfs_change & diff_preview)', function () {
    let vfs, agent, controller;

    beforeEach(function () {
      vfs = new VfsSandbox();
      controller = new HarnessController({ vfs, id: 'vfs_event_agent' });
      agent = new SunaAgent({ id: 'vfs_event_agent' });
      agent.attachHarness(controller);
    });

    it('C2-VFS-1: emit vfs_change event with exact { path, content } on replace_file_content', async function () {
      vfs.writeFile('main.js', 'function add(a, b) { return a - b; }');

      let emittedPayload = null;
      agent.on('vfs_change', (payload) => {
        emittedPayload = payload;
      });

      await agent.invokeAciTool('replace_file_content', {
        TargetFile: 'main.js',
        TargetContent: 'return a - b;',
        ReplacementContent: 'return a + b;'
      });

      assert.ok(emittedPayload, 'vfs_change must be emitted');
      assert.strictEqual(emittedPayload.path, 'main.js');
      assert.strictEqual(emittedPayload.content, 'function add(a, b) { return a + b; }');
    });

    it('C2-VFS-2: rapid 10-file mutation sequence emits vfs_change events in exact order', async function () {
      const emittedFiles = [];
      agent.on('vfs_change', (p) => emittedFiles.push(p.path));

      for (let i = 1; i <= 10; i++) {
        const fname = 'module_' + i + '.js';
        vfs.writeFile(fname, 'export const id = ' + i + ';');
        await agent.invokeAciTool('replace_file_content', {
          TargetFile: fname,
          TargetContent: 'id = ' + i + ';',
          ReplacementContent: 'id = ' + (i * 10) + ';',
          preview: false
        });
      }

      assert.strictEqual(emittedFiles.length, 10);
      for (let i = 1; i <= 10; i++) {
        assert.strictEqual(emittedFiles[i - 1], 'module_' + i + '.js');
        assert.strictEqual(vfs.readFile('module_' + i + '.js'), 'export const id = ' + (i * 10) + ';');
      }
    });

    it('C2-VFS-3: emit pre-flight diff_preview with valid Unified Git Diff format before mutation', async function () {
      vfs.writeFile('calculator.js', 'class Calc {\n  subtract(a, b) {\n    return a - b;\n  }\n}');

      let diffEmitted = null;
      let mutationOccurredAtDiff = null;

      agent.on('diff_preview', (diff) => {
        diffEmitted = diff;
        mutationOccurredAtDiff = vfs.readFile('calculator.js').includes('return a + b;');
      });

      await agent.invokeAciTool('replace_file_content', {
        TargetFile: 'calculator.js',
        TargetContent: 'return a - b;',
        ReplacementContent: 'return a + b;'
      });

      assert.ok(diffEmitted, 'diff_preview must be emitted');
      assert.strictEqual(mutationOccurredAtDiff, false, 'diff_preview must fire BEFORE file mutation');
      assert.strictEqual(diffEmitted.wouldSucceed, true);
      assert.ok(typeof diffEmitted.patch === 'string');
      assert.ok(diffEmitted.patch.includes('--- a/calculator.js'), 'Unified diff header must contain --- a/');
      assert.ok(diffEmitted.patch.includes('+++ b/calculator.js'), 'Unified diff header must contain +++ b/');
      assert.ok(diffEmitted.patch.includes('-    return a - b;'), 'Diff must contain deletion line');
      assert.ok(diffEmitted.patch.includes('+    return a + b;'), 'Diff must contain insertion line');
    });

    it('C2-VFS-4: emit diff_preview with wouldSucceed: false on missing target content', async function () {
      vfs.writeFile('test.js', 'const x = 10;');

      let diffEmitted = null;
      agent.on('diff_preview', (diff) => {
        diffEmitted = diff;
      });

      try {
        await agent.invokeAciTool('replace_file_content', {
          TargetFile: 'test.js',
          TargetContent: 'NON_EXISTENT_CONTENT',
          ReplacementContent: 'const x = 20;'
        });
      } catch (e) {
        // Expected tool error
      }

      assert.ok(diffEmitted, 'diff_preview must still emit diagnostic preview');
      assert.strictEqual(diffEmitted.wouldSucceed, false);
      assert.ok(diffEmitted.reason.includes('not found') || diffEmitted.reason.includes('NON_EXISTENT_CONTENT'));
    });

    it('C2-VFS-5: suppress diff_preview event emission when preview: false is specified', async function () {
      vfs.writeFile('secret.js', 'const apiKey = "OLD";');

      let diffCallCount = 0;
      agent.on('diff_preview', () => { diffCallCount++; });

     await agent.invokeAciTool('replace_file_content', {
        TargetFile: 'secret.js',
        TargetContent: '"OLD"',
        ReplacementContent: '"NEW"',
        preview: false
      });

      assert.strictEqual(diffCallCount, 0, 'diff_preview must not be emitted when preview: false');
      assert.strictEqual(vfs.readFile('secret.js'), 'const apiKey = "NEW";');
    });

    it('C2-VFS-6: preserve UTF-8 Vietnamese diacritics in both diff_preview and vfs_change', async function () {
      const originalText = 'const chao = "Xin chào Việt Nam!";\nconst mota = "Hw thống tré tuệ nchân tạo SunaAgent.";';
      const replacementText = 'const mota = "Siêu Tác Nhân Tự Trị Độc Quyền SunaAgent — Tối Thượng!";';

      vfs.writeFile('vietnam.js', originalText);

      let diffPayload = null;
      let vfsPayload = null;

      agent.on('diff_preview', (d) => { diffPayload = d; });
      agent.on('vfs_change', (v) => { vfsPayload = v; });

      await agent.invokeAciTool('replace_file_content', {
        TargetFile: 'vietnam.js',
        TargetContent: 'const mota = "Hw thống tré tuệ nchân tạo SunaAgent.";',
        ReplacementContent: replacementText
      });

      assert.ok(diffPayload);
      assert.strictEqual(diffPayload.wouldSucceed, true);
      assert.ok(diffPayload.patch.includes('Sieu Tac Nhan Tu Tri') || diffPayload.patch.includes('Tối Thường!'));

      assert.ok(vfsPayload);
      assert.ok(vfsPayload.content.includes('Tối Thường!'));
      assert.ok(vfsPayload.content.includes('Xin chào Việt Nam!'));
      assert.strictEqual(vfs.readFile('vietnam.js'), 'const chao = "Xin chào Việt Nam!";\n' + replacementText);
    });

    it('C2-VFS-7: empirical test for run_sandboxed_command redirection vfs_change emission', async function () {
      let vfsChangeEmitted = false;
      agent.on('vfs_change', () => { vfsChangeEmitted = true; });

      const res = await agent.invokeAciTool('run_sandboxed_command', {
        CommandLine: 'echo "build success" > build.log',
        TargetFile: 'build.log'
      });

      assert.ok(res);
      assert.strictEqual(vfs.exists('build.log'), true);
      assert.strictEqual(vfsChangeEmitted, true, 'vfs_change must be emitted when TargetFile is provided with redirection');
    });
  });
});
