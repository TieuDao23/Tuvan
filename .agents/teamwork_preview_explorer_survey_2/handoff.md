# Comprehensive Survey Report: Storage Subsystems & Multi-Account Data Isolation in Suna Chat

**Agent Identity**: `teamwork_preview_explorer_survey_2`  
**Working Directory**: `d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2`  
**Target Codebase**: `d:\Suna Chat` (`app.js`, `redesign.js`, `mindmap.html`, `index.html`)  
**Mission Date**: 2026-09-07  

---

## 1. Observation

### 1.1 IndexedDB Architecture & Usage (`SunaChatDB`)
- **Location**: `app.js` lines 4388–4426
- **Database Specifications**:
  - `DB_NAME = 'SunaChatDB'` (line 4388)
  - `STORE_NAME = 'suna_store'` (line 4389)
  - Database version: `1` (line 4395: `indexedDB.open(DB_NAME, 1)`)
  - Object Store Creation: A single out-of-line object store `suna_store` without keyPath or autoIncrement (lines 4396–4398: `e.target.result.createObjectStore(STORE_NAME)`).
- **CRUD Operations**:
  - `idbSet(key, val)`: Puts value into `suna_store` using out-of-line key (lines 4404–4414).
  - `idbGet(key)`: Retrieves value by key (lines 4416–4426).
- **Keys Stored in IndexedDB**:
  - `'suna_chats' + suffix` (lines 4476, 4501, 4617, 4620): Holds the full chat history array `State.chats`.
  - `'suna_memory' + suffix` (lines 4237, 4247): Holds the AI memory object `State.memory = { facts: [...], lastUpdated }`.
- **Partitioning Function**:
  ```javascript
  // app.js lines 4432-4437
  function getStorageSuffix() {
    if (typeof AuthState !== 'undefined' && AuthState.isLoggedIn && AuthState.user && AuthState.user.uid) {
      return '_' + AuthState.user.uid;
    }
    return '_guest';
  }
  ```
- **Observed Defect in IndexedDB Partitioning for Guests**:
  - In `handleGuestLogin` (line 737):
    `AuthState.user = { uid: 'guest-' + Date.now(), email: 'khach@suna.local', displayName: 'Khách' };`
  - In `initAuth` fallback (line 821):
    `AuthState.user = { uid: 'guest-' + Date.now(), email: 'khach@suna.local', displayName: 'Khách' };`
  - Because `AuthState.user.uid` contains a millisecond timestamp that is newly generated on every page refresh or guest login, `getStorageSuffix()` returns `_guest-<new_timestamp>` every time the page reloads.
  - When `loadState()` calls `idbGet('suna_chats' + suffix)` at line 4620, the key `suna_chats_guest-<new_timestamp>` does NOT exist in IndexedDB.
  - Consequently, guest conversations are permanently orphaned in IndexedDB and the user's chat history is wiped clean on every page reload (F5).

---

### 1.2 Exhaustive Inventory of localStorage & sessionStorage Keys
Scanning the entire codebase (`app.js`, `redesign.js`, `index.html`, `mindmap.html`) revealed the following storage keys and call sites:

