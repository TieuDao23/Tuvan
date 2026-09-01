# Milestone 1 Investigation & Strategy Handoff Report: Maximal Turn Token Utilization

## 1. Observation

Direct examination of `app.js` reveals the current API calling mechanisms and token ceiling limits:

### Observation 1.1: `makeApiRequest` in `app.js` (Lines 6232–6258)
```javascript
// app.js lines 6232-6258
async function makeApiRequest(messages, targetModel) {
  const modelToUse = targetModel || model;
  const proxy = getProxyForModel(modelToUse);
  const url = proxy.url + '/chat/completions';
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const userText = typeof lastUserMessage?.content === 'string' 
    ? lastUserMessage.content 
    : (Array.isArray(lastUserMessage?.content) 
        ? lastUserMessage.content.map(p => p.text || '').join(' ') 
        : '');
  
  const requiresUnlimited = /không giới hạn|unlimited|tối đa|hết cỡ|dài|chi tiết|write more|continue|viết tiếp|detailed|long|max/i.test(userText);

  const reqBody = {
    model: modelToUse, messages, stream: true,
    temperature: State.mode === 'flash' ? 0.3 : 0.75,
    ...(requiresUnlimited ? {} : { max_tokens: State.mode === 'flash' ? 1024 : 4096 }),
    ...(State.mode === 'flash' ? {
      top_p: 0.85,
      frequency_penalty: 0.1,
      presence_penalty: 0.0
    } : {
      top_p: 0.95,
      frequency_penalty: 0.15,
      presence_penalty: 0.1
    })
  };
```
- **Finding**: By default, `max_tokens` is artificially constrained to `1024` in flash mode and `4096` in pro mode. When `requiresUnlimited` is triggered via regex, `max_tokens` is omitted (`{}`), leaving token limits to arbitrary server-side proxy defaults (frequently 2048 or 4096). There is no model-aware token ceiling resolver.

### Observation 1.2: `callWorkspaceChatApi` in `app.js` (Lines 2025–2088)
```javascript
// app.js lines 2045-2081
      // First try with stream: true (supported by 100% of proxies, including stream-only proxies like gcli-fake-stream)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + currentProxy.key
          },
          body: JSON.stringify({
            model: model,
            messages: apiMessages,
            stream: true,
            temperature: 0.7
          }),
          signal: _workspaceAbortController.signal
        });

        if (res.ok) {
          const streamText = await parseAnyApiResponse(res, onChunk);
          if (streamText && streamText.trim().length > 0) {
            return streamText;
          }
        } else if (res.status === 400 || res.status === 404 || res.status === 405) {
          // If stream: true failed with 400/404/405, fallback to stream: false on same proxy
          const nonStreamRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + currentProxy.key
            },
            body: JSON.stringify({
              model: model,
              messages: apiMessages,
              max_tokens: 4096,
              stream: false
            }),
            signal: _workspaceAbortController.signal
          });
```
- **Finding**: For streaming requests in Workspace Assistant, `max_tokens` is entirely omitted (`undefined`). In non-streaming fallback, `max_tokens` is hardcoded to `4096`. Furthermore, `signal` binds directly to global `_workspaceAbortController.signal` rather than the passed parameter `customSignal || _workspaceAbortController?.signal`.

### Observation 1.3: System Prompts in `app.js` (Lines 1920–1926 and 5878–5915)
- **Finding**: In `buildSystemPrompt()` (line 5878) and Workspace Assistant `systemPrompt` (line 1920), there is no strict prohibition against code placeholders (e.g. `// ... rest of code here ...`, `/* existing code unchanged */`), which allows LLMs to abbreviate code outputs and underutilize turn token budgets.

---

## 2. Logic Chain

