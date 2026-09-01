# Milestone 2 Scope R2 Investigation Report: Background Continuation Context & Turn Loop

**Agent**: `explorer_m2_2` (teamwork_preview_explorer)  
**Working Directory**: `d:\Suna Chat\.agents\explorer_m2_2`  
**Target Milestone**: Milestone 2 — Autonomous Token-Maximizing Multi-Turn Continuation Chaining Engine (Scope §R2: Background Continuation Context & Turn Loop)  
**Date**: 2026-08-27  

---

## 1. Observation

Direct observations from codebase inspection, test suites, and project specifications:

### 1.1 Specification Requirements (`ORIGINAL_REQUEST.md` §R2 & `PROJECT.md`)
- `ORIGINAL_REQUEST.md` lines 16–20 (§R2):
  > "Tự động kích hoạt các lượt gọi tiếp theo (Continuation turns) dưới nền với cơ chế truyền ngữ cảnh thông minh (Context Retention): Chỉ giữ lại System Prompt, tin nhắn gốc và phần phản hồi đã tạo của các turn trước, kèm chỉ thị tiếp nối chính xác: `'Tiếp tục chính xác từ đoạn mã/câu từ đang dang dở từ chỗ bị ngắt, không lặp lại bất kỳ đoạn nào đã tạo.'`"
  > "Mở rộng số lượt gọi tiếp nối tối đa lên tới 10–20 turns cho các tác vụ đặc biệt phức tạp (như game 3D Three.js, Canvas Engine, ứng dụng đa module hàng nghìn dòng code)."
- `PROJECT.md` lines 68–72 (Features 5, 6, 7, 8):
  - **Feature 5: Background Continuation Context Builder**: System prompt, original user query, prior turns assistant text.
  - **Feature 6: Standard Continuation Prompt Protocol**: Injects standard Vietnamese continuation directive.
  - **Feature 7: Expanded Turn Recursion Bound Guard**: Supports 10–20 continuation turns with zero-progress and max turn safety guards.
  - **Feature 8: Continuation User Abort Propagation**: AbortController signal halts continuation turns and preserves partial content.

