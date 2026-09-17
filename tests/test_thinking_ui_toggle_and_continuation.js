/**
 * test_thinking_ui_toggle_and_continuation.js
 *
 * Test suite verifying:
 * 1. Thinking UI toggle setting in index.html, styles.css, app.js (showThinkingUi)
 * 2. Background thinking preservation when thinking UI is hidden
 * 3. Prevention of answer swallowing in ExtendedThinkingStreamParser and formatMessage
 * 4. Automatic continuation prompt when output only has thinking or finish_reason === 'length'
 */

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const vm = require('vm');

describe('Thinking UI Toggle & Robust Continuation Pipeline', function() {
  this.timeout(15000);

  let appJs, stylesCss, indexHtml, SunaAgent;

  before(() => {
    appJs = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
    stylesCss = fs.readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');
    indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const agentModule = require(path.resolve(__dirname, '../suna_agent.js'));
    SunaAgent = agentModule.SunaAgent || agentModule;
  });

  // =========================================================================
  // GROUP 1: Settings Modal, HTML & CSS Synchronization (Yêu cầu 2)
  // =========================================================================
  describe('Group 1: Settings Modal, HTML & CSS (showThinkingUi toggle)', () => {
    it('Criterion 1.1: index.html contains #toggle-show-thinking switch in settings-modal', () => {
      assert.ok(indexHtml.includes('id="toggle-show-thinking"'), 'index.html must have #toggle-show-thinking input');
      assert.ok(indexHtml.includes('settings-switch'), 'Must have settings-switch class');
      assert.ok(indexHtml.includes('Hiển thị khối suy nghĩ'), 'Must have descriptive label in Vietnamese');
    });

    it('Criterion 1.2: styles.css hides thinking-block-wrapper when body has .hide-thinking-ui', () => {
      assert.match(
        stylesCss,
        /body\.hide-thinking-ui\s+\.thinking-block-wrapper\s*\{[^}]*display:\s*none\s*!important/,
        'styles.css must hide .thinking-block-wrapper with display: none !important'
      );
    });

    it('Criterion 1.3: styles.css contains .settings-switch and .settings-switch-slider styling', () => {
      assert.ok(stylesCss.includes('.settings-switch {'), 'Must style .settings-switch');
      assert.ok(stylesCss.includes('.settings-switch-slider'), 'Must style .settings-switch-slider');
      assert.ok(stylesCss.includes('.settings-toggle-row'), 'Must style .settings-toggle-row');
    });

    it('Criterion 1.4: getDefaultSettings includes showThinkingUi: true by default', () => {
      const sandbox = { window: {} };
      vm.createContext(sandbox);
      const start = appJs.indexOf('function getDefaultSettings() {');
      const end = appJs.indexOf('window.getDefaultSettings = getDefaultSettings;', start) + 'window.getDefaultSettings = getDefaultSettings;'.length;
      vm.runInContext(appJs.slice(start, end), sandbox);

      const defaults = sandbox.getDefaultSettings();
      assert.strictEqual(defaults.showThinkingUi, true, 'showThinkingUi must be true by default');
    });

    it('Criterion 1.5: applyThinkingUiVisibility toggles .hide-thinking-ui class on document.body', () => {
      const classList = new Set();
      const mockDoc = {
        body: {
          classList: {
            add: (c) => classList.add(c),
            remove: (c) => classList.delete(c),
            contains: (c) => classList.has(c)
          }
        }
      };

      const sandbox = {
        document: mockDoc,
        window: {},
        State: { settings: { showThinkingUi: false } }
      };
      vm.createContext(sandbox);

      const start = appJs.indexOf('function applyThinkingUiVisibility() {');
      const end = appJs.indexOf('window.applyThinkingUiVisibility = applyThinkingUiVisibility;', start) + 'window.applyThinkingUiVisibility = applyThinkingUiVisibility;'.length;
      vm.runInContext(appJs.slice(start, end), sandbox);

      sandbox.applyThinkingUiVisibility();
      assert.strictEqual(classList.has('hide-thinking-ui'), true, 'Body must have hide-thinking-ui when showThinkingUi is false');

      sandbox.State.settings.showThinkingUi = true;
      sandbox.applyThinkingUiVisibility();
      assert.strictEqual(classList.has('hide-thinking-ui'), false, 'Body must remove hide-thinking-ui when showThinkingUi is true');
    });

    it('Criterion 1.6: btn-save-settings updates State.settings.showThinkingUi and calls applyThinkingUiVisibility', () => {
      assert.match(
        appJs,
        /const\s+toggleThinking\s*=\s*\$\(['"]#toggle-show-thinking['"]\)[\s\S]*?State\.settings\.showThinkingUi\s*=\s*toggleThinking\.checked;/m,
        'btn-save-settings handler must read toggle-show-thinking.checked'
      );
      assert.match(
        appJs,
        /applyThinkingUiVisibility\(\);[\s\S]*?closeModal\('settings-modal'\);/m,
        'btn-save-settings must call applyThinkingUiVisibility()'
      );
    });
  });

  // =========================================================================
  // GROUP 2: Parser & formatMessage Answer Rescue (Yêu cầu 1)
  // =========================================================================
  describe('Group 2: ExtendedThinkingStreamParser & formatMessage Answer Rescue', () => {
    it('Criterion 2.1: ExtendedThinkingStreamParser does not swallow answer when model transitions without closing tag', () => {
      const parser = new SunaAgent.ExtendedThinkingStreamParser();
      parser.push('<think>Đang giải toán: 2 + 2 = 4\n\n**Trả lời:**\nKết quả là 4.');
      parser.flush();

      assert.strictEqual(parser.fullThought.includes('Đang giải toán'), true, 'Thought must contain reasoning');
      assert.strictEqual(parser.filteredText.includes('Kết quả là 4.'), true, 'Filtered text must contain answer');
      assert.strictEqual(parser.filteredText.includes('<think>'), false, 'Filtered text must not leak think tags');
    });

    it('Criterion 2.2: ExtendedThinkingStreamParser supports closing tag with whitespace like </ think>', () => {
      const parser = new SunaAgent.ExtendedThinkingStreamParser();
      parser.push('<think>Nội dung suy nghĩ</ think>Câu trả lời chính thức.');
      parser.flush();

      assert.strictEqual(parser.fullThought, 'Nội dung suy nghĩ');
      assert.strictEqual(parser.filteredText, 'Câu trả lời chính thức.');
    });

    it('Criterion 2.3: ExtendedThinkingStreamParser supports <reasoning> tag', () => {
      const parser = new SunaAgent.ExtendedThinkingStreamParser();
      parser.push('<reasoning>Deep reasoning step</reasoning>Official response.');
      parser.flush();

      assert.strictEqual(parser.fullThought, 'Deep reasoning step');
      assert.strictEqual(parser.filteredText, 'Official response.');
    });

    it('Criterion 2.4: formatMessage extracts answer when unclosed thinking block contains an answer marker', () => {
      function escHtml(s) {
        if (!s) return '';
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }
      const sandbox = { escHtml, arguments: [] };
      vm.createContext(sandbox);

      const formatStart = appJs.indexOf('function formatMessage(text, isStreaming = false) {');
      const formatEnd = appJs.indexOf('function parseKanban(code) {');
      vm.runInContext(appJs.slice(formatStart, formatEnd), sandbox);

      const unclosedWithAnswer = '<think>Phân tích dữ liệu\n\n**Trả lời:**\nDữ liệu hoàn toàn hợp lệ.';
      const output = sandbox.formatMessage(unclosedWithAnswer, false);

      assert.ok(output.includes('thinking-block-wrapper'), 'Must render thinking wrapper for reasoning part');
      assert.ok(output.includes('Phân tích dữ liệu'), 'Thinking content must have reasoning');
      assert.ok(output.includes('Dữ liệu hoàn toàn hợp lệ'), 'Answer part must be rendered outside thinking block');
    });
  });

  // =========================================================================
  // GROUP 3: Automatic Continuation Loop on Thinking-Only / Truncation
  // =========================================================================
  describe('Group 3: Continuation Loop when Output Only Contains Thinking', () => {
    it('Criterion 3.1: app.js detects isThinkingOnlyOrEmpty and activates continuation', () => {
      assert.match(
        appJs,
        /const\s+isThinkingOnlyOrEmpty\s*=\s*Boolean\(\s*\(!currentFiltered\s*\|\|\s*!currentFiltered\.trim\(\)\)\s*&&\s*\(currentThought\s*&&\s*currentThought\.trim\(\)\)\s*\);/,
        'app.js must detect when only thought was generated with empty content'
      );
      assert.match(
        appJs,
        /const\s+isTruncated\s*=\s*\([\s\S]*?isThinkingOnlyOrEmpty[\s\S]*?\)\s*&&\s*!State\.abortController\?\.signal\?\.aborted;/,
        'isTruncated must include isThinkingOnlyOrEmpty'
      );
    });

    it('Criterion 3.2: Continuation prompt asks for official answer when content is empty', () => {
      assert.match(
        appJs,
        /const\s+continuationPrompt\s*=\s*!curFiltered\.trim\(\)\s*\?\s*['"]Dựa trên quá trình suy nghĩ trên[\s\S]*?Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:/,
        'Continuation prompt must command the model to produce official answer if content is empty'
      );
    });

    it('Criterion 3.3: continuationMsg supplies non-empty content to prevent API 400 rejection', () => {
      assert.match(
        appJs,
        /content:\s*curFiltered\.trim\(\)\s*\?\s*curFiltered\s*:\s*\(curThought\s*\?\s*`<think>\$\{curThought\}<\/think>`\s*:\s*['"]\s*['"]\)/,
        'continuationMsg must provide fallback content when curFiltered is empty'
      );
    });

    it('Criterion 3.4: finalAnswer strips thinking tags if parser filteredText was empty', () => {
      assert.match(
        appJs,
        /const\s+cleanContent\s*=\s*assistantContent[\s\S]*?finalAnswer\s*=\s*rawFiltered\.trim\(\)\s*\?\s*rawFiltered\s*:\s*\(cleanContent/,
        'finalAnswer must sanitize raw assistantContent to avoid leaking thinking blocks'
      );
    });

    it('Criterion 3.5: isLengthTruncated handles max_tokens and truncated string variants', () => {
      assert.match(
        appJs,
        /turnFinishReason\s*===\s*['"]length['"]\s*\|\|\s*\(typeof turnFinishReason\s*===\s*['"]string['"]\s*&&\s*\[['"]max_tokens['"],\s*['"]truncated['"],\s*['"]length['"]\]\.includes\(turnFinishReason\.toLowerCase\(\)\)\)/,
        'isLengthTruncated must support length, max_tokens, and truncated finish reasons'
      );
    });
  });
});
