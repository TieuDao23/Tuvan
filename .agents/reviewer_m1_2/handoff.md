# Milestone 1 Independent Review & Adversarial Audit Report

**Reviewer**: `reviewer_m1_2` (teamwork_preview_reviewer)  
**Roles**: reviewer, critic  
**Target Milestone**: M1 (R1 — Maximal Turn Token Utilization & System Prompt Directives)  
**Worker**: `worker_m1_1`  
**Verdict**: **APPROVE**  
**Integrity Status**: **CLEAN (0 Integrity Violations)**  
**Date**: 2026-08-27  

---

## 1. Observation

Direct examination of the codebase, diffs, and verification executions produced the following verified observations:

### A. Code Implementation in `app.js`
1. **Model Output Token Ceiling Resolver (`app.js:5652-5714`)**:
   - Implemented `resolveModelMaxTokens(modelName, mode = 'pro')`.
   - Tier 1 (65,536 tokens): Matches reasoning, thinking, and extended-output models (`o1`, `o3`, `o4`, `thinking`, `reasoner`, `gemini-2.5`, `gemini-3`, `claude-3-7`, `claude-3.7`).
   - Tier 2 (16,384 tokens): Matches frontier and coding models (`gpt-4o`, `gpt-4.1`, `gpt-4-turbo`, `gemini-2.0`, `gemini-2`, `qwen-2.5`, `qwen2.5`, `coder`, `llama-3.3`, `llama-3.1-405b`, `llama-3.1-70b`, `deepseek`, `mistral-large`, `codestral`).
   - Tier 3 (8,192 tokens): Matches modern standard LLMs (`claude-3-5`, `claude-3.5`, `gemini-1.5`, `gemini-1`, `qwen`, `llama`, `glm-4`).
   - Tier 4 (4,096 tokens): Matches legacy models (`claude-3`, `gpt-4`, `gpt-3.5`).
   - Fallback: Defaults safely to `8192` in pro mode and `4096` in flash mode for unknown strings, empty values, or non-string inputs.
   - Exposed on `window.resolveModelMaxTokens` for testability and cross-module access (`app.js:5716`).

2. **API Request Token Maximization & Downgrade Safety (`app.js:6324-6389`)**:
   - `makeApiRequest` dynamically resolves `maxTokensCeiling = resolveModelMaxTokens(modelToUse, State.mode)` and assigns `reqBody.max_tokens = maxTokensCeiling`.
   - Includes automatic HTTP 400 downgrade recovery: if a restricted proxy gateway rejects `max_tokens > 4096`, it catches HTTP 400 and retries with `max_tokens: 4096` before failing over to alternative proxies.

3. **Workspace Assistant API Token Binding (`app.js:2040-2086`)**:
   - `callWorkspaceChatApi` resolves `maxTokensCeiling = resolveModelMaxTokens(model, 'pro')`.
   - Passes `max_tokens: maxTokensCeiling` to both `stream: true` primary requests and `stream: false` fallback requests.
   - Binds `signal: customSignal || _workspaceAbortController?.signal` ensuring clean abort propagation.

4. **Main Chat System Prompt Anti-Placeholder Directives (`app.js:5965-5971`)**:
   - `buildSystemPrompt()` injects `[NGUYÊN TẮC TOÀN VẸN MÃ NGUỒN & KHAI THÁC TOKEN TỐI ĐA]`.
   - Explicitly bans placeholder comment patterns: `// ...`, `// ... rest of code`, `// code cũ giữ nguyên`, `/* TODO */`, `/* unchanged */`, `<!-- ... rest of code ... -->`, `/* keep existing styles */`, `// implement here`, `// tương tự như trên`, `// phần còn lại giữ nguyên`.
   - Mandates 100% complete, runnable implementations without elisions or abbreviations.

5. **Workspace Assistant System Prompt Full-File Mandate (`app.js:1920-1928`)**:
   - In `sendWorkspaceMessage()`, system prompt strictly enforces 100% complete single-file ```html ... ``` blocks (`<!DOCTYPE html>` through `</html>`).
   - Permissive fragment phrasing (`hãy trả về toàn bộ hoặc đoạn mã nguồn mới`) was completely eradicated.
   - Injects active editor code inside `[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]`.

