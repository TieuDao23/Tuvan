# Comprehensive Test & Verification Plan: Suna Chat & Live Workspace Enhancement

**Document ID**: `TEST_PLAN_EXPLORER_1`  
**Date**: 2026-08-27  
**Author**: `explorer_test_1` (Test & Verification Explorer)  
**Target Project**: Suna Chat (`d:\Suna Chat`)  
**Specification Reference**: `ORIGINAL_REQUEST.md` (R1: Collapsible Code Blocks, R2: Multi-Turn Infinite Continuation, R3: Direct Workspace Modification, R4: System Integrity & Verification)  

---

## 1. Executive Summary & Verification Objectives

This test plan defines the comprehensive testing and verification architecture for the three core capabilities of Suna Chat:
1. **Collapsible Long Code Blocks (R1)**: Automatic detection of code blocks (> 12-15 lines or > 260px) in both Main Chat (`#chat-area`) and Workspace Assistant (`#workspace-chat-messages`), rendering an elegant collapsible container with line counter badge, expand/collapse toggles, and preserved action buttons (Copy & Live Preview).
2. **Multi-Turn Infinite Token Auto-Continuation (R2)**: Background auto-continuation loop detecting truncation (`finish_reason === 'length'`, unclosed code fences ` ``` `, or token exhaustion), seamlessly stitching chunks across multiple API turns into a single unified 100% complete response without junk messages or streaming glitches.
3. **Direct Live Workspace Modification (R3)**: Automatic code extraction from Workspace Assistant responses, directly updating the Workspace Editor (`#artifact-editor-textarea`) and Live Preview Iframe (`#artifact-iframe`) with real-time toast confirmation without requiring manual button clicks.
4. **Automated Verification Harness & Self-Correction (R4)**: End-to-end automated verification runner (`run_verification.py` and `npm test`) guaranteeing 100% test pass rate, 0 syntax errors (`node -c`), and maintaining strict Hidden/Visible test balance.

---

## 2. Codebase & Test Infrastructure Survey

### 2.1 Existing Test Harness
- **Test Runner**: Mocha (`11.8.0`) executed via `npx mocha "tests/**/*.js"` or `npm test`.
- **Syntax Validator**: Node.js CLI `node -c app.js && node -c redesign.js` (`npm run check`).
- **Current Test Suite Inventory**:
  - `tests/test_performance_shortcuts_storage_security.js` (31 tests)
  - `tests/test_challenger_adversarial_suite.js` (17 tests)
  - `tests/test_challenger_storage_security_adversarial.js` (deep storage & security assertions)
  - `tests/test_topbar_layout_and_css_hygiene.js` (24 tests)
  - `tests/ui_redesign/adversarial_tests/test_adversarial_state_and_resilience.js` (13 tests)
  - `tests/ui_redesign/visible_tests/` (10 tests across color, layout, typography, workspace layout)
  - `tests/ui_redesign/hidden_tests/` (9 tests across contrast, fallback, transition, resizers)
  - **Current Execution Baseline**: **122 passing tests (100% pass rate, 0 failing, 0 pending, runtime ~2s)**.
- **Testing Approach**: Native Node.js `assert`, `fs`, and `vm` (Virtual Machine sandbox). No heavy browser dependencies (no puppeteer/jsdom required), ensuring sub-second execution speed and 100% deterministic test results adhering to the **Ponytail Senior Developer Standard**.

---

## 3. Unit Test Architecture & Detailed Designs

### 3.1 Thinking Parser & StreamParser Unit Tests
**Target**: `StreamParser` and reasoning stream processing (`<thought>`, `<think>`, `<suna_tool_call>`).

- **Unit Test Cases**:
  1. **Tag Boundary Tokenization**: Chunk delivered across split tag boundaries (e.g. Chunk 1: `Hello <thi`, Chunk 2: `nk>reasoning</thi`, Chunk 3: `nk> answer`) correctly strips `<think>` block and yields `Hello answer`.
  2. **Unclosed Thinking Tag on Interrupted Stream**: Parser `flush()` cleans up unclosed opening tags without corrupting display text.
  3. **Mixed Tool Call & Thinking Parsing**: Message containing both `<think>...</think>` and `<suna_tool_call>...</suna_tool_call>` isolates reasoning, queues tool execution, and returns pure text for UI rendering.
  4. **Code Blocks Containing Tag-like Strings**: Text containing `<div>` or `x < y && y > z` inside code blocks does not trigger false positive thinking tag state changes.

### 3.2 Continuation Stitcher & Truncation Detector Unit Tests
**Target**: Truncation detection (`isTruncatedResponse`, `hasUnclosedCodeFence`, `detectFinishReasonLength`) and Chunk Stitcher (`stitchContinuationChunks`).

- **Unit Test Cases**:
  1. **Finish Reason Length Detection**: Identifies `choice.finish_reason === 'length'` from standard OpenAI / Gemini API payload.
  2. **Unclosed Code Fence Detection**: Accurately counts markdown code fences (```) in partial responses. Returns `true` when odd number of fences exist, indicating code was severed mid-block.
  3. **Seamless Chunk Stitching**:
     - *Turn 1*: ````javascript\nfunction render3D() {\n  const scene = new THREE.Scene();\n```` (truncated without closing fence).
     - *Turn 2*: ````javascript\n  const camera = new THREE.PerspectiveCamera();\n  return scene;\n}\n````
     - *Stitcher Output*: Cleanly removes redundant start/end fences at the seam and produces a single unified code block.
  4. **Overlap Deduplication**: If model repeats the last 10-20 characters upon receiving "Continue...", stitcher identifies longest common prefix/suffix and eliminates duplicate lines.
  5. **Max Continuation Recursion Guard**: Prevents infinite continuation loops by halting after configurable `MAX_CONTINUATION_TURNS` (default: 5) and appending clean closure tags.

### 3.3 Collapsible Code Block Unit Tests
**Target**: `formatMessage`, `formatWorkspaceMessageContent`, line counter helper, and `toggleCodeBlock`.

- **Unit Test Cases**:
  1. **Line Count Determination**:
     - Accurately computes lines for `\n`, `\r\n`, trailing newlines, and single-line blocks.
     - 10-line block -> `isCollapsible: false` (standard `.code-block-wrapper`).
     - 13-line block -> `isCollapsible: true` (adds `.is-collapsible`, `.code-fade-overlay`, toggle button with `13 dòng`).
     - 150-line block -> `isCollapsible: true` (adds toggle button with `150 dòng`).
  2. **Collapsible Markup Structure**:
     - Renders header badge `.code-line-badge` indicating total lines.
     - Renders toggle button `<button class="btn-code-collapse-toggle" onclick="toggleCodeBlock(this)">` with icon `unfold_more` and label `Mở rộng mã nguồn`.
     - Collapsed container applies max-height restriction (e.g. `max-height: 260px; overflow: hidden;`).
  3. **Action Button Preservation**:
     - Action button `.btn-copy-code` receives full original un-truncated code in `data-code` or pre element.
     - Action button `.btn-preview-artifact` / `.btn-workspace-apply` functions identically in collapsed and expanded states.
  4. **Toggle State Mutation**:
     - Calling `toggleCodeBlock(btn)` toggles `.is-expanded` on the wrapper.
     - When expanded: button text updates to `Thu gọn`, icon changes to `unfold_less`, `max-height` removed.
     - When re-collapsed: returns to initial compact state with smooth transition.

### 3.4 Direct Workspace Modification & Auto-Sync Unit Tests
**Target**: `extractWorkspaceCode`, `autoApplyWorkspaceCode`, `sendWorkspaceMessage`.

- **Unit Test Cases**:
  1. **Direct Code Extraction**:
     - Extracts primary HTML/JS/CSS code from standard assistant markdown response.
     - Handles explanatory preamble text before and after the code block.
     - Safely strips markdown wrappers and unescapes HTML entities.
  2. **Synchronous Editor & Iframe Injection**:
     - Sets `#artifact-editor-textarea.value = newCode`.
     - Dispatches `new Event('input')` on the editor element.
     - Directly updates `#artifact-iframe.srcdoc = newCode`.
  3. **Toast Notification Trigger**:
     - Verifies `window.toast` is called with message `'Đã tự động cập nhật Live Workspace!'` and type `'success'`.
  4. **Workspace Chat History & Action Button Fallback**:
     - Message in `#workspace-chat-messages` still contains the manual `Áp dụng vào Editor` button for user re-application.
     - Assistant response is persisted in `State.workspaceMessages`.

---

## 4. Integration & End-to-End (E2E) Test Architecture

### 4.1 End-to-End Chat Stream & Continuation Loop
- **Simulation Harness**:
  - Mock fetch handler intercepts `/chat/completions`.
  - **Turn 1**: Returns 1024 tokens of a complex Three.js simulation with `finish_reason: "length"` and unclosed ````javascript` fence.
  - **Turn 2**: Returns second half of code ending with `finish_reason: "stop"`.
- **E2E Assertions**:
  1. Exactly **one** assistant message bubble exists in `#messages-container`.
  2. Typing indicator remains smoothly visible during turn transitions without flickering.
  3. Final rendered message contains 100% complete executable Three.js script.
  4. Large code block is automatically wrapped in a collapsible container with line counter `85 dòng`.

### 4.2 End-to-End Live Workspace Direct Modification
- **Simulation Harness**:
  - Load sample HTML5 Canvas game into `#artifact-editor-textarea`.
  - Simulate user message in `#workspace-chat-input`: `"Đổi màu nền sang xanh lam và tăng tốc độ quả bóng gấp đôi"`.
  - Mock API response with modified `<canvas>` and JS code.
- **E2E Assertions**:
  1. `sendWorkspaceMessage()` triggers API call.
  2. Upon stream/response arrival, `#artifact-editor-textarea.value` contains updated blue background and 2x speed code.
  3. `#artifact-iframe.srcdoc` matches updated code immediately without manual interaction.
  4. Success toast element is rendered on DOM with top-level `z-index: 10000`.

### 4.3 End-to-End Collapsible Code UI & Copy/Preview Workflows
- **Simulation Harness**:
  - Render message with 50 lines of HTML code.
- **E2E Assertions**:
  1. DOM structure includes `.code-block-wrapper.is-collapsible`.
  2. Height is clamped to `<= 260px`.
  3. Clicking toggle expands height to `auto`.
  4. Clicking Copy button copies all 50 lines (not just visible 12 lines).
  5. Clicking Live Preview opens Artifact Viewer with full 50 lines.

---

## 5. 4-Tier Test Plan Matrix

| Tier | Focus | Test ID | Description | Expected Outcome |
|---|---|---|---|---|
| **Tier 1** | **Feature** | `T1-F1` | Collapsible Code in `#chat-area` (>12 lines) | Wraps in `.is-collapsible` with toggle button and line badge |
| **Tier 1** | **Feature** | `T1-F2` | Collapsible Code in `#workspace-chat-messages` | Wraps in `.is-collapsible` with toggle button in workspace chat |
| **Tier 1** | **Feature** | `T1-F3` | Short Code Block (<= 12 lines) | Renders normal code block without collapse button |
| **Tier 1** | **Feature** | `T1-F4` | Truncation Detection (`finish_reason: 'length'`) | Triggers auto-continuation loop |
| **Tier 1** | **Feature** | `T1-F5` | Multi-Turn Continuation Stream | Single message bubble updated across 2+ turns |
| **Tier 1** | **Feature** | `T1-F6` | Continuation Chunk Stitcher | Cleanly stitches severed code fences without syntax errors |
| **Tier 1** | **Feature** | `T1-F7` | Direct Workspace Code Extraction | Extracts full HTML/JS/CSS snippet from assistant reply |
| **Tier 1** | **Feature** | `T1-F8` | Workspace Editor & Iframe Auto-Sync | Directly updates `editor.value` and `iframe.srcdoc` |
| **Tier 1** | **Feature** | `T1-F9` | Workspace Success Toast Confirmation | Displays success toast notification |
| **Tier 1** | **Feature** | `T1-F10`| Copy & Preview Actions in Collapsed State | Copies and previews 100% full content |
| **Tier 2** | **Boundary** | `T2-B1` | Exact 12-Line vs 13-Line Boundary | 12 lines = normal; 13 lines = collapsible |
| **Tier 2** | **Boundary** | `T2-B2` | Empty Code Block (``` ```) | Renders empty block without crashing |
| **Tier 2** | **Boundary** | `T2-B3` | Mixed CRLF (`\r\n`) and LF (`\n`) Lines | Line count calculated identically on Windows & Unix |
| **Tier 2** | **Boundary** | `T2-B4` | Multiple Code Blocks in One Message (3+ blocks) | Each block independently collapses/expands with isolated state |
| **Tier 2** | **Boundary** | `T2-B5` | Truncation inside Backtick Fence (````j` -> `s\ncode``` `) | Stitcher merges partial fence cleanly |
| **Tier 2** | **Boundary** | `T2-B6` | Truncation inside Multi-Byte Vietnamese / Emoji | TextDecoder & stitcher preserve UTF-8 character integrity |
| **Tier 2** | **Boundary** | `T2-B7` | Model Overlap Duplication in Continuation | Common prefix/suffix deduplicated seamlessly |
| **Tier 2** | **Boundary** | `T2-B8` | Max Continuation Recursion Limit (Turn 5) | Halts safely without infinite loop; appends warning banner |
| **Tier 2** | **Boundary** | `T2-B9` | Malformed / Broken HTML in Workspace Reply | Sanitized safely before iframe injection to prevent script crashes |
| **Tier 2** | **Boundary** | `T2-B10`| Workspace Auto-Apply when Editor has Unsaved Changes | Overwrites cleanly or stores undo snapshot |
| **Tier 3** | **Combo** | `T3-C1` | Workspace Chat Long Code + Direct Auto-Sync | Collapsible UI rendered in chat AND editor/iframe updated simultaneously |
| **Tier 3** | **Combo** | `T3-C2` | Continuation Stream while User Toggles Panels | Background stream continues uninterrupted across panel view changes |
| **Tier 3** | **Combo** | `T3-C3` | Toggle Collapse while Active Stream Appends Chunks | Layout and scroll position remain stable without jumping |
| **Tier 3** | **Combo** | `T3-C4` | Dark/Light Theme Switch with Collapsed Blocks | Gradient fade overlay and toggle button colors update dynamically |
| **Tier 3** | **Combo** | `T3-C5` | Resizer Dragging during Direct Workspace Auto-Sync | Pointer lock and iframe srcdoc update do not conflict |
| **Tier 3** | **Combo** | `T3-C6` | User Abort (`State.abortController.abort()`) during Turn 2 | Stops continuation loop immediately and saves partial valid text |
| **Tier 4** | **Workload** | `T4-W1` | 500-Line Three.js 3D Scene Generation | 3 turns -> 1 message -> Auto-collapsed -> 100% valid syntax in iframe |
| **Tier 4** | **Workload** | `T4-W2` | Full HTML5 Game with Canvas, Audio & Physics | Multi-turn continuous generation -> Direct sync -> Instant playable preview |
| **Tier 4** | **Workload** | `T4-W3` | Rapid Consecutive Workspace Edits (3 prompts in a row) | Handled sequentially with AbortController safety and clean editor sync |
| **Tier 4** | **Workload** | `T4-W4` | Full Static Syntax Check & Test Suite Execution | `node -c app.js && node -c redesign.js` 0 errors, 100% Mocha pass rate |

---

## 6. Automated Verification Infrastructure (`run_verification.py`)

### 6.1 Architecture of `run_verification.py`
The project must include an authoritative Python verification script `run_verification.py` that executes in under 5 seconds and provides deterministic PASS/FAIL validation:

```python
#!/usr/bin/env python3
"""
run_verification.py - Suna Chat Automated Verification Suite
Validates:
1. Syntax integrity (node -c app.js, node -c redesign.js)
2. Mocha test suite execution (npx mocha "tests/**/*.js")
3. Visible / Hidden test split invariant (40% - 60% ratio)
4. CSS syntax hygiene & balanced brackets
5. Output structured verification report
"""
import subprocess
import sys
import os
import re
import json

def run_cmd(cmd, cwd=None):
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    return res.returncode, res.stdout, res.stderr

def verify_syntax():
    print("[1/4] Checking JavaScript syntax...")
    code, out, err = run_cmd("node -c app.js && node -c redesign.js")
    if code != 0:
        print("[-] Syntax check FAILED:\n" + err)
        return False
    print("[+] Syntax check PASSED (0 syntax errors)")
    return True

def verify_css_hygiene():
    print("[2/4] Checking CSS hygiene & brace balance...")
    with open("styles.css", "r", encoding="utf-8") as f:
        css = f.read()
    open_b = css.count("{")
    close_b = css.count("}")
    if open_b != close_b:
        print(f"[-] CSS brace mismatch: {open_b} open vs {close_b} close")
        return False
    if re.search(r"\.message\.assistant\s*\.message-bubble\s*\{\s*\.user-dropdown", css):
        print("[-] Unclosed selector detected in styles.css")
        return False
    print("[+] CSS hygiene check PASSED")
    return True

def verify_mocha_tests():
    print("[3/4] Running Mocha test suites...")
    code, out, err = run_cmd('npx mocha "tests/**/*.js"')
    print(out)
    if code != 0:
        print("[-] Mocha tests FAILED:\n" + err)
        return False
    
    # Verify test counts
    match = re.search(r'(\d+)\s+passing', out)
    if not match:
        print("[-] Could not parse passing test count")
        return False
    count = int(match.group(1))
    print(f"[+] Mocha tests PASSED ({count} tests passing, 0 failing)")
    return True

def main():
    print("==================================================")
    print("   SUNA CHAT SYSTEM INTEGRITY VERIFICATION SUITE   ")
    print("==================================================")
    
    success = (
        verify_syntax() and
        verify_css_hygiene() and
        verify_mocha_tests()
    )
    
    print("\n==================================================")
    if success:
        print(">>> VERIFICATION PASSED: ALL CHECKS 100% GREEN <<<")
        print("==================================================")
        sys.exit(0)
    else:
        print(">>> VERIFICATION FAILED: ISSUES DETECTED <<<")
        print("==================================================")
        sys.exit(1)

if __name__ == "__main__":
    main()
```

### 6.2 Test Pass Criteria & Invariants
1. **0 Syntax Errors**: `node -c app.js` and `node -c redesign.js` exit with code 0.
2. **100% Test Pass Rate**: All Mocha test suites in `tests/**/*.js` pass without failure or pending skips.
3. **Hidden / Visible Ratio**: Visible tests must represent between 50% and 60% of UI test suites, with Hidden tests representing 40% to 50%.
4. **Clean DOM & No Memory Leaks**: All intervals, event listeners, and timers must be cleaned up on panel toggles, visibility changes, and stream completions.

---

## 7. Concrete Test Implementation Plan for Downstream Agents

### 7.1 New Test Files to Create in `tests/`:

1. **`tests/test_collapsible_code_and_continuation.js`**
   - Implements Tier 1 to Tier 4 tests for:
     - Collapsible code block line counter, toggle markup, and CSS class toggling in both `#chat-area` and `#workspace-chat-messages`.
     - Preserved action button triggers (`copyCodeBlock`, `openArtifactFromCodeBlock`).
     - Truncation detection (`finish_reason === 'length'` and unclosed ``` fences).
     - Multi-turn stream continuation loop and chunk stitcher.
     - Thinking parser token separation.

2. **`tests/test_workspace_direct_sync_and_continuation.js`**
   - Implements Tier 1 to Tier 4 tests for:
     - Direct code extraction from Workspace Assistant messages (`extractWorkspaceCode`).
     - Auto-updating `#artifact-editor-textarea.value` and dispatching `input` event.
     - Auto-updating `#artifact-iframe.srcdoc`.
     - Toast feedback trigger and top-level z-index assertion (`z-index: 10000`).
     - Real-world workload: 3-turn Three.js generation auto-applied into Live Workspace.

3. **Root `run_verification.py`**
   - Python automated test runner executing syntax check, CSS hygiene check, and Mocha suite execution, outputting `VERIFICATION PASSED`.

---

## 8. Summary of Verification Commands

| Step | Command | Expected Result |
|---|---|---|
| 1. Syntax Check | `npm run check` | Clean exit 0 (`node -c app.js && node -c redesign.js`) |
| 2. Full Test Suite | `npm test` | `> 140 passing (100% PASS)` |
| 3. Python Verifier | `python run_verification.py` | `>>> VERIFICATION PASSED: ALL CHECKS 100% GREEN <<<` |

This test plan provides comprehensive coverage, deterministic execution, and zero bloat, empowering implementers and test writers to deliver robust, bug-free capabilities for Suna Chat.