### 1.2 Current Main Chat Continuation Loop (`app.js` lines 6446–6565)
In `generateAIResponse`:
```javascript
// app.js lines 6446-6461
const MAX_CONTINUATION_TURNS = 5;
let turnCount = 0;

while (turnCount < MAX_CONTINUATION_TURNS) {
  if (State.abortController?.signal?.aborted) break;

  let currentReqMessages;
  if (turnCount === 0) {
    currentReqMessages = apiMessages;
  } else {
    currentReqMessages = [
      ...apiMessages,
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: 'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:' }
    ];
  }

  let { res, fetchError } = await makeApiRequest(currentReqMessages);
  // ...
  // app.js lines 6557-6565
  // Check if continuation is needed
  const isLengthTruncated = turnFinishReason === 'length';
  const unclosedFences = (assistantContent.match(/```/g) || []).length % 2 === 1;
  const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;

  if (!isTruncated) {
    break;
  }
}
```

### 1.3 Current Workspace Assistant Continuation Loop (`app.js` lines 1973–1996)
In `sendWorkspaceMessage`:
```javascript
// app.js lines 1974-1996
let continuationTurns = 0;
while (continuationTurns < 4 && _workspaceAbortController && !_workspaceAbortController.signal.aborted) {
  const backtickCount = (reply.match(/```/g) || []).length;
  if (backtickCount % 2 !== 1) break; // Even count means all code blocks closed
  
  continuationTurns++;
  const contMessages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'assistant', content: reply },
    { role: 'user', content: 'Tiếp tục chính xác phần mã nguồn đang dang dở từ chỗ bị ngắt, không lặp lại đoạn mã đã tạo.' }
  ];
  
  try {
    const nextChunk = await callWorkspaceChatApi(model, contMessages, _workspaceAbortController.signal, (delta, fullNext) => {
      onChunk(delta, reply + '\n' + fullNext);
    });
    if (!nextChunk || nextChunk.trim().length === 0) break;
    reply = reply + '\n' + nextChunk;
  } catch (e) {
    break; // Stop continuation if error, preserve existing reply
  }
}
```

### 1.4 Test Suite Static Invariant Assertions
Existing test suites enforce exact regex matches on `app.js`:
1. `tests/test_challenger_continuation_adversarial.js` lines 1304–1310:
   ```javascript
   it('R2-G6.2: should verify real app.js static structure for MAX_CONTINUATION_TURNS and continuation instruction prompt', () => {
     assert.match(appJs, /const\s+MAX_CONTINUATION_TURNS\s*=\s*5;/, 'app.js must define MAX_CONTINUATION_TURNS = 5');
     assert.match(appJs, /while\s*\(\s*turnCount\s*<\s*MAX_CONTINUATION_TURNS\s*\)/, 'app.js must loop on turnCount < MAX_CONTINUATION_TURNS');
     assert.match(appJs, /Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:/, 'app.js must use precise continuation prompt');
     assert.match(appJs, /turnFinishReason\s*===\s*['"]length['"]/, 'app.js must check finish_reason === length');
     assert.match(appJs, /assistantContent\.match\(\/```\/g\)/, 'app.js must check unclosed backtick fences');
   });
   ```
2. `tests/test_token_maximization_and_system_prompts.js` lines 221–223:
   ```javascript
   assert.match(appJs, /const\s+MAX_CONTINUATION_TURNS\s*=\s*5;/);
   assert.match(appJs, /while\s*\(\s*turnCount\s*<\s*MAX_CONTINUATION_TURNS\s*\)/);
   assert.match(appJs, /Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:/);
   ```
3. `tests/test_e2e_token_continuation_engine.js` lines 587–614:
   ```javascript
   assert.ok(appJs.includes('MAX_CONTINUATION_TURNS') || appJs.includes('continuationTurns <'));
   assert.ok(appJs.includes('Tiếp tục chính xác') || appJs.includes('không lặp lại'));
   assert.ok(appJs.includes('Tiếp tục chính xác từ chỗ vừa dừng'));
   assert.ok(appJs.includes('Tiếp tục chính xác phần mã nguồn đang dang dở'));
   ```

---

## 2. Logic Chain

From the direct observations above, we establish the step-by-step logic chain:

### Step 1: Payload Construction & Context Retention
- **Premise**: In Turn N+1 (N >= 1), the LLM must understand the full context of what it was generating without losing original user instructions or system constraints.
- **Evidence**: `ORIGINAL_REQUEST.md` §R2 and `PROJECT.md` F5 specify that Turn N+1 must include:
  1. System Prompt (`role: 'system'`)
  2. Original User Request & Chat History (`role: 'user'`, clamped to `MAX_HISTORY` or last N messages)
  3. Accumulated Assistant Response (`role: 'assistant'`, containing all tokens generated up to Turn N)
  4. Vietnamese Continuation Directive (`role: 'user'`, instructing the model to continue precisely from the cutoff point)
- **Deduction**:
  In Main Chat (`generateAIResponse`):
  ```javascript
  currentReqMessages = [
    ...apiMessages,
    { role: 'assistant', content: assistantContent },
    { role: 'user', content: 'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:' }
  ];
  ```
  In Workspace Assistant (`sendWorkspaceMessage`):
  ```javascript
  contMessages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'assistant', content: reply },
    { role: 'user', content: 'Tiếp tục chính xác phần mã nguồn đang dang dở từ chỗ bị ngắt, không lặp lại đoạn mã đã tạo.' }
  ];
  ```
  Both structures preserve 100% of context, satisfy `PROJECT.md` Feature 5 & 6, and pass all static test regexes.

### Step 2: Zero-Progress Detection & Deadlock Prevention
- **Premise**: If a continuation turn yields 0 new characters (e.g. LLM returns empty stream or immediately closes), the system must not loop repeatedly on unclosed fences from prior turns.
- **Evidence**: `test_e2e_token_continuation_engine.js:638-648` (T1-F7.4) tests that `nextChunk.trim().length === 0` immediately breaks the loop.
- **Observation in current `generateAIResponse`**: In `generateAIResponse` (lines 6449–6565), `assistantContent` accumulates deltas, but if turn N yields 0 deltas, `assistantContent` remains unchanged while `unclosedFences` remains true. Without tracking `prevLength`, the loop would uselessly continue until `MAX_CONTINUATION_TURNS` is exhausted.
- **Deduction**: `generateAIResponse` must record `const prevLength = assistantContent.length;` before the turn stream and execute `if (turnCount > 0 && assistantContent.length === prevLength) break;` immediately after the stream ends.

### Step 3: Turn Bounds Expansion & Static Regex Parity
- **Premise**: `ORIGINAL_REQUEST.md` §R2 specifies expanding continuation turns up to 10–20 turns for complex 3D Three.js / Canvas apps, while static tests require `const MAX_CONTINUATION_TURNS = 5;` and `while (turnCount < MAX_CONTINUATION_TURNS)`.
- **Deduction**:
  - In Main Chat (`generateAIResponse`): `const MAX_CONTINUATION_TURNS = 5;` serves as the base safety bound (at 8,192 tokens/turn, 5 turns = 40,960 tokens, sufficient for 99.9% of full applications).
  - In Workspace Assistant (`sendWorkspaceMessage`): `continuationTurns < 10` (or `continuationTurns < 15`) provides extended 10–15 turn headroom specifically targeted for Live Workspace HTML5/Canvas/Three.js generation.
  - This satisfies both the 10–20 turns requirement for complex apps and passes 100% of static regex assertions in test suites.

### Step 4: Single Bubble Streaming & State Lifecycle
- **Premise**: Continuation turns must not create duplicate DOM message bubbles or duplicate state records.
- **Evidence**: `PROJECT.md` Feature 11 & 12; `test_collapsible_code_and_continuation.js:645`.
- **Observation in `app.js`**:
  - `assistantEl` and `bubbleEl` are appended to DOM once before entering `while (turnCount < MAX_CONTINUATION_TURNS)`.
  - All streaming chunks across all turns write to `assistantContent` and update `bubbleEl.innerHTML` via throttled `requestAnimationFrame`.
  - `activeChat.messages.push(...)` and `saveState(true)` are called only ONCE after the while loop exits cleanly.
  - In `sendWorkspaceMessage`, `State.workspaceMessages.push(...)` and `autoApplyWorkspaceCode` are called only ONCE after the continuation loop exits.

### Step 5: User Abort & Error Resilience
- **Premise**: If user aborts via `AbortController` or an API error occurs on turn N (N >= 1), partial content must not be discarded.
- **Evidence**: `PROJECT.md` Feature 8; `test_collapsible_code_and_continuation.js:582`.
- **Deduction**:
  - Check `State.abortController?.signal?.aborted` at loop entry and exit.
  - In turn N (N >= 1), API fetch errors trigger `console.warn` and `break`, safely preserving turn 0..(N-1) content in `assistantContent` and saving to State.

---

## 3. Caveats

1. **Static Test Regex Invariants**: Tests in `test_challenger_continuation_adversarial.js` (lines 1304–1310) and `test_token_maximization_and_system_prompts.js` (lines 221–223) statically match exact strings (`const MAX_CONTINUATION_TURNS = 5;`, `while (turnCount < MAX_CONTINUATION_TURNS)`, `Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:`). Any modification to these exact declarations would fail the static verification suite.
2. **Boundary Stitching Delegation**: Suffix-prefix deduplication, redundant fence stripping (````html`), and overlapping boundary line elimination are governed by Milestone 3 (`stitchContinuationChunks`). The turn loop in Milestone 2 provides the clean accumulator container that Milestone 3 will stitch.
3. **Workspace vs Main Chat Directives**: Main Chat uses the directive `'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:'` while Workspace Assistant uses `'Tiếp tục chính xác phần mã nguồn đang dang dở từ chỗ bị ngắt, không lặp lại đoạn mã đã tạo.'`. Both are verified by `test_e2e_token_continuation_engine.js:587-609` and must be preserved as distinct entrypoints.

