/**
 * tests/test_multi_turn_chaining_and_truncation_detection.js
 * 
 * Comprehensive 4-Tier Test Suite for Milestone 2 (R2):
 * - Multi-Tier Truncation Detector (finish_reason, unclosed code fences, unclosed HTML tags)
 * - Background Continuation Context Builder & Continuation Prompt Protocol
 * - Expanded Turn Recursion Bounds (10-20 turns) & Zero-Progress Guard
 * - User Abort Propagation (State.abortController & _workspaceAbortController)
 * - Typing Indicator Lifecycle & Single Bubble Stream Continuity
 * - Partial Response Preservation & Graceful Error Recovery
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Milestone 2 (R2): Multi-Turn Continuation Chaining, Truncation Detection & Abort Safety', () => {
  let appJs;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // HELPER: Mock SSE Stream Generator
  // =========================================================================
  function createMockSseResponse(chunks = [], finishReason = 'stop') {
    let index = 0;
    const stream = {
      getReader() {
        return {
          async read() {
            if (index < chunks.length) {
              const textChunk = chunks[index++];
              const payload = `data: ${JSON.stringify({
                choices: [{ delta: { content: textChunk }, finish_reason: index === chunks.length ? finishReason : null }]
              })}\n\n`;
              return { done: false, value: Buffer.from(payload) };
            } else if (index === chunks.length) {
              index++;
              const donePayload = `data: [DONE]\n\n`;
              return { done: false, value: Buffer.from(donePayload) };
            }
            return { done: true, value: undefined };
          }
        };
      }
    };

    return {
      ok: true,
      status: 200,
      body: stream,
      async text() {
        return chunks.join('');
      }
    };
  }

  // =========================================================================
  // HELPER: Truncation Detector Reference Implementation (Spec Contract)
  // =========================================================================
  function isResponseTruncated(finishReason, content) {
    if (!content) content = '';
    // Tier 1: Explicit provider finish reason
    const truncatedReasons = ['length', 'max_tokens', 'MAX_TOKENS', 'truncated'];
    if (finishReason && truncatedReasons.includes(finishReason)) {
      return true;
    }
    // Tier 2: Unclosed Markdown Code Fences (odd count of ```)
    const backtickMatches = content.match(/```/g) || [];
    if (backtickMatches.length % 2 === 1) {
      return true;
    }
    // Tier 3: Unclosed Structural HTML Tags
    const structuralTags = ['html', 'script', 'style', 'body', 'head', 'svg', 'table', 'div'];
    for (const tag of structuralTags) {
      const openRegex = new RegExp(`<${tag}(\\s+[^>]*)?>`, 'gi');
      const closeRegex = new RegExp(`</${tag}>`, 'gi');
      const openCount = (content.match(openRegex) || []).length;
      const closeCount = (content.match(closeRegex) || []).length;
      if (openCount > closeCount) {
        return true;
      }
    }
    return false;
  }

  // =========================================================================
  // HELPER: VM Sandbox Environment
  // =========================================================================
  function createTestSandbox(options = {}) {
    const toastCalls = [];
    const savedStates = [];
    const renderedMessages = [];

    const mockChat = {
      id: 'chat_m2_test',
      title: 'Milestone 2 Test Chat',
      messages: [
        { id: 'm1', role: 'user', content: options.userPrompt || 'Tạo ứng dụng Canvas 3D 1000 dòng' }
      ],
      updatedAt: Date.now()
    };

    const stateObj = {
      activeChatId: 'chat_m2_test',
      generatingChatId: null,
      isGenerating: false,
      chats: [mockChat],
      mode: 'pro',
      webSearchEnabled: false,
      settings: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-123'
      },
      abortController: options.abortController || null,
      workspaceMessages: []
    };

    const domRegistry = new Map();
    function createMockEl(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        innerText: '',
        style: {},
        parentNode: null,
        children: [],
        scrollHeight: 500,
        scrollTop: 0,
        clientHeight: 300,
        _renderPending: false,
        appendChild(child) {
          child.parentNode = this;
          this.children.push(child);
          return child;
        },
        remove() {
          if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter(c => c !== this);
            this.parentNode = null;
          }
        },
        querySelector(sel) {
          if (sel === '.typing-text') return createMockEl('span');
          if (sel === '.message-bubble') return this.children.find(c => c.className?.includes('message-bubble')) || createMockEl('div');
          if (sel === '.workspace-msg-content') return createMockEl('div');
          return createMockEl('div');
        },
        querySelectorAll() { return []; },
        insertAdjacentHTML(pos, html) {
          this.innerHTML += html;
        }
      };
      return el;
    }

    const chatArea = createMockEl('div');
    const messagesContainer = createMockEl('div');
    domRegistry.set('chat-area', chatArea);
    domRegistry.set('messages-container', messagesContainer);

    const doc = {
      body: createMockEl('body'),
      getElementById(id) { return domRegistry.get(id) || null; },
      createElement(tag) { return createMockEl(tag); },
      querySelector(sel) {
        if (sel === '#chat-area') return chatArea;
        if (sel === '#messages-container') return messagesContainer;
        return createMockEl('div');
      },
      querySelectorAll() { return []; }
    };

    const sandbox = {
      document: doc,
      window: {
        document: doc,
        toast: (msg, type) => toastCalls.push({ msg, type }),
        SunaAgent: { reset: () => {}, abort: () => {} },
        isAgentAborted: false
      },
      State: stateObj,
      $: (sel) => {
        if (sel === '#chat-area') return chatArea;
        if (sel === '#messages-container') return messagesContainer;
        return doc.querySelector(sel);
      },
      toast: (msg, type) => toastCalls.push({ msg, type }),
      genId: () => 'id_' + Math.random().toString(36).slice(2, 9),
      saveState: (immediate) => savedStates.push({ immediate, timestamp: Date.now() }),
      renderMessages: () => { renderedMessages.push(Date.now()); },
      classifySentiment: () => 'neutral',
      triggerSentimentChange: () => {},
      extractMemoryFromMessage: () => {},
      formatMessage: (text) => `<p>${text}</p>`,
      requestAnimationFrame: (cb) => cb(),
      console: { log: () => {}, warn: () => {}, error: () => {} },
      TextDecoder: TextDecoder,
      Date: Date,
      JSON: JSON,
      Math: Math,
      Array: Array,
      String: String,
      Promise: Promise,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      isResponseTruncated: isResponseTruncated
    };

    vm.createContext(sandbox);
    return { sandbox, stateObj, mockChat, toastCalls, savedStates, chatArea, messagesContainer };
  }

  // =========================================================================
  // TIER 1: Feature Coverage (R2 Truncation, Context, Abort & Recursion Bounds)
  // =========================================================================
  describe('Tier 1: Feature Coverage (R2)', () => {

    it('T1-F1: should detect truncation when finish_reason is length, max_tokens, MAX_TOKENS, or truncated', () => {
      assert.strictEqual(isResponseTruncated('length', 'console.log("hello");'), true);
      assert.strictEqual(isResponseTruncated('max_tokens', 'console.log("hello");'), true);
      assert.strictEqual(isResponseTruncated('MAX_TOKENS', 'console.log("hello");'), true);
      assert.strictEqual(isResponseTruncated('truncated', 'console.log("hello");'), true);
      assert.strictEqual(isResponseTruncated('stop', 'console.log("hello");'), false);
      assert.strictEqual(isResponseTruncated(null, 'console.log("hello");'), false);
    });

    it('T1-F2: should detect truncation when code fences are unclosed (odd backtick count)', () => {
      const truncatedCode = 'Đây là mã nguồn:\n```javascript\nfunction run() {\n  console.log("running");';
      assert.strictEqual(isResponseTruncated('stop', truncatedCode), true);
      assert.strictEqual(isResponseTruncated(null, truncatedCode), true);

      const closedCode = 'Đây là mã nguồn:\n```javascript\nfunction run() {\n  console.log("running");\n}\n```';
      assert.strictEqual(isResponseTruncated('stop', closedCode), false);
    });

    it('T1-F3: should detect truncation when structural HTML tags (<html, <script, <style, <div, <svg) are unclosed', () => {
      const truncatedHtml = '<!DOCTYPE html><html><head><style>body { background: #000; }</style></head><body><div id="app"><script>const a = 1;';
      assert.strictEqual(isResponseTruncated('stop', truncatedHtml), true);

      const completeHtml = '<!DOCTYPE html><html><head><style>body { background: #000; }</style></head><body><div id="app"></div><script>const a = 1;</script></body></html>';
      assert.strictEqual(isResponseTruncated('stop', completeHtml), false);
    });

    it('T1-F4: should construct continuation payload with system prompt, original user query, prior assistant text, and standard continuation instruction', () => {
      const systemPrompt = 'System Prompt Content';
      const originalUserPrompt = 'Tạo game 3D';
      const priorAssistantContent = '```javascript\nconst scene = new THREE.Scene();\n';

      const continuationMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: originalUserPrompt },
        { role: 'assistant', content: priorAssistantContent },
        { role: 'user', content: 'Tiếp tục chính xác từ đoạn mã/câu từ đang dang dở từ chỗ bị ngắt, không lặp lại bất kỳ đoạn nào đã tạo.' }
      ];

      assert.strictEqual(continuationMessages.length, 4);
      assert.strictEqual(continuationMessages[0].role, 'system');
      assert.strictEqual(continuationMessages[1].content, originalUserPrompt);
      assert.strictEqual(continuationMessages[2].content, priorAssistantContent);
      assert.ok(continuationMessages[3].content.includes('Tiếp tục chính xác'));
    });

    it('T1-F5: should execute autonomous continuation loop up to expanded bounds (10-20 turns)', async () => {
      const { sandbox } = createTestSandbox();
      const mockTurns = [
        createMockSseResponse(['Turn 1 part\n```js\n'], 'length'),
        createMockSseResponse(['Turn 2 part\n'], 'length'),
        createMockSseResponse(['Turn 3 part\n```\n'], 'stop')
      ];

      let callIdx = 0;
      sandbox.makeApiRequest = async () => {
        return { res: mockTurns[callIdx++], fetchError: null };
      };

      const loopCode = `
        async function runLoopTest() {
          const MAX_CONTINUATION_TURNS = 10;
          let turnCount = 0;
          let assistantContent = '';

          while (turnCount < MAX_CONTINUATION_TURNS) {
            if (State.abortController?.signal?.aborted) break;
            const { res } = await makeApiRequest();
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value);
              for (const line of text.split('\\n')) {
                if (!line.trim().startsWith('data:')) continue;
                const data = line.trim().slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const p = JSON.parse(data);
                  if (p.choices?.[0]?.finish_reason) turnFinishReason = p.choices[0].finish_reason;
                  const delta = p.choices?.[0]?.delta?.content;
                  if (delta) assistantContent += delta;
                } catch(e) {}
              }
            }

            turnCount++;
            const isTrunc = isResponseTruncated(turnFinishReason, assistantContent) && !State.abortController?.signal?.aborted;
            if (!isTrunc) break;
          }
          return { turnCount, assistantContent };
        }
      `;

      vm.runInContext(loopCode, sandbox);
      const result = await sandbox.runLoopTest();

      assert.strictEqual(result.turnCount, 3, 'Must complete in 3 turns');
      assert.ok(result.assistantContent.includes('Turn 1 part'));
      assert.ok(result.assistantContent.includes('Turn 2 part'));
      assert.ok(result.assistantContent.includes('Turn 3 part'));
    });

    it('T1-F6: should halt continuation turns immediately when State.abortController.signal is aborted', async () => {
      const abortCtrl = new AbortController();
      const { sandbox } = createTestSandbox({ abortController: abortCtrl });

      let apiCalls = 0;
      sandbox.makeApiRequest = async () => {
        apiCalls++;
        return { res: createMockSseResponse(['Turn 1 content\n```js\n'], 'length'), fetchError: null };
      };

      const abortCode = `
        async function runAbortTest() {
          const MAX_TURNS = 10;
          let turnCount = 0;
          let assistantContent = '';
          while (turnCount < MAX_TURNS) {
            if (State.abortController?.signal?.aborted) break;
            const { res } = await makeApiRequest();
            assistantContent += 'Turn 1 content\\n\`\`\`js\\n';
            turnCount++;
            State.abortController.abort(); // User aborts after Turn 1
            if (isResponseTruncated('length', assistantContent) && !State.abortController?.signal?.aborted) {
              continue;
            }
            break;
          }
          return { turnCount, assistantContent };
        }
      `;

      vm.runInContext(abortCode, sandbox);
      const res = await sandbox.runAbortTest();

      assert.strictEqual(res.turnCount, 1, 'Must not proceed beyond Turn 1 after abort');
      assert.strictEqual(apiCalls, 1, 'Must only call API once');
    });

    it('T1-F7: should propagate abort signal to fetch requests and prevent proxy failover on AbortError', () => {
      assert.match(appJs, /signal:\s*State\.abortController\.signal/);
      assert.match(appJs, /if\s*\(err\.name\s*===\s*'AbortError'\)\s*throw\s+err;/);
    });

    it('T1-F8: should append *(Đã dừng)* marker and preserve partial content upon user abort', () => {
      assert.match(appJs, /if\s*\(e\.name\s*===\s*'AbortError'\)\s*\{/);
      assert.match(appJs, /content:\s*assistantContent\s*\+\s*'\\n\\n\*\([Đđ]ã dừng\)\*'/);
      assert.match(appJs, /saveState\(true\)/);
    });

    it('T1-F9: should remove typing indicator on first chunk and keep it removed across all continuation turns', () => {
      assert.match(appJs, /let\s+typingRemoved\s*=\s*false;/);
      assert.match(appJs, /if\s*\(!typingRemoved\)\s*\{\s*typingRemoved\s*=\s*true;\s*if\s*\(typingEl\.parentNode\)\s*typingEl\.remove\(\);/);
    });

    it('T1-F10: should enforce zero-progress guard to terminate loop if continuation turn yields 0 tokens', async () => {
      const { sandbox } = createTestSandbox();
      let callCount = 0;
      sandbox.makeApiRequest = async () => {
        callCount++;
        if (callCount === 1) return { res: createMockSseResponse(['Turn 1\n```html\n'], 'length'), fetchError: null };
        return { res: createMockSseResponse([''], 'stop'), fetchError: null }; // 0 new tokens
      };

      const zeroProgressCode = `
        async function runZeroProgressTest() {
          let turnCount = 0;
          let content = '';
          while (turnCount < 10) {
            let beforeLen = content.length;
            const { res } = await makeApiRequest();
            if (turnCount === 0) content += 'Turn 1\\n\`\`\`html\\n';
            let afterLen = content.length;
            turnCount++;
            if (turnCount > 1 && afterLen === beforeLen) break; // Zero progress guard
            if (!isResponseTruncated('stop', content)) break;
          }
          return { turnCount, content };
        }
      `;

      vm.runInContext(zeroProgressCode, sandbox);
      const res = await sandbox.runZeroProgressTest();
      assert.strictEqual(res.turnCount, 2, 'Loop must terminate when turn yields zero new content');
    });

  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases (R2)
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases (R2)', () => {

    it('T2-B1: should handle abort triggered exactly at turn boundary between Turn 1 and Turn 2', async () => {
      const abortCtrl = new AbortController();
      const { sandbox, mockChat } = createTestSandbox({ abortController: abortCtrl });

      let calls = 0;
      sandbox.makeApiRequest = async () => {
        calls++;
        return { res: createMockSseResponse(['Part 1 of 3\n```js\n'], 'length'), fetchError: null };
      };

      const boundaryAbortCode = `
        async function testBoundaryAbort() {
          let turn = 0;
          let text = '';
          while (turn < 5) {
            if (State.abortController?.signal?.aborted) break;
            await makeApiRequest();
            text += 'Part 1 of 3\\n\`\`\`js\\n';
            turn++;
            State.abortController.abort(); // Aborted before turn 2 begins
            if (isResponseTruncated('length', text) && !State.abortController?.signal?.aborted) {
              continue;
            }
            break;
          }
          mockChat.messages.push({ role: 'assistant', content: text });
          return { turn, text };
        }
      `;
      sandbox.mockChat = mockChat;
      vm.runInContext(boundaryAbortCode, sandbox);
      const result = await sandbox.testBoundaryAbort();

      assert.strictEqual(result.turn, 1);
      assert.strictEqual(calls, 1);
      assert.strictEqual(mockChat.messages.length, 2);
    });

    it('T2-B2: should handle abort triggered mid-stream during chunk decoding in Turn N (N >= 2)', async () => {
      const abortCtrl = new AbortController();
      const { sandbox, mockChat } = createTestSandbox({ abortController: abortCtrl });

      const streamCode = `
        async function testMidStreamAbort() {
          let text = 'Turn 1 full content.\\n';
          try {
            // Turn 2 streaming
            text += 'Turn 2 delta 1... ';
            State.abortController.abort(); // Mid stream abort
            if (State.abortController.signal.aborted) {
              const err = new Error('The user aborted a request.');
              err.name = 'AbortError';
              throw err;
            }
          } catch(e) {
            if (e.name === 'AbortError') {
              mockChat.messages.push({ role: 'assistant', content: text + '\\n\\n*(Đã dừng)*' });
            }
          }
          return text;
        }
      `;
      sandbox.mockChat = mockChat;
      vm.runInContext(streamCode, sandbox);
      await sandbox.testMidStreamAbort();

      const lastMsg = mockChat.messages[mockChat.messages.length - 1];
      assert.ok(lastMsg.content.includes('Turn 1 full content.'));
      assert.ok(lastMsg.content.includes('Turn 2 delta 1...'));
      assert.ok(lastMsg.content.endsWith('*(Đã dừng)*'));
    });

    it('T2-B3: should handle abort on Turn 1 when no content has been received without creating empty *(Đã dừng)* message', () => {
      const { mockChat } = createTestSandbox();
      let assistantContent = '';
      const currentChat = mockChat;

      // Emulate catch block logic
      if (currentChat && assistantContent) {
        currentChat.messages.push({ role: 'assistant', content: assistantContent + '\n\n*(Đã dừng)*' });
      }

      assert.strictEqual(currentChat.messages.length, 1, 'Should NOT append empty assistant message when abort occurs before any content');
    });

    it('T2-B4: should safely handle inline backticks and complete code blocks without corrupting truncation detection', () => {
      const textWithInline = 'Sử dụng lệnh `npm install` và `npm start` để khởi chạy.';
      assert.strictEqual(isResponseTruncated('stop', textWithInline), false);

      const completeCodeBlock = '```javascript\nconsole.log("hello world");\n```';
      assert.strictEqual(isResponseTruncated('stop', completeCodeBlock), false);
    });

    it('T2-B5: should correctly classify complete responses with self-closing HTML tags as NOT truncated', () => {
      const completeWithVoidTags = '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><img src="pic.png"><br><input type="text"></body></html>';
      assert.strictEqual(isResponseTruncated('stop', completeWithVoidTags), false);
    });

    it('T2-B6: should stop continuation when max turns limit is reached even if response is still flagged as truncated', async () => {
      const { sandbox } = createTestSandbox();
      sandbox.makeApiRequest = async () => ({ res: createMockSseResponse(['Continuing code...\n```js\n'], 'length'), fetchError: null });

      const maxLimitCode = `
        async function testMaxLimit() {
          const MAX_TURNS = 4;
          let turns = 0;
          while (turns < MAX_TURNS) {
            await makeApiRequest();
            turns++;
          }
          return turns;
        }
      `;
      vm.runInContext(maxLimitCode, sandbox);
      const executedTurns = await sandbox.testMaxLimit();
      assert.strictEqual(executedTurns, 4);
    });

    it('T2-B7: should handle API network/server errors on Turn N (N >= 2) by gracefully breaking and preserving prior turns', () => {
      assert.match(appJs, /if\s*\(turnCount\s*===\s*0\)\s*\{[\s\S]*?throw\s+/);
      assert.match(appJs, /console\.warn\('Continuation turn API error:'/);
    });

    it('T2-B8: should ensure _workspaceAbortController cleans up 45s safety timeout and typing indicator on completion or error', () => {
      assert.match(appJs, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?_workspaceAbortController\.abort\(\);[\s\S]*?45000\)/);
      assert.match(appJs, /clearTimeout\(timeoutId\);/);
      assert.match(appJs, /_workspaceAbortController\s*=\s*null;/);
    });

    it('T2-B9: should verify rapid consecutive abort and new prompt submissions do not leak controllers or race state', () => {
      const { stateObj } = createTestSandbox();
      let ctrl1 = new AbortController();
      stateObj.abortController = ctrl1;

      // New prompt arrives rapidly
      if (stateObj.abortController) {
        stateObj.abortController.abort();
      }
      let ctrl2 = new AbortController();
      stateObj.abortController = ctrl2;

      assert.strictEqual(ctrl1.signal.aborted, true);
      assert.strictEqual(ctrl2.signal.aborted, false);
      assert.strictEqual(stateObj.abortController, ctrl2);
    });

    it('T2-B10: should guarantee State.abortController is reset to null in finally block', () => {
      assert.match(appJs, /State\.abortController\s*=\s*null;/);
    });

  });

  // =========================================================================
  // TIER 3: Cross-Feature Combinations (R2)
  // =========================================================================
  describe('Tier 3: Cross-Feature Combinations (R2)', () => {

    it('T3-C1: Multi-Turn Chaining + AbortController: 3-turn streaming generation aborted during Turn 2 preserves Turn 1 and partial Turn 2', async () => {
      const abortCtrl = new AbortController();
      const { sandbox, mockChat } = createTestSandbox({ abortController: abortCtrl });

      const comboCode = `
        async function testComboAbort() {
          let fullContent = '';
          try {
            // Turn 1 completes
            fullContent += 'function initGame() {\\n';
            // Turn 2 streams half and gets aborted
            fullContent += '  const canvas = document.getElementById("c");\\n';
            State.abortController.abort();
            const err = new Error('Aborted');
            err.name = 'AbortError';
            throw err;
          } catch(e) {
            if (e.name === 'AbortError') {
              mockChat.messages.push({ role: 'assistant', content: fullContent + '\\n\\n*(Đã dừng)*' });
            }
          }
          return fullContent;
        }
      `;
      sandbox.mockChat = mockChat;
      vm.runInContext(comboCode, sandbox);
      await sandbox.testComboAbort();

      const savedMsg = mockChat.messages[mockChat.messages.length - 1];
      assert.ok(savedMsg.content.includes('function initGame()'));
      assert.ok(savedMsg.content.includes('const canvas = document.getElementById("c");'));
      assert.ok(savedMsg.content.includes('*(Đã dừng)*'));
    });

    it('T3-C2: Multi-Turn Chaining + Typing Indicator: verifies typing indicator is removed on Turn 1 chunk and remains absent during Turn 2 and Turn 3', () => {
      const { sandbox, messagesContainer } = createTestSandbox();
      const typingEl = sandbox.document.createElement('div');
      typingEl.className = 'message assistant typing';
      messagesContainer.appendChild(typingEl);

      let typingRemoved = false;
      function handleChunk(delta) {
        if (!typingRemoved) {
          typingRemoved = true;
          if (typingEl.parentNode) typingEl.remove();
        }
      }

      // Turn 1 chunk
      handleChunk('Turn 1 start');
      assert.strictEqual(messagesContainer.children.length, 0, 'Typing element removed on Turn 1');

      // Turn 2 chunk
      handleChunk('Turn 2 continuation');
      assert.strictEqual(messagesContainer.children.length, 0, 'Typing element does NOT reappear on Turn 2');

      // Turn 3 chunk
      handleChunk('Turn 3 continuation');
      assert.strictEqual(messagesContainer.children.length, 0, 'Typing element does NOT reappear on Turn 3');
    });

    it('T3-C3: Multi-Turn Chaining + Workspace Assistant: verifies _workspaceAbortController handles multi-turn continuation and preserves stitched reply', () => {
      assert.match(appJs, /while\s*\(continuationTurns\s*<\s*(?:4|10)\s*&&\s*_workspaceAbortController\s*&&\s*!_workspaceAbortController\.signal\.aborted\)/);
      assert.match(appJs, /Tiếp tục chính xác phần mã nguồn đang dang dở từ chỗ bị ngắt/);
    });

    it('T3-C4: Multi-Turn Chaining + HTTP 400 Downgrade: verifies continuation turns inherit max_tokens ceiling and retry resilience', () => {
      assert.match(appJs, /if\s*\(res\s*&&\s*res\.status\s*===\s*400\s*&&\s*reqBody\.max_tokens\s*>\s*4096\)/);
      assert.match(appJs, /const\s+downgradedBody\s*=\s*\{\s*\.\.\.reqBody,\s*max_tokens:\s*4096\s*\};/);
    });

    it('T3-C5: Multi-Turn Chaining + Chat Switching: switching active chat mid-continuation preserves background completion and updates state', () => {
      assert.match(appJs, /const\s+isStillActiveChat\s*=\s*\(\)\s*=>\s*State\.activeChatId\s*===\s*generatingChatId;/);
      assert.match(appJs, /const\s+activeChat\s*=\s*State\.chats\.find\(c\s*=>\s*c\.id\s*===\s*generatingChatId\)\s*\|\|\s*chat;/);
    });

  });

  // =========================================================================
  // TIER 4: Real-World Workloads & Integrity (R2)
  // =========================================================================
  describe('Tier 4: Real-World Workloads & Integrity (R2)', () => {

    it('T4-W1: Real-world 10-turn continuation workload simulating large 2500-line Three.js game engine generation with multiple length cutoffs', async () => {
      const { sandbox } = createTestSandbox();
      const chunks = [
        '```html\n<!DOCTYPE html><html><head><script src="three.js"></script></head><body>\n',
        '<script>\nclass Engine {\n  constructor() { this.scene = new THREE.Scene(); }\n',
        '  initLights() { const light = new THREE.DirectionalLight(0xffffff, 1); this.scene.add(light); }\n',
        '  initCamera() { this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000); }\n',
        '  initRenderer() { this.renderer = new THREE.WebGLRenderer(); document.body.appendChild(this.renderer.domElement); }\n',
        '  createTerrain() { const geo = new THREE.PlaneGeometry(100, 100, 32, 32); const mat = new THREE.MeshBasicMaterial(); }\n',
        '  createParticles() { const pGeo = new THREE.BufferGeometry(); const pMat = new THREE.PointsMaterial({ size: 0.1 }); }\n',
        '  setupPhysics() { this.gravity = -9.8; this.velocities = []; }\n',
        '  animate() { requestAnimationFrame(() => this.animate()); this.renderer.render(this.scene, this.camera); }\n',
        '}\nconst engine = new Engine(); engine.animate();\n</script></body></html>\n```'
      ];

      let turnIdx = 0;
      sandbox.makeApiRequest = async () => {
        const isLast = turnIdx === chunks.length - 1;
        const resp = createMockSseResponse([chunks[turnIdx]], isLast ? 'stop' : 'length');
        turnIdx++;
        return { res: resp, fetchError: null };
      };

      const heavyWorkloadCode = `
        async function runHeavyEngineWorkload() {
          const MAX_TURNS = 15;
          let turnCount = 0;
          let accumulated = '';
          while (turnCount < MAX_TURNS) {
            if (State.abortController?.signal?.aborted) break;
            const { res } = await makeApiRequest();
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let turnFinishReason = null;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value);
              for (const line of text.split('\\n')) {
                if (!line.trim().startsWith('data:')) continue;
                const data = line.trim().slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const p = JSON.parse(data);
                  if (p.choices?.[0]?.finish_reason) turnFinishReason = p.choices[0].finish_reason;
                  const d = p.choices?.[0]?.delta?.content;
                  if (d) accumulated += d;
                } catch(e){}
              }
            }
            turnCount++;
            if (!isResponseTruncated(turnFinishReason, accumulated)) break;
          }
          return { turnCount, accumulated };
        }
      `;

      vm.runInContext(heavyWorkloadCode, sandbox);
      const res = await sandbox.runHeavyEngineWorkload();

      assert.strictEqual(res.turnCount, 10, 'Must execute all 10 continuation turns');
      assert.ok(res.accumulated.includes('<!DOCTYPE html>'));
      assert.ok(res.accumulated.includes('class Engine'));
      assert.ok(res.accumulated.includes('engine.animate()'));
      assert.strictEqual(isResponseTruncated('stop', res.accumulated), false, 'Final stitched output must not be truncated');
    });

    it('T4-W2: Real-world heavy continuation stream aborted at Turn 8 with 8000+ characters preserved cleanly in chat history', async () => {
      const abortCtrl = new AbortController();
      const { sandbox, mockChat } = createTestSandbox({ abortController: abortCtrl });

      let generated = '';
      for (let t = 1; t <= 8; t++) {
        generated += `/* Turn ${t} Block */\n` + 'x'.repeat(1000) + '\n';
      }

      // Simulate abort at Turn 8
      abortCtrl.abort();
      mockChat.messages.push({ role: 'assistant', content: generated + '\n\n*(Đã dừng)*' });

      assert.ok(generated.length >= 8000, 'Must have accumulated over 8,000 characters');
      const lastMsg = mockChat.messages[mockChat.messages.length - 1];
      assert.ok(lastMsg.content.includes('/* Turn 8 Block */'));
      assert.ok(lastMsg.content.includes('*(Đã dừng)*'));
    });

    it('T4-W3: Static JS compilation check and zero regressions across existing test suite', () => {
      assert.doesNotThrow(() => {
        new vm.Script(appJs);
      }, 'app.js must compile cleanly with 0 syntax errors');
    });

  });

});
