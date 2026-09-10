# Orchestration Plan — Suna Chat Auth, Multi-Account Isolation & Cloud Sync Overhaul

## 1. Objectives & Scope
Overhaul Suna Chat's authentication, multi-account data isolation, session persistence, and cloud synchronization based on `d:\Suna Chat\.agents\ORIGINAL_REQUEST.md`.
Ensure:
- Zero cross-account data contamination across IndexedDB, localStorage, and RAM cache (`State.chats`, `State.settings`, `State.memory`).
- Guest identity persistence via fixed `suna_guest_uid`.
- Robust session persistence with `browserLocalPersistence` and zero UI flicker.
- Clean sign-out lifecycle and listener teardown.
- 3-way cloud merge with deletion preservation and Firestore 1MB safety.
- Comprehensive test suite `tests/test_auth_and_account_sync.js`.
- Zero regression across all existing mocha tests, static syntax checks, and `python run_verification.py`.

## 2. Phase Breakdown
- **Phase 0: Survey (3 Parallel Explorers)**
  - Explorer 1: Auth lifecycle, Firebase SDK initialization, session persistence, guest identity handling.
  - Explorer 2: Storage subsystems (IndexedDB partitions, localStorage prefixing, State RAM caches, account switch cleanup).
  - Explorer 3: Cloud sync mechanics (Firestore listeners, 3-way merge, deleted chat markers, #sync-indicator states, existing test structure & verification runner).
- **Phase 1: Project Plan & Specification (PROJECT.md & TEST_INFRA.md)**
  - Synthesize explorer reports into `PROJECT.md` (Feature Inventory, Architecture, Milestones, Interface Contracts).
  - Define E2E Test Infra in `TEST_INFRA.md`.
- **Phase 2: Dual Track Execution**
  - **Track A: E2E Test Suite Creation**
    - Dispatch Test Writer / Worker to create `tests/test_auth_and_account_sync.js`.
    - Cover all 4 Tiers: Tier 1 Feature, Tier 2 Boundary/Edge, Tier 3 Cross-Feature, Tier 4 Real-world scenarios.
    - Publish `TEST_READY.md`.
  - **Track B: Core Overhaul Milestones**
    - M1: Storage Partitioning & Guest Identity Persistence.
    - M2: Auth State, Session Persistence & Zero-Flicker Cached User.
    - M3: Cloud Sync, 3-Way Merge, Deletion Guarding & Sync Indicators.
- **Phase 3: Integration & Zero-Regression Verification**
  - Verify all unit and E2E tests pass (`npm test`).
  - Verify syntax checks (`npm run check` / `node -c app.js && node -c redesign.js`).
  - Verify full benchmark (`python run_verification.py`).
- **Phase 4: Adversarial Hardening & Forensic Integrity Audit**
  - Dispatch Challenger agents for adversarial edge-case stress testing.
  - Dispatch Forensic Auditor for integrity verification.
- **Phase 5: Final Report to Sentinel**
  - Compile final evidence and handoff to sentinel_3.
