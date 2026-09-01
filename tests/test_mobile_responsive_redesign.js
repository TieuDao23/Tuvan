const fs = require('fs');
const path = require('path');
const assert = require('assert');

describe('Mobile-First Zen Responsive Redesign Test Suite', function() {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const cssPath = path.join(__dirname, '..', 'styles.css');
  const jsPath = path.join(__dirname, '..', 'app.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  describe('Tier 1: HTML Viewport & Mobile Controls Structure', function() {
    it('should configure viewport-fit=cover in index.html for iOS/Android notches', function() {
      assert.ok(html.includes('viewport-fit=cover'), 'index.html must include viewport-fit=cover in meta viewport');
    });

    it('should include Suna AI tab button in .artifact-view-toggle in index.html', function() {
      assert.ok(html.includes('data-view="chat"'), 'index.html must include data-view="chat" in view toggle buttons');
      assert.ok(html.includes('Suna AI</span>'), 'index.html must include Suna AI label text');
    });

    it('should contain mobile more menu with essential secondary actions', function() {
      assert.ok(html.includes('id="mobile-more-menu"'), 'index.html must have #mobile-more-menu');
      assert.ok(html.includes('id="btn-mobile-more"'), 'index.html must have #btn-mobile-more button');
    });
  });

  describe('Tier 2: CSS 100dvh, Safe Areas & Touch Target Rules', function() {
    it('should declare CSS safe area variables in styles.css', function() {
      assert.ok(css.includes('--safe-area-top: env(safe-area-inset-top'), 'styles.css must declare --safe-area-top');
      assert.ok(css.includes('--safe-area-bottom: env(safe-area-inset-bottom'), 'styles.css must declare --safe-area-bottom');
    });

    it('should enforce 100dvh on app-container and main-content for modern mobile viewports', function() {
      assert.ok(css.includes('height: 100dvh'), 'styles.css must use 100dvh for container heights');
    });

    it('should set font-size: 16px on mobile message-input to prevent iOS Safari auto-zoom', function() {
      assert.ok(css.includes('font-size: 16px !important; /* CRITICAL: Prevent iOS Safari auto-zoom'), 'styles.css must enforce 16px input font on mobile');
    });

    it('should remove default tap highlight color on mobile', function() {
      assert.ok(css.includes('-webkit-tap-highlight-color: transparent'), 'styles.css must include tap highlight reset');
    });
  });

  describe('Tier 3: Mobile Tabbed Live Workspace UI', function() {
    it('should define full-screen fixed positioning for .artifacts-panel on <= 768px', function() {
      assert.ok(css.includes('width: 100vw !important'), 'artifacts-panel must take 100vw on mobile');
      assert.ok(css.includes('z-index: 1050 !important'), 'artifacts-panel must have top z-index on mobile');
    });

    it('should support tab-based full-screen switching for preview, editor, and chat views', function() {
      assert.ok(css.includes('.artifacts-panel[data-view="preview"] .artifact-preview-container'), 'CSS must define mobile preview tab styling');
      assert.ok(css.includes('.artifacts-panel[data-view="editor"] .artifact-editor-container'), 'CSS must define mobile editor tab styling');
      assert.ok(css.includes('.artifacts-panel[data-view="chat"] .artifact-chat-container'), 'CSS must define mobile chat tab styling');
    });

    it('should hide workspace left handle and resizers on mobile viewports', function() {
      assert.ok(css.includes('.artifacts-panel .workspace-left-handle'), 'CSS must select workspace handles on mobile');
      assert.ok(css.includes('display: none !important'), 'CSS must hide resizers on mobile');
    });
  });

  describe('Tier 4: Mobile Bottom Sheets & JavaScript Interactions', function() {
    it('should configure mobile bottom sheet slide-up animation in styles.css', function() {
      assert.ok(css.includes('@keyframes slideUpMobile'), 'CSS must define slideUpMobile keyframes');
      assert.ok(css.includes('border-radius: 24px 24px 0 0 !important'), 'CSS must set bottom sheet rounded corners');
    });

    it('should automatically switch to preview tab when opening artifact on mobile in app.js', function() {
      assert.ok(js.includes('window.innerWidth <= 768'), 'app.js must check mobile screen width in openArtifact');
      assert.ok(js.includes("panel.setAttribute('data-view', 'preview')"), 'app.js must set preview mode on mobile');
    });
  });
});
