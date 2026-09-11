'use strict';

const assert = require('assert');
const SunaAgent = require('../suna_agent.js');
const SunaHarness = require('../suna_harness.js');

describe('SunaAgent/SunaHarness runtime intelligence upgrade', function () {
  this.timeout(5000);

  let harness;
  let agent;

  beforeEach(() => {
    harness = SunaHarness.createHarness({
      maxTurns: 8,
      tokenBudget: 4000,
      timeoutMs: 1000
    });
    agent = new SunaAgent({ id: 'runtime_upgrade_agent' });
    agent.attachHarness(harness);
  });

  afterEach(() => {
    if (agent) agent.destroy();
    if (harness) harness.destroy();
  });

  it('runs a genuine observation-grounded ReAct loop until the decision provider returns final', async () => {
    harness.vfs.writeFile('main.js', 'const answer = 42;');
    const contexts = [];

    const result = await agent.run('Inspect the workspace and report the answer.', {
      maxTurns: 4,
      decideNextAction: async (context) => {
        contexts.push(context);
        if (context.turn === 1) {
          return { type: 'tool', tool: 'view_file', args: { path: 'main.js' } };
        }
        assert.ok(context.lastObservation.result.includes('const answer = 42;'));
        return { type: 'final', content: 'The answer is 42.' };
      }
    });

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.finalAnswer, 'The answer is 42.');
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].step.tool, 'view_file');
    assert.strictEqual(contexts.length, 2);
    assert.ok(contexts[0].tools.some(t => t.function.name === 'view_file'));
  });

  it('executes every explicit plan step in order instead of repeating step zero', async () => {
    harness.vfs.writeFile('a.txt', 'alpha');
    const result = await agent.run('Inspect then list.', {
      plan: [
        { id: 'inspect', tool: 'view_file', args: { path: 'a.txt' } },
        { id: 'list', tool: 'list_dir', args: { DirectoryPath: '' } }
      ],
      verify: ({ results }) => results.length === 2
    });

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.verified, true);
    assert.deepStrictEqual(result.results.map(r => r.step.tool), ['view_file', 'list_dir']);
  });

  it('does not claim success when an explicit completion verifier rejects the work', async () => {
    harness.vfs.writeFile('a.txt', 'alpha');
    const result = await agent.run('Inspect and verify.', {
      maxTurns: 2,
      plan: [{ tool: 'view_file', args: { path: 'a.txt' } }],
      verify: () => ({ passed: false, reason: 'Required mutation is missing' })
    });

    assert.strictEqual(result.status, 'verification_failed');
    assert.strictEqual(result.verified, false);
    assert.match(result.verification.reason, /mutation is missing/i);
  });

  it('bounds decision observations to protect weak laptops from huge tool output', async () => {
    harness.vfs.writeFile('large.txt', 'x'.repeat(20000));
    let observedLength = 0;

    const result = await agent.run('Inspect safely.', {
      maxTurns: 3,
      maxObservationChars: 512,
      decideNextAction: async (context) => {
        if (context.turn === 1) return { tool: 'view_file', args: { path: 'large.txt' } };
        observedLength = context.lastObservation.result.length;
        return { type: 'final', content: 'done' };
      }
    });

    assert.strictEqual(result.status, 'completed');
    assert.ok(observedLength <= 600, `observation was not bounded: ${observedLength}`);
    assert.strictEqual(result.results[0].observationTruncated, true);
  });

  it('honors AbortSignal between autonomous decisions', async () => {
    const abortController = new AbortController();
    const result = await agent.run('Stop safely.', {
      maxTurns: 5,
      signal: abortController.signal,
      decideNextAction: async () => {
        abortController.abort('user cancelled');
        return { tool: 'list_dir', args: {} };
      }
    });

    assert.strictEqual(result.status, 'aborted');
    assert.strictEqual(result.results.length, 0);
  });

  it('times out a stalled decision provider without hanging the session', async () => {
    const result = await agent.run('Do not hang.', {
      maxTurns: 2,
      decisionTimeoutMs: 20,
      decideNextAction: () => new Promise(() => {})
    });

    assert.strictEqual(result.status, 'timeout');
    assert.match(result.haltReason, /decision timed out/i);
  });

  it('createHarness forwards top-level turn, token, timeout, and resource options', () => {
    const local = SunaHarness.createHarness({
      maxTurns: 3,
      tokenBudget: 777,
      timeoutMs: 2222,
      resourceMeterOptions: { maxVirtualCpuMs: 10, maxMemoryBytes: 2048 }
    });
    try {
      assert.strictEqual(local.controller.maxTurns, 3);
      assert.strictEqual(local.controller.maxTokens, 777);
      assert.strictEqual(local.controller.timeoutMs, 2222);
      assert.ok(local.resourceMeter instanceof SunaHarness.VirtualResourceMeter);
      assert.strictEqual(local.controller.resourceMeter, local.resourceMeter);
    } finally {
      local.destroy();
    }
  });

  it('HarnessController awaits asynchronous tools and converts rejection to structured error', async () => {
    harness.controller.aci.async_failure = async () => {
      throw new Error('async boom');
    };

    const result = await harness.controller.executeAction('async_failure', {});
    assert.strictEqual(result.status, 'error');
    assert.match(result.error, /async boom/);
  });

  it('HarnessController enforces a real wall-clock timeout on stalled asynchronous tools', async () => {
    const local = SunaHarness.createHarness({ timeoutMs: 25 });
    local.controller.aci.never_returns = () => new Promise(() => {});
    try {
      const result = await local.controller.executeAction('never_returns', {});
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.code, 'EXECUTION_TIMEOUT');
      assert.strictEqual(local.controller.isHalted, true);
    } finally {
      local.destroy();
    }
  });

  it('propagates timeout cancellation to cooperative tools before they mutate state', async () => {
    const local = SunaHarness.createHarness({ timeoutMs: 20 });
    local.controller.aci.cooperative_mutation = async (_args, context) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (context.signal.aborted) return { status: 'aborted' };
      local.vfs.writeFile('late.txt', 'should not exist');
      return { status: 'success' };
    };
    try {
      const result = await local.controller.executeAction('cooperative_mutation', {});
      assert.strictEqual(result.code, 'EXECUTION_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.strictEqual(local.vfs.exists('late.txt'), false);
    } finally {
      local.destroy();
    }
  });

  it('does not invoke a tool when its supplied signal is already aborted', async () => {
    const local = SunaHarness.createHarness({ timeoutMs: 100 });
    const abortController = new AbortController();
    let invoked = false;
    local.controller.aci.must_not_run = () => {
      invoked = true;
      return { status: 'success' };
    };
    abortController.abort('cancelled before dispatch');
    try {
      const result = await local.controller.executeAction('must_not_run', {}, { signal: abortController.signal });
      assert.strictEqual(result.code, 'ABORTED');
      assert.strictEqual(invoked, false);
      assert.strictEqual(local.controller.turnsCompleted, 0);
    } finally {
      local.destroy();
    }
  });

  it('VirtualResourceMeter keeps bounded operation history', () => {
    const meter = new SunaHarness.VirtualResourceMeter({ maxOperationHistory: 25 });
    for (let i = 0; i < 1000; i++) meter.recordOperation(`op_${i}`, 0, 0);
    assert.strictEqual(meter.operations.length, 25);
    assert.strictEqual(meter.operations[0].name, 'op_975');
  });

  it('uses a fresh timeout budget for each action after an idle period', async () => {
    const local = SunaHarness.createHarness({ timeoutMs: 25 });
    local.controller.aci.quick_async = () => new Promise(resolve => setTimeout(() => resolve({ status: 'success' }), 5));
    try {
      await new Promise(resolve => setTimeout(resolve, 35));
      const result = await local.controller.executeAction('quick_async', {});
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(local.controller.isHalted, false);
    } finally {
      local.destroy();
    }
  });

  it('resets resource accounting with the harness controller', () => {
    const local = SunaHarness.createHarness({
      resourceMeterOptions: { maxVirtualCpuMs: 1, maxMemoryBytes: 1 }
    });
    try {
      local.resourceMeter.recordOperation('oversized', 2, 2);
      assert.strictEqual(local.resourceMeter.isThrottled(), true);
      local.reset({ resetVfs: false });
      assert.strictEqual(local.resourceMeter.isThrottled(), false);
      assert.strictEqual(local.resourceMeter.operations.length, 0);
      assert.strictEqual(local.resourceMeter.usedVirtualCpuMs, 0);
      assert.strictEqual(local.resourceMeter.usedMemoryBytes, 0);
    } finally {
      local.destroy();
    }
  });

  it('keeps the full typed observation for callers while bounding decision context', async () => {
    const rows = Array.from({ length: 200 }, (_, id) => ({ id, value: 'x'.repeat(20) }));
    harness.controller.aci.large_object = async () => ({ status: 'success', rows });
    let decisionObservationLength = 0;

    const result = await agent.run('Inspect structured data.', {
      maxTurns: 3,
      maxObservationChars: 256,
      decideNextAction: async (context) => {
        if (context.turn === 1) return { tool: 'large_object', args: {} };
        decisionObservationLength = context.lastObservation.result.length;
        return { type: 'final', content: 'done' };
      },
      verify: ({ results }) => results[0].observation.rows.length === rows.length
    });

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.results[0].observation.rows.length, rows.length);
    assert.strictEqual(result.results[0].observationTruncated, true);
    assert.ok(decisionObservationLength <= 350);
  });

  it('aborts promptly while an autonomous tool is still pending', async () => {
    const abortController = new AbortController();
    harness.controller.aci.never_returns = () => new Promise(() => {});
    setTimeout(() => abortController.abort('user cancelled pending tool'), 20);

    const started = Date.now();
    const result = await agent.run('Abort the pending tool.', {
      plan: [{ tool: 'never_returns', args: {} }],
      signal: abortController.signal,
      toolTimeoutMs: 1000
    });

    assert.strictEqual(result.status, 'aborted');
    assert.ok(Date.now() - started < 250, 'agent did not stop promptly after abort');
  });

  it('does not perform late bookkeeping after an aborted autonomous tool returns', async () => {
    const abortController = new AbortController();
    let onStepCalls = 0;
    harness.controller.aci.late_result = async (_args, context) => {
      await new Promise(resolve => setTimeout(resolve, 60));
      return { status: context.signal.aborted ? 'aborted' : 'success' };
    };
    setTimeout(() => abortController.abort('stop before bookkeeping'), 10);

    const result = await agent.run('Do not record a cancelled step.', {
      plan: [{ tool: 'late_result', args: {} }],
      signal: abortController.signal,
      toolTimeoutMs: 500,
      onStep: () => { onStepCalls++; }
    });
    const stateAtReturn = {
      trajectoryEvents: harness.trajectory.getEvents().length,
      memoryEpisodes: agent.memory.episodicMemory.length,
      status: agent.status,
      onStepCalls
    };

    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(result.status, 'aborted');
    assert.deepStrictEqual({
      trajectoryEvents: harness.trajectory.getEvents().length,
      memoryEpisodes: agent.memory.episodicMemory.length,
      status: agent.status,
      onStepCalls
    }, stateAtReturn);
    assert.strictEqual(stateAtReturn.trajectoryEvents, 0);
    assert.strictEqual(stateAtReturn.memoryEpisodes, 0);
    assert.strictEqual(stateAtReturn.onStepCalls, 0);
    assert.strictEqual(stateAtReturn.status, 'idle');
  });

  it('does not perform late bookkeeping after an autonomous tool times out', async () => {
    harness.controller.aci.late_timeout_result = async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
      return { status: 'success' };
    };

    const result = await agent.run('Do not record a timed-out step.', {
      plan: [{ tool: 'late_timeout_result', args: {} }],
      toolTimeoutMs: 10
    });
    const stateAtReturn = {
      trajectoryEvents: harness.trajectory.getEvents().length,
      memoryEpisodes: agent.memory.episodicMemory.length,
      status: agent.status
    };

    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(result.status, 'timeout');
    assert.deepStrictEqual({
      trajectoryEvents: harness.trajectory.getEvents().length,
      memoryEpisodes: agent.memory.episodicMemory.length,
      status: agent.status
    }, stateAtReturn);
    assert.strictEqual(stateAtReturn.trajectoryEvents, 0);
    assert.strictEqual(stateAtReturn.memoryEpisodes, 0);
    assert.strictEqual(stateAtReturn.status, 'idle');
  });

  it('reports the effective per-action timeout in halt diagnostics', async () => {
    const local = SunaHarness.createHarness({ timeoutMs: 1000 });
    local.controller.aci.never_returns_with_override = () => new Promise(() => {});
    try {
      const result = await local.controller.executeAction('never_returns_with_override', {}, { timeoutMs: 15 });
      assert.strictEqual(result.code, 'EXECUTION_TIMEOUT');
      assert.strictEqual(local.controller.haltDetails.timeoutMs, 15);
    } finally {
      local.destroy();
    }
  });

  it('rejects an explicitly empty plan instead of reporting verified success', async () => {
    const result = await agent.run('Do real work.', { plan: [] });
    assert.strictEqual(result.status, 'invalid_plan');
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.results.length, 0);
  });

  it('clears stale run diagnostics before a successful reused-agent run', async () => {
    const failed = await agent.run('First run times out.', {
      decisionTimeoutMs: 10,
      decideNextAction: () => new Promise(() => {})
    });
    assert.strictEqual(failed.status, 'timeout');
    assert.ok(failed.haltReason);

    const succeeded = await agent.run('Second run succeeds.', {
      decideNextAction: () => ({ type: 'final', content: 'ok' })
    });
    assert.strictEqual(succeeded.status, 'completed');
    assert.strictEqual(succeeded.haltReason, null);
  });
});
