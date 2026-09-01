# Detailed Analysis: Thinking Blocks & Anti-Slop UI Architecture (M1)

## 1. Executive Summary

This document provides a comprehensive technical investigation of how thinking tags (`<think>`, `<thought>`) and agent tool calls (`<suna_tool_call>`) are handled in `app.js`, and formulates the design and implementation blueprint for **Collapsible Thinking Blocks** and **Anti-Slop UI styling** in Suna Chat & Live Workspace.

---

## 2. Current State Investigation in `app.js`

### 2.1 `formatMessage()` Analysis (`app.js:4365-4595`)
* **Current Behavior**:
  - Lines 4368-4369 explicitly strip `<suna_tool_call>` tags via regex:
    ```javascript
    let cleanText = text.replace(/<suna_tool_call>[\s\S]*?<\/suna_tool_call>/g, '');
    cleanText = cleanText.replace(/<suna_tool_call\s+[^>]*>[\s\S]*?<\/suna_tool_call>/g, '');
    ```
  - `cleanText` is then passed to `escHtml(cleanText)` at line 4371.
  - **Defect/Gap**: There is zero handling for `<think>` or `<thought>` tags in `formatMessage`.
  - When reasoning models (DeepSeek-R1, Qwen Reasoning, Grok, Ollama) emit `<think>...</think>`, `escHtml` converts them into `&lt;think&gt;...&lt;/think&gt;`, causing raw XML tags to pollute the user-facing chat bubble.
  - When streaming is active (`isStreaming = true`), the closing tag `</think>` has not yet arrived, leaving an open `<think>` tag that renders as raw broken text.

### 2.2 `StreamParser` Analysis (`app.js:2327-2405`)
* **Current State Machine**:
  - Tracks states: `TEXT` -> `IN_TAG` -> `IN_CONTENT` -> `IN_END_TAG`.
  - Hardcoded to detect only `<suna_tool_call>` / `<suna_tool_call ` and `</suna_tool_call>`.
  - All non-tool characters (including `<think>` and `<thought>`) are flushed directly to `this.filteredText`.
  - **Defect/Gap**: `StreamParser` does not isolate reasoning content from standard text during streaming, preventing downstream consumers from distinguishing thinking streams from final answer streams.

### 2.3 Streaming & Render Pipeline (`app.js:5917-6003`)
* **Live Streaming Loop**:
  - As SSE chunks arrive, `bubbleEl.innerHTML = formatMessage(displayContent, true)` is throttled via `requestAnimationFrame`.
  - At the end of the stream, `activeChat.messages.push(...)` persists `assistantContent` with raw tags into IndexedDB/State.
  - When `renderMessages()` runs, `formatMessage(m.content)` formats historical messages from cache.
  - **Requirement**: `formatMessage` must handle both:
    1. Static / Completed messages (where `<think>...</think>` is closed, defaulting to collapsed).
    2. Active Streaming messages (`isStreaming = true` or unclosed `<think>`, showing animated pulse and expandable live thoughts).

### 2.4 Workspace Chat (`app.js:1688-1730`)
* `formatWorkspaceMessageContent(text)` in the Live Workspace Assistant does not yet support thinking block accordion rendering.

---

## 3. Architecture & Specification for Collapsible Thinking Blocks

### 3.1 DOM Component Structure
The thinking block is rendered as an accordion container:

```html
<div class="thinking-block-wrapper ${isStreaming ? 'is-streaming is-open' : 'is-collapsed'}" data-streaming="${isStreaming ? 'true' : 'false'}">
  <div class="thinking-header" onclick="toggleThinkingBlock(this)" role="button" tabindex="0" aria-expanded="${isStreaming ? 'true' : 'false'}" title="Nhấn để mở rộng/thu gọn quá trình suy nghĩ">
    <div class="thinking-header-left">
      <div class="thinking-badge ${isStreaming ? 'is-pulsing' : ''}">
        <span class="material-icons-round thinking-icon">psychology</span>
        <span class="thinking-badge-text">${isStreaming ? 'Đang suy nghĩ...' : 'Quá trình suy nghĩ'}</span>
      </div>
      <span class="thinking-meta-info">${lineCount} dòng suy luận</span>
    </div>
    <div class="thinking-header-right">
      <span class="material-icons-round thinking-toggle-icon">${isStreaming ? 'expand_less' : 'expand_more'}</span>
    </div>
  </div>
  <div class="thinking-body" style="${isStreaming ? 'display: block;' : 'display: none;'}">
    <div class="thinking-content">${formattedThinkingHtml}</div>
  </div>
</div>
```

