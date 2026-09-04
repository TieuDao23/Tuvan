const fs = require('fs');
const assert = require('assert');

describe('Suna Chat Per-Message Visualizer & Diverse Diagram Rendering', () => {
  let appJs, stylesCss;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
  });

  it('should render visualizeMessageAsDiagram button in assistant actionHtml in renderMessages', () => {
    assert.match(appJs, /onclick=["']visualizeMessageAsDiagram\(\$\{idx\}\)["']/, 'Missing visualizeMessageAsDiagram action button under assistant messages');
  });

  it('should implement visualizeMessageAsDiagram in app.js', () => {
    assert.match(appJs, /async\s+function\s+visualizeMessageAsDiagram\s*\(/, 'Missing visualizeMessageAsDiagram function in app.js');
  });

  it('should sanitize raw markdown asterisks and symbols in parseMarkdownToTree', () => {
    assert.ok(appJs.includes("cleanName = cleanName"), 'cleanName reassignment missing');
    assert.ok(appJs.includes(".trim();"), 'cleanName trimming missing');
    assert.match(appJs, /cleanName\s*=\s*cleanName[\s\S]*?replace\(/);
  });

  it('should fix camera centering in fitScreen with containerWidth / 2 offset', () => {
    assert.match(appJs, /panX\s*=\s*\(containerWidth\s*\/\s*2\)\s*-\s*\(centerX\s*\*\s*zoom\)/, 'fitScreen must center panX using containerWidth / 2');
    assert.match(appJs, /panY\s*=\s*\(containerHeight\s*\/\s*2\)\s*-\s*\(centerY\s*\*\s*zoom\)/, 'fitScreen must center panY using containerHeight / 2');
  });

  it('should render inline SVG diagram for cleanLang === "svg" in formatMessage', () => {
    assert.match(appJs, /cleanLang\s*===\s*['"]svg['"]/, 'formatMessage must support cleanLang === "svg"');
    assert.match(appJs, /function\s+renderSvgDiagram\s*\(/, 'Missing renderSvgDiagram function in app.js');
  });

  it('should define styling for .svg-diagram-wrapper in styles.css', () => {
    assert.match(stylesCss, /\.svg-diagram-wrapper/, 'Missing .svg-diagram-wrapper in styles.css');
    assert.match(stylesCss, /\.svg-diagram-viewport|\.svg-diagram-header/, 'Missing SVG diagram subcomponents in styles.css');
  });
});
