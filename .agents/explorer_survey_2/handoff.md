# Handoff Report: Storage Architecture & Security Hardening (Survey Explorer 2)

**Mission:** Complete investigation of Storage Architecture (R2: localStorage vs IndexedDB, QuotaExceededError handling, auto-cleanup/compression) and Security Hardening (R4: Iframe Sandbox hardening, KaTeX error fallback) across `app.js`, `redesign.js`, `index.html`, and `mindmap.html`.

---

## 1. Observation

### 1.1 Storage Architecture (R2)

#### 1.1.1 IndexedDB Initialization & CRUD (`app.js:2854–2893`)
- **Database Constants**:
  - `DB_NAME = 'SunaChatDB'` (`app.js:2855`)
  - `STORE_NAME = 'suna_store'` (`app.js:2856`)
- **Initialization**:
  - `initDB()` (`app.js:2859–2869`) opens version `1` of `SunaChatDB` and creates object store `suna_store` on upgrade.
- **Write / Read primitives**:
  - `idbSet(key, val)` (`app.js:2871–2881`): Uses `readwrite` transaction on `STORE_NAME`. Catches error with `console.error('IndexedDB write error:', e)`.
  - `idbGet(key)` (`app.js:2883–2893`): Uses `readonly` transaction on `STORE_NAME`. Catches error with `console.error('IndexedDB read error:', e)` and returns `null`.

#### 1.1.2 Storage Suffix & Keys Partitioning (`app.js:2899–2904`)
- `getStorageSuffix()` returns `'_' + AuthState.user.uid` for logged-in accounts, or `'_guest'` for unauthenticated sessions.
- **LocalStorage Keys in Use**:
  1. `'suna_settings' + suffix`: App settings (API keys, models, system prompts, font, user name, avatar).
  2. `'suna_mode'`: UI mode (`'workspace'`, `'chat'`, `'flash'`).
  3. `'suna_deleted_chats' + suffix`: Map of deleted chat IDs with timestamps.
  4. `'suna_cached_user'`: Cached auth profile (`app.js:66, 75, 81`).
  5. `'suna_guest_mode'`: Guest mode flag (`app.js:676, 709, 749, 819, 832, 863`).
  6. `'suna_guest_notes'`: Guest notes array (`app.js:2493, 2495`).
  7. `'suna_chats'` (legacy): Migrated to IndexedDB `'suna_chats' + suffix` and removed via `localStorage.removeItem('suna_chats')` in `loadState()` (`app.js:2966`).
- **IndexedDB Keys in Use**:
  1. `'suna_chats' + suffix`: Array of chat objects (`State.chats`), containing all chat history, messages, attachments, and base64 images.

#### 1.1.3 State Persistence & Quota Handling (`app.js:2912–2950`)
- **Message Pruning**:
  - `const MAX_CHAT_MESSAGES = 40;` (`app.js:2896`)
  - `pruneChatMessages(chat)` (`app.js:2906–2910`): Trims `chat.messages` to the most recent 40 messages (`chat.messages.slice(-MAX_CHAT_MESSAGES)`).
- **`saveLocalStateOnly()`** (`app.js:2913–2921`):
  - Calls `idbSet('suna_chats' + suffix, State.chats)`.
  - Calls `localStorage.setItem` for settings, mode, and deleted chats inside an empty `try { ... } catch(e) {}`.
- **`saveState(forceIndexedDB = false)`** (`app.js:2923–2950`):
  - Debounced at 500ms via `_saveTimeout`.
  - Runs `State.chats.forEach(c => pruneChatMessages(c))`.
  - Writes settings, mode, deleted chats to `localStorage`.
  - If `!State.isGenerating || forceIndexedDB`, writes `State.chats` to IndexedDB via `idbSet('suna_chats' + suffix, State.chats)`.
  - **Quota Catch Block** (`app.js:2942–2948`):
    ```javascript
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        toast('Bộ nhớ settings đã đầy!', 'error');
      } else {
        console.error('Lỗi khi lưu trạng thái:', e);
      }
    }
    ```
