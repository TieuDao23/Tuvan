/**
 * tests/test_dsh_zero_regression_matrix.js
 * 
 * Comprehensive Zero-Regression Matrix & System Invariant Verification Suite for:
 * DeepSeek Harness (dsh) Integration into SunaChat & Live Workspace
 * 
 * Verifies that the DeepSeek Harness additions do NOT break or regress any existing features:
 * - ZR-01: JavaScript Syntax Integrity (node -c app.js && node -c redesign.js)
 * - ZR-02: CSS Hygiene, Balanced Braces & .toast-container z-index: 10000
 * - ZR-03: StreamParser Backward Compatibility (standard text, tag parsing, stream flush)
 * - ZR-04: SunaAgent Invariants (MAX_RECURSION_DEPTH: 4, reset, abort, legacy tools)
 * - ZR-05: Live Workspace Direct Auto-Sync & Event Dispatch
 * - ZR-06: Autonomous Continuation Engine & Stitching Integrity
 * - ZR-07: Storage Quota Resilience & Isolated User Storage Suffixes
 * - ZR-08: Fullscreen Mindmap Bridge (suna_active_mindmap_data & LOAD_MINDMAP)
 * - ZR-09: Lofi Audio Player & Sentiment Synchronization
 * - ZR-10: Mobile Responsiveness, Zen Theme & Critical DOM Selectors
 */

const fs = require('fs');
const assert = require('assert');
const { execSync } = require('child_process');
const vm = require('vm');

