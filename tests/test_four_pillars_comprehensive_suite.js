const fs = require('fs');
const assert = require('assert');

describe('Suna Chat 4 Pillars Comprehensive Enhancement Test Suite', () => {
  let appJs, indexHtml, stylesCss, mindmapHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    mindmapHtml = fs.readFileSync('mindmap.html', 'utf8');
  });

  // =========================================================================
  // PILLAR 1: MINDMAP INTELLIGENCE & FULLSCREEN BRIDGE
  // =========================================================================
  describe('Pillar 1: Mindmap Intelligence & 1-Click Generation', () => {
    it('should define #btn-chat-to-mindmap button in index.html', () => {
      assert.match(indexHtml, /id=["']btn-chat-to-mindmap["']/, 'Missing #btn-chat-to-mindmap in index.html');
    });

    it('should implement generateMindmapFromChat function in app.js', () => {
      assert.match(appJs, /async\s+function\s+generateMindmapFromChat\s*\(/, 'Missing generateMindmapFromChat in app.js');
    });

    it('should implement openFullMindmapCanvas function in app.js with suna_active_mindmap_data bridge', () => {
      assert.match(appJs, /function\s+openFullMindmapCanvas\s*\(/, 'Missing openFullMindmapCanvas in app.js');
      assert.match(appJs, /suna_active_mindmap_data/, 'Missing suna_active_mindmap_data storage bridge in app.js');
    });

    it('should verify mindmap.html can receive external mindmap data', () => {
      assert.match(mindmapHtml, /suna_active_mindmap_data/, 'mindmap.html must read suna_active_mindmap_data');
      assert.match(mindmapHtml, /LOAD_MINDMAP/, 'mindmap.html must handle LOAD_MINDMAP message');
    });
  });

  // =========================================================================
  // PILLAR 2: LIVE WORKSPACE PRO (CONSOLE & DEVICE MODE)
  // =========================================================================
  describe('Pillar 2: Live Workspace Pro (Developer Console & Device Mode)', () => {
    it('should define Workspace Console Drawer and toggle in index.html or dynamic UI', () => {
      assert.match(indexHtml, /id=["']workspace-console-drawer["']|class=["'][^"']*workspace-console-drawer[^"']*["']/, 'Missing console drawer in index.html');
    });

    it('should define Device Mode Switcher in index.html', () => {
      assert.match(indexHtml, /data-device=["']desktop["']/, 'Missing desktop device button');
      assert.match(indexHtml, /data-device=["']tablet["']/, 'Missing tablet device button');
      assert.match(indexHtml, /data-device=["']mobile["']/, 'Missing mobile device button');
    });

    it('should handle iframe console postMessage events in app.js', () => {
      assert.match(appJs, /WORKSPACE_CONSOLE/, 'app.js must handle WORKSPACE_CONSOLE messages');
      assert.match(appJs, /addWorkspaceConsoleLog/, 'Missing addWorkspaceConsoleLog helper');
    });

    it('should define responsive device frame styles in styles.css', () => {
      assert.match(stylesCss, /\.device-frame\.tablet|\.device-mode-tablet/, 'Missing tablet device frame CSS');
      assert.match(stylesCss, /\.device-frame\.mobile|\.device-mode-mobile/, 'Missing mobile device frame CSS');
    });
  });

  // =========================================================================
  // PILLAR 3: AI MEMORY & CONTEXT ARCHITECTURE (PINNED CONTEXT & FOLDERS)
  // =========================================================================
  describe('Pillar 3: AI Memory & Context Architecture (Pinned Context & Folders)', () => {
    it('should declare folders and activeFolder in State in app.js', () => {
      assert.match(appJs, /folders\s*:\s*\[/, 'State must declare folders array');
      assert.match(appJs, /activeFolder\s*:\s*['"]Tất cả['"]/, 'State must declare activeFolder initialized to Tất cả');
    });

    it('should define folder filter pills bar in index.html', () => {
      assert.match(indexHtml, /id=["']folder-pills-bar["']|class=["'][^"']*folder-pills-bar[^"']*["']/, 'Missing folder pills container in index.html');
    });

    it('should inject chat.pinnedContext into buildSystemPrompt in app.js', () => {
      assert.match(appJs, /chat\.pinnedContext|activeChat\.pinnedContext/, 'buildSystemPrompt must inject pinnedContext if present');
    });

    it('should implement filterChatsByFolder and setChatFolder in app.js', () => {
      assert.match(appJs, /function\s+setChatFolder\s*\(/, 'Missing setChatFolder in app.js');
      assert.match(appJs, /function\s+filterChatsByFolder\s*\(/, 'Missing filterChatsByFolder in app.js');
    });
  });

  // =========================================================================
  // PILLAR 4: DOCUMENT & KNOWLEDGE INTELLIGENCE (TABLE CSV EXPORT & DOC-TO-MINDMAP)
  // =========================================================================
  describe('Pillar 4: Document & Knowledge Intelligence', () => {
    it('should implement exportTableToCSV in app.js with UTF-8 BOM', () => {
      assert.match(appJs, /function\s+exportTableToCSV\s*\(/, 'Missing exportTableToCSV function in app.js');
      assert.match(appJs, /\\uFEFF/, 'exportTableToCSV must include UTF-8 BOM for Excel compatibility');
    });

    it('should wrap tables with CSV export button in formatMessage in app.js', () => {
      assert.match(appJs, /btn-export-table-csv|exportTableToCSV/, 'formatMessage must attach CSV export button to tables');
    });

    it('should provide doc-to-mindmap trigger in analyzeDocumentMessage or document tools in app.js', () => {
      assert.match(appJs, /summarizeDocumentToMindmap|doc-to-mindmap/, 'Missing doc-to-mindmap trigger in app.js');
    });
  });

  // =========================================================================
  // INTEGRITY & ZERO REGRESSIONS
  // =========================================================================
  describe('System Integrity & Non-Interference', () => {
    it('should pass node -c app.js with zero syntax errors', () => {
      const { execSync } = require('child_process');
      execSync('node -c app.js', { stdio: 'pipe' });
    });
  });
});
