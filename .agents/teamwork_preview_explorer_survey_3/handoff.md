# Investigation & Architecture Survey: Cloud Sync, Conflict Resolution & Test Infrastructure

**Date**: 2026-09-07T10:43:00Z  
**Explorer Agent**: `teamwork_preview_explorer_survey_3`  
**Working Directory**: `d:\Suna Chat\.agents\teamwork_preview_explorer_survey_3`  
**Reference Document**: `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md`

---

## 1. Observation

### 1.1 Firestore Cloud Sync & Real-Time Listeners
Direct code inspection of `d:\Suna Chat\app.js`:

- **Listener Array & Initialization (`app.js:410-483`)**:
  ```javascript
  // app.js:410-420
  let _syncUnsubscribes = [];
  function initRealtimeSync() {
    if (!AuthState.isLoggedIn || !_fb || AuthState.useLocalOnly) return;
    const uid = AuthState.user.uid;
    
    _syncUnsubscribes.forEach(u => u());
    _syncUnsubscribes = [];

    // 1. Listen to chats
    _syncUnsubscribes.push(_fb.onSnapshot(_fb.doc(_fb.db, 'users', uid, 'data', 'chats'), (doc) => {
  ```
  Listeners attach to three documents under `users/${uid}/data/`:
  1. `chats` (`app.js:419-453`): Listens for remote chat document changes. Parses `rawChats` and `rawDel`. Runs `upgradeStateLocal()`, merges `State.deletedChats`, runs `mergeChats(State.chats, cc)`, updates `State.activeChatId`, and calls `window.saveLocalStateOnly()`.
  2. `memory` (`app.js:456-468`): Listens for remote memory document changes. Merges memory facts using `mergeMemory(State.memory, d)` and calls `window.saveLocalStateOnly()`.
  3. `settings` (`app.js:471-482`): Listens for remote settings changes. Merges settings via `mergeSettings(State.settings, d)` and calls `window.saveLocalStateOnly()`.

- **Push Logic (`app.js:246-347`)**:
  - `cloudSave(immediate = false)` is debounced by 2000ms:
    ```javascript
    // app.js:344
    AuthState.syncDebounceTimer = setTimeout(doSave, 2000);
    ```
  - Pre-merge fetch: Before writing to Firestore, `cloudSave` performs `Promise.all` across `getDoc` for `settings`, `memory`, and `chats` (`app.js:264-268`).
  - Merges remote deletions into `State.deletedChats` (`app.js:283-286`).
  - Calls `mergeChats`, `mergeSettings`, `mergeMemory` (`app.js:289-291`).
  - Persists merged data locally first: `window.saveLocalStateOnly()` (`app.js:302`).
  - Cleans large images (> 70,000 chars) to `'__large_image__'` (`app.js:305-314`).
  - Writes to Firestore via `Promise.all` with `_fb.setDoc` on `settings`, `memory`, and `chats` (`app.js:317-329`).
  - Updates `updateSyncIndicator('synced')` (`app.js:332`).

- **Initial Pull Logic (`app.js:349-408`)**:
  - `cloudLoad()` performs `_fb.getDoc` on `settings`, `memory`, and `chats` (`app.js:354-358`).
  - Detects new account:
    ```javascript
    // app.js:360-363
    const isNewAccount = !sSnap.exists() && !mSnap.exists() && !cSnap.exists();
    if (isNewAccount) {
      cloudSave(true);
    }
    ```
  - If existing account: parses remote docs, merges into `State.deletedChats`, `State.chats`, `State.settings`, `State.memory`, and calls `window.saveLocalStateOnly()`.

