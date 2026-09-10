# Project: Suna Chat Auth, Multi-Account Data Isolation & Cloud Sync Overhaul

## Architecture
Suna Chat is a client-side web application using Firebase Authentication and Firestore Cloud Storage with IndexedDB (`SunaChatDB`) and localStorage for local caching.

```
+-----------------------------------------------------------------------------------------+
|                                    Suna Chat Client                                     |
+-----------------------------------------------------------------------------------------+
                                             │
                     +-----------------------+-----------------------+
                     │                                               │
                     ▼                                               ▼
+------------------------------------------+   +------------------------------------------+
|          Authentication Engine           |   |       Storage Subsystem (Partitioned)    |
| - browserLocalPersistence                |   | - IndexedDB: suna_chats_<uid>            |
| - getOrCreateGuestUid (suna_guest_uid)   |   |              suna_memory_<uid>           |
| - zero-flicker cached user bootstrap     |   | - localStorage: suna_settings_<uid>      |
| - _isExplicitSignOut guard               |   |                 suna_deleted_chats_<uid> |
| - clean account switch & RAM scrub       |   |                 suna_active_chat_id_<uid>|
+------------------------------------------+   |                 suna_mode_<uid>          |
                     │                         |                 suna_notes_<uid>         |
                     │                         +------------------------------------------+
                     ▼                                               │
+--------------------------------------------------------------------+--------------------+
|                         Cloud Synchronization Engine (Firestore)                        |
| - 3-Way Merge with Deletion Tombstone Preservation (clock-drift immune)                 |
| - Local Base64 Image Protection vs Remote __large_image__ overwrite                     |
| - Accurate #sync-indicator states: syncing, synced, offline, error                      |
| - Online/Offline Network Lifecycle Listeners & Auto-resync                              |
+-----------------------------------------------------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Persistent Guest Identity Engine | Persistent `suna_guest_uid` stored in localStorage; `getStorageSuffix` returns stable `_guest_<id>` surviving F5 | M1 | Survey (Explorer 1 & 2) |
| 2 | Strict Key Partitioning & Suffix Scope | All user-specific keys (`suna_chats_*`, `suna_memory_*`, `suna_settings_*`, `suna_deleted_chats_*`, `suna_active_chat_id_*`, `suna_mode_*`, `suna_last_active_time_*`, `suna_notes_*`) suffixed | M1 | Survey (Explorer 2) |
| 3 | Pure In-Memory Scrubbing & Switch Teardown | `clearInMemoryState()` purges RAM (chats, settings, memory, vfs, workspace) with 0 storage write side-effects; aborts active streams | M1 | Survey (Explorer 1 & 2) |
| 4 | Clean Account Switch Teardown | Detach `_syncUnsubscribes` and clear save/sync timers BEFORE loading new account to prevent cross-contamination | M1 | Survey (Explorer 1, 2, 3) |
| 5 | Explicit Firebase Local Persistence | `authMod.setPersistence(auth, authMod.browserLocalPersistence)` configured during SDK init | M2 | Survey (Explorer 1) |
| 6 | Zero-Flicker Cached User Startup | Default `#auth-screen` to `display:none;`, remove `#app` hidden style, load cached user immediately | M2 | Survey (Explorer 1) |
| 7 | Intentional Logout Guard & Expiry Toast Fix | `_isExplicitSignOut` guard to suppress false "Phiên đăng nhập đã hết hạn" toast on manual sign-out | M2 | Survey (Explorer 1 & 2) |
| 8 | Clock-Drift Resilient 3-Way Merge | Robust deletedChats & deletedMessageIds tombstone tracking preventing resurrection even if remote has newer updatedAt | M3 | Survey (Explorer 3) |
| 9 | Quota Protection & Image Preservation | Do not wipe `suna_deleted_chats` on quota error; preserve local base64 images from remote `__large_image__` overwrite | M3 | Survey (Explorer 3) |
| 10 | Real-Time Sync Indicator & Network Events | Support `window.online` and `window.offline` events, accurate `#sync-indicator` classes (`syncing`, `synced`, `offline`, `error`), auto-resync | M3 | Survey (Explorer 1, 2, 3) |
| 11 | Dedicated E2E Test Suite (Tiers 1-4) | Create `tests/test_auth_and_account_sync.js` covering isolation, guest persistence, account switch, session resilience, 3-way merge | M-TEST | Survey (Explorer 3) |
| 12 | Adversarial Hardening (Tier 5) & Full Verification | White-box adversarial testing, full mocha test pass (735+ tests), syntax checks (`node -c`), `python run_verification.py` 100% green | M4 | Final Milestone |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-TEST | e2e_test_suite_track | Author `tests/test_auth_and_account_sync.js` (Tiers 1-4) and publish `TEST_READY.md` | none | PLANNED |
| M1 | storage_isolation_and_guest_identity | R1: Persistent `suna_guest_uid`, strict key partitioning, pure in-memory RAM reset, listener teardown on account switch | none | PLANNED |
| M2 | session_persistence_and_zero_flicker | R2: `browserLocalPersistence`, zero-flicker cached user bootstrap, `_isExplicitSignOut` guard | M1 | PLANNED |
| M3 | resilient_cloud_sync_and_indicators | R3: 3-way merge tombstone resilience, image preservation, online/offline sync indicator | M1, M2 | PLANNED |
| M4 | e2e_pass_and_adversarial_hardening | Phase 1: Pass 100% E2E tests (`npm test`). Phase 2: Tier 5 adversarial hardening, `python run_verification.py` 100% green, forensic audit | M-TEST, M3 | PLANNED |