1. **Token Underutilization Root Cause**:
   - In `makeApiRequest`, setting `max_tokens: 1024` (flash) / `4096` (pro) or omitting it when unlimited is requested causes the LLM or proxy to truncate output prematurely or default to 2048/4096 tokens.
   - Modern frontier models support significantly higher output token ceilings:
     - 65,536 tokens: `o1`, `o3-mini`, `o4`, `gemini-2.5`, `gemini-3.1-pro-preview`, `claude-3-7-sonnet`, reasoning/thinking models.
     - 16,384 tokens: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4-turbo`, `gemini-2.0`, `qwen-2.5-coder`, `llama-3.3-70b`, `deepseek-chat`, `codestral`.
     - 8,192 tokens: `claude-3-5-sonnet`, `gemini-1.5-pro`, `gemini-1.5-flash`, `qwen`, `llama`.
     - 4,096 tokens: Legacy `gpt-4`, `gpt-3.5-turbo`, `claude-3-haiku`.

2. **System Prompt Anti-Placeholder Mandate**:
   - Even with a high `max_tokens` ceiling, LLMs often elide code using comments unless explicitly instructed otherwise.
   - Injecting an explicit, strict anti-placeholder directive in both `buildSystemPrompt()` and Workspace Assistant prompt forces 100% unabridged code generation.

3. **Proxy Fallback Safety**:
   - Some legacy or strictly-configured third-party proxy gateways reject requests with `max_tokens > 4096` returning HTTP 400 Bad Request.
   - Therefore, the request engine must implement token downgrade safety: if a proxy returns HTTP 400 with a token ceiling error, retry with a safe fallback (`4096` or omit `max_tokens`) before failing over to `altProxy`.

---

## 3. Caveats

- **Proxy-Specific Ceiling Limits**: Different proxy providers (OpenRouter, OneAPI, Groq, custom reverse proxies) may have differing upper bounds. The resolver should target the highest supported tier and rely on HTTP 400 retry fallback for constrained proxies.
- **Thinking/Reasoning Models Output Budget**: Reasoning models (e.g. `o1`, `o3-mini`, `deepseek-reasoner`, `gemini-2.0-flash-thinking`) use output tokens for internal chain-of-thought as well as final response. Setting `max_tokens` to 65,536 is essential to prevent thought-exhaustion truncation.

---

## 4. Conclusion & Concrete Fix Strategy

### Step 1: Implement Centralized Token Ceiling Resolver `resolveModelMaxTokens`
Add the helper function in `app.js` (around line 5634 alongside `getProxyForModel` / `getActiveModel`):
```javascript
function resolveModelMaxTokens(modelName, mode = 'pro') {
  if (!modelName || typeof modelName !== 'string') {
    return mode === 'flash' ? 4096 : 8192;
  }
  const m = modelName.toLowerCase();

  // Tier 1: 65,536 Tokens (Reasoning, Thinking, Extended-Output Models)
  if (
    m.includes('o1') || 
    m.includes('o3') || 
    m.includes('o4') || 
    m.includes('thinking') || 
    m.includes('reasoner') || 
    m.includes('gemini-2.5') || 
    m.includes('gemini-3') ||
    m.includes('claude-3-7') ||
    m.includes('claude-3.7')
  ) {
    return 65536;
  }

  // Tier 2: 16,384 Tokens (GPT-4o, GPT-4.1, Gemini 2.0, Qwen 2.5 Coder, Llama 3.3/3.1, DeepSeek)
  if (
    m.includes('gpt-4o') || 
    m.includes('gpt-4.1') || 
    m.includes('gpt-4-turbo') || 
    m.includes('gemini-2.0') || 
    m.includes('gemini-2') ||
    m.includes('qwen-2.5') || 
    m.includes('qwen2.5') || 
    m.includes('coder') ||
    m.includes('llama-3.3') || 
    m.includes('llama-3.1') ||
    m.includes('deepseek') ||
    m.includes('mistral-large') ||
    m.includes('codestral')
  ) {
    return 16384;
  }

  // Tier 3: 8,192 Tokens (Claude 3.5, Gemini 1.5, Modern General LLMs)
  if (
    m.includes('claude-3-5') || 
    m.includes('claude-3.5') || 
    m.includes('gemini-1.5') || 
    m.includes('gemini-1') ||
    m.includes('qwen') ||
    m.includes('llama') ||
    m.includes('glm-4')
  ) {
    return 8192;
  }

  // Tier 4: 4,096 Tokens (Legacy Models)
  if (m.includes('claude-3') || m.includes('gpt-4') || m.includes('gpt-3.5')) {
    return 4096;
  }

  // Default fallback based on active mode
  return mode === 'flash' ? 4096 : 8192;
}
```

### Step 2: Refactor `makeApiRequest` in `app.js` (around line 6245)
- Replace lines 6243-6258 with:
```javascript
      const maxTokensCeiling = resolveModelMaxTokens(modelToUse, State.mode);

      const reqBody = {
        model: modelToUse, 
        messages, 
        stream: true,
        temperature: State.mode === 'flash' ? 0.3 : 0.75,
        max_tokens: maxTokensCeiling,
        ...(State.mode === 'flash' ? {
          top_p: 0.85,
          frequency_penalty: 0.1,
          presence_penalty: 0.0
        } : {
          top_p: 0.95,
          frequency_penalty: 0.15,
          presence_penalty: 0.1
        })
      };
