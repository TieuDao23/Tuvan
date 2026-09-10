const fs = require('fs');
const path = require('path');

const testsDir = path.resolve(__dirname, '../../tests');
const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.js'));

console.log('Total test files in tests/:', files.length);

let totalAssertOkTrue = 0;
let tautologyReport = [];

for (const file of files) {
  const filePath = path.join(testsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Check for assert.ok(true)
    if (/assert\.ok\(\s*true\s*[,)]/.test(line)) {
      totalAssertOkTrue++;
      tautologyReport.push({ file, line: idx + 1, content: line.trim() });
    }
  });
}

console.log('Total assert.ok(true) found:', totalAssertOkTrue);
console.log(JSON.stringify(tautologyReport, null, 2));