## Interface Contracts
### Guest Identity ↔ Storage Suffix
- `getOrCreateGuestUid()`:
  - Return: `string` (Format: `guest_<alphanumeric>`, persisted in `localStorage.getItem('suna_guest_uid')`).
- `getStorageSuffix()`:
  - Return: `string` (If logged in: `'_' + AuthState.user.uid`; else: `'_' + getOrCreateGuestUid()`).

### In-Memory State Cleaner ↔ Account Switch
- `clearInMemoryState()`:
  - Actions:
    1. Abort `State.abortController` and `_workspaceAbortController`.
    2. Reset `State.chats = []`, `State.deletedChats = {}`, `State.activeChatId = null`.
    3. Reset `State.settings = getDefaultSettings()`, `State.memory = { facts: [], lastUpdated: 0 }`.
    4. Reset `State.vfs = {}`, `State.workspaceMessages = []`, `State.workspaceConsoleLogs = []`, `State.pendingImages = []`, `State.pendingFiles = []`.
    5. Pure in-memory only: NO calls to `saveLocalStateOnly()` or `saveMemory()`.

### Cloud Sync ↔ 3-Way Merge
- `mergeChats(localChats, remoteChats)`:
  - Rules:
    1. Any chat ID in `State.deletedChats` (or remote `deletedChats`) is permanently discarded unless explicitly re-created with a timestamp newer than the deletion tombstone.
    2. Any message ID in `chat.deletedMessageIds` is discarded.
    3. If local message has valid base64 image data and remote message has `'__large_image__'`, preserve the local image data.

### Network Lifecycle ↔ Sync Indicator
- `updateSyncIndicator(status)`:
  - Input: `'syncing' | 'synced' | 'offline' | 'error'`
  - DOM: Sets `#sync-indicator` class to `sync-indicator <status>` with matching title and icon.

## Code Layout
- `app.js`: Core application logic, Auth, Storage, Cloud Sync, LLM streaming, UI event handlers.
- `index.html`: Main HTML template, `#auth-screen` (default hidden), `#app` (default visible), `#sync-indicator`.
- `styles.css`: CSS styling, `.sync-indicator` states, `#auth-screen` styling.
- `tests/test_auth_and_account_sync.js`: Dedicated Mocha test suite for Auth, Isolation, and Sync.
- `run_verification.py`: Authoritative project verification runner.