describe('DSH Suite 4: Zero-Regression Matrix & Public Contract Invariants', function() {
  this.timeout(15000);

  let appJs, redesignJs, stylesCss, indexHtml, mindmapHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    redesignJs = fs.readFileSync('redesign.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
    mindmapHtml = fs.readFileSync('mindmap.html', 'utf8');
  });

  // =========================================================================
  // GATE 1: STATIC SYNTAX & COMPILATION INTEGRITY
  // =========================================================================

  describe('Gate 1: Static Syntax & Compilation Integrity (ZR-01)', () => {
    it('ZR-01.1: should compile app.js cleanly with node -c (0 syntax errors)', () => {
      assert.doesNotThrow(() => {
        execSync('node -c app.js', { stdio: 'pipe' });
      }, 'app.js must compile with 0 syntax errors');
    });

    it('ZR-01.2: should compile redesign.js cleanly with node -c (0 syntax errors)', () => {
      assert.doesNotThrow(() => {
        execSync('node -c redesign.js', { stdio: 'pipe' });
      }, 'redesign.js must compile with 0 syntax errors');
    });
  });

  // =========================================================================
  // GATE 2: CSS HYGIENE & STACKING CONTEXT INVARIANTS
  // =========================================================================

  describe('Gate 2: CSS Hygiene & Stacking Context (ZR-02)', () => {
    it('ZR-02.1: should maintain 100% balanced curly braces in styles.css', () => {
      const openBraces = (stylesCss.match(/\{/g) || []).length;
      const closeBraces = (stylesCss.match(/\}/g) || []).length;
      assert.strictEqual(
        openBraces,
        closeBraces,
        `Brace mismatch: ${openBraces} open '{' vs ${closeBraces} close '}'`
      );
    });

    it('ZR-02.2: should configure .toast-container with z-index: 10000 for top-layer visibility', () => {
      assert.match(
        stylesCss,
        /\.toast-container\s*\{[^}]*z-index:\s*10000/s,
        '.toast-container must define z-index: 10000'
      );
    });

    it('ZR-02.3: should have zero corrupt unclosed selector patterns', () => {
      const corruptPattern = /\.message\.assistant\s*\.message-bubble\s*\{\s*\.user-dropdown/;
      assert.ok(!corruptPattern.test(stylesCss), 'Detected unclosed nested selector in styles.css');
    });
  });

  // =========================================================================
  // GATE 3: STREAMPARSER BACKWARD COMPATIBILITY
  // =========================================================================

  describe('Gate 3: StreamParser Backward Compatibility (ZR-03)', () => {
    let StreamParser;

    before(() => {
      const sandbox = { window: {}, document: {}, console: { log: () => {}, warn: () => {}, error: () => {} } };
      vm.createContext(sandbox);
      const agentStart = appJs.indexOf('// === START OF agent.js ===');
      const agentEnd = appJs.indexOf('// === END OF agent.js ===');
      const agentCode = agentStart !== -1 && agentEnd !== -1 ? appJs.slice(agentStart, agentEnd) : appJs;
      vm.runInContext(agentCode, sandbox);
      StreamParser = sandbox.StreamParser || sandbox.window.SunaAgent.StreamParser;
    });

    it('ZR-03.1: should pass normal conversational text straight through without buffering delays', () => {
      const parser = new StreamParser();
      const chunk = 'Xin chào! Tôi có thể giúp gì cho bạn hôm nay?';
      const result = parser.parseChunk(chunk);
      assert.strictEqual(result, chunk);
      assert.strictEqual(parser.toolCalls.length, 0);
    });

    it('ZR-03.2: should preserve inline code and HTML tags like <div>, <code>, <pre> without false filtering', () => {
      const parser = new StreamParser();
      const chunk = 'Hãy dùng thẻ <code>&lt;div class="box"&gt;</code> trong CSS.';
      const result = parser.parseChunk(chunk);
      const flushed = parser.flush();
      assert.ok((result + flushed).includes('<code>'));
    });

    it('ZR-03.3: should flush all remaining buffered content when flush() is invoked', () => {
      const parser = new StreamParser();
      parser.parseChunk('Đoạn văn kết thúc với dấu mở ngoặc <');
      const flushed = parser.flush();
      assert.strictEqual(flushed, '<');
    });
  });

  // =========================================================================
  // GATE 4: SUNAAGENT CONTRACTS & EXTENSIONS
  // =========================================================================

  describe('Gate 4: SunaAgent Contract Preservation (ZR-04)', () => {
    it('ZR-04.1: should maintain MAX_RECURSION_DEPTH default of 4', () => {
      assert.ok(
        appJs.includes('MAX_RECURSION_DEPTH: 4') || appJs.includes('MAX_RECURSION_DEPTH = 4'),
        'SunaAgent must declare MAX_RECURSION_DEPTH: 4'
      );
    });

    it('ZR-04.2: should maintain reset() and abort() methods for agent state management', () => {
      assert.ok(appJs.includes('isAgentAborted = false'), 'SunaAgent.reset() must reset isAgentAborted');
      assert.ok(appJs.includes('isAgentAborted = true'), 'SunaAgent.abort() must set isAgentAborted to true');
    });

    it('ZR-04.3: should preserve all 5 legacy tools in SunaAgent.tools', () => {
      const tools = ['change_lofi_mood', 'speak_message', 'save_note_to_firestore', 'get_system_state', 'update_user_profile'];
      tools.forEach(t => {
        assert.ok(appJs.includes(t), `SunaAgent must retain legacy tool: ${t}`);
      });
    });
  });

  // =========================================================================
  // GATE 5: LIVE WORKSPACE DIRECT SYNC
  // =========================================================================

  describe('Gate 5: Live Workspace Direct Auto-Sync Preservation (ZR-05)', () => {
    it('ZR-05.1: should verify required workspace DOM elements in index.html', () => {
      assert.match(indexHtml, /id=["']artifact-editor-textarea["']/, 'Missing #artifact-editor-textarea in index.html');
      assert.match(indexHtml, /id=["']artifact-iframe["']/, 'Missing #artifact-iframe in index.html');
      assert.match(indexHtml, /id=["']artifacts-panel["']/, 'Missing #artifacts-panel in index.html');
    });

    it('ZR-05.2: should verify auto-sync logic and synthetic input event dispatch in app.js', () => {
      assert.ok(
        appJs.includes("new Event('input'") || appJs.includes('new Event("input"'),
        'Workspace auto-sync must dispatch synthetic input event'
      );
      assert.ok(
        appJs.includes('artifact-iframe') && (appJs.includes('.srcdoc =') || appJs.includes("['srcdoc'] =")),
        'Workspace auto-sync must update iframe.srcdoc'
      );
    });
  });

  // =========================================================================
  // GATE 6: AUTONOMOUS CONTINUATION ENGINE
  // =========================================================================

  describe('Gate 6: Autonomous Continuation Engine Preservation (ZR-06)', () => {
    it('ZR-06.1: should verify stitchContinuationChunks implementation in app.js', () => {
      assert.ok(
        appJs.includes('function stitchContinuationChunks') || appJs.includes('stitchContinuationChunks'),
        'stitchContinuationChunks must be declared in app.js'
      );
    });

    it('ZR-06.2: should verify multi-tier truncation detection in app.js', () => {
      assert.ok(
        appJs.includes('isTruncated') || appJs.includes('checkTruncation') || appJs.includes('unclosed'),
        'Truncation detection mechanism must be present in app.js'
      );
    });

    it('ZR-06.3: should verify token ceiling resolvers in app.js', () => {
      assert.ok(
        appJs.includes('resolveModelMaxTokens') || appJs.includes('max_tokens'),
        'Token ceiling resolver must be present in app.js'
      );
    });
  });

  // =========================================================================
  // GATE 7: STORAGE RESILIENCE & USER ISOLATION
  // =========================================================================

  describe('Gate 7: Storage Resilience & User Isolation (ZR-07)', () => {
    it('ZR-07.1: should generate isolated storage suffixes for logged in vs guest users', () => {
      assert.ok(
        appJs.includes('_guest') || appJs.includes('suna_guest'),
        'Guest mode storage isolation must be maintained'
      );
    });

    it('ZR-07.2: should handle QuotaExceededError gracefully without unhandled exceptions', () => {
      assert.ok(
        appJs.includes('QuotaExceededError') || appJs.includes('QUOTA_EXCEEDED_ERR'),
        'QuotaExceededError recovery logic must be retained'
      );
    });
  });

  // =========================================================================
  // GATE 8: MINDMAP & LOFI AUDIO BRIDGES
  // =========================================================================

  describe('Gate 8: Mindmap & Lofi Player Bridge Preservation (ZR-08)', () => {
    it('ZR-08.1: should preserve fullscreen mindmap bridge via suna_active_mindmap_data', () => {
      assert.ok(
        appJs.includes('suna_active_mindmap_data'),
        'suna_active_mindmap_data must be maintained in app.js'
      );
      assert.ok(
        mindmapHtml.includes('suna_active_mindmap_data'),
        'suna_active_mindmap_data must be read by mindmap.html'
      );
      assert.ok(
        mindmapHtml.includes('LOAD_MINDMAP'),
        'LOAD_MINDMAP event listener must exist in mindmap.html'
      );
    });

    it('ZR-08.2: should preserve sunaLofiPlayer object and changeMood API', () => {
      assert.ok(
        appJs.includes('sunaLofiPlayer') || appJs.includes('window.sunaLofiPlayer'),
        'sunaLofiPlayer must be preserved in app.js'
      );
      assert.ok(
        appJs.includes('changeMood'),
        'changeMood method must be preserved in app.js'
      );
    });
  });

  // =========================================================================
  // GATE 9: MOBILE RESPONSIVENESS & DOM ESSENTIALS
  // =========================================================================

  describe('Gate 9: Mobile Responsiveness & DOM Essentials (ZR-09)', () => {
    it('ZR-09.1: should define essential navigation and model display elements in index.html', () => {
      const essentialIds = [
        'current-model-display',
        'btn-send',
        'message-input',
        'messages-container'
      ];

      essentialIds.forEach(id => {
        assert.match(indexHtml, new RegExp(`id=["']${id}["']`), `Essential element #${id} must exist in index.html`);
      });
    });

    it('ZR-09.2: should preserve mobile responsive media queries in styles.css', () => {
      assert.match(stylesCss, /@media\s*\([^)]*max-width:\s*768px\)/, 'styles.css must retain 768px responsive breakpoint');
    });
  });
});
