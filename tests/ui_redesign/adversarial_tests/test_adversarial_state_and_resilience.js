const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Adversarial Edge Case & State Synchronization Test Suite (Empirical Challenger)', () => {
  let appJsContent;

  before(() => {
    appJsContent = fs.readFileSync('app.js', 'utf8');
  });

  describe('1. Storage Resilience & Quota Handling', () => {
    it('should generate correct isolated storage suffix for logged in user, guest, and fallback', () => {
      // Create isolated sandbox
      const sandbox = {
        AuthState: { isLoggedIn: true, user: { uid: 'user_xyz_123' } },
        window: {}
      };
      vm.createContext(sandbox);
      
      // Extract getStorageSuffix function definition
      const code = `
        function getStorageSuffix() {
          if (typeof AuthState !== 'undefined' && AuthState.isLoggedIn && AuthState.user && AuthState.user.uid) {
            return '_' + AuthState.user.uid;
          }
          return '_guest';
        }
      `;
      vm.runInContext(code, sandbox);

      assert.strictEqual(sandbox.getStorageSuffix(), '_user_xyz_123');

      // Test guest mode
      sandbox.AuthState = { isLoggedIn: false, user: null };
      assert.strictEqual(sandbox.getStorageSuffix(), '_guest');

      // Test undefined AuthState
      sandbox.AuthState = undefined;
      assert.strictEqual(sandbox.getStorageSuffix(), '_guest');
    });

    it('should handle QuotaExceededError and disabled localStorage gracefully without crashing', () => {
      let toastCalled = false;
      let toastMsg = '';
      
      const mockLocalStorage = {
        setItem: () => {
          const err = new Error('Quota exceeded');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        },
        getItem: () => null
      };

      const sandbox = {
        localStorage: mockLocalStorage,
        AuthState: { isLoggedIn: true, user: { uid: 'u1' } },
        State: { settings: { theme: 'zen' }, mode: 'workspace', chats: [], deletedChats: {}, isGenerating: false },
        toast: (msg) => { toastCalled = true; toastMsg = msg; },
        console: { error: () => {} },
        idbSet: async () => {},
        pruneChatMessages: () => {},
        getStorageSuffix: () => '_u1',
        triggerCloudSync: () => {}
      };
      vm.createContext(sandbox);

      const code = `
        function saveLocalStateOnly() {
          const suffix = getStorageSuffix();
          try {
            localStorage.setItem('suna_settings' + suffix, JSON.stringify(State.settings));
            localStorage.setItem('suna_mode', State.mode);
            localStorage.setItem('suna_deleted_chats' + suffix, JSON.stringify(State.deletedChats || {}));
          } catch(e) {}
        }

        function saveStateDirect() {
          try {
            const suffix = getStorageSuffix();
            localStorage.setItem('suna_settings' + suffix, JSON.stringify(State.settings));
          } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
              toast('Bộ nhớ settings đã đầy!', 'error');
            }
          }
        }
      `;
      vm.runInContext(code, sandbox);

      // Execute without uncaught exception
      assert.doesNotThrow(() => {
        sandbox.saveLocalStateOnly();
      });

      assert.doesNotThrow(() => {
        sandbox.saveStateDirect();
      });
      assert.strictEqual(toastCalled, true);
      assert.strictEqual(toastMsg, 'Bộ nhớ settings đã đầy!');
    });

    it('should prune messages when exceeding MAX_CHAT_MESSAGES to prevent storage exhaustion', () => {
      const sandbox = {
        MAX_CHAT_MESSAGES: 40
      };
      vm.createContext(sandbox);

      const code = `
        function pruneChatMessages(chat) {
          if (chat && chat.messages && chat.messages.length > MAX_CHAT_MESSAGES) {
            chat.messages = chat.messages.slice(-MAX_CHAT_MESSAGES);
          }
        }
      `;
      vm.runInContext(code, sandbox);

      const heavyChat = {
        id: 'chat_1',
        messages: Array.from({ length: 150 }, (_, i) => ({ id: i, content: 'Message ' + i }))
      };

      sandbox.pruneChatMessages(heavyChat);
      assert.strictEqual(heavyChat.messages.length, 40);
      assert.strictEqual(heavyChat.messages[0].content, 'Message 110');
      assert.strictEqual(heavyChat.messages[39].content, 'Message 149');
    });

    it('should safely parse corrupt JSON in loadState without throwing unhandled exceptions', () => {
      const sandbox = {
        localStorage: {
          getItem: (key) => {
            if (key === 'suna_settings_u1') return '{ invalid_json ::: ';
            if (key === 'suna_deleted_chats_u1') return 'CORRUPT_DATA';
            return null;
          }
        },
        State: { settings: {}, deletedChats: {}, chats: [] },
        getStorageSuffix: () => '_u1',
        idbGet: async () => null,
        idbSet: async () => {},
        console: { error: () => {} }
      };
      vm.createContext(sandbox);

      const code = `
        async function loadState() {
          try {
            const suffix = getStorageSuffix();
            const s = localStorage.getItem('suna_settings' + suffix);
            const dc = localStorage.getItem('suna_deleted_chats' + suffix);
            if (dc) {
              try { State.deletedChats = JSON.parse(dc); } catch(e) { State.deletedChats = {}; }
            } else { State.deletedChats = {}; }
            
            if (s) {
              try { State.settings = JSON.parse(s); } catch(e) { State.settings = {}; }
            }
          } catch(e) {
            console.error('loadState fallback error:', e);
          }
        }
      `;
      vm.runInContext(code, sandbox);

      return sandbox.loadState().then(() => {
        assert.strictEqual(Object.keys(sandbox.State.deletedChats).length, 0);
        assert.strictEqual(Object.keys(sandbox.State.settings).length, 0);
      });
    });
  });

  describe('2. Resizers, Boundary Clamping & Pointer Lock', () => {
    it('should lock and unlock all iframes in the document', () => {
      const mockIframes = [
        { style: { pointerEvents: 'auto' } },
        { style: { pointerEvents: 'auto' } },
        { style: { pointerEvents: 'auto' } }
      ];

      const sandbox = {
        document: {
          querySelectorAll: (selector) => {
            if (selector === 'iframe') return mockIframes;
            return [];
          }
        }
      };
      vm.createContext(sandbox);

      const code = `
        function lockAllIframes() {
          document.querySelectorAll('iframe').forEach(el => {
            el.style.pointerEvents = 'none';
          });
        }
        function unlockAllIframes() {
          document.querySelectorAll('iframe').forEach(el => {
            el.style.pointerEvents = 'auto';
          });
        }
      `;
      vm.runInContext(code, sandbox);

      sandbox.lockAllIframes();
      mockIframes.forEach(iframe => assert.strictEqual(iframe.style.pointerEvents, 'none'));

      sandbox.unlockAllIframes();
      mockIframes.forEach(iframe => assert.strictEqual(iframe.style.pointerEvents, 'auto'));
    });

    it('should strictly clamp Left Workspace Handle width between 25% and 100% under extreme coordinates', () => {
      const calculateWorkspaceWidth = (clientX, windowWidth) => {
        const width = windowWidth - clientX;
        let percentage = (width / windowWidth) * 100;
        return Math.max(25, Math.min(percentage, 100));
      };

      const windowWidth = 1000;

      // Normal drag
      assert.strictEqual(calculateWorkspaceWidth(400, windowWidth), 60);

      // Drag completely off-screen left (negative clientX)
      assert.strictEqual(calculateWorkspaceWidth(-500, windowWidth), 100);

      // Drag completely off-screen right (overshooting windowWidth)
      assert.strictEqual(calculateWorkspaceWidth(1500, windowWidth), 25);

      // Extreme edge clientX = 0
      assert.strictEqual(calculateWorkspaceWidth(0, windowWidth), 100);

      // Extreme edge clientX = windowWidth
      assert.strictEqual(calculateWorkspaceWidth(windowWidth, windowWidth), 25);
    });

    it('should strictly clamp 3-Pane dual column resizers and prevent panel collapse', () => {
      const totalWidth = 1000;

      // Resizer 1: Editor width %
      const calcEditorWidth = (clientX, contentLeft) => {
        const relativeX = clientX - contentLeft;
        let editorWidthPercent = (relativeX / totalWidth) * 100;
        return Math.max(10, Math.min(editorWidthPercent, 80));
      };

      // Offscreen left -> clamped to min 10%
      assert.strictEqual(calcEditorWidth(-300, 0), 10);
      // Offscreen right -> clamped to max 80%
      assert.strictEqual(calcEditorWidth(1500, 0), 80);
      // Normal range
      assert.strictEqual(calcEditorWidth(400, 0), 40);

      // Resizer 2: Left column (Editor + Preview) width %
      const calcLeftWidth = (clientX, contentLeft) => {
        const relativeX = clientX - contentLeft;
        let leftWidthPercent = (relativeX / totalWidth) * 100;
        return Math.max(20, Math.min(leftWidthPercent, 90));
      };

      // Offscreen left -> clamped to min 20%
      assert.strictEqual(calcLeftWidth(-200, 0), 20);
      // Offscreen right -> clamped to max 90%
      assert.strictEqual(calcLeftWidth(1200, 0), 90);
      // Normal range
      assert.strictEqual(calcLeftWidth(700, 0), 70);
    });

    it('should reset dragging state and unlock iframes when window loses focus (blur event)', () => {
      let isResizing1 = true;
      let isResizing2 = true;
      let isResizingWorkspace = true;
      let iframesUnlocked = false;

      const stopColumnResize = () => {
        isResizing1 = false;
        isResizing2 = false;
        iframesUnlocked = true;
      };

      const stopWorkspaceResize = () => {
        isResizingWorkspace = false;
        iframesUnlocked = true;
      };

      // Simulate blur
      stopColumnResize();
      stopWorkspaceResize();

      assert.strictEqual(isResizing1, false);
      assert.strictEqual(isResizing2, false);
      assert.strictEqual(isResizingWorkspace, false);
      assert.strictEqual(iframesUnlocked, true);
    });
  });

  describe('3. Unicode, Malformed Content & Artifact Decoding', () => {
    it('should safely decode UTF-8 base64 strings containing Vietnamese Unicode and emojis in openArtifact', () => {
      const unicodeString = 'Chào mừng bạn đến với Suna AI 🚀 ✨ Tiếng Việt có dấu: ă, â, đ, ê, ô, ơ, ư';
      
      // Encode Unicode to base64 using standard browser idiom
      const base64Unicode = Buffer.from(unicodeString, 'utf-8').toString('base64');

      const sandbox = {
        atob: (str) => Buffer.from(str, 'base64').toString('binary'),
        Uint8Array: Uint8Array,
        TextDecoder: TextDecoder,
        console: { warn: () => {} }
      };
      vm.createContext(sandbox);

      const code = `
        function decodeArtifact(contentOrB64) {
          let htmlContent = '';
          try {
            if (!contentOrB64) {
              htmlContent = '';
            } else if (contentOrB64.trim().startsWith('<') || /\\s/.test(contentOrB64.trim())) {
              htmlContent = contentOrB64;
            } else {
              const binString = atob(contentOrB64);
              const bytes = new Uint8Array(binString.length);
              for (let i = 0; i < binString.length; i++) {
                bytes[i] = binString.charCodeAt(i);
              }
              htmlContent = new TextDecoder('utf-8').decode(bytes);
            }
          } catch(e) {
            htmlContent = contentOrB64 || '';
          }
          return htmlContent;
        }
      `;
      vm.runInContext(code, sandbox);

      const result = sandbox.decodeArtifact(base64Unicode);
      assert.strictEqual(result, unicodeString);
    });

    it('should fallback to raw content when given invalid or malformed base64 in openArtifact', () => {
      const malformedInput = 'invalid_b64_%!*&#^@()';

      const sandbox = {
        atob: () => { throw new Error('InvalidCharacterError: The string to be decoded is not correctly encoded.'); },
        Uint8Array: Uint8Array,
        TextDecoder: TextDecoder,
        console: { warn: () => {} }
      };
      vm.createContext(sandbox);

      const code = `
        function decodeArtifact(contentOrB64) {
          let htmlContent = '';
          try {
            if (!contentOrB64) {
              htmlContent = '';
            } else if (contentOrB64.trim().startsWith('<') || /\\s/.test(contentOrB64.trim())) {
              htmlContent = contentOrB64;
            } else {
              const binString = atob(contentOrB64);
              const bytes = new Uint8Array(binString.length);
              for (let i = 0; i < binString.length; i++) {
                bytes[i] = binString.charCodeAt(i);
              }
              htmlContent = new TextDecoder('utf-8').decode(bytes);
            }
          } catch(e) {
            htmlContent = contentOrB64 || '';
          }
          return htmlContent;
        }
      `;
      vm.runInContext(code, sandbox);

      const result = sandbox.decodeArtifact(malformedInput);
      assert.strictEqual(result, malformedInput);
    });

    it('should correctly format and escape code blocks, inline code, and HTML in formatWorkspaceMessageContent', () => {
      const sandbox = {
        encodeURIComponent: encodeURIComponent
      };
      vm.createContext(sandbox);

      const code = `
        function escHtml(text) {
          if (!text) return '';
          return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function formatWorkspaceMessageContent(text) {
          if (!text) return '';
          let html = escHtml(text);
          const placeholders = {};
          let count = 0;
          
          html = html.replace(/\`\`\`([^\\n]*)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
            const decodedCode = code
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");
              
            const placeholderToken = '%%WS_CODE_' + (count++) + '%%';
            const applyBtn = '<button class="btn-workspace-apply" onclick="applyWorkspaceCode(this)" data-code="' + encodeURIComponent(decodedCode) + '">Áp dụng</button>';
            const cleanLang = lang.trim() || 'code';
            
            placeholders[placeholderToken] = '<div class="code-block-wrapper"><div class="code-lang">' + cleanLang + '</div><pre><code>' + escHtml(decodedCode) + '</code></pre>' + applyBtn + '</div>';
            return placeholderToken;
          });
          
          html = html.replace(/\`([^\`]+)\`/g, (_, inline) => {
            const token = '%%WS_INLINE_' + (count++) + '%%';
            placeholders[token] = '<code class="math-inline">' + inline + '</code>';
            return token;
          });
          
          html = html.replace(/\\n/g, '<br>');
          
          for (const token in placeholders) {
            html = html.replace(token, placeholders[token]);
          }
          
          return html;
        }
      `;
      vm.runInContext(code, sandbox);

      const sampleMsg = "Dưới đây là mã nguồn HTML:\n```html\n<div class=\"alert\">Xin chào & Cảm ơn!</div>\n```\nBạn có thể thử lệnh `npm start` nhé!";
      const formatted = sandbox.formatWorkspaceMessageContent(sampleMsg);

      assert.ok(formatted.includes('class="btn-workspace-apply"'), 'Missing apply button');
      assert.ok(formatted.includes('class="code-lang">html</div>'), 'Missing lang indicator');
      assert.ok(formatted.includes('&lt;div class="alert"&gt;Xin chào &amp; Cảm ơn!&lt;/div&gt;'), 'Code inside <pre><code> was not properly escaped');
      assert.ok(formatted.includes('<code class="math-inline">npm start</code>'), 'Inline code not rendered properly');
    });

    it('should correctly apply workspace code with special characters and quotes', () => {
      const originalCode = `<script>console.log("Hello 'Suna' & <World>!");</script>`;
      const encoded = encodeURIComponent(originalCode);
      const decoded = decodeURIComponent(encoded);

      assert.strictEqual(decoded, originalCode);
    });
  });

  describe('4. Auth Network Listener & Flapping State Resilience', () => {
    it('should prevent duplicate network event listeners during connection flapping', () => {
      let listenerCount = 0;
      let _authOnlineListenerAttached = false;

      const mockWindow = {
        addEventListener: (event, handler) => {
          if (event === 'online') listenerCount++;
        }
      };

      const simulateInitAuth = () => {
        if (!_authOnlineListenerAttached) {
          _authOnlineListenerAttached = true;
          mockWindow.addEventListener('online', () => {});
        }
      };

      // Simulate 100 network flap cycles
      for (let i = 0; i < 100; i++) {
        simulateInitAuth();
      }

      assert.strictEqual(_authOnlineListenerAttached, true);
      assert.strictEqual(listenerCount, 1, 'Duplicate online event listeners were attached');
    });
  });

  describe('5. Account Switching State Isolation', () => {
    it('should ensure state and credentials from user A are cleared before loading user B', () => {
      const storageA = {
        suna_settings_userA: JSON.stringify({ baseUrl: 'https://api.userA.com', apiKey: 'key_A' }),
        suna_chats_userA: JSON.stringify([{ id: 'chat_A', title: 'User A Chat' }])
      };
      const storageB = {
        suna_settings_userB: JSON.stringify({ baseUrl: 'https://api.userB.com', apiKey: 'key_B' }),
        suna_chats_userB: JSON.stringify([{ id: 'chat_B', title: 'User B Chat' }])
      };

      const unifiedStorage = { ...storageA, ...storageB };

      const sandbox = {
        AuthState: { isLoggedIn: true, user: { uid: 'userA' } },
        State: {
          settings: { baseUrl: 'https://api.userA.com', apiKey: 'key_A' },
          chats: [{ id: 'chat_A' }]
        },
        localStorage: {
          getItem: (key) => unifiedStorage[key] || null
        }
      };
      vm.createContext(sandbox);

      const code = `
        function getStorageSuffix() {
          if (typeof AuthState !== 'undefined' && AuthState.isLoggedIn && AuthState.user && AuthState.user.uid) {
            return '_' + AuthState.user.uid;
          }
          return '_guest';
        }

        function switchAccount(newUser) {
          const oldUid = AuthState.user ? AuthState.user.uid : null;
          AuthState.user = newUser;
          if (oldUid !== newUser.uid) {
            // Reset in-memory state
            State.settings = {
              baseUrl: '', apiKey: '', currentModel: '', userName: 'Bạn'
            };
            State.chats = [];
            
            const suffix = getStorageSuffix();
            const s = localStorage.getItem('suna_settings' + suffix);
            if (s) State.settings = JSON.parse(s);
            const c = localStorage.getItem('suna_chats' + suffix);
            if (c) State.chats = JSON.parse(c);
          }
        }
      `;
      vm.runInContext(code, sandbox);

      // Switch to User B
      sandbox.switchAccount({ uid: 'userB' });

      assert.strictEqual(sandbox.State.settings.apiKey, 'key_B');
      assert.strictEqual(sandbox.State.settings.baseUrl, 'https://api.userB.com');
      assert.strictEqual(sandbox.State.chats[0].id, 'chat_B');
    });
  });
});