### 3.2 Parsing Strategy in `formatMessage`
1. **Pre-processing Step**:
   - Extract thinking blocks using regex for both closed and unclosed tags:
     - Closed: `/<(?:think|thought)\b[^>]*>([\s\S]*?)<\/(?:think|thought)>/gi`
     - Unclosed (streaming/truncated): `/<(?:think|thought)\b[^>]*>([\s\S]*)$/gi`
2. **Thinking Content Sanitization**:
   - Strip any nested `<suna_tool_call>` inside thinking blocks.
   - Escape HTML entities using `escHtml()`.
   - Format inner markdown / line breaks (`\n` -> `<br>`).
3. **Placeholder Tokenization**:
   - Save thinking block HTML as placeholder `%%SUNA_THINKING_0%%` so subsequent markdown/line-break transformations on the main text do not alter the thinking container DOM.

### 3.3 State Lifecycle & Transitions
| Event / State | UI Appearance | Badge State | Body Visibility | Chevron Icon |
|---|---|---|---|---|
| **Streaming In-Progress** (`<think>...`) | `.is-streaming.is-open` | Pulsing animation (`.is-pulsing`), "Đang suy nghĩ..." | Visible (`display: block; opacity: 1;`) | `expand_less` |
| **Stream Completed** (`</think>` or `isStreaming=false`) | `.is-collapsed` | Static warm badge, "Quá trình suy nghĩ (${n} dòng)" | Collapsed (`display: none; opacity: 0;`) | `expand_more` |
| **User Toggle Click** | Toggles `.is-open` <-> `.is-collapsed` | Reflects current state | 0.2s cubic-bezier smooth transition | Rotates / updates icon |

---

## 4. Visual & Anti-Slop Design System (Zen Dark Theme)

### 4.1 Design System Specifications
* **Design Read**: *"Zen Dark minimal aesthetic for high-cognitive AI conversation, with warm amber/crimson accents, subtle dark glass surfaces, and fluid micro-interactions."*
* **Palette Tokens**:
  - Surface Background: `rgba(20, 18, 30, 0.65)` (Deep Obsidian `#14121e`)
  - Inner Body Background: `rgba(13, 11, 20, 0.75)` (Deep Zen Dark `#0d0b14`)
  - Accent Primary: `#e8a87c` (Warm Amber)
  - Accent Secondary: `#c0392b` (Zen Crimson)
  - Text Primary: `#e0e0e0`
  - Text Muted: `#8e8a9e`
  - Border Glass: `rgba(232, 168, 124, 0.15)`
* **Typography**:
  - Header & Meta: `'Satoshi', 'Outfit', sans-serif`
  - Badge & Monospace elements: `'JetBrains Mono', monospace`
* **Motion & Transitions**:
  - `0.2s cubic-bezier(0.2, 0.8, 0.2, 1)` for accordion collapse/expand.
  - `@keyframes thinking-pulse` for live streaming indicator.

### 4.2 CSS Rules Blueprint (`styles.css`)

