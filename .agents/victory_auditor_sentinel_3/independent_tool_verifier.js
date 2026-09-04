const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

console.log(=== INDEPENDENT POST-VICTORY TOOL & RUNTIME VERIFICATION ===);

const appCode = fs.readFileSync('app.js', 'utf8');

// Build isolated sandbox environment
const sandbox = {
  window: {},
  document: {
    documentElement: { style: { setProperty: () => {} } },
    getElementById: (id) => {
      if (id === 'artifact-editor-textarea') return { value: '', dispatchEvent: () => {} };
      if (id === 'artifact-iframe') return { srcdoc: '' };
      return null;
    }
  },
  State: {
    settings: { userName: 'Auditor', theme: 'aurora', fontSize: 14 },
    mode: 'flash',
    memory: { facts: [] },
    vfs: {},
    toolFailures: new Map()
  },
  require,
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  console,
  setTimeout,
  clearTimeout,
  URL,
  Buffer,
  Event: class { constructor(type) { this.type = type; } }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// Extract agent section
const agentStart = appCode.indexOf('// === START OF agent.js ===');
const agentEnd = appCode.indexOf('// === END OF agent.js ===');
assert.ok(agentStart !== -1 && agentEnd !== -1, 'agent.js delimiters present');
const agentCode = appCode.slice(agentStart, agentEnd);
vm.runInContext(agentCode, sandbox);

const SunaAgent = sandbox.SunaAgent;
assert.ok(SunaAgent, 'SunaAgent loaded in sandbox');

(async () => {
  let passedChecks = 0;

  // Check 1: Tool Registry Lifecycle
  assert.strictEqual(typeof SunaAgent.registerTool, 'function');
  assert.strictEqual(typeof SunaAgent.unregisterTool, 'function');
  assert.strictEqual(typeof SunaAgent.listTools, 'function');
  assert.strictEqual(typeof SunaAgent.getTool, 'function');
  
  const testTool = SunaAgent.registerTool({
    name: 'auditor_custom_tool',
    description: 'Independent auditor test tool',
    parameters: {
      type: 'object',
      properties: { val: { type: 'number' } },
      required: ['val']
    },
    execute: async (args) => ({ multiplied: args.val * 3 })
  });
  assert.strictEqual(testTool.name, 'auditor_custom_tool');
  const customRes = await SunaAgent.executeTool('auditor_custom_tool', { val: 7 });
  assert.strictEqual(JSON.parse(customRes).multiplied, 21);
  assert.strictEqual(SunaAgent.unregisterTool('auditor_custom_tool'), true);
  assert.strictEqual(SunaAgent.getTool('auditor_custom_tool'), null);
  passedChecks++;
  console.log('[+] Check 1 PASSED: Modular Tool Registry lifecycle & dynamic execution');

  // Check 2: Parameter Schema Validation
  assert.throws(() => {
    SunaAgent.validateParameters({ required: ['mustHave'] }, {});
  }, /Missing required parameter: mustHave/);

  const enumSchema = { properties: { mode: { enum: ['fast', 'slow'] } } };
  assert.throws(() => {
    SunaAgent.validateParameters(enumSchema, { mode: 'invalid' });
  }, /not in allowed enum/);

  const numCoerce = SunaAgent.validateParameters({ properties: { count: { type: 'number' } } }, { count: '123' });
  assert.strictEqual(numCoerce.sanitized.count, 123);

  const boolCoerce = SunaAgent.validateParameters({ properties: { active: { type: 'boolean' } } }, { active: 'true' });
  assert.strictEqual(boolCoerce.sanitized.active, true);
  passedChecks++;
  console.log('[+] Check 2 PASSED: Parameter schema validation, enums & type coercion');

  // Check 3: sandbox_exec
  const sbMath = await SunaAgent.executeTool('sandbox_exec', { code: 'Math.pow(2, 10) + Math.sqrt(256)' });
  assert.strictEqual(JSON.parse(sbMath).success, true);
  assert.strictEqual(JSON.parse(sbMath).result, '1040');

  const sbStr = await SunaAgent.executeTool('sandbox_exec', { code: 'hello world'.split('').reverse().join('') });
  assert.strictEqual(JSON.parse(sbStr).success, true);
  assert.strictEqual(JSON.parse(sbStr).result, 'dlrow olleh');

  const sbSyntax = await SunaAgent.executeTool('sandbox_exec', { code: 'const bad = (;' });
  assert.strictEqual(JSON.parse(sbSyntax).success, false);
  assert.ok(JSON.parse(sbSyntax).error.includes('SyntaxError'));

  const sbTimeout = await SunaAgent.executeTool('sandbox_exec', { code: 'while(true){}', timeoutMs: 100 });
  assert.strictEqual(JSON.parse(sbTimeout).success, false);
  assert.ok(JSON.parse(sbTimeout).error.includes('timed out'));
  passedChecks++;
  console.log('[+] Check 3 PASSED: sandbox_exec (math, arrays, syntax error capture, timeout guard)');

  // Check 4: web_search_context & fetch_page_summary
  const wsRes = await SunaAgent.executeTool('web_search_context', { query: 'DeepSeek Harness dsh' });
  const wsParsed = JSON.parse(wsRes);
  assert.strictEqual(wsParsed.success, true);
  assert.strictEqual(wsParsed.query, 'DeepSeek Harness dsh');
  assert.ok(wsParsed.results.length > 0);

  const fpBadProto = await SunaAgent.executeTool('fetch_page_summary', { url: 'ftp://files.example.com' });
  assert.strictEqual(JSON.parse(fpBadProto).success, false);
  assert.ok(JSON.parse(fpBadProto).error.includes('Unsupported protocol'));

  const fpClean = await SunaAgent.executeTool('fetch_page_summary', {
    url: 'https://example.com/info',
    mockHtml: '<html><head><script>evil()</script><style>body{}</style></head><body><nav>Nav Bar</nav><main><p>Genuine Article Text</p></main><footer>Footer Links</footer></body></html>'
  });
  const fpParsed = JSON.parse(fpClean);
  assert.strictEqual(fpParsed.success, true);
  assert.ok(!fpParsed.content.includes('<script>'));
  assert.ok(!fpParsed.content.includes('Nav Bar'));
  assert.ok(!fpParsed.content.includes('Footer Links'));
  assert.ok(fpParsed.content.includes('Genuine Article Text'));
  passedChecks++;
  console.log('[+] Check 4 PASSED: web_search_context & fetch_page_summary sanitization');

  // Check 5: VFS Tools (fs_write, fs_read, fs_list, fs_patch)
  const fwRes = await SunaAgent.executeTool('fs_write', { path: 'index.html', content: '<html><body>Original Content</body></html>' }, { State: sandbox.State, document: sandbox.document });
  assert.strictEqual(JSON.parse(fwRes).success, true);

  const frRes = await SunaAgent.executeTool('fs_read', { path: 'index.html' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(frRes).success, true);
  assert.strictEqual(JSON.parse(frRes).content, '<html><body>Original Content</body></html>');

  const flRes = await SunaAgent.executeTool('fs_list', {}, { State: sandbox.State });
  assert.strictEqual(JSON.parse(flRes).success, true);
  assert.strictEqual(JSON.parse(flRes).count, 1);

  const fpRes = await SunaAgent.executeTool('fs_patch', {
    path: 'index.html',
    search: 'Original Content',
    replace: 'Patched Content'
  }, { State: sandbox.State, document: sandbox.document });
  assert.strictEqual(JSON.parse(fpRes).success, true);

  const frPatched = await SunaAgent.executeTool('fs_read', { path: 'index.html' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(frPatched).content, '<html><body>Patched Content</body></html>');

  // Test ambiguous patch reject
  await SunaAgent.executeTool('fs_write', { path: 'dup.txt', content: 'AAA BBB AAA' }, { State: sandbox.State });
  const fpAmbiguous = await SunaAgent.executeTool('fs_patch', { path: 'dup.txt', search: 'AAA', replace: 'CCC' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(fpAmbiguous).success, false);
  assert.ok(JSON.parse(fpAmbiguous).error.includes('Ambiguous patch target'));
  passedChecks++;
  console.log('[+] Check 5 PASSED: VFS write, read, list, and single-occurrence patch safety');

  // Check 6: Semantic Memory (memory_store, memory_query)
  const ms1 = await SunaAgent.executeTool('memory_store', { fact: 'Auditor verified system integrity', category: 'audit' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(ms1).success, true);

  const msDedup = await SunaAgent.executeTool('memory_store', { fact: 'auditor verified system integrity', category: 'audit' }, { State: sandbox.State });
  assert.ok(JSON.parse(msDedup).message.includes('deduplicated'));
  assert.strictEqual(sandbox.State.memory.facts.length, 1);

  const mq1 = await SunaAgent.executeTool('memory_query', { query: 'system integrity' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(mq1).count, 1);

  const mqNone = await SunaAgent.executeTool('memory_query', { query: 'unrelated keyword' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(mqNone).count, 0);
  passedChecks++;
  console.log('[+] Check 6 PASSED: memory_store (with deduplication) & memory_query');

  // Check 7: visualize_diagram
  const vdSvg = await SunaAgent.executeTool('visualize_diagram', {
    type: 'flowchart',
    title: 'Audit Flow',
    data: { nodes: ['Start', '<script>bad()</script>Node2', 'End onload=hack()'] }
  });
  const vdSvgParsed = JSON.parse(vdSvg);
  assert.strictEqual(vdSvgParsed.success, true);
  assert.strictEqual(vdSvgParsed.type, 'svg');
  assert.ok(vdSvgParsed.svg.startsWith('<svg'));
  assert.ok(vdSvgParsed.svg.endsWith('</svg>'));
  assert.ok(!vdSvgParsed.svg.includes('<script>'));
  assert.ok(!vdSvgParsed.svg.includes('onload='));

  const vdMind = await SunaAgent.executeTool('visualize_diagram', { type: 'mindmap', data: { root: 'Audit' } });
  assert.ok(JSON.parse(vdMind).fence.startsWith('`json:mindmap'));
  passedChecks++;
  console.log('[+] Check 7 PASSED: visualize_diagram (SVG generation, XSS sanitization, mindmap fence)');

  // Check 8: analyze_tabular
  const csvTable = 'Item,Count,Cost\nA,10,50\nB,20,100\nC,30,150';
  const atRes = await SunaAgent.executeTool('analyze_tabular', { data: csvTable, format: 'csv' });
  const atParsed = JSON.parse(atRes);
  assert.strictEqual(atParsed.success, true);
  assert.strictEqual(atParsed.rowCount, 3);
  assert.strictEqual(atParsed.columnCount, 3);
  assert.strictEqual(atParsed.stats.Cost.mean, 100);
  assert.strictEqual(atParsed.stats.Cost.median, 100);
  assert.strictEqual(atParsed.stats.Cost.min, 50);
  assert.strictEqual(atParsed.stats.Cost.max, 150);
  assert.strictEqual(atParsed.stats.Cost.stdDev, 50);
  assert.ok(atParsed.markdownTable.includes('table-responsive-wrapper'));
  passedChecks++;
  console.log('[+] Check 8 PASSED: analyze_tabular statistical metrics (mean, median, min, max, stdDev)');

  // Check 9: Dynamic Prompt Docs Generation
  const promptDocs = SunaAgent.generatePromptDocs();
  assert.ok(promptDocs.includes('### DeepSeek Harness Available Tools'));
  assert.ok(promptDocs.includes('<suna_tool_call>'));
  const all11Tools = [
    'sandbox_exec', 'web_search_context', 'fetch_page_summary',
    'fs_read', 'fs_write', 'fs_list', 'fs_patch',
    'memory_store', 'memory_query', 'visualize_diagram', 'analyze_tabular'
  ];
  all11Tools.forEach(t => {
    assert.ok(promptDocs.includes(#### Tool: \${t}\`), Missing tool doc for );
  });
  passedChecks++;
  console.log('[+] Check 9 PASSED: generatePromptDocs covers all 11 core tools');

  // Check 10: Trajectory View Rendering
  const rtvCode = appCode.match(/function\s+renderTrajectoryView\s*\([\s\S]*?\n\}/)[0];
  vm.runInContext(rtvCode, sandbox);
  const sampleTrajectory = [
    { step: 1, tool: 'fs_read', thought: 'Read code', params: { path: 'index.html' }, result: 'ok', durationMs: 15 },
    { step: 2, tool: 'sandbox_exec', thought: 'Calculate', params: { code: '2+2' }, result: '4', durationMs: 8 },
    { step: 3, tool: 'bad_call', params: {}, error: 'Failed', durationMs: 2 }
  ];
  const renderedHtml = sandbox.renderTrajectoryView(sampleTrajectory);
  assert.ok(renderedHtml.includes('class=trajectory-container data-steps=3'));
  assert.ok(renderedHtml.includes('class=trajectory-chip'));
  assert.ok(renderedHtml.includes('3 bước suy luận'));
  assert.ok(renderedHtml.includes('25ms'));
  assert.ok(renderedHtml.includes('class=trajectory-drawer collapsed'));
  assert.ok(renderedHtml.includes('class=trajectory-step-node step-success'));
  assert.ok(renderedHtml.includes('class=trajectory-step-node step-error'));
  passedChecks++;
  console.log('[+] Check 10 PASSED: renderTrajectoryView DOM markup, classes & timeline nodes');

  // Check 11: StreamParser Tag Extraction
  const spCode = appCode.match(/class\s+StreamParser\s*\{[\s\S]*?\n\}/)[0];
  vm.runInContext(spCode, sandbox);
  const parser = new sandbox.StreamParser();
  const chunkA = 'Xin chào! <suna_tool_call>{tool:sand';
 const chunkB = 'box_exec,args:{code:5+5}}</suna_tool_call> Đã xong!';
  const outA = parser.parseChunk(chunkA);
  const outB = parser.parseChunk(chunkB);
  const outFlush = parser.flush();
  const fullText = outA + outB + outFlush;
  assert.ok(!fullText.includes('<suna_tool_call>'));
  assert.ok(!fullText.includes('sandbox_exec'));
  assert.ok(fullText.includes('Xin chào!'));
  assert.ok(fullText.includes('Đã xong!'));
  assert.strictEqual(parser.toolCalls.length, 1);
  assert.ok(parser.toolCalls[0].includes('sandbox_exec'));
  passedChecks++;
  console.log('[+] Check 11 PASSED: StreamParser chunk buffering & tag separation');

  console.log(\n==================================================================);
  console.log(>>> ALL /11 EMPIRICAL TESTS PASSED DIRECTLY AGAINST app.js <<<);
  console.log(==================================================================);
})().catch(err => {
  console.error(INDEPENDENT TOOL VERIFIER FAILED:, err);
  process.exit(1);
});