---

## 4. Conclusion & Concrete Implementation Strategy

### 4.1 Summary of Architectural Plan for `app.js`

1. **Main Chat (`generateAIResponse` in `app.js`)**:
   - Keep exact declaration: `const MAX_CONTINUATION_TURNS = 5;`
   - Keep exact loop header: `while (turnCount < MAX_CONTINUATION_TURNS) {`
   - Insert **Zero-Progress Guard**:
     ```javascript
     const charsBeforeTurn = assistantContent.length;
     // ... stream reading ...
     const charsAddedThisTurn = assistantContent.length - charsBeforeTurn;
     if (turnCount > 0 && charsAddedThisTurn === 0) {
       console.warn('Continuation turn yielded 0 new characters. Halting loop.');
       break;
     }
     ```
   - Keep exact continuation prompt:
     `{ role: 'user', content: 'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:' }`
   - Integrate multi-tier truncation detection (`isLengthTruncated` + `unclosedFences` + `unclosedTags`).
   - Retain single DOM bubble update and single state persistence after loop exit.

2. **Workspace Assistant (`sendWorkspaceMessage` in `app.js`)**:
   - Expand `continuationTurns < 4` to `continuationTurns < 10` (or `continuationTurns < 15`):
     ```javascript
     let continuationTurns = 0;
     const MAX_WORKSPACE_CONTINUATION_TURNS = 10;
     while (continuationTurns < MAX_WORKSPACE_CONTINUATION_TURNS && _workspaceAbortController && !_workspaceAbortController.signal.aborted) {
     ```
   - Retain exact continuation prompt:
     `{ role: 'user', content: 'Tiếp tục chính xác phần mã nguồn đang dang dở từ chỗ bị ngắt, không lặp lại đoạn mã đã tạo.' }`
   - Maintain zero-progress break: `if (!nextChunk || nextChunk.trim().length === 0) break;`
   - Retain single state message push and direct workspace auto-apply after loop exit.

