const fs = require('fs');
const assert = require('assert');

describe('Workspace Resizers, Pointer Lock & Storage Sync Tests (Hidden)', () => {
  it('should lock iframe pointer events during drag and restore on mouseup', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    assert.ok(appJs.includes('lockAllIframes'), 'Missing lockAllIframes helper in app.js');
    assert.ok(appJs.includes('unlockAllIframes'), 'Missing unlockAllIframes helper in app.js');
    assert.match(appJs, /pointerEvents\s*=\s*['"]none['"]/, 'Missing pointerEvents = none for iframe locking');
    assert.match(appJs, /pointerEvents\s*=\s*['"]auto['"]/, 'Missing pointerEvents = auto for iframe unlocking');
  });

  it('should synchronize localStorage suffix across all settings save handlers', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    // Ensure all localStorage.setItem calls with suna_settings append getStorageSuffix()
    const matches = appJs.match(/localStorage\.setItem\(['"]suna_settings['"](?!\s*\+)/g);
    assert.strictEqual(matches, null, 'Found unsynchronized localStorage.setItem(\'suna_settings\') without suffix');
  });

  it('should guard online network listener against duplicate attachments', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    assert.ok(appJs.includes('_authOnlineListenerAttached'), 'Missing _authOnlineListenerAttached de-duplication guard');
  });

  it('should consolidate fetchLinkContext to use window.fetchWithProxy', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    assert.match(appJs, /fetchLinkContext[\s\S]*?window\.fetchWithProxy/, 'fetchLinkContext does not reuse window.fetchWithProxy');
  });

  it('should support AbortController and timeout safety in sendWorkspaceMessage', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    assert.ok(appJs.includes('_workspaceAbortController'), 'Missing _workspaceAbortController in sendWorkspaceMessage');
    assert.match(appJs, /signal:\s*_workspaceAbortController\.signal/, 'Missing signal pass to fetch in sendWorkspaceMessage');
  });

  it('should define session templates and applyWorkspaceCode logic', () => {
    const appJs = fs.readFileSync('app.js', 'utf8');
    assert.ok(appJs.includes('sessionTemplates'), 'Missing sessionTemplates definition');
    assert.ok(appJs.includes('window.applyWorkspaceCode'), 'Missing window.applyWorkspaceCode handler');
    assert.ok(appJs.includes('btn-workspace-apply'), 'Missing btn-workspace-apply class in code block format');
  });
});