| Key Expression | Storage Tier | File & Line Number | Exact Code Line | Suffix Scoped? | Cross-Account Leak Risk |
|---|---|---|---|---|---|
| `'suna_cached_user'` | localStorage | `app.js`: 66, 75, 81 | `localStorage.setItem('suna_cached_user', ...)` | ❌ Global | High: Contains previous user's profile; causes false "session expired" alerts if stale. |
| `'suna_guest_mode'` | localStorage | `app.js`: 703, 719, 742, 812, 825, 856 | `localStorage.setItem('suna_guest_mode', 'true')` | ❌ Global | High: Unscoped boolean flag; lacks permanent guest identity linkage. |
| `'suna_guest_notes'` | localStorage | `app.js`: 3227, 3229, 4455 | `localStorage.getItem('suna_guest_notes')` | ❌ Global | High: Shared notes pool across all guests and offline sessions; leaks user notes. |
| `'suna_chats'` | localStorage | `app.js`: 4454, 4508, 4614, 4618 | `const legacyChatsStr = localStorage.getItem('suna_chats')` | ❌ Global | Critical: In `loadState()`, whichever user logs in first permanently claims and ingests these chats into their own account. |
| `'suna_mode'` | localStorage | `app.js`: 4478, 4491, 4608 | `safeSaveLocalStorage('suna_mode', State.mode)` | ❌ Global | Medium: Mode setting ('flash' vs 'pro') leaks across users on the same machine. |
| `'suna_last_active_time'` | localStorage | `app.js`: 4600, 4640 | `localStorage.setItem('suna_last_active_time', Date.now().toString())` | ❌ Global | Medium: Idle timeout calculation leaks across different accounts. |
| `'suna_active_mindmap_data'` | localStorage | `app.js`: 9737; `mindmap.html`: 1099, 1102 | `localStorage.setItem('suna_active_mindmap_data', markdownText)` | ❌ Global | Medium: Transient buffer can leak diagram markdown if account is switched with mindmap pending. |
| `'suna_chat_scroll_map'` | sessionStorage | `app.js`: 4575, 4582, 4589 | `sessionStorage.getItem('suna_chat_scroll_map')` | ❌ Global | Low: Scroll position map leaks across accounts in the same browser tab session. |
| `'suna_settings' + suffix` | localStorage | `app.js`: 4477, 4490, 4607, 9372, 9410, 9455, 9531, 9561 | `safeSaveLocalStorage('suna_settings' + suffix, State.settings)` | ✅ Suffixed | Safe for authenticated users; broken for guests due to unstable timestamp suffix. |
| `'suna_deleted_chats' + suffix` | localStorage | `app.js`: 4457, 4479, 4492, 4510, 4609 | `safeSaveLocalStorage('suna_deleted_chats' + suffix, ...)` | ✅ Suffixed | Safe for authenticated users; wiped to `{}` during quota errors, causing resurrection. |
| `'suna_active_chat_id' + suffix` | localStorage | `app.js`: 4639, 4661, 4813, 4916, 4935, 8822 | `localStorage.setItem('suna_active_chat_id' + suffix, ...)` | ✅ Suffixed | Safe for authenticated users; broken for guests due to unstable timestamp suffix. |
| `'suna_guest_uid'` | localStorage | **MISSING** | Required by R1 for persistent guest identity | ❌ Not implemented | Causes guest history loss on every reload. |

---

### 1.3 In-Memory Cache in RAM (`State.*` & Module Scope Globals)
- **Location**: `app.js` lines 4185–4221
- **State Inventory**:
  1. `State.chats`: Active chat list `[{ id, title, messages, createdAt, updatedAt, deletedMessageIds }]`
  2. `State.deletedChats`: Map of deleted chat IDs to timestamps `{ [chatId]: timestamp }`
  3. `State.activeChatId`: String ID of current chat
  4. `State.mode`: Active generation mode (`'flash'` / `'pro'`)
  5. `State.models`: Cached model list
  6. `State.pendingDeleteId`: Chat ID awaiting modal confirmation
  7. `State.settings`: API credentials, endpoints, prompt, user preferences
  8. `State.pendingImages` & `State.pendingFiles`: Staged attachments
  9. `State.modelProxyMap`: Model proxy cache
  10. `State.isGenerating`: Active streaming flag
  11. `State.abortController`: Stream abort controller
  12. `State.generatingChatId`: ID of chat currently receiving stream
  13. `State.memory`: AI facts memory `{ facts: [...], lastUpdated }`
  14. `State.folders`: Array of chat folders
  15. `State.activeFolder`: Active folder filter
  16. `State.workspaceDeviceMode`: Viewport mode for live workspace
  17. `State.workspaceConsoleLogs`: Workspace logs array
  18. `State.vfs`: DeepSeek Harness virtual filesystem files `{ [path]: content }` (line 4216)
  19. `State.agentRecursionDepth`: DSH ReAct loop counter (line 4217)
  20. `State.toolFailures`: Map of tool failure records (line 4218)
  21. `State.workspaceMessages`: Workspace assistant conversation history (lines 1736, 1822, 1911, 2133, 2240)