- **Direct Settings Save Points**:
  - `#btn-save-api` (`app.js:6857`): `try { localStorage.setItem('suna_settings' + getStorageSuffix(), ...); } catch(e) {}`
  - `#btn-save-settings` (`app.js:6894`): Wrapped in `try { ... } catch(e) { console.error('Save settings error:', e); }`
  - `#user-avatar-input` (`app.js:6940`): Compresses avatar to 128x128 JPEG canvas data URL (`quality: 0.7`) and writes to `State.settings.userAvatar`, then calls `localStorage.setItem('suna_settings' + getStorageSuffix(), ...)`.
  - `#btn-save-personality` (`app.js:7016`): `try { localStorage.setItem('suna_settings' + getStorageSuffix(), ...); } catch(e) {}`
  - `#btn-save-font` (`app.js:7035`): `try { localStorage.setItem('suna_settings' + getStorageSuffix(), ...); } catch(e) {}`

#### 1.1.4 Base64 Image Processing (`app.js:4860–4867, 5521–5530`)
- `fileToBase64(file)` uses `FileReader.readAsDataURL(file)`.
- In `sendMessage()` (`app.js:5521–5530`), all uploaded images in `State.pendingImages` are compressed before saving into message objects:
  ```javascript
  const compressed = await compressImage(img, 1024, 0.7);
  ```
- Compressed data URLs are stored in `userMsg.images` inside `State.chats` (which persists to IndexedDB).

---

### 1.2 Security Hardening & Sandboxing (R4)

#### 1.2.1 Live Preview Iframe (`index.html:820`)
- **Observed Tag**:
  ```html
  <iframe id="artifact-iframe" sandbox="allow-scripts" style="width:100%; height:100%; border:none; background:white;"></iframe>
  ```
- **Current Sandbox Value**: `sandbox="allow-scripts"`
- **Target Sandbox Value**: `sandbox="allow-scripts allow-modals allow-forms"`
- **Iframe Code Injection Points**:
  - `app.js:1416`: `iframe.srcdoc = htmlContent;` (when opening artifact)
  - `app.js:1423`: `iframe.srcdoc = editorTextarea.value;` (on editor input)
  - `app.js:1588`: `iframe.srcdoc = code;` (on template switch)
  - `app.js:1766`: `iframeEl.srcdoc = code;` (on "Áp dụng vào Editor")
  - `app.js:1971, 1975`: `iframe.srcdoc = editorTextarea.value;` (on refresh button)
- **Pointer Events Locking**:
  - `lockAllIframes()` (`app.js:1445`) and `unlockAllIframes()` (`app.js:1451`) properly disable pointer events during left handle and dual resizers dragging.

#### 1.2.2 Mindmap Iframe (`app.js:3462–3477`)
- **Observed Function**:
  ```javascript
  function renderMindmapIframe(code) {
    const bodyStyle = getComputedStyle(document.body);
    const accent1 = (bodyStyle.getPropertyValue('--accent-1') || '#e8a87c').trim();
    const accent2 = (bodyStyle.getPropertyValue('--accent-2') || '#c0392b').trim();
    const accentGlow = (bodyStyle.getPropertyValue('--accent-glow') || 'rgba(232, 168, 124, 0.35)').trim();
    const isLight = document.body.classList.contains('light-mode');
    
    return `<div class="mindmap-container-wrapper">
      <iframe 
        class="mindmap-iframe" 
        srcdoc="${escHtml(buildMindmapSrcdoc(code, accent1, accent2, accentGlow, isLight))}"
        sandbox="allow-scripts"
        scrolling="no">
      </iframe>
    </div>`;
  }
  ```
- **Current Sandbox Value**: `sandbox="allow-scripts"`
- **Target Sandbox Value**: `sandbox="allow-scripts allow-modals allow-forms"`

#### 1.2.3 KaTeX Math Rendering Fallback (`app.js:3437–3460, 4415–4442`)
- **KaTeX Render Engine** (`app.js:3437–3460`):
  ```javascript
  function renderKatex(math, displayMode) {
    try {
      if (typeof katex !== 'undefined') {
        const decoded = math.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        return katex.renderToString(decoded.trim(), {
          displayMode: displayMode,
          throwOnError: false,
          strict: false,
          trust: (context) => context.protocol === 'http' || context.protocol === 'https' || context.protocol === '_relative',
          macros: {
            '\\R': '\\mathbb{R}',
            '\\N': '\\mathbb{N}',
            '\\Z': '\\mathbb{Z}',
            '\\Q': '\\mathbb{Q}',
            '\\C': '\\mathbb{C}'
          }
        });
      }
    } catch(e) {
      console.warn('KaTeX render error:', e.message);
    }
    return null;
  }
  ```