```
- In proxy error handling (around lines 6267-6287), if response status is `400` and `reqBody.max_tokens > 4096`, retry with `reqBody.max_tokens = 4096` before failing over to `altProxy`.

### Step 3: Refactor `callWorkspaceChatApi` in `app.js` (around line 2050)
- Resolve `const maxTokensCeiling = resolveModelMaxTokens(model, 'pro');`
- Set `max_tokens: maxTokensCeiling` in the `stream: true` payload:
```javascript
          body: JSON.stringify({
            model: model,
            messages: apiMessages,
            stream: true,
            max_tokens: maxTokensCeiling,
            temperature: 0.7
          }),
          signal: customSignal || _workspaceAbortController?.signal
```
- In `stream: false` fallback (line 2077), set `max_tokens: maxTokensCeiling`.

### Step 4: Refactor System Prompts for Anti-Placeholder Generation
- In `buildSystemPrompt()` (around line 5878), add:
```javascript
  parts.push(`[NGUYÊN TẮC TOÀN VẸN MÃ NGUỒN & KHAI THÁC TOKEN TỐI ĐA]:
- Tuyệt đối KHÔNG viết mã nguồn rút gọn, tóm tắt, hoặc sử dụng các chú thích placeholder (như "// ... rest of code ...", "// code cũ giữ nguyên", "/* TODO */", "// ... implement here ...").
- Luôn triển khai 100% đầy đủ, chi tiết từng hàm, từng module, toàn bộ logic và cấu trúc dữ liệu không bỏ sót bất kỳ dòng nào để khai thác tối đa dung lượng token của lượt gọi.`);
```
- In `sendWorkspaceMessage()` (around line 1920), update `systemPrompt`:
```javascript
    const systemPrompt = `[DANH TÍNH]: Bạn là Suna AI Workspace Assistant, trợ lý ảo chuyên trách hỗ trợ học tập và phát triển mã nguồn trực quan.
[MỤC TIÊU]: Phân tích, hướng dẫn hoặc chỉnh sửa trực tiếp mã nguồn HTML/CSS/JS hiện tại của người dùng.
[NGUYÊN TẮC MÃ NGUỒN TOÀN VẸN]: Khi tạo hoặc chỉnh sửa code, BẮT BUỘC viết mã nguồn hoàn chỉnh 100% không rút gọn. TUYỆT ĐỐI NGHIÊM CẤM dùng các chú thích placeholder (như "// ... rest of code ...", "// code cũ giữ nguyên", "/* ... */").
[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]:
\`\`\`html
${currentCode}
\`\`\`
Nếu người dùng yêu cầu chỉnh sửa hoặc viết lại code, hãy trả về toàn bộ hoặc khối mã nguồn HTML/CSS/JS hoàn chỉnh có thể chạy trực tiếp (Live Preview) nằm trong khối code fenced \`\`\`html ... \`\`\` để hệ thống tự động đồng bộ vào Live Workspace.`;
```

---

## 5. Verification Method

1. **Unit & Property Verification**:
   - Call `resolveModelMaxTokens` with:
     - `'gemini-3.1-pro-preview'` -> returns `65536`
     - `'o1-preview'` -> returns `65536`
     - `'claude-3-7-sonnet'` -> returns `65536`
     - `'gpt-4o'` -> returns `16384`
     - `'qwen-2.5-coder-32b'` -> returns `16384`
     - `'claude-3-5-sonnet-20241022'` -> returns `8192`
     - `'gpt-4'` -> returns `4096`
     - `''` or `null` -> returns `8192` (pro) / `4096` (flash)
2. **Payload Verification**:
   - Verify `makeApiRequest` generates `reqBody.max_tokens` matching model ceiling.
   - Verify `callWorkspaceChatApi` includes `max_tokens` in `fetch` body for both `stream: true` and `stream: false`.
3. **System Prompt Verification**:
   - Check `buildSystemPrompt()` output string contains anti-placeholder instructions.
   - Check workspace system prompt contains `[NGUYÊN TẮC MÃ NGUỒN TOÀN VẸN]`.
4. **Automated Verification Parity**:
   - Run `python run_verification.py` to ensure JavaScript syntax check (`node -c app.js && node -c redesign.js`), CSS hygiene, and 100% Mocha test pass.
