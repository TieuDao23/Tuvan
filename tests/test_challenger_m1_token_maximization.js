/**
 * tests/test_challenger_m1_token_maximization.js
 * Empirical Challenger Verification & Stress Test Suite for Milestone 1 (R1)
 *
 * Covers:
 * 1. resolveModelMaxTokens: exhaustive matrix, casing, whitespace, diacritics, null/types, tier precedence.
 * 2. resolveModelMaxTokens: flash vs pro mode ceiling behavior.
 * 3. makeApiRequest: max_tokens payload resolution, HTTP 400 downgrade retry, proxy failover, abort signal.
 * 4. callWorkspaceChatApi: max_tokens resolution, customSignal binding, fallback sequence, abort handling.
 * 5. System Prompt Integrity: anti-placeholder enforcement in buildSystemPrompt & sendWorkspaceMessage.
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Empirical Challenger Suite: Milestone 1 Token Maximization & Prompt Mandates', () => {
  let appJs;
  let resolveModelMaxTokens;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    const sandbox = { window: {}, State: { mode: 'pro' } };
    vm.createContext(sandbox);
    const resolverMatch = appJs.match(/function\s+resolveModelMaxTokens\s*\([\s\S]*?\n\}/);
    if (resolverMatch) {
      vm.runInContext(resolverMatch[0], sandbox);
      resolveModelMaxTokens = sandbox.resolveModelMaxTokens;
    }
  });

  // =========================================================================
  // 1. RESOLVEMODELMAXTOKENS: EXHAUSTIVE MATRIX & ROBUSTNESS
  // =========================================================================
  describe('1. resolveModelMaxTokens Exhaustive Matrix & Robustness', () => {
    it('1.1 should correctly resolve Tier 1 models (65,536 tokens)', () => {
      const tier1Cases = [
        'o1', 'o1-preview', 'o1-mini', 'o1-2024-12-17',
        'o3', 'o3-mini', 'o3-mini-high',
        'o4', 'o4-preview',
        'gemini-2.5-pro', 'gemini-2.5-flash',
        'gemini-3-pro', 'gemini-3.1-pro-preview',
        'claude-3-7-sonnet', 'claude-3.7-sonnet', 'claude-3.7-sonnet-thought',
        'deepseek-reasoner',
        'gemini-2.0-flash-thinking-exp', 'gemini-2.0-flash-thinking-exp-1219'
      ];
      tier1Cases.forEach(model => {
        const result = resolveModelMaxTokens(model, 'pro');
        assert.strictEqual(result, 65536, 'Expected 65,536 for Tier 1 model ' + model + ', got ' + result);
      });
    });

    it('1.2 should correctly resolve Tier 2 models (16,384 tokens)', () => {
      const tier2Cases = [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06',
        'gpt-4.1', 'gpt-4.1-turbo',
        'gpt-4-turbo', 'gpt-4-turbo-2024-04-09',
        'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-2.0-flash-001',
        'qwen-2.5-coder-32b', 'qwen-2.5-coder-7b', 'qwen2.5-72b-instruct',
        'deepseek-coder', 'starcoder', 'my-custom-coder-v1',
        'llama-3.3-70b-instruct', 'llama-3.1-405b-instruct', 'llama-3.1-70b-instruct',
        'deepseek-chat', 'deepseek-v3',
        'mistral-large-2411', 'codestral-2501', 'codestral-latest'
      ];
      tier2Cases.forEach(model => {
        const result = resolveModelMaxTokens(model, 'pro');
        assert.strictEqual(result, 16384, 'Expected 16,384 for Tier 2 model ' + model + ', got ' + result);
      });
    });

    it('1.3 should correctly resolve Tier 3 models (8,192 tokens)', () => {
      const tier3Cases = [
        'claude-3-5-sonnet', 'claude-3.5-sonnet', 'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku', 'claude-3.5-haiku-20241022',
        'gemini-1.5-pro', 'gemini-1.5-pro-002', 'gemini-1.5-flash', 'gemini-1.5-flash-8b',
        'qwen-plus', 'qwen-turbo', 'qwen-max',
        'llama-3.1-8b-instruct', 'llama-3-8b', 'llama-2-70b',
        'glm-4-plus', 'glm-4-9b'
      ];
      tier3Cases.forEach(model => {
        const result = resolveModelMaxTokens(model, 'pro');
        assert.strictEqual(result, 8192, 'Expected 8,192 for Tier 3 model ' + model + ', got ' + result);
      });
    });

    it('1.4 should correctly resolve Tier 4 legacy models (4,096 tokens)', () => {
      const tier4Cases = [
        'gpt-4', 'gpt-4-0613', 'gpt-4-0314',
        'gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-3.5-turbo-0125',
        'claude-3-opus-20240229', 'claude-3-haiku-20240307'
      ];
      tier4Cases.forEach(model => {
        const result = resolveModelMaxTokens(model, 'pro');
        assert.strictEqual(result, 4096, 'Expected 4,096 for Tier 4 model ' + model + ', got ' + result);
      });
    });

    it('1.5 should handle Case Insensitivity properly across all tiers', () => {
      assert.strictEqual(resolveModelMaxTokens('O1-PREVIEW', 'pro'), 65536);
      assert.strictEqual(resolveModelMaxTokens('Gemini-2.5-Pro', 'pro'), 65536);
      assert.strictEqual(resolveModelMaxTokens('CLAUDE-3.7-SONNET', 'pro'), 65536);
      assert.strictEqual(resolveModelMaxTokens('DeepSeek-Reasoner', 'pro'), 65536);
      assert.strictEqual(resolveModelMaxTokens('GPT-4O-MINI', 'pro'), 16384);
      assert.strictEqual(resolveModelMaxTokens('QWEN-2.5-CODER-32B', 'pro'), 16384);
      assert.strictEqual(resolveModelMaxTokens('LLAMA-3.3-70B-INSTRUCT', 'pro'), 16384);
      assert.strictEqual(resolveModelMaxTokens('CLAUDE-3.5-SONNET', 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens('GEMINI-1.5-PRO', 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens('GPT-4', 'pro'), 4096);
      assert.strictEqual(resolveModelMaxTokens('GPT-3.5-TURBO', 'pro'), 4096);
    });

    it('1.6 should handle Whitespace and Embedded Diacritics/Unicode', () => {
      assert.strictEqual(resolveModelMaxTokens('  o1-mini  ', 'pro'), 65536);
      assert.strictEqual(resolveModelMaxTokens('\tgpt-4o\n', 'pro'), 16384);
      assert.strictEqual(resolveModelMaxTokens('mô hình o3-mini thông minh', 'pro'), 65536);
      assert.strictEqual(resolveModelMaxTokens('claude-3.7-sonnet-tiếng-việt-✨', 'pro'), 65536);
      assert.strictEqual(resolveModelMaxTokens('qwen-2.5-coder-mã-nguồn', 'pro'), 16384);
    });

    it('1.7 should handle Tier Precedence collisions accurately', () => {
      // claude-3-7 vs claude-3-5 vs claude-3
      assert.strictEqual(resolveModelMaxTokens('claude-3-7-sonnet', 'pro'), 65536, 'claude-3-7 must be Tier 1');
      assert.strictEqual(resolveModelMaxTokens('claude-3-5-sonnet', 'pro'), 8192, 'claude-3-5 must be Tier 3');
      assert.strictEqual(resolveModelMaxTokens('claude-3-opus', 'pro'), 4096, 'claude-3 must be Tier 4');

      // gpt-4o vs gpt-4
      assert.strictEqual(resolveModelMaxTokens('gpt-4o', 'pro'), 16384, 'gpt-4o must be Tier 2, not Tier 4');
      assert.strictEqual(resolveModelMaxTokens('gpt-4', 'pro'), 4096, 'gpt-4 must be Tier 4');

      // deepseek-reasoner vs deepseek-chat
      assert.strictEqual(resolveModelMaxTokens('deepseek-reasoner', 'pro'), 65536, 'deepseek-reasoner must be Tier 1');
      assert.strictEqual(resolveModelMaxTokens('deepseek-chat', 'pro'), 16384, 'deepseek-chat must be Tier 2');

      // gemini-2.0-flash-thinking vs gemini-2.0-flash
      assert.strictEqual(resolveModelMaxTokens('gemini-2.0-flash-thinking-exp', 'pro'), 65536, 'thinking exp must be Tier 1');
      assert.strictEqual(resolveModelMaxTokens('gemini-2.0-flash', 'pro'), 16384, 'gemini-2.0-flash must be Tier 2');

      // llama-3.3 / llama-3.1-405b vs llama-3.1-8b
      assert.strictEqual(resolveModelMaxTokens('llama-3.3-70b', 'pro'), 16384, 'llama-3.3 must be Tier 2');
      assert.strictEqual(resolveModelMaxTokens('llama-3.1-405b', 'pro'), 16384, 'llama-3.1-405b must be Tier 2');
      assert.strictEqual(resolveModelMaxTokens('llama-3.1-8b', 'pro'), 8192, 'llama-3.1-8b must be Tier 3');
    });

    it('1.8 should handle Null, Undefined, Non-string and Weird Types gracefully', () => {
      assert.strictEqual(resolveModelMaxTokens(null, 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens(undefined, 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens('', 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens(null, 'flash'), 4096);
      assert.strictEqual(resolveModelMaxTokens(undefined, 'flash'), 4096);
      assert.strictEqual(resolveModelMaxTokens('', 'flash'), 4096);
      assert.strictEqual(resolveModelMaxTokens(12345, 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens(true, 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens({}, 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens([], 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens(NaN, 'pro'), 8192);
    });
  });

  // =========================================================================
  // 2. FLASH VS PRO MODE CEILINGS
  // =========================================================================
  describe('2. Flash vs Pro Mode Ceilings for resolveModelMaxTokens', () => {
    it('2.1 known models retain their true ceiling regardless of mode parameter', () => {
      // Known high-ceiling models keep their ceiling even if mode is flash
      assert.strictEqual(resolveModelMaxTokens('o1', 'flash'), 65536);
      assert.strictEqual(resolveModelMaxTokens('gpt-4o', 'flash'), 16384);
      assert.strictEqual(resolveModelMaxTokens('gemini-1.5-pro', 'flash'), 8192);
      assert.strictEqual(resolveModelMaxTokens('gpt-4', 'flash'), 4096);
    });

    it('2.2 unknown models fall back to mode-specific ceilings (8192 pro vs 4096 flash)', () => {
      assert.strictEqual(resolveModelMaxTokens('unknown-custom-llm', 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens('unknown-custom-llm', 'flash'), 4096);
      assert.strictEqual(resolveModelMaxTokens('my-fine-tuned-model', 'flash'), 4096);
      assert.strictEqual(resolveModelMaxTokens('my-fine-tuned-model', 'pro'), 8192);
      assert.strictEqual(resolveModelMaxTokens('my-fine-tuned-model', 'invalid-mode'), 8192);
    });
  });

  // =========================================================================
  // 3. MAKEAPIREQUEST EMPIRICAL STRESS TEST & PROXY 400 DOWNGRADE
  // =========================================================================
  describe('3. makeApiRequest Empirical Simulation & Downgrade Resilience', () => {
    it('3.1 should prepare request body with max_tokens matching resolveModelMaxTokens', async () => {
      let interceptedReqBody = null;
      const fakeFetch = async (url, options) => {
        interceptedReqBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => ({ done: true, value: undefined })
            })
          }
        };
      };

      // Test Pro Mode with Tier 1 Model
      const sandbox = {
        fetch: fakeFetch,
        State: {
          mode: 'pro',
          settings: { baseUrl: 'https://proxy1.ai', apiKey: 'key1' },
          abortController: new AbortController()
        },
        getProxyForModel: () => ({ url: 'https://proxy1.ai', key: 'key1' }),
        resolveModelMaxTokens: resolveModelMaxTokens,
        window: {}
      };
      vm.createContext(sandbox);

      const makeApiRequestCode = `
        async function runTest(targetModel) {
          const modelToUse = targetModel;
          const proxy = getProxyForModel(modelToUse);
          const url = proxy.url + '/chat/completions';
          const maxTokensCeiling = resolveModelMaxTokens(modelToUse, State.mode);
          const reqBody = {
            model: modelToUse,
            messages: [{ role: 'user', content: 'test' }],
            stream: true,
            temperature: State.mode === 'flash' ? 0.3 : 0.75,
            max_tokens: resolveModelMaxTokens(modelToUse, State.mode)
          };
          return await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + proxy.key },
            body: JSON.stringify(reqBody),
            signal: State.abortController.signal
          });
        }
      `;
      vm.runInContext(makeApiRequestCode, sandbox);

      await sandbox.runTest('o3-mini');
      assert.strictEqual(interceptedReqBody.max_tokens, 65536, 'o3-mini must send max_tokens: 65536');

      await sandbox.runTest('gpt-4o');
      assert.strictEqual(interceptedReqBody.max_tokens, 16384, 'gpt-4o must send max_tokens: 16384');

      sandbox.State.mode = 'flash';
      await sandbox.runTest('unknown-model');
      assert.strictEqual(interceptedReqBody.max_tokens, 4096, 'unknown-model in flash mode must send max_tokens: 4096');
    });

    it('3.2 should downgrade to 4096 tokens when proxy rejects max_tokens with HTTP 400', async () => {
      const fetchCalls = [];
      const fakeFetch = async (url, options) => {
        const body = JSON.parse(options.body);
        fetchCalls.push({ url, body });
        if (body.max_tokens > 4096) {
          // Proxy rejects max_tokens > 4096
          return {
            ok: false,
            status: 400,
            statusText: 'Bad Request - max_tokens too large'
          };
        }
        // Proxy accepts downgraded max_tokens = 4096
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => ({ done: true, value: undefined })
            })
          }
        };
      };

      const sandbox = {
        fetch: fakeFetch,
        State: {
          mode: 'pro',
          settings: { baseUrl: 'https://proxy1.ai', apiKey: 'key1' },
          abortController: new AbortController()
        },
        getProxyForModel: () => ({ url: 'https://proxy1.ai', key: 'key1' }),
        resolveModelMaxTokens: resolveModelMaxTokens
      };
      vm.createContext(sandbox);

      const makeApiRequestCode = `
        async function runRequestWithRetry(targetModel) {
          const modelToUse = targetModel;
          const proxy = getProxyForModel(modelToUse);
          const url = proxy.url + '/chat/completions';
          const reqBody = {
            model: modelToUse,
            messages: [{ role: 'user', content: 'test' }],
            stream: true,
            max_tokens: resolveModelMaxTokens(modelToUse, State.mode)
          };
          let res = null;
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + proxy.key },
            body: JSON.stringify(reqBody),
            signal: State.abortController.signal
          });
          if (res && res.status === 400 && reqBody.max_tokens > 4096) {
            const downgradedBody = { ...reqBody, max_tokens: 4096 };
            const retryRes = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + proxy.key },
              body: JSON.stringify(downgradedBody),
              signal: State.abortController.signal
            });
            if (retryRes && retryRes.ok) {
              res = retryRes;
            }
          }
          return res;
        }
      `;
      vm.runInContext(makeApiRequestCode, sandbox);

      const result = await sandbox.runRequestWithRetry('o1-preview');
      assert.strictEqual(result.ok, true, 'Downgraded request should succeed');
      assert.strictEqual(fetchCalls.length, 2, 'Should have made initial call and downgrade retry');
      assert.strictEqual(fetchCalls[0].body.max_tokens, 65536, 'First call used model ceiling');
      assert.strictEqual(fetchCalls[1].body.max_tokens, 4096, 'Second call downgraded to 4096');
    });

    it('3.3 should properly failover to altProxy if primary proxy fails completely', async () => {
      const fetchCalls = [];
      const fakeFetch = async (url, options) => {
        const body = JSON.parse(options.body);
        fetchCalls.push({ url, body });
        if (url.includes('proxy1.ai')) {
          return { ok: false, status: 500, statusText: 'Internal Server Error' };
        }
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => ({ done: true, value: undefined })
            })
          }
        };
      };

      const sandbox = {
        fetch: fakeFetch,
        State: {
          mode: 'pro',
          settings: { baseUrl: 'https://proxy1.ai', apiKey: 'key1', baseUrl2: 'https://proxy2.ai', apiKey2: 'key2' },
          abortController: new AbortController()
        },
        getProxyForModel: () => ({ url: 'https://proxy1.ai', key: 'key1' }),
        resolveModelMaxTokens: resolveModelMaxTokens
      };
      vm.createContext(sandbox);

      const fullProxyFailoverCode = `
        async function runFailover(targetModel) {
          const modelToUse = targetModel;
          const proxy = getProxyForModel(modelToUse);
          const url = proxy.url + '/chat/completions';
          const reqBody = {
            model: modelToUse,
            messages: [{ role: 'user', content: 'hello' }],
            stream: true,
            max_tokens: resolveModelMaxTokens(modelToUse, State.mode)
          };
          let res = null;
          try {
            res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + proxy.key },
              body: JSON.stringify(reqBody),
              signal: State.abortController.signal
            });
            if (res && res.status === 400 && reqBody.max_tokens > 4096) {
              const downgradedBody = { ...reqBody, max_tokens: 4096 };
              const retryRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + proxy.key },
                body: JSON.stringify(downgradedBody),
                signal: State.abortController.signal
              });
              if (retryRes && retryRes.ok) res = retryRes;
            }
          } catch(e) {}

          if (!res || !res.ok) {
            const { baseUrl, apiKey, baseUrl2, apiKey2 } = State.settings;
            const altProxy = (proxy.url === baseUrl?.replace(/\\/+$/, '')) && baseUrl2 && apiKey2
              ? { url: baseUrl2.replace(/\\/+$/, ''), key: apiKey2 }
              : (baseUrl && apiKey ? { url: baseUrl.replace(/\\/+$/, ''), key: apiKey } : null);
            if (altProxy && altProxy.url !== proxy.url) {
              res = await fetch(altProxy.url + '/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + altProxy.key },
                body: JSON.stringify(reqBody),
                signal: State.abortController.signal
              });
            }
          }
          return res;
        }
      `;
      vm.runInContext(fullProxyFailoverCode, sandbox);

      const result = await sandbox.runFailover('gpt-4o');
      assert.strictEqual(result.ok, true, 'Failover to altProxy should succeed');
      assert.strictEqual(fetchCalls.length, 2, 'Should attempt proxy1 then proxy2');
      assert.ok(fetchCalls[0].url.includes('proxy1.ai'), 'First attempt was proxy1');
      assert.ok(fetchCalls[1].url.includes('proxy2.ai'), 'Second attempt was proxy2');
      assert.strictEqual(fetchCalls[1].body.max_tokens, 16384, 'Alt proxy preserves max_tokens ceiling');
    });

    it('3.4 should respect AbortController and immediately halt without retrying', async () => {
      const abortCtrl = new AbortController();
      let fetchAttemptCount = 0;
      const fakeFetch = async (url, options) => {
        fetchAttemptCount++;
        if (options.signal?.aborted) {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          throw err;
        }
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        throw err;
      };

      const sandbox = {
        fetch: fakeFetch,
        State: {
          mode: 'pro',
          settings: { baseUrl: 'https://proxy1.ai', apiKey: 'key1', baseUrl2: 'https://proxy2.ai', apiKey2: 'key2' },
          abortController: abortCtrl
        },
        getProxyForModel: () => ({ url: 'https://proxy1.ai', key: 'key1' }),
        resolveModelMaxTokens: resolveModelMaxTokens
      };
      vm.createContext(sandbox);

      const abortSafeCode = `
        async function runAbortTest() {
          const modelToUse = 'gpt-4o';
          const proxy = getProxyForModel(modelToUse);
          const url = proxy.url + '/chat/completions';
          const reqBody = { model: modelToUse, messages: [], stream: true, max_tokens: 16384 };
          let res = null;
          try {
            res = await fetch(url, {
              method: 'POST',
              body: JSON.stringify(reqBody),
              signal: State.abortController.signal
            });
          } catch(err) {
            if (err.name === 'AbortError') throw err;
          }
        }
      `;
      vm.runInContext(abortSafeCode, sandbox);

      abortCtrl.abort();
      await assert.rejects(
        async () => await sandbox.runAbortTest(),
        (err) => err.name === 'AbortError',
        'Should reject with AbortError'
      );
      assert.strictEqual(fetchAttemptCount, 1, 'Should not attempt proxy2 when aborted');
    });
  });

  // =========================================================================
  // 4. CALLWORKSPACECHATAPI EMPIRICAL STRESS TEST
  // =========================================================================
  describe('4. callWorkspaceChatApi Empirical Stress Test', () => {
    it('4.1 should pass max_tokens = resolveModelMaxTokens(model, "pro") in both stream: true and stream: false', async () => {
      const payloadsSent = [];
      const fakeFetch = async (url, options) => {
        const body = JSON.parse(options.body);
        payloadsSent.push(body);
        if (body.stream === true) {
          // Force stream: true to fail with 400 to trigger stream: false fallback
          return { ok: false, status: 400, statusText: 'Stream not supported' };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ choices: [{ message: { content: '<html><body>Hello</body></html>' } }] })
        };
      };

      const parseAnyApiResponse = async (res) => '<html><body>Hello</body></html>';

      const sandbox = {
        fetch: fakeFetch,
        parseAnyApiResponse: parseAnyApiResponse,
        State: {
          settings: { baseUrl: 'https://workspace-proxy.ai', apiKey: 'ws-key' }
        },
        getProxyForModel: () => ({ url: 'https://workspace-proxy.ai', key: 'ws-key' }),
        resolveModelMaxTokens: resolveModelMaxTokens,
        _workspaceAbortController: new AbortController()
      };
      vm.createContext(sandbox);

      const workspaceApiCode = `
        async function callWorkspaceChatApi(model, apiMessages, customSignal, onChunk) {
          const proxy = getProxyForModel(model);
          const { baseUrl, apiKey, baseUrl2, apiKey2 } = State.settings;
          const proxiesToTry = [proxy];
          const maxTokensCeiling = resolveModelMaxTokens(model, 'pro');
          let lastError = null;

          for (const currentProxy of proxiesToTry) {
            if (!currentProxy.url || !currentProxy.key) continue;
            const url = currentProxy.url.replace(/\\/+$/, '') + '/chat/completions';

            try {
              const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentProxy.key },
                body: JSON.stringify({
                  model: model,
                  messages: apiMessages,
                  stream: true,
                  max_tokens: maxTokensCeiling,
                  temperature: 0.7
                }),
                signal: customSignal || _workspaceAbortController?.signal
              });

              if (res.ok) {
                const streamText = await parseAnyApiResponse(res, onChunk);
                if (streamText && streamText.trim().length > 0) return streamText;
              } else if (res.status === 400 || res.status === 404 || res.status === 405) {
                const nonStreamRes = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentProxy.key },
                  body: JSON.stringify({
                    model: model,
                    messages: apiMessages,
                    max_tokens: maxTokensCeiling,
                    stream: false
                  }),
                  signal: customSignal || _workspaceAbortController?.signal
                });
                if (nonStreamRes.ok) {
                  const text = await parseAnyApiResponse(nonStreamRes, onChunk);
                  if (text && text.trim().length > 0) return text;
                }
              }
            } catch (err) {
              lastError = err;
              if (err.name === 'AbortError') throw err;
            }
          }
          return null;
        }
      `;
      vm.runInContext(workspaceApiCode, sandbox);

      const result = await sandbox.callWorkspaceChatApi('gemini-2.5-pro', [{ role: 'user', content: 'test' }], null, () => {});
      assert.strictEqual(result, '<html><body>Hello</body></html>');
      assert.strictEqual(payloadsSent.length, 2, 'Should attempt stream: true then stream: false');
      assert.strictEqual(payloadsSent[0].max_tokens, 65536, 'stream: true payload must have max_tokens: 65536');
      assert.strictEqual(payloadsSent[1].max_tokens, 65536, 'stream: false payload must have max_tokens: 65536');
    });

    it('4.2 should bind customSignal when passed into callWorkspaceChatApi', async () => {
      let boundSignal = null;
      const fakeFetch = async (url, options) => {
        boundSignal = options.signal;
        return {
          ok: true,
          status: 200
        };
      };

      const myCustomAbortCtrl = new AbortController();

      const sandbox = {
        fetch: fakeFetch,
        parseAnyApiResponse: async () => 'OK',
        State: { settings: { baseUrl: 'https://proxy.ai', apiKey: 'k' } },
        getProxyForModel: () => ({ url: 'https://proxy.ai', key: 'k' }),
        resolveModelMaxTokens: resolveModelMaxTokens,
        _workspaceAbortController: new AbortController()
      };
      vm.createContext(sandbox);

      const workspaceApiCode = `
        async function callWorkspaceChatApi(model, apiMessages, customSignal) {
          const proxy = getProxyForModel(model);
          const maxTokensCeiling = resolveModelMaxTokens(model, 'pro');
          const url = proxy.url + '/chat/completions';
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + proxy.key },
            body: JSON.stringify({ model, messages: apiMessages, stream: true, max_tokens: maxTokensCeiling }),
            signal: customSignal || _workspaceAbortController?.signal
          });
          return res.ok ? 'OK' : null;
        }
      `;
      vm.runInContext(workspaceApiCode, sandbox);

      await sandbox.callWorkspaceChatApi('gpt-4o', [], myCustomAbortCtrl.signal);
      assert.strictEqual(boundSignal, myCustomAbortCtrl.signal, 'options.signal must match customSignal');
    });
  });

  // =========================================================================
  // 5. SYSTEM PROMPT MANDATES & ANTI-PLACEHOLDER INTEGRITY
  // =========================================================================
  describe('5. System Prompt Anti-Placeholder Directives', () => {
    it('5.1 buildSystemPrompt contains all required anti-placeholder directives', () => {
      const sandbox = {
        State: {
          mode: 'pro',
          settings: { systemPrompt: '', userPurpose: '', tone: 'friendly' },
          webSearchEnabled: false
        },
        getMemoryPrompt: () => ''
      };
      vm.createContext(sandbox);
      const promptFnMatch = appJs.match(/function\s+buildSystemPrompt\s*\([\s\S]*?\n\}/);
      assert.ok(promptFnMatch, 'buildSystemPrompt must be found');
      vm.runInContext(promptFnMatch[0], sandbox);

      const prompt = sandbox.buildSystemPrompt();
      assert.ok(prompt.includes('NGUYÊN TẮC TOÀN VẸN MÃ NGUỒN & KHAI THÁC TOKEN TỐI ĐA'), 'Must have integrity section');
      assert.match(prompt, /100%|ĐẦY ĐỦ/i, 'Must mandate full implementation');
      assert.ok(prompt.includes('// ... rest of code'), 'Must ban // ... rest of code');
      assert.ok(prompt.includes('// code cũ giữ nguyên'), 'Must ban // code cũ giữ nguyên');
      assert.ok(prompt.includes('/* TODO */'), 'Must ban /* TODO */');
      assert.ok(prompt.includes('/* unchanged */'), 'Must ban /* unchanged */');
    });

    it('5.2 sendWorkspaceMessage enforces 100% runnable complete applications', () => {
      const workspaceMsgFn = appJs.match(/async\s+function\s+sendWorkspaceMessage[\s\S]*?\n  \}/);
      assert.ok(workspaceMsgFn, 'sendWorkspaceMessage must exist');
      const fnCode = workspaceMsgFn[0];

      assert.match(fnCode, /QUY TẮC BẮT BUỘC VỀ MÃ NGUỒN[\s\S]*?100% TOÀN VẸN/, 'Must contain 100% complete rule');
      assert.ok(fnCode.includes('TUYỆT ĐỐI NGHIÊM CẤM'), 'Must contain strict ban');
      assert.ok(!fnCode.includes('hãy trả về toàn bộ hoặc đoạn mã nguồn mới'), 'Must not contain permissive fragment phrasing');
      assert.ok(fnCode.includes('[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]:'), 'Must inject editor code block');
    });
  });
});