- **Module Globals Outside `State`**:
  - `_syncUnsubscribes`: Array of active Firestore snapshot unsubscribe listeners (lines 410, 415, 712, 884).
  - `_saveTimeout`: Debounce timer for `saveState()` (line 4473).
  - `AuthState.syncDebounceTimer`: Debounce timer for `cloudSave()` (line 248).
  - `_workspaceAbortController`: AbortController for live workspace LLM requests (lines 678, 680).
  - `_appInited`: Boolean guard preventing re-initialization (line 797).

---

### 1.4 The Account Switch Lifecycles
We traced the three primary transitions through the codebase:

#### Lifecycle 1: Guest -> User A (Sign In / Register)
1. User starts as Guest: `AuthState.user.uid = 'guest-' + Date.now()` (line 821). Chats are stored in RAM `State.chats` and IndexedDB under `suna_chats_guest-<timestamp>`.
2. User clicks Login/Register or Google Login (`handleLogin` line 620, `handleRegister` line 596, `handleGoogleLogin` line 638).
3. `_fb.onAuthStateChanged` fires (line 849) with `user = User A`.
4. Line 851: `const oldUid = AuthState.user ? AuthState.user.uid : null;` (`oldUid` = `'guest-...'`).
5. Line 863: `if (oldUid !== user.uid) { await loadState(); await loadMemory(); }`.
6. **Critical Failure**: In `loadState()` (line 4620), `idbGet('suna_chats_' + userA.uid)` is called. If User A is a new account, this returns `null`. Line 4622 sets `State.chats = []`. Then lines 4648–4658 add a dummy `Chat mới`.
7. Line 867 calls `await cloudLoad()`. In `cloudLoad()` (line 360):
   ```javascript
   const isNewAccount = !sSnap.exists() && !mSnap.exists() && !cSnap.exists();
   if (isNewAccount) {
     cloudSave(true);
   }
   ```
8. Because `cloudSave(true)` immediately saves `State.chats` to Firestore, whatever is in `State.chats` gets permanently committed.
9. **Leakage vector**: Notice that `_syncUnsubscribes` are NOT unsubscribed before `loadState()` and `cloudLoad()` at lines 864–867; `initRealtimeSync()` is only called later at line 873. If real-time updates were active, they could inject data asynchronously during the load sequence.
10. Furthermore, `State.vfs`, `State.workspaceMessages`, and `State.workspaceConsoleLogs` are NOT cleared in `loadState()`. If the guest created files in the virtual filesystem, User A inherits them.

#### Lifecycle 2: User A -> User B (Direct Switch or Re-auth)
1. User A is active. Real-time listeners `_syncUnsubscribes` are actively listening to:
   - `users/userA_uid/data/chats` (line 419)
   - `users/userA_uid/data/memory` (line 456)
   - `users/userA_uid/data/settings` (line 471)
2. User authenticates as User B.
3. `_fb.onAuthStateChanged` fires with `user = User B`.
4. **Catastrophic Race Condition**: `oldUid !== user.uid` triggers `await loadState()`, `await loadMemory()`, and `await cloudLoad()`.
5. During these asynchronous operations, **the Firestore listeners for User A are STILL RUNNING** because `_syncUnsubscribes` has not been cleared (it is only cleared inside `initRealtimeSync()` at line 415, which is called at line 873 AFTER `cloudLoad()`).
6. If an update event fires from User A's Firestore document during this window:
   - Line 437: `const mergedChats = mergeChats(State.chats, cc);`
   - Line 440: `State.chats = mergedChats;`
   - User A's chats are merged directly into User B's `State.chats`!