- **Trigger Points**:
  - `triggerCloudSync()` (`app.js:485-490`): Called from `saveState()` (`app.js:4503`) and `SunaAgent.tools.update_user_settings` (`app.js:3311`). Calls `cloudSave(false)` and `updateSyncIndicator('syncing')`.
  - `saveState()` (`app.js:4482-4518`): Uses a 500ms debounce (`_saveTimeout`), then triggers `triggerCloudSync()`. Total latency from user edit to cloud write: `500ms + 2000ms = 2500ms`.
  - `handleLogout()` (`app.js:697-731`): Unsubscribes `_syncUnsubscribes`, calls `await cloudSave(true)`, calls `_fb.signOutFn`, and resets state.
  - `initAuth()` (`app.js:849-882`): In `onAuthStateChanged`, calls `await loadState()`, `await loadMemory()`, `await cloudLoad()`, then `initRealtimeSync()`.

---

### 1.2 3-Way Merge, Deletion Handling & Resurrection Issues
Direct code inspection of `d:\Suna Chat\app.js`:

- **`mergeChats` Implementation (`app.js:122-193`)**:
  ```javascript
  // app.js:122-144
  function mergeChats(localChats, remoteChats) {
    const mergedMap = new Map();
    const localDeleted = State.deletedChats || {};
    
    for (const c of localChats) {
      const chat = { ...c };
      if (!chat.id) continue;
      mergedMap.set(chat.id, chat);
    }

    for (const r of remoteChats) {
      const remoteChat = { ...r };
      if (!remoteChat.id) continue;

      const localChat = mergedMap.get(remoteChat.id);

      if (!localChat) {
        const localDelTime = localDeleted[remoteChat.id] || 0;
        if (localDelTime >= (remoteChat.updatedAt || 0)) {
          continue; 
        }
        mergedMap.set(remoteChat.id, remoteChat);
      } else {
  ```
  ```javascript
  // app.js:187-193
    return Array.from(mergedMap.values())
      .filter(c => {
        const isDelLocally = localDeleted[c.id] !== undefined && localDeleted[c.id] >= (c.updatedAt || 0);
        return !isDelLocally && !c.deleted;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  ```

- **Chat Deletion (`app.js:4900-4922`)**:
  ```javascript
  function deleteChat(id) {
    if (State.generatingChatId === id && State.abortController) {
      State.abortController.abort();
    }
    if (!State.deletedChats) State.deletedChats = {};
    State.deletedChats[id] = Date.now(); // Log the deletion to sync it

    State.chats = State.chats.filter(c => c.id !== id);
    ...
    saveState(true);
  ```
  *Note*: `deleteChat` removes the chat from `State.chats`, but does NOT set `c.deleted = true`.

- **Message Deletion (`app.js:8291-8306`)**:
  ```javascript
  window.deleteMessage = function(idx) {
    const chat = getActiveChat();
    if(!chat) return;
    
    const msg = chat.messages[idx];
    if (msg && msg.id) {
      if (!chat.deletedMessageIds) chat.deletedMessageIds = {};
      chat.deletedMessageIds[msg.id] = Date.now(); // Log message deletion
    }

    chat.messages.splice(idx, 1);
    chat.updatedAt = Date.now();
    saveState(true);
    renderMessages();
  }
  ```

- **Message Merging in `mergeChats` (`app.js:171-178`)**:
  ```javascript
  const finalMessages = [];
  for (const [msgId, msg] of msgMap.entries()) {
    const delTime = mergedChat.deletedMessageIds[msgId];
    if (delTime !== undefined && delTime >= (msg.updatedAt || msg.timestamp || 0)) {
      continue; 
    }
    finalMessages.push(msg);
  }
  ```

- **State Normalization in `upgradeStateLocal()` (`app.js:88-120`)**:
  ```javascript
  // app.js:96
  if (!chat.updatedAt) chat.updatedAt = chat.createdAt;
  ...
  // app.js:103
  if (!msg.updatedAt) msg.updatedAt = msg.timestamp || Date.now();
  ```

- **Tombstone Wiping in LocalStorage Quota Recovery (`app.js:4457, 4510`)**:
  ```javascript
  // app.js:4457 & 4510
  localStorage.setItem('suna_deleted_chats' + suffix, '{}');
  ```

---