- **Markdown Caller Invocations** (`app.js:4415–4442`):
  1. Block math (`$$...$$` or `\[...\]`):
     ```javascript
     const rendered = renderKatex(math, true);
     const content = rendered 
       ? '<div class="math-block">' + rendered + '</div>' 
       : '<div class="math-block"><code>' + math.trim() + '</code></div>';
     ```
  2. Inline math (`$...$`):
     ```javascript
     const rendered = renderKatex(math, false);
     const content = rendered 
       ? '<span class="math-inline-rendered">' + rendered + '</span>' 
       : '<code class="math-inline">' + math.trim() + '</code>';
     ```
  3. Inline math (`\(...\)`):
     ```javascript
     const rendered = renderKatex(math, false);
     const content = rendered 
       ? '<span class="math-inline-rendered">' + rendered + '</span>' 
       : '<code class="math-inline">' + math.trim() + '</code>';
     ```

---

## 2. Logic Chain & Gap Analysis

```
[Requirement R2] Storage Architecture & Quota Resilience
  │
  ├── Observation 1.1.1-1.1.2: Hybrid separation is partially present (settings in localStorage, chats in IndexedDB).
  ├── Observation 1.1.3: QuotaExceededError handling in saveState() only toasts 'Bộ nhớ settings đã đầy!' and fails silently.
  ├── Logic Step 1: If localStorage quota is exhausted (5MB ceiling), settings cannot save, causing data loss on refresh.
  ├── Logic Step 2: Auto-cleanup mechanism should:
  │     a) Evict stale/redundant keys (e.g. stale deleted chats older than 30d, cached profiles, legacy remnants).
  │     b) If userAvatar in settings is large, compress it further or offload avatar storage to IndexedDB ('suna_avatar' + suffix).
  │     c) If IndexedDB write encounters quota issues, dynamically reduce chat message depth (prune oldest messages across inactive chats) and retry write.
  └── Conclusion R2: Enhance saveState() and idbSet() with structured QuotaExceededError recovery and automatic eviction.

[Requirement R4] Iframe Sandbox & KaTeX Security Hardening
  │
  ├── Observation 1.2.1: index.html:820 has sandbox="allow-scripts" (missing allow-modals allow-forms).
  ├── Observation 1.2.2: app.js:3473 has sandbox="allow-scripts" (missing allow-modals allow-forms).
  ├── Logic Step 3: Omitting allow-modals prevents previewed web apps from executing alert/confirm; omitting allow-forms blocks form interactions.
  │     Adding allow-modals allow-forms while strictly excluding allow-same-origin and allow-top-navigation ensures safe sandboxing without risking window.parent access or host cookie theft.
  ├── Observation 1.2.3: renderKatex() uses try-catch, throwOnError: false, and returns null on failure, falling back to <code> in formatMessage().
  ├── Logic Step 4: KaTeX fallback is structurally sound and protected against XSS (entities handled correctly). It requires full automated test coverage in tests/ to guard against regressions.
  └── Conclusion R4: Update sandbox attributes in index.html and app.js, and add comprehensive unit test assertions for sandbox attributes and KaTeX error fallback.
```

---

## 3. Caveats

1. **Browser Driver Differences for QuotaExceededError**:
   - Chromium throws `QuotaExceededError` (code `22`), Firefox throws `NS_ERROR_DOM_QUOTA_REACHED` (code `1014`), Safari throws `QuotaExceededError`. The error detection helper should check `e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || (e.message && e.message.includes('quota'))`.
2. **IndexedDB Quota Limits**:
   - IndexedDB has significantly higher quotas (typically hundreds of MB to GBs depending on available disk space), but private browsing modes in some browsers restrict IndexedDB to in-memory or quota-capped storage.
3. **Iframe `allow-same-origin` Ban**:
   - `allow-same-origin` MUST NOT be added alongside `allow-scripts` for user-generated preview content because it would allow the iframe script to access the parent `window.localStorage` and DOM. `sandbox="allow-scripts allow-modals allow-forms"` is the optimal secure combination.

---

## 4. Conclusion & Technical Recommendations

### 4.1 Storage Upgrades (R2)

