const cp = require('child_process');
const path = require('path');

const res = cp.spawnSync('npx', ['mocha', '--reporter', 'json', '"tests/**/*.js"'], {
  cwd: path.resolve(__dirname, '../../'),
  maxBuffer: 50 * 1024 * 1024,
  encoding: 'utf8',
  shell: true
});

const stdout = res.stdout || '';
const firstBrace = stdout.indexOf('{\n  "stats":');
const altFirstBrace = stdout.indexOf('{"stats":');
const start = firstBrace !== -1 ? firstBrace : (altFirstBrace !== -1 ? altFirstBrace : stdout.indexOf('{'));
const end = stdout.lastIndexOf('}');

if (start !== -1 && end !== -1) {
  const jsonStr = stdout.substring(start, end + 1);
  try {
    const data = JSON.parse(jsonStr);
    const byFile = {};
    const failuresByFile = {};
    for (const t of data.passes || []) {
      const rel = path.relative(path.resolve(__dirname, '../../'), t.file || '');
      byFile[rel] = (byFile[rel] || 0) + 1;
    }
    for (const t of data.failures || []) {
      const rel = path.relative(path.resolve(__dirname, '../../'), t.file || '');
      byFile[rel] = (byFile[rel] || 0) + 1;
      failuresByFile[rel] = (failuresByFile[rel] || 0) + 1;
    }
    console.log(JSON.stringify({
      totalTests: data.stats.tests,
      passes: data.stats.passes,
      failures: data.stats.failures,
      durationMs: data.stats.duration,
      filesCount: Object.keys(byFile).length,
      failuresByFile,
      suites: byFile
    }, null, 2));
  } catch (e) {
    console.error('JSON parse error:', e.message);
  }
} else {
  console.error('Could not locate JSON in output. Length:', stdout.length);
  console.log('Sample stdout:', stdout.slice(0, 300));
}
