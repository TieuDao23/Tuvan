# Master Implementation Plan: Suna Chat & Live Workspace Upgrade

## Overview
Upgrade Suna Chat with 4 core requirement sets:
- **R1: Collapsible Code & Thinking Blocks**: Smart folding for code blocks >12 lines or >260px with line count badge, toggle action, and gradient overlay in both Main Chat and Workspace Chat; Collapsible `<think>` blocks.
- **R2: Infinite Token Auto-Continuation**: Multi-turn background loop detecting truncation (`finish_reason === 'length'` or unclosed code fence) and seamlessly streaming continuation into the same single message bubble.
- **R3: Direct Live Workspace Sync**: Automatic code extraction from Workspace Assistant replies with instant synchronization into `#artifact-editor-textarea` and `#artifact-iframe.srcdoc` with success toast.
- **R4: System Integrity & Comprehensive Verification**: 100% test pass rate across unit/integration/E2E test suites and automated `run_verification.py` script.

## Phase Plan

### Phase 1: E2E Test Suite Authoring (Milestone M0)
- Dispatch `teamwork_preview_test_writer` to create:
  - `tests/test_collapsible_code_and_continuation.js`
  - `tests/test_workspace_direct_sync_and_continuation.js`
  - `run_verification.py`
  - Publish `TEST_READY.md`.

### Phase 2: Core Feature Implementation
- **Milestone M1**: Collapsible Code & Thinking Blocks (R1)
  - Worker modifies `app.js` and `styles.css`.
  - Reviewer & Challenger verify.
- **Milestone M2**: Direct Workspace Live Sync (R3)
  - Worker modifies `app.js` and `styles.css`.
  - Reviewer & Challenger verify.
- **Milestone M3**: Infinite Token Stream Continuation (R2)
  - Worker modifies `app.js`.
  - Reviewer & Challenger verify.

### Phase 3: Final E2E Integration & Verification (Milestone M4)
- Run complete test suite and `run_verification.py`.
- Adversarial challenger stress tests (Tier 5).
- Forensic integrity audit (`teamwork_preview_auditor`).
- Generate final handoff and request victory verification.
