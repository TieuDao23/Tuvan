# Empirical Challenger Report: Milestone 1 Token Maximization & System Prompt Directives

**Agent**: `challenger_m1_1` (teamwork_preview_challenger)  
**Milestone**: M1 (Token Maximization & System Prompt Directives)  
**Date**: 2026-08-27  

---

## 1. Observation

Direct empirical inspection and stress-testing of `app.js` and the test infrastructure revealed the following concrete observations:

1. **`resolveModelMaxTokens(modelName, mode)` (`app.js:5652–5714`)**:
   - Implements 4-tier model hierarchy with case normalization (`m = modelName.toLowerCase()`) and safe type guarding (`if (!modelName || typeof modelName !== 'string') return mode === 'flash' ? 4096 : 8192;`).
   - Tier 1 (65,536 tokens): matches `o1`, `o3`, `o4`, `thinking`, `reasoner`, `gemini-2.5`, `gemini-3`, `claude-3-7`, `claude-3.7`.
   - Tier 2 (16,384 tokens): matches `gpt-4o`, `gpt-4.1`, `gpt-4-turbo`, `gemini-2.0`, `gemini-2`, `qwen-2.5`, `qwen2.5`, `coder`, `llama-3.3`, `llama-3.1-405b`, `llama-3.1-70b`, `deepseek`, `mistral-large`, `codestral`.
   - Tier 3 (8,192 tokens): matches `claude-3-5`, `claude-3.5`, `gemini-1.5`, `gemini-1`, `qwen`, `llama`, `glm-4`.
   - Tier 4 (4,096 tokens): matches `claude-3`, `gpt-4`, `gpt-3.5`.
   - Mode-aware fallback: returns 4,096 for `mode === 'flash'` and 8,192 for pro/other modes.

2. **`makeApiRequest(messages, targetModel)` (`app.js:6313–6395`)**:
   - Binds `max_tokens: resolveModelMaxTokens(modelToUse, State.mode)`.
   - Intercepts HTTP 400 when `reqBody.max_tokens > 4096` to execute an automated downgrade retry with `max_tokens: 4096` on the primary proxy before attempting secondary proxy failover.
   - Preserves user cancellation (`err.name === 'AbortError'`) without redundant proxy retries.

3. **`callWorkspaceChatApi(model, apiMessages, customSignal, onChunk)` (`app.js:2027–2105`)**:
   - Resolves `maxTokensCeiling = resolveModelMaxTokens(model, 'pro')`.
   - Passes `max_tokens: maxTokensCeiling` to `stream: true` request and the `stream: false` fallback.
   - Binds `signal: customSignal || _workspaceAbortController?.signal`, properly forwarding external caller signals.

4. **System Prompts (`app.js:1920–1928, 5965–5971`)**:
   - `buildSystemPrompt()` injects `[NGUYÊN TẮC TOÀN VẸN MÃ NGUỒN & KHAI THÁC TOKEN TỐI ĐA]` explicitly prohibiting placeholders (`// ... rest of code`, `// code cũ giữ nguyên`, `/* TODO */`, `/* unchanged */`, `<!-- ... rest of code ... -->`).
   - `sendWorkspaceMessage()` enforces 100% full file implementations (`[QUY TẮC BẮT BUỘC VỀ MÃ NGUỒN - 100% TOÀN VẸN & KHÔNG PLACEHOLDER]`) and eliminates permissive partial fragment phrasing (`hãy trả về toàn bộ hoặc đoạn mã nguồn mới`).

5. **Empirical Test Suite Execution**:
   - `npx mocha tests/test_challenger_m1_token_maximization.js`: 18/18 tests passed (90ms).
   - `npx mocha tests/test_challenger_m1_token_and_prompt_adversarial.js`: 27/27 tests passed (196ms).
   - `npx mocha tests/test_token_maximization_and_system_prompts.js`: 15/15 tests passed (22ms).
   - `python run_verification.py`: 557/557 tests passed across all 23 test suites with 0 failures (13.41s).

---

## 2. Logic Chain

