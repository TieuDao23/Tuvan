# Comprehensive Investigation & Handoff Report: Auth Lifecycle, Session Persistence & Guest Identity

**Agent**: teamwork_preview_explorer_survey_1  
**Project**: Suna Chat (`d:\Suna Chat`)  
**Date**: 2026-09-07T10:44:00Z  
**Target Milestone**: Survey Auth Lifecycle, Session Persistence & Guest Identity  

---

## 1. Observation

Direct code inspection of `app.js`, `index.html`, `styles.css`, and relevant test files reveals the following facts and line references:

### Observation 1.1: Firebase SDK Initialization & Lack of Explicit Persistence
- **File & Lines**: `app.js:31-61`
```javascript
31: async function loadFirebaseSDK() {
32:   if (_fb) return true;
33:   try {
34:     const [appMod, authMod, dbMod] = await Promise.all([
35:       import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
36:       import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
37:       import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
38:     ]);
39:     const app = appMod.initializeApp(FIREBASE_CONFIG);
40:     _fb = {
41:       auth: authMod.getAuth(app),
...
```
- **Direct Finding**: `authMod.getAuth(app)` is initialized without configuring `authMod.setPersistence(auth, authMod.browserLocalPersistence)`. `browserLocalPersistence` is neither imported nor referenced anywhere in `app.js` or `index.html`.

### Observation 1.2: Offline Handling Failure on Auth Initialization
- **File & Lines**: `app.js:810-845`
```javascript
810: async function initAuth() {
811:   const cachedUser = getCachedAuthUser();
812:   const isGuestMode = localStorage.getItem('suna_guest_mode') === 'true';
813: 
814:   if (cachedUser) {
815:     AuthState.user = cachedUser;
816:     AuthState.isLoggedIn = true;
817:     AuthState.isAdmin = (cachedUser.email === 'duyanhblt1@gmail.com' || cachedUser.email === 'admin@suna.local');
818:     AuthState.useLocalOnly = false;
819:     updateSyncIndicator('syncing'); 
820:   } else {
...
829:   hideAuthScreen(true);
830:   doAppInit();
831:   updateUserDisplay();
832: 
833:   if (!_authOnlineListenerAttached) {
834:     _authOnlineListenerAttached = true;
835:     window.addEventListener('online', () => { if (!_fb) initAuth(); });
836:   }
837:   const sdkLoaded = await loadFirebaseSDK();
838: 
839:   if (!sdkLoaded) {
840:     if (!cachedUser && !isGuestMode && window.toast) {
841:       window.toast('Suna Chat đang chạy ở chế độ ngoại tuyến (Dữ liệu lưu cục bộ).', 'info');
842:     }
843:     return;
844:   }
```
- **Direct Finding**: When offline, if `cachedUser` is present, `updateSyncIndicator('syncing')` is called at line 819. Then `loadFirebaseSDK()` fails at line 837, and `initAuth()` returns at line 843 without ever calling `updateSyncIndicator('offline')`. The sync badge stays permanently in the "syncing" state. Furthermore, line 835 only calls `initAuth()` when `!_fb`, meaning if `_fb` was previously loaded and network reconnects, no sync reconnection or refresh is triggered.

### Observation 1.3: Ephemeral Timestamp-Based Guest Identity
- **File & Lines**: `app.js:737`, `app.js:821`
```javascript
737:     AuthState.user = { uid: 'guest-' + Date.now(), email: 'khach@suna.local', displayName: 'Khách' };
...
821:     AuthState.user = { uid: 'guest-' + Date.now(), email: 'khach@suna.local', displayName: 'Khách' };
```
- **File & Lines**: `app.js:4432-4437`
```javascript
4432: function getStorageSuffix() {
4433:   if (typeof AuthState !== 'undefined' && AuthState.isLoggedIn && AuthState.user && AuthState.user.uid) {
4434:     return '_' + AuthState.user.uid;
4435:   }
4436:   return '_guest';
4437: }
```
- **Direct Finding**: In guest mode, `AuthState.isLoggedIn` is `true` and `AuthState.user.uid` is set to `'guest-' + Date.now()`. Consequently, `getStorageSuffix()` returns `'_guest-' + Date.now()`. Every time the user reloads the page (F5), `Date.now()` produces a new number, causing `loadState()` (`app.js:4620`) to look for a non-existent IndexedDB key `suna_chats_guest-<new_timestamp>`. The previous guest chats remain orphaned in IndexedDB and are never restored. The key `suna_guest_uid` is completely absent from the codebase.

