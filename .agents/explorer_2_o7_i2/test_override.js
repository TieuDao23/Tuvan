const { VfsDiffEngine } = require('../../suna_harness.js');

const a = ['line1', 'line2', 'line3'];
const b = ['line1', 'line2_mod', 'line3'];

console.log('Original:');
console.log(VfsDiffEngine.createUnifiedDiff('t.txt', 't.txt', a.join('\n') + '\n', b.join('\n') + '\n'));

const orig = VfsDiffEngine._backtrack;
VfsDiffEngine._backtrack = function(trace, a, b, d, offset) {
  console.log('Called custom backtrack!');
  let res = orig(trace, a, b, d, offset);
  console.log('orig returned edits count:', res.length);
  return res;
};

console.log('With override:');
console.log(VfsDiffEngine.createUnifiedDiff('t.txt', 't.txt', a.join('\n') + '\n', b.join('\n') + '\n'));