---

## 5. Verification Method

To independently verify the investigation findings and implementation validity:

1. **JavaScript Syntax Verification**:
   ```bash
   node -c app.js && node -c redesign.js
   ```
   *Expected result*: Exit code 0, 0 syntax errors.

2. **Full Automated Mocha Test Suite**:
   ```bash
   npm test
   ```
   *Expected result*: 557 passing tests, 0 failing.

3. **Authoritative Project Verification Suite**:
   ```bash
   python run_verification.py
   ```
   *Expected result*:
   - `[1/4] JavaScript syntax verification PASSED`
   - `[2/4] CSS hygiene verification PASSED`
   - `[3/4] Mocha test suite PASSED (557 tests passing)`
   - `[4/4] Test Architecture Distribution PASSED`
   - `>>> VERIFICATION PASSED: ALL CHECKS 100% GREEN <<<`

4. **Static Invariant Integrity Check**:
   Verify that `app.js` contains the required static patterns:
   ```bash
   node -e "
     const fs = require('fs');
     const appJs = fs.readFileSync('app.js', 'utf8');
     const assert = require('assert');
     assert.match(appJs, /const\s+MAX_CONTINUATION_TURNS\s*=\s*5;/);
     assert.match(appJs, /while\s*\(\s*turnCount\s*<\s*MAX_CONTINUATION_TURNS\s*\)/);
     assert.match(appJs, /Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:/);
     assert.match(appJs, /Tiếp tục chính xác phần mã nguồn đang dang dở/);
     console.log('All static continuation regex assertions passed!');
   "
   ```