7. When `cloudLoad()` or `cloudSave()` runs for User B, User A's merged chats are committed to User B's Firestore database. **This is direct cross-account contamination.**

#### Lifecycle 3: User B -> Sign out (Guest)
1. User clicks "Đăng xuất" (`handleLogout()`, lines 697–731).
2. Line 715: `await cloudSave(true)`.
3. Line 716: `await _fb.signOutFn(_fb.auth)`.
4. Lines 717–718: `AuthState.isLoggedIn = false; AuthState.user = null;`.
5. Line 721 calls `resetInMemoryState()`:
   ```javascript
   // app.js lines 670-695
   function resetInMemoryState() {
     ...
     State.settings = { ... };
     State.memory = { facts: [], lastUpdated: 0 };
     State.chats = [{ id: 'chat-' + Date.now(), title: 'Chat mới', ... }];
     State.deletedChats = {};
     State.activeChatId = State.chats[0].id;
     if (typeof window.saveLocalStateOnly === 'function') window.saveLocalStateOnly();
     if (typeof window.saveMemory === 'function') window.saveMemory();
   }
   ```
6. **Destructive Overwrite Bug**: At line 718, `AuthState.user` was set to `null`. Therefore, `getStorageSuffix()` returns `'_guest'`.
7. Lines 693–694 call `saveLocalStateOnly()` and `saveMemory()`, which immediately write the blank dummy chat and default settings to `suna_chats_guest`, `suna_settings_guest`, and `suna_memory_guest`!
8. Any previous guest conversation or configuration stored under `_guest` is permanently destroyed by the sign-out process.
9. **False Session Expired Alarm**:
   When `_fb.signOutFn` is called at line 716, Firebase triggers `_fb.onAuthStateChanged` with `user = null`.
   In `onAuthStateChanged` (lines 889–897):
   ```javascript
   if (cachedUser) {
     ...
     if (window.toast) window.toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'info');
   }
   ```
   Because `cachedUser` was captured as a `const` from page load, every single time a user deliberately logs out, this alarm toast fires falsely.

---

## 2. Logic Chain

### 2.1 Why Guest History Disappears on Every Reload (F5)
1. *Observation 1.1*: Lines 737 and 821 generate `uid: 'guest-' + Date.now()`.
2. *Observation 1.1*: Line 4434 returns `'_' + AuthState.user.uid` when `AuthState.user` has a `uid`.
3. *Logic Step*: On initial load, guest has suffix `_guest-1725700000000`. Chats are saved under key `suna_chats_guest-1725700000000` in IndexedDB.
4. *Logic Step*: Upon page reload (F5), `initAuth()` runs (line 821) and generates a new timestamp `_guest-1725700050000`.
5. *Logic Step*: `loadState()` queries `suna_chats_guest-1725700050000` via `idbGet`. The key does not exist.
6. *Deduction*: Guest chat history is never retrieved; it remains orphaned forever in `suna_store`. The user observes total loss of chat history on reload.

### 2.2 Why Accidental Data Merging Occurs Between Accounts
1. *Observation 1.4*: In `onAuthStateChanged`, `oldUid !== user.uid` triggers `await loadState()`, `await loadMemory()`, and `await cloudLoad()`.
2. *Observation 1.4*: Active Firestore realtime listeners (`_syncUnsubscribes`) for the old user are not detached until line 873 (`initRealtimeSync()`), which is called *after* `cloudLoad()`.
3. *Observation 1.3*: `State.vfs`, `State.workspaceMessages`, and `State.workspaceConsoleLogs` are never cleared during account switch.
4. *Observation 1.2*: In `mergeChats()` (line 122), local `State.chats` is merged with remote chats `cc`.
5. *Logic Step*: If `State.chats` contains leftover chats from a previous session (or if an old Firestore snapshot callback fires while loading), `mergeChats` combines both datasets.
6. *Logic Step*: `cloudLoad()` or subsequent `cloudSave()` writes `mergedChats` back to Firestore under the new user's document path `users/{newUserUid}/data/chats`.
7. *Deduction*: User A's chats become permanently integrated into User B's account.

