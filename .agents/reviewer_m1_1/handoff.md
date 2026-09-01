# Milestone 1 (R1) Independent Review & Adversarial Report

**Reviewer**: `reviewer_m1_1` (teamwork_preview_reviewer / critic)  
**Target Milestone**: Milestone 1 (R1 — Token Maximization & System Prompt Directives)  
**Date**: 2026-08-27  
**Verdict**: **APPROVE**

---

## 1. Observation

Direct inspection of `app.js`, `tests/test_token_maximization_and_system_prompts.js`, and execution of the verification suite revealed the following:

### A. Code Implementation in `app.js`
1. **Model Output Token Ceiling Resolver (`resolveModelMaxTokens`)** (`app.js:5652–5717`):
   - Categorizes models into 4 distinct token tiers:
     - **Tier 1 (65,536 tokens)**: `o1`, `o3`, `o4`, `thinking`, `reasoner`, `gemini-2.5`, `gemini-3`, `claude-3-7`, `claude-3.7`.
     - **Tier 2 (16,384 tokens)**: `gpt-4o`, `gpt-4.1`, `gpt-4-turbo`, `gemini-2.0`, `gemini-2`, `qwen-2.5`, `coder`, `llama-3.3`, `llama-3.1-405b`, `llama-3.1-70b`, `deepseek`, `mistral-large`, `codestral`.
     - **Tier 3 (8,192 tokens)**: `claude-3-5`, `gemini-1.5`, `gemini-1`, `qwen`, `llama`, `glm-4`.
     - **Tier 4 (4,096 tokens)**: `claude-3` (opus/haiku legacy), `gpt-4`, `gpt-3.5`.
     - **Mode-based fallback**: `flash` mode defaults to 4,096 tokens; `pro` mode defaults to 8,192 tokens; safe type checking guards non-string/null/undefined inputs.
   - Bound to `window.resolveModelMaxTokens` for runtime and browser environment availability.

2. **API Payload Binding & Proxy Downgrade Resilience (`makeApiRequest`)** (`app.js:6324–6362`):
   - Sets `max_tokens: resolveModelMaxTokens(modelToUse, State.mode)` in the request payload.
   - Implements automatic HTTP 400 downgrade safety: If a proxy rejects requests with high `max_tokens` (`status === 400 && reqBody.max_tokens > 4096`), it immediately retries with `max_tokens: 4096` before failing or initiating altProxy failover.

3. **Workspace Chat API Payload & Signal Binding (`callWorkspaceChatApi`)** (`app.js:2040–2086`):
   - Resolves `maxTokensCeiling = resolveModelMaxTokens(model, 'pro')`.
   - Binds `max_tokens: maxTokensCeiling` to both `stream: true` and `stream: false` payloads.
   - Forwards `signal: customSignal || _workspaceAbortController?.signal` properly to `fetch`.

4. **Main Chat Anti-Placeholder Directives (`buildSystemPrompt`)** (`app.js:5965–5971`):
   - Injects `[NGUYÊN TẮC TOÀN VẸN MÃ NGUỒN & KHAI THÁC TOKEN TỐI ĐA]`.
   - Explicitly forbids placeholders (`// ...`, `// ... rest of code`, `// code cũ giữ nguyên`, `/* TODO */`, `/* unchanged */`, `<!-- ... rest of code ... -->`, bare `...`).
   - Mandates 100% full completeness and maximum token exploitation.
   - Preserves all pre-existing prompt directives (Suna identity, Teahouse lore, User supreme priority, Memory, Modes, Mindmap, Workspace formats).

5. **Workspace Assistant Prompt & Full-File Mandate (`sendWorkspaceMessage`)** (`app.js:1920–1928`):
   - Configures `systemPrompt` mandating complete HTML/CSS/JS file inside a single fenced code block (`<!DOCTYPE html>` to `</html>`).
   - Completely eliminates legacy permissive wording (`hãy trả về toàn bộ hoặc đoạn mã nguồn mới`).
   - Verbatim embeds active editor code into `[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]`.

