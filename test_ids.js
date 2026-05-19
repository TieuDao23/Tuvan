const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const m = app.matchAll(/\$\(\'#([a-zA-Z0-9_-]+)\'\)/g);
const ids = new Set(Array.from(m, x => x[1]));
for (let id of ids) {
    if (!html.includes('id="' + id + '"')) console.log('Missing: ' + id);
}
