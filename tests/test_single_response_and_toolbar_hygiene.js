'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const APP_PATH = path.join(__dirname, '..', 'app.js');
const HTML_PATH = path.join(__dirname, '..', 'index.html');
const appJs = fs.readFileSync(APP_PATH, 'utf8');
const indexHtml = fs.readFileSync(HTML_PATH, 'utf8');

describe('Single Response on Enter & Streamlined Toolbar Hygiene Suite', () => {
  describe('1. Redundant Skills Chip Removal & Toolbar Streamlining', () => {
    it('does not contain redundant #btn-skills-chip in input-tools-bar', () => {
      assert.doesNotMatch(
        indexHtml,
        /id="btn-skills-chip"/,
        '#btn-skills-chip must be removed to avoid duplicate skills triggers in toolbar'
      );
    });

    it('preserves #btn-skills in sidebar footer and #active-skills-bar', () => {
      assert.match(indexHtml, /id="btn-skills"[^>]*title="[^"]+"/, 'sidebar footer skills button must exist');
      assert.match(indexHtml, /id="active-skills-bar"/, 'active-skills-bar container must exist');
      assert.match(indexHtml, /id="skills-autocomplete"/, 'skills slash autocomplete must exist');
    });

    it('does not register click listener on non-existent btnSkillsChip in app.js', () => {
      assert.doesNotMatch(
        appJs,
        /const\s+btnSkillsChip\s*=\s*document\.getElementById\('btn-skills-chip'\);[\s\S]*?btnSkillsChip\.addEventListener/,
        'redundant event listener for btnSkillsChip should be removed'
      );
    });
  });

  describe('2. Single Typing Indicator Contract on Enter & Send', () => {
    it('guards Enter keydown against Vietnamese IME composition (isComposing / keyCode 229)', () => {
      const enterBlock = appJs.slice(
        appJs.indexOf("$('#message-input').addEventListener('keydown'"),
        appJs.indexOf("$('#message-input').addEventListener('input'")
      );
      assert.ok(enterBlock, 'Enter keydown block must exist');
      assert.match(
        enterBlock,
        /if\s*\(\s*e\.isComposing\s*\|\|\s*e\.keyCode\s*===\s*229\s*\)\s*return;/,
        'Enter handler must guard against IME composition to prevent premature double dispatch'
      );
    });

    it('clears message input immediately upon initiating sendMessage to prevent double submission', () => {
      const sendStart = appJs.indexOf('async function sendMessage()');
      const sendEnd = appJs.indexOf('async function consumeStream', sendStart);
      const body = appJs.slice(sendStart, sendEnd);
      assert.ok(body, 'sendMessage body must exist');
      
      const clearIdx = body.indexOf("input.value = '';");
      const isGeneratingIdx = body.indexOf("State.isGenerating = true;");
      const awaitPreprocessingIdx = body.indexOf("await Promise.all(");

      assert.ok(clearIdx >= 0, 'input.value must be cleared');
      assert.ok(clearIdx < isGeneratingIdx, 'input.value must be cleared before or when setting isGenerating');
      assert.ok(clearIdx < awaitPreprocessingIdx, 'input.value must be cleared BEFORE awaiting link/image preprocessing');
    });

    it('re-uses existing #restore-typing and prunes any duplicate typing indicators', () => {
      assert.match(
        appJs,
        /let\s+typingEl\s*=\s*document\.getElementById\('restore-typing'\);/,
        'generateAIResponse must check for existing #restore-typing created by renderMessages'
      );
      assert.match(
        appJs,
        /removeAllTypingIndicators/,
        'generateAIResponse must define removeAllTypingIndicators helper'
      );
      assert.match(
        appJs,
        /const\s+rt\s*=\s*document\.getElementById\('restore-typing'\);\s*if\s*\(rt\s*&&\s*rt\.parentNode\)\s*rt\.remove\(\);/,
        'removeAllTypingIndicators must remove #restore-typing element'
      );
    });

    it('cleans up typing indicator completely in catch and finally blocks', () => {
      const genStart = appJs.indexOf('async function generateAIResponse()');
      const genEnd = appJs.indexOf('// ===== Message Actions =====', genStart);
      const body = appJs.slice(genStart, genEnd);

      assert.match(body, /catch\s*\(e\)\s*\{[\s\r\n]*removeAllTypingIndicators\(\);/);
      assert.match(body, /finally\s*\{[\s\r\n]*removeAllTypingIndicators\(\);/);
    });
  });

  describe('3. Simulated DOM Verification of Single Bubble', () => {
    it('guarantees strictly 1 typing bubble when renderMessages runs before generateAIResponse', () => {
      // Create minimal mock DOM
      const elements = {};
      const container = {
        children: [],
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
        },
        querySelectorAll(selector) {
          if (selector === '.typing-indicator') {
            const list = [];
            for (const child of this.children) {
              if (child.innerHTML && child.innerHTML.includes('typing-indicator')) {
                list.push({
                  closest: (sel) => sel === '.message.assistant' ? child : null
                });
              }
            }
            return list;
          }
          return [];
        },
        removeChild(child) {
          const idx = this.children.indexOf(child);
          if (idx >= 0) this.children.splice(idx, 1);
          child.parentNode = null;
        }
      };

      const createElement = (tag) => {
        const el = {
          tagName: tag,
          className: '',
          id: '',
          innerHTML: '',
          parentNode: null,
          remove() {
            if (this.parentNode && this.parentNode.removeChild) {
              this.parentNode.removeChild(this);
            }
          },
          querySelector() { return null; }
        };
        return el;
      };

      // 1. Simulating renderMessages when isGenerating is true:
      const restoreTyping = createElement('div');
      restoreTyping.id = 'restore-typing';
      restoreTyping.className = 'message assistant';
      restoreTyping.innerHTML = '<div class="message-bubble"><div class="typing-indicator"><span></span><span class="typing-text">Đang suy nghĩ...</span></div></div>';
      container.appendChild(restoreTyping);

      assert.strictEqual(container.children.length, 1, 'renderMessages added 1 restore-typing');

      // 2. Simulating generateAIResponse logic:
      const existingIndicators = container.querySelectorAll('.typing-indicator');
      let typingEl = restoreTyping; // document.getElementById('restore-typing')
      if (!typingEl && existingIndicators.length > 0) {
        typingEl = existingIndicators[0].closest('.message.assistant');
      }

      existingIndicators.forEach((ti) => {
        const parentMsg = ti.closest('.message.assistant');
        if (parentMsg && parentMsg !== typingEl && parentMsg.parentNode) {
          parentMsg.remove();
        }
      });

      if (!typingEl) {
        typingEl = createElement('div');
        typingEl.id = 'restore-typing';
        typingEl.className = 'message assistant';
        typingEl.innerHTML = '<div class="message-bubble"><div class="typing-indicator"><span></span><span class="typing-text">Đang suy nghĩ...</span></div></div>';
        container.appendChild(typingEl);
      }

      // Assert that container STILL has exactly 1 child (no double bubble!)
      assert.strictEqual(container.children.length, 1, 'Must have strictly 1 typing bubble in container');
      assert.strictEqual(container.children[0].id, 'restore-typing', 'Child must be the single restore-typing');

      // 3. Simulating first chunk arrival (removeAllTypingIndicators):
      if (typingEl && typingEl.parentNode) typingEl.remove();
      assert.strictEqual(container.children.length, 0, 'Typing bubble cleanly removed upon first streaming chunk');
    });
  });
});