### 1.3 1MB Firestore Quota & Image Stripping (`__large_image__`)
Direct code inspection of `d:\Suna Chat\app.js`:

- **Stripping in `cloudSave` (`app.js:304-314`)**:
  ```javascript
  // Clean large images to satisfy 1MB Document quota
  const chatsClean = State.chats.map(c => ({
    ...c,
    messages: (c.messages || []).map(m => {
      const copy = { ...m };
      if (copy.images && copy.images.length) {
        copy.images = copy.images.map(img => (img && img.length > 70000) ? '__large_image__' : img);
      }
      return copy;
    })
  }));
  ```
  Base64 images with character length > 70,000 (~50KB) are replaced with `'__large_image__'` in the cloud payload `chatsClean`.
  The in-memory `State.chats` and local IndexedDB retain the full base64 strings.

- **Placeholder Rendering in `renderMessages` (`app.js:5068-5074`)**:
  ```javascript
  if (img === '__large_image__') {
    return `<div class="large-image-placeholder" title="Ảnh kích thước lớn chỉ lưu trữ cục bộ trên thiết bị gửi"><span class="material-icons-round">cloud_off</span><span>Ảnh lớn (Lưu cục bộ)</span></div>`;
  } else {
    return `<img src="${img}" alt="image">`;
  }
  ```

- **Vision API Bypass (`app.js:7687, 7692, 7703, 7766`)**:
  ```javascript
  const validImages = (m.images || []).filter(img => img && img !== '__large_image__');
  ```
  Vision pipeline ignores `'__large_image__'` markers to prevent sending invalid placeholder strings to Gemini/OpenAI vision models.

- **Chat Message Pruning (`app.js:4429, 4439-4443`)**:
  ```javascript
  const MAX_CHAT_MESSAGES = 40;
  function pruneChatMessages(chat) {
    if (chat && chat.messages && chat.messages.length > MAX_CHAT_MESSAGES) {
      chat.messages = chat.messages.slice(-MAX_CHAT_MESSAGES);
    }
  }
  ```

- **Vulnerability in `mergeChats` (`app.js:160-168`)**:
  ```javascript
  for (const rm of (remoteChat.messages || [])) {
    const lm = msgMap.get(rm.id);
    if (!lm) {
      msgMap.set(rm.id, rm);
    } else {
      if ((rm.updatedAt || 0) > (lm.updatedAt || 0)) {
        msgMap.set(rm.id, rm);
      }
    }
  }
  ```
  If remote message has higher `updatedAt`, `rm` blindly replaces `lm`. If `lm` had the full local base64 image and `rm` has `'__large_image__'`, the full image is lost on the original device!

---

### 1.4 `#sync-indicator` States & Online/Offline Events
Direct code inspection of `d:\Suna Chat\app.js`, `index.html`, `styles.css`:

- **UI Indicator DOM & Classes (`index.html:352`, `styles.css:4015-4027`)**:
  ```html
  <div id="sync-indicator" class="sync-indicator offline" title="Chưa đăng nhập">
  ```
  ```css
  .sync-indicator .material-icons-round { font-size: 18px; }
  .sync-indicator.synced { color: #2ecc71; }
  .sync-indicator.syncing { color: #a78bfa; }
  .sync-indicator.syncing .material-icons-round { animation: spin 1.2s linear infinite; }
  .sync-indicator.error { color: #e74c3c; }
  .sync-indicator.offline { color: var(--text-muted); opacity: 0.5; }
  ```

- **`updateSyncIndicator` Function (`app.js:493-501`)**:
  ```javascript
  function updateSyncIndicator(status) {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    el.className = 'sync-indicator ' + status;
    const icons = { syncing: 'sync', synced: 'cloud_done', error: 'cloud_off', offline: 'cloud_off' };
    el.innerHTML = '<span class="material-icons-round">' + (icons[status] || 'cloud_off') + '</span>';
    const t = { syncing: 'Đang đồng bộ...', synced: 'Đã đồng bộ', error: 'Lỗi đồng bộ', offline: 'Chưa đồng bộ' };
    el.title = t[status] || '';
  }
  ```