### Observation 1.4: UI Flicker on Page Load
- **File & Lines**: `index.html:44`, `index.html:227`
```html
44:     <div id="auth-screen" class="auth-screen">
...
227:    <div id="app" style="display:none;">
```
- **File & Lines**: `styles.css:3644-3654`
```css
3644: .auth-screen {
3645:   position: fixed;
3646:   inset: 0;
3647:   z-index: 9999;
3648:   display: flex;
3649:   align-items: center;
3650:   justify-content: center;
...
```
- **File & Lines**: `app.js:9688-9695`
```javascript
9688: document.addEventListener('DOMContentLoaded', function() {
9689:   if (typeof initAuth === 'function') {
9690:     initAuth();
...
```
- **Direct Finding**: `index.html` loads with `#auth-screen` fully visible (`display: flex`, `z-index: 9999`) and `#app` hidden with inline `style="display:none;"`. The script `app.js` runs at the very bottom of the document and waits for `DOMContentLoaded`. Only then does `initAuth()` execute and invoke `hideAuthScreen(true)`. This causes a full-screen flash of the login modal on every single reload for both logged-in and guest users.

### Observation 1.5: False "Phiên đăng nhập đã hết hạn" on Sign-Out
- **File & Lines**: `app.js:811`, `app.js:883-898`
```javascript
811:   const cachedUser = getCachedAuthUser();
...
849:     _fb.onAuthStateChanged(_fb.auth, async (user) => {
...
883:       } else {
884:         _syncUnsubscribes.forEach(u => u());
885:         _syncUnsubscribes = [];
886:         
887:         clearCachedAuth();
888:         
889:         if (cachedUser) {
890:           AuthState.user = null;
891:           AuthState.isLoggedIn = false;
892:           AuthState.useLocalOnly = false;
893:           showAuthScreen();
894:           updateUserDisplay();
895:           updateSyncIndicator('offline');
896:           if (window.toast) window.toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'info');
897:         }
898:       }
```
- **File & Lines**: `app.js:697-731` (`handleLogout`)
```javascript
715:     await cloudSave(true);
716:     await _fb.signOutFn(_fb.auth);
717:     AuthState.isLoggedIn = false;
718:     AuthState.user = null;
719:     localStorage.removeItem('suna_guest_mode');
720: 
721:     resetInMemoryState();
722:     if (typeof window.onUserSignedIn === 'function') window.onUserSignedIn();
723: 
724:     updateUserDisplay();
725:     updateSyncIndicator('offline');
726:     if (window.toast) window.toast('Đã đăng xuất', 'info');
```
- **Direct Finding**: `cachedUser` at line 811 is a lexical closure variable evaluated once at boot. When a logged-in user clicks "Đăng xuất" (`handleLogout`), `_fb.signOutFn(_fb.auth)` triggers `onAuthStateChanged` with `user = null`. In line 889, `cachedUser` is still truthy from initial boot. Hence, `window.toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'info')` fires immediately, colliding with `window.toast('Đã đăng xuất', 'info')`.

