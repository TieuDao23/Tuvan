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

  it('VirtualResourceMeter keeps bounded operation history', () => {
    const meter = new SunaHarness.VirtualResourceMeter({ maxOperationHistory: 25 });
    for (let i = 0; i < 1000; i++) meter.recordOperation(`op_${i}`, 0, 0);
    assert.strictEqual(meter.operations.length, 25);
    assert.strictEqual(meter.operations[0].name, 'op_975');
  });
});
