## 2026-09-07T10:46:00Z

You are a versatile Senior Implementation Worker for Suna Chat.
Your Identity: teamwork_preview_worker_1
Your Assigned Working Directory: d:\Suna Chat\.agents\teamwork_preview_worker_1
Project Root: d:\Suna Chat
Original Request File: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md

You MUST read d:\Suna Chat\.agents\ORIGINAL_REQUEST.md before starting work.
Also read:
- d:\Suna Chat\.agents\orchestrator_4\PROJECT.md
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_1\handoff.md
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2\handoff.md
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_3\handoff.md

## Relevant Skills:
- Agent Self-Correction: C:\Users\Admin\.gemini\config\skills\agent_self_correction\SKILL.md
- Ponytail (Lazy Senior Dev Mode): C:\Users\Admin\.gemini\config\skills\ponytail\SKILL.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusive Write Ownership:
- `app.js`
- `index.html`
- `styles.css`
- `d:\Suna Chat\PROJECT.md` (sync from orchestrator_4/PROJECT.md)

## Mission: Complete Auth, Storage Isolation, Session Persistence & Cloud Sync Overhaul
Implement all requirements from R1, R2, and R3 based on the blueprints in the Explorer handoffs:

1. **R1: Persistent Guest Identity & Strict Storage Partitioning**:
   - Implement `getOrCreateGuestUid()` using `localStorage.getItem('suna_guest_uid')`. If missing, generate stable ID `guest_<random>` and store it.
   - Update `getStorageSuffix()` to use `AuthState.user.uid` if logged in, otherwise `getOrCreateGuestUid()`.
   - In `initAuth()` and `handleGuestLogin()`, replace `'guest-' + Date.now()` with `getOrCreateGuestUid()`.
   - In `loadState()`, add migration check: if legacy `suna_chats_guest` exists, migrate it to `suna_chats_` + `getOrCreateGuestUid()`.
   - Partition ALL user keys: `suna_mode` + suffix, `suna_last_active_time` + suffix, `suna_notes` + suffix, `suna_chat_scroll_map` + suffix.
   - Implement pure `clearInMemoryState()`: resets `State.chats = []`, `State.settings = getDefaultSettings()`, `State.memory = { facts: [], lastUpdated: 0 }`, `State.deletedChats = {}`, `State.activeChatId = null`, `State.vfs = {}`, `State.workspaceMessages = []`, `State.workspaceConsoleLogs = []`, `State.pendingImages = []`, `State.pendingFiles = []`. Aborts `State.abortController` and `_workspaceAbortController`. ZERO storage writes!
   - In `onAuthStateChanged`, before loading new user state:
     1. Unsubscribe real-time listeners: `_syncUnsubscribes.forEach(u => u()); _syncUnsubscribes = [];`
     2. Clear debounce timers (`_saveTimeout`, `AuthState.syncDebounceTimer`).
     3. Call `clearInMemoryState()`.
     4. Then await `loadState()` and `loadMemory()`.
   - In `cloudLoad()`, if `isNewAccount === true`, do NOT upload dirty RAM. Initialize with clean default state before `cloudSave(true)`.
   - In `mergeSettings()`, remove cross-account API key leakage.

2. **R2: Bulletproof Session Persistence & Zero Flicker**:
   - In `loadFirebaseSDK()` (`app.js:31-61`), explicitly call `authMod.setPersistence(auth, authMod.browserLocalPersistence)` if available.
   - In `index.html`: Set `<div id="auth-screen" class="auth-screen" style="display:none;">` by default. Remove `style="display:none;"` from `<div id="app">`.
   - In `initAuth()`: If `!sdkLoaded`, call `updateSyncIndicator('offline')`.
   - Implement `AuthState._isExplicitSignOut = false`.
   - In `handleLogout()`: set `AuthState._isExplicitSignOut = true` before calling `_fb.signOutFn`.
   - In `onAuthStateChanged(null)`: If `AuthState._isExplicitSignOut`, reset flag and do NOT toast false "Phiên đăng nhập đã hết hạn".

3. **R3: Resilient Cloud Sync, 3-Way Merge & Sync Indicators**:
   - In `mergeChats()`: Strengthen deletion protection against clock drift. If a chat or message has a deletion tombstone, discard it unless updatedAt is strictly newer.
   - Preserve local base64 images: If local message has base64 image and remote message has `'__large_image__'`, retain the local image.
   - In `safeSaveLocalStorage`: If `QuotaExceededError` occurs, do NOT wipe `suna_deleted_chats`.
   - Add `window.addEventListener('offline', ...)`: update indicator to `'offline'`.
   - In `window.addEventListener('online', ...)`: update indicator to `'syncing'`, trigger `cloudLoad()` and `initRealtimeSync()`, update indicator to `'synced'`.

## Verification:
You must run and verify:
1. `node -c app.js && node -c redesign.js` (must exit 0)
2. `npm test` (must pass 100% of mocha tests)
3. `python run_verification.py` (must pass 100% green)

Document all changes and test outputs in `d:\Suna Chat\.agents\teamwork_preview_worker_1\handoff.md`.
Send message to orchestrator_4 upon completion.
