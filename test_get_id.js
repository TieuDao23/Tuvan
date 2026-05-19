const fs = require('fs');
const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const lines = app.split('\n');
const start = lines.findIndex(l => l.includes('function initEvents() {'));
let end = -1;
let braces = 0;
for(let i=start; i<lines.length; i++) {
  if(lines[i].includes('{')) braces += (lines[i].match(/\{/g) || []).length;
  if(lines[i].includes('}')) braces -= (lines[i].match(/\}/g) || []).length;
  if(braces === 0 && i > start) { end = i; break; }
}

const initEventsLines = lines.slice(start, end+1).join('\n');
const m = initEventsLines.matchAll(/getElementById\([\'\"]([a-zA-Z0-9_-]+)[\'\"]\)/g);
const ids = new Set(Array.from(m, x => x[1]));
for (let id of ids) {
    if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) console.log('Missing getElementById: ' + id);
}
