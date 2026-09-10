const { VfsDiffEngine } = require('../../suna_harness.js');

function runTest41() {
  const count = 10000;
  const baseLines = Array.from({ length: count }, (_, i) => `const val_${i} = ${i * 2};`);
  const oldText = baseLines.join('\n') + '\n';
  const modLines = baseLines.slice();
  modLines[5000] = 'const val_5000 = "MODIFIED_SCALE";';
  const newText = modLines.join('\n') + '\n';

  const t0 = Date.now();
  const patch = VfsDiffEngine.createUnifiedDiff('scale.js', 'scale.js', oldText, newText, { context: 3 });
  const elapsed = Date.now() - t0;
  return elapsed;
}

function runTest42() {
  const count = 12000;
  const baseLines = Array.from({ length: count }, (_, i) => `function fn_${i}() { return ${i}; }`);
  const oldText = baseLines.join('\n') + '\n';
  const modLines = baseLines.slice();

  for (let step = 1000; step < 11000; step += 700) {
    modLines[step] = `function fn_${step}() { return 'PATCHED_${step}'; }`;
  }
  const newText = modLines.join('\n') + '\n';

  const t0 = Date.now();
  const patch = VfsDiffEngine.createUnifiedDiff('scale_multi.js', 'scale_multi.js', oldText, newText, { context: 3 });
  const elapsed = Date.now() - t0;
  return elapsed;
}

// Simulate running 1,000 tests with lots of objects and strings
console.log('Simulating heap churn (running preceding test simulation)...');
const garbage = [];
for (let i = 0; i < 50000; i++) {
  garbage.push({ id: i, data: `string_churn_${i}_` + 'x'.repeat(100), arr: [i, i+1] });
  if (i % 10000 === 0) garbage.splice(0, 5000);
}

console.log('Running after heap churn:');
for (let r = 1; r <= 5; r++) {
  // force some garbage allocation
  const temp = Array.from({ length: 20000 }, (_, i) => ({ a: i }));
  const t41 = runTest41();
  const t42 = runTest42();
  console.log(`Run ${r}: 4.1 = ${t41}ms (limit 100ms), 4.2 = ${t42}ms (limit 200ms)`);
}
