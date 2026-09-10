/**
 * tests/test_challenger_m1_event_bus_and_trajectory.js
 * 
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE FOR MILESTONE 1 (R1)
 * 
 * Target Subsystems:
 * 1. InterHarnessEventBus:
 *    - Point-to-Point (P2P) targeted delivery across multiple sub-harnesses
 *    - Broadcast delivery ('*') to direct and wildcard subscribers
 *    - Request/Response lifecycle with correlation IDs, sync/async resolution, and timeout rejection
 *    - Subscriber error isolation: unhandled callback errors do not disrupt peer subscribers or crash the bus
 *    - Envelope schema validation and immutability checks
 *    - Interceptor middleware filtering and fault tolerance
 * 2. TrajectoryEngine:
 *    - Multi-worker trajectory stitching (stitchChildTrajectory)
 *    - Hierarchical tree representation (getHierarchicalTree) with role badges and metric rollups
 *    - Flattened timeline indexing (1, 1.1, 1.2, 2, 2.1) and indentation (getFlattenedTimeline)
 *    - Dual-mode Markdown export (flat vs hierarchical comparison)
 *    - Event immutability & array preservation stress testing
 * 3. Cascading Emergency Stop:
 *    - Multi-tier hierarchy (Parent -> Child -> Grandchild) cascading halts
 *    - Execution and delegation lockdown (canExecute HALTED, spawnSubHarness PARENT_HALTED)
 *    - Event bus emergency stop broadcast propagation
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  InterHarnessEventBus,
  TrajectoryEngine,
  HarnessController,
  createHarness,
  HarnessError
} = require('../suna_harness.js');

describe('Empirical Adversarial Challenger: M1 Event Bus, Trajectory & Emergency Stop', function() {
  this.timeout(15000);

  // =========================================================================
  // SUITE 1: InterHarnessEventBus Core Delivery & Addressing (P2P & Broadcast)
  // =========================================================================
  describe('1. InterHarnessEventBus Point-to-Point and Broadcast Addressing', () => {
    let bus;

    beforeEach(() => {
      bus = new InterHarnessEventBus();
    });

    afterEach(() => {
      bus.clear();
    });

    it('C1.1: should deliver point-to-point message ONLY to designated target harness', () => {
      const received = { parent: [], sub1: [], sub2: [], sub3: [] };

      bus.subscribe('parent', msg => received.parent.push(msg));
      bus.subscribe('sub1', msg => received.sub1.push(msg));
      bus.subscribe('sub2', msg => received.sub2.push(msg));
      bus.subscribe('sub3', msg => received.sub3.push(msg));

      const sendResult = bus.send({
        from: 'parent',
        to: 'sub1',
        type: 'directive',
        payload: { command: 'analyze_ast', target: '/src/index.js' }
      });

      assert.strictEqual(sendResult.delivered, true);
      assert.strictEqual(sendResult.subscriberCount, 1);
      assert.strictEqual(received.sub1.length, 1);
      assert.strictEqual(received.sub1[0].payload.command, 'analyze_ast');
      assert.strictEqual(received.parent.length, 0, 'Sender should not receive its own direct message');
      assert.strictEqual(received.sub2.length, 0, 'Sibling sub2 should not receive targeted message for sub1');
      assert.strictEqual(received.sub3.length, 0, 'Sibling sub3 should not receive targeted message for sub1');
    });

    it('C1.2: should support bidirectional P2P messaging between peer sub-harnesses', () => {
      const chatLog = [];
      bus.subscribe('worker_a', msg => chatLog.push(`A_REC_${msg.type}:${msg.payload.text}`));
      bus.subscribe('worker_b', msg => chatLog.push(`B_REC_${msg.type}:${msg.payload.text}`));

      bus.send({ from: 'worker_a', to: 'worker_b', type: 'query', payload: { text: 'Need schema definition' } });
      bus.send({ from: 'worker_b', to: 'worker_a', type: 'reply', payload: { text: 'Schema available at /schema.json' } });

      assert.deepStrictEqual(chatLog, [
        'B_REC_query:Need schema definition',
        'A_REC_reply:Schema available at /schema.json'
      ]);
    });

    it('C1.3: should broadcast wildcard messages to ALL registered subscribers including wildcard listeners', () => {
      const received = { sub1: 0, sub2: 0, sub3: 0, wildcard: 0 };

      bus.subscribe('sub1', () => { received.sub1++; });
      bus.subscribe('sub2', () => { received.sub2++; });
      bus.subscribe('sub3', () => { received.sub3++; });
      bus.subscribe('*', () => { received.wildcard++; });

      const res = bus.broadcast('coordinator', 'config_update', { timeout: 3000 });

      assert.strictEqual(res.delivered, true);
      assert.strictEqual(res.subscriberCount, 4);
      assert.strictEqual(received.sub1, 1);
      assert.strictEqual(received.sub2, 1);
      assert.strictEqual(received.sub3, 1);
      assert.strictEqual(received.wildcard, 1);
    });

    it('C1.4: should deliver targeted P2P message to wildcard (*) listeners as well', () => {
      const auditLog = [];
      bus.subscribe('*', msg => auditLog.push({ from: msg.from, to: msg.to, type: msg.type }));

      bus.send({ from: 'orchestrator', to: 'worker_x', type: 'assign_task' });

      assert.strictEqual(auditLog.length, 1);
      assert.strictEqual(auditLog[0].to, 'worker_x');
      assert.strictEqual(auditLog[0].type, 'assign_task');
    });

    it('C1.5: should gracefully handle sending to nonexistent target without throwing', () => {
      const res = bus.send({
        from: 'root',
        to: 'ghost_agent_999',
        type: 'ping',
        payload: { ping: true }
      });

      assert.strictEqual(res.delivered, false);
      assert.strictEqual(res.subscriberCount, 0);
      assert.strictEqual(res.to, 'ghost_agent_999');
    });

    it('C1.6: should cleanly unsubscribe listeners and purge empty subscriber sets', () => {
      let callCount = 0;
      const callback = () => { callCount++; };
      const unsubscribe = bus.subscribe('sub_temp', callback);

      bus.send({ from: 'parent', to: 'sub_temp', type: 'msg1' });
      assert.strictEqual(callCount, 1);

      unsubscribe();
      const send2 = bus.send({ from: 'parent', to: 'sub_temp', type: 'msg2' });

      assert.strictEqual(callCount, 1, 'Callback must not be invoked after unsubscribe');
      assert.strictEqual(send2.delivered, false);
      assert.strictEqual(bus.subscribers.has('sub_temp'), false, 'Empty subscriber set must be purged');
    });

    it('C1.7: should execute interceptor pipeline and allow message suppression', () => {
      let droppedCount = 0;
      bus.interceptors.push(msg => {
        if (msg.payload && msg.payload.sensitive) {
          droppedCount++;
          return false; // drop message
        }
        return true;
      });

      let delivered = false;
      bus.subscribe('worker', () => { delivered = true; });

      const suppressed = bus.send({ from: 'root', to: 'worker', type: 'secret', payload: { sensitive: true } });
      assert.strictEqual(suppressed.delivered, false);
      assert.strictEqual(delivered, false);
      assert.strictEqual(droppedCount, 1);

      const passed = bus.send({ from: 'root', to: 'worker', type: 'public', payload: { sensitive: false } });
      assert.strictEqual(passed.delivered, true);
      assert.strictEqual(delivered, true);
    });
  });

  // =========================================================================
  // SUITE 2: InterHarnessEventBus Request/Response & Correlation Lifecycle
  // =========================================================================
  describe('2. InterHarnessEventBus Request/Response, Correlation IDs & Timeouts', () => {
    let bus;

    beforeEach(() => {
      bus = new InterHarnessEventBus();
    });

    afterEach(() => {
      bus.clear();
    });

    it('C2.1: should resolve synchronous request/response without self-resolution bug', async () => {
      bus.subscribe('server_harness', msg => {
        if (msg.type === 'calculate_sum') {
          bus.send({
            from: 'server_harness',
            to: msg.from,
            type: 'calculate_response',
            correlationId: msg.correlationId,
            payload: { result: msg.payload.a + msg.payload.b }
          });
        }
      });

      const response = await bus.request('client_harness', 'server_harness', 'calculate_sum', { a: 40, b: 2 });
      assert.strictEqual(response.type, 'calculate_response');
      assert.strictEqual(response.payload.result, 42);
      assert.strictEqual(response.from, 'server_harness');
      assert.strictEqual(response.to, 'client_harness');
      assert.strictEqual(bus.pendingRequests.size, 0, 'Pending requests map must be cleaned after fulfillment');
    });

    it('C2.2: should resolve asynchronous request/response with processing delay', async () => {
      bus.subscribe('async_worker', msg => {
        setTimeout(() => {
          bus.send({
            from: 'async_worker',
            to: msg.from,
            type: 'job_completed',
            correlationId: msg.correlationId,
            payload: { jobId: msg.payload.jobId, status: 'SUCCESS' }
          });
        }, 25);
      });

      const resp = await bus.request('dispatcher', 'async_worker', 'start_job', { jobId: 'JOB-8821' }, { timeoutMs: 500 });
      assert.strictEqual(resp.payload.status, 'SUCCESS');
      assert.strictEqual(resp.payload.jobId, 'JOB-8821');
    });

    it('C2.3: should route concurrent requests with distinct correlation IDs to their proper callers', async () => {
      bus.subscribe('math_service', msg => {
        const val = msg.payload.input;
        setTimeout(() => {
          bus.send({
            from: 'math_service',
            to: msg.from,
            type: 'math_result',
            correlationId: msg.correlationId,
            payload: { output: val * 10 }
          });
        }, Math.floor(Math.random() * 20));
      });

      const p1 = bus.request('req_1', 'math_service', 'compute', { input: 1 });
      const p2 = bus.request('req_2', 'math_service', 'compute', { input: 2 });
      const p3 = bus.request('req_3', 'math_service', 'compute', { input: 3 });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      assert.strictEqual(r1.payload.output, 10);
      assert.strictEqual(r2.payload.output, 20);
      assert.strictEqual(r3.payload.output, 30);
      assert.strictEqual(r1.to, 'req_1');
      assert.strictEqual(r2.to, 'req_2');
      assert.strictEqual(r3.to, 'req_3');
    });

    it('C2.4: should reject with descriptive error upon request timeout', async () => {
      // Sub-harness receives query but deliberately never answers
      bus.subscribe('silent_worker', () => {});

      let caughtError = null;
      try {
        await bus.request('parent', 'silent_worker', 'deep_search', { query: 'lost' }, { timeoutMs: 40 });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, 'Should have thrown timeout error');
      assert.match(caughtError.message, /\[InterHarnessEventBus\] Request timed out after 40ms/);
      assert.strictEqual(bus.pendingRequests.size, 0, 'Timed out request must be purged from pending map');
    });

    it('C2.5: should abort in-flight requests with descriptive error when bus.clear() is invoked', async () => {
      const reqPromise = bus.request('parent', 'slow_worker', 'heavy_calc', {}, { timeoutMs: 5000 });

      // Clear bus immediately while request is pending
      bus.clear();

      let abortedError = null;
      try {
        await reqPromise;
      } catch (e) {
        abortedError = e;
      }

      assert.ok(abortedError);
      assert.match(abortedError.message, /Bus cleared; request aborted/);
    });
  });

  // =========================================================================
  // SUITE 3: Subscriber Error Isolation & Envelope Validation
  // =========================================================================
  describe('3. Subscriber Error Isolation & Envelope Validation', () => {
    let bus;

    beforeEach(() => {
      bus = new InterHarnessEventBus();
    });

    afterEach(() => {
      bus.clear();
    });

    it('C3.1: should isolate subscriber callback exceptions so peer subscribers receive message safely', () => {
      let sub2Received = false;
      let sub3Received = false;

      // Crashing subscriber 1
      bus.subscribe('worker', () => {
        throw new Error('Explosion inside subscriber 1');
      });

      // Healthy subscriber 2
      bus.subscribe('worker', msg => {
        if (msg.type === 'task') sub2Received = true;
      });

      // Crashing subscriber 3
      bus.subscribe('worker', () => {
        throw new TypeError('Null pointer inside subscriber 3');
      });

      // Healthy subscriber 4
      bus.subscribe('worker', msg => {
        if (msg.type === 'task') sub3Received = true;
      });

      let sendResult;
      assert.doesNotThrow(() => {
        sendResult = bus.send({ from: 'parent', to: 'worker', type: 'task', payload: {} });
      });

      assert.strictEqual(sendResult.delivered, true);
      assert.strictEqual(sendResult.subscriberCount, 2, '2 healthy subscribers must have succeeded');
      assert.strictEqual(sub2Received, true);
      assert.strictEqual(sub3Received, true);
    });

    it('C3.2: should reject invalid envelope options (null, non-object, missing required fields)', () => {
      assert.throws(() => bus.send(null), /Message options must be an object/);
      assert.throws(() => bus.send('not an object'), /Message options must be an object/);
      assert.throws(() => bus.send({}), /"from", "to", and "type" are required fields/);
      assert.throws(() => bus.send({ from: 'a', to: 'b' }), /"from", "to", and "type" are required fields/);
      assert.throws(() => bus.send({ from: 'a', type: 't' }), /"from", "to", and "type" are required fields/);
      assert.throws(() => bus.send({ to: 'b', type: 't' }), /"from", "to", and "type" are required fields/);
      assert.throws(() => bus.subscribe('target', 'not a function'), /Callback must be a function/);
    });

    it('C3.3: should freeze dispatched envelope preventing in-place mutation of top-level properties', () => {
      let captured = null;
      bus.subscribe('agent', msg => { captured = msg; });

      bus.send({ from: 'root', to: 'agent', type: 'secure_command', payload: { code: 1 } });
      assert.ok(captured);
      assert.strictEqual(Object.isFrozen(captured), true);

      assert.throws(() => {
        captured.type = 'hijacked_command';
      }, TypeError);
    });

    it('C3.4: should enforce ring buffer capacity on history and support history filtering', () => {
      const tinyBus = new InterHarnessEventBus({ maxHistory: 5 });

      for (let i = 1; i <= 10; i++) {
        tinyBus.send({ from: `sender_${i}`, to: 'dest', type: i % 2 === 0 ? 'even' : 'odd', payload: { i } });
      }

      const history = tinyBus.getHistory();
      assert.strictEqual(history.length, 5, 'History must not exceed maxHistory buffer limit');
      assert.strictEqual(history[0].payload.i, 6, 'Oldest messages 1-5 must have been evicted');
      assert.strictEqual(history[4].payload.i, 10);

      const evenMessages = tinyBus.getHistory({ type: 'even' });
      assert.strictEqual(evenMessages.length, 3); // 6, 8, 10
      evenMessages.forEach(m => assert.strictEqual(m.type, 'even'));
    });

    it('C3.5 [EMPIRICAL FINDING]: documents that bus accepts arbitrary message types by default without schema rejection', () => {
      // Worker handoff claimed: "validation (directive, status_query, status_response, emergency_stop, progress, completed, failed, data_exchange)"
      // Adversarial test verifies actual behavior: bus does not reject unlisted message types unless an interceptor is registered.
      const res = bus.send({ from: 'a', to: 'b', type: 'CUSTOM_UNDEFINED_TYPE_XY_123', payload: {} });
      assert.strictEqual(res.type, 'CUSTOM_UNDEFINED_TYPE_XY_123', 'Bus currently acts as an open envelope transport');
    });
  });

  // =========================================================================
  // SUITE 4: TrajectoryEngine Hierarchical Tree Stitching & Multi-Agent Models
  // =========================================================================
  describe('4. TrajectoryEngine Hierarchical Tree Stitching & Anchoring', () => {
    let engine;

    beforeEach(() => {
      engine = new TrajectoryEngine({ harnessId: 'parent_orch', role: 'orchestrator' });
    });

    it('C4.1: should stitch child trajectory anchored to matching spawnSubHarness step', () => {
      engine.recordStep({
        thought: 'Plan architecture',
        action: { tool: 'plan', params: {} },
        metrics: { durationMs: 10, tokensConsumed: 50 }
      });

      const spawnStep = engine.recordStep({
        thought: 'Delegating frontend build to worker_ui',
        action: { tool: 'spawnSubHarness', params: { id: 'worker_ui', role: 'frontend' } },
        metrics: { durationMs: 15, tokensConsumed: 100 }
      });

      const childEngine = new TrajectoryEngine({ harnessId: 'worker_ui', role: 'frontend' });
      childEngine.recordStep({
        thought: 'Create App component',
        action: { tool: 'replace_file_content', params: { file: 'App.js' } },
        metrics: { durationMs: 35, tokensConsumed: 250 }
      });
      childEngine.recordStep({
        thought: 'Create styles',
        action: { tool: 'replace_file_content', params: { file: 'App.css' } },
        metrics: { durationMs: 25, tokensConsumed: 150 }
      });

      const stitchRecord = engine.stitchChildTrajectory('worker_ui', childEngine, { role: 'frontend' });
      assert.strictEqual(stitchRecord.anchorStepId, spawnStep.id, 'Must automatically anchor to spawn step with matching ID');

      const tree = engine.getHierarchicalTree();
      assert.strictEqual(tree.length, 2, 'Root tree should have 2 steps');
      assert.strictEqual(tree[1].children.length, 2, 'Spawn step should contain 2 child steps');
      assert.strictEqual(tree[1].children[0].role, 'frontend');
      assert.strictEqual(tree[1].children[0].action.tool, 'replace_file_content');
      assert.strictEqual(tree[1].children[0].depth, 1);
      assert.strictEqual(tree[1].children[0].parentHarnessId, 'parent_orch');

      // Metric aggregation on sub_trajectory property
      assert.strictEqual(tree[1].sub_trajectory.tokensUsed, 400);
      assert.strictEqual(tree[1].sub_trajectory.durationMs, 60);
      assert.strictEqual(tree[1].sub_trajectory.stepCount, 2);
    });

    it('C4.2: should stitch multiple sub-harnesses anchored to their respective spawn steps', () => {
      engine.recordStep({
        thought: 'Spawn worker A',
        action: { tool: 'spawnSubHarness', params: { id: 'agent_a' } }
      });
      engine.recordStep({
        thought: 'Spawn worker B',
        action: { tool: 'spawnSubHarness', params: { id: 'agent_b' } }
      });

      const engineA = new TrajectoryEngine({ harnessId: 'agent_a', role: 'tester' });
      engineA.recordStep({ thought: 'Run test A', action: { tool: 'run_test' } });

      const engineB = new TrajectoryEngine({ harnessId: 'agent_b', role: 'auditor' });
      engineB.recordStep({ thought: 'Audit security', action: { tool: 'audit' } });
      engineB.recordStep({ thought: 'Verify report', action: { tool: 'report' } });

      engine.stitchChildTrajectory('agent_a', engineA, { role: 'tester' });
      engine.stitchChildTrajectory('agent_b', engineB, { role: 'auditor' });

      const tree = engine.getHierarchicalTree();
      assert.strictEqual(tree[0].children.length, 1);
      assert.strictEqual(tree[0].children[0].role, 'tester');
      assert.strictEqual(tree[1].children.length, 2);
      assert.strictEqual(tree[1].children[0].role, 'auditor');
      assert.strictEqual(tree[1].children[1].role, 'auditor');
    });

    it('C4.3: should support explicit anchorStepId override and fallback to latest parent step', () => {
      const s1 = engine.recordStep({ thought: 'Setup environment', action: { tool: 'init' } });
      const s2 = engine.recordStep({ thought: 'Middle work', action: { tool: 'compile' } });

      const child = new TrajectoryEngine({ harnessId: 'explicit_child', role: 'helper' });
      child.recordStep({ thought: 'Helper action', action: { tool: 'help' } });

      // Explicit anchor to step 1 rather than latest step
      engine.stitchChildTrajectory('explicit_child', child, { anchorStepId: s1.id, role: 'helper' });

      const tree = engine.getHierarchicalTree();
      assert.strictEqual(tree[0].children.length, 1, 'Child must attach to explicitly requested anchor step');
      assert.strictEqual(tree[1].children.length, 0);

      // Fallback anchor test: no spawn tool and no explicit anchorStepId -> binds to latest step (s2)
      const child2 = new TrajectoryEngine({ harnessId: 'fallback_child', role: 'helper' });
      child2.recordStep({ thought: 'Fallback action', action: { tool: 'fallback' } });
      engine.stitchChildTrajectory('fallback_child', child2);

      const tree2 = engine.getHierarchicalTree();
      assert.strictEqual(tree2[1].children.length, 1, 'Child without anchor must fall back to latest parent step');
    });

    it('C4.4: should create synthetic delegated_execution root node when stitching into empty parent trajectory', () => {
      const child = new TrajectoryEngine({ harnessId: 'orphan_child', role: 'worker' });
      child.recordStep({ thought: 'Task step 1', action: { tool: 'build' } });

      engine.stitchChildTrajectory('orphan_child', child, { role: 'worker' });

      const tree = engine.getHierarchicalTree();
      assert.strictEqual(tree.length, 1, 'Must create 1 synthetic node');
      assert.strictEqual(tree[0].type, 'spawn');
      assert.strictEqual(tree[0].action.tool, 'delegated_execution');
      assert.strictEqual(tree[0].children.length, 1);
      assert.strictEqual(tree[0].children[0].action.tool, 'build');
    });

    it('C4.5: should throw when childHarnessId is omitted during stitchChildTrajectory', () => {
      assert.throws(() => {
        engine.stitchChildTrajectory(null, []);
      }, /childHarnessId is required for stitching/);
      assert.throws(() => {
        engine.stitchChildTrajectory('', []);
      }, /childHarnessId is required for stitching/);
    });
  });

  // =========================================================================
  // SUITE 5: Flattened Timeline, Role Badges & Markdown Export
  // =========================================================================
  describe('5. Flattened Timeline, Hierarchical Indexing & Markdown Exporter', () => {
    let engine;

    beforeEach(() => {
      engine = new TrajectoryEngine({ harnessId: 'root', role: 'root' });
    });

    it('C5.1: should generate correct hierarchical indexing (1, 1.1, 1.2, 2) and role badges in flattened timeline', () => {
      engine.recordStep({
        thought: 'Root step 1',
        action: { tool: 'spawnSubHarness', params: { id: 'w1' } }
      });
      engine.recordStep({
        thought: 'Root step 2',
        action: { tool: 'final_verification' }
      });

      const w1 = new TrajectoryEngine({ harnessId: 'w1', role: 'developer' });
      w1.recordStep({ thought: 'Sub step 1', action: { tool: 'edit_code' } });
      w1.recordStep({ thought: 'Sub step 2', action: { tool: 'run_linter' } });

      engine.stitchChildTrajectory('w1', w1, { role: 'developer' });

      const timeline = engine.getFlattenedTimeline();
      assert.strictEqual(timeline.length, 4);

      assert.strictEqual(timeline[0].hierarchicalIndex, '1');
      assert.strictEqual(timeline[0].badgeText, '[ROOT]');
      assert.strictEqual(timeline[0].depth, 0);

      assert.strictEqual(timeline[1].hierarchicalIndex, '1.1');
      assert.strictEqual(timeline[1].badgeText, '[DEVELOPER]');
      assert.strictEqual(timeline[1].depth, 1);

      assert.strictEqual(timeline[2].hierarchicalIndex, '1.2');
      assert.strictEqual(timeline[2].badgeText, '[DEVELOPER]');
      assert.strictEqual(timeline[2].depth, 1);

      assert.strictEqual(timeline[3].hierarchicalIndex, '2');
      assert.strictEqual(timeline[3].badgeText, '[ROOT]');
      assert.strictEqual(timeline[3].depth, 0);
    });

    it('C5.2: should render hierarchical markdown table with tree indents, role badges and aggregated totals', () => {
      engine.recordStep({
        thought: 'Spawn sub-agent',
        action: { tool: 'spawnSubHarness', params: { id: 'coder' } },
        metrics: { durationMs: 10, tokensConsumed: 50 }
      });

      const child = new TrajectoryEngine({ harnessId: 'coder', role: 'coder' });
      child.recordStep({
        thought: 'Implement feature',
        action: { tool: 'replace_file_content', params: { file: 'main.js' } },
        observation: { result: 'Code patch applied cleanly' },
        metrics: { durationMs: 80, tokensConsumed: 400 }
      });

      engine.stitchChildTrajectory('coder', child, { role: 'coder' });

      const hierMd = engine.exportMarkdown({ hierarchical: true, title: 'Multi-Agent Run' });
      const flatMd = engine.exportMarkdown({ hierarchical: false, title: 'Multi-Agent Run' });

      // Verify Hierarchical Markdown
      assert.ok(hierMd.includes('# Multi-Agent Run'));
      assert.ok(hierMd.includes('## Hierarchical Trajectory Timeline'));
      assert.ok(hierMd.includes('| Step | Role | Tool | Status | Duration | Observation Summary |'));
      assert.ok(hierMd.includes('[ROOT]'));
      assert.ok(hierMd.includes('[CODER]'));
      assert.ok(hierMd.includes('&nbsp;&nbsp;↳ `replace_file_content`'));
      assert.ok(hierMd.includes('**Total Steps:** 2 (Hierarchical)'));
      assert.ok(hierMd.includes('**Total Duration:** 90ms'));
      assert.ok(hierMd.includes('**Est. Tokens:** 450'));

      // Verify Flat Markdown preserves backwards compatibility
      assert.ok(flatMd.includes('## Trajectory Step Timeline'));
      assert.ok(flatMd.includes('| Step | Tool | Status | Duration | Observation Summary |'));
      assert.ok(!flatMd.includes('[CODER]'), 'Flat markdown must not contain child role badges');
      assert.ok(flatMd.includes('**Total Steps:** 1'), 'Flat markdown only counts parent steps');
      assert.ok(flatMd.includes('**Total Duration:** 10ms'));
    });

    it('C5.3: should gracefully handle empty trajectory in both flat and hierarchical markdown export', () => {
      const flatEmpty = engine.exportMarkdown({ hierarchical: false });
      const hierEmpty = engine.exportMarkdown({ hierarchical: true });

      assert.ok(flatEmpty.includes('**Total Steps:** 0'));
      assert.ok(hierEmpty.includes('**Total Steps:** 0'));
    });
  });

  // =========================================================================
  // SUITE 6: Trajectory Immutability & Array Representation Challenge
  // =========================================================================
  describe('6. Trajectory Immutability & Array Representation Challenge', () => {
    let engine;

    beforeEach(() => {
      engine = new TrajectoryEngine();
    });

    it('C6.1: should prevent direct mutation of recorded trajectory events (deep freeze / getters)', () => {
      const event = engine.recordStep({
        thought: 'Original thought',
        action: { tool: 'view_file', params: { path: '/test.txt' } },
        metrics: { tokensConsumed: 100 }
      });

      // Top-level property assignment
      assert.throws(() => {
        event.thought = 'Tampered thought';
      }, TypeError);

      // Nested property assignment
      assert.throws(() => {
        event.action.tool = 'tampered_tool';
      }, TypeError);

      assert.throws(() => {
        event.metrics.tokensConsumed = 999999;
      }, TypeError);
    });

    it('C6.2: should return array slice from getEvents() and getTrajectory() to guard internal state', () => {
      engine.recordStep({ thought: 'Step 1' });
      const events = engine.getEvents();
      events.push({ thought: 'Fake Step 2' });

      assert.strictEqual(engine.events.length, 1, 'Internal events array must remain unmodified');
    });

    it('C6.3 [EMPIRICAL FINDING]: documents makeImmutableEvent degradation of arrays into plain objects', () => {
      // makeImmutableEvent converts arrays to plain objects with numerical keys { '0': ..., '1': ... }
      // This test empirically validates this behavior and documents its impact.
      const event = engine.recordStep({
        thought: 'Testing array in params',
        action: { tool: 'grep_search', params: { patterns: ['foo', 'bar'] } },
        children: []
      });

      // Verification: Array.isArray is false on event.action.params.patterns and event.children
      assert.strictEqual(Array.isArray(event.action.params.patterns), false);
      assert.strictEqual(typeof event.action.params.patterns, 'object');
      assert.strictEqual(event.action.params.patterns['0'], 'foo');
      assert.strictEqual(event.action.params.patterns['1'], 'bar');
      assert.strictEqual(Array.isArray(event.children), false);
    });
  });

  // =========================================================================
  // SUITE 7: Cascading Emergency Stop & Execution Lockdown
  // =========================================================================
  describe('7. Cascading Emergency Stop & Execution Lockdown', () => {
    let bus;
    let parentController;

    beforeEach(() => {
      bus = new InterHarnessEventBus();
      parentController = new HarnessController({ id: 'parent_controller', bus });
    });

    afterEach(() => {
      bus.clear();
    });

    it('C7.1: should cascade emergency stop across multi-tier hierarchy (Parent -> Child -> Grandchild)', () => {
      const child = parentController.spawnSubHarness({ id: 'child_1', role: 'manager' });
      const grandchild = child.controller.spawnSubHarness({ id: 'grandchild_1', role: 'worker' });
      const siblingChild = parentController.spawnSubHarness({ id: 'child_2', role: 'monitor' });

      assert.strictEqual(parentController.isHalted, false);
      assert.strictEqual(child.controller.isHalted, false);
      assert.strictEqual(grandchild.controller.isHalted, false);
      assert.strictEqual(siblingChild.controller.isHalted, false);

      // Targeted stop on child_1
      parentController.emergencyStopSubHarness('child_1', 'RESOURCE_RUNAWAY');

      assert.strictEqual(parentController.isHalted, false, 'Parent should not halt on targeted sub-stop');
      assert.strictEqual(child.controller.isHalted, true);
      assert.strictEqual(child.controller.status, 'halted');
      assert.strictEqual(child.controller.haltReason, 'RESOURCE_RUNAWAY');

      // Grandchild must cascade halt
      assert.strictEqual(grandchild.controller.isHalted, true, 'Grandchild must cascade halt');
      assert.strictEqual(grandchild.controller.status, 'halted');
      assert.strictEqual(grandchild.controller.haltReason, 'RESOURCE_RUNAWAY');

      // Sibling child_2 must remain untouched
      assert.strictEqual(siblingChild.controller.isHalted, false, 'Sibling child must remain active');
      assert.strictEqual(siblingChild.controller.status, 'initialized');
    });

    it('C7.2: should halt ALL descendant sub-harnesses when broadcast emergencyStopSubHarness is called', () => {
      const c1 = parentController.spawnSubHarness({ id: 'c1', role: 'w1' });
      const c2 = parentController.spawnSubHarness({ id: 'c2', role: 'w2' });
      const g1 = c1.controller.spawnSubHarness({ id: 'g1', role: 'gw1' });

      parentController.emergencyStopSubHarness(null, 'GLOBAL_KILL_SWITCH');

      assert.strictEqual(c1.controller.isHalted, true);
      assert.strictEqual(c2.controller.isHalted, true);
      assert.strictEqual(g1.controller.isHalted, true);
      assert.strictEqual(c1.controller.haltReason, 'GLOBAL_KILL_SWITCH');
      assert.strictEqual(c2.controller.haltReason, 'GLOBAL_KILL_SWITCH');
    });

    it('C7.3: should lock down canExecute and spawnSubHarness on halted controller', () => {
      const child = parentController.spawnSubHarness({ id: 'doomed_child' });
      parentController.emergencyStopSubHarness('doomed_child', 'FATAL_FAULT');

      // canExecute lockdown
      const check = child.controller.canExecute('view_file', {});
      assert.strictEqual(check.allowed, false);
      assert.strictEqual(check.code, 'HALTED');
      assert.match(check.reason, /Execution halted: FATAL_FAULT/);

      // spawnSubHarness lockdown
      assert.throws(() => {
        child.controller.spawnSubHarness({ id: 'illegal_spawn' });
      }, err => {
        return err.code === 'PARENT_HALTED' && /Parent harness is halted/.test(err.message);
      });
    });

    it('C7.4: should broadcast emergency_stop message over InterHarnessEventBus', () => {
      let busReceivedStop = false;
      let stopPayload = null;

      bus.subscribe('*', msg => {
        if (msg.type === 'emergency_stop') {
          busReceivedStop = true;
          stopPayload = msg.payload;
        }
      });

      parentController.spawnSubHarness({ id: 'sub_agent_x' });
      parentController.emergencyStopSubHarness('sub_agent_x', 'USER_INTERRUPT');

      assert.strictEqual(busReceivedStop, true);
      assert.strictEqual(stopPayload.reason, 'USER_INTERRUPT');
    });

    it('C7.5: should record emergency stop step into parent trajectory', () => {
      const trajectory = new TrajectoryEngine();
      const controller = new HarnessController({ id: 'orch_with_traj', bus, trajectory });

      controller.spawnSubHarness({ id: 'sub_z' });
      controller.emergencyStopSubHarness('sub_z', 'SECURITY_EXCEEDED');

      const events = trajectory.getEvents();
      const lastEvent = events[events.length - 1];

      assert.strictEqual(lastEvent.action.tool, 'emergency_stop');
      assert.strictEqual(lastEvent.status, 'error');
      assert.strictEqual(lastEvent.observation.error, 'SECURITY_EXCEEDED');
      assert.match(lastEvent.thought, /Emergency stop initiated for sub-harness \[sub_z\]/);
    });
  });
});