```css
/* ===== Thinking Accordion Block (Zen Dark Theme) ===== */
.thinking-block-wrapper {
  position: relative;
  margin: 12px 0 16px 0;
  background: rgba(20, 18, 30, 0.55);
  border: 1px solid rgba(232, 168, 124, 0.15);
  border-left: 3px solid var(--accent-1, #e8a87c);
  border-radius: var(--radius-md, 14px);
  overflow: hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: border-color 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.thinking-block-wrapper:hover {
  border-color: rgba(232, 168, 124, 0.3);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.thinking-block-wrapper.is-streaming {
  border-left-color: var(--accent-1, #e8a87c);
  box-shadow: 0 0 15px rgba(232, 168, 124, 0.15);
}

.thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.thinking-header:hover {
  background: rgba(255, 255, 255, 0.05);
}

.thinking-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.thinking-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: rgba(232, 168, 124, 0.1);
  border: 1px solid rgba(232, 168, 124, 0.25);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--accent-1, #e8a87c);
}

.thinking-badge .thinking-icon {
  font-size: 15px;
  color: var(--accent-1, #e8a87c);
}

.thinking-badge.is-pulsing {
  animation: thinking-badge-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes thinking-badge-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(232, 168, 124, 0.4);
    opacity: 0.85;
  }
  50% {
    box-shadow: 0 0 12px 2px rgba(232, 168, 124, 0.25);
    opacity: 1;
  }
}

.thinking-meta-info {
  font-size: 0.78rem;
  color: var(--text-muted, #8e8a9e);
  font-family: var(--font-primary, 'Satoshi', sans-serif);
}

.thinking-header-right {
  display: flex;
  align-items: center;
}

.thinking-toggle-icon {
  font-size: 20px;
  color: var(--text-muted, #8e8a9e);
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.15s ease;
}

.thinking-header:hover .thinking-toggle-icon {
  color: var(--accent-1, #e8a87c);
}

.thinking-body {
  padding: 12px 16px 14px 16px;
  background: rgba(13, 11, 20, 0.75);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--text-secondary, #a0a0a0);
  transition: max-height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease;
}

.thinking-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
}
```

---

## 5. JavaScript Implementation Blueprint

### 5.1 Interactive Toggle Function
```javascript
function toggleThinkingBlock(headerEl) {
  const wrapper = headerEl.closest('.thinking-block-wrapper');
  if (!wrapper) return;
  
  const body = wrapper.querySelector('.thinking-body');
  const toggleIcon = wrapper.querySelector('.thinking-toggle-icon');
  const isCurrentlyOpen = wrapper.classList.contains('is-open');

  if (isCurrentlyOpen) {
    wrapper.classList.remove('is-open');
    wrapper.classList.add('is-collapsed');
    headerEl.setAttribute('aria-expanded', 'false');
    if (toggleIcon) toggleIcon.textContent = 'expand_more';
    if (body) {
      body.style.display = 'none';
    }
  } else {
    wrapper.classList.remove('is-collapsed');
    wrapper.classList.add('is-open');
    headerEl.setAttribute('aria-expanded', 'true');
    if (toggleIcon) toggleIcon.textContent = 'expand_less';
    if (body) {
      body.style.display = 'block';
    }
  }
}
```

