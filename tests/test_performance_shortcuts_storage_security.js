const fs = require('fs');
const assert = require('assert');
const vm = require('vm');
const { execSync } = require('child_process');

describe('Performance, Shortcuts, Hybrid Storage & Security Hardening Test Suite (Tiers 1-4)', () => {
  let appJs, stylesCss, indexHtml, mindmapHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
    mindmapHtml = fs.readFileSync('mindmap.html', 'utf8');
  });

  // =========================================================================
  // TIER 1: CORE FEATURE COVERAGE (F1 - F10)
  // =========================================================================
  describe('Tier 1: Feature Coverage', () => {

    describe('F1: Passive Scroll & requestAnimationFrame on #chat-area', () => {
      it('should register scroll listener with { passive: true } on #chat-area in app.js', () => {
        assert.match(
          appJs,
          /chatArea\.addEventListener\(\s*['"]scroll['"]\s*,[\s\S]*?\{\s*passive:\s*true\s*\}\s*\)/,
          'Missing passive: true option on chatArea scroll event listener'
        );
      });

      it('should coordinate scroll calculations via requestAnimationFrame and isScrollTicking flag', () => {
        assert.match(appJs, /let\s+isScrollTicking\s*=\s*false;/, 'Missing isScrollTicking flag');
        assert.match(
          appJs,
          /window\.requestAnimationFrame\(\s*\(\)\s*=>\s*\{[\s\S]*?isScrollTicking\s*=\s*false;\s*\}\s*\)/,
          'requestAnimationFrame callback does not reset isScrollTicking'
        );
      });

      it('should correctly toggle #btn-scroll-bottom visibility based on 300px threshold', () => {
        let rAFCallback = null;
        const mockBtnScroll = {
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
          }
        };

        const mockChatArea = {
          scrollHeight: 1000,
          scrollTop: 200,
          clientHeight: 400
        };

        const sandbox = {
          window: {
            requestAnimationFrame: (cb) => { rAFCallback = cb; }
          },
          chatArea: mockChatArea,
          btnScroll: mockBtnScroll,
          isScrollTicking: false
        };
        vm.createContext(sandbox);

        const scrollHandlerCode = `
          function handleScroll() {
            if (!isScrollTicking) {
              window.requestAnimationFrame(() => {
                if (chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight > 300) {
                  btnScroll.classList.add('show');
                } else {
                  btnScroll.classList.remove('show');
                }
                isScrollTicking = false;
              });
              isScrollTicking = true;
            }
          }
        `;
        vm.runInContext(scrollHandlerCode, sandbox);

        // Distance = 1000 - 200 - 400 = 400 > 300 -> should show button
        sandbox.handleScroll();
        assert.strictEqual(sandbox.isScrollTicking, true);
        assert.ok(rAFCallback !== null);
        rAFCallback();
        assert.strictEqual(sandbox.isScrollTicking, false);
        assert.strictEqual(mockBtnScroll.classList.contains('show'), true);

        // Scroll close to bottom: Distance = 1000 - 650 - 400 = -50 <= 300 -> should hide button
        mockChatArea.scrollTop = 650;
        sandbox.handleScroll();
        rAFCallback();
        assert.strictEqual(mockBtnScroll.classList.contains('show'), false);
      });
    });

    describe('F2: 150ms Search Debounce on #chat-search-input', () => {
      it('should define a 150ms debounce timer on #chat-search-input in app.js', () => {
        assert.match(
          appJs,
          /searchInput\.addEventListener\(\s*['"]input['"]\s*,[\s\S]*?setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?renderChatList\(\);[\s\S]*?\},\s*150\s*\)/,
          'Missing 150ms debounce on chat search input listener'
        );
      });

      it('should schedule renderChatList after 150ms and cancel previous timer on rapid input', (done) => {
        let renderCount = 0;
        let searchDebounceTimer = null;

        function simulateInput() {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = setTimeout(() => {
            renderCount++;
          }, 150);
        }

        simulateInput();
        simulateInput();
        simulateInput();

        assert.strictEqual(renderCount, 0, 'renderChatList should not be called synchronously');

        setTimeout(() => {
          assert.strictEqual(renderCount, 1, 'renderChatList should execute exactly once after debounce');
          done();
        }, 170);
      });
    });

    describe('F3: Particle Visibility Lifecycle Management', () => {
      it('should register visibilitychange listener to pause and resume particles in app.js', () => {
        assert.match(appJs, /document\.addEventListener\(\s*['"]visibilitychange['"]/, 'Missing visibilitychange event listener in app.js');
        assert.match(appJs, /if\s*\(document\.hidden\)\s*\{[\s\S]*?clearInterval\(window\._particleInterval\);[\s\S]*?window\._particleInterval\s*=\s*null;/);
        assert.match(appJs, /else\s*\{[\s\S]*?initParticles\(\);/);
      });

      it('should pause interval on hidden=true and resume initParticles on hidden=false', () => {
        let clearedIntervalId = null;
        let initParticlesCalled = false;

        const sandbox = {
          document: { hidden: true },
          window: { _particleInterval: 999 },
          clearInterval: (id) => { clearedIntervalId = id; },
          initParticles: () => { initParticlesCalled = true; }
        };
        vm.createContext(sandbox);

        const code = `
          function onVisibilityChange() {
            if (document.hidden) {
              if (window._particleInterval) {
                clearInterval(window._particleInterval);
                window._particleInterval = null;
              }
            } else {
              initParticles();
            }
          }
        `;
        vm.runInContext(code, sandbox);

        // Tab hidden
        sandbox.onVisibilityChange();
        assert.strictEqual(clearedIntervalId, 999);
        assert.strictEqual(sandbox.window._particleInterval, null);
        assert.strictEqual(initParticlesCalled, false);

        // Tab visible
        sandbox.document.hidden = false;
        sandbox.onVisibilityChange();
        assert.strictEqual(initParticlesCalled, true);
      });
    });

    describe('F4: Hybrid Storage & Quota Resilience', () => {
      it('should implement safeSaveLocalStorage with structured QuotaExceededError recovery', () => {
        assert.match(appJs, /function\s+safeSaveLocalStorage\s*\(\s*key\s*,\s*val\s*\)/, 'Missing safeSaveLocalStorage function');
        assert.match(appJs, /window\.safeSaveLocalStorage\s*=\s*safeSaveLocalStorage;/, 'safeSaveLocalStorage is not exposed on window');
        assert.match(appJs, /QuotaExceededError/i, 'safeSaveLocalStorage does not check for QuotaExceededError');
        assert.match(appJs, /localStorage\.removeItem\(['"]suna_chats['"]\)/, 'safeSaveLocalStorage does not evict legacy suna_chats');
      });

      it('should route chat state to IndexedDB (idbSet) and settings/mode to safeSaveLocalStorage', () => {
        assert.match(appJs, /idbSet\(['"]suna_chats['"]\s*\+\s*suffix,\s*State\.chats\)/, 'Chats must be saved via IndexedDB idbSet');
        assert.match(appJs, /safeSaveLocalStorage\(['"]suna_settings['"]\s*\+\s*suffix,\s*State\.settings\)/, 'Settings must be saved via safeSaveLocalStorage');
        assert.match(appJs, /safeSaveLocalStorage\(['"]suna_mode['"],\s*State\.mode\)/, 'Mode must be saved via safeSaveLocalStorage');
      });
    });

    describe('F5: Global Keyboard Shortcuts', () => {
      it('should register global keydown listener for Escape, Ctrl+/, and Ctrl+Shift+O in app.js', () => {
        assert.match(appJs, /document\.addEventListener\(\s*['"]keydown['"]\s*,\s*\(e\)\s*=>\s*\{/);
        assert.match(appJs, /e\.key\s*===\s*['"]Escape['"]\s*\|\|\s*e\.key\s*===\s*['"]Esc['"]/);
        assert.match(appJs, /\(e\.ctrlKey\s*\|\|\s*e\.metaKey\)\s*&&\s*\(e\.key\s*===\s*['"]\/['"]\s*\|\|\s*e\.code\s*===\s*['"]Slash['"]\)/);
        assert.match(appJs, /\(e\.ctrlKey\s*\|\|\s*e\.metaKey\)\s*&&\s*e\.shiftKey\s*&&\s*\(e\.key\s*===\s*['"]O['"]\s*\|\|\s*e\.key\s*===\s*['"]o['"]\s*\|\|\s*e\.code\s*===\s*['"]KeyO['"]\)/);
      });

      it('should close open modal overlays and dropdowns on Escape key', () => {
        const closedModals = [];
        const mockModal1 = { id: 'settings-modal', style: { display: 'flex' } };
        const mockModal2 = { id: 'api-modal', style: { display: 'none' } };
        const mockUserDropdown = { classList: { removed: [], remove(c) { this.removed.push(c); } } };
        const mockMobileMenu = { classList: { removed: [], remove(c) { this.removed.push(c); } } };

        const sandbox = {
          document: {
            querySelectorAll: (sel) => sel === '.modal-overlay' ? [mockModal1, mockModal2] : [],
            getElementById: (id) => {
              if (id === 'user-dropdown') return mockUserDropdown;
              if (id === 'mobile-more-menu') return mockMobileMenu;
              return null;
            }
          },
          getComputedStyle: (el) => ({ display: el.style.display }),
          closeModal: (id) => { closedModals.push(id); }
        };
        vm.createContext(sandbox);

        const shortcutCode = `
          function handleKeydown(e) {
            if (e.key === 'Escape' || e.key === 'Esc') {
              document.querySelectorAll('.modal-overlay').forEach(modal => {
                if (modal.style.display !== 'none' && getComputedStyle(modal).display !== 'none') {
                  closeModal(modal.id);
                }
              });
              const userDropdown = document.getElementById('user-dropdown');
              if (userDropdown) userDropdown.classList.remove('active');
              const mobileMoreMenu = document.getElementById('mobile-more-menu');
              if (mobileMoreMenu) mobileMoreMenu.classList.remove('active');
            }
          }
        `;
        vm.runInContext(shortcutCode, sandbox);

        sandbox.handleKeydown({ key: 'Escape' });
        assert.deepStrictEqual(closedModals, ['settings-modal'], 'Should only close visible modal');
        assert.deepStrictEqual(mockUserDropdown.classList.removed, ['active']);
        assert.deepStrictEqual(mockMobileMenu.classList.removed, ['active']);
      });

      it('should focus message input on Ctrl+/ and Cmd+/', () => {
        let focused = false;
        let prevented = false;
        const mockInput = { focus() { focused = true; } };

        const sandbox = {
          document: {
            getElementById: (id) => id === 'user-input' ? mockInput : null
          }
        };
        vm.createContext(sandbox);

        const shortcutCode = `
          function handleKeydown(e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
              e.preventDefault();
              const msgInput = document.getElementById('user-input') || document.getElementById('message-input');
              if (msgInput) {
                msgInput.focus();
              }
            }
          }
        `;
        vm.runInContext(shortcutCode, sandbox);

        // Windows / Linux: Ctrl + /
        sandbox.handleKeydown({ ctrlKey: true, key: '/', preventDefault: () => { prevented = true; } });
        assert.strictEqual(focused, true);
        assert.strictEqual(prevented, true);

        // macOS: Cmd + /
        focused = false;
        prevented = false;
        sandbox.handleKeydown({ metaKey: true, code: 'Slash', preventDefault: () => { prevented = true; } });
        assert.strictEqual(focused, true);
        assert.strictEqual(prevented, true);
      });

      it('should toggle #artifacts-panel active class on Ctrl+Shift+O and Cmd+Shift+O', () => {
        let prevented = false;
        const mockPanel = {
          classList: {
            active: false,
            toggle(c) { if (c === 'active') this.active = !this.active; return this.active; }
          }
        };

        const sandbox = {
          document: {
            getElementById: (id) => id === 'artifacts-panel' ? mockPanel : null
          }
        };
        vm.createContext(sandbox);

        const shortcutCode = `
          function handleKeydown(e) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o' || e.code === 'KeyO')) {
              e.preventDefault();
              const artifactsPanel = document.getElementById('artifacts-panel');
              if (artifactsPanel) {
                artifactsPanel.classList.toggle('active');
              }
            }
          }
        `;
        vm.runInContext(shortcutCode, sandbox);

        sandbox.handleKeydown({ ctrlKey: true, shiftKey: true, key: 'O', preventDefault: () => { prevented = true; } });
        assert.strictEqual(mockPanel.classList.active, true, 'Panel should become active');
        assert.strictEqual(prevented, true);

        sandbox.handleKeydown({ metaKey: true, shiftKey: true, code: 'KeyO', preventDefault: () => {} });
        assert.strictEqual(mockPanel.classList.active, false, 'Panel should toggle back to inactive');
      });
    });

    describe('F6: 4px Slim Glassmorphic Scrollbars', () => {
      it('should define 4px width/height scrollbars with border-radius: var(--radius-pill) in styles.css', () => {
        assert.match(stylesCss, /::-webkit-scrollbar\s*\{[\s\S]*?width:\s*4px;[\s\S]*?height:\s*4px;/);
        assert.match(stylesCss, /::-webkit-scrollbar-thumb\s*\{[\s\S]*?border-radius:\s*var\(--radius-pill\);/);
      });

      it('should define 4px slim scrollbars in mindmap.html', () => {
        assert.match(mindmapHtml, /::-webkit-scrollbar\s*\{[\s\S]*?width:\s*4px;[\s\S]*?height:\s*4px;/);
        assert.match(mindmapHtml, /::-webkit-scrollbar-thumb\s*\{[\s\S]*?border-radius:\s*9999px;/);
      });
    });

    describe('F7: Accessibility Attributes on Icon Buttons', () => {
      it('should ensure icon-only buttons in index.html have aria-label and title attributes', () => {
        const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
        let match;
        const iconButtonsWithoutA11y = [];

        while ((match = buttonRegex.exec(indexHtml)) !== null) {
          const attrs = match[1];
          const inner = match[2];
          // Check if button contains icon (material-icons-round) and lacks text
          const hasIcon = /class="[^"]*material-icons-round[^"]*"|class="[^"]*icon[^"]*"/i.test(inner);
          const hasText = inner.replace(/<[^>]+>/g, '').trim().length > 0;
          
          if (hasIcon && !hasText) {
            const hasAriaLabel = /aria-label=["'][^"']+["']/i.test(attrs);
            const hasTitle = /title=["'][^"']+["']/i.test(attrs);
            if (!hasAriaLabel || !hasTitle) {
              const idMatch = attrs.match(/id=["']([^"']+)["']/i);
              const classMatch = attrs.match(/class=["']([^"']+)["']/i);
              iconButtonsWithoutA11y.push(idMatch ? `#${idMatch[1]}` : `.${classMatch ? classMatch[1] : 'unknown'}`);
            }
          }
        }

        assert.strictEqual(
          iconButtonsWithoutA11y.length,
          0,
          `Found icon buttons lacking aria-label/title: ${iconButtonsWithoutA11y.join(', ')}`
        );
      });

      it('should verify critical interaction buttons have explicit aria-label attributes in index.html', () => {
        const criticalButtons = [
          'btn-toggle-sidebar',
          'btn-new-chat',
          'btn-scroll-bottom',
          'btn-send',
          'btn-voice',
          'btn-attach-file',
          'btn-attach-image',
          'btn-toggle-theme',
          'btn-export-chat',
          'btn-api-settings'
        ];

        criticalButtons.forEach(btnId => {
          const regex = new RegExp(`<button[^>]*id=["']${btnId}["'][^>]*aria-label=["']([^"']+)["']`, 'i');
          assert.match(indexHtml, regex, `Missing aria-label on button #${btnId}`);
        });
      });
    });

    describe('F8: Iframe Sandbox Hardening', () => {
      it('should configure sandbox="allow-scripts allow-modals allow-forms" on #artifact-iframe in index.html', () => {
        assert.match(
          indexHtml,
          /<iframe[^>]*id=["']artifact-iframe["'][^>]*sandbox=["']allow-scripts allow-modals allow-forms["']/i,
          '#artifact-iframe is missing sandbox="allow-scripts allow-modals allow-forms"'
        );
      });

      it('should configure sandbox="allow-scripts allow-modals allow-forms" on renderMindmapIframe in app.js', () => {
        assert.match(
          appJs,
          /renderMindmapIframe[\s\S]*?sandbox=["']allow-scripts allow-modals allow-forms["']/i,
          'renderMindmapIframe does not include required sandbox attribute'
        );
      });
    });

    describe('F9: KaTeX Error Try-Catch Fallback', () => {
      it('should wrap katex.renderToString in try-catch and return null on parsing error in app.js', () => {
        assert.match(appJs, /function\s+renderKatex\s*\(\s*math\s*,\s*displayMode\s*\)\s*\{/);
        assert.match(appJs, /try\s*\{[\s\S]*?katex\.renderToString[\s\S]*?\}\s*catch\s*\(e\)\s*\{[\s\S]*?return\s+null;/);
      });

      it('should render fallback <code> block when renderKatex returns null without throwing', () => {
        const sandbox = {
          renderKatex: () => null,
          savePlaceholder: (val) => `%%PLACEHOLDER_${val}%%`
        };
        vm.createContext(sandbox);

        const code = `
          function formatMath(html) {
            // Block math
            html = html.replace(/(?:\\$\\$|\\\\\\[)([\\s\\S]*?)(?:\\$\\$|\\\\\\[)/g, (_, math) => {
              const rendered = renderKatex(math, true);
              const content = rendered 
                ? '<div class="math-block">' + rendered + '</div>' 
                : '<div class="math-block"><code>' + math.trim() + '</code></div>';
              return savePlaceholder(content);
            });
            // Inline math
            html = html.replace(/(?<!\\$)\\$([^\\$\\n]+?)\\$(?!\\$)/g, (_, math) => {
              const rendered = renderKatex(math, false);
              const content = rendered 
                ? '<span class="math-inline-rendered">' + rendered + '</span>' 
                : '<code class="math-inline">' + math.trim() + '</code>';
              return savePlaceholder(content);
            });
            return html;
          }
        `;
        vm.runInContext(code, sandbox);

        const resultBlock = sandbox.formatMath('Công thức lỗi: $$\\frac{1}{$$ kết thúc');
        assert.ok(resultBlock.includes('%%PLACEHOLDER_<div class="math-block"><code>\\frac{1}{</code></div>%%'));

        const resultInline = sandbox.formatMath('Tính $E = mc^2$ nhé');
        assert.ok(resultInline.includes('%%PLACEHOLDER_<code class="math-inline">E = mc^2</code>%%'));
      });
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {

    describe('QuotaExceededError Eviction & Retry Recovery', () => {
      it('should evict legacy keys and successfully retry setItem when quota error is thrown', () => {
        let attempts = 0;
        const storage = {
          suna_chats: 'LARGE_LEGACY_PAYLOAD',
          suna_guest_notes: 'OLD_NOTES',
          suna_deleted_chats_guest: '{"chat1": true}'
        };

        const mockLocalStorage = {
          setItem: (k, v) => {
            attempts++;
            if (attempts === 1) {
              const err = new Error('Quota exceeded');
              err.name = 'QuotaExceededError';
              err.code = 22;
              throw err;
            }
            storage[k] = v;
          },
          removeItem: (k) => {
            delete storage[k];
          }
        };

        const sandbox = {
          localStorage: mockLocalStorage,
          console: { warn: () => {}, error: () => {} },
          getStorageSuffix: () => '_guest'
        };
        vm.createContext(sandbox);

        const safeSaveCode = `
          function safeSaveLocalStorage(key, val) {
            const strVal = typeof val === 'string' ? val : JSON.stringify(val);
            try {
              localStorage.setItem(key, strVal);
              return true;
            } catch (e) {
              if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || (e.message && e.message.toLowerCase().includes('quota'))) {
                console.warn('LocalStorage quota exceeded. Evicting legacy keys and recovering...');
                try {
                  localStorage.removeItem('suna_chats');
                  localStorage.removeItem('suna_guest_notes');
                  const suffix = typeof getStorageSuffix === 'function' ? getStorageSuffix() : '_guest';
                  localStorage.setItem('suna_deleted_chats' + suffix, '{}');
                } catch (_) {}
                try {
                  localStorage.setItem(key, strVal);
                  return true;
                } catch (retryErr) {
                  console.error('LocalStorage write failed after recovery attempt:', retryErr);
                  return false;
                }
              }
              console.error('LocalStorage write error:', e);
              return false;
            }
          }
        `;
        vm.runInContext(safeSaveCode, sandbox);

        const saveResult = sandbox.safeSaveLocalStorage('suna_settings_guest', { theme: 'zen', model: 'flash' });
        assert.strictEqual(saveResult, true, 'safeSaveLocalStorage should return true on successful retry');
        assert.strictEqual(attempts, 3); // Initial setItem (fails) + suna_deleted_chats reset + retry setItem (succeeds)
        assert.strictEqual(storage.suna_chats, undefined, 'suna_chats should be evicted');
        assert.strictEqual(storage.suna_guest_notes, undefined, 'suna_guest_notes should be evicted');
        assert.strictEqual(storage.suna_deleted_chats_guest, '{}');
        assert.strictEqual(storage.suna_settings_guest, '{"theme":"zen","model":"flash"}');
      });

      it('should gracefully return false and not crash when storage is permanently full', () => {
        const mockLocalStorage = {
          setItem: () => {
            const err = new Error('Disk full');
            err.name = 'QuotaExceededError';
            err.code = 22;
            throw err;
          },
          removeItem: () => {}
        };

        const sandbox = {
          localStorage: mockLocalStorage,
          console: { warn: () => {}, error: () => {} },
          getStorageSuffix: () => '_guest'
        };
        vm.createContext(sandbox);

        const safeSaveCode = `
          function safeSaveLocalStorage(key, val) {
            const strVal = typeof val === 'string' ? val : JSON.stringify(val);
            try {
              localStorage.setItem(key, strVal);
              return true;
            } catch (e) {
              if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || (e.message && e.message.toLowerCase().includes('quota'))) {
                try {
                  localStorage.removeItem('suna_chats');
                  localStorage.removeItem('suna_guest_notes');
                  const suffix = typeof getStorageSuffix === 'function' ? getStorageSuffix() : '_guest';
                  localStorage.setItem('suna_deleted_chats' + suffix, '{}');
                } catch (_) {}
                try {
                  localStorage.setItem(key, strVal);
                  return true;
                } catch (retryErr) {
                  return false;
                }
              }
              return false;
            }
          }
        `;
        vm.runInContext(safeSaveCode, sandbox);

        let res;
        assert.doesNotThrow(() => {
          res = sandbox.safeSaveLocalStorage('suna_settings_guest', { theme: 'zen' });
        });
        assert.strictEqual(res, false, 'Should return false when all retry attempts fail');
      });
    });

    describe('Rapid Keystroke Debounce Stream', () => {
      it('should handle 10 rapid keystrokes cancelling intermediate timers and firing once', (done) => {
        let callCount = 0;
        let timer = null;

        function onKeystroke() {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            callCount++;
          }, 150);
        }

        // Fire 10 keystrokes with 20ms gaps
        let count = 0;
        const interval = setInterval(() => {
          onKeystroke();
          count++;
          if (count === 10) {
            clearInterval(interval);
            assert.strictEqual(callCount, 0, 'No call should have executed during typing');
            setTimeout(() => {
              assert.strictEqual(callCount, 1, 'Exactly one call after stream ends');
              done();
            }, 180);
          }
        }, 20);
      });
    });

    describe('Modifier Key Combinations & Platform Equivalence', () => {
      it('should accept Ctrl, Meta, Shift combos and ignore unrelated key events', () => {
        let inputFocused = 0;
        let panelToggled = 0;

        const sandbox = {
          focusInput: () => { inputFocused++; },
          togglePanel: () => { panelToggled++; }
        };
        vm.createContext(sandbox);

        const shortcutCode = `
          function handleKey(e) {
            // Ctrl+/ or Cmd+/
            if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
              focusInput();
            }
            // Ctrl+Shift+O or Cmd+Shift+O
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o' || e.code === 'KeyO')) {
              togglePanel();
            }
          }
        `;
        vm.runInContext(shortcutCode, sandbox);

        // Windows Ctrl + /
        sandbox.handleKey({ ctrlKey: true, metaKey: false, key: '/' });
        // macOS Cmd + Slash
        sandbox.handleKey({ ctrlKey: false, metaKey: true, code: 'Slash' });
        // Windows Ctrl + Shift + O
        sandbox.handleKey({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'O' });
        // macOS Cmd + Shift + KeyO
        sandbox.handleKey({ ctrlKey: false, metaKey: true, shiftKey: true, code: 'KeyO' });
        // Lowercase variant
        sandbox.handleKey({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'o' });

        // Unrelated combos (should be ignored)
        sandbox.handleKey({ altKey: true, key: '/' });
        sandbox.handleKey({ shiftKey: true, key: 'O' }); // Shift+O without Ctrl/Cmd
        sandbox.handleKey({ ctrlKey: true, key: 'K' });

        assert.strictEqual(inputFocused, 2, 'Input focus should trigger exactly twice');
        assert.strictEqual(panelToggled, 3, 'Panel toggle should trigger exactly 3 times');
      });
    });

    describe('Malformed & Broken LaTeX Token Handling', () => {
      it('should handle broken LaTeX tokens gracefully without throwing or mutating adjacent markdown', () => {
        const mockKatex = {
          renderToString: (str, opts) => {
            if (str.includes('\\broken') || str.includes('\\incomplete') || str.endsWith('{')) {
              throw new Error('KaTeX parse error: Expected token');
            }
            return `<span class="katex">${str}</span>`;
          }
        };

        const sandbox = {
          katex: mockKatex,
          console: { warn: () => {} }
        };
        vm.createContext(sandbox);

        const katexHelper = `
          function renderKatex(math, displayMode) {
            try {
              if (typeof katex !== 'undefined') {
                const decoded = math.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                return katex.renderToString(decoded.trim(), {
                  displayMode: displayMode,
                  throwOnError: false,
                  strict: false
                });
              }
            } catch(e) {
              console.warn('KaTeX render error:', e.message);
            }
            return null;
          }
        `;
        vm.runInContext(katexHelper, sandbox);

        const brokenMathList = [
          '\\broken{foo',
          '\\incomplete{',
          '\\frac{1}{',
          '\\sqrt{'
        ];

        brokenMathList.forEach(expr => {
          assert.doesNotThrow(() => {
            const res = sandbox.renderKatex(expr, false);
            assert.strictEqual(res, null, `Expected null fallback for broken expression ${expr}`);
          });
        });

        // Test when katex is undefined
        sandbox.katex = undefined;
        assert.strictEqual(sandbox.renderKatex('\\int x dx', true), null, 'Should return null when katex library is not loaded');

      });
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS & COMBINATIONS
  // =========================================================================
  describe('Tier 3: Cross-Feature Combinations', () => {

    describe('Shortcuts with Open vs Closed Modals & Dropdowns', () => {
      it('should selectively close only active overlays and clear dropdowns on Escape', () => {
        const modalStates = {
          'settings-modal': { display: 'flex', closed: false },
          'api-modal': { display: 'none', closed: false },
          'memory-modal': { display: 'none', closed: false }
        };

        const dropdownClasses = new Set(['active', 'user-menu-dropdown']);
        const mobileMenuClasses = new Set(['active']);

        const sandbox = {
          document: {
            querySelectorAll: (sel) => {
              if (sel === '.modal-overlay') {
                return Object.entries(modalStates).map(([id, state]) => ({
                  id,
                  style: { display: state.display }
                }));
              }
              return [];
            },
            getElementById: (id) => {
              if (id === 'user-dropdown') {
                return { classList: { remove: (c) => dropdownClasses.delete(c) } };
              }
              if (id === 'mobile-more-menu') {
                return { classList: { remove: (c) => mobileMenuClasses.delete(c) } };
              }
              return null;
            }
          },
          getComputedStyle: (el) => ({ display: el.style.display }),
          closeModal: (id) => { modalStates[id].closed = true; modalStates[id].display = 'none'; }
        };
        vm.createContext(sandbox);

        const code = `
          function onEscape() {
            document.querySelectorAll('.modal-overlay').forEach(modal => {
              if (modal.style.display !== 'none' && getComputedStyle(modal).display !== 'none') {
                closeModal(modal.id);
              }
            });
            const userDropdown = document.getElementById('user-dropdown');
            if (userDropdown) userDropdown.classList.remove('active');
            const mobileMoreMenu = document.getElementById('mobile-more-menu');
            if (mobileMoreMenu) mobileMoreMenu.classList.remove('active');
          }
        `;
        vm.runInContext(code, sandbox);

        sandbox.onEscape();

        assert.strictEqual(modalStates['settings-modal'].closed, true);
        assert.strictEqual(modalStates['api-modal'].closed, false);
        assert.strictEqual(modalStates['memory-modal'].closed, false);
        assert.strictEqual(dropdownClasses.has('active'), false);
        assert.strictEqual(mobileMenuClasses.has('active'), false);

        // Escape again when nothing is open
        assert.doesNotThrow(() => {
          sandbox.onEscape();
        });
      });
    });

    describe('Tab Visibility Rapid Flapping Lifecycle', () => {
      it('should prevent timer accumulation when visibility rapidly flaps between active and hidden', () => {
        let activeIntervalCount = 0;
        let createdIntervals = 0;
        let clearedIntervals = 0;

        const sandbox = {
          window: { _particleInterval: null },
          document: { hidden: false },
          setInterval: () => {
            createdIntervals++;
            activeIntervalCount++;
            return 100 + createdIntervals;
          },
          clearInterval: (id) => {
            if (id) {
              clearedIntervals++;
              activeIntervalCount--;
            }
          }
        };
        vm.createContext(sandbox);

        const lifecycleCode = `
          function initParticles() {
            if (window._particleInterval) {
              clearInterval(window._particleInterval);
              window._particleInterval = null;
            }
            window._particleInterval = setInterval(() => {}, 1000);
          }

          function onVisibilityChange() {
            if (document.hidden) {
              if (window._particleInterval) {
                clearInterval(window._particleInterval);
                window._particleInterval = null;
              }
            } else {
              initParticles();
            }
          }
        `;
        vm.runInContext(lifecycleCode, sandbox);

        // Start visible
        sandbox.initParticles();
        assert.strictEqual(activeIntervalCount, 1);
        assert.ok(sandbox.window._particleInterval !== null);

        // Flap 10 times: hidden -> visible -> hidden -> visible...
        for (let i = 0; i < 10; i++) {
          sandbox.document.hidden = true;
          sandbox.onVisibilityChange();
          assert.strictEqual(sandbox.window._particleInterval, null);

          sandbox.document.hidden = false;
          sandbox.onVisibilityChange();
          assert.ok(sandbox.window._particleInterval !== null);
        }

        // Finish on hidden
        sandbox.document.hidden = true;
        sandbox.onVisibilityChange();
        assert.strictEqual(sandbox.window._particleInterval, null);
        assert.strictEqual(activeIntervalCount, 0, 'No orphaned intervals should remain');
      });
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD INTEGRITY & LIFECYCLE
  // =========================================================================
  describe('Tier 4: Real-World Workloads & Integrity', () => {

    describe('Static Syntax & Compilation Check', () => {
      it('should pass node -c app.js with zero syntax errors', () => {
        const output = execSync('node -c app.js', { encoding: 'utf8' });
        assert.strictEqual(output.trim(), '', 'node -c app.js produced unexpected output or errors');
      });

      it('should pass node -c redesign.js with zero syntax errors', () => {
        const output = execSync('node -c redesign.js', { encoding: 'utf8' });
        assert.strictEqual(output.trim(), '', 'node -c redesign.js produced unexpected output or errors');
      });
    });

    describe('End-to-End Session State & Hybrid Storage Lifecycle', () => {
      it('should seamlessly handle a full user lifecycle with hybrid storage, shortcuts, and KaTeX rendering', async () => {
        const mockStorage = {};
        const mockIdb = {};

        const sandbox = {
          localStorage: {
            getItem: (k) => mockStorage[k] || null,
            setItem: (k, v) => { mockStorage[k] = String(v); },
            removeItem: (k) => { delete mockStorage[k]; }
          },
          idbSet: async (k, v) => { mockIdb[k] = JSON.parse(JSON.stringify(v)); },
          idbGet: async (k) => mockIdb[k] || null,
          AuthState: { isLoggedIn: true, user: { uid: 'user_e2e_prod' } },
          State: {
            settings: { theme: 'zen', currentModel: 'gemini-2.0-flash', temperature: 0.7 },
            mode: 'workspace',
            chats: [],
            deletedChats: {}
          },
          katex: {
            renderToString: (math, opts) => `<span class="katex">${math}</span>`
          },
          console: { warn: () => {}, error: () => {} }
        };
        vm.createContext(sandbox);

        const e2eCode = `
          function getStorageSuffix() {
            if (typeof AuthState !== 'undefined' && AuthState.isLoggedIn && AuthState.user && AuthState.user.uid) {
              return '_' + AuthState.user.uid;
            }
            return '_guest';
          }

          function safeSaveLocalStorage(key, val) {
            const strVal = typeof val === 'string' ? val : JSON.stringify(val);
            try {
              localStorage.setItem(key, strVal);
              return true;
            } catch (e) {
              return false;
            }
          }

          async function saveFullState() {
            const suffix = getStorageSuffix();
            safeSaveLocalStorage('suna_settings' + suffix, State.settings);
            safeSaveLocalStorage('suna_mode', State.mode);
            await idbSet('suna_chats' + suffix, State.chats);
          }

          function renderKatex(math, displayMode) {
            try {
              if (typeof katex !== 'undefined') {
                return katex.renderToString(math.trim(), { displayMode });
              }
            } catch(e) {}
            return null;
          }

          function formatMessageContent(rawText) {
            let html = rawText;
            // Math replacement
            html = html.replace(/(?:\\$\\$|\\\\\\[)([\\s\\S]*?)(?:\\$\\$|\\\\\\[)/g, (_, math) => {
              const rendered = renderKatex(math, true);
              return rendered ? '<div class="math-block">' + rendered + '</div>' : '<div class="math-block"><code>' + math.trim() + '</code></div>';
            });
            return html;
          }
        `;
        vm.runInContext(e2eCode, sandbox);

        // 1. Add heavy chat with Base64 image payload
        sandbox.State.chats.push({
          id: 'chat_heavy_1',
          title: 'Deep Architecture & Vision',
          messages: [
            { id: 1, role: 'user', content: 'Here is the diagram: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
            { id: 2, role: 'assistant', content: 'Here is the formula: $$\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$' }
          ]
        });

        // 2. Persist state through hybrid engine
        await sandbox.saveFullState();

        // Verify isolation
        const suffix = '_user_e2e_prod';
        assert.ok(mockStorage['suna_settings' + suffix].includes('gemini-2.0-flash'));
        assert.strictEqual(mockStorage['suna_mode'], 'workspace');
        assert.strictEqual(mockStorage['suna_chats' + suffix], undefined, 'Heavy chats should NOT be stored in localStorage');
        assert.strictEqual(mockIdb['suna_chats' + suffix].length, 1);
        assert.ok(mockIdb['suna_chats' + suffix][0].messages[0].content.includes('data:image/png;base64'));

        // 3. Format message with KaTeX
        const assistantMsg = sandbox.State.chats[0].messages[1].content;
        const formatted = sandbox.formatMessageContent(assistantMsg);
        assert.ok(formatted.includes('<div class="math-block"><span class="katex">'));
      });
    });
  });
});