- **Network Event Listeners (`app.js:809-836`, `app.js:8798`)**:
  ```javascript
  // app.js:809-836
  let _authOnlineListenerAttached = false;
  ...
  if (!_authOnlineListenerAttached) {
    _authOnlineListenerAttached = true;
    window.addEventListener('online', () => { if (!_fb) initAuth(); });
  }
  ```
  ```javascript
  // app.js:8798
  window.addEventListener('online', () => { if(window.toast) toast('Đã khôi phục kết nối mạng.', 'success'); });
  ```
  *Defect*: There is ZERO `window.addEventListener('offline', ...)` anywhere in the codebase.
  *Defect*: When `window.online` fires and `_fb` is already loaded, `if (!_fb)` is false, so NO sync or indicator update occurs!

---

### 1.5 Test Infrastructure & Suite Inventory
- **Commands & Tool Execution**:
  - `npm run check`: Exited with code 0 (`node -c app.js && node -c redesign.js`).
  - `python run_verification.py`: Exited with code 0.
    - Verified syntax for `app.js` and `redesign.js`.
    - Verified CSS hygiene: 733 open braces == 733 close braces, no unclosed selectors, `.toast-container` with `z-index: 10000`.
    - Verified Mocha tests: **735 passing (4s)** across 34 test files.
    - Verified test architecture distribution: 8 Active Feature & E2E Suites, 12 Hidden & Adversarial Suites.

- **Inventory of all 34 existing test suite files**:
  1. `tests/test_challenger_adversarial_suite.js` (9.2 KB)
  2. `tests/test_challenger_collapsible_adversarial.js` (40.2 KB)
  3. `tests/test_challenger_continuation_adversarial.js` (56.3 KB)
  4. `tests/test_challenger_m1_token_and_prompt_adversarial.js` (23.5 KB)
  5. `tests/test_challenger_m1_token_maximization.js` (29.7 KB)
  6. `tests/test_challenger_storage_security_adversarial.js` (22.8 KB)
  7. `tests/test_challenger_workspace_live_sync_adversarial.js` (28.0 KB)
  8. `tests/test_collapsible_code_and_continuation.js` (38.9 KB)
  9. `tests/test_dsh_core_tools.js` (36.9 KB)
  10. `tests/test_dsh_react_loop_and_trajectory.js` (22.0 KB)
  11. `tests/test_dsh_tool_registry.js` (24.2 KB)
  12. `tests/test_dsh_zero_regression_matrix.js` (12.1 KB)
  13. `tests/test_e2e_token_continuation_engine.js` (96.9 KB)
  14. `tests/test_four_pillars_comprehensive_suite.js` (6.3 KB)
  15. `tests/test_mindmap_balanced_engine_and_features_opt.js` (2.7 KB)
  16. `tests/test_mobile_responsive_redesign.js` (4.5 KB)
  17. `tests/test_multi_turn_chaining_and_truncation_detection.js` (32.7 KB)
  18. `tests/test_per_message_diagram_and_svg_render.js` (2.2 KB)
  19. `tests/test_performance_shortcuts_storage_security.js` (39.8 KB)
  20. `tests/test_session_idle_and_scroll_preservation.js` (4.6 KB)
  21. `tests/test_spacious_layout_redesign.js` (2.2 KB)
  22. `tests/test_thinking_blocks_stream_parser_adversarial.js` (27.1 KB)
  23. `tests/test_token_maximization_and_system_prompts.js` (10.3 KB)
  24. `tests/test_topbar_layout_and_css_hygiene.js` (10.2 KB)
  25. `tests/test_workspace_direct_sync_and_continuation.js` (26.5 KB)
  26. `tests/ui_redesign/adversarial_tests/test_adversarial_state_and_resilience.js` (19.7 KB)
  27. `tests/ui_redesign/hidden_tests/test_contrast_ratio.js` (2.2 KB)
  28. `tests/ui_redesign/hidden_tests/test_css_fallbacks.js` (0.3 KB)
  29. `tests/ui_redesign/hidden_tests/test_transition_perf.js` (0.5 KB)
  30. `tests/ui_redesign/hidden_tests/test_workspace_resizers_and_storage.js` (2.5 KB)
  31. `tests/ui_redesign/visible_tests/test_color_palette.js` (0.8 KB)
  32. `tests/ui_redesign/visible_tests/test_layout_elements.js` (0.4 KB)
  33. `tests/ui_redesign/visible_tests/test_typography.js` (0.7 KB)
  34. `tests/ui_redesign/visible_tests/test_workspace_layout.js` (1.9 KB)

