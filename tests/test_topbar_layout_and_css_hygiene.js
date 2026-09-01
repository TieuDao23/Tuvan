const fs = require('fs');
const assert = require('assert');
const { execSync } = require('child_process');

describe('Top Bar Layout, Lofi Player, Smart Responsive & CSS Hygiene Test Suite', () => {
  let stylesCss, indexHtml, appJs;

  before(() => {
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  describe('1. R1: Top Bar & Lofi Player Layout', () => {
    it('should configure .top-bar with flex-wrap: nowrap, overflow: visible, and fixed height', () => {
      assert.match(stylesCss, /\.top-bar\s*\{[^}]*flex-wrap:\s*nowrap/i, 'Missing flex-wrap: nowrap on .top-bar');
      assert.match(stylesCss, /\.top-bar\s*\{[^}]*overflow:\s*visible/i, 'Missing overflow: visible on .top-bar');
      assert.match(stylesCss, /\.top-bar\s*\{[^}]*height:\s*var\(--topbar-height/i, 'Missing height variable on .top-bar');
    });

    it('should configure .top-bar-right with flex-wrap: nowrap, overflow: visible, and align-items: center', () => {
      assert.match(stylesCss, /\.top-bar-right\s*\{[^}]*flex-wrap:\s*nowrap/i, 'Missing flex-wrap: nowrap on .top-bar-right');
      assert.match(stylesCss, /\.top-bar-right\s*\{[^}]*overflow:\s*visible/i, 'Missing overflow: visible on .top-bar-right');
      assert.match(stylesCss, /\.top-bar-right\s*\{[^}]*align-items:\s*center/i, 'Missing align-items: center on .top-bar-right');
    });

    it('should configure .top-bar-center with min-width: 0 to prevent flex shrink overflow on narrow screens', () => {
      assert.match(stylesCss, /\.top-bar-center\s*\{[^}]*min-width:\s*0/i, 'Missing min-width: 0 on .top-bar-center');
    });

    it('should configure .current-model-display with pointer cursor and hover state', () => {
      assert.match(stylesCss, /\.current-model-display\s*\{[^}]*cursor:\s*pointer/i, 'Missing cursor: pointer on .current-model-display');
      assert.match(stylesCss, /\.current-model-display:hover/i, 'Missing hover state for .current-model-display');
    });

    it('should configure .suna-lofi-player with balanced height (32px-34px) and accent-color on volume slider', () => {
      assert.match(stylesCss, /\.suna-lofi-player\s*\{[^}]*height:\s*(?:32px|33px|34px)/i, 'Lofi player height not in 32px-34px range');
      assert.match(stylesCss, /\.lofi-volume-slider\s*\{[^}]*accent-color:\s*var\(--accent-1\)/i, 'Missing accent-color: var(--accent-1) on .lofi-volume-slider');
    });

    it('should implement Smart Responsive at <= 1150px collapsing player and hiding secondary buttons', () => {
      assert.match(stylesCss, /@media\s*\(max-width:\s*1150px\)/i, 'Missing @media (max-width: 1150px) breakpoint');
      assert.match(stylesCss, /@media\s*\(max-width:\s*1150px\)[\s\S]*?\.mobile-hidden[\s\S]*?display:\s*none\s*!important/i, 'Missing .mobile-hidden display: none at 1150px');
      assert.match(stylesCss, /@media\s*\(max-width:\s*1150px\)[\s\S]*?\.suna-lofi-player[\s\S]*?max-width:\s*165px/i, 'Missing compact max-width for .suna-lofi-player at 1150px');
    });

    it('should implement Ultra-Narrow 360px breakpoint with single-row containment', () => {
      assert.match(stylesCss, /@media\s*\(max-width:\s*360px\)[\s\S]*?\.suna-lofi-player/i, 'Missing 360px responsive rule for .suna-lofi-player');
    });

    it('should enforce text-overflow ellipsis and max-width on #current-model-name to prevent flex overflow', () => {
      assert.match(stylesCss, /#current-model-name\s*\{[^}]*text-overflow:\s*ellipsis/i, 'Missing text-overflow: ellipsis on #current-model-name');
      assert.match(stylesCss, /#current-model-name\s*\{[^}]*white-space:\s*nowrap/i, 'Missing white-space: nowrap on #current-model-name');
      assert.match(stylesCss, /#current-model-name\s*\{[^}]*overflow:\s*hidden/i, 'Missing overflow: hidden on #current-model-name');
    });

    it('should configure cross-browser slider track styling on .lofi-volume-slider', () => {
      assert.match(stylesCss, /\.lofi-volume-slider::-webkit-slider-runnable-track/i, 'Missing ::-webkit-slider-runnable-track for lofi volume slider');
      assert.match(stylesCss, /\.lofi-volume-slider::-moz-range-track/i, 'Missing ::-moz-range-track for lofi volume slider');
      assert.match(stylesCss, /body\.light-mode\s+\.lofi-volume-slider::-moz-range-track/i, 'Missing light-mode ::-moz-range-track for lofi volume slider');
    });

    it('should protect against font descender clipping with line-height and vertical alignment', () => {
      assert.match(stylesCss, /\.current-model-display\s*\{[^}]*line-height:\s*1\.2/i, 'Missing line-height: 1.2 on .current-model-display');
      assert.match(stylesCss, /#current-model-name\s*\{[^}]*line-height:\s*1\.2/i, 'Missing line-height: 1.2 on #current-model-name');
      assert.match(stylesCss, /\.lofi-track-title\s*\{[^}]*line-height:\s*1\.2/i, 'Missing line-height: 1.2 on .lofi-track-title');
    });

    it('should configure mobile dynamic viewport height (100dvh) across main layouts', () => {
      assert.match(stylesCss, /body\s*\{[^}]*height:\s*100dvh/i, 'Missing 100dvh on body');
      assert.match(stylesCss, /#app\s*\{[^}]*height:\s*100dvh/i, 'Missing 100dvh on #app');
      assert.match(stylesCss, /\.bg-animation\s*\{[^}]*height:\s*100dvh/i, 'Missing 100dvh on .bg-animation');
    });
  });

  describe('2. R2: CSS Syntax & Deduplication Hygiene', () => {
    it('should have perfectly balanced curly braces in styles.css', () => {
      const openCount = (stylesCss.match(/\{/g) || []).length;
      const closeCount = (stylesCss.match(/\}/g) || []).length;
      assert.strictEqual(openCount, closeCount, `Mismatched braces in styles.css: ${openCount} open vs ${closeCount} close`);
    });

    it('should not contain unclosed selector .message.assistant .message-bubble merging into another selector', () => {
      assert.doesNotMatch(stylesCss, /\.message\.assistant\s+\.message-bubble\s*\{\s*\.user-dropdown/i, 'Unclosed selector found at message-bubble / user-dropdown');
    });

    it('should have zero consecutive duplicate -webkit-backdrop-filter declarations', () => {
      const lines = stylesCss.split(/\r?\n/);
      let consecutiveCount = 0;
      let duplicateFound = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-webkit-backdrop-filter')) {
          consecutiveCount++;
          if (consecutiveCount > 1) {
            duplicateFound = true;
            break;
          }
        } else if (lines[i].trim() !== '') {
          consecutiveCount = 0;
        }
      }
      assert.strictEqual(duplicateFound, false, 'Found consecutive duplicate -webkit-backdrop-filter declarations');
    });

    it('should not have duplicate will-change declarations inside .btn', () => {
      const btnBlockMatch = stylesCss.match(/\.btn\s*\{([^}]+)\}/);
      assert.ok(btnBlockMatch, 'Missing .btn rule block in styles.css');
      const willChangeCount = (btnBlockMatch[1].match(/will-change\s*:/g) || []).length;
      assert.strictEqual(willChangeCount, 1, `Expected exactly 1 will-change declaration in .btn, found ${willChangeCount}`);
    });
  });

  describe('3. R3: UI/UX & Z-Index Consistency', () => {
    it('should set appropriate z-index for dropdowns and modal overlays', () => {
      assert.match(stylesCss, /\.user-dropdown\s*\{[^}]*z-index:\s*(?:200|250|300)/i, 'Missing high z-index on .user-dropdown');
      assert.match(stylesCss, /\.mobile-more-menu\s*\{[^}]*z-index:\s*(?:200|250|300)/i, 'Missing high z-index on .mobile-more-menu');
      assert.match(stylesCss, /\.modal-overlay\s*\{[^}]*z-index:\s*(?:1000|2000)/i, 'Missing high z-index on .modal-overlay');
    });

    it('should configure .toast-container with z-index: 10000 to overlay above modal dialogs and workspace', () => {
      assert.match(stylesCss, /\.toast-container\s*\{[^}]*z-index:\s*10000/i, 'Missing z-index: 10000 on .toast-container');
    });

    it('should define Light Mode rules for dropdowns and lofi player', () => {
      assert.match(stylesCss, /body\.light-mode\s+\.user-dropdown/i, 'Missing light mode styling for .user-dropdown');
      assert.match(stylesCss, /body\.light-mode\s+\.suna-lofi-player/i, 'Missing light mode styling for .suna-lofi-player');
    });

    it('should include #btn-api-settings-mobile inside #mobile-more-menu in index.html', () => {
      assert.ok(indexHtml.includes('id="btn-api-settings-mobile"'), 'Missing btn-api-settings-mobile in index.html');
      assert.ok(appJs.includes('btn-api-settings-mobile'), 'Missing click listener for btn-api-settings-mobile in app.js');
    });

    it('should synchronize #theme-icon-mobile alongside #theme-icon on theme toggles in app.js', () => {
      assert.match(appJs, /theme-icon-mobile/i, 'Missing synchronization for theme-icon-mobile in app.js');
    });

    it('should enforce mutual dismissal between user-dropdown and mobile-more-menu', () => {
      assert.match(appJs, /user-dropdown[\s\S]*?classList\.remove\('active'\)/i, 'Missing user-dropdown dismissal in app.js');
      assert.match(indexHtml, /mobile-more-menu[\s\S]*?classList\.remove\('active'\)/i, 'Missing mobile-more-menu dismissal on user profile button in index.html');
    });

    it('should wire current-model-display to open api-modal on click in app.js', () => {
      assert.match(appJs, /current-model-display[\s\S]*?openModal\('api-modal'\)/i, 'Missing click handler wiring current-model-display to api-modal');
    });

    it('should support keyboard navigation (Enter/Space) on current-model-display in app.js', () => {
      assert.match(appJs, /currentModelDisplay\.addEventListener\('keydown'[\s\S]*?(?:Enter|Space|' ')/i, 'Missing keydown handler for current-model-display in app.js');
    });
  });

  describe('4. R4: Compilation & Syntax Integrity', () => {
    it('should pass node -c app.js with zero syntax errors', () => {
      assert.doesNotThrow(() => {
        execSync('node -c app.js', { stdio: 'pipe' });
      });
    });

    it('should pass node -c redesign.js with zero syntax errors', () => {
      assert.doesNotThrow(() => {
        execSync('node -c redesign.js', { stdio: 'pipe' });
      });
    });
  });
});