### 5.2 Enhanced `formatMessage()` with Thinking Blocks
```javascript
function formatMessage(text, isStreaming = false) {
  if (!text) return '';
  
  // Strip tool call tags and their contents
  let cleanText = text.replace(/<suna_tool_call>[\s\S]*?<\/suna_tool_call>/g, '');
  cleanText = cleanText.replace(/<suna_tool_call\s+[^>]*>[\s\S]*?<\/suna_tool_call>/g, '');

  const placeholders = {};
  let placeholderCount = 0;
  function savePlaceholder(content) {
    const token = `%%SUNA_PLACEHOLDER_${placeholderCount++}%%`;
    placeholders[token] = content;
    return token;
  }

  // === EXTRACT AND RENDER THINKING BLOCKS (<think> / <thought>) ===
  let hasThinking = false;
  let thinkingRawContent = '';
  let thinkingIsClosed = false;

  // Case 1: Closed thinking block
  cleanText = cleanText.replace(/<(?:think|thought)\b[^>]*>([\s\S]*?)<\/(?:think|thought)>/gi, (_, content) => {
    hasThinking = true;
    thinkingRawContent = content;
    thinkingIsClosed = true;
    
    const lines = content.trim().split('\n').filter(l => l.trim().length > 0);
    const lineCount = lines.length || 1;
    const safeContent = escHtml(content.trim());
    
    const thinkingHtml = `
      <div class="thinking-block-wrapper is-collapsed" data-streaming="false">
        <div class="thinking-header" onclick="toggleThinkingBlock(this)" role="button" tabindex="0" aria-expanded="false" title="Nhấn để mở rộng/thu gọn quá trình suy nghĩ">
          <div class="thinking-header-left">
            <div class="thinking-badge">
              <span class="material-icons-round thinking-icon">psychology</span>
              <span class="thinking-badge-text">Quá trình suy nghĩ</span>
            </div>
            <span class="thinking-meta-info">${lineCount} dòng suy luận</span>
          </div>
          <div class="thinking-header-right">
            <span class="material-icons-round thinking-toggle-icon">expand_more</span>
          </div>
        </div>
        <div class="thinking-body" style="display: none;">
          <div class="thinking-content">${safeContent.replace(/\n/g, '<br>')}</div>
        </div>
      </div>`;
    return savePlaceholder(thinkingHtml);
  });

  // Case 2: Unclosed thinking block (active streaming or truncated)
  if (!hasThinking) {
    cleanText = cleanText.replace(/<(?:think|thought)\b[^>]*>([\s\S]*)$/gi, (_, content) => {
      hasThinking = true;
      thinkingRawContent = content;
      thinkingIsClosed = false;

      const lines = content.trim().split('\n').filter(l => l.trim().length > 0);
      const lineCount = lines.length || 1;
      const safeContent = escHtml(content.trim());
      const isStreamingActive = isStreaming;

      const thinkingHtml = `
        <div class="thinking-block-wrapper ${isStreamingActive ? 'is-streaming is-open' : 'is-collapsed'}" data-streaming="${isStreamingActive}">
          <div class="thinking-header" onclick="toggleThinkingBlock(this)" role="button" tabindex="0" aria-expanded="${isStreamingActive ? 'true' : 'false'}" title="Nhấn để mở rộng/thu gọn quá trình suy nghĩ">
            <div class="thinking-header-left">
              <div class="thinking-badge ${isStreamingActive ? 'is-pulsing' : ''}">
                <span class="material-icons-round thinking-icon">psychology</span>
                <span class="thinking-badge-text">${isStreamingActive ? 'Đang suy nghĩ...' : 'Quá trình suy nghĩ'}</span>
              </div>
              <span class="thinking-meta-info">${lineCount} dòng suy luận</span>
            </div>
            <div class="thinking-header-right">
              <span class="material-icons-round thinking-toggle-icon">${isStreamingActive ? 'expand_less' : 'expand_more'}</span>
            </div>
          </div>
          <div class="thinking-body" style="${isStreamingActive ? 'display: block;' : 'display: none;'}">
            <div class="thinking-content">${safeContent.replace(/\n/g, '<br>')}</div>
          </div>
        </div>`;
      return savePlaceholder(thinkingHtml);
    });
  }

  let html = escHtml(cleanText);

  // ... (Standard fenced code blocks, math, markdown rules) ...

  // Restore placeholders
  let restored = true;
  while (restored) {
    restored = false;
    html = html.replace(/%%SUNA_PLACEHOLDER_(\d+)%%/g, (match) => {
      if (placeholders.hasOwnProperty(match)) {
        restored = true;
        const val = placeholders[match];
        delete placeholders[match];
        return val;
      }
      return match;
    });
  }

  return html;
}
```