### B. Test Suite Execution Results
1. **Static JavaScript Compilation**:
   - Command: `node -c app.js; node -c redesign.js`
   - Result: Exit code 0 (0 errors)
2. **Milestone 1 Test Suite**:
   - Command: `npx mocha tests/test_token_maximization_and_system_prompts.js`
   - Result: 15 passing (42ms), 0 failing
3. **Full Automated Project Verification**:
   - Command: `python run_verification.py`
   - Result: 512 tests passing, 0 failing across 21 test suites
   - 281 baseline tests preserved without regression.
   - 216 E2E tests preserved without regression.
   - 15 new Milestone 1 tests all green.

---

## 2. Logic Chain

1. **Integrity Audit**:
   - Inspected `app.js` and `test_token_maximization_and_system_prompts.js` for artificial bypasses, hardcoded strings mapped only to test inputs, or mock facades.
   - Verified that `resolveModelMaxTokens` implements true model classification logic rather than a mock map.
   - Verified that `buildSystemPrompt` dynamically constructs system prompts combining identity, user priority, thinking mode, token rules, image OCR, web search, and specialized format directives.
   - Conclusion: **Zero integrity violations detected.**

2. **Correctness of Token Maximization (R1)**:
   - Evaluated substring evaluation order in `resolveModelMaxTokens`: Tier 1 (`claude-3-7`, `o1`, `gemini-2.5`) is evaluated before Tier 3 (`claude-3-5`, `gemini-1.5`) and Tier 4 (`claude-3`, `gpt-4`). This eliminates substring collision risks where `claude-3-7` might otherwise match `claude-3`.
   - Verified adversarial edge cases: `undefined`, `null`, numbers, empty strings, uppercase strings (`CLAUDE-3-7-SONNET`), custom proxy paths (`my-proxy/gpt-4o-custom`), and unknown models all return correct tier values or mode-based fallbacks.
   - Verified that `makeApiRequest` and `callWorkspaceChatApi` supply explicit `max_tokens` ceilings to API payloads instead of omitting them.
   - Conclusion: **Token maximization is correctly and robustly implemented.**

3. **Anti-Placeholder System Prompts (R1)**:
   - System prompts in both Main Chat (`buildSystemPrompt`) and Workspace Assistant (`sendWorkspaceMessage`) now contain explicit negative constraints and positive mandates.
   - Banned pattern list covers all standard LLM laziness tokens (`// ...`, `/* TODO */`, `/* unchanged */`, `// code cũ giữ nguyên`, etc.).
   - Conclusion: **System prompt directives fulfill requirement R1.**

4. **Zero Regressions on Existing Subsystems**:
   - All 512 tests across all 21 test suites passed without a single failure.
   - Lofi player, Mindmap visualizer, Kanban board, Theme toggles, and Storage Quota management operate without interference.
   - Conclusion: **No regressions introduced.**

---

## 3. Caveats

No caveats. The implementation strictly adheres to Milestone 1 scope without touching downstream continuation state logic prematurely.

---

## 4. Conclusion

Milestone 1 (R1 — Maximal Turn Token Utilization & System Prompt Directives) satisfies all acceptance criteria:
- Model output token ceilings resolved accurately up to 65,536 tokens with HTTP 400 downgrade safety.
- Main Chat and Live Workspace system prompts enforce 100% complete, placeholder-free generation.
- Static compilation passes cleanly (`node -c`).
- 512/512 tests pass 100% across the entire test suite.

**Explicit Verdict**: **APPROVE**

---

## 5. Verification Method

To independently reproduce and verify this review:

1. **Syntax Check**:
   ```powershell
   node -c app.js; node -c redesign.js
   ```
2. **Run Milestone 1 Tests**:
   ```powershell
   npx mocha tests/test_token_maximization_and_system_prompts.js
   ```
3. **Run Full Verification**:
   ```powershell
   python run_verification.py
   ```