### B. Test Suite Execution & Static Checks
1. `node -c app.js && node -c redesign.js` exited with code 0 (0 syntax errors).
2. `npx mocha tests/test_token_maximization_and_system_prompts.js` passed 15 of 15 tests (100% pass rate).
3. `python run_verification.py` passed 512 of 512 tests across 22 test files with 100% green status.

---

## 2. Logic Chain

1. **Token Maximization Correctness**:
   - `resolveModelMaxTokens` matches model identifiers in order of precedence (Tier 1 -> Tier 2 -> Tier 3 -> Tier 4 -> fallback).
   - Higher tiers are evaluated first, preventing false matches (e.g. `claude-3-7-sonnet` matches Tier 1 before `claude-3` in Tier 4; `gpt-4o` matches Tier 2 before `gpt-4` in Tier 4).
   - By setting `max_tokens` to true model limits (up to 65,536 for reasoning models and 16,384 for frontier/coding models), API calls exploit the maximum per-turn capacity instead of being artificially throttled by arbitrary defaults.

2. **Resilience & Fault Tolerance**:
   - The HTTP 400 retry handler in `makeApiRequest` shields the user against third-party proxy gateways that restrict token parameters without crashing the request.
   - Signal propagation in `callWorkspaceChatApi` ensures that cancellation (`AbortController`) and 45s safety timeouts are immediately respected.

3. **System Prompt Enforcement**:
   - Explicit negative constraints (`TUYỆT ĐỐI CẤM PLACEHOLDER`) combined with positive completeness mandates (`100% HOÀN CHỈNH`) prevent the LLM from outputting truncated or placeholder-filled code fragments.
   - Removing permissive phrasing from `sendWorkspaceMessage` ensures generated code is always a self-contained, runnable application suitable for direct editor injection in Live Workspace.

4. **Integrity & Non-Regression**:
   - Zero hardcoding of test outputs or facade dummy logic was found in the codebase.
   - All 512 existing tests across the project pass with zero regressions.

---

## 3. Caveats & Adversarial Findings

1. **Adversarial Edge-Case Observation (Non-blocking / Suggestion)**:
   - Model name matching in Tier 1 (`reasoner`, `thinking`, `o1`, `o3`, `o4`, `gemini-2.5`, `claude-3-7`) currently resolves `deepseek-reasoner` to 65,536 tokens, but models explicitly named `deepseek-r1` or `deepseek-ai/DeepSeek-R1` will fall into Tier 2 (`deepseek` -> 16,384 tokens). While 16,384 tokens is still generous, adding `m.includes('-r1') || m.includes('r1-') || m.includes('qwq')` to Tier 1 would provide full 65k ceiling for third-party DeepSeek-R1 and QwQ endpoints.
2. **Workspace Chat Downgrade Parity**:
   - `makeApiRequest` implements HTTP 400 `max_tokens: 4096` downgrade retry, whereas `callWorkspaceChatApi` falls back from `stream: true` to `stream: false` with the same `maxTokensCeiling`. If a proxy rejects `max_tokens > 4096` in non-streaming mode as well, `callWorkspaceChatApi` relies on alternative proxy failover.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- **Integrity**: 100% verified. No hardcoded fixtures, dummy facades, or specification bypasses.
- **Completeness**: All 5 core requirements of Milestone 1 (R1) are fully implemented, robust, and compliant with `PROJECT.md` interface specifications.
- **Readiness**: The codebase is ready to proceed to Milestone 2 (Multi-Turn Chaining & Truncation Detection).

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. **Syntax Integrity**:
   ```powershell
   cmd /c "node -c app.js && node -c redesign.js"
   ```
   *Expected: Exit code 0, 0 errors.*

2. **Milestone 1 Test Suite**:
   ```powershell
   npx mocha tests/test_token_maximization_and_system_prompts.js
   ```
   *Expected: 15 passing tests.*

3. **Full Project Verification**:
   ```powershell
   python run_verification.py
   ```
   *Expected: `>>> VERIFICATION PASSED: ALL CHECKS 100% GREEN (512 TESTS) <<<`.*