---

## 2. Logic Chain

### 2.1 Why Deleted Chats and Messages Resurrect
1. **Observation**: `mergeChats` in `app.js:188-191` filters out deleted chats only if:
   `localDeleted[c.id] !== undefined && localDeleted[c.id] >= (c.updatedAt || 0)`.
2. **Observation**: In `app.js:96`, `upgradeStateLocal()` runs before `mergeChats` in both `initRealtimeSync` (`app.js:430`) and `cloudLoad` (`app.js:365`). If a chat object loaded from local storage lacks `updatedAt`, `upgradeStateLocal` assigns `chat.updatedAt = chat.createdAt`. If `chat.createdAt` is also missing or freshly generated, or if the device clock is ahead of the device that deleted the chat, `c.updatedAt` is greater than `localDeleted[c.id]`.
3. **Logic Step**: Because `c.updatedAt > localDeleted[c.id]`, `localDeleted[c.id] >= c.updatedAt` evaluates to **FALSE**. Therefore `isDelLocally` is **FALSE**, and the chat is preserved in the merged array (`!isDelLocally` is TRUE).
4. **Logic Step**: The preserved chat is saved back to IndexedDB via `saveLocalStateOnly()`, and in the next `cloudSave`, it is re-uploaded to Firestore. The deleted chat has now resurrected on both local storage and the cloud.
5. **Observation**: In `safeSaveLocalStorage` (`app.js:4457`) and `saveState` (`app.js:4510`), when a `QuotaExceededError` occurs, the recovery code runs:
   `localStorage.setItem('suna_deleted_chats' + suffix, '{}')`.
6. **Logic Step**: Wiping `suna_deleted_chats` deletes all tombstone history on that browser. Every chat previously deleted will now be re-fetched from Firestore or remote snapshots and resurrected.
7. **Observation**: In `app.js:174`, message deletion filtering relies on:
   `delTime !== undefined && delTime >= (msg.updatedAt || msg.timestamp || 0)`.
   In `app.js:103`, `if (!msg.updatedAt) msg.updatedAt = msg.timestamp || Date.now()`.
8. **Logic Step**: If `Date.now()` is evaluated on Device B during `upgradeStateLocal` at timestamp $T_B > T_{del}$, `msg.updatedAt` becomes $T_B$. Thus `delTime >= msg.updatedAt` is false, and the deleted message is retained in `finalMessages`, resurrecting the message.

### 2.2 Why Guest Identity is Lost on F5 / Reload
1. **Observation**: In `app.js:737` (`handleGuestLogin`) and `app.js:821` (`initAuth`), the guest UID is generated dynamically:
   `AuthState.user = { uid: 'guest-' + Date.now(), ... }`.
2. **Observation**: In `app.js:4432-4437`, `getStorageSuffix()` returns `'_' + AuthState.user.uid` when `AuthState.user.uid` exists.
3. **Logic Step**: When a user is in Guest mode, `AuthState.user.uid` is `guest-<timestamp1>`. Chats are saved to IndexedDB under `suna_chats_guest-<timestamp1>`.
4. **Observation**: When the user refreshes the page (F5), `initAuth()` runs again. Because `getCachedAuthUser()` returns null for Guest, it executes line 821:
   `AuthState.user = { uid: 'guest-' + Date.now(), ... }`, generating a NEW `guest-<timestamp2>`.
