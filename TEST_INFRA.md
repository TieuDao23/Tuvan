# E2E Test Infra: Autonomous Token-Maximizing Multi-Turn Continuation Engine

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests validate behavior, interface contracts, and specifications defined in `ORIGINAL_REQUEST.md` and `PROJECT.md` (R1–R6, Features F1–F20).
- **Multi-Tier Testing Methodology**:
  - **Tier 1: Feature Coverage**: Comprehensive unit & functional verification for all 20 individual features in complete isolation (>=5 test cases per feature, 100 tests total).
  - **Tier 2: Boundary & Corner Cases**: Stress and resilience testing across token limits, empty deltas, multi-byte UTF-8, unclosed backtick fences/HTML tags, abort triggers, and syntax error resistance (>=5 test cases per feature, 100 tests total).
  - **Tier 3: Cross-Feature Combinations**: Pairwise and multi-subsystem interaction testing (e.g. continuation + streaming UI + workspace sync + abort + storage quota + theme + lofi + mindmap + kanban + token ceilings + boundary stitching).
  - **Tier 4: Real-World Application Scenarios**: End-to-end heavy workloads (1200+ line Three.js 3D simulations, multi-turn Canvas game generation, full-stack analytics dashboards, interactive mindmaps, and full static syntax parity).

---

## Feature Inventory & Coverage Matrix
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|----------------------|:------:|:------:|:------:|:------:|
| 1 | F1: Model Output Token Ceiling Resolver | ORIGINAL_REQUEST §R1 | ✓ | ✓ | ✓ | ✓ |
| 2 | F2: Main Chat Anti-Placeholder Prompt | ORIGINAL_REQUEST §R1 | ✓ | ✓ | ✓ | ✓ |
| 3 | F3: Workspace Assistant Anti-Placeholder Prompt | ORIGINAL_REQUEST §R1 | ✓ | ✓ | ✓ | ✓ |
| 4 | F4: Multi-Tier Stream Truncation Detector | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 5 | F5: Background Continuation Context Builder | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 6 | F6: Standard Continuation Prompt Protocol | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 7 | F7: Expanded Turn Recursion Bound Guard | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 8 | F8: Continuation User Abort Propagation | ORIGINAL_REQUEST §R2 | ✓ | ✓ | ✓ | ✓ |
| 9 | F9: Boundary Code Fence & Preamble Stripper | ORIGINAL_REQUEST §R3 | ✓ | ✓ | ✓ | ✓ |
| 10 | F10: Suffix-Prefix & Line Overlap Deduplicator | ORIGINAL_REQUEST §R3 | ✓ | ✓ | ✓ | ✓ |
| 11 | F11: Single State Message Consolidation | ORIGINAL_REQUEST §R3 | ✓ | ✓ | ✓ | ✓ |
| 12 | F12: Single Message Bubble Container | ORIGINAL_REQUEST §R4 | ✓ | ✓ | ✓ | ✓ |
| 13 | F13: 60fps rAF Render Throttle | ORIGINAL_REQUEST §R4 | ✓ | ✓ | ✓ | ✓ |
| 14 | F14: Typing Indicator Stream Lifecycle | ORIGINAL_REQUEST §R4 | ✓ | ✓ | ✓ | ✓ |
| 15 | F15: Heuristic Code Extractor | ORIGINAL_REQUEST §R5 | ✓ | ✓ | ✓ | ✓ |
| 16 | F16: Automatic Editor & Iframe Live Injector | ORIGINAL_REQUEST §R5 | ✓ | ✓ | ✓ | ✓ |
| 17 | F17: High-Stacking Toast Notification | ORIGINAL_REQUEST §R5 | ✓ | ✓ | ✓ | ✓ |
| 18 | F18: Conversational Response Safe Bypass | ORIGINAL_REQUEST §R5 | ✓ | ✓ | ✓ | ✓ |
| 19 | F19: Core Features Preservation | ORIGINAL_REQUEST §R6 | ✓ | ✓ | ✓ | ✓ |
| 20 | F20: Automated Verification & E2E Test Parity | ORIGINAL_REQUEST §R6 | ✓ | ✓ | ✓ | ✓ |

---

## Test Architecture & Suite Locations
- **Runner**: Mocha test runner (`npx mocha "tests/**/*.js"` / `npm test`).
- **Syntax Validator**: Node CLI (`node -c app.js && node -c redesign.js` / `npm run check`).
- **Authoritative Orchestrator**: `python run_verification.py`.
- **Key Test Files**:
  - `tests/test_e2e_token_continuation_engine.js`: Primary 4-Tier E2E test suite covering all 20 features (216 tests).
  - `tests/test_collapsible_code_and_continuation.js`: Collapsible blocks and multi-turn stream tests.
  - `tests/test_workspace_direct_sync_and_continuation.js`: Direct Live Workspace auto-sync tests.
  - `tests/test_challenger_continuation_adversarial.js`: Adversarial stress and 500-line Three.js continuation tests.
  - `tests/test_challenger_storage_security_adversarial.js`: Storage quota and isolation tests.
  - `tests/test_topbar_layout_and_css_hygiene.js`: Layout, responsive design, and CSS hygiene tests.
  - `tests/ui_redesign/visible_tests/` & `tests/ui_redesign/hidden_tests/`: Zen UI redesign test matrix.

---

## Coverage & Quality Thresholds
- **Pass Rate**: 100% pass rate across all suites (497/497 tests passing).
- **Syntax Integrity**: 0 syntax errors across `app.js`, `redesign.js`, and all test scripts.
- **CSS Hygiene**: 100% balanced braces in `styles.css` with `.toast-container` at `z-index: 10000`.
- **Test Integrity**: Pure opaque-box testing with explicit reference oracle models and zero facade shortcuts.