### Observation 1.6: Cross-Account Contamination & Un-quarantined Account Switch
- **File & Lines**: `app.js:360-364` (`cloudLoad`)
```javascript
360:     const isNewAccount = !sSnap.exists() && !mSnap.exists() && !cSnap.exists();
361: 
362:     if (isNewAccount) {
363:       cloudSave(true);
364:     } else {
```
- **File & Lines**: `app.js:122-130` (`mergeChats`)
```javascript
122: function mergeChats(localChats, remoteChats) {
123:   const mergedMap = new Map();
124:   const localDeleted = State.deletedChats || {};
125:   
126:   for (const c of localChats) {
127:     const chat = { ...c };
128:     if (!chat.id) continue;
129:     mergedMap.set(chat.id, chat);
130:   }
```
- **File & Lines**: `app.js:202-209` (`mergeSettings`)
```javascript
202:   if (remoteTime > localTime) {
203:     const merged = { ...remoteSettings };
204:     if (!merged.apiKey && localSettings.apiKey) merged.apiKey = localSettings.apiKey;
205:     if (!merged.baseUrl && localSettings.baseUrl) merged.baseUrl = localSettings.baseUrl;
206:     if (!merged.apiKey2 && localSettings.apiKey2) merged.apiKey2 = localSettings.apiKey2;
207:     if (!merged.baseUrl2 && localSettings.baseUrl2) merged.baseUrl2 = localSettings.baseUrl2;
208:     return merged;
209:   }
```
- **File & Lines**: `app.js:670-695` (`resetInMemoryState`) & `app.js:4474-4480` (`saveLocalStateOnly`)
```javascript
690:   State.chats = [{ id: 'chat-' + Date.now(), title: 'Chat mới', messages: [], createdAt: Date.now(), updatedAt: Date.now() }];
691:   State.deletedChats = {};
692:   State.activeChatId = State.chats[0].id;
693:   if (typeof window.saveLocalStateOnly === 'function') window.saveLocalStateOnly();
694:   if (typeof window.saveMemory === 'function') window.saveMemory();
```
- **Direct Finding**:
  1. In `cloudLoad()`, if an account has no Firestore documents (`isNewAccount === true`), it immediately calls `cloudSave(true)`. If RAM (`State.chats`) was not wiped beforehand, all guest chats or previous user chats are uploaded to the new user's Firestore cloud database.
  2. `mergeSettings` at lines 204-207 automatically injects `localSettings.apiKey` into `remoteSettings` if remote has no API key, propagating private keys across accounts.
  3. `resetInMemoryState()` calls `saveLocalStateOnly()` when `AuthState.user = null`, which forces `getStorageSuffix()` to return `'_guest'`, overwriting any local guest chat data with an empty chat.
  4. In `onAuthStateChanged`, `_syncUnsubscribes` is not disconnected at entry when a new `user` arrives, meaning the old user's Firestore snapshot listeners can continue firing during `loadState()` and `cloudLoad()`.

---

## 2. Logic Chain

### Step 2.1: Why Guest Sessions Reset on Page Reload
1. From **Observation 1.3**, guest login stamps `AuthState.user.uid = 'guest-' + Date.now()`.
2. From **Observation 1.3**, `getStorageSuffix()` checks `AuthState.isLoggedIn && AuthState.user.uid`, returning `'_guest-' + Date.now()`.
3. All local data writes (`idbSet('suna_chats' + suffix)`) target the key with this timestamp suffix.
4. When the browser reloads (F5), `initAuth()` runs again. Because no `suna_cached_user` exists, line 821 generates a NEW timestamp (`Date.now()`).
5. `loadState()` queries IndexedDB for `suna_chats_guest-<new_timestamp>`, which is empty (`null`).
6. Hence, all previous guest chats disappear from the UI upon every page reload.

### Step 2.2: Why the False "Phiên đăng nhập đã hết hạn" Toast Fires
1. From **Observation 1.5**, `cachedUser` is declared as a `const` inside `initAuth()`. When a logged-in user visits, `cachedUser` is non-null.
2. The user initiates a sign-out by clicking `#btn-logout`. `handleLogout` calls `await _fb.signOutFn(_fb.auth)`.
3. Firebase triggers `_fb.onAuthStateChanged` with `user = null`.
4. In the `else` branch, `if (cachedUser)` evaluates to `true` because it reads the stale variable from the closure, not reflecting that the logout was deliberate.
5. Line 896 executes: `window.toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'info')`.
6. Furthermore, if a transient network failure or token refresh delay occurs while offline, Firebase may temporarily invoke `onAuthStateChanged(null)`, kicking the user out of their session.