5. **Logic Step**: `getStorageSuffix()` now returns `_guest-<timestamp2>`. When `loadState()` attempts to read `idbGet('suna_chats_guest-<timestamp2>')`, it returns `null` because all chats were saved under `_guest-<timestamp1>`. The guest user appears to have lost all chat history after reload.

### 2.3 Why Account Switching Leaks Data & Unsubscribes
1. **Observation**: In `app.js:850-884` (`onAuthStateChanged`):
   When a user signs in, it sets `AuthState.user = user`. It compares `if (oldUid !== user.uid)`, then calls `await loadState()` and `await loadMemory()`.
2. **Observation**: `_syncUnsubscribes` is only cleared when `initRealtimeSync()` is called at line 873, or in `onAuthStateChanged`'s `else` branch (logout).
3. **Logic Step**: While `loadState()`, `loadMemory()`, and `cloudLoad()` are asynchronously executing, the previous user's `onSnapshot` listeners are still active and attached. Any Firestore event incoming for the previous user can invoke the listener and mutate the new user's state.
4. **Observation**: `resetInMemoryState()` (`app.js:670-695`) is only called in `handleLogout()` (`app.js:704, 721`), NOT during an account switch in `onAuthStateChanged`.
5. **Logic Step**: If `idbGet` fails or returns empty for a newly registered account, `State.chats` remains populated with the previous user's or guest's in-memory data. At line 360-363, `cloudLoad` checks `if (isNewAccount) cloudSave(true)`. The new account is immediately overwritten with the previous user's data.

### 2.4 Why Indicator Fails on Network Changes
1. **Observation**: `window.addEventListener('offline', ...)` is completely absent in `app.js`.
2. **Logic Step**: When the device loses connection, `#sync-indicator` continues displaying its previous status (e.g. `synced` with a green icon).
3. **Observation**: In `app.js:835`, the online listener is:
   `window.addEventListener('online', () => { if (!_fb) initAuth(); });`.
4. **Logic Step**: Once Firebase SDK is loaded, `!_fb` evaluates to false. When internet is restored after an outage, this callback does nothing: no `cloudLoad()` is called, no `triggerCloudSync()` is called, and `#sync-indicator` is not updated.

---

## 3. Caveats
1. **Firebase Security Rules**: We analyzed client-side Firestore synchronization. Server-side Firestore Security Rules (`firestore.rules`) were not examined as they reside in Firebase Console / remote infrastructure.
2. **Simulated Environment in Mocha**: In Node.js / Mocha, Firebase SDK and DOM APIs (`localStorage`, `IndexedDB`, `document`, `window`) are mocked. The real browser behavior depends on the fidelity of these mocks.
3. **IndexedDB Browser Quotas**: While IndexedDB quota is significantly larger than LocalStorage (typically 50MB+), some browsers (e.g., Safari Private Browsing) have unique storage limitations that require continuous graceful degradation.

---

## 4. Conclusion
The survey reveals four critical architectural vulnerabilities in Suna Chat's cloud sync and auth subsystem:
1. **Tombstone Resurrection Flaw**: The comparison `localDelTime >= c.updatedAt` in `mergeChats` and `delTime >= msg.updatedAt` fails under clock skew or initialization timestamp updates, causing deleted chats and messages to reappear. Quota recovery in `safeSaveLocalStorage` erroneously wipes `suna_deleted_chats`.
2. **Guest Identity Instability**: Timestamped guest UIDs (`guest-${Date.now()}`) cause catastrophic data loss on browser refresh. A persistent `suna_guest_uid` in `localStorage` is mandatory.
3. **Account Switching Cross-Contamination**: RAM is not reset before loading a new account, and `_syncUnsubscribes` is not torn down immediately upon UID change, risking data leakage into new accounts.
4. **Network & Indicator Desynchronization**: Missing `offline` event handling and stagnant `online` handler leave `#sync-indicator` out of sync with actual network status.

