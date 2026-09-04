const { execSync } = require('child_process');
const fs = require('fs');

try {
  const out = execSync('npx mocha --reporter json "tests/**/*.js"', {
    maxBuffer: 30 * 1024 * 1024,
    encoding: 'utf8'
  });
  const data = JSON.parse(out);
  console.log('Total tests in report:', data.tests.length);
  console.log('Passes:', data.passes.length);
  console.log('Failures:', data.failures.length);

  const fileCounts = {};
  data.tests.forEach(t => {
    let f = t.file ? t.file.replace(/\\/g, '/') : 'unknown';
    // make relative to cwd
    f = f.replace(/.*\/tests\//, 'tests/');
    fileCounts[f] = (fileCounts[f] || 0) + 1;
  });

  console.log('\n--- Per-file test count breakdown ---');
  let total = 0;
  Object.entries(fileCounts).sort((a, b) => b[1] - a[1]).forEach(([f, count]) => {
    total += count;
    console.log(count.toString().padStart(4) + ' tests : ' + f);
  });
  console.log('-------------------------------------');
  console.log('Sum across files:', total);
} catch (e) {
  console.error('Error running mocha json:', e.message);
  if (e.stdout) console.log('stdout:', e.stdout.slice(0, 500));
  if (e.stderr) console.error('stderr:', e.stderr.slice(0, 500));
}
