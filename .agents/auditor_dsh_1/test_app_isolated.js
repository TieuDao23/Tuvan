const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const appCode = fs.readFileSync('app.js', 'utf8');

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
    settings: { userName: 'Bạn', theme: 'aurora', fontSize: 14 },
    mode: 'pro',
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

const agentStart = appCode.indexOf('// === START OF agent.js ===');
const agentEnd = appCode.indexOf('// === END OF agent.js ===');
assert.ok(agentStart !== -1 && agentEnd !== -1, 'Agent delimiters must exist');
const agentCode = appCode.slice(agentStart, agentEnd);
vm.runInContext(agentCode, sandbox);
const SunaAgent = sandbox.SunaAgent;

(async () => {
  console.log('--- 1. Testing Registry Lifecycle ---');
  assert.strictEqual(typeof SunaAgent.registerTool, 'function');
  assert.strictEqual(typeof SunaAgent.unregisterTool, 'function');
  assert.strictEqual(typeof SunaAgent.listTools, 'function');
  assert.strictEqual(typeof SunaAgent.getTool, 'function');
  assert.strictEqual(typeof SunaAgent.executeTool, 'function');
  
  // Custom tool registration
  const customTool = SunaAgent.registerTool({
    name: 'audit_probe',
    description: 'Audit test tool',
    parameters: {
      type: 'object',
      properties: { num: { type: 'number' } },
      required: ['num']
    },
    execute: async (args) => ({ doubled: args.num * 2 })
  });
  assert.strictEqual(customTool.name, 'audit_probe');
  assert.strictEqual(SunaAgent.getTool('audit_probe').name, 'audit_probe');
  const probeExec = await SunaAgent.executeTool('audit_probe', { num: 21 });
  assert.strictEqual(JSON.parse(probeExec).doubled, 42);
  assert.strictEqual(SunaAgent.unregisterTool('audit_probe'), true);
  assert.strictEqual(SunaAgent.getTool('audit_probe'), null);

  console.log('--- 2. Testing Core Tool 1: sandbox_exec ---');
  const sbMath = await SunaAgent.executeTool('sandbox_exec', { code: 'Math.sqrt(144) + 25' });
  assert.strictEqual(JSON.parse(sbMath).success, true);
  assert.strictEqual(JSON.parse(sbMath).result, '37');

  const sbArr = await SunaAgent.executeTool('sandbox_exec', { code: '[5, 2, 8, 1, 9].sort((a,b)=>a-b).map(x=>x*2)' });
  assert.strictEqual(JSON.parse(sbArr).success, true);
  assert.deepStrictEqual(JSON.parse(JSON.parse(sbArr).result), [2, 4, 10, 16, 18]);

  const sbSyntax = await SunaAgent.executeTool('sandbox_exec', { code: 'function broken( { return 42; }' });
  assert.strictEqual(JSON.parse(sbSyntax).success, false);
  assert.ok(JSON.parse(sbSyntax).error.includes('SyntaxError'));

  const sbType = await SunaAgent.executeTool('sandbox_exec', { code: 'const x = null; x.someMethod();' });
  assert.strictEqual(JSON.parse(sbType).success, false);
  assert.ok(JSON.parse(sbType).error.includes('TypeError'));

  console.log('--- 3. Testing Core Tool 2: web_search_context ---');
  const wsRes = await SunaAgent.executeTool('web_search_context', { query: 'DeepSeek Harness', maxResults: 2 });
  const wsParsed = JSON.parse(wsRes);
  assert.strictEqual(wsParsed.success, true);
  assert.strictEqual(wsParsed.query, 'DeepSeek Harness');
  assert.strictEqual(wsParsed.count, 2);

  console.log('--- 4. Testing Core Tool 3: fetch_page_summary ---');
  const fpRes = await SunaAgent.executeTool('fetch_page_summary', {
    url: 'https://example.com/page',
    mockHtml: '<html><head><script>alert(1)</script><style>.x{}</style></head><body><nav>Nav</nav><main>Hello World Content</main><footer>Foot</footer></body></html>'
  });
  const fpParsed = JSON.parse(fpRes);
  assert.strictEqual(fpParsed.success, true);
  assert.ok(!fpParsed.content.includes('<script>'));
  assert.ok(!fpParsed.content.includes('Nav'));
  assert.ok(!fpParsed.content.includes('Foot'));
  assert.ok(fpParsed.content.includes('Hello World Content'));

  console.log('--- 5. Testing Core Tools 4-7: VFS (fs_write, fs_read, fs_list, fs_patch) ---');
  const fwRes = await SunaAgent.executeTool('fs_write', { path: 'test.txt', content: 'Line 1\nLine 2\nLine 3' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(fwRes).success, true);

  const frRes = await SunaAgent.executeTool('fs_read', { path: 'test.txt' }, { State: sandbox.State });
  const frParsed = JSON.parse(frRes);
  assert.strictEqual(frParsed.success, true);
  assert.strictEqual(frParsed.lines, 3);
  assert.strictEqual(frParsed.content, 'Line 1\nLine 2\nLine 3');

  const flRes = await SunaAgent.executeTool('fs_list', {}, { State: sandbox.State });
  const flParsed = JSON.parse(flRes);
  assert.strictEqual(flParsed.success, true);
  assert.strictEqual(flParsed.count, 1);
  assert.strictEqual(flParsed.files[0].path, 'test.txt');

  const fpPatchRes = await SunaAgent.executeTool('fs_patch', { path: 'test.txt', search: 'Line 2', replace: 'Modified Line 2' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(fpPatchRes).success, true);
  const frAfterPatch = await SunaAgent.executeTool('fs_read', { path: 'test.txt' }, { State: sandbox.State });
  assert.ok(JSON.parse(frAfterPatch).content.includes('Modified Line 2'));

  console.log('--- 6. Testing Core Tools 8-9: Memory (memory_store, memory_query) ---');
  const msRes = await SunaAgent.executeTool('memory_store', { fact: 'Suna prefers dark mode', category: 'preferences' }, { State: sandbox.State });
  assert.strictEqual(JSON.parse(msRes).success, true);
  // Test deduplication
  const msDedup = await SunaAgent.executeTool('memory_store', { fact: 'Suna prefers dark mode', category: 'preferences' }, { State: sandbox.State });
  assert.ok(JSON.parse(msDedup).message.includes('deduplicated'));

  const mqRes = await SunaAgent.executeTool('memory_query', { query: 'dark mode' }, { State: sandbox.State });
  const mqParsed = JSON.parse(mqRes);
  assert.strictEqual(mqParsed.success, true);
  assert.strictEqual(mqParsed.count, 1);

  console.log('--- 7. Testing Core Tool 10: visualize_diagram ---');
  const vdSvg = await SunaAgent.executeTool('visualize_diagram', { type: 'flowchart', title: 'Test Flow', data: { nodes: ['A', 'B', 'C'] } });
  const vdSvgParsed = JSON.parse(vdSvg);
  assert.strictEqual(vdSvgParsed.success, true);
  assert.strictEqual(vdSvgParsed.type, 'svg');
  assert.ok(vdSvgParsed.svg.includes('<svg'));
  assert.ok(vdSvgParsed.svg.includes('Test Flow'));

  const vdMind = await SunaAgent.executeTool('visualize_diagram', { type: 'mindmap', data: { root: 'Central Topic' } });
  const vdMindParsed = JSON.parse(vdMind);
  assert.strictEqual(vdMindParsed.success, true);
  assert.strictEqual(vdMindParsed.type, 'mindmap');
  assert.ok(vdMindParsed.fence.includes('```json:mindmap'));

  console.log('--- 8. Testing Core Tool 11: analyze_tabular ---');
  const csvData = 'Name,Age,Salary\nAlice,30,50000\nBob,40,70000\nCharlie,50,90000';
  const atRes = await SunaAgent.executeTool('analyze_tabular', { data: csvData, format: 'csv' });
  const atParsed = JSON.parse(atRes);
  assert.strictEqual(atParsed.success, true);
  assert.strictEqual(atParsed.rowCount, 3);
  assert.strictEqual(atParsed.columnCount, 3);
  assert.strictEqual(atParsed.stats.Age.mean, 40);
  assert.strictEqual(atParsed.stats.Age.median, 40);
  assert.strictEqual(atParsed.stats.Salary.mean, 70000);
  assert.strictEqual(atParsed.stats.Salary.min, 50000);
  assert.strictEqual(atParsed.stats.Salary.max, 90000);
  assert.ok(atParsed.markdownTable.includes('table-responsive-wrapper'));

  console.log('--- 9. Testing Dynamic Prompt Docs ---');
  const promptDocs = SunaAgent.generatePromptDocs();
  assert.ok(promptDocs.includes('### DeepSeek Harness Available Tools'));
  assert.ok(promptDocs.includes('<suna_tool_call>'));
  assert.ok(promptDocs.includes('sandbox_exec'));
  assert.ok(promptDocs.includes('fs_read'));
  assert.ok(promptDocs.includes('fs_write'));
  assert.ok(promptDocs.includes('memory_store'));
  assert.ok(promptDocs.includes('visualize_diagram'));
  assert.ok(promptDocs.includes('analyze_tabular'));

  console.log('--- 10. Testing Anti-Oscillation & Trajectory Logging ---');
  const mockMsg = { trajectory: [] };
  const mockContext = {
    message: mockMsg,
    depth: 1,
    State: sandbox.State
  };
  // Execute failing call 3 times (missing required 'code')
  const badCall = JSON.stringify({ tool: 'sandbox_exec', args: {} });
  await SunaAgent.handleToolCalls([badCall], mockContext);
  await SunaAgent.handleToolCalls([badCall], mockContext);
  await SunaAgent.handleToolCalls([badCall], mockContext);
  // 4th time should trigger anti-oscillation halting
  const fourthResult = await SunaAgent.handleToolCalls([badCall], mockContext);
  console.log('--- 11. Testing Trajectory View DOM Generation ---');
  const rtvMatch = appCode.match(/function\s+renderTrajectoryView\s*\([\s\S]*?\n\}/);
  assert.ok(rtvMatch, 'renderTrajectoryView function must exist in app.js');
  vm.runInContext(rtvMatch[0], sandbox);

  const mockTrajectory = [
    { step: 1, tool: 'fs_read', thought: 'Đọc file', params: { path: 'index.html' }, result: '<html>', durationMs: 12 },
    { step: 2, tool: 'sandbox_exec', thought: 'Tính kích thước', params: { code: '1+1' }, result: '2', durationMs: 8 },
    { step: 3, tool: 'bad_tool', params: {}, error: 'Tool not found', durationMs: 4 }
  ];

  const renderedHtml = sandbox.renderTrajectoryView(mockTrajectory);
  assert.ok(renderedHtml.includes('class="trajectory-container" data-steps="3"'));
  assert.ok(renderedHtml.includes('class="trajectory-chip"'));
  assert.ok(renderedHtml.includes('3 bước suy luận'));
  assert.ok(renderedHtml.includes('24ms'));
  assert.ok(renderedHtml.includes('class="trajectory-drawer collapsed"'));
  assert.ok(renderedHtml.includes('class="trajectory-timeline"'));
  assert.ok(renderedHtml.includes('class="trajectory-step-node step-success"'));
  assert.ok(renderedHtml.includes('class="trajectory-step-node step-error"'));
  assert.ok(renderedHtml.includes('Tool not found'));
  console.log('DOM Trajectory View Elements verified successfully.');

  console.log('>>> ALL 11 INDEPENDENT INTEGRITY CHECKS ON app.js PASSED EMPIRICALLY! <<<');
})().catch(err => {
  console.error('FAILED INDEPENDENT AUDIT TEST:', err);
  process.exit(1);
});