### 2.3 Why Storage Quota Errors Trigger Message Resurrection
1. *Observation 1.1 & 1.2*: In `safeSaveLocalStorage()` (lines 4457, 4510):
   ```javascript
   localStorage.setItem('suna_deleted_chats' + suffix, '{}');
   ```
2. *Logic Step*: When localStorage encounters a `QuotaExceededError`, it wipes the tombstone map `suna_deleted_chats` to `{}` to free up space.
3. *Logic Step*: On the next cloud sync (`cloudSave` line 326), `deletedChats: JSON.stringify(State.deletedChats || {})` is sent to Firestore.
4. *Logic Step*: When another device syncs via `cloudLoad()`, it no longer finds the deletion timestamps.
5. *Deduction*: Messages and chats previously deleted on device A are treated as active messages and resurrect on all devices.

---

## 3. Caveats

1. **Firebase Authentication Persistence Mode**:
   Firebase modular SDK (`@firebase/auth`) defaults to `indexedDBLocalPersistence` if supported by the browser environment, with a fallback to `browserLocalPersistence`. However, in `app.js`, persistence is never explicitly configured using `setPersistence(auth, browserLocalPersistence)`. When network drops or during offline initialization, `onAuthStateChanged` may momentarily pass `null`, triggering the false "session expired" eviction if not properly guarded.
2. **Mindmap Shared Buffer**:
   `suna_active_mindmap_data` is used as a transient inter-window communication buffer between `app.js` and `mindmap.html`. If a user opens the mindmap modal/window, switches accounts, and the mindmap iframe finishes loading, it will load the previously staged diagram. This key should either be cleared immediately on account switch or passed via postMessage / URL hash.
3. **No Code Modification Constraint**:
   In strict adherence to the Explorer archetype guidelines, this investigation is 100% read-only. No application source code was modified during this survey.

---

## 4. Conclusion & Concrete Recommendations for R1

### 4.1 Root Causes Summary Table

| Root Cause ID | Fault Mechanism | Affected Files & Lines | Consequence |
|---|---|---|---|
| **RC-1** | Ephemeral Guest UID via `guest-${Date.now()}` | `app.js`: 737, 821 | Guest chat history wiped on every reload (F5). |
| **RC-2** | Realtime listener lingering across account switch | `app.js`: 410–454, 849–874 | Firestore snapshots for old user fire into new user's `State.chats`, permanently merging accounts. |
| **RC-3** | In-memory RAM reset writes dummy data to disk | `app.js`: 670–695 | Logging out destroys persistent guest storage (`suna_chats_guest`). |
| **RC-4** | Un-suffixed legacy and global localStorage keys | `app.js`: 4478, 4600, 3227, 4614 | Mode, notes, idle time, and legacy chats bleed between users. |
| **RC-5** | Incomplete RAM purge on user switch | `app.js`: 670–695, 4604–4636 | `State.vfs`, `workspaceMessages`, and pending uploads leak to the next user. |
| **RC-6** | In-flight AI streams continue during account switch | `app.js`: 849–882 | Streaming tokens append to whatever chat is active in the new user session. |
| **RC-7** | False "Session Expired" alert on explicit logout | `app.js`: 889–897 | Alarmist toast shown on every deliberate user sign-out. |
| **RC-8** | Network offline/online events do not update sync indicator | `app.js`: 8797–8798 | UI `#sync-indicator` stays stuck on stale state when connection drops. |

---

### 4.2 Architecture Blueprint for R1

#### A. Persistent Guest Identity Engine (`suna_guest_uid`)
Replace dynamic timestamp generation with a deterministic, persistent guest UID:
```javascript
function getOrCreateGuestUid() {
  let guestUid = localStorage.getItem('suna_guest_uid');
  if (!guestUid || !guestUid.startsWith('guest_')) {
    guestUid = 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    localStorage.setItem('suna_guest_uid', guestUid);
  }
  return guestUid;
}

function getStorageSuffix() {
  if (typeof AuthState !== 'undefined' && AuthState.isLoggedIn && AuthState.user && AuthState.user.uid) {
    return '_' + AuthState.user.uid;
  }
  return '_' + getOrCreateGuestUid();
}
```