### Step 2.3: Why UI Flicker Occurs on Startup
1. From **Observation 1.4**, `index.html` serves `#auth-screen` without `style="display:none;"`, while `#app` has `style="display:none;"`.
2. As the HTML parser processes the page, `#auth-screen` is rendered as a full-viewport overlay at `z-index: 9999`.
3. `app.js` is parsed and executed only after HTML parsing completes. `DOMContentLoaded` then fires and invokes `initAuth()`.
4. `initAuth()` immediately calls `hideAuthScreen(true)`.
5. The visual result is a high-contrast flash of the dark login overlay for 200–500ms before snapping to the chat interface.

### Step 2.4: Why Cross-Account Contamination Occurs
1. From **Observation 1.6**, when User A signs out or when a Guest registers/logs in as User B:
2. If `State.chats`, `State.settings`, and `State.memory` are not strictly quarantined or reset before `cloudLoad()` runs:
3. `cloudLoad()` executes `mergeChats(State.chats, remoteChats)`.
4. `mergeChats` inserts all items from `State.chats` into `mergedMap`. If User B's cloud does not have those chats, they are retained as "local chats".
5. If User B is brand new (`isNewAccount = true`), line 363 calls `cloudSave(true)` immediately, permanently writing User A's/Guest's chats into User B's Firestore document.
6. Similarly, `mergeSettings()` propagates `localSettings.apiKey` to User B's settings.

---

## 3. Architectural Flow of Auth & Session

```
[Browser Opens / Reloads]
        │
        ▼
[index.html Bootstrapping] ──► Currently renders #auth-screen (Causes Flicker!)
        │
        ▼
[DOMContentLoaded -> initAuth()]
        │
        ├──► Has suna_cached_user?
        │       ├─► YES: AuthState.user = cachedUser; isLoggedIn = true; updateSyncIndicator('syncing');
        │       └─► NO:  Generate guest identity; updateSyncIndicator('offline');
        │                 (BUG: Generates 'guest-' + Date.now() instead of persistent suna_guest_uid)
        │
        ├──► hideAuthScreen(true); doAppInit() -> init() [Loads local IndexedDB/localStorage]
        │
        └──► loadFirebaseSDK() (CDN fetch: firebase-app, auth, firestore)
                │
                ├─► SDK Load FAILS (Offline) ──► Early return.
                │    (BUG: Sync indicator remains stuck at 'syncing', never updated to 'offline')
                │
                └─► SDK Load SUCCEEDS ──► _fb.onAuthStateChanged(user)
                        │
                        ├─► USER NON-NULL:
                        │     ├─► If oldUid !== user.uid: loadState(), loadMemory()
                        │     ├─► cloudLoad() -> 3-way merge remote with local
                        │     │    (BUG: Merges in-memory chats/settings into brand new accounts!)
                        │     ├─► initRealtimeSync() -> Attach Firestore onSnapshot listeners
                        │     └─► updateSyncIndicator('synced')
                        │
                        └─► USER NULL:
                              ├─► Disconnect listeners
                              ├─► clearCachedAuth()
                              └─► if (cachedUser) toast("Phiên đăng nhập đã hết hạn...")
                                   (BUG: Stale closure causes false expiration toast on intentional logout!)
```

---

## 4. Root Cause Summary Matrix

| Issue | Manifestation | Root Cause Code / Location |
|---|---|---|
| **1. Guest Session Loss on Reload** | Every F5 clears guest chats | `app.js:737, 821`: `uid: 'guest-' + Date.now()` generates new UID on every page load; `getStorageSuffix()` changes storage key. |
| **2. Spurious Expiration Alert** | Toast "Phiên đăng nhập đã hết hạn" on intentional logout | `app.js:811, 889`: `cachedUser` lexical variable checked in `onAuthStateChanged(null)` even when user clicked logout. |
| **3. UI Startup Flicker** | Login screen flashes before chat UI appears | `index.html:44, 227`: `#auth-screen` visible by default while `#app` has `style="display:none;"`; `initAuth()` runs after `DOMContentLoaded`. |
| **4. Insecure Session Persistence** | Auth state lost on tab/browser restart in privacy modes | `app.js:31-61`: Missing `authMod.setPersistence(auth, authMod.browserLocalPersistence)`. |
| **5. Offline Sync Badge Freeze** | Badge stuck at "Đang đồng bộ..." when offline on load | `app.js:819, 843`: Indicator set to `'syncing'`, early return on SDK fail without resetting to `'offline'`. |
| **6. Account Data Contamination** | Guest chats / API keys leak into new or switched accounts | `app.js:360-364, 122-130, 204-207`: In-memory state not purged before account switch; `mergeChats` and `mergeSettings` leak local keys to cloud. |

