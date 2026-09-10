'use strict';

const assert = require('assert');
const path = require('path');

const sunaAgentPath = path.resolve(__dirname, '../../suna_agent.js');
const sunaHarnessPath = path.resolve(__dirname, '../../suna_harness.js');

const SunaAgentModule = require(sunaAgentPath);
const SunaHarnessModule = require(sunaHarnessPath);

const { SunaAgent, JsonAutoRepair, MultiSyntaxParser, SmartMemory, OodaBrain } = SunaAgentModule;
const { VfsSandbox, VfsDiffEngine, AciSchemaValidator, AciInterface, RunawayGuardrails } = SunaHarnessModule;

console.log('=== Reviewer 1 Adversarial Stress Test ===\n');

// Test 1: JsonAutoRepair extreme edge cases
console.log('[Test 1] JsonAutoRepair stress test...');
const cases = [
  {
    input: `{"a": 1,, "b": 2,,, "c": 3}`,
    expected: { a: 1, b: 2, c: 3 }
  },
  {
    input: `{'key': 'it\\'s working', 'sub': {'inner': 'quoted \\'value\\''}}`,
    expected: { key: "it's working", sub: { inner: "quoted 'value'" } }
  },
  {
    input: `{"unclosed_str": "hello [world] {bracket} `,
    validator: (obj) => typeof obj.unclosed_str === 'string'
  },
  {
    input: `{"cutoff_colon": `,
    validator: (obj) => obj.cutoff_colon === null
  },
  {
    input: `{"list": [1, 2, {"item": "nested",`,
    validator: (obj) => Array.isArray(obj.list) && obj.list.length >= 2
  }
];

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const parsed = JsonAutoRepair.safeParse(c.input);
  if (c.expected) {
    assert.deepStrictEqual(parsed, c.expected, `Case ${i} failed`);
  } else if (c.validator) {
    assert.ok(c.validator(parsed), `Case ${i} failed validator`);
  }
}
console.log('  -> PASS: All JsonAutoRepair stress cases passed.');

// Test 2: MultiSyntaxParser interleaved tools and unclosed think
console.log('[Test 2] MultiSyntaxParser stress test...');
const mixedText = `
<think>
I need to inspect the code first.
<suna_tool_call tool="view_file">
{"path": "foo.js"}
</suna_tool_call>
Next I will edit it.
\`\`\`json
{
  "tool": "replace_file_content",
  "args": { "TargetFile": "foo.js", "TargetContent": "old", "ReplacementContent": "new" }
}
\`\`\`
`;

const parsedCalls = MultiSyntaxParser.parse(mixedText);
assert.strictEqual(parsedCalls.length, 2, 'Must extract both XML and Markdown calls');
assert.strictEqual(parsedCalls[0].tool, 'view_file');
assert.strictEqual(parsedCalls[1].tool, 'replace_file_content');

const thinkRes = MultiSyntaxParser.extractThinking(mixedText);
assert.ok(!thinkRes.thought.includes('<suna_tool_call'), 'Thinking block must not swallow tool call');
assert.ok(thinkRes.content.includes('<suna_tool_call'), 'Content must retain tool call');
console.log('  -> PASS: MultiSyntaxParser mixed parsing passed.');

// Test 3: Circuit Breaker & Consecutive Failures
console.log('[Test 3] Circuit Breaker stress test...');
(async () => {
  const agent = new SunaAgent({ id: 'stress_agent', maxConsecutiveFailures: 3 });
  const vfs = new VfsSandbox();
  agent.attachHarness({ vfs });

  let circuitTripped = false;
  agent.on('circuit_breaker_tripped', () => {
    circuitTripped = true;
  });

  // Call missing tool 3 times
  const res1 = await agent.executeStep({ tool: 'nonexistent_tool', params: { x: 1 } });
  assert.strictEqual(agent.status, 'idle', 'Should remain running/idle after failure 1');
  assert.strictEqual(agent.consecutiveFailures, 1);

  const res2 = await agent.executeStep({ tool: 'nonexistent_tool', params: { x: 2 } });
  assert.strictEqual(agent.status, 'idle', 'Should remain running/idle after failure 2');
  assert.strictEqual(agent.consecutiveFailures, 2);

  const res3 = await agent.executeStep({ tool: 'nonexistent_tool', params: { x: 3 } });
  assert.strictEqual(agent.status, 'halted', 'Should transition to halted after failure 3');
  assert.strictEqual(agent.consecutiveFailures, 3);
  assert.strictEqual(circuitTripped, true, 'Circuit breaker event must be emitted');

  // Next step should be immediately refused
  const res4 = await agent.executeStep({ tool: 'view_file', params: { path: 'any.js' } });
  assert.strictEqual(res4.status, 'halted');
  assert.strictEqual(res4.halted, true);

  // Steer resets failure counter
  agent.steer('Try another approach');
  assert.strictEqual(agent.consecutiveFailures, 0);

  console.log('  -> PASS: Circuit breaker tripped and reset on steer passed.');

  // Test 4: Unicode NFC Normalization in Code Surgery
  console.log('[Test 4] Unicode NFC Normalization stress test...');
  const composed = 'Đường về quê mẹ nắng vàng tươi';
  const decomposed = composed.normalize('NFD');
  assert.notStrictEqual(composed, decomposed, 'NFC and NFD strings must have different byte representations');

  vfs.writeFile('vietnamese.txt', composed);
  
  // Use decomposed string as TargetContent for replacement
  const repResult = vfs.replaceContent('vietnamese.txt', decomposed, 'Quê hương là chùm khế ngọt');
  assert.strictEqual(repResult.success, true, 'replaceContent must find match regardless of NFC/NFD');
  assert.strictEqual(vfs.readFile('vietnamese.txt'), 'Quê hương là chùm khế ngọt');

  // Verify VfsDiffEngine previewReplaceDiff with NFD
  vfs.writeFile('vietnamese2.txt', composed);
  const preview = VfsDiffEngine.previewReplaceDiff(vfs, 'vietnamese2.txt', decomposed, 'Mùa xuân hoa nở');
  assert.strictEqual(preview.wouldSucceed, true, 'previewReplaceDiff must succeed on NFD target');
  assert.strictEqual(preview.hasDiff, true, 'previewReplaceDiff must generate diff patch');

  console.log('  -> PASS: Unicode NFC/NFD normalization passed.');
  console.log('\n>>> ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY <<<');
})().catch(err => {
  console.error('STRESS TEST FAILED:', err);
  process.exit(1);
});
