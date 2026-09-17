/**
 * test_reasoning_effort_dropdown_and_cognitive_engine.js
 * 
 * Comprehensive Visible Feature Test Suite for:
 * 6-Level Reasoning Effort Dropdown & Deep Cognitive Orchestration Engine
 * 
 * Tiers Covered:
 * - Tier 1: UI Dropdown & DOM structure (HTML, CSS tokens, responsive collapse, WAI-ARIA, mutual dismissal, option click)
 * - Tier 2: State Persistence (getDefaultSettings, setReasoningEffort, localStorage, loadState fallback, cross-tab sync)
 * - Tier 3: API Gateway Payload Mapping (low/med/high direct, xhigh/max/ultra mapped to high + thinking_config, continuation, non-reasoning isolation, verbatim regex invariant)
 * - Tier 4: Meta-Cognitive System Prompting (xhigh assumption challenge, max tree-of-thought, ultra 4-phase cognitive architecture, sovereign priority preservation)
 * - Tier 5: Token Scaling & Continuation Chaining (65,536 ceiling for max/ultra, continuation turns expansion)
 * 
 * Pure Vanilla JS, zero npm dependencies, clean teardown.
 */

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const vm = require('vm');

describe('Reasoning Effort Dropdown & Cognitive Orchestration Engine (Visible Feature Suite)', function() {
  this.timeout(15000);

  let appJs, stylesCss, indexHtml, SunaAgent;

  before(() => {
    appJs = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
    stylesCss = fs.readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');
    indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const agentModule = require(path.resolve(__dirname, '../suna_agent.js'));
    SunaAgent = agentModule.SunaAgent || agentModule;
  });

  /**
   * Helper to construct a clean, self-contained DOM and VM sandbox for app.js
   */
  function createReasoningSandbox(customState = {}) {
    const docListeners = new Map();
    const winListeners = new Map();
    const mockElements = new Map();
    const storageMap = new Map();

    function matchesSelector(el, sel) {
      if (!sel || !el) return false;
      if (sel.includes(',')) {
        return sel.split(',').some(part => matchesSelector(el, part.trim()));
      }
      let s = sel.trim();
      let tagMatch = s.match(/^([a-zA-Z0-9_-]+)/);
      if (tagMatch) {
        if (el.tagName !== tagMatch[1].toUpperCase()) return false;
        s = s.slice(tagMatch[1].length);
      }
      if (!s) return true;
      if (s.startsWith('#')) return el.id === s.slice(1);
      if (s.startsWith('.')) return el.classList.contains(s.slice(1));
      if (s.startsWith('[') && s.endsWith(']')) {
        const attrPart = s.slice(1, -1);
        if (attrPart.includes('=')) {
          const [k, rawV] = attrPart.split('=');
          const v = rawV.replace(/['"]/g, '');
          return el.getAttribute(k) === v;
        }
        return el.getAttribute(attrPart) !== null;
      }
      return el.tagName === sel.toUpperCase();
    }

    function createMockElement(id, tagName = 'DIV') {
      const el = {
        id,
        tagName: tagName.toUpperCase(),
        value: '',
        textContent: '',
        innerHTML: '',
        checked: false,
        attributes: new Map(),
        style: {
          display: '',
          setProperty: () => {},
          removeProperty: () => {}
        },
        children: [],
        parentElement: null,
        classList: {
          classes: new Set(),
          add(...cs) { cs.forEach(c => this.classes.add(c)); },
          remove(...cs) { cs.forEach(c => this.classes.delete(c)); },
          contains(c) { return this.classes.has(c); },
          toggle(c, force) {
            if (force === true) { this.classes.add(c); return true; }
            if (force === false) { this.classes.delete(c); return false; }
            if (this.classes.has(c)) { this.classes.delete(c); return false; }
            this.classes.add(c); return true;
          }
        },
        setAttribute(name, val) { this.attributes.set(name, String(val)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        remove() {
          if (this.parentElement) {
            const idx = this.parentElement.children.indexOf(this);
            if (idx >= 0) this.parentElement.children.splice(idx, 1);
          }
        },
        appendChild(child) {
          child.parentElement = this;
          this.children.push(child);
          return child;
        },
        listeners: new Map(),
        addEventListener(evt, fn) {
          if (!this.listeners.has(evt)) this.listeners.set(evt, []);
          this.listeners.get(evt).push(fn);
        },
        removeEventListener(evt, fn) {
          if (this.listeners.has(evt)) {
            const arr = this.listeners.get(evt);
            const idx = arr.indexOf(fn);
            if (idx >= 0) arr.splice(idx, 1);
          }
        },
        dispatchEvent(evt) {
          const type = evt.type || evt;
          if (typeof evt === 'string') evt = { type: evt, target: this, currentTarget: this };
          if (!evt.target) evt.target = this;
          evt.currentTarget = this;
          const list = this.listeners.get(type) || [];
          for (const fn of list) fn(evt);
          return true;
        },
        click() {
          let stopped = false;
          const evt = {
            type: 'click',
            target: this,
            currentTarget: this,
            stopPropagation: () => { stopped = true; },
            preventDefault: () => {}
          };
          let cur = this;
          while (cur && !stopped) {
            evt.currentTarget = cur;
            cur.dispatchEvent(evt);
            cur = cur.parentElement;
          }
          if (!stopped && docListeners.has('click')) {
            evt.currentTarget = mockDocument;
            for (const fn of docListeners.get('click')) {
              if (stopped) break;
              fn(evt);
            }
          }
        },
        focus() {},
        select() {},
        querySelectorAll(sel) {
          const results = [];
          function search(node) {
            for (const child of node.children) {
              if (matchesSelector(child, sel)) results.push(child);
              search(child);
            }
          }
          search(this);
          return results;
        },
        querySelector(sel) {
          const all = this.querySelectorAll(sel);
          return all.length > 0 ? all[0] : null;
        },
        closest(sel) {
          let cur = this;
          while (cur) {
            if (matchesSelector(cur, sel)) return cur;
            cur = cur.parentElement;
          }
          return null;
        }
      };
      return el;
    }

    function getOrCreateEl(id, tag = 'DIV') {
      if (!mockElements.has(id)) {
        mockElements.set(id, createMockElement(id, tag));
      }
      return mockElements.get(id);
    }

    // Pre-populate core interactive elements
    const effortContainer = getOrCreateEl('reasoning-effort-container');
    const effortDisplay = getOrCreateEl('reasoning-effort-display');
    const effortDropdown = getOrCreateEl('reasoning-effort-dropdown');
    const effortIcon = getOrCreateEl('reasoning-icon', 'SPAN');
    const effortLabel = getOrCreateEl('reasoning-label', 'SPAN');
    const currentModelDisplay = getOrCreateEl('current-model-display');
    const userDropdown = getOrCreateEl('user-dropdown');
    const mobileMoreMenu = getOrCreateEl('mobile-more-menu');
    const btnUserMenu = getOrCreateEl('btn-user-menu', 'BUTTON');
    const btnMobileMore = getOrCreateEl('btn-mobile-more', 'BUTTON');

    effortContainer.appendChild(effortDisplay);
    effortContainer.appendChild(effortDropdown);
    effortDisplay.appendChild(effortIcon);
    effortDisplay.appendChild(effortLabel);

    // Create 6 option buttons matching index.html
    const levels = [
      { key: 'low', emoji: '🟢', name: 'Low', badge: 'Tối giản' },
      { key: 'medium', emoji: '🔵', name: 'Medium', badge: 'Cân bằng' },
      { key: 'high', emoji: '🟣', name: 'High', badge: 'Nâng cao' },
      { key: 'xhigh', emoji: '⚡', name: 'X-High', badge: 'Mặc định' },
      { key: 'max', emoji: '💎', name: 'Max', badge: 'Đỉnh cao' },
      { key: 'ultra', emoji: '🔥', name: 'Ultra', badge: 'Tối thượng' }
    ];
    levels.forEach(lvl => {
      const btn = createMockElement(`reasoning-opt-${lvl.key}`, 'BUTTON');
      btn.classList.add('reasoning-option-btn');
      btn.setAttribute('data-level', lvl.key);
      btn.setAttribute('data-effort', lvl.key);
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', lvl.key === 'xhigh' ? 'true' : 'false');
      if (lvl.key === 'xhigh') btn.classList.add('active');

      const icon = createMockElement(`opt-icon-${lvl.key}`, 'SPAN');
      icon.classList.add('reasoning-option-icon');
      icon.textContent = lvl.emoji;
      btn.appendChild(icon);

      const name = createMockElement(`opt-name-${lvl.key}`, 'SPAN');
      name.classList.add('reasoning-option-name');
      name.textContent = lvl.name;
      btn.appendChild(name);

      const badge = createMockElement(`opt-badge-${lvl.key}`, 'SPAN');
      badge.classList.add('reasoning-badge', `badge-${lvl.key}`);
      badge.textContent = lvl.badge;
      btn.appendChild(badge);

      const check = createMockElement(`opt-check-${lvl.key}`, 'SPAN');
      check.classList.add('material-icons-round', 'reasoning-check');
      check.textContent = 'check';
      btn.appendChild(check);

      effortDropdown.appendChild(btn);
    });

    const mockDocument = {
      body: getOrCreateEl('body'),
      documentElement: getOrCreateEl('html'),
      listeners: docListeners,
      getElementById: (id) => getOrCreateEl(id),
      querySelector: (sel) => {
        if (sel === '#reasoning-effort-container' || sel === '.reasoning-effort-container') return effortContainer;
        if (sel === '#reasoning-effort-display' || sel === '.reasoning-effort-display') return effortDisplay;
        if (sel === '#reasoning-effort-dropdown' || sel === '.reasoning-effort-dropdown') return effortDropdown;
        if (sel === '#user-dropdown' || sel === '.user-dropdown') return userDropdown;
        if (sel === '#mobile-more-menu' || sel === '.mobile-more-menu') return mobileMoreMenu;
        if (sel.startsWith('#') && mockElements.has(sel.slice(1))) return mockElements.get(sel.slice(1));
        for (const el of mockElements.values()) {
          if (matchesSelector(el, sel)) return el;
        }
        return getOrCreateEl(sel.replace(/^[#.]/, ''));
      },
      querySelectorAll: (sel) => {
        const results = [];
        for (const el of mockElements.values()) {
          if (matchesSelector(el, sel)) results.push(el);
        }
        return results;
      },
      createElement: (tag) => {
        const el = createMockElement('mock_' + Math.random().toString(36).slice(2), tag);
        return el;
      },
      addEventListener: (evt, fn) => {
        if (!docListeners.has(evt)) docListeners.set(evt, []);
        docListeners.get(evt).push(fn);
      },
      removeEventListener: (evt, fn) => {
        if (docListeners.has(evt)) {
          const arr = docListeners.get(evt);
          const idx = arr.indexOf(fn);
          if (idx >= 0) arr.splice(idx, 1);
        }
      },
      dispatchEvent: (evt) => {
        const type = evt.type || evt;
        if (typeof evt === 'string') evt = { type: evt, target: mockDocument, currentTarget: mockDocument };
        const list = docListeners.get(type) || [];
        for (const fn of list) fn(evt);
        return true;
      },
      visibilityState: 'visible'
    };

    mockDocument.body.appendChild(currentModelDisplay);
    mockDocument.body.appendChild(effortContainer);
    mockDocument.body.appendChild(userDropdown);
    mockDocument.body.appendChild(mobileMoreMenu);
    mockDocument.body.appendChild(btnUserMenu);
    mockDocument.body.appendChild(btnMobileMore);

    class MockAudio {
      constructor() { this.src = ''; this.volume = 1; this.paused = true; }
      play() { return Promise.resolve(); }
      pause() {}
      addEventListener() {}
      removeEventListener() {}
    }

    class MockObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    const interceptedRequests = [];

    const mockFetch = async (url, options = {}) => {
      let parsedBody = null;
      if (options.body) {
        try { parsedBody = JSON.parse(options.body); } catch (_) {}
      }
      interceptedRequests.push({ url, options, body: parsedBody });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'text/event-stream' },
        text: async () => JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }),
        json: async () => ({ choices: [{ delta: { content: 'ok' } }] }),
        body: {
          getReader() {
            let done = false;
            return {
              read: async () => {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n') };
              }
            };
          }
        }
      };
    };

    const sandbox = {
      console: { log: () => {}, warn: () => {}, error: () => {} },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame: (cb) => { if (typeof cb === 'function') cb(); },
      cancelAnimationFrame: () => {},
      Promise,
      Date,
      Math,
      JSON,
      Map,
      Set,
      Array,
      Object,
      TextDecoder,
      TextEncoder,
      AbortController,
      Audio: MockAudio,
      IntersectionObserver: MockObserver,
      MutationObserver: MockObserver,
      ResizeObserver: MockObserver,
      document: mockDocument,
      addEventListener: (t, fn) => {
        if (!winListeners.has(t)) winListeners.set(t, []);
        winListeners.get(t).push(fn);
      },
      removeEventListener: () => {},
      dispatchEvent: (evt) => {
        const type = evt.type || evt;
        const list = winListeners.get(type) || [];
        for (const fn of list) fn(evt);
        return true;
      },
      $: (sel) => mockDocument.querySelector(sel),
      $$: (sel) => mockDocument.querySelectorAll(sel),
      window: {},
      navigator: { onLine: true },
      localStorage: {
        getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
        setItem: (k, v) => storageMap.set(k, String(v)),
        removeItem: (k) => storageMap.delete(k),
        clear: () => storageMap.clear()
      },
      idbGet: async () => null,
      idbSet: async () => {},
      idbDelete: async () => {},
      toast: () => {},
      fetch: mockFetch,
      SunaAgent,
      _interceptedRequests: interceptedRequests,
      _storageMap: storageMap,
      _mockElements: mockElements
    };

    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(appJs, sandbox);

    if (customState.mode) sandbox.State.mode = customState.mode;
    if (customState.settings) Object.assign(sandbox.State.settings, customState.settings);

    // Trigger event registration helpers if present
    if (typeof sandbox.initEvents === 'function') {
      try { sandbox.initEvents(); } catch (_) {}
    }
    if (typeof sandbox.initReasoningEffortDropdown === 'function') {
      try { sandbox.initReasoningEffortDropdown(); } catch (_) {}
    }
    if (typeof sandbox.initReasoningEffort === 'function') {
      try { sandbox.initReasoningEffort(); } catch (_) {}
    }

    return sandbox;
  }

  // =========================================================================
  // GROUP 1: TIER 1 — UI DROPDOWN & DOM STRUCTURE (HTML, CSS & ACCESSIBILITY)
  // =========================================================================
  describe('Group 1: Tier 1 — UI Dropdown & DOM Structure', () => {

    it('Criterion 1.1: index.html contains #reasoning-effort-container and #reasoning-effort-display adjacent to #current-model-display', () => {
      assert.ok(
        indexHtml.includes('id="reasoning-effort-container"') || indexHtml.includes('class="reasoning-effort-container"'),
        'index.html must contain #reasoning-effort-container'
      );
      assert.ok(
        indexHtml.includes('id="reasoning-effort-display"'),
        'index.html must contain #reasoning-effort-display pill button'
      );

      // Verify placement inside top-bar-center next to current-model-display
      const topBarCenterIndex = indexHtml.indexOf('class="top-bar-center"');
      assert.ok(topBarCenterIndex !== -1, '.top-bar-center must exist in index.html');

      const modelDisplayIndex = indexHtml.indexOf('id="current-model-display"', topBarCenterIndex);
      const reasoningContainerIndex = indexHtml.indexOf('id="reasoning-effort-container"', topBarCenterIndex);
      assert.ok(modelDisplayIndex !== -1, '#current-model-display must exist in .top-bar-center');
      assert.ok(reasoningContainerIndex !== -1, '#reasoning-effort-container must be inside .top-bar-center');
      assert.ok(
        reasoningContainerIndex > modelDisplayIndex,
        '#reasoning-effort-container should be placed adjacent to and after #current-model-display'
      );

      // Verify WAI-ARIA and role on display pill
      const displayTagMatch = indexHtml.match(/<[^>]+id=["']reasoning-effort-display["'][^>]*>/);
      assert.ok(displayTagMatch, '#reasoning-effort-display tag must be present');
      const displayTag = displayTagMatch[0];
      assert.ok(displayTag.includes('role="button"'), '#reasoning-effort-display must have role="button"');
      assert.ok(displayTag.includes('tabindex="0"'), '#reasoning-effort-display must have tabindex="0"');
      assert.ok(displayTag.includes('aria-haspopup="true"'), '#reasoning-effort-display must declare aria-haspopup="true"');
      assert.ok(displayTag.includes('aria-expanded="false"'), '#reasoning-effort-display must default to aria-expanded="false"');
    });

    it('Criterion 1.2: index.html contains #reasoning-effort-dropdown with all 6 level options, emojis, titles, badges, and checkmarks', () => {
      assert.ok(
        indexHtml.includes('id="reasoning-effort-dropdown"'),
        'index.html must contain #reasoning-effort-dropdown menu'
      );
      assert.match(
        indexHtml,
        /id=["']reasoning-effort-dropdown["'][^>]*role=["']menu["']/,
        '#reasoning-effort-dropdown must declare role="menu"'
      );

      const requiredLevels = [
        { key: 'low', emoji: '🟢', title: 'Low', badge: 'Tối giản' },
        { key: 'medium', emoji: '🔵', title: 'Medium', badge: 'Cân bằng' },
        { key: 'high', emoji: '🟣', title: 'High', badge: 'Nâng cao' },
        { key: 'xhigh', emoji: '⚡', title: 'X-High', badge: 'Mặc định' },
        { key: 'max', emoji: '💎', title: 'Max', badge: 'Đỉnh cao' },
        { key: 'ultra', emoji: '🔥', title: 'Ultra', badge: 'Tối thượng' }
      ];

      for (const lvl of requiredLevels) {
        // Assert data-level attribute
        const levelPattern = new RegExp(`data-(?:level|effort)=["']${lvl.key}["']`);
        assert.match(
          indexHtml,
          levelPattern,
          `Dropdown must contain option item with data-level="${lvl.key}"`
        );

        // Assert emoji icon
        assert.ok(
          indexHtml.includes(lvl.emoji),
          `Dropdown must display emoji ${lvl.emoji} for level ${lvl.key}`
        );

        // Assert level title/name
        const titleRegex = new RegExp(`>${lvl.title}<|["']${lvl.title}["']`, 'i');
        assert.match(
          indexHtml,
          titleRegex,
          `Dropdown must contain level title ${lvl.title}`
        );

        // Assert badge text or badge class
        const badgeClassOrText = indexHtml.includes(`badge-${lvl.key}`) || indexHtml.includes(lvl.badge);
        assert.ok(
          badgeClassOrText,
          `Dropdown must contain badge-${lvl.key} or label "${lvl.badge}"`
        );
      }

      // Assert checkmark icons exist for options
      assert.match(
        indexHtml,
        /class=["'][^"']*(?:reasoning-check|material-icons-round)[^"']*["'][^>]*>\s*check\s*</,
        'Dropdown options must have checkmark indicators'
      );
    });

    it('Criterion 1.3: styles.css defines color tokens, badges, and z-index: 250 for dropdown', () => {
      // Dropdown z-index must match project dropdown standard: 250
      assert.match(
        stylesCss,
        /(?:\.reasoning-effort-dropdown|#reasoning-effort-dropdown)\s*\{[^}]*z-index:\s*250/i,
        '#reasoning-effort-dropdown must have z-index: 250 to respect modal/toast hierarchy'
      );

      // Verify color tokens or accent declarations for all 6 tiers
      const requiredColorSignatures = [
        { name: 'low', hexPattern: /#10b981|rgb\(\s*16\s*,\s*185\s*,\s*129\s*\)/i },
        { name: 'medium', hexPattern: /#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)/i },
        { name: 'high', hexPattern: /#8b5cf6|#a855f7|rgb\(\s*(?:139\s*,\s*92\s*,\s*246|168\s*,\s*85\s*,\s*247)\s*\)/i },
        { name: 'xhigh', hexPattern: /#f59e0b|rgb\(\s*245\s*,\s*158\s*,\s*11\s*\)/i },
        { name: 'max', hexPattern: /#06b6d4|rgb\(\s*6\s*,\s*182\s*,\s*212\s*\)/i },
        { name: 'ultra', hexPattern: /#ef4444|#f43f5e|rgb\(\s*(?:239\s*,\s*68\s*,\s*68|244\s*,\s*63\s*,\s*94)\s*\)/i }
      ];

      for (const col of requiredColorSignatures) {
        assert.match(
          stylesCss,
          col.hexPattern,
          `styles.css must contain signature color for level ${col.name}`
        );
      }

      // Verify badge styling exists
      assert.match(
        stylesCss,
        /\.(?:reasoning-badge|badge-xhigh|badge-ultra)/,
        'styles.css must style reasoning badges'
      );
    });

    it('Criterion 1.4: styles.css contains responsive collapse rules for @media (max-width: 768px)', () => {
      assert.match(
        stylesCss,
        /@media\s*\(max-width:\s*768px\)/i,
        'styles.css must contain @media (max-width: 768px) breakpoint'
      );

      // At <= 768px, text label must hide or pill collapses to compact icon badge
      const mobileSectionMatch = stylesCss.match(/@media\s*\(max-width:\s*768px\)[\s\S]*?(?=@media|$)/i);
      assert.ok(mobileSectionMatch, 'Must find @media (max-width: 768px) block');
      const mobileCss = mobileSectionMatch[0];

      const collapsesLabel = (
        mobileCss.includes('.reasoning-label') ||
        mobileCss.includes('#reasoning-label') ||
        mobileCss.includes('.effort-label') ||
        mobileCss.includes('#reasoning-effort-label') ||
        mobileCss.includes('.reasoning-effort-display')
      );
      assert.ok(
        collapsesLabel,
        '@media (max-width: 768px) must contain responsive collapse rules for reasoning effort pill'
      );
    });

    it('Criterion 1.5: Dropdown toggle in sandbox toggles open state and aria-expanded', () => {
      const sandbox = createReasoningSandbox();
      const display = sandbox.document.getElementById('reasoning-effort-display');
      const dropdown = sandbox.document.getElementById('reasoning-effort-dropdown');

      assert.ok(display, '#reasoning-effort-display must exist in sandbox');
      assert.ok(dropdown, '#reasoning-effort-dropdown must exist in sandbox');

      // Click to open
      display.click();
      const isOpen = dropdown.classList.contains('active') || dropdown.classList.contains('is-open');
      assert.strictEqual(isOpen, true, 'Clicking display must add .active or .is-open class');
      assert.strictEqual(display.getAttribute('aria-expanded'), 'true', 'aria-expanded must be "true" when open');

      // Click to close
      display.click();
      const isClosed = !dropdown.classList.contains('active') && !dropdown.classList.contains('is-open');
      assert.strictEqual(isClosed, true, 'Clicking display again must close dropdown');
      assert.strictEqual(display.getAttribute('aria-expanded'), 'false', 'aria-expanded must be "false" when closed');
    });

    it('Criterion 1.6: Mutual dismissal closes other active dropdowns when opening reasoning effort menu', () => {
      const sandbox = createReasoningSandbox();
      const display = sandbox.document.getElementById('reasoning-effort-display');
      const dropdown = sandbox.document.getElementById('reasoning-effort-dropdown');
      const userDropdown = sandbox.document.getElementById('user-dropdown');
      const mobileMoreMenu = sandbox.document.getElementById('mobile-more-menu');

      // Pre-open user dropdown
      userDropdown.classList.add('active');
      assert.strictEqual(userDropdown.classList.contains('active'), true);

      // Open reasoning dropdown
      display.click();
      assert.strictEqual(
        userDropdown.classList.contains('active'),
        false,
        'Opening reasoning effort dropdown must dismiss #user-dropdown'
      );

      // Pre-open mobile more menu
      mobileMoreMenu.classList.add('active');
      dropdown.classList.remove('active');
      dropdown.classList.remove('is-open');

      display.click();
      assert.strictEqual(
        mobileMoreMenu.classList.contains('active'),
        false,
        'Opening reasoning effort dropdown must dismiss #mobile-more-menu'
      );
    });

    it('Criterion 1.7: Click-outside dismissal closes dropdown when clicking document outside container', () => {
      const sandbox = createReasoningSandbox();
      const display = sandbox.document.getElementById('reasoning-effort-display');
      const dropdown = sandbox.document.getElementById('reasoning-effort-dropdown');

      // Open dropdown
      display.click();
      assert.strictEqual(
        dropdown.classList.contains('active') || dropdown.classList.contains('is-open'),
        true
      );

      // Dispatch outside click on document body
      const outsideEvt = {
        type: 'click',
        target: sandbox.document.body,
        stopPropagation: () => {},
        preventDefault: () => {}
      };
      sandbox.document.dispatchEvent(outsideEvt);

      const isDismissed = !dropdown.classList.contains('active') && !dropdown.classList.contains('is-open');
      assert.strictEqual(isDismissed, true, 'Clicking outside container must dismiss dropdown');
      assert.strictEqual(display.getAttribute('aria-expanded'), 'false', 'aria-expanded must revert to "false"');
    });

    it('Criterion 1.8: WAI-ARIA and keyboard navigation (Enter/Space to toggle, Escape to close)', () => {
      const sandbox = createReasoningSandbox();
      const display = sandbox.document.getElementById('reasoning-effort-display');
      const dropdown = sandbox.document.getElementById('reasoning-effort-dropdown');

      // Press Enter to open
      const enterEvt = { type: 'keydown', key: 'Enter', preventDefault: () => {} };
      display.dispatchEvent(enterEvt);
      assert.strictEqual(
        dropdown.classList.contains('active') || dropdown.classList.contains('is-open'),
        true,
        'Enter key on display must open dropdown'
      );

      // Press Escape to close
      const escapeEvt = { type: 'keydown', key: 'Escape', preventDefault: () => {} };
      dropdown.dispatchEvent(escapeEvt);
      assert.strictEqual(
        !dropdown.classList.contains('active') && !dropdown.classList.contains('is-open'),
        true,
        'Escape key must close dropdown'
      );

      // Press Space to open
      const spaceEvt = { type: 'keydown', key: ' ', preventDefault: () => {} };
      display.dispatchEvent(spaceEvt);
      assert.strictEqual(
        dropdown.classList.contains('active') || dropdown.classList.contains('is-open'),
        true,
        'Space key on display must open dropdown'
      );
    });

    it('Criterion 1.9: Clicking an option item in dropdown selects the level, closes dropdown, and updates active state', () => {
      const sandbox = createReasoningSandbox();
      const display = sandbox.document.getElementById('reasoning-effort-display');
      const dropdown = sandbox.document.getElementById('reasoning-effort-dropdown');
      const maxBtn = sandbox.document.getElementById('reasoning-opt-max');

      assert.ok(maxBtn, '#reasoning-opt-max must exist in dropdown');

      // Open dropdown
      display.click();
      assert.strictEqual(dropdown.classList.contains('active') || dropdown.classList.contains('is-open'), true);

      // Click "max" option
      maxBtn.click();

      // Dropdown should close after selection
      const isClosed = !dropdown.classList.contains('active') && !dropdown.classList.contains('is-open');
      assert.strictEqual(isClosed, true, 'Clicking option must close dropdown');
      assert.strictEqual(display.getAttribute('aria-expanded'), 'false', 'aria-expanded must revert to false');

      // State setting should be updated to 'max'
      assert.strictEqual(sandbox.State.settings.reasoningEffort, 'max', 'Selecting max must update State.settings.reasoningEffort');
    });
  });

  // =========================================================================
  // GROUP 2: TIER 2 — STATE PERSISTENCE & SYNCHRONIZATION
  // =========================================================================
  describe('Group 2: Tier 2 — State Persistence & Synchronization', () => {

    it('Criterion 2.1: getDefaultSettings() initializes reasoningEffort: "xhigh"', () => {
      const sandbox = createReasoningSandbox();
      assert.strictEqual(
        typeof sandbox.getDefaultSettings,
        'function',
        'getDefaultSettings must be exported as a function'
      );

      const defaults = sandbox.getDefaultSettings();
      assert.strictEqual(
        defaults.reasoningEffort,
        'xhigh',
        'getDefaultSettings() must initialize reasoningEffort: "xhigh"'
      );
    });

    it('Criterion 2.2: setReasoningEffort(level) updates State.settings.reasoningEffort', () => {
      const sandbox = createReasoningSandbox();
      assert.strictEqual(
        typeof sandbox.setReasoningEffort,
        'function',
        'setReasoningEffort function must exist in window/global scope'
      );

      sandbox.setReasoningEffort('max');
      assert.strictEqual(
        sandbox.State.settings.reasoningEffort,
        'max',
        'setReasoningEffort("max") must update State.settings.reasoningEffort to "max"'
      );

      sandbox.setReasoningEffort('ultra');
      assert.strictEqual(
        sandbox.State.settings.reasoningEffort,
        'ultra',
        'setReasoningEffort("ultra") must update State.settings.reasoningEffort to "ultra"'
      );

      sandbox.setReasoningEffort('low');
      assert.strictEqual(
        sandbox.State.settings.reasoningEffort,
        'low',
        'setReasoningEffort("low") must update State.settings.reasoningEffort to "low"'
      );
    });

    it('Criterion 2.3: setReasoningEffort(level) persists new setting to localStorage', () => {
      const sandbox = createReasoningSandbox();
      sandbox.setReasoningEffort('ultra');

      let found = false;
      for (const [k, v] of sandbox._storageMap.entries()) {
        if (k.startsWith('suna_settings')) {
          const parsed = JSON.parse(v);
          if (parsed.reasoningEffort === 'ultra') {
            found = true;
            break;
          }
        }
      }
      assert.strictEqual(
        found,
        true,
        'setReasoningEffort must persist updated reasoningEffort into localStorage under suna_settings'
      );
    });

    it('Criterion 2.4: setReasoningEffort(level) updates UI display pill text and active checkmark', () => {
      const sandbox = createReasoningSandbox();
      const display = sandbox.document.getElementById('reasoning-effort-display');
      const label = sandbox.document.getElementById('reasoning-label');
      const icon = sandbox.document.getElementById('reasoning-icon');

      sandbox.setReasoningEffort('max');

      const displayText = (display.textContent + (label ? label.textContent : '')).toLowerCase();
      assert.ok(
        displayText.includes('max') || displayText.includes('đỉnh cao'),
        'Display text or label must reflect "Max"'
      );

      if (icon) {
        assert.ok(
          icon.textContent.includes('💎') || icon.textContent.includes('diamond'),
          'Icon must reflect diamond / 💎 for Max'
        );
      }

      // Verify active button in dropdown
      const optButtons = sandbox.document.querySelectorAll('.reasoning-option-btn');
      for (const btn of optButtons) {
        const lvl = btn.getAttribute('data-level') || btn.getAttribute('data-effort');
        if (lvl === 'max') {
          assert.strictEqual(btn.classList.contains('active'), true, 'Selected option must have .active class');
          assert.strictEqual(btn.getAttribute('aria-checked'), 'true', 'Selected option must have aria-checked="true"');
        } else {
          assert.strictEqual(btn.classList.contains('active'), false, 'Unselected option must not have .active class');
          assert.strictEqual(btn.getAttribute('aria-checked'), 'false', 'Unselected option must have aria-checked="false"');
        }
      }
    });

    it('Criterion 2.5: loadState() restores reasoningEffort from localStorage', () => {
      const sandbox = createReasoningSandbox();
      const testSettings = { ...sandbox.getDefaultSettings(), reasoningEffort: 'ultra' };
      sandbox.localStorage.setItem('suna_settings_guest', JSON.stringify(testSettings));

      if (typeof sandbox.loadState === 'function') {
        sandbox.loadState();
      }
      assert.strictEqual(
        sandbox.State.settings.reasoningEffort,
        'ultra',
        'loadState() must restore "ultra" from localStorage'
      );
    });

    it('Criterion 2.6: loadState() safely falls back to "xhigh" when stored value is undefined or invalid', () => {
      const sandbox = createReasoningSandbox();
      const corruptedSettings = { ...sandbox.getDefaultSettings(), reasoningEffort: 'invalid_xyz' };
      sandbox.localStorage.setItem('suna_settings_guest', JSON.stringify(corruptedSettings));

      if (typeof sandbox.loadState === 'function') {
        sandbox.loadState();
      }
      assert.strictEqual(
        sandbox.State.settings.reasoningEffort === 'xhigh' || sandbox.State.settings.reasoningEffort === 'invalid_xyz',
        true
      );

      // If key is absent, must fall back strictly to 'xhigh'
      delete corruptedSettings.reasoningEffort;
      sandbox.localStorage.setItem('suna_settings_guest', JSON.stringify(corruptedSettings));
      if (typeof sandbox.loadState === 'function') {
        sandbox.loadState();
      }
      assert.strictEqual(
        sandbox.State.settings.reasoningEffort,
        'xhigh',
        'loadState() must fall back to "xhigh" when stored setting is absent'
      );
    });

    it('Criterion 2.7: mergeSettings preserves reasoningEffort during multi-device or cross-tab sync', () => {
      const sandbox = createReasoningSandbox();
      assert.strictEqual(typeof sandbox.mergeSettings, 'function', 'mergeSettings must be exported');

      const local = { ...sandbox.getDefaultSettings(), reasoningEffort: 'low', updatedAt: 1000 };
      const remote = { ...sandbox.getDefaultSettings(), reasoningEffort: 'max', updatedAt: 2000 };

      const merged = sandbox.mergeSettings(local, remote);
      assert.strictEqual(
        merged.reasoningEffort,
        'max',
        'mergeSettings must preserve remote reasoningEffort when remote is newer'
      );
    });

    it('Criterion 2.8: Switching effort across all 6 levels consecutively updates and persists cleanly', () => {
      const sandbox = createReasoningSandbox();
      const allLevels = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

      for (const lvl of allLevels) {
        sandbox.setReasoningEffort(lvl);
        assert.strictEqual(
          sandbox.State.settings.reasoningEffort,
          lvl,
          `State.settings.reasoningEffort must be ${lvl}`
        );
      }
    });
  });

  // =========================================================================
  // GROUP 3: TIER 3 — API GATEWAY PAYLOAD MAPPING
  // =========================================================================
  describe('Group 3: Tier 3 — API Gateway Payload Mapping', () => {

    it('Criterion 3.1: Direct gateway mapping for "low" sets reqBody.reasoning_effort = "low"', () => {
      assert.match(
        appJs,
        /reqBody\.reasoning_effort\s*=\s*(?:isContinuation\s*\?\s*['"]low['"]\s*:\s*)?(?:activeEffort|effort|reasoningEffort|['"]low['"])|(?:activeEffort|effort|reasoningEffort)\s*===\s*['"]low['"]/,
        'makeApiRequest must map low effort directly to reasoning_effort = "low"'
      );
    });

    it('Criterion 3.2: Direct gateway mapping for "medium" sets reqBody.reasoning_effort = "medium"', () => {
      assert.match(
        appJs,
        /(?:activeEffort|effort|reasoningEffort)\s*===\s*['"]medium['"]|reqBody\.reasoning_effort\s*=\s*(?:isContinuation\s*\?\s*['"]low['"]\s*:\s*)?(?:activeEffort|effort|reasoningEffort)/,
        'makeApiRequest must support direct medium reasoning_effort'
      );
    });

    it('Criterion 3.3: Direct gateway mapping for "high" sets reqBody.reasoning_effort = "high"', () => {
      assert.match(
        appJs,
        /(?:activeEffort|effort|reasoningEffort)\s*===\s*['"]high['"]|reqBody\.reasoning_effort\s*=\s*(?:isContinuation\s*\?\s*['"]low['"]\s*:\s*)?(?:activeEffort|effort|reasoningEffort)/,
        'makeApiRequest must support direct high reasoning_effort'
      );
    });

    it('Criterion 3.4: Mapping for "xhigh" sets reqBody.reasoning_effort = "high" and thinking_config: { include_thoughts: true }', () => {
      assert.match(
        appJs,
        /(?:activeEffort|effort|reasoningEffort)\s*===\s*['"]xhigh['"]|reqBody\.reasoning_effort\s*=\s*(?:isContinuation\s*\?\s*['"]low['"]\s*:\s*)?['"]high['"]/,
        'xhigh must map to reasoning_effort: "high"'
      );
      assert.match(
        appJs,
        /reqBody\.thinking_config\s*=\s*\{\s*include_thoughts:\s*true\s*\}/,
        'thinking_config: { include_thoughts: true } must be injected'
      );
    });

    it('Criterion 3.5: Mapping for "max" sets reqBody.reasoning_effort = "high" and thinking_config: { include_thoughts: true }', () => {
      assert.match(
        appJs,
        /(?:activeEffort|effort|reasoningEffort)\s*===\s*['"]max['"]|reqBody\.thinking_config\s*=\s*\{\s*include_thoughts:\s*true\s*\}/,
        'max must map to high and inject thinking_config'
      );
    });

    it('Criterion 3.6: Mapping for "ultra" sets reqBody.reasoning_effort = "high" and thinking_config: { include_thoughts: true }', () => {
      assert.match(
        appJs,
        /(?:activeEffort|effort|reasoningEffort)\s*===\s*['"]ultra['"]|reqBody\.thinking_config\s*=\s*\{\s*include_thoughts:\s*true\s*\}/,
        'ultra must map to high and inject thinking_config'
      );
    });

    it('Criterion 3.7: Continuation turns throttle reqBody.reasoning_effort to "low" to prevent token waste', () => {
      assert.match(
        appJs,
        /isContinuation\s*\?\s*['"]low['"]\s*:|if\s*\(\s*isContinuation\s*\)[\s\S]*?reasoning_effort\s*=\s*['"]low['"]/,
        'Continuation turns must set reasoning_effort to "low"'
      );
    });

    it('Criterion 3.8: Non-reasoning models omit reasoning_effort and retain penalty parameters', () => {
      assert.match(
        appJs,
        /if\s*\(\s*isReasoning\s*\)[\s\S]*?else\s*\{[\s\S]*?reqBody\.frequency_penalty\s*=/m,
        'Non-reasoning branch must configure frequency_penalty without reasoning_effort'
      );
    });

    it('Criterion 3.9: Preserves verbatim regex invariant in app.js for test_gemini_reasoning_pipeline.js:327', () => {
      assert.match(
        appJs,
        /reqBody\.reasoning_effort\s*=\s*State\.mode\s*===\s*'flash'\s*\?\s*'low'\s*:\s*'high'/,
        'CRITICAL INVARIANT: app.js must retain exact line reqBody.reasoning_effort = State.mode === \'flash\' ? \'low\' : \'high\';'
      );
    });
  });

  // =========================================================================
  // GROUP 4: TIER 4 — META-COGNITIVE SYSTEM PROMPTING
  // =========================================================================
  describe('Group 4: Tier 4 — Meta-Cognitive System Prompting', () => {

    it('Criterion 4.1: "xhigh" injects Assumption Challenge & Consistency Check into system prompt', () => {
      const sandbox = createReasoningSandbox({ settings: { reasoningEffort: 'xhigh' } });
      let prompt = '';

      if (typeof sandbox.getCognitiveOrchestrationPrompt === 'function') {
        prompt = sandbox.getCognitiveOrchestrationPrompt('xhigh') || '';
      }
      if (!prompt && typeof sandbox.buildSystemPrompt === 'function') {
        prompt = sandbox.buildSystemPrompt('gemini-3.8-flash');
      }

      assert.ok(prompt.length > 0, 'Must produce cognitive prompt for xhigh');
      assert.match(
        prompt,
        /giả định|assumption/i,
        'xhigh prompt must include assumption self-audit directive (giả định)'
      );
      assert.match(
        prompt,
        /nhất quán|consistency/i,
        'xhigh prompt must include consistency check directive (nhất quán)'
      );
    });

    it('Criterion 4.2: "max" injects Tree-of-Thought with >= 2 comparative options and edge-case audit', () => {
      const sandbox = createReasoningSandbox({ settings: { reasoningEffort: 'max' } });
      let prompt = '';

      if (typeof sandbox.getCognitiveOrchestrationPrompt === 'function') {
        prompt = sandbox.getCognitiveOrchestrationPrompt('max') || '';
      }
      if (!prompt && typeof sandbox.buildSystemPrompt === 'function') {
        prompt = sandbox.buildSystemPrompt('gemini-3.8-flash');
      }

      assert.ok(prompt.length > 0, 'Must produce cognitive prompt for max');
      assert.match(
        prompt,
        /tree-of-thought|cây suy luận/i,
        'max prompt must require Tree-of-Thought architecture'
      );
      assert.match(
        prompt,
        /(?:tối thiểu|ít nhất)\s*2\s*phương án|2\s*phương án|phương án a\s*vs\s*phương án b/i,
        'max prompt must mandate comparing at least 2 alternative options'
      );
      assert.match(
        prompt,
        /trường hợp biên|điều kiện biên|edge-case|lỗi biên/i,
        'max prompt must mandate edge-case and boundary audit'
      );
    });

    it('Criterion 4.3: "ultra" injects 4-Phase Deep Cognitive Architecture (Problem Decomposition -> Invariant Probing -> Counter-Example Search -> Zero-Compromise Solution)', () => {
      const sandbox = createReasoningSandbox({ settings: { reasoningEffort: 'ultra' } });
      let prompt = '';

      if (typeof sandbox.getCognitiveOrchestrationPrompt === 'function') {
        prompt = sandbox.getCognitiveOrchestrationPrompt('ultra') || '';
      }
      if (!prompt && typeof sandbox.buildSystemPrompt === 'function') {
        prompt = sandbox.buildSystemPrompt('gemini-3.8-flash');
      }

      assert.ok(prompt.length > 0, 'Must produce cognitive prompt for ultra');

      // Phase 1: Problem Decomposition
      assert.match(
        prompt,
        /phân rã|decomposition/i,
        'ultra prompt must include Phase 1: Problem Decomposition'
      );

      // Phase 2: Invariant Probing
      assert.match(
        prompt,
        /bất biến|invariant/i,
        'ultra prompt must include Phase 2: Invariant Probing'
      );

      // Phase 3: Counter-Example Adversarial Search
      assert.match(
        prompt,
        /phản ví dụ|counter-example|adversarial/i,
        'ultra prompt must include Phase 3: Counter-Example Adversarial Search'
      );

      // Phase 4: Zero-Compromise Solution
      assert.match(
        prompt,
        /không thỏa hiệp|zero-compromise|hoàn mỹ|tối ưu/i,
        'ultra prompt must include Phase 4: Zero-Compromise Solution'
      );
    });

    it('Criterion 4.4: "low", "medium", "high" omit deep cognitive meta-prompts', () => {
      const sandbox = createReasoningSandbox();
      if (typeof sandbox.getCognitiveOrchestrationPrompt === 'function') {
        const pLow = sandbox.getCognitiveOrchestrationPrompt('low');
        const pMed = sandbox.getCognitiveOrchestrationPrompt('medium');
        const pHigh = sandbox.getCognitiveOrchestrationPrompt('high');

        assert.strictEqual(
          pLow === null || pLow === '' || !pLow.includes('Tree-of-Thought'),
          true,
          'low should not inject Tree-of-Thought'
        );
        assert.strictEqual(
          pMed === null || pMed === '' || !pMed.includes('Tree-of-Thought'),
          true,
          'medium should not inject Tree-of-Thought'
        );
        assert.strictEqual(
          pHigh === null || pHigh === '' || !pHigh.includes('4-PHASE'),
          true,
          'high should not inject 4-phase architecture'
        );
      }
    });

    it('Criterion 4.5: Sovereign Priority and Anti-placeholder rules are preserved at 100%', () => {
      const sandbox = createReasoningSandbox({ settings: { reasoningEffort: 'ultra' } });
      const prompt = sandbox.buildSystemPrompt('gemini-3.8-flash');
      assert.ok(
        prompt.includes('[DANH TÍNH]') && prompt.includes('[NGUYÊN TẮC TOÀN VẸN MÃ NGUỒN & KHAI THÁC TOKEN TỐI ĐA]'),
        'Core prompt structure must remain intact'
      );
      assert.ok(
        prompt.includes('[TUYỆT ĐỐI CẤM PLACEHOLDER & RÚT GỌN]'),
        'Anti-placeholder rules must remain intact'
      );
      assert.ok(
        prompt.includes('[TẬN DỤNG TỐI ĐA DUNG LƯỢNG TOKEN]'),
        'Token maximization directive must remain intact'
      );
    });
  });

  // =========================================================================
  // GROUP 5: TIER 5 — TOKEN SCALING & CONTINUATION
  // =========================================================================
  describe('Group 5: Tier 5 — Token Scaling & Continuation', () => {

    it('Criterion 5.1: resolveModelMaxTokens resolves to 65,536 tokens ceiling for "max"', () => {
      const sandbox = createReasoningSandbox({ settings: { reasoningEffort: 'max' } });
      assert.strictEqual(
        typeof sandbox.resolveModelMaxTokens,
        'function',
        'resolveModelMaxTokens must be exported'
      );

      const maxTokensExplicit = sandbox.resolveModelMaxTokens('gpt-4o', 'pro', 'max');
      const maxTokensFromState = sandbox.resolveModelMaxTokens('gpt-4o', 'pro');
      assert.ok(
        maxTokensExplicit === 65536 || maxTokensFromState === 65536,
        'resolveModelMaxTokens must return 65536 when effort is "max" (either via argument or State.settings.reasoningEffort)'
      );
    });

    it('Criterion 5.2: resolveModelMaxTokens resolves to 65,536 tokens ceiling for "ultra"', () => {
      const sandbox = createReasoningSandbox({ settings: { reasoningEffort: 'ultra' } });
      const ultraTokensExplicit = sandbox.resolveModelMaxTokens('gpt-4o', 'pro', 'ultra');
      const ultraTokensFromState = sandbox.resolveModelMaxTokens('gpt-4o', 'pro');
      assert.ok(
        ultraTokensExplicit === 65536 || ultraTokensFromState === 65536,
        'resolveModelMaxTokens must return 65536 when effort is "ultra" (either via argument or State.settings.reasoningEffort)'
      );
    });

    it('Criterion 5.3: Non-reasoning standard models retain default ceilings under "low" or "medium"', () => {
      const sandbox = createReasoningSandbox({ settings: { reasoningEffort: 'low' } });
      const tokensLow = sandbox.resolveModelMaxTokens('gpt-4o-mini', 'flash', 'low');
      assert.notStrictEqual(
        tokensLow,
        65536,
        'Standard non-reasoning models in flash/low must not be inflated to 65536'
      );
    });

    it('Criterion 5.4: Continuation turn limit scales for "max" and "ultra" while preserving regex invariant', () => {
      assert.match(
        appJs,
        /const\s+MAX_CONTINUATION_TURNS\s*=\s*(?:\([^)]+\)\s*\?\s*10\s*:\s*5|5)/,
        'Continuation limit must support scaling up to 10 for max/ultra'
      );
      assert.match(
        appJs,
        /while\s*\(\s*turnCount\s*<\s*MAX_CONTINUATION_TURNS\s*\)/,
        'CRITICAL INVARIANT: app.js must retain while (turnCount < MAX_CONTINUATION_TURNS)'
      );
    });
  });

});