#### B. Complete Storage Key Partitioning Table
Every persistent key must include `getStorageSuffix()`:
- **IndexedDB**:
  - `suna_chats${suffix}`
  - `suna_memory${suffix}`
- **localStorage**:
  - `suna_settings${suffix}`
  - `suna_deleted_chats${suffix}`
  - `suna_active_chat_id${suffix}`
  - `suna_mode${suffix}` (partitioned!)
  - `suna_last_active_time${suffix}` (partitioned!)
  - `suna_notes${suffix}` (partitioned!)
- **sessionStorage**:
  - `suna_chat_scroll_map${suffix}` (partitioned!)
- **Un-suffixed Global Keys (strictly restricted to singletons)**:
  - `suna_guest_uid`: Persistent machine-level guest identity.
  - `suna_cached_user`: Zero-flicker startup profile cache.
  - `suna_guest_mode`: Flag indicating whether guest session is active.

#### C. Pure In-Memory RAM Scrubbing (`clearInMemoryState`)
Decouple memory clearing from storage writes. `clearInMemoryState()` must be pure:
```javascript
function clearInMemoryState() {
  // 1. Abort in-flight requests immediately
  if (State.abortController) {
    try { State.abortController.abort(); } catch (_) {}
    State.abortController = null;
  }
  State.isGenerating = false;
  State.generatingChatId = null;
  if (typeof _workspaceAbortController !== 'undefined' && _workspaceAbortController) {
    try { _workspaceAbortController.abort(); } catch (_) {}
    _workspaceAbortController = null;
  }

  // 2. Clear chat, settings, and memory in RAM
  State.chats = [];
  State.deletedChats = {};
  State.activeChatId = null;
  State.settings = {
    baseUrl: '', apiKey: '', baseUrl2: '', apiKey2: '', corsProxy: '',
    currentModel: '', flashModel: '', proModel: '',
    systemPrompt: '', userPurpose: '', tone: 'friendly', theme: 'aurora',
    customPersonality: '', fontFamily: "'Inter', sans-serif", fontSize: 15,
    userName: 'Bạn', userAvatar: ''
  };
  State.memory = { facts: [], lastUpdated: 0 };

  // 3. Clear workspace & harness state in RAM
  State.vfs = {};
  State.workspaceMessages = [];
  State.workspaceConsoleLogs = [];
  State.pendingImages = [];
  State.pendingFiles = [];
  State.toolFailures = new Map();
  State.agentRecursionDepth = 0;
  State.activeFolder = 'Tất cả';

  // 4. CRITICAL: DO NOT call saveLocalStateOnly() or saveMemory() here!
}
```

#### D. Clean Account Switch Lifecycle Protocol
Implement the following deterministic order of operations whenever user changes:
1. **Unsubscribe Realtime Listeners**: Call `_syncUnsubscribes.forEach(u => u()); _syncUnsubscribes = [];` BEFORE loading any data.
2. **Clear Debounce Timers**: Cancel `_saveTimeout` and `AuthState.syncDebounceTimer` to prevent stale scheduled writes from firing.
3. **Scrub RAM**: Call `clearInMemoryState()`.
4. **Update AuthState**: Set `AuthState.user = newUser`, `AuthState.isLoggedIn = true`, `AuthState.useLocalOnly = false`.
5. **Load Local State**: Await `loadState()` and `loadMemory()` using the new account's suffix.
6. **Cloud Load**: Await `cloudLoad()`. If new account, ensure clean default chat is initialized before `cloudSave(true)`.
7. **Attach Realtime Listeners**: Call `initRealtimeSync()`.
8. **Render UI**: Trigger full DOM refresh (`renderChatList()`, `renderMessages()`, `updateUserDisplay()`, `applyTheme()`, `updateSyncIndicator('synced')`).

