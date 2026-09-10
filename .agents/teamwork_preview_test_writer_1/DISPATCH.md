## 2026-09-07T10:45:33Z
You are a Test Writer agent for Suna Chat.
Your Identity: teamwork_preview_test_writer_1
Your Assigned Working Directory: d:\Suna Chat\.agents\teamwork_preview_test_writer_1
Project Root: d:\Suna Chat
Original Request File: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md

You MUST read d:\Suna Chat\.agents\ORIGINAL_REQUEST.md before starting work.
Also read:
- d:\Suna Chat\.agents\orchestrator_4\PROJECT.md
- d:\Suna Chat\.agents\orchestrator_4\TEST_INFRA.md
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_3\handoff.md
- d:\Suna Chat\.agents\teamwork_preview_explorer_survey_2\handoff.md

## Exclusive Write Ownership:
- 	ests/test_auth_and_account_sync.js
- d:\Suna Chat\TEST_READY.md
You MUST NOT modify app.js, redesign.js, index.html, or styles.css.

## Mission:
Author the comprehensive, opaque-box Mocha test suite 	ests/test_auth_and_account_sync.js covering Authentication, Multi-Account Data Isolation, Session Persistence, and Resilient Cloud Sync.
Reference existing tests in 	ests/ (e.g. 	ests/test_performance_shortcuts_storage_security.js) for the VM sandboxing pattern used to execute pp.js in Node.js.

Ensure your test suite covers all 4 Tiers:
1. Tier 1: Feature Isolation Coverage
   - Multi-account storage partitioning: User A and User B chats/settings strictly isolated.
   - New account clean slate: Brand new user has 0 inherited chats or settings from prior session.
   - Fixed guest identity: suna_guest_uid persisted in localStorage, stable across reloads.
2. Tier 2: Boundary & Corner Cases
   - Guest reload: getStorageSuffix() returns the exact same suffix on subsequent loads.
   - Storage quota handling: Quota error does NOT destroy deletion tombstones (suna_deleted_chats).
   - Image preservation: Remote '__large_image__' does NOT overwrite local real base64 images.
3. Tier 3: Cross-Feature Interactions
   - Account switch lifecycle: Unsubscribe old real-time listeners (_syncUnsubscribes) before loading new state.
   - Clean sign-out: Manual logout purges RAM state without destructive overwrite of guest data on disk.
   - Suppress false session expired toast on explicit logout (_isExplicitSignOut).
4. Tier 4: Real-World Scenarios
   - Offline boot with cached user (suna_cached_user): User stays logged in without error toasts.
   - 3-Way merge with clock drift: Deleted chats/messages do NOT resurrect even if remote updatedAt is newer.
   - Online/Offline network events: Dispatched events update #sync-indicator correctly and trigger sync.

## Verification & Deliverables:
1. Run syntax check: 
ode -c tests/test_auth_and_account_sync.js.
2. Run your test: 
px mocha tests/test_auth_and_account_sync.js.
3. Create d:\Suna Chat\TEST_READY.md summarizing the test suite architecture, command, and coverage.
4. Write handoff report in d:\Suna Chat\.agents\teamwork_preview_test_writer_1\handoff.md.
5. Send message to orchestrator_4 upon completion.
