const SunaAgent = require('../../suna_agent.js');
const SunaHarness = require('../../suna_harness.js');

console.log('--- 1. Standalone Agent without Harness ---');
const standaloneAgent = new SunaAgent();
console.log('standaloneAgent.vfs:', standaloneAgent.vfs);
console.log('standaloneAgent tools:', Object.keys(standaloneAgent.tools));

console.log('\n--- 2. MultiSyntaxParser on package.json ---');
const pkgMarkdown = '```json\n{\n  "name": "suna-chat",\n  "version": "2.0.0",\n  "description": "AI App"\n}\n```';
console.log('Raw text:\n', pkgMarkdown);
const calls = SunaAgent.MultiSyntaxParser.parse(pkgMarkdown);
console.log('Parsed calls for package.json in markdown:', calls);

const rawJson = '{\n  "name": "suna-chat",\n  "version": "2.0.0",\n  "description": "AI App"\n}';
const callsRaw = SunaAgent.MultiSyntaxParser.parse(rawJson);
console.log('Parsed calls for raw package.json:', callsRaw);

console.log('\n--- 3. _boundObservation with long error ---');
const longError = {
  status: 'error',
  error: 'Fatal stack trace: ' + 'x'.repeat(2000),
  isError: true,
  code: 'CRITICAL_FAILURE'
};
const bounded = standaloneAgent._boundObservation(longError, 1500);
console.log('Bounded observation keys:', Object.keys(bounded));
console.log('Bounded observation truncated:', bounded.truncated);
console.log('Bounded observation value type:', typeof bounded.value);
console.log('Bounded observation isError property:', bounded.isError);
console.log('Bounded observation value.isError:', bounded.value && bounded.value.isError);
console.log('Bounded observation value.status:', bounded.value && bounded.value.status);

console.log('\n--- 4. reflectObservation on bounded long error ---');
const activeStep = { id: 1, name: 'run_tests', tool: 'run_sandboxed_command' };
const reflection = standaloneAgent.brain.reflectObservation(activeStep, bounded.value);
console.log('Reflection satisfied:', reflection.satisfied);
console.log('Reflection text:', reflection.reflectionText);

async function testLegacyAndSteer() {
  console.log('\n--- 5. Multi-step ReAct in _runLegacy ---');
  const harness = SunaHarness.createHarness();
  const agent = new SunaAgent();
  agent.attachHarness(harness);
  harness.vfs.writeFile('app.js', 'console.log("hello");');
  
  const res = await agent.run('Fix bug in app.js', { maxTurns: 5 });
  console.log('_runLegacy turnsExecuted:', res.turnsExecuted);
  console.log('_runLegacy status:', res.status);
  console.log('_runLegacy steps:', res.results.map(r => r.step.name));

  console.log('\n--- 6. Steer unabort/recovery after circuit breaker ---');
  agent.abort('Manual abort test');
  console.log('State after abort - status:', agent.status, 'isAgentAborted:', agent.isAgentAborted);
  agent.steer('Pivot to new strategy');
  console.log('State after steer - status:', agent.status, 'isAgentAborted:', agent.isAgentAborted);
  const nextStepRes = await agent.executeStep('new prompt');
  console.log('executeStep after steer - status:', nextStepRes.status, 'reason:', nextStepRes.reason);
}

testLegacyAndSteer();