---

## 5. Verification Method & Test Suite Specification

### 5.1 Verification Commands
To verify the system independently:
```powershell
# 1. Verify JavaScript syntax integrity (must pass with 0 errors)
npm run check
# or directly:
node -c app.js && node -c redesign.js

# 2. Run the Mocha test suite (must pass 100% of all tests)
npm test

# 3. Run the complete integrity verification pipeline
python run_verification.py
```

### 5.2 Test Suite Specification: `tests/test_auth_and_account_sync.js`
A new dedicated adversarial test suite must be authored at `d:\Suna Chat\tests\test_auth_and_account_sync.js`.

#### Architecture & Structure
```javascript
const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Auth, Multi-Account Data Isolation & Resilient Cloud Sync Test Suite', () => {
  // Setup sandboxed VM environment with app.js
  ...
});
```

#### Test Matrix (6 Tiers)
1. **Tier 1: Multi-Account Storage Partitioning & Zero Contamination (R1)**
   - `test_user_isolation`: Saving chats as User A (`uid: 'user_A'`) stores them in `suna_chats_user_A`. Switching to User B (`uid: 'user_B'`) initializes a fresh state without User A's chats.
   - `test_new_account_clean_slate`: A brand new account (no local or cloud data) does not inherit residual chats, settings, or memory facts from a prior session.
2. **Tier 2: Guest Identity Persistence (R1)**
   - `test_guest_uid_persistence`: First launch as Guest generates and stores a persistent `suna_guest_uid` in `localStorage`.
   - `test_guest_f5_reload_preservation`: Subsequent `initAuth()` calls reuse `suna_guest_uid`. Chats created in Guest mode remain accessible after reload.
3. **Tier 3: Clean Account Switch Lifecycle (R1 & R2)**
   - `test_unsubscribes_torn_down_on_switch`: Switching user immediately invokes all callbacks in `_syncUnsubscribes` and resets the array to empty before loading new state.
   - `test_ram_state_reset_on_logout`: Logging out resets `State.chats`, `State.settings`, and `State.memory` to default empty values without polluting other accounts.
4. **Tier 4: Offline Session Resilience & Vòng Đời Auth State (R2)**
   - `test_offline_boot_retains_cached_user`: If internet is down during page load, cached user from `suna_cached_user` is preserved and user is not kicked to login screen.
   - `test_no_false_session_expired_toast`: An initial null state from Firebase SDK during offline boot does not trigger "Phiên đăng nhập đã hết hạn".
5. **Tier 5: 3-Way Merge & Resurrection Prevention (R3)**
   - `test_deleted_chat_does_not_resurrect_with_newer_remote_updatedAt`: Deleting a chat records a tombstone; `mergeChats` strictly respects the deletion even if a remote copy has a newer `updatedAt` (clock drift resilience).
   - `test_deleted_message_does_not_resurrect`: Deleting a message logs `deletedMessageIds`; `mergeChats` excludes the message even if remote message timestamp is newer.
   - `test_image_preservation_on_remote_merge`: If local message contains base64 image data and remote has `'__large_image__'`, local real image data is not overwritten with the placeholder.
6. **Tier 6: Sync Indicator States & Network Recovery (R3)**
   - `test_indicator_transitions`: Correct CSS classes (`syncing`, `synced`, `offline`, `error`) and titles for each state.
   - `test_offline_event_updates_indicator`: Triggering `window.dispatchEvent(new Event('offline'))` sets indicator to `offline`.
   - `test_online_event_triggers_sync`: Triggering `window.dispatchEvent(new Event('online'))` invokes `triggerCloudSync()` and resumes sync.

### 5.3 Invalidation Conditions
The findings of this report would be invalidated if:
- Suna Chat migrates to per-chat document storage in Firestore (subcollections) rather than a single `chats` document.
- Suna Chat removes Guest mode entirely, requiring authentication before accessing the application.