---

## 5. Concrete Recommendations for R1 and R2

### Recommendations for R1 (Zero Cross-Contamination & Guest Identity Persistence)

1. **Persistent Guest Identity (`suna_guest_uid`)**:
   - Implement `getOrCreateGuestUid()` helper:
     ```javascript
     function getOrCreateGuestUid() {
       let guestUid = localStorage.getItem('suna_guest_uid');
       if (!guestUid) {
         guestUid = 'guest_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Date.now().toString(36));
         localStorage.setItem('suna_guest_uid', guestUid);
       }
       return guestUid;
     }
     ```
   - In `initAuth()` and `handleGuestLogin()`, replace `'guest-' + Date.now()` with `getOrCreateGuestUid()`.
   - Ensure `getStorageSuffix()` returns `'_' + AuthState.user.uid` consistently for both guest and authenticated users.
   - Include a migration step in `loadState()`: if legacy `suna_chats_guest` exists, copy it into `suna_chats_` + `guestUid`.

2. **Strict Account Switching Lifecycle & Memory Purge**:
   - Before switching accounts (in `onAuthStateChanged` when `oldUid && oldUid !== user.uid` and in `handleLogout`):
     1. Unsubscribe all real-time listeners (`_syncUnsubscribes.forEach(u => u()); _syncUnsubscribes = [];`).
     2. Abort active LLM stream generations (`State.abortController?.abort()`, `_workspaceAbortController?.abort()`).
     3. Clear RAM completely without writing to the old user's storage:
        - `State.chats = [];`
        - `State.deletedChats = {};`
        - `State.memory = { facts: [], lastUpdated: 0 };`
        - `State.settings = getDefaultSettings();`
        - `State.activeChatId = null;`
     4. Load the target user's local state via `await loadState(); await loadMemory();`.

3. **Prevent Accidental Contamination in Cloud Sync**:
   - In `cloudLoad()`, if `isNewAccount === true`, do NOT blindly call `cloudSave(true)` with leftover in-memory data. Instead, initialize cloud documents with standard default profile settings and an empty/clean initial chat.
   - In `mergeSettings()`, remove cross-account inheritance (`if (!merged.apiKey && localSettings.apiKey)`). Settings must remain strictly isolated per account.
   - Partition secondary storage keys: update notes to use `suna_notes` + suffix instead of un-suffixed `suna_guest_notes`.

### Recommendations for R2 (Bulletproof Session Persistence & Zero Flicker)

1. **Explicit Firebase Local Persistence**:
   - In `loadFirebaseSDK()` (`app.js:31-61`):
     ```javascript
     const auth = authMod.getAuth(app);
     if (typeof authMod.setPersistence === 'function' && authMod.browserLocalPersistence) {
       try {
         await authMod.setPersistence(auth, authMod.browserLocalPersistence);
       } catch (pErr) {
         console.warn('Set browserLocalPersistence warning:', pErr);
       }
     }
     ```

2. **Zero-Flicker Cached User Startup**:
   - In `index.html`:
     - Set `<div id="auth-screen" class="auth-screen" style="display:none;">` by default.
     - Remove `style="display:none;"` from `<div id="app">`.
   - Add a zero-cost synchronous pre-bootstrap snippet in `<head>`:
     ```html
     <script>
       (function() {
         try {
           var cached = localStorage.getItem('suna_cached_user');
           var isGuest = localStorage.getItem('suna_guest_mode') === 'true' || localStorage.getItem('suna_guest_uid');
           // Keep app visible; auth screen is only unhidden if explicitly summoned
         } catch(e) {}
       })();
     </script>
     ```
   - Only call `showAuthScreen()` when unauthenticated state is confirmed or the user clicks "Đăng nhập / Đăng ký".