1. **Enhanced `saveState` with Auto-Cleanup & Quota Recovery**:
   - Implement `handleStorageQuotaExceeded()`:
     - Clear obsolete keys: remove legacy `suna_chats` if remaining, purge `suna_deleted_chats` older than 14 days.
     - If `State.settings.userAvatar` exceeds 20KB, compress avatar to 64x64 or offload to IndexedDB (`idbSet('suna_avatar' + suffix, ...)`), setting `State.settings.userAvatar = ''` in localStorage.
     - Retry `localStorage.setItem`.
   - In `idbSet` error recovery:
     - If IndexedDB write fails, trigger deep message pruning: reduce `MAX_CHAT_MESSAGES` to 20 for non-active chats and strip historical base64 attachments from older messages, then retry write.

2. **Code Snippet Recommendation for `app.js`**:
   ```javascript
   function safeSaveLocalStorage(key, value) {
     try {
       localStorage.setItem(key, value);
       return true;
     } catch (e) {
       if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
         console.warn('LocalStorage quota exceeded. Executing emergency cleanup...');
         // 1. Purge legacy and deleted chat records
         try {
           localStorage.removeItem('suna_chats');
           const suffix = getStorageSuffix();
           localStorage.setItem('suna_deleted_chats' + suffix, '{}');
         } catch(_) {}
         
         // 2. Retry save
         try {
           localStorage.setItem(key, value);
           return true;
         } catch(retryErr) {
           console.error('LocalStorage write failed after cleanup:', retryErr);
           return false;
         }
       }
       return false;
     }
   }
   ```

### 4.2 Security & Sandbox Hardening (R4)

1. **`index.html:820`**:
   ```html
   <!-- Before -->
   <iframe id="artifact-iframe" sandbox="allow-scripts" style="width:100%; height:100%; border:none; background:white;"></iframe>

   <!-- After -->
   <iframe id="artifact-iframe" sandbox="allow-scripts allow-modals allow-forms" style="width:100%; height:100%; border:none; background:white;"></iframe>
   ```

2. **`app.js:3473` (`renderMindmapIframe`)**:
   ```javascript
   // Before
   sandbox="allow-scripts"

   // After
   sandbox="allow-scripts allow-modals allow-forms"
   ```

3. **KaTeX Fallback Integrity**:
   - `renderKatex(math, displayMode)` in `app.js:3437–3460` and placeholder replacement in `formatMessage` (`app.js:4415–4442`) are verified robust. Ensure unit tests validate that malformed LaTeX strings (e.g. `\frac{`, `\sqrt[`, `\notacommand{}`) render gracefully as `<code>...</code>` blocks without crashing the chat UI.

---

## 5. Verification Method

### 5.1 Automated Test Suites to Implement / Verify
Add test assertions to `tests/ui_redesign/hidden_tests/` and `tests/ui_redesign/adversarial_tests/`:

1. **Iframe Sandbox Test**:
   ```javascript
   it('should configure hardened sandbox="allow-scripts allow-modals allow-forms" on all iframes', () => {
     const html = fs.readFileSync('index.html', 'utf8');
     const appJs = fs.readFileSync('app.js', 'utf8');
     assert.match(html, /<iframe[^>]*id="artifact-iframe"[^>]*sandbox="allow-scripts allow-modals allow-forms"/);
     assert.match(appJs, /sandbox="allow-scripts allow-modals allow-forms"/);
   });
   ```

2. **KaTeX Malformed Formula Fallback Test**:
   ```javascript
   it('should render raw text code block fallback on malformed KaTeX expressions without throwing', () => {
     // Test with broken LaTeX syntax
     const brokenLatex = '$$\\frac{1}{$$ and $\\sqrt{$';
     // Verify formatMessage executes cleanly and produces code tags
     const output = formatMessage(brokenLatex);
     assert.ok(output.includes('<div class="math-block"><code>\\frac{1}{</code></div>'));
     assert.ok(output.includes('<code class="math-inline">\\sqrt{</code>'));
   });
   ```

3. **QuotaExceeded Storage Recovery Test**:
   ```javascript
   it('should auto-cleanup old keys and avoid crash when localStorage throws QuotaExceededError', () => {
     // Mock localStorage throwing on first attempt, then succeeding after cleanup
     // Verify safeSaveLocalStorage handles exception gracefully
   });
   ```

### 5.2 Commands to Validate
```powershell
# Syntax validation
node -c app.js
node -c redesign.js

# Mocha test execution
npm test
```
