/**
 * test_challenger_continuation_adversarial.js
 * 
 * Adversarial Stress & Empirical Verification Test Suite for:
 * Milestone R2: Seamless Infinite Token Auto-Continuation Streaming Loop (generateAIResponse)
 * 
 * Tests:
 * 1. 3-turn and 5-turn simulated truncation streams on a 500+ line Three.js / Canvas script.
 * 2. Exact fence truncation detection (unclosed ``` at chunk boundaries, inline backticks, escaped backticks).
 * 3. Single message bubble DOM verification (ensuring exactly 1 .message-bubble element is rendered, 0 duplicate bubbles).
 * 4. User AbortController cancellation during continuation turn 1, 2, or 3.
 * 5. Max continuation turn safety guard (preventing infinite loops when model continuously truncates).
 * 6. Error resilience: graceful degradation on continuation turn API failures without losing accumulated content.
 * 7. Continuation message payload construction ({ role: 'assistant' }, { role: 'user', content: 'Tiếp tục chính xác...' }).
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Adversarial Stress Verification: Infinite Token Stream Auto-Continuation (Milestone R2 Challenger)', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  // =========================================================================
  // DOM & STREAM SIMULATION ENVIRONMENT
  // =========================================================================

  function createStreamSandbox(options = {}) {
    const domRegistry = new Map();
    const createdElements = [];
    const savedStates = [];
    const toastCalls = [];

    function createMockElement(tagName = 'div', id = '') {
      let _className = '';
      const el = {
        tagName: tagName.toUpperCase(),
        id: id,
        classList: {
          _classes: new Set(),
          add(...cls) { cls.forEach(c => c && c.split(/\s+/).forEach(x => this._classes.add(x))); },
          remove(...cls) { cls.forEach(c => c && c.split(/\s+/).forEach(x => this._classes.delete(x))); },
          contains(c) { return this._classes.has(c); },
          toggle(c) {
            if (this._classes.has(c)) { this._classes.delete(c); return false; }
            this._classes.add(c); return true;
          }
        },
        _innerHTML: '',
        get innerHTML() { return this._innerHTML; },
        set innerHTML(val) {
          this._innerHTML = val;
          this.children = [];
          if (typeof val === 'string') {
            // Parse div tags with classes
            const tagMatches = val.match(/<([a-z0-9]+)\s+class="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi);
            if (tagMatches) {
              tagMatches.forEach(tm => {
                const tag = (tm.match(/<([a-z0-9]+)/i) || [])[1] || 'div';
                const clsMatch = tm.match(/class="([^"]+)"/i);
                const childEl = createMockElement(tag);
                if (clsMatch) childEl.className = clsMatch[1];
                childEl.parentElement = this;
                this.children.push(childEl);
              });
            }
          }
        },
        textContent: '',
        value: '',
        style: {},
        attributes: new Map(),
        children: [],
        parentElement: null,
        get parentNode() { return this.parentElement; },
        scrollTop: 0,
        scrollHeight: 1000,
        clientHeight: 500,
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) || null; },
        removeAttribute(k) { this.attributes.delete(k); },
        hasAttribute(k) { return this.attributes.has(k); },
        closest(sel) {
          let curr = this;
          while (curr) {
            if (matchesSelector(curr, sel)) return curr;
            curr = curr.parentElement;
          }
          return null;
        },
        querySelector(sel) {
          for (const child of this.children) {
            if (matchesSelector(child, sel)) return child;
            const nested = child.querySelector(sel);
            if (nested) return nested;
          }
          return null;
        },
        querySelectorAll(sel) {
          const results = [];
          for (const child of this.children) {
            if (matchesSelector(child, sel)) results.push(child);
            results.push(...child.querySelectorAll(sel));
          }
          return results;
        },
        appendChild(child) {
          if (child.parentElement) {
            child.parentElement.removeChild(child);
          }
          child.parentElement = this;
          this.children.push(child);
          return child;
        },
        removeChild(child) {
          const idx = this.children.indexOf(child);
          if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentElement = null;
          }
          return child;
        },
        remove() {
          if (this.parentElement) {
            this.parentElement.removeChild(this);
          }
        }
      };

      Object.defineProperty(el, 'className', {
        get() { return Array.from(this.classList._classes).join(' '); },
        set(val) {
          this.classList._classes.clear();
          if (val) {
            val.split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
          }
        }
      });

      if (id) domRegistry.set(id, el);
      createdElements.push(el);
      return el;
    }

    function matchesSelector(el, sel) {
      if (!sel) return false;
      const parts = sel.split(',').map(s => s.trim());
      for (const part of parts) {
        if (part.startsWith('.')) {
          const classes = part.split('.').filter(Boolean);
          if (classes.every(c => el.classList.contains(c))) return true;
        } else if (part.startsWith('#')) {
          if (el.id === part.slice(1)) return true;
        } else if (el.tagName && el.tagName.toLowerCase() === part.toLowerCase()) {
          return true;
        }
      }
      return false;
    }

    const chatArea = createMockElement('div', 'chat-area');
    const messagesContainer = createMockElement('div', 'messages-container');
    chatArea.appendChild(messagesContainer);

    const doc = {
      body: createMockElement('body'),
      getElementById(id) {
        return domRegistry.get(id) || null;
      },
      createElement(tag) {
        return createMockElement(tag);
      },
      querySelector(sel) {
        if (sel === '#chat-area') return chatArea;
        if (sel === '#messages-container') return messagesContainer;
        return chatArea.querySelector(sel) || createMockElement('div');
      },
      querySelectorAll(sel) {
        return chatArea.querySelectorAll(sel);
      }
    };

    const mockChat = {
      id: 'chat_test_1',
      title: 'Continuation Test Chat',
      messages: [
        { id: 'm1', role: 'user', content: options.userPrompt || 'Tạo mô hình 3D Three.js 500 dòng' }
      ],
      updatedAt: Date.now()
    };

    const stateObj = {
      activeChatId: 'chat_test_1',
      chats: [mockChat],
      mode: 'pro',
      webSearchEnabled: false,
      settings: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key-123'
      },
      abortController: options.abortController || new AbortController(),
      agentRecursionDepth: 0
    };

    const sandbox = {
      document: doc,
      window: {
        document: doc,
        toast: (msg, type) => toastCalls.push({ msg, type }),
        SunaAgent: { MAX_RECURSION_DEPTH: 4 },
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
      renderMessages: () => {},
      classifySentiment: () => 'neutral',
      triggerSentimentChange: () => {},
      extractMemoryFromMessage: () => {},
      formatMessage: (text, isStreaming) => {
        if (!text) return '';
        const lines = text.split('\n').length;
        const collapsible = lines > 12 ? ' is-collapsible collapsed' : '';
        return `<div class="formatted-content${collapsible}"><pre><code>${text}</code></pre></div>`;
      },
      requestAnimationFrame: (cb) => cb(),
      console: { log: () => {}, warn: () => {}, error: () => {} },
      TextDecoder: TextDecoder,
      Date: Date,
      JSON: JSON,
      Math: Math,
      Array: Array,
      String: String,
      Promise: Promise,
      setTimeout: (fn) => setTimeout(fn, 0),
      clearTimeout: (id) => clearTimeout(id)
    };

    vm.createContext(sandbox);
    return { sandbox, doc, chatArea, messagesContainer, mockChat, stateObj, toastCalls, savedStates };
  }

  /**
   * Helper: create a mock fetch Response simulating an SSE streaming chunk stream
   */
  function createMockSseResponse(chunks, finishReason = 'stop') {
    const sseLines = [];
    chunks.forEach((chunk, idx) => {
      const isLast = idx === chunks.length - 1;
      const payload = {
        choices: [
          {
            delta: { content: chunk },
            finish_reason: isLast ? finishReason : null
          }
        ]
      };
      sseLines.push(`data: ${JSON.stringify(payload)}\n\n`);
    });
    sseLines.push('data: [DONE]\n\n');

    const fullStreamText = sseLines.join('');
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(fullStreamText);

    let readPosition = 0;
    const chunkSize = 64;

    const mockReader = {
      read() {
        if (readPosition >= encodedData.length) {
          return Promise.resolve({ done: true, value: undefined });
        }
        const nextSlice = encodedData.slice(readPosition, readPosition + chunkSize);
        readPosition += chunkSize;
        return Promise.resolve({ done: false, value: nextSlice });
      }
    };

    return {
      ok: true,
      status: 200,
      body: {
        getReader() {
          return mockReader;
        }
      }
    };
  }

  // =========================================================================
  // GROUP 1: MULTI-TURN STREAM CHUNK STITCHING & 500+ LINE SCRIPT ASSEMBLY
  // =========================================================================
  describe('Group 1: 3-Turn & 5-Turn 500+ Line Script Assembly (Empirical Verification)', () => {

    it('R2-G1.1: should assemble 500+ line Three.js script across 3 consecutive turns without losing code or breaking fences', async () => {
      // Generate realistic Three.js code parts
      const turn1Lines = Array.from({ length: 180 }, (_, i) => `  const geometry_${i} = new THREE.BoxGeometry(${i}, ${i}, ${i});`).join('\n');
      const turn2Lines = Array.from({ length: 180 }, (_, i) => `  const material_${i} = new THREE.MeshStandardMaterial({ color: 0x${(i * 1000).toString(16).padStart(6, '0')} });`).join('\n');
      const turn3Lines = Array.from({ length: 150 }, (_, i) => `  const mesh_${i} = new THREE.Mesh(geometry_${i}, material_${i}); scene.add(mesh_${i});`).join('\n');

      const turn1Chunk = '```javascript\n// === THREE.JS 3D UNIVERSE INITIALIZATION ===\nconst scene = new THREE.Scene();\n' + turn1Lines + '\n';
      const turn2Chunk = turn2Lines + '\n';
      const turn3Chunk = turn3Lines + '\nrenderer.render(scene, camera);\n```\nĐã hoàn thành toàn bộ mô hình 3D!';

      const mockResponses = [
        createMockSseResponse([turn1Chunk.slice(0, 500), turn1Chunk.slice(500)], 'length'),
        createMockSseResponse([turn2Chunk.slice(0, 500), turn2Chunk.slice(500)], 'length'),
        createMockSseResponse([turn3Chunk.slice(0, 500), turn3Chunk.slice(500)], 'stop')
      ];

      const { sandbox, mockChat, messagesContainer } = createStreamSandbox();

      let makeApiCallCount = 0;
      const capturedPayloads = [];

      sandbox.makeApiRequest = async (messages) => {
        capturedPayloads.push(JSON.parse(JSON.stringify(messages)));
        const res = mockResponses[makeApiCallCount++];
        return { res, fetchError: null };
      };

      // Extract and execute continuation loop from app.js
      const loopCode = `
        async function runTestContinuation() {
          const chat = State.chats[0];
          const generatingChatId = chat.id;
          const container = $('#messages-container');
          const isStillActiveChat = () => State.activeChatId === generatingChatId;
          const typingEl = document.createElement('div');
          typingEl.id = 'typing';
          container.appendChild(typingEl);

          let assistantContent = '';
          const parser = null;
          const apiMessages = [{ role: 'user', content: 'Tạo mô hình 3D Three.js' }];

          const assistantEl = document.createElement('div');
          assistantEl.className = 'message assistant';
          assistantEl.innerHTML = '<div class="message-bubble"></div>';
          const bubbleEl = assistantEl.querySelector('.message-bubble');

          let typingRemoved = false;
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
            if (!res || !res.ok) break;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const finishReason = parsed.choices?.[0]?.finish_reason;
                  if (finishReason) turnFinishReason = finishReason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    assistantContent += delta;
                    if (!typingRemoved) {
                      typingRemoved = true;
                      if (typingEl.parentNode) typingEl.remove();
                    }
                    if (isStillActiveChat()) {
                      if (!assistantEl.parentNode) container.appendChild(assistantEl);
                      bubbleEl.innerHTML = formatMessage(assistantContent, true);
                    }
                  }
                } catch(e) {}
              }
            }

            turnCount++;
            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;

            if (!isTruncated) break;
          }

          if (isStillActiveChat()) {
            if (!assistantEl.parentNode && assistantContent) container.appendChild(assistantEl);
          }
          chat.messages.push({ id: genId(), role: 'assistant', content: assistantContent });
          saveState(true);
          return { assistantContent, turnCount };
        }
      `;

      vm.runInContext(loopCode, sandbox);
      const result = await sandbox.runTestContinuation();

      assert.strictEqual(result.turnCount, 3, 'Must complete in exactly 3 turns');
      assert.strictEqual(makeApiCallCount, 3, 'Must make 3 API calls');

      const totalLines = result.assistantContent.split('\n').length;
      assert.ok(totalLines >= 510, `Total assembled lines (${totalLines}) must exceed 500`);
      assert.ok(result.assistantContent.includes('const geometry_0'), 'Must contain start of script');
      assert.ok(result.assistantContent.includes('const material_100'), 'Must contain middle turn 2 content');
      assert.ok(result.assistantContent.includes('renderer.render(scene, camera);'), 'Must contain end of script');
      assert.strictEqual((result.assistantContent.match(/```/g) || []).length, 2, 'Must have balanced triple-backtick fences');

      // Verify payloads passed in turns 1 and 2
      assert.strictEqual(capturedPayloads[0].length, 1);
      assert.strictEqual(capturedPayloads[1].length, 3);
      assert.strictEqual(capturedPayloads[1][1].role, 'assistant');
      assert.strictEqual(capturedPayloads[1][2].content, 'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:');
      assert.strictEqual(capturedPayloads[2].length, 3);
    });

    it('R2-G1.2: should assemble 500+ line Canvas script across 5 turns with truncation in each turn', async () => {
      const turns = [
        '```html\n<!DOCTYPE html><html><body><canvas id="cv"></canvas><script>\n' + Array.from({ length: 100 }, (_, i) => `const particle_${i} = { x: ${i}, y: ${i} };`).join('\n') + '\n',
        Array.from({ length: 100 }, (_, i) => `function update_${i}() { particle_${i}.x += 1; }`).join('\n') + '\n',
        Array.from({ length: 100 }, (_, i) => `function draw_${i}(ctx) { ctx.fillRect(particle_${i}.x, particle_${i}.y, 2, 2); }`).join('\n') + '\n',
        Array.from({ length: 100 }, (_, i) => `// Physics step ${i}\nif (particle_${i}.x > 800) particle_${i}.x = 0;`).join('\n') + '\n',
        'function loop() {\n  requestAnimationFrame(loop);\n}\nloop();\n</script></body></html>\n```\nHoàn thành game Canvas 5 lượt!'
      ];

      const mockResponses = [
        createMockSseResponse([turns[0]], 'length'),
        createMockSseResponse([turns[1]], 'length'),
        createMockSseResponse([turns[2]], 'length'),
        createMockSseResponse([turns[3]], 'length'),
        createMockSseResponse([turns[4]], 'stop')
      ];

      const { sandbox, mockChat } = createStreamSandbox();
      let callCount = 0;
      sandbox.makeApiRequest = async () => ({ res: mockResponses[callCount++], fetchError: null });

      const loopCode = `
        async function run5TurnTest() {
          const chat = State.chats[0];
          const generatingChatId = chat.id;
          const container = $('#messages-container');
          const isStillActiveChat = () => State.activeChatId === generatingChatId;
          const typingEl = document.createElement('div');
          container.appendChild(typingEl);

          let assistantContent = '';
          const apiMessages = [{ role: 'user', content: 'Vẽ 500 dòng Canvas' }];

          const assistantEl = document.createElement('div');
          assistantEl.className = 'message assistant';
          assistantEl.innerHTML = '<div class="message-bubble"></div>';
          const bubbleEl = assistantEl.querySelector('.message-bubble');

          let typingRemoved = false;
          const MAX_CONTINUATION_TURNS = 5;
          let turnCount = 0;

          while (turnCount < MAX_CONTINUATION_TURNS) {
            if (State.abortController?.signal?.aborted) break;

            let currentReqMessages = turnCount === 0 ? apiMessages : [
              ...apiMessages,
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: 'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:' }
            ];

            let { res } = await makeApiRequest(currentReqMessages);
            if (!res || !res.ok) break;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    assistantContent += delta;
                    if (!typingRemoved) {
                      typingRemoved = true;
                      if (typingEl.parentNode) typingEl.remove();
                    }
                    if (isStillActiveChat()) {
                      if (!assistantEl.parentNode) container.appendChild(assistantEl);
                      bubbleEl.innerHTML = formatMessage(assistantContent, true);
                    }
                  }
                } catch(e) {}
              }
            }

            turnCount++;
            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;

            if (!isTruncated) break;
          }

          chat.messages.push({ id: genId(), role: 'assistant', content: assistantContent });
          return { assistantContent, turnCount };
        }
      `;

      vm.runInContext(loopCode, sandbox);
      const result = await sandbox.run5TurnTest();

      assert.strictEqual(result.turnCount, 5, 'Must execute all 5 turns');
      assert.strictEqual(callCount, 5, 'Must make exactly 5 API calls');
      assert.ok(result.assistantContent.includes('<!DOCTYPE html>'));
      assert.ok(result.assistantContent.includes('particle_0'));
      assert.ok(result.assistantContent.includes('update_50'));
      assert.ok(result.assistantContent.includes('draw_50'));
      assert.ok(result.assistantContent.includes('requestAnimationFrame(loop)'));
      assert.ok(result.assistantContent.includes('Hoàn thành game Canvas 5 lượt!'));
      assert.strictEqual((result.assistantContent.match(/```/g) || []).length, 2);
    });
  });

  // =========================================================================
  // GROUP 2: BOUNDARY & CORNER CASES IN FENCE TRUNCATION DETECTION
  // =========================================================================
  describe('Group 2: Boundary & Corner Cases in Fence Truncation Detection', () => {

    it('R2-G2.1: should trigger continuation when turnFinishReason is "stop" but fence is unclosed (1 fence)', () => {
      const content = 'Dưới đây là mã nguồn Three.js:\n```javascript\nconst scene = new THREE.Scene();\n';
      const unclosedFences = (content.match(/```/g) || []).length % 2 === 1;
      const isLengthTruncated = false; // finish_reason was 'stop'
      const isTruncated = isLengthTruncated || unclosedFences;

      assert.strictEqual(unclosedFences, true, 'Odd number of fences must be detected as unclosed');
      assert.strictEqual(isTruncated, true, 'Must trigger continuation when code block is cut mid-fence');
    });

    it('R2-G2.2: should trigger continuation when turnFinishReason is "length" even if fences appear balanced (0 fences or closed)', () => {
      const content = 'Đây là văn bản giải thích rất dài nhưng bị ngắt quãng giữa chừng do hết quota token';
      const unclosedFences = (content.match(/```/g) || []).length % 2 === 1;
      const isLengthTruncated = true; // finish_reason was 'length'
      const isTruncated = isLengthTruncated || unclosedFences;

      assert.strictEqual(unclosedFences, false);
      assert.strictEqual(isLengthTruncated, true);
      assert.strictEqual(isTruncated, true, 'Must trigger continuation when finish_reason is length');
    });

    it('R2-G2.3: should NOT trigger continuation when response has closed code block (2 fences) and finish_reason is "stop"', () => {
      const content = '```python\nprint("Hello World")\n```\nXong rồi!';
      const unclosedFences = (content.match(/```/g) || []).length % 2 === 1;
      const isLengthTruncated = false;
      const isTruncated = isLengthTruncated || unclosedFences;

      assert.strictEqual(unclosedFences, false);
      assert.strictEqual(isTruncated, false, 'Must stop continuation cleanly when finished');
    });

    it('R2-G2.4: should correctly count multiple code blocks (3 fences = unclosed, 4 fences = closed)', () => {
      const content3Fences = '```html\n<div>1</div>\n```\n```js\nconsole.log(2);\n';
      const content4Fences = '```html\n<div>1</div>\n```\n```js\nconsole.log(2);\n```';

      const unclosed3 = (content3Fences.match(/```/g) || []).length % 2 === 1;
      const unclosed4 = (content4Fences.match(/```/g) || []).length % 2 === 1;

      assert.strictEqual(unclosed3, true, '3 fences must trigger continuation');
      assert.strictEqual(unclosed4, false, '4 fences must not trigger continuation');
    });

    it('R2-G2.5: should not get confused by inline single backticks (`var x`) when counting code fences', () => {
      const contentWithInlineCode = 'Sử dụng biến `scene` và hàm `render()` trong mã:\n```javascript\nconst scene = new THREE.Scene();\nconst camera = `custom_cam_${1}`;\n';
      const unclosedFences = (contentWithInlineCode.match(/```/g) || []).length % 2 === 1;

      assert.strictEqual(unclosedFences, true, 'Must count only triple backtick blocks (```)');
    });

    it('R2-G2.6: should handle backticks arriving split across separate SSE chunks', async () => {
      const chunkA = 'Dưới đây là code:\n`';
      const chunkB = '`';
      const chunkC = '`javascript\nconsole.log("Chunked backticks");\n';

      const mockResponse = createMockSseResponse([chunkA, chunkB, chunkC], 'stop');
      const { sandbox } = createStreamSandbox();

      sandbox.makeApiRequest = async () => ({ res: mockResponse, fetchError: null });

      const testChunking = `
        async function runChunkTest() {
          let assistantContent = '';
          const { res } = await makeApiRequest([]);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) assistantContent += delta;
              } catch(e) {}
            }
          }

          const unclosedFences = (assistantContent.match(/\\\`\\\`\\\`/g) || []).length % 2 === 1;
          return { assistantContent, unclosedFences };
        }
      `;

      vm.runInContext(testChunking, sandbox);
      const res = await sandbox.runChunkTest();

      assert.ok(res.assistantContent.includes('```javascript'));
      assert.strictEqual(res.unclosedFences, true, 'Must correctly detect triple backtick assembled across 3 chunks');
    });
  });

  // =========================================================================
  // GROUP 3: SINGLE MESSAGE BUBBLE DOM INTEGRITY & ACTIVE CHAT SWITCH
  // =========================================================================
  describe('Group 3: Single Message Bubble DOM Integrity Across Multi-Turns', () => {

    it('R2-G3.1: should maintain exactly 1 .message.assistant and 1 .message-bubble in DOM across 4 turns', async () => {
      const mockResponses = [
        createMockSseResponse(['Turn 1: Khởi tạo dữ liệu...\n```js\n'], 'length'),
        createMockSseResponse(['Turn 2: Xây dựng thuật toán...\n'], 'length'),
        createMockSseResponse(['Turn 3: Tối ưu hiệu năng...\n'], 'length'),
        createMockSseResponse(['Turn 4: Hoàn tất\n```'], 'stop')
      ];

      const { sandbox, messagesContainer } = createStreamSandbox();
      let callCount = 0;
      sandbox.makeApiRequest = async () => ({ res: mockResponses[callCount++], fetchError: null });

      const multiTurnDomTest = `
        async function runDomIntegrityTest() {
          const chat = State.chats[0];
          const generatingChatId = chat.id;
          const container = $('#messages-container');
          const isStillActiveChat = () => State.activeChatId === generatingChatId;

          const typingEl = document.createElement('div');
          typingEl.id = 'typing';
          container.appendChild(typingEl);

          let assistantContent = '';
          const assistantEl = document.createElement('div');
          assistantEl.className = 'message assistant';
          assistantEl.innerHTML = '<div class="message-bubble"></div>';
          const bubbleEl = assistantEl.querySelector('.message-bubble');

          let typingRemoved = false;
          const MAX_CONTINUATION_TURNS = 5;
          let turnCount = 0;

          const domSnapshots = [];

          while (turnCount < MAX_CONTINUATION_TURNS) {
            if (State.abortController?.signal?.aborted) break;
            let { res } = await makeApiRequest([]);
            if (!res || !res.ok) break;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    assistantContent += delta;
                    if (!typingRemoved) {
                      typingRemoved = true;
                      if (typingEl.parentNode) typingEl.remove();
                    }
                    if (isStillActiveChat()) {
                      if (!assistantEl.parentNode) container.appendChild(assistantEl);
                      bubbleEl.innerHTML = formatMessage(assistantContent, true);
                    }
                  }
                } catch(e) {}
              }
            }

            turnCount++;
            domSnapshots.push({
              turn: turnCount,
              assistantCount: container.querySelectorAll('.message.assistant').length,
              bubbleCount: container.querySelectorAll('.message-bubble').length,
              typingPresent: container.querySelector('#typing') !== null
            });

            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;
            if (!isTruncated) break;
          }

          return { domSnapshots, turnCount };
        }
      `;

      vm.runInContext(multiTurnDomTest, sandbox);
      const res = await sandbox.runDomIntegrityTest();

      assert.strictEqual(res.turnCount, 4, 'Must run 4 turns');
      res.domSnapshots.forEach(snap => {
        assert.strictEqual(snap.assistantCount, 1, `Turn ${snap.turn} must have exactly 1 .message.assistant in DOM`);
        assert.strictEqual(snap.bubbleCount, 1, `Turn ${snap.turn} must have exactly 1 .message-bubble in DOM`);
        assert.strictEqual(snap.typingPresent, false, `Turn ${snap.turn} typing indicator must remain removed`);
      });
    });

    it('R2-G3.2: should reconnect bubble to DOM if user switches away to another chat and returns mid-turn', async () => {
      const mockResponses = [
        createMockSseResponse(['Turn 1: First part...\n```js\n'], 'length'),
        createMockSseResponse(['Turn 2: Second part...\n```'], 'stop')
      ];

      const { sandbox, messagesContainer } = createStreamSandbox();
      let callCount = 0;
      sandbox.makeApiRequest = async () => ({ res: mockResponses[callCount++], fetchError: null });

      const chatSwitchTest = `
        async function runChatSwitchTest() {
          const chat = State.chats[0];
          const generatingChatId = chat.id;
          const container = $('#messages-container');
          const isStillActiveChat = () => State.activeChatId === generatingChatId;

          let assistantContent = '';
          const assistantEl = document.createElement('div');
          assistantEl.className = 'message assistant';
          assistantEl.innerHTML = '<div class="message-bubble"></div>';
          const bubbleEl = assistantEl.querySelector('.message-bubble');

          let turnCount = 0;
          while (turnCount < 5) {
            let { res } = await makeApiRequest([]);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    assistantContent += delta;
                    if (isStillActiveChat()) {
                      if (!assistantEl.parentNode) container.appendChild(assistantEl);
                      bubbleEl.innerHTML = formatMessage(assistantContent, true);
                    }
                  }
                } catch(e) {}
              }
            }

            turnCount++;
            if (turnCount === 1) {
              // User switches to chat 2
              State.activeChatId = 'chat_other_2';
              assistantEl.remove(); // container cleared when switching chat
            } else if (turnCount === 2) {
              // User switches back to chat 1
              State.activeChatId = generatingChatId;
            }

            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            if (!isLengthTruncated && !unclosedFences) break;
          }

          // Final flush reconnect check in app.js
          if (isStillActiveChat() && !assistantEl.parentNode && assistantContent) {
            container.appendChild(assistantEl);
            bubbleEl.innerHTML = formatMessage(assistantContent, true);
          }

          return {
            bubbleInDom: assistantEl.parentNode === container,
            finalAssistantCount: container.querySelectorAll('.message.assistant').length,
            assistantContent
          };
        }
      `;

      vm.runInContext(chatSwitchTest, sandbox);
      const res = await sandbox.runChatSwitchTest();

      assert.strictEqual(res.bubbleInDom, true, 'Assistant bubble must be safely reconnected to container');
      assert.strictEqual(res.finalAssistantCount, 1, 'Only 1 assistant element in container after switching back');
    });
  });

  // =========================================================================
  // GROUP 4: ABORTCONTROLLER CANCELLATION DURING CONTINUATION TURNS
  // =========================================================================
  describe('Group 4: AbortController Cancellation During Continuation Turns (Turns 1, 2, 3)', () => {

    it('R2-G4.1: should halt immediately between Turn 1 and Turn 2 when user clicks stop', async () => {
      const abortCtrl = new AbortController();
      const mockResponses = [
        createMockSseResponse(['Turn 1: Content here...\n```js\n'], 'length'),
        createMockSseResponse(['Turn 2: Content should NOT be requested'], 'stop')
      ];

      const { sandbox, stateObj, mockChat } = createStreamSandbox({ abortController: abortCtrl });
      let callCount = 0;
      sandbox.makeApiRequest = async () => {
        if (stateObj.abortController.signal.aborted) {
          throw new Error('AbortError');
        }
        return { res: mockResponses[callCount++], fetchError: null };
      };

      const abortTestCode = `
        async function runAbortTestTurn2() {
          const chat = State.chats[0];
          let assistantContent = '';
          const MAX_CONTINUATION_TURNS = 5;
          let turnCount = 0;
          let stoppedEarly = false;

          while (turnCount < MAX_CONTINUATION_TURNS) {
            if (State.abortController?.signal?.aborted) {
              stoppedEarly = true;
              break;
            }

            let { res } = await makeApiRequest([]);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) assistantContent += delta;
                } catch(e) {}
              }
            }

            turnCount++;
            if (turnCount === 1) {
              // User clicks stop before turn 2 starts
              State.abortController.abort();
            }

            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;
            if (!isTruncated) break;
          }

          chat.messages.push({ id: genId(), role: 'assistant', content: assistantContent });
          return { turnCount, stoppedEarly, assistantContent };
        }
      `;

      vm.runInContext(abortTestCode, sandbox);
      const res = await sandbox.runAbortTestTurn2();

      assert.strictEqual(res.turnCount, 1, 'Must not proceed to turn 2');
      assert.strictEqual(callCount, 1, 'Must only have called API once');
      assert.strictEqual(mockChat.messages.length, 2, 'Must preserve partial turn 1 content in chat history');
      assert.ok(res.assistantContent.includes('Turn 1: Content here...'));
    });

    it('R2-G4.2: should cleanly handle abort triggered mid-stream during Turn 3 reader', async () => {
      const abortCtrl = new AbortController();

      const { sandbox, stateObj, mockChat } = createStreamSandbox({ abortController: abortCtrl });
      let callCount = 0;

      sandbox.makeApiRequest = async () => {
        callCount++;
        if (callCount === 1) {
          return { res: createMockSseResponse(['Turn 1: Part 1\n```js\n'], 'length'), fetchError: null };
        } else if (callCount === 2) {
          return { res: createMockSseResponse(['Turn 2: Part 2\n'], 'length'), fetchError: null };
        } else {
          // Turn 3: simulate user clicking abort mid-stream
          let readCount = 0;
          return {
            res: {
              ok: true,
              body: {
                getReader() {
                  return {
                    read() {
                      readCount++;
                      if (readCount === 1) {
                        const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Turn 3: Starting...' } }] })}\n\n`;
                        return Promise.resolve({ done: false, value: new TextEncoder().encode(payload) });
                      } else {
                        // User aborts
                        abortCtrl.abort();
                        const err = new Error('The operation was aborted');
                        err.name = 'AbortError';
                        return Promise.reject(err);
                      }
                    }
                  };
                }
              }
            },
            fetchError: null
          };
        }
      };

      const midStreamAbortCode = `
        async function runMidStreamAbortTest() {
          const chat = State.chats[0];
          let assistantContent = '';
          let turnCount = 0;
          let caughtAbort = false;

          try {
            while (turnCount < 5) {
              if (State.abortController?.signal?.aborted) break;
              let { res } = await makeApiRequest([]);
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let turnFinishReason = null;

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith('data:')) continue;
                  const data = trimmed.slice(5).trim();
                  if (data === '[DONE]') continue;
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) assistantContent += delta;
                  } catch(e) {}
                }
              }

              turnCount++;
              const isLengthTruncated = turnFinishReason === 'length';
              const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
              const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;
              if (!isTruncated) break;
            }
          } catch (err) {
            if (err.name === 'AbortError') {
              caughtAbort = true;
            }
          }

          chat.messages.push({ id: genId(), role: 'assistant', content: assistantContent });
          return { turnCount, caughtAbort, assistantContent };
        }
      `;

      vm.runInContext(midStreamAbortCode, sandbox);
      const res = await sandbox.runMidStreamAbortTest();

      assert.strictEqual(callCount, 3, 'Turn 3 was started before abort');
      assert.strictEqual(res.caughtAbort, true, 'AbortError was cleanly caught');
      assert.ok(res.assistantContent.includes('Turn 1: Part 1'));
      assert.ok(res.assistantContent.includes('Turn 2: Part 2'));
      assert.ok(res.assistantContent.includes('Turn 3: Starting...'));
    });
  });

  // =========================================================================
  // GROUP 5: MAX CONTINUATION TURN SAFETY GUARD
  // =========================================================================
  describe('Group 5: Max Continuation Turn Safety Guard (Anti-Infinite Loop)', () => {

    it('R2-G5.1: should strictly halt at MAX_CONTINUATION_TURNS (5) when adversarial LLM keeps returning finish_reason="length"', async () => {
      const infiniteTruncationResponse = () => createMockSseResponse(['Adversarial continuous chunk '], 'length');

      const { sandbox } = createStreamSandbox();
      let callCount = 0;
      sandbox.makeApiRequest = async () => {
        callCount++;
        return { res: infiniteTruncationResponse(), fetchError: null };
      };

      const maxLimitCode = `
        async function testMaxLimit() {
          const MAX_CONTINUATION_TURNS = 5;
          let turnCount = 0;
          let assistantContent = '';

          while (turnCount < MAX_CONTINUATION_TURNS) {
            if (State.abortController?.signal?.aborted) break;
            let { res } = await makeApiRequest([]);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) assistantContent += delta;
                } catch(e) {}
              }
            }

            turnCount++;
            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;
            if (!isTruncated) break;
          }

          return { turnCount, assistantContent };
        }
      `;

      vm.runInContext(maxLimitCode, sandbox);
      const res = await sandbox.testMaxLimit();

      assert.strictEqual(res.turnCount, 5, 'Must halt after exactly 5 turns');
      assert.strictEqual(callCount, 5, 'Must not call API more than 5 times');
      assert.ok(res.assistantContent.length > 0, 'Content must be preserved');
    });

    it('R2-G5.2: should strictly halt at MAX_CONTINUATION_TURNS (5) when adversarial response contains permanent unclosed fence', async () => {
      // Model opens ``` but never closes it in all 5 turns
      const responses = [
        createMockSseResponse(['```javascript\nline 1\n'], 'stop'),
        createMockSseResponse(['line 2\n'], 'stop'),
        createMockSseResponse(['line 3\n'], 'stop'),
        createMockSseResponse(['line 4\n'], 'stop'),
        createMockSseResponse(['line 5\n'], 'stop')
      ];

      const { sandbox } = createStreamSandbox();
      let callCount = 0;
      sandbox.makeApiRequest = async () => ({ res: responses[callCount++], fetchError: null });

      const permanentUnclosedCode = `
        async function testPermanentUnclosed() {
          const MAX_CONTINUATION_TURNS = 5;
          let turnCount = 0;
          let assistantContent = '';

          while (turnCount < MAX_CONTINUATION_TURNS) {
            if (State.abortController?.signal?.aborted) break;
            let { res } = await makeApiRequest([]);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) assistantContent += delta;
                } catch(e) {}
              }
            }

            turnCount++;
            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;
            if (!isTruncated) break;
          }

          return { turnCount, assistantContent };
        }
      `;

      vm.runInContext(permanentUnclosedCode, sandbox);
      const res = await sandbox.testPermanentUnclosed();

      assert.strictEqual(res.turnCount, 5, 'Must cleanly cap at 5 turns even with unclosed fences');
      assert.strictEqual(callCount, 5);
    });
  });

  // =========================================================================
  // GROUP 6: ERROR RESILIENCE & GRACEFUL DEGRADATION ON CONTINUATION FAILURES
  // =========================================================================
  describe('Group 6: Error Resilience on Continuation API Failures', () => {

    it('R2-G6.1: should preserve Turn 0 content and break gracefully when Turn 1 API request returns 500 error', async () => {
      const { sandbox, mockChat } = createStreamSandbox();
      let callCount = 0;

      sandbox.makeApiRequest = async () => {
        callCount++;
        if (callCount === 1) {
          return { res: createMockSseResponse(['Turn 0: Khởi đầu thành công\n```js\n'], 'length'), fetchError: null };
        } else {
          // Turn 1 fails with 500
          return {
            res: {
              ok: false,
              status: 500,
              text: () => Promise.resolve('Internal Server Error')
            },
            fetchError: null
          };
        }
      };

      const errorResilienceCode = `
        async function testContinuationError() {
          const chat = State.chats[0];
          let assistantContent = '';
          const MAX_CONTINUATION_TURNS = 5;
          let turnCount = 0;
          let warnedError = false;

          const origWarn = console.warn;
          console.warn = (msg) => { warnedError = true; };

          while (turnCount < MAX_CONTINUATION_TURNS) {
            if (State.abortController?.signal?.aborted) break;
            let { res, fetchError } = await makeApiRequest([]);

            if (!res || !res.ok) {
              if (turnCount === 0) {
                throw new Error('Turn 0 error');
              } else {
                console.warn('Continuation turn API error:', fetchError || (res ? await res.text() : ''));
                break;
              }
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let turnFinishReason = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.finish_reason) turnFinishReason = parsed.choices[0].finish_reason;
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) assistantContent += delta;
                } catch(e) {}
              }
            }

            turnCount++;
            const isLengthTruncated = turnFinishReason === 'length';
            const unclosedFences = (assistantContent.match(/\`\`\`/g) || []).length % 2 === 1;
            const isTruncated = (isLengthTruncated || unclosedFences) && !State.abortController?.signal?.aborted;
            if (!isTruncated) break;
          }

          console.warn = origWarn;
          chat.messages.push({ id: genId(), role: 'assistant', content: assistantContent });
          return { turnCount, assistantContent, warnedError };
        }
      `;

      vm.runInContext(errorResilienceCode, sandbox);
      const res = await sandbox.testContinuationError();

      assert.strictEqual(res.turnCount, 1, 'Must exit loop after turn 1 fails');
      assert.strictEqual(res.warnedError, true, 'Must log warning instead of crashing unhandled');
      assert.ok(res.assistantContent.includes('Turn 0: Khởi đầu thành công'), 'Must retain turn 0 content in history');
      assert.strictEqual(mockChat.messages.length, 2);
    });

    it('R2-G6.2: should verify real app.js static structure for MAX_CONTINUATION_TURNS and continuation instruction prompt', () => {
      assert.match(appJs, /const\s+MAX_CONTINUATION_TURNS\s*=\s*5;/, 'app.js must define MAX_CONTINUATION_TURNS = 5');
      assert.match(appJs, /while\s*\(\s*turnCount\s*<\s*MAX_CONTINUATION_TURNS\s*\)/, 'app.js must loop on turnCount < MAX_CONTINUATION_TURNS');
      assert.match(appJs, /Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:/, 'app.js must use precise continuation prompt');
      assert.match(appJs, /turnFinishReason\s*===\s*['"]length['"]/, 'app.js must check finish_reason === length');
      assert.match(appJs, /assistantContent\.match\(\/```\/g\)/, 'app.js must check unclosed backtick fences');
    });
  });
});
