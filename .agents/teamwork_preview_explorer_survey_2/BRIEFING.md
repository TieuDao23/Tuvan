# BRIEFING — 2026-09-07T10:44:00Z

## Mission
Survey Storage Subsystems & Multi-Account Data Isolation across IndexedDB, localStorage, and RAM state in Suna Chat.

## 🔒 My Identity
- Archetype: Explorer
- Roles: survey, analysis, synthesis
- Working directory: d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2
- Original parent: 043a7d2a-ba18-49a8-a714-60dc650f8c1c
- Milestone: Survey & Analysis

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Storage Subsystems & Multi-Account Data Isolation focus
- Exact file paths, line numbers, and verbatim quotes

## Current Parent
- Conversation ID: 043a7d2a-ba18-49a8-a714-60dc650f8c1c
- Updated: 2026-09-07T10:44:00Z

## Investigation State
- **Explored paths**:
  - `app.js` (lines 1-950, 3200-3250, 4175-4700, 4895-4945, 8260-8320, 8790-8825, 9360-9750)
  - `redesign.js` (lines 1-12)
  - `mindmap.html` (lines 1090-1110)
  - `tests/test_challenger_storage_security_adversarial.js`
  - `tests/test_performance_shortcuts_storage_security.js`
- **Key findings**:
  1. Ephemeral Guest UID `guest-${Date.now()}` generated on every page reload (lines 737, 821), breaking IndexedDB lookup and wiping guest history on F5.
  2. Asynchronous Firestore listeners in `_syncUnsubscribes` remain attached to old user's document during account switch, merging previous user chats into new user state via `mergeChats()`.
  3. `resetInMemoryState()` (lines 670-695) destructively writes dummy empty chats to disk storage (`suna_chats_guest`) on logout, corrupting persistent store.
  4. Multiple un-suffixed global localStorage keys (`suna_mode`, `suna_last_active_time`, `suna_guest_notes`, legacy `suna_chats`, `suna_chat_scroll_map`) leak across account boundaries.
  5. Incomplete RAM purge on switch leaves `State.vfs`, `State.workspaceMessages`, `State.workspaceConsoleLogs`, and pending files/images intact across users.
  6. False "Session Expired" alert on explicit logout caused by reading load-time `cachedUser` closure in `onAuthStateChanged`.
- **Unexplored areas**: None for storage survey; findings are exhaustive and verified.

## Key Decisions Made
- Fully documented all storage keys, call sites, and lifecycles.
- Formulated precise 5-step account switch lifecycle and 10-step sign-out lifecycle.

## Artifact Index
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2\DISPATCH.md — Dispatch log
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2\BRIEFING.md — Persistent working memory
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2\progress.md — Liveness heartbeat
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2\handoff.md — Comprehensive Survey Report