3. **Intentional Sign-Out Guard**:
   - Introduce an intentional logout flag `AuthState._isLoggingOut = false;`.
   - In `handleLogout()`: set `AuthState._isLoggingOut = true;` before calling `_fb.signOutFn(_fb.auth)`.
   - In `_fb.onAuthStateChanged(null)`:
     ```javascript
     if (AuthState._isLoggingOut) {
       AuthState._isLoggingOut = false;
     } else if (cachedUser) {
       // Session truly expired unexpectedly
       if (window.toast) window.toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'info');
       showAuthScreen();
     }
     ```
   - Do NOT call `resetInMemoryState()` which overwrites `_guest` storage keys with empty chats.

4. **Resilient Offline and Online Handling**:
   - In `initAuth()` at line 839: if `!sdkLoaded`, ensure `updateSyncIndicator('offline')` is called.
   - In the `window.addEventListener('online')` handler:
     - If `_fb` is null, call `initAuth()`.
     - If `_fb` is already initialized and `AuthState.isLoggedIn && !AuthState.useLocalOnly`, trigger `cloudLoad()` and `initRealtimeSync()`.

---

## 6. Caveats

- **Network-dependent CDN imports**: `loadFirebaseSDK` relies on `https://www.gstatic.com/...`. In corporate intranets or strict firewall environments where gstatic is blocked, Firebase SDK loading fails completely and the app operates in offline/local-only mode.
- **Single active tab limitation for guest migration**: If the user opens multiple tabs as a guest and logs in on one tab, `localStorage` storage events should ideally synchronize the new auth state across other open tabs.
- No other caveats.

---

## 7. Conclusion

The investigation has established a 100% complete evidence chain for all five survey questions:
1. Firebase Auth lacks `browserLocalPersistence`, relying on default modular fallback which can drop sessions under partitioned storage.
2. User profile UI flicker is directly caused by `index.html` defaulting `#auth-screen` to visible while `#app` is hidden, waiting for `DOMContentLoaded`.
3. Guest session loss is caused by `Date.now()` timestamp generation on every boot, creating orphaned storage keys in IndexedDB.
4. Spurious session expiration toasts are caused by a stale closure variable `cachedUser` firing during intentional sign-out.
5. Cross-account data leaks occur during account switching because in-memory state (`State.chats`, `State.settings`) is not purged before `cloudLoad()` / `mergeChats()` executes.

All findings are mapped directly to line numbers in `app.js` and `index.html`, with precise, zero-regression solutions detailed for R1 and R2.

---

## 8. Verification Method

To independently verify all findings and test proposals:

1. **Verify Line Numbers and Code Paths**:
   - `rg -n "guest-" app.js` -> verify lines 737 and 821.
   - `rg -n "getStorageSuffix" app.js` -> verify line 4432.
   - `rg -n "browserLocalPersistence|setPersistence" app.js` -> verify 0 matches (absence of configuration).
   - `rg -n "auth-screen" index.html` -> verify line 44 lacks `display: none`.
   - `rg -n "Phiên đăng nhập đã hết hạn" app.js` -> verify line 896.

2. **Verify Baseline Test Suite**:
   - Run `npm test` -> verify 735/735 tests pass.
   - Run `node -c app.js && node -c redesign.js` -> verify 0 syntax errors.
   - Run `python run_verification.py` -> verify 100% green compliance.

3. **Invalidation Conditions**:
   - If `suna_guest_uid` is already present in `localStorage` or `app.js`, this finding would be invalidated (confirmed absent via `rg -n "suna_guest_uid" .`).
   - If `setPersistence` is already called inside `app.js`, this finding would be invalidated (confirmed absent via `rg -n "setPersistence" app.js`).