### 5.3 Streaming Parser Extension (`ThinkingStreamParser`)
To satisfy Test T1-F10 and support clean stream separation:
```javascript
class StreamParser {
  constructor() {
    this.buffer = '';
    this.state = 'TEXT'; // 'TEXT', 'IN_TAG', 'IN_CONTENT', 'IN_END_TAG', 'IN_THINK', 'IN_END_THINK'
    this.currentToolContent = '';
    this.toolCalls = [];
    this.thinkingContent = '';
    this.filteredText = '';
  }

  parseChunk(chunk) {
    let result = '';
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      if (this.state === 'TEXT') {
        if (char === '<') {
          this.state = 'IN_TAG';
          this.buffer = '<';
        } else {
          result += char;
        }
      } else if (this.state === 'IN_TAG') {
        this.buffer += char;
        if (this.buffer === '<suna_tool_call>' || (this.buffer.startsWith('<suna_tool_call ') && char === '>')) {
          this.state = 'IN_CONTENT';
          this.currentToolContent = '';
          this.buffer = '';
        } else if (this.buffer === '<think>' || this.buffer === '<thought>') {
          this.state = 'IN_THINK';
          this.buffer = '';
        } else if (
          !'<suna_tool_call>'.startsWith(this.buffer) &&
          !'<suna_tool_call '.startsWith(this.buffer) &&
          !'<think>'.startsWith(this.buffer) &&
          !'<thought>'.startsWith(this.buffer)
        ) {
          result += this.buffer;
          this.buffer = '';
          this.state = 'TEXT';
        }
      } else if (this.state === 'IN_CONTENT') {
        if (char === '<') {
          this.state = 'IN_END_TAG';
          this.buffer = '<';
        } else {
          this.currentToolContent += char;
        }
      } else if (this.state === 'IN_END_TAG') {
        this.buffer += char;
        if (this.buffer === '</suna_tool_call>') {
          this.toolCalls.push(this.currentToolContent.trim());
          this.currentToolContent = '';
          this.buffer = '';
          this.state = 'TEXT';
        } else if (!'</suna_tool_call>'.startsWith(this.buffer)) {
          this.currentToolContent += this.buffer;
          this.buffer = '';
          this.state = 'IN_CONTENT';
        }
      } else if (this.state === 'IN_THINK') {
        if (char === '<') {
          this.state = 'IN_END_THINK';
          this.buffer = '<';
        } else {
          this.thinkingContent += char;
        }
      } else if (this.state === 'IN_END_THINK') {
        this.buffer += char;
        if (this.buffer === '</think>' || this.buffer === '</thought>') {
          this.buffer = '';
          this.state = 'TEXT';
        } else if (!'</think>'.startsWith(this.buffer) && !'</thought>'.startsWith(this.buffer)) {
          this.thinkingContent += this.buffer;
          this.buffer = '';
          this.state = 'IN_THINK';
        }
      }
    }
    this.filteredText += result;
    return result;
  }

  flush() {
    let extra = '';
    if (this.state === 'IN_TAG') {
      extra += this.buffer;
    } else if (this.state === 'IN_END_TAG') {
      this.currentToolContent += this.buffer;
    } else if (this.state === 'IN_END_THINK') {
      this.thinkingContent += this.buffer;
    }
    this.buffer = '';
    this.state = 'TEXT';
    this.filteredText += extra;
    return extra;
  }
}
```

---

## 6. Verification & Edge Case Matrix

| Case ID | Scenario | Expected Behavior | Verification Target |
|---|---|---|---|
| **V-TH-1** | Normal closed `<think>steps...</think>` | Renders `.thinking-block-wrapper.is-collapsed`, hidden body, "Quá trình suy nghĩ", line counter | `test_collapsible_code_and_continuation.js` |
| **V-TH-2** | Unclosed `<think>` in streaming (`isStreaming=true`) | Renders `.is-streaming.is-open`, pulsing badge `.is-pulsing`, open body | Live streaming simulation in DOM sandbox |
| **V-TH-3** | `<thought>` synonym tag | Matches `<thought>` identically to `<think>` | Regex parity test |
| **V-TH-4** | Mixed `<think>` + `<suna_tool_call>` | Tool call stripped/isolated into `toolCalls`, thinking rendered as accordion | Test T1-F10 & Agent harness |
| **V-TH-5** | XSS injection in thinking content | Content escaped via `escHtml()`, no unescaped HTML tags injected | Security scan / VM execution |
| **V-TH-6** | Toggle click interaction | `toggleThinkingBlock(btn)` cleanly toggles `.is-open` and `.is-collapsed` with `aria-expanded` update | Event handler unit test |
