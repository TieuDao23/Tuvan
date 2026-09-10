'use strict';

/**
 * tests/test_challenger_suna_agent_adversarial.js
 * 
 * Challenger 1 Adversarial Fuzzing & Stress Test Suite for SunaAgent & SunaHarness
 * 
 * Focus Areas:
 * 1. Malformed JSON Auto-Repair Fuzzing:
 *    - Unclosed brackets & braces
 *    - Dangling & duplicate commas
 *    - Single quotes with escaped quotes
 *    - Truncated strings & stream cuts
 *    - Smart Unicode quotes (curly double/single)
 * 2. Multi-Syntax Parser Fuzzing:
 *    - Mixed XML tags and Markdown code blocks in a single stream
 *    - Malformed XML attributes (single quotes, missing quotes, extra attributes)
 *    - Unclosed <think>, <thought>, <scratchpad> tags
 * 3. Codex Code Surgery Fuzzing:
 *    - Complex Vietnamese UTF-8 diacritics (all tones, horn/bowl vowels, upper/lower)
 *    - Unicode normalization (NFC vs NFD)
 *    - Strict indentation preservation (tabs, spaces, mixed)
 * 4. Circuit Breaker & Runaway Detection:
 *    - Consecutive failures >= 3 halting
 *    - SunaAgent execution loop behavior under repeated failures
 *    - State reset on intermediate success
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

describe('Challenger 1: SunaAgent & SunaHarness Adversarial Stress & Fuzzing Suite', function() {
  this.timeout(30000);

  let SunaAgent;
  let JsonAutoRepair;
  let MultiSyntaxParser;
  let StreamParser;
  let ExtendedThinkingStreamParser;
  let SmartMemory;
  let OodaBrain;

  let SunaHarness;
  let VfsSandbox;
  let VfsDiffEngine;
  let AciSchemaValidator;
  let AciInterface;
  let HarnessController;
  let TrajectoryEngine;
  let CheckpointManager;
  let RunawayGuardrails;

  before(function() {
    // 1. Load SunaHarness
    const harnessPath = path.resolve(__dirname, '../suna_harness.js');
    assert.strictEqual(fs.existsSync(harnessPath), true, 'suna_harness.js must exist on disk');
    SunaHarness = require(harnessPath);

    VfsSandbox = SunaHarness.VfsSandbox;
    VfsDiffEngine = SunaHarness.VfsDiffEngine;
    AciSchemaValidator = SunaHarness.AciSchemaValidator;
    AciInterface = SunaHarness.AciInterface;
    HarnessController = SunaHarness.HarnessController;
    TrajectoryEngine = SunaHarness.TrajectoryEngine;
    CheckpointManager = SunaHarness.CheckpointManager;
    RunawayGuardrails = SunaHarness.RunawayGuardrails;

    // 2. Load SunaAgent
    const agentPath = path.resolve(__dirname, '../suna_agent.js');
    assert.strictEqual(fs.existsSync(agentPath), true, 'suna_agent.js must exist on disk');
    delete require.cache[require.resolve(agentPath)];
    const agentModule = require(agentPath);
    SunaAgent = agentModule.SunaAgent || agentModule;
    JsonAutoRepair = SunaAgent.JsonAutoRepair || agentModule.JsonAutoRepair;
    MultiSyntaxParser = SunaAgent.MultiSyntaxParser || agentModule.MultiSyntaxParser;
    StreamParser = SunaAgent.StreamParser || agentModule.StreamParser;
    ExtendedThinkingStreamParser = SunaAgent.ExtendedThinkingStreamParser || agentModule.ExtendedThinkingStreamParser;
    SmartMemory = SunaAgent.SmartMemory || agentModule.SmartMemory;
    OodaBrain = SunaAgent.OodaBrain || agentModule.OodaBrain;
  });

  // =========================================================================
  // SECTION 1: MALFORMED JSON REPAIR FUZZING
  // =========================================================================
  describe('1. Malformed JSON Repair Stress & Fuzzing (JsonAutoRepair)', function() {

    describe('1.1 Unclosed Brackets & Braces Balancing', function() {
      it('F1.1.1: should repair singly unclosed object', function() {
        const raw = '{"tool": "view_file", "args": {"path": "index.js"';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.deepStrictEqual(parsed, { tool: 'view_file', args: { path: 'index.js' } });
      });

      it('F1.1.2: should repair deeply unclosed nested objects and arrays', function() {
        const raw = '{"a": {"b": [1, {"c": [2, 3';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.deepStrictEqual(parsed, { a: { b: [1, { c: [2, 3] }] } });
      });

      it('F1.1.3: should repair unclosed array of objects', function() {
        const raw = '[{"id": 1}, {"id": 2}, {"id": 3';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.strictEqual(Array.isArray(parsed), true);
        assert.strictEqual(parsed.length, 3);
        assert.strictEqual(parsed[2].id, 3);
      });

      it('F1.1.4: should not over-balance already balanced braces', function() {
        const raw = '{"tool": "list_dir", "args": {}}';
        const repaired = JsonAutoRepair.repair(raw);
        assert.strictEqual(repaired, '{"tool": "list_dir", "args": {}}');
      });
    });

    describe('1.2 Dangling and Malformed Commas', function() {
      it('F1.2.1: should strip dangling comma before closing brace in object', function() {
        const raw = '{"name": "test", "active": true, }';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.deepStrictEqual(parsed, { name: 'test', active: true });
      });

      it('F1.2.2: should strip dangling comma before closing bracket in array', function() {
        const raw = '{"items": ["a", "b", "c", ], }';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.deepStrictEqual(parsed, { items: ['a', 'b', 'c'] });
      });

      it('F1.2.3: should handle multiline dangling commas with whitespace', function() {
        const raw = '{\n  "tool": "view_file",\n  "params": {\n    "path": "app.js",\n  },\n}';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.strictEqual(parsed.tool, 'view_file');
        assert.strictEqual(parsed.params.path, 'app.js');
      });

      it('F1.2.4: CHALLENGE - double consecutive commas: {"a": 1,, "b": 2}', function() {
        const raw = '{"a": 1,, "b": 2}';
        try {
          const parsed = JsonAutoRepair.safeParse(raw);
          assert.strictEqual(parsed.a, 1);
          assert.strictEqual(parsed.b, 2);
        } catch (err) {
          // Record empirical failure
          assert.fail(`JsonAutoRepair failed on double comma: ${err.message}`);
        }
      });
    });

    describe('1.3 Single Quotes with Escaped & Nested Quotes', function() {
      it('F1.3.1: should convert simple single-quoted JSON to double-quoted JSON', function() {
        const raw = "{'tool': 'view_file', 'args': {'path': 'main.js'}}";
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.deepStrictEqual(parsed, { tool: 'view_file', args: { path: 'main.js' } });
      });

      it('F1.3.2: CHALLENGE - single quote containing escaped single quote: {\'msg\': \'It\\\'s working\'}', function() {
        const raw = "{'msg': 'It\\'s working'}";
        try {
          const parsed = JsonAutoRepair.safeParse(raw);
          assert.strictEqual(parsed.msg, "It's working");
        } catch (err) {
          assert.fail(`JsonAutoRepair failed on single quote with escaped quote: ${err.message}`);
        }
      });

      it('F1.3.3: CHALLENGE - single quoted JSON containing double quotes: {\'quote\': \'He said "hello"\'}', function() {
        const raw = "{'quote': 'He said \"hello\"'}";
        try {
          const parsed = JsonAutoRepair.safeParse(raw);
          assert.strictEqual(parsed.quote, 'He said "hello"');
        } catch (err) {
          assert.fail(`JsonAutoRepair failed on inner double quotes: ${err.message}`);
        }
      });
    });

    describe('1.4 Truncated Strings from Stream Cutoffs', function() {
      it('F1.4.1: should repair string cut off mid-value and close object', function() {
        const raw = '{"tool": "view_file", "path": "src/components/nav';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.strictEqual(parsed.tool, 'view_file');
        assert.strictEqual(parsed.path, 'src/components/nav');
      });

      it('F1.4.2: should repair string cut off inside nested array', function() {
        const raw = '{"lines": ["line 1", "line 2", "line 3 incom';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.strictEqual(parsed.lines.length, 3);
        assert.strictEqual(parsed.lines[2], 'line 3 incom');
      });

      it('F1.4.3: CHALLENGE - cut off immediately after colon: {"tool":', function() {
        const raw = '{"tool": ';
        try {
          const parsed = JsonAutoRepair.safeParse(raw);
          assert.ok(parsed !== null);
        } catch (err) {
          // Truncation after colon without value produces invalid JSON {"tool":}
          assert.fail(`JsonAutoRepair failed on truncation after colon: ${err.message}`);
        }
      });
    });

    describe('1.5 Smart Unicode Quotes Normalization', function() {
      it('F1.5.1: should normalize curly double quotes: “tool”: “view_file”', function() {
        const raw = '{\u201Ctool\u201D: \u201Cview_file\u201D, \u201Cargs\u201D: {\u201Cpath\u201D: \u201Ctest.js\u201D}}';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.deepStrictEqual(parsed, { tool: 'view_file', args: { path: 'test.js' } });
      });

      it('F1.5.2: should normalize curly single quotes: ‘tool’: ‘view_file’', function() {
        const raw = '{\u2018tool\u2019: \u2018view_file\u2019, \u2018args\u2019: {\u2018path\u2019: \u2018test.js\u2019}}';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.deepStrictEqual(parsed, { tool: 'view_file', args: { path: 'test.js' } });
      });

      it('F1.5.3: CHALLENGE - smart apostrophe inside double-quoted string value: {"msg": "Don’t stop"}', function() {
        const raw = '{"msg": "Don\u2019t stop"}';
        const parsed = JsonAutoRepair.safeParse(raw);
        assert.ok(parsed.msg.includes('stop'));
      });
    });
  });

  // =========================================================================
  // SECTION 2: MULTI-SYNTAX PARSING FUZZING
  // =========================================================================
  describe('2. Multi-Syntax Parser Stress & Fuzzing (MultiSyntaxParser)', function() {

    describe('2.1 Mixed XML and Markdown in Single Stream', function() {
      it('F2.1.1: CHALLENGE - single stream containing both XML tool call AND Markdown json block', function() {
        const stream = [
          'I will first read the config file:',
          '<suna_tool_call tool="view_file">',
          '{"path": "config.json"}',
          '</suna_tool_call>',
          'Then I will list the directory:',
          '```json',
          '{"tool": "list_dir", "args": {"DirectoryPath": "src"}}',
          '```'
        ].join('\n');

        const calls = MultiSyntaxParser.parse(stream);
        // Expect both tool calls to be recognized in a single stream
        assert.strictEqual(calls.length, 2, `Expected 2 tool calls, but parsed ${calls.length}: ${JSON.stringify(calls)}`);
        assert.strictEqual(calls[0].tool, 'view_file');
        assert.strictEqual(calls[1].tool, 'list_dir');
      });

      it('F2.1.2: CHALLENGE - Markdown block before XML tool call in single stream', function() {
        const stream = [
          '```json',
          '{"tool": "grep_search", "args": {"Query": "TODO"}}',
          '```',
          'Also running this tool:',
          '<suna_tool_call tool="find_by_name">',
          '{"Pattern": "*.ts"}',
          '</suna_tool_call>'
        ].join('\n');

        const calls = MultiSyntaxParser.parse(stream);
        assert.strictEqual(calls.length, 2, `Expected 2 tool calls, got ${calls.length}`);
      });
    });

    describe('2.2 Malformed XML Attributes', function() {
      it('F2.2.1: CHALLENGE - single quotes in XML tool attribute: <suna_tool_call tool=\'view_file\'>', function() {
        const text = '<suna_tool_call tool=\'view_file\'>{"path": "a.js"}</suna_tool_call>';
        const calls = MultiSyntaxParser.parse(text);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].tool, 'view_file');
      });

      it('F2.2.2: CHALLENGE - "name" attribute instead of "tool": <suna_tool_call name="view_file">', function() {
        const text = '<suna_tool_call name="view_file">{"path": "a.js"}</suna_tool_call>';
        const calls = MultiSyntaxParser.parse(text);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].tool, 'view_file');
      });

      it('F2.2.3: CHALLENGE - unquoted attribute: <suna_tool_call tool=view_file>', function() {
        const text = '<suna_tool_call tool=view_file>{"path": "a.js"}</suna_tool_call>';
        const calls = MultiSyntaxParser.parse(text);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].tool, 'view_file');
      });

      it('F2.2.4: extra attributes in tool call tag: <suna_tool_call tool="view_file" id="call_1" timeout="3000">', function() {
        const text = '<suna_tool_call tool="view_file" id="call_1" timeout="3000">{"path": "a.js"}</suna_tool_call>';
        const calls = MultiSyntaxParser.parse(text);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].tool, 'view_file');
      });
    });

    describe('2.3 Unclosed Thinking Tags', function() {
      it('F2.3.1: unclosed <think> tag at end of text', function() {
        const text = 'User asked a question.<think>I need to reflect on this';
        const { thought, content } = MultiSyntaxParser.extractThinking(text);
        assert.strictEqual(thought, 'I need to reflect on this');
        assert.strictEqual(content, 'User asked a question.');
      });

      it('F2.3.2: CHALLENGE - unclosed <think> tag at beginning of text preceding a tool call', function() {
        const text = '<think>I should view the file\n<suna_tool_call tool="view_file">{"path": "x.js"}</suna_tool_call>';
        const { thought, content } = MultiSyntaxParser.extractThinking(text);
        // If content is empty because unclosed regex swallowed the entire text, tool call is lost!
        assert.ok(content.includes('<suna_tool_call'), `Tool call swallowed into thought: thought="${thought}", content="${content}"`);
      });

      it('F2.3.3: unclosed <scratchpad> tag', function() {
        const text = 'Answer prefix<scratchpad>Internal thoughts in scratchpad';
        const { thought, content } = MultiSyntaxParser.extractThinking(text);
        assert.strictEqual(thought, 'Internal thoughts in scratchpad');
        assert.strictEqual(content, 'Answer prefix');
      });
    });
  });

  // =========================================================================
  // SECTION 3: CODEX CODE SURGERY & VIETNAMESE UTF-8 FUZZING
  // =========================================================================
  describe('3. Codex Code Surgery & Vietnamese UTF-8 Fuzzing (VfsDiffEngine & AciInterface)', function() {
    let vfs;
    let aci;

    beforeEach(function() {
      vfs = new VfsSandbox();
      aci = new AciInterface(vfs);
    });

    it('F3.1: should replace code containing full Vietnamese diacritical alphabet (tones + vowels)', async function() {
      const original = [
        '// Cấu hình ngôn ngữ hệ thống',
        'const welcomeMessage = "Hello World";',
        'const supportInfo = "None";'
      ].join('\n');

      const vnReplacement = [
        '// Cấu hình ngôn ngữ hệ thống',
        'const welcomeMessage = "Chào mừng bạn đến với hệ thống SunaAgent!";',
        'const supportInfo = "Hỗ trợ tiếng Việt: á à ả ã ạ, ă ắ ằ ẳ ẵ ặ, â ấn ầ ổ ỗ ộ, é è ẻ ẽ ẹ, ê ế ề ể ễ ệ, í ì ỉ ĩ ị, ó ò ỏ õ ọ, ô ố ồ ổ ỗ ộ, ơ ớ ờ ở ỡ ợ, ú ù ủ ũ ụ, ư ứ ừ ử ữ ự, ý ỳ ỷ ỹ ỵ, đ Đ";'
      ].join('\n');

      vfs.writeFile('lang.js', original);

      await aci.replace_file_content({
        TargetFile: 'lang.js',
        TargetContent: original,
        ReplacementContent: vnReplacement
      });

      const updated = vfs.readFile('lang.js');
      assert.strictEqual(updated, vnReplacement);
      assert.ok(updated.includes('Chào mừng bạn đến với hệ thống SunaAgent!'));
      assert.ok(updated.includes('Hỗ trợ tiếng Việt:'));
    });

    it('F3.2: CHALLENGE - Unicode Normalization NFC vs NFD equivalence in code surgery', async function() {
      // In Vietnamese, "Tiếng Việt" can be encoded as precomposed NFC or decomposed NFD
      const nfcString = 'Tiếng Việt có dấu';
      const nfdString = nfcString.normalize('NFD');
      assert.notStrictEqual(nfcString, nfdString, 'NFC and NFD byte sequences must differ');

      vfs.writeFile('test_nfc.txt', `Header\n${nfcString}\nFooter`);

      // Attempt surgery using NFD string as TargetContent
      try {
        await aci.replace_file_content({
          TargetFile: 'test_nfc.txt',
          TargetContent: nfdString,
          ReplacementContent: 'Tiếng Việt chuẩn hóa NFC thành công'
        });
        const content = vfs.readFile('test_nfc.txt');
        assert.ok(content.includes('Tiếng Việt chuẩn hóa NFC thành công'));
      } catch (err) {
        assert.fail(`Code surgery failed on Unicode NFC/NFD mismatch: ${err.message}`);
      }
    });

    it('F3.3: Indentation preservation with nested tabs and spaces', async function() {
      const originalCode = [
        'function renderTree(node) {',
        '\tif (!node) {',
        '\t\treturn null;',
        '\t}',
        '\treturn {',
        '\t\tid: node.id,',
        '\t\tchildren: node.children',
        '\t};',
        '}'
      ].join('\n');

      vfs.writeFile('tree.js', originalCode);

      const targetBlock = [
        '\treturn {',
        '\t\tid: node.id,',
        '\t\tchildren: node.children',
        '\t};'
      ].join('\n');

      const replacementBlock = [
        '\treturn {',
        '\t\tid: node.id,',
        '\t\tname: node.name,',
        '\t\tchildren: node.children',
        '\t};'
      ].join('\n');

      await aci.replace_file_content({
        TargetFile: 'tree.js',
        TargetContent: targetBlock,
        ReplacementContent: replacementBlock
      });

      const updated = vfs.readFile('tree.js');
      assert.ok(updated.includes('\t\tname: node.name,'));
      // Verify tabs are preserved
      assert.strictEqual(updated.startsWith('function renderTree(node) {\n\tif (!node) {'), true);
    });

    it('F3.4: Unified Diff generation on Vietnamese text mutation', function() {
      const before = 'Xin chào thế giới';
      const after = 'Xin chào Việt Nam tươi đẹp';
      vfs.writeFile('greet.txt', before);

      const diff = VfsDiffEngine.previewReplaceDiff(vfs, 'greet.txt', before, after);
      assert.strictEqual(diff.wouldSucceed, true);
      assert.ok(diff.patch.includes('-Xin chào thế giới'));
      assert.ok(diff.patch.includes('+Xin chào Việt Nam tươi đẹp'));
    });
  });

  // =========================================================================
  // SECTION 4: CIRCUIT BREAKER & RUNAWAY DETECTION FUZZING
  // =========================================================================
  describe('4. Circuit Breaker & Consecutive Failures (>= 3) Fuzzing', function() {

    describe('4.1 RunawayGuardrails Unit Bounds', function() {
      it('F4.1.1: should trigger circuit breaker when identical tool failure reaches 3', function() {
        const guard = new RunawayGuardrails({ maxConsecutiveFailures: 3 });
        const f1 = guard.recordFailure('view_file', { path: 'nonexistent.js' });
        assert.strictEqual(f1.halted, false);
        const f2 = guard.recordFailure('view_file', { path: 'nonexistent.js' });
        assert.strictEqual(f2.halted, false);
        const f3 = guard.recordFailure('view_file', { path: 'nonexistent.js' });
        assert.strictEqual(f3.halted, true);
        assert.strictEqual(f3.triggered, true);
        assert.ok(f3.reason.includes('failed 3 consecutive times'));
      });

      it('F4.1.2: should reset failure counter upon intermediate success', function() {
        const guard = new RunawayGuardrails({ maxConsecutiveFailures: 3 });
        guard.recordFailure('view_file', { path: 'nonexistent.js' });
        guard.recordFailure('view_file', { path: 'nonexistent.js' });
        // Intermediate success
        guard.recordSuccess('view_file', { path: 'nonexistent.js' });
        // Another failure should now be at count 1, not 3
        const f3 = guard.recordFailure('view_file', { path: 'nonexistent.js' });
        assert.strictEqual(f3.halted, false);
        assert.strictEqual(f3.count, 1);
      });

      it('F4.1.3: CHALLENGE - consecutive failures across DIFFERENT parameters: path "a.js", "b.js", "c.js"', function() {
        const guard = new RunawayGuardrails({ maxConsecutiveFailures: 3 });
        const f1 = guard.recordFailure('view_file', { path: 'a.js' });
        const f2 = guard.recordFailure('view_file', { path: 'b.js' });
        const f3 = guard.recordFailure('view_file', { path: 'c.js' });
        // Verify whether guardrails checks tool-level consecutive failure or only identical param failure
        // Document empirical finding
        assert.ok(typeof f3.halted === 'boolean');
      });
    });

    describe('4.2 SunaAgent Autonomous Execution Loop Circuit Breaker', function() {
      it('F4.2.1: CHALLENGE - SunaAgent halts execution when consecutive step failures >= 3', async function() {
        const vfs = new VfsSandbox();
        const trajectory = new TrajectoryEngine();
        const checkpoints = new CheckpointManager({ vfs });
        const controller = new HarnessController({ vfs, trajectory, checkpoints });

        const agent = new SunaAgent({ id: 'circuit_breaker_test_agent' });
        agent.attachHarness(controller);

        // Force intentional failures by invoking missing tool
        agent.brain.planHierarchy = () => [
          { id: 1, name: 'failing_step', tool: 'nonexistent_tool', params: { x: 1 } }
        ];

        // Step 1: failure
        const step1 = await agent.executeStep('fail 1');
        assert.strictEqual(step1.status, 'failed');

        // Step 2: failure
        const step2 = await agent.executeStep('fail 2');
        assert.strictEqual(step2.status, 'failed');

        // Step 3: failure -> Circuit breaker MUST trip and halt agent!
        const step3 = await agent.executeStep('fail 3');
        assert.strictEqual(step3.status, 'failed');

        // Verify SunaAgent halted state
        assert.strictEqual(agent.status, 'halted', `Expected agent.status to be "halted" after 3 consecutive failures, but got "${agent.status}"`);
      });
    });
  });

  // =========================================================================
  // SECTION 5: EXTREME MALFORMED JSON EDGE CASE FUZZING (JsonAutoRepair)
  // =========================================================================

  describe('5. Extreme Malformed JSON Edge Case Fuzzing (JsonAutoRepair)', function() {
    it('F5.1: should safely repair truncated trailing backslash at end of stream', function() {
      const raw = '{"path": "C:\\\\Users\\\\Admin\\\\';
      const repaired = JsonAutoRepair.repair(raw);
      assert.doesNotThrow(() => JSON.parse(repaired));
      const parsed = JSON.parse(repaired);
      assert.ok(typeof parsed.path === 'string');
    });

    it('F5.2: should safely repair incomplete unicode escape sequence at cutoff', function() {
      const raw = '{"token": "auth_\\u004';
      const repaired = JsonAutoRepair.repair(raw);
      assert.doesNotThrow(() => JSON.parse(repaired));
      const parsed = JSON.parse(repaired);
      assert.ok(typeof parsed.token === 'string');
    });

    it('F5.3: should remove leading commas inside objects: {, "a": 1, "b": 2}', function() {
      const raw = '{, "a": 1, "b": 2}';
      const repaired = JsonAutoRepair.repair(raw);
      assert.doesNotThrow(() => JSON.parse(repaired));
      const parsed = JSON.parse(repaired);
      assert.strictEqual(parsed.a, 1);
      assert.strictEqual(parsed.b, 2);
    });

    it('F5.4: should remove leading commas inside arrays: [, 10, 20]', function() {
      const raw = '[, 10, 20]';
      const repaired = JsonAutoRepair.repair(raw);
      assert.doesNotThrow(() => JSON.parse(repaired));
      const parsed = JSON.parse(repaired);
      assert.deepStrictEqual(parsed, [10, 20]);
    });

    it('F5.5: should auto-quote unquoted numeric keys: { 123: "val" }', function() {
      const raw = '{ 123: "val", 456: "num" }';
      const repaired = JsonAutoRepair.repair(raw);
      assert.doesNotThrow(() => JSON.parse(repaired));
      const parsed = JSON.parse(repaired);
      assert.strictEqual(parsed['123'], 'val');
      assert.strictEqual(parsed['456'], 'num');
    });

    it('F5.6: should auto-quote unquoted dotted keys: { app.config.port: 8080 }', function() {
      const raw = '{ app.config.port: 8080, db.host: "localhost" }';
      const repaired = JsonAutoRepair.repair(raw);
      assert.doesNotThrow(() => JSON.parse(repaired));
      const parsed = JSON.parse(repaired);
      assert.strictEqual(parsed['app.config.port'], 8080);
      assert.strictEqual(parsed['db.host'], 'localhost');
    });

    it('F5.7: should auto-complete mid-primitive cutoffs: tru -> true, fal -> false, nul -> null', function() {
      const raw = '{"is_active": tru, "is_admin": fal, "data": nul}';
      const repaired = JsonAutoRepair.repair(raw);
      assert.doesNotThrow(() => JSON.parse(repaired));
      const parsed = JSON.parse(repaired);
      assert.strictEqual(parsed.is_active, true);
      assert.strictEqual(parsed.is_admin, false);
      assert.strictEqual(parsed.data, null);
    });
  });

  // =========================================================================
  // SECTION 6: SMARTMEMORY ADAPTIVE CONTEXT COMPRESSION & HASH INDEX
  // =========================================================================

  describe('6. SmartMemory Adaptive Context Compression & Hash-Indexed Working Memory', function() {
    it('F6.1: should compute retention score S(e) reflecting information density and recency weighting', function() {
      const mem = new SmartMemory();
      const archEp = { type: 'arch', thought: 'Architecture rule', action: { tool: 'plan' } };
      const inspectEp = { type: 'step', action: { tool: 'view_file', params: { path: 'a.js' } } };

      const archScore = mem.computeRetentionScore(archEp, 0, 10);
      const inspectScore = mem.computeRetentionScore(inspectEp, 0, 10);

      assert.ok(archScore.isCore, 'Architectural episode must be marked core');
      assert.ok(!inspectScore.isCore, 'Inspection episode must not be marked core');
      assert.ok(archScore.score > inspectScore.score, 'Architectural score must exceed inspection score');
    });

    it('F6.2: should preserve 100% of core architectural decisions across multi-turn compaction', function() {
      const mem = new SmartMemory({ maxTokens: 90 });
      mem.recordEpisode({ type: 'arch', isArchitectural: true, thought: 'Decision: SQLite storage engine', action: { tool: 'setup' } });
      mem.recordEpisode({ type: 'steer', isSteerDirective: true, thought: 'Steer: prioritize security first', action: { tool: 'steer' } });

      for (let i = 0; i < 8; i++) {
        mem.recordEpisode({
          action: { tool: 'view_file', params: { path: `log_${i}.txt` } },
          observation: `log content ${i}`
        });
      }

      // Verify that episodicMemory compacted older non-core events
      assert.ok(mem.episodicMemory.length < 10);
      assert.strictEqual(mem.episodicMemory[0].type, 'compacted_summary');

      // Verify 100% preservation of core episodes
      const hasArch = mem.episodicMemory.some(e => e.type === 'arch' || e.isArchitectural);
      const hasSteer = mem.episodicMemory.some(e => e.type === 'steer' || e.isSteerDirective);
      assert.strictEqual(hasArch, true, 'Core architectural decision must be preserved 100%');
      assert.strictEqual(hasSteer, true, 'Core steer directive must be preserved 100%');
    });

    it('F6.3: should maintain rolling 32-bit FNV-1a state hash reflecting working memory mutations in O(1)', function() {
      const mem = new SmartMemory();
      const h0 = mem.getStateHash();
      assert.ok(typeof h0 === 'string' && h0.length === 8);

      mem.setFact('arch:engine', 'vfs');
      const h1 = mem.getStateHash();
      assert.notStrictEqual(h1, h0, 'State hash must mutate on fact addition');

      mem.setFact('steer:max_turns', 15);
      const h2 = mem.getStateHash();
      assert.notStrictEqual(h2, h1, 'State hash must mutate on second fact');

      mem.deleteFact('steer:max_turns');
      const h3 = mem.getStateHash();
      assert.strictEqual(h3, h1, 'State hash must revert deterministically when fact is deleted');
    });

    it('F6.4: should support namespaced retrieval by prefix: arch:, steer:, facts:', function() {
      const mem = new SmartMemory();
      mem.setFact('arch:pattern', 'event_driven');
      mem.setFact('arch:ui', 'glassmorphism');
      mem.setFact('steer:lang', 'vietnamese');
      mem.setFact('facts:version', '2.5');

      const archFacts = mem.getByNamespace('arch');
      assert.strictEqual(Object.keys(archFacts).length, 2);
      assert.strictEqual(archFacts['arch:pattern'], 'event_driven');
      assert.strictEqual(archFacts['arch:ui'], 'glassmorphism');

      const steerFacts = mem.getByPrefix('steer:');
      assert.strictEqual(steerFacts['steer:lang'], 'vietnamese');
    });

    it('F6.5: should maintain inverted tag index for fast O(1) fact lookups', function() {
      const mem = new SmartMemory();
      mem.setFact('token_limit', 50000, ['budget', 'critical']);
      mem.setFact('turn_limit', 25, ['budget']);

      const budgetFacts = mem.getFactsByTag('budget');
      assert.strictEqual(budgetFacts.length, 2);

      const criticalFacts = mem.getFactsByTag('critical');
      assert.strictEqual(criticalFacts.length, 1);
      assert.strictEqual(criticalFacts[0].key, 'token_limit');
    });
  });

  // =========================================================================
  // SECTION 7: SUNAHARNESS CHAOS RESILIENCE & GC LIFECYCLE
  // =========================================================================

  describe('7. SunaHarness Chaos Resilience & GC Lifecycle Verification', function() {
    it('F7.1: VfsSandbox lifecycle methods (reset, destroy) prevent leaks and guard post-destroy calls', function() {
      const vfs = new VfsSandbox();
      vfs.writeFile('temp.txt', 'hello');
      vfs.mkdir('sub/dir');
      assert.strictEqual(vfs.exists('temp.txt'), true);

      // reset()
      vfs.reset();
      assert.strictEqual(vfs.exists('temp.txt'), false);
      assert.strictEqual(vfs.files.size, 0);

      // destroy()
      vfs.destroy();
      assert.strictEqual(vfs.isDestroyed(), true);
      assert.throws(() => vfs.readFile('temp.txt'), /Cannot operate on destroyed/i);
    });

    it('F7.2: TrajectoryEngine lifecycle methods (reset, destroy) clear events and child links', function() {
      const traj = new TrajectoryEngine({ id: 'traj_gc' });
      traj.recordStep({ id: 's1', thought: 'step 1', action: { tool: 'test' } });
      assert.strictEqual(traj.getEvents().length, 1);

      traj.reset();
      assert.strictEqual(traj.getEvents().length, 0);

      traj.destroy();
      assert.strictEqual(traj.isDestroyed(), true);
      assert.throws(() => traj.recordStep({ id: 's2' }), /destroyed/i);
    });

    it('F7.3: CheckpointManager lifecycle and pruneCheckpoints bounds memory growth', function() {
      const vfs = new VfsSandbox();
      const cp = new CheckpointManager({ vfs });

      for (let i = 1; i <= 30; i++) {
        vfs.writeFile('log.txt', `line ${i}`);
        cp.saveCheckpoint(i);
      }
      assert.strictEqual(cp.checkpointOrder.length, 30);

      const pruned = cp.pruneCheckpoints(10);
      assert.strictEqual(pruned, 20);
      assert.strictEqual(cp.checkpointOrder.length, 10);

      cp.destroy();
      assert.strictEqual(cp.isDestroyed(), true);
      assert.throws(() => cp.saveCheckpoint(99), /destroyed/i);
    });

    it('F7.4: HarnessController reset() and destroy() cascade to attached subsystems', function() {
      const vfs = new VfsSandbox();
      const traj = new TrajectoryEngine();
      const cp = new CheckpointManager({ vfs });
      const ctrl = new HarnessController({ id: 'ctrl_root', vfs, trajectory: traj, checkpoints: cp });

      vfs.writeFile('f.txt', 'init');
      traj.recordStep({ id: 'step_1' });
      cp.saveCheckpoint(1);

      ctrl.reset();
      assert.strictEqual(vfs.files.size, 0);
      assert.strictEqual(traj.getEvents().length, 0);
      assert.strictEqual(cp.checkpointOrder.length, 0);

      ctrl.destroy();
      assert.strictEqual(ctrl.isDestroyed(), true);
      assert.strictEqual(vfs.isDestroyed(), true);
      assert.strictEqual(traj.isDestroyed(), true);
      assert.strictEqual(cp.isDestroyed(), true);
    });

    it('F7.5: Sub-Harness delegation ceiling enforces max recursion depth (5 tiers)', function() {
      const vfs = new VfsSandbox();
      const ctrl0 = new HarnessController({ id: 'root', depth: 0, vfs });
      const child1 = ctrl0.spawnSubHarness({ id: 'c1', role: 'w1' });
      const child2 = child1.spawnSubHarness({ id: 'c2', role: 'w2' });
      const child3 = child2.spawnSubHarness({ id: 'c3', role: 'w3' });
      const child4 = child3.spawnSubHarness({ id: 'c4', role: 'w4' });
      const child5 = child4.spawnSubHarness({ id: 'c5', role: 'w5' });

      // Depth 5 attempting to spawn depth 6 MUST throw MAX_RECURSION_DEPTH_EXCEEDED
      assert.throws(() => {
        child5.spawnSubHarness({ id: 'c6', role: 'w6' });
      }, (err) => err.code === 'MAX_RECURSION_DEPTH_EXCEEDED' || /recursion depth limit/i.test(err.message));
    });

    it('F7.6: Sibling sub-harness collision guard rejects duplicate active child ID', function() {
      const ctrl = new HarnessController({ id: 'sibling_test' });
      ctrl.spawnSubHarness({ id: 'worker_alpha', role: 'worker' });

      assert.throws(() => {
        ctrl.spawnSubHarness({ id: 'worker_alpha', role: 'worker' });
      }, (err) => err.code === 'SUB_HARNESS_ALREADY_EXISTS' || /already exists/i.test(err.message));
    });

    it('F7.7: Lineage cycle detection rejects self-delegation and circular sub-harness chains', function() {
      const ctrl = new HarnessController({ id: 'parent_chain' });
      assert.throws(() => {
        ctrl.spawnSubHarness({ id: 'parent_chain' });
      }, (err) => err.code === 'DELEGATION_CYCLE_DETECTED' || /self-delegation/i.test(err.message));
    });
  });
});