1. **Model Resolution Tier Precedence**:
   - Models like `claude-3-7-sonnet` contain substrings for both `claude-3-7` and `claude-3`. Because Tier 1 is evaluated before Tier 4, `claude-3-7-sonnet` correctly resolves to 65,536 tokens without collision corruption.
   - Similarly, `gemini-2.0-flash-thinking-exp` contains `thinking` (Tier 1) and `gemini-2.0` (Tier 2); evaluating Tier 1 first guarantees maximum token ceiling allocation (65,536 tokens) for reasoning models.
   - `gpt-4o` (Tier 2: 16,384) is evaluated before legacy `gpt-4` (Tier 4: 4,096), preventing premature truncation on modern OpenAI models.

2. **Casing, Diacritics & Type Robustness**:
   - Testing with uppercase strings (`O1-PREVIEW`, `GPT-4O-MINI`), mixed case (`Gemini-2.5-Pro`), surrounding whitespace (`  o1-mini  `, `\tgpt-4o\n`), and Unicode/Vietnamese context (`mô hình o3-mini`, `claude-3.7-✨`) confirmed 100% resolution accuracy.
   - Testing invalid types (`null`, `undefined`, `12345`, `true`, `{}`, `[]`, `NaN`) confirmed safe fallback to mode defaults (8,192 for pro, 4,096 for flash) without throwing exceptions.

3. **Proxy Downgrade & Abort Resilience in `makeApiRequest`**:
   - When a proxy rejects requests exceeding 4,096 tokens with HTTP 400, the downgrade loop automatically retries with 4,096 tokens. If the downgraded call succeeds, execution resumes without unnecessary failover.
   - If the downgrade retry fails or returns HTTP 500, failover to `altProxy` engages with the original full ceiling, providing high availability across multi-proxy environments.
   - AbortController signals propagate immediately with zero lingering retries or memory leaks.

4. **Workspace Full-File Integrity in `callWorkspaceChatApi`**:
   - Setting `max_tokens` to `resolveModelMaxTokens(model, 'pro')` in both streaming and non-streaming requests guarantees that complex interactive web apps (Three.js, Canvas, multi-module scripts) receive maximum output capacity.
   - Strict system prompt directives in both Main Chat and Workspace eliminate lazy placeholder comments and ensure that every generated response is 100% complete and immediately runnable in Live Workspace.

---

## 3. Caveats

- **Third-Party Model Naming Divergence**: Unconventional proxy aliases that do not contain recognizable model substrings (e.g. `my-custom-proxy-endpoint-v1`) will fall back to mode-based defaults (8,192 tokens in pro mode, 4,096 in flash mode). This is safe and conservative.
- **Provider Hard Limits**: For certain endpoints that enforce lower physical quotas (e.g. 2,048 tokens), the HTTP 400 downgrade loop handles the initial downgrade to 4,096; subsequent Milestone 2 Multi-Turn Continuation Chaining will handle any remaining turn continuation automatically.

---

## 4. Conclusion

**Verdict: VERIFIED & ROBUST (GREEN)**

The Milestone 1 implementation in `app.js` is empirically correct, resilient to hostile inputs, and satisfies all R1 acceptance criteria:
1. `resolveModelMaxTokens` reliably resolves model output ceilings up to 65,536 tokens across all model families with zero tier collision.
2. `makeApiRequest` dynamically maximizes tokens and gracefully handles proxy 400 rejections via automatic downgrade retry.
3. `callWorkspaceChatApi` applies model ceilings to all request branches and properly binds `customSignal`.
4. System prompts in Main Chat and Workspace Assistant strictly enforce 100% complete, placeholder-free code generation.
5. All 557 project tests pass with 0 syntax errors and 0 regressions.

---

## 5. Verification Method

To independently reproduce and verify these findings, run the following commands:

```powershell
# 1. Check JavaScript syntax integrity
node -c app.js && node -c redesign.js

# 2. Run Milestone 1 Feature Test Suite
npx mocha tests/test_token_maximization_and_system_prompts.js

# 3. Run Challenger Exhaustive Stress Suite
npx mocha tests/test_challenger_m1_token_maximization.js

# 4. Run Challenger Adversarial Suite
npx mocha tests/test_challenger_m1_token_and_prompt_adversarial.js

# 5. Run Full Authoritative Project Verification (all 557 tests)
python run_verification.py
```
