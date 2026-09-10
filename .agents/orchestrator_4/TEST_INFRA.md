# E2E Test Infra: Suna Chat Auth, Isolation & Cloud Sync

## Test Philosophy
- Opaque-box, requirement-driven. Derives test assertions from user-facing specifications in `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Interaction Testing + Real-World Workload Scenarios.

## Feature Inventory & Test Matrix
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | Persistent Guest Identity | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Multi-Account Storage Partitioning | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Account Switch & Clean Lifecycle | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Bulletproof Session Persistence | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Clean Sign-Out & Expiry Guard | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Resilient 3-Way Cloud Merge & Tombstones | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 7 | Large Image Quota & Preservation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 8 | Sync Indicator & Network Resilience | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- Target file: `tests/test_auth_and_account_sync.js`
- Test runner: `npm test` (Mocha CLI via `npx mocha tests/test_auth_and_account_sync.js` and `python run_verification.py`)
- Test sandbox: Node.js VM sandbox mocking browser storage (`localStorage`, `sessionStorage`, `indexedDB`), DOM elements (`#sync-indicator`, `#auth-screen`, `#app`), and network events (`online`, `offline`).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Shared PC: User A -> Logout -> User B -> Zero Cross-Contamination | F1, F2, F3, F5 | High |
| 2 | Offline Guest Journey Across Browser Reloads | F1, F2, F4 | Medium |
| 3 | Multi-Device Sync: Delete Chat on Device A, Merge with Device B | F6, F7, F8 | High |
| 4 | Large Base64 Image Persistence During Remote Sync | F7, F8 | Medium |
| 5 | Network Drop During Session and Seamless Auto-Reconnection | F4, F8 | Medium |

## Coverage Thresholds
- Tier 1: Feature Isolation Coverage (>=5 tests per feature)
- Tier 2: Boundary & Corner Cases (empty storage, quota limits, clock drift)
- Tier 3: Cross-Feature Interactions (pairwise combinations)
- Tier 4: Real-World Multi-Account Scenarios (>=5 application scenarios)
- Total: >= 50 comprehensive test cases ensuring zero-regression across all existing 735 mocha tests.
