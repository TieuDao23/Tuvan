const fs = require('fs');
const assert = require('assert');

describe('Live Workspace 3-Pane Layout Tests (Visible)', () => {
  it('should define 3-pane split layout containers and resizers in index.html', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes('id="workspace-left-handle"'), 'Missing workspace-left-handle in index.html');
    assert.ok(html.includes('id="btn-expand-workspace"'), 'Missing btn-expand-workspace in index.html');
    assert.ok(html.includes('id="artifact-editor-container"'), 'Missing artifact-editor-container in index.html');
    assert.ok(html.includes('id="artifact-resizer-1"'), 'Missing artifact-resizer-1 in index.html');
    assert.ok(html.includes('id="artifact-preview-container"'), 'Missing artifact-preview-container in index.html');
    assert.ok(html.includes('id="artifact-resizer-2"'), 'Missing artifact-resizer-2 in index.html');
    assert.ok(html.includes('id="artifact-chat-container"'), 'Missing artifact-chat-container in index.html');
    assert.ok(html.includes('id="btn-new-session"'), 'Missing btn-new-session in index.html');
    assert.ok(html.includes('id="select-session-template"'), 'Missing select-session-template in index.html');
  });

  it('should define 3-pane split CSS rules and mobile responsive styles', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /\.artifacts-panel\[data-view="split"\]\s+\.artifact-editor-container/, 'Missing split editor container CSS rule');
    assert.match(css, /\.artifacts-panel\[data-view="split"\]\s+\.artifact-preview-container/, 'Missing split preview container CSS rule');
    assert.match(css, /\.artifacts-panel\[data-view="split"\]\s+\.artifact-chat-container/, 'Missing split chat container CSS rule');
    assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.artifacts-panel/, 'Missing mobile media query for artifacts panel');
  });
});
