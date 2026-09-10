const assert = require('assert');
const { SunaAgent, JsonAutoRepair, MultiSyntaxParser, OodaBrain, SmartMemory } = require('../../suna_agent.js');
const SunaHarness = require('../../suna_harness.js');

console.log('=== RUNNING INDEPENDENT ADVERSARIAL STRESS TEST ===');

// Test 1: JsonAutoRepair with complex edge cases
const cases = [
  // 1. Triple consecutive commas and spaces
  { input: '{"a": 1,,,   "b": 2}', expected: { a: 1, b: 2 } },
  // 2. Dangling colon with complex nested structures
  { input: '{"user": {"name": "Alice", "tags": ["admin", "dev"], "meta":', expected: { user: { name: 'Alice', tags: ['admin', 'dev'], meta: null } } },
  // 3. Single quotes with apostrophe and escaped quotes
  { input: "{'message': 'Suna\\\'s AI is \"awesome\"!'}", expected: { message: 'Suna\'s AI is "awesome"!' } },
  // 4. Unicode smart quotes mixed with colons
  { input: '{\u201Ctitle\u201D: \u201CHồ Chí Minh: Bác Hồ\u201D, \u201Ccount\u201D: 100,}', expected: { title: 'Hồ Chí Minh: Bác Hồ', count: 100 } },
  // 5. Array cut off with trailing comma
  { input: '{"items": [1, 2, 3,', expected: { items: [1, 2, 3] } }
];

for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const parsed = JsonAutoRepair.safeParse(c.input);
  assert.deepStrictEqual(parsed, c.expected, `Case ${i + 1} failed: ${JSON.stringify(parsed)} vs ${JSON.stringify(c.expected)}`);
  console.log(`[PASS] JsonAutoRepair case ${i + 1}`);
}

// Test 2: MultiSyntaxParser with mixed XML and Markdown in arbitrary order and multiple tools
const streamText = `
I will inspect the files and perform surgery.
<think>
We need to check index.html first, then app.js.
Let's call the tools.
</think>
<suna_tool_call tool="view_file" id="call_1">
{ "path": "index.html" }
</suna_tool_call>
Here is another step in markdown:
\`\`\`json
{
  "name": "replace_file_content",
  "arguments": {
    "TargetFile": "app.js",
    "TargetContent": "old_code",
    "ReplacementContent": "new_code"
  }
}
\`\`\`
And a third tool with unquoted attribute:
<tool_call tool=list_dir>
{ "DirectoryPath": "src" }
</tool_call>
`;

const parsedCalls = MultiSyntaxParser.parse(streamText);
assert.strictEqual(parsedCalls.length, 3, `Expected 3 calls, got ${parsedCalls.length}`);
assert.strictEqual(parsedCalls[0].tool, 'view_file');
assert.strictEqual(parsedCalls[0].args.path, 'index.html');
assert.strictEqual(parsedCalls[1].tool, 'replace_file_content');
assert.strictEqual(parsedCalls[1].args.TargetFile, 'app.js');
assert.strictEqual(parsedCalls[2].tool, 'list_dir');
assert.strictEqual(parsedCalls[2].args.DirectoryPath, 'src');
console.log('[PASS] MultiSyntaxParser 3-tool mixed stream parsing');

// Test 3: Unclosed think tag with downstream tools
const unclosedThinkText = `<think>
I am thinking deeply about the problem...
<suna_tool_call tool='grep_search'>
{ "Query": "SunaAgent", "SearchPath": "." }
</suna_tool_call>
`;
const extracted = MultiSyntaxParser.extractThinking(unclosedThinkText);
assert.ok(extracted.thought.includes('thinking deeply'));
assert.ok(extracted.content.includes('<suna_tool_call'));
const toolsFromUnclosed = MultiSyntaxParser.parse(extracted.content);
assert.strictEqual(toolsFromUnclosed.length, 1);
assert.strictEqual(toolsFromUnclosed[0].tool, 'grep_search');
console.log('[PASS] Unclosed thinking boundary preservation');

// Test 4: Unicode NFC vs NFD equivalence in VFS replaceContent
const vfs = new SunaHarness.VfsSandbox();
// Decomposed NFD Vietnamese: "Tiếng Việt"
const nfdText = 'Tiê\u0301ng Viê\u0323t Nam';
// Composed NFC Vietnamese
const nfcTarget = 'Tiếng Việt Nam';
const replacement = 'Việt Nam muôn năm';

vfs.writeFile('vietnam.txt', nfdText);
const replaceRes = vfs.replaceContent('vietnam.txt', nfcTarget, replacement);
assert.strictEqual(replaceRes.success, true);
assert.strictEqual(vfs.readFile('vietnam.txt'), replacement);
console.log('[PASS] Unicode NFC/NFD equivalence in VFS surgery');

(async function run() {
// Test 5: Circuit Breaker halts on 3 consecutive failures
const agent = new SunaAgent({ maxConsecutiveFailures: 3 });
agent.attachHarness(new SunaHarness.HarnessController({ vfs }));

// Run 3 failing steps
for (let step = 1; step <= 3; step++) {
  const res = await agent.executeStep({ tool: 'replace_file_content', params: { TargetFile: 'non_existent.txt', TargetContent: 'a', ReplacementContent: 'b' } });
  console.log(`Step ${step} result status: ${res.status}, agent status: ${agent.status}`);
}

assert.strictEqual(agent.status, 'halted');
assert.strictEqual(agent.isAgentAborted, true);

// 4th step must be rejected
const fourthStep = await agent.executeStep('Do something else');
assert.strictEqual(fourthStep.status, 'halted');
assert.strictEqual(fourthStep.halted, true);
console.log('[PASS] Circuit breaker halts on 3 consecutive failures and locks execution');

console.log('=== ALL INDEPENDENT ADVERSARIAL STRESS TESTS PASSED ===');
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
