# Project: Suna Chat & Live Workspace Upgrade

## Architecture
- **Frontend Architecture**: Vanilla JavaScript (ES2022+), Single-Page Architecture (`index.html`, `app.js`, `redesign.js`, `styles.css`).
- **Data Flow & Storage**: Hybrid `localStorage` + `IndexedDB` caching, zero external runtime frontend dependencies.
- **Live Workspace & Artifacts**: Split-pane layout with Monaco/Textarea editor (`#artifact-editor-textarea`) and sandboxed live preview iframe (`#artifact-iframe`).
- **Streaming Pipeline**: SSE stream reader with token parsing, multi-turn infinite stream continuation loop, and throttled DOM rendering.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Collapsible Code Blocks (Main Chat) | Automatically collapse code blocks >12 lines in `#chat-area` with toggle & badge | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | Collapsible Code Blocks (Workspace Chat) | Automatically collapse code blocks >12 lines in `#workspace-chat-messages` | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 3 | Line Counter Badge | Display number of lines (e.g. "24 dòng") in code block header | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 4 | Toggle Action Button | "Mở rộng mã nguồn" / "Thu gọn" button with icon | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 5 | Gradient Overlay Fade | Smooth bottom gradient fade in collapsed state | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 6 | Copy Code Action Preservation | Copy full code content regardless of collapsed/expanded state | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 7 | Preview Action Preservation | Open full code preview regardless of collapsed/expanded state | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 8 | Collapsible Thinking Blocks | Fold `<think>` blocks with accordion toggle, pulse animation, and summary | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 9 | Direct Workspace Code Extraction | Regex extract HTML/JS/CSS/SVG code blocks from workspace assistant replies | M2 | ORIGINAL_REQUEST §R3 | DONE |
| 10 | Direct Editor Textarea Sync | Auto-update `#artifact-editor-textarea` and dispatch `input` event | M2 | ORIGINAL_REQUEST §R3 | DONE |
| 11 | Direct Live Iframe Sync | Auto-update `#artifact-iframe.srcdoc` with extracted code | M2 | ORIGINAL_REQUEST §R3 | DONE |
| 12 | Direct Sync Toast Notification | Show success toast notification upon direct workspace modification | M2 | ORIGINAL_REQUEST §R3 | DONE |
| 13 | Manual Apply Backward Compatibility | Preserve `.btn-workspace-apply` and `applyWorkspaceCode` for compatibility | M2 | Codebase Survey | DONE |
| 14 | Truncation Detection (Finish Reason) | Detect `finish_reason === 'length'` in SSE stream | M3 | ORIGINAL_REQUEST §R2 | DONE |
| 15 | Truncation Detection (Unclosed Fence) | Detect unclosed code block fences at stream end | M3 | ORIGINAL_REQUEST §R2 | DONE |
| 16 | Multi-Turn Continuation Loop | Auto-send background continuation prompt to LLM | M3 | ORIGINAL_REQUEST §R2 | DONE |
| 17 | Single Message Bubble Stitching | Seamlessly append continuation chunks into the same bubble | M3 | ORIGINAL_REQUEST §R2 | DONE |
| 18 | Continuation Turn Safety Guard | Limit auto-continuation turns (max 5) to prevent infinite loops | M3 | ORIGINAL_REQUEST §R2 | DONE |
| 19 | AbortController Cancellation | Cancel all ongoing continuation turns when user hits stop/abort | M3 | ORIGINAL_REQUEST §R2 | DONE |
| 20 | E2E Testing Suite (Tiers 1-4) | 4-tier Mocha test suite covering features, boundaries, combinations, workloads | M0 / M4 | ORIGINAL_REQUEST §R4 | DONE |
| 21 | Automated Verification Script | `run_verification.py` verifying syntax (`node -c`) and all tests | M0 / M4 | ORIGINAL_REQUEST §R4 | DONE |
| 22 | Adversarial Hardening (Tier 5) | White-box stress tests for token stitching, error injection, DOM edge cases | M4 | System Prompt | DONE |
| 23 | Forensic Integrity Verification | 0 dummy/mock violations, genuine implementations | M4 | System Prompt | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | E2E Testing Track | Test suites (`test_collapsible_code_and_continuation.js`, `test_workspace_direct_sync_and_continuation.js`, `run_verification.py`), `TEST_READY.md` | none | DONE |
| M1 | Collapsible Code & Thinking UI | Collapsible code (>12 lines), badge, toggle, gradient overlay, thinking accordion, anti-slop styling | none | DONE |
| M2 | Direct Workspace Live Sync | Auto-extract code in `sendWorkspaceMessage()`, auto-update editor & iframe, toast notifications | none | DONE |
| M3 | Infinite Token Stream Continuation | SSE finish_reason/fence truncation detection, multi-turn continuation loop, single bubble stitching | M1 | DONE |
| M4 | Final Integration & Adversarial Verification | 100% E2E test pass, `run_verification.py`, Tier 5 adversarial tests, Forensic Integrity Audit | M0, M1, M2, M3 | DONE |

## Code Layout
- `app.js`: Core application logic, markdown formatting (`formatMessage`, `formatWorkspaceMessageContent`), SSE streaming & continuation (`generateAIResponse`), workspace management (`sendWorkspaceMessage`, `applyWorkspaceCode`).
- `styles.css`: CSS styling for collapsible code blocks (`.code-block-wrapper.is-collapsible`, `.code-line-badge`, `.btn-toggle-code`, `.code-collapse-overlay`), thinking blocks, toast notifications.
- `index.html`: DOM structure for main chat and workspace layout.
- `tests/test_collapsible_code_and_continuation.js`: Unit & integration tests for R1 and R2.
- `tests/test_workspace_direct_sync_and_continuation.js`: Unit & integration tests for R3 and workspace continuation.
- `run_verification.py`: Automated project verification script.
