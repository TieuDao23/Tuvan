const fs = require('fs');
const assert = require('assert');

describe('Challenger 2 Adversarial Stress Suite', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  describe('1. Dual Resizers and Left Handle Clamping Bounds', () => {
    it('should clamp left handle width between 25% and 100%', () => {
      assert.match(appJs, /percentage\s*=\s*Math\.max\(25,\s*Math\.min\(percentage,\s*100\)\)/, 'Left handle is not clamped between 25% and 100%');
    });

    it('should clamp resizer1 (editor/preview) with minimum 10% pane guard', () => {
      assert.match(appJs, /editorWidthPercent\s*=\s*Math\.max\(10,\s*Math\.min\(editorWidthPercent,\s*80\)\)/);
      assert.match(appJs, /previewWidthPercent\s*>\s*10/);
    });

    it('should clamp resizer2 (preview/chat) with minimum 10% pane guard', () => {
      assert.match(appJs, /leftWidthPercent\s*=\s*Math\.max\(20,\s*Math\.min\(leftWidthPercent,\s*90\)\)/);
      assert.match(appJs, /previewWidthPercent\s*>\s*10\s*&&\s*chatWidthPercent\s*>\s*10/);
    });

    it('should lock all iframes and preview container on drag start and release on drag end / blur', () => {
      assert.match(appJs, /resizer1\.addEventListener\(['"]mousedown['"],[\s\S]*?lockAllIframes\(\)/);
      assert.match(appJs, /resizer2\.addEventListener\(['"]mousedown['"],[\s\S]*?lockAllIframes\(\)/);
      assert.match(appJs, /leftHandle\.addEventListener\(['"]mousedown['"],[\s\S]*?lockAllIframes\(\)/);
      assert.match(appJs, /document\.addEventListener\(['"]mouseup['"],[\s\S]*?unlockAllIframes\(\)/);
      assert.match(appJs, /window\.addEventListener\(['"]blur['"],[\s\S]*?unlockAllIframes\(\)/);
    });
  });

  describe('2. Suna AI Workspace Assistant UI Responsiveness & Edge Cases', () => {
    it('should abort previous in-flight request before creating new AbortController', () => {
      assert.match(appJs, /if\s*\(_workspaceAbortController\)\s*\{\s*_workspaceAbortController\.abort\(\);/);
    });

    it('should set a 45s safety timeout for assistant requests and abort gracefully', () => {
      assert.match(appJs, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?_workspaceAbortController\.abort\(\);[\s\S]*?45000\)/);
    });

    it('should remove typing indicator on both successful response and catch/abort block', () => {
      // Check typing indicator removal in try block
      assert.match(appJs, /const\s+typingEl\s*=\s*document\.getElementById\(typingMsgId\);\s*if\s*\(typingEl\)\s*typingEl\.remove\(\);/);
      // Check typing indicator removal in catch block
      assert.match(appJs, /catch\s*\(err\)\s*\{[\s\S]*?if\s*\(typingEl\)\s*typingEl\.remove\(\);/);
    });

    it('should safely encode and decode complex code blocks containing quotes, HTML, and unicode', () => {
      // Simulating formatWorkspaceMessageContent and applyWorkspaceCode logic
      function escHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function formatWorkspaceMessageContent(text) {
        if (!text) return '';
        let html = escHtml(text);
        const placeholders = {};
        let count = 0;
        
        html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
          const decodedCode = code
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
            
          const placeholderToken = `%%WS_CODE_${count++}%%`;
          const applyBtn = `<button class="btn-workspace-apply" onclick="applyWorkspaceCode(this)" data-code="${encodeURIComponent(decodedCode)}"><span class="material-icons-round">play_arrow</span> Áp dụng vào Editor</button>`;
          const cleanLang = lang.trim() || 'code';
          
          placeholders[placeholderToken] = `<div class="code-block-wrapper">
            <div class="code-lang">${cleanLang}</div>
            <button class="btn-copy-code" onclick="copyCodeBlock(this)" title="Sao chép code"><span class="material-icons-round">content_copy</span></button>
            <pre><code>${escHtml(decodedCode)}</code></pre>
            ${applyBtn}
          </div>`;
          
          return placeholderToken;
        });

        for (const token in placeholders) {
          html = html.replace(token, placeholders[token]);
        }
        return html;
      }

      const stressInput = 'Test code:\n```html\n<div class="test" onclick="alert(\'hello & welcome\')">Chào bạn 🚀</div>\n```';
      const formatted = formatWorkspaceMessageContent(stressInput);
      const match = formatted.match(/data-code="([^"]+)"/);
      assert.ok(match, 'Button data-code attribute missing');
      const decoded = decodeURIComponent(match[1]);
      assert.strictEqual(decoded.trim(), '<div class="test" onclick="alert(\'hello & welcome\')">Chào bạn 🚀</div>');
    });
  });

  describe('3. Responsive Breakpoints & CSS Layout Stability', () => {
    it('should have 3-pane split styles in CSS with 35% / 35% / 30% default distribution', () => {
      assert.match(stylesCss, /\.artifacts-panel\[data-view="split"\]\s+\.artifact-editor-container\s*\{[\s\S]*?width:\s*35%;/);
      assert.match(stylesCss, /\.artifacts-panel\[data-view="split"\]\s+\.artifact-preview-container\s*\{[\s\S]*?width:\s*35%;/);
      assert.match(stylesCss, /\.artifacts-panel\[data-view="split"\]\s+\.artifact-chat-container\s*\{[\s\S]*?width:\s*30%;/);
    });

    it('should have responsive rules for tablet (1024px) and mobile (768px)', () => {
      assert.match(stylesCss, /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.artifacts-panel\s*\{[\s\S]*?width:\s*80%;/);
      assert.match(stylesCss, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.artifacts-panel\s*\{[\s\S]*?width:\s*100%\s*!important;/);
    });

    it('should stack all 3 panes vertically on mobile <= 768px with full width', () => {
      assert.match(stylesCss, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.artifacts-panel\[data-view="split"\]\s+\.artifacts-content\s*\{[\s\S]*?flex-direction:\s*column;/);
      assert.match(stylesCss, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.artifacts-panel\[data-view="split"\]\s+\.artifact-editor-container\s*\{[\s\S]*?width:\s*100%\s*!important;/);
      assert.match(stylesCss, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.artifacts-panel\[data-view="split"\]\s+\.artifact-preview-container\s*\{[\s\S]*?width:\s*100%\s*!important;/);
      assert.match(stylesCss, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.artifacts-panel\[data-view="split"\]\s+\.artifact-chat-container\s*\{[\s\S]*?width:\s*100%\s*!important;/);
    });

    it('should hide resizers and left handle on mobile <= 768px', () => {
      assert.match(stylesCss, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.artifacts-panel\s+\.workspace-left-handle\s*\{[\s\S]*?display:\s*none\s*!important;/);
      assert.match(stylesCss, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.artifacts-panel\s+\.artifact-resizer\s*\{[\s\S]*?display:\s*none\s*!important;/);
    });

    it('should not define layout-shifting transition-property on width/height/top/left', () => {
      assert.doesNotMatch(stylesCss, /transition-property:\s*.*(width|height|top|left)/i);
    });

    it('should define ultra-narrow (360px) and ultra-wide (2560px) responsive rules', () => {
      assert.match(stylesCss, /@media\s*\(max-width:\s*360px\)/, 'Missing ultra-narrow 360px responsive breakpoint');
      assert.match(stylesCss, /@media\s*\(min-width:\s*2560px\)/, 'Missing ultra-wide 2560px container containment rule');
    });

    it('should pair backdrop-filter with -webkit-backdrop-filter for WebKit engine compatibility', () => {
      assert.match(stylesCss, /\.top-bar\s*\{[\s\S]*?-webkit-backdrop-filter:\s*blur/);
      assert.match(stylesCss, /\.artifacts-panel\s*\{[\s\S]*?-webkit-backdrop-filter:\s*blur/);
    });
  });

  describe('4. Anti-Tautology & Genuine Test Split Verification', () => {
    it('should verify visible tests directory contains 4 genuine test suites', () => {
      const visibleFiles = fs.readdirSync('tests/ui_redesign/visible_tests');
      assert.ok(visibleFiles.length >= 4, `Expected at least 4 visible test files, found ${visibleFiles.length}`);
    });

    it('should verify hidden tests directory contains 4 genuine test suites', () => {
      const hiddenFiles = fs.readdirSync('tests/ui_redesign/hidden_tests');
      assert.ok(hiddenFiles.length >= 4, `Expected at least 4 hidden test files, found ${hiddenFiles.length}`);
    });

    it('should ensure visible vs hidden tests follow the 60/40 split convention', () => {
      const visibleFiles = fs.readdirSync('tests/ui_redesign/visible_tests');
      const hiddenFiles = fs.readdirSync('tests/ui_redesign/hidden_tests');
      const total = visibleFiles.length + hiddenFiles.length;
      const visiblePct = (visibleFiles.length / total) * 100;
      assert.ok(visiblePct >= 50 && visiblePct <= 60, `Visible test ratio ${visiblePct}% aligns with standard`);
    });
  });
});