#### E. Graceful Sign-Out Protocol
1. Set flag `_isExplicitSignOut = true`.
2. Clear debounce timers and abort any active generations.
3. Commit pending changes for the leaving account: `await cloudSave(true)`.
4. Unsubscribe all Firestore listeners: `_syncUnsubscribes.forEach(u => u()); _syncUnsubscribes = [];`.
5. Remove auth cache: `clearCachedAuth()`.
6. Call `await _fb.signOutFn(_fb.auth)`.
7. Update AuthState: `AuthState.user = null; AuthState.isLoggedIn = false; AuthState.useLocalOnly = false;`.
8. Call `clearInMemoryState()`.
9. Show Auth Screen: `showAuthScreen()`.
10. In `onAuthStateChanged`, check `if (_isExplicitSignOut) { _isExplicitSignOut = false; return; }` to suppress the "Phiên đăng nhập đã hết hạn" toast.

#### F. Resilient Network & Indicator Sync
Update network listeners:
```javascript
window.addEventListener('offline', () => {
  updateSyncIndicator('offline');
  if (window.toast) toast('Mất kết nối mạng. Suna Chat đang hoạt động ngoại tuyến!', 'error');
});
window.addEventListener('online', () => {
  updateSyncIndicator('syncing');
  if (window.toast) toast('Đã khôi phục kết nối mạng. Đang đồng bộ...', 'success');
  if (AuthState.isLoggedIn && !AuthState.useLocalOnly) {
    cloudLoad().then(() => {
      initRealtimeSync();
      updateSyncIndicator('synced');
    }).catch(() => updateSyncIndicator('error'));
  }
});
```

---

## 5. Verification Method

### 5.1 Static Verification Commands
Run syntax and integrity checks:
```bash
node -c app.js
node -c redesign.js
npm test
python run_verification.py
```

### 5.2 Unit & Adversarial Test Design for R4
Implement automated test suite in `tests/test_auth_and_account_sync.js` covering:
1. **Persistent Guest Identity**:
   - Verify `getOrCreateGuestUid()` generates a stable ID starting with `guest_`.
   - Verify subsequent calls return the exact same ID.
   - Verify `getStorageSuffix()` returns `'_' + guestUid` when not logged in or in guest mode.
   - Verify IndexedDB lookup succeeds with the same suffix after simulated reload.
2. **Account Switch Data Isolation (A -> B)**:
   - Create User A -> Add 3 chats -> Simulate switch to User B.
   - Assert `State.chats` does NOT contain User A's chats.
   - Assert `State.vfs` does NOT contain User A's files.
   - Assert `_syncUnsubscribes` was executed.
3. **Guest -> User A Registration Isolation**:
   - Create guest chat -> Register brand-new User A.
   - Assert brand-new User A starts with 1 clean default chat and does NOT inherit guest chats.
   - Assert guest chats remain intact in `suna_chats_guest_<id>`.
4. **Sign-Out Cleanliness**:
   - Log in User A -> Call `handleLogout()`.
   - Assert `_isExplicitSignOut` prevents "session expired" warning.
   - Assert `State.chats` is clean.
   - Assert `suna_chats_guest` was NOT overwritten with empty dummy data.
5. **Storage Suffix Completeness**:
   - Inspect all keys generated in localStorage and IndexedDB during user sessions.
   - Assert no un-suffixed keys (`suna_mode`, `suna_last_active_time`, `suna_guest_notes`) are created without suffix.

### 5.3 Invalidation Conditions
- Any occurrence of `Date.now()` inside guest UID generation.
- Any call to `saveLocalStateOnly()` or `saveMemory()` inside in-memory state reset routines.
- Any un-suffixed `localStorage.setItem` call for user-specific state.
- Real-time listeners remaining active during the transition window of `onAuthStateChanged`.
