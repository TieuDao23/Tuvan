/**
 * tests/test_suna_skills.js
 * 
 * Test Suite: Antigravity Skills & Skills Management Center for SunaChat
 * Covers:
 * 1. HTML DOM Structure & Accessibility (aria-label, title, data-close)
 * 2. CSS Syntax Integrity, Z-Index Hierarchy, and Light Mode Adaptation
 * 3. 10 Core Antigravity Built-in Skills (pruned science skills, full prompts)
 * 4. SkillsManager CRUD & State Persistence (localStorage suffix isolation)
 * 5. Slash Command Parser & Dynamic Search Filtering
 * 6. Real Activation: Dynamic Prompt Injection into System Prompt
 */

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

describe('Antigravity Skills & Skills Management Center Suite', function() {
  let htmlContent;
  let cssContent;
  let appCode;

  before(() => {
    htmlContent = fs.readFileSync('index.html', 'utf8');
    cssContent = fs.readFileSync('styles.css', 'utf8');
    appCode = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // 1. HTML DOM Structure & Accessibility
  // =========================================================================
  describe('1. HTML DOM Structure & Accessibility', () => {
    it('should have #btn-skills in sidebar footer with aria-label and title', () => {
      assert.match(htmlContent, /id="btn-skills"[^>]*title="[^"]+"/, 'btn-skills must have title');
      assert.match(htmlContent, /id="btn-skills"[^>]*aria-label="[^"]+"/, 'btn-skills must have aria-label');
    });

    it('should have streamlined input tools bar without redundant btn-skills-chip', () => {
      assert.doesNotMatch(htmlContent, /id="btn-skills-chip"/, 'btn-skills-chip must be removed to prevent toolbar clutter');
    });

    it('should have #active-skills-bar container and #btn-add-more-skills', () => {
      assert.match(htmlContent, /id="active-skills-bar"/, 'active-skills-bar must exist');
      assert.match(htmlContent, /id="active-skills-chips"/, 'active-skills-chips container must exist');
      assert.match(htmlContent, /id="btn-add-more-skills"[^>]*aria-label="[^"]+"/, 'btn-add-more-skills must have aria-label');
    });

    it('should have #skills-autocomplete popup with header and list container', () => {
      assert.match(htmlContent, /id="skills-autocomplete"/, 'skills-autocomplete popup must exist');
      assert.match(htmlContent, /id="skills-autocomplete-list"/, 'skills-autocomplete-list must exist');
      assert.match(htmlContent, /class="skills-autocomplete-hint"/, 'skills-autocomplete-hint must exist');
    });

    it('should have #skills-modal with toolbar, search, tabs, grid and close buttons', () => {
      assert.match(htmlContent, /id="skills-modal"[^>]*class="[^"]*modal-overlay[^"]*"/, 'skills-modal overlay must exist');
      assert.match(htmlContent, /id="skills-search-input"[^>]*aria-label="[^"]+"/, 'skills-search-input must have aria-label');
      assert.match(htmlContent, /id="skills-category-tabs"/, 'skills-category-tabs must exist');
      assert.match(htmlContent, /id="skills-grid"/, 'skills-grid must exist');
      assert.match(htmlContent, /data-close="skills-modal"/, 'close button for skills-modal must exist');
    });

    it('should have #skill-editor-modal with all required form fields', () => {
      assert.match(htmlContent, /id="skill-editor-modal"/, 'skill-editor-modal must exist');
      assert.match(htmlContent, /id="skill-input-name"/, 'skill-input-name must exist');
      assert.match(htmlContent, /id="skill-input-command"/, 'skill-input-command must exist');
      assert.match(htmlContent, /id="skill-input-prompt"/, 'skill-input-prompt must exist');
      assert.match(htmlContent, /id="btn-save-skill"/, 'btn-save-skill must exist');
    });
  });

  // =========================================================================
  // 2. CSS Syntax & Hygiene
  // =========================================================================
  describe('2. CSS Syntax Integrity & Hygiene', () => {
    it('should have perfectly balanced curly braces in styles.css', () => {
      let openBraces = 0;
      let closeBraces = 0;
      for (let ch of cssContent) {
        if (ch === '{') openBraces++;
        if (ch === '}') closeBraces++;
      }
      assert.strictEqual(openBraces, closeBraces, `Curly braces mismatch: { = ${openBraces}, } = ${closeBraces}`);
    });

    it('should configure appropriate z-index: autocomplete 1500, modal 2000, editor 2100', () => {
      assert.match(cssContent, /\.skills-autocomplete\s*\{[^}]*z-index:\s*1500/s, 'skills-autocomplete must have z-index: 1500');
      assert.match(htmlContent, /id="skill-editor-modal"[^>]*z-index:\s*2100/, 'skill-editor-modal must have z-index: 2100');
    });

    it('should support Light Mode styling for skills components', () => {
      assert.match(cssContent, /body\.light-mode\s+\.skills-autocomplete/, 'Light mode styles for autocomplete must exist');
      assert.match(cssContent, /body\.light-mode\s+\.active-skills-bar/, 'Light mode styles for active skills bar must exist');
      assert.match(cssContent, /body\.light-mode\s+\.skill-card/, 'Light mode styles for skill-card must exist');
    });
  });

  // =========================================================================
  // 3. Execution Environment & SkillsManager Core
  // =========================================================================
  describe('3. Antigravity SkillsManager Core & Execution', () => {
    let sandbox;

    beforeEach(() => {
      const storageMap = new Map();
      const mockStorage = {
        getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
        setItem: (k, v) => storageMap.set(k, String(v)),
        removeItem: k => storageMap.delete(k),
        clear: () => storageMap.clear()
      };

      class MockAudio {
        constructor() {
          this.src = '';
          this.volume = 1;
          this.paused = true;
        }
        play() { this.paused = false; return Promise.resolve(); }
        pause() { this.paused = true; }
        addEventListener() {}
        removeEventListener() {}
      }

      const winListeners = new Map();
      sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Audio: MockAudio,
        localStorage: mockStorage,
        sessionStorage: mockStorage,
        addEventListener: (t, fn) => {
          if (!winListeners.has(t)) winListeners.set(t, []);
          winListeners.get(t).push(fn);
        },
        removeEventListener: (t, fn) => {
          if (!winListeners.has(t)) return;
          winListeners.set(t, winListeners.get(t).filter(h => h !== fn));
        },
        dispatchEvent: (ev) => {
          const list = winListeners.get(ev.type || ev) || [];
          list.forEach(fn => fn(ev));
        },
        toast: () => {},
        document: {
          getElementById: () => null,
          querySelector: () => null,
          querySelectorAll: () => [],
          addEventListener: () => {},
          removeEventListener: () => {},
          createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {} })
        },
        window: {},
        navigator: { onLine: true, userAgent: 'NodeTest' },
        getStorageSuffix: () => '_test_user'
      };
      sandbox.window = sandbox;

      vm.createContext(sandbox);
      // Run app.js inside the isolated sandbox
      vm.runInContext(appCode, sandbox);
    });

    it('should expose window.SkillsManager globally', () => {
      assert.ok(sandbox.SkillsManager, 'SkillsManager must exist');
      assert.strictEqual(typeof sandbox.SkillsManager.getSkills, 'function');
      assert.strictEqual(typeof sandbox.SkillsManager.getActiveSkillsPrompt, 'function');
      assert.strictEqual(typeof sandbox.SkillsManager.parseSlashCommand, 'function');
    });

    it('should contain exactly 10 built-in Antigravity core skills', () => {
      const builtIns = sandbox.SkillsManager.builtInSkills;
      assert.strictEqual(builtIns.length, 10, 'Must have exactly 10 built-in skills');

      const expectedSkills = [
        'design-taste-frontend',
        'agent-self-correction',
        'ponytail',
        'minimalist-ui',
        'generative_ui',
        'image-to-code',
        'brandkit',
        'high-end-visual-design',
        'spec-kit-sdd',
        'disk-cleanup'
      ];

      for (const id of expectedSkills) {
        const found = builtIns.find(s => s.id === id);
        assert.ok(found, `Skill ${id} must exist in builtInSkills`);
        assert.strictEqual(found.isBuiltIn, true);
        assert.ok(found.name && found.name.length > 0, `${id} must have a valid name`);
        assert.ok(found.command && found.command.length > 0, `${id} must have a valid command`);
        assert.ok(found.prompt && found.prompt.length > 50, `${id} must have a substantial system prompt`);
      }
    });

    it('should have pruned all useless biology/chemistry skills', () => {
      const builtIns = sandbox.SkillsManager.builtInSkills;
      const pruned = ['alphafold', 'chembl', 'dbsnp', 'pdb', 'pymol', 'jaspar', 'uniprot', 'reactome'];
      for (const badId of pruned) {
        const found = builtIns.find(s => s.id.includes(badId) || s.command === badId);
        assert.strictEqual(found, undefined, `Useless science skill ${badId} must NOT exist`);
      }
    });

    it('should find skills by primary command and aliases (getSkillByCommand)', () => {
      // Primary commands
      const taste = sandbox.SkillsManager.getSkillByCommand('taste');
      assert.ok(taste);
      assert.strictEqual(taste.id, 'design-taste-frontend');

      const pony = sandbox.SkillsManager.getSkillByCommand('/ponytail');
      assert.ok(pony);
      assert.strictEqual(pony.id, 'ponytail');

      // Aliases
      const antiSlop = sandbox.SkillsManager.getSkillByCommand('/anti-slop');
      assert.ok(antiSlop);
      assert.strictEqual(antiSlop.id, 'design-taste-frontend');

      const lazyDev = sandbox.SkillsManager.getSkillByCommand('lazy-dev');
      assert.ok(lazyDev);
      assert.strictEqual(lazyDev.id, 'ponytail');

      // Case-insensitivity
      const upper = sandbox.SkillsManager.getSkillByCommand('/TASTE');
      assert.ok(upper);
      assert.strictEqual(upper.id, 'design-taste-frontend');
    });

    it('should toggle and manage active skills correctly', () => {
      assert.strictEqual(sandbox.SkillsManager.isSkillActive('ponytail'), false);
      
      // Activate
      const active1 = sandbox.SkillsManager.toggleSkill('ponytail');
      assert.strictEqual(active1, true);
      assert.strictEqual(sandbox.SkillsManager.isSkillActive('ponytail'), true);

      // Deactivate
      const active2 = sandbox.SkillsManager.toggleSkill('ponytail');
      assert.strictEqual(active2, false);
      assert.strictEqual(sandbox.SkillsManager.isSkillActive('ponytail'), false);

      // Multiple activations and deactivateAll
      sandbox.SkillsManager.activateSkill('ponytail');
      sandbox.SkillsManager.activateSkill('design-taste-frontend');
      assert.strictEqual(sandbox.SkillsManager.activeSkillIds.size, 2);

      sandbox.SkillsManager.deactivateAllSkills();
      assert.strictEqual(sandbox.SkillsManager.activeSkillIds.size, 0);
    });

    it('should correctly parse slash commands with and without prompts', () => {
      // Slash only
      const res1 = sandbox.SkillsManager.parseSlashCommand('/taste');
      assert.strictEqual(res1.isSlash, true);
      assert.strictEqual(res1.skill.id, 'design-taste-frontend');
      assert.strictEqual(res1.userPrompt, '');

      // Slash with prompt
      const res2 = sandbox.SkillsManager.parseSlashCommand('/taste Thiết kế trang hồ sơ cá nhân');
      assert.strictEqual(res2.isSlash, true);
      assert.strictEqual(res2.skill.id, 'design-taste-frontend');
      assert.strictEqual(res2.userPrompt, 'Thiết kế trang hồ sơ cá nhân');

      // Slash with alias
      const res3 = sandbox.SkillsManager.parseSlashCommand('/lazy-dev viết hàm Fibonacci O(1) space');
      assert.strictEqual(res3.isSlash, true);
      assert.strictEqual(res3.skill.id, 'ponytail');
      assert.strictEqual(res3.userPrompt, 'viết hàm Fibonacci O(1) space');

      // Normal text
      const res4 = sandbox.SkillsManager.parseSlashCommand('Xin chào Suna, hôm nay thế nào?');
      assert.strictEqual(res4.isSlash, false);
      assert.strictEqual(res4.skill, null);
      assert.strictEqual(res4.userPrompt, 'Xin chào Suna, hôm nay thế nào?');

      // Unknown command
      const res5 = sandbox.SkillsManager.parseSlashCommand('/unknown-xyz làm việc này');
      assert.strictEqual(res5.isSlash, false);
      assert.strictEqual(res5.skill, null);
    });

    it('should inject real prompt instructions when skills are activated', () => {
      // When inactive, prompt is empty
      sandbox.SkillsManager.deactivateAllSkills();
      assert.strictEqual(sandbox.SkillsManager.getActiveSkillsPrompt(), '');

      // Activate Frontend Taste
      sandbox.SkillsManager.activateSkill('design-taste-frontend');
      const promptTaste = sandbox.SkillsManager.getActiveSkillsPrompt();
      assert.ok(promptTaste.includes('ANTI-SLOP FRONTEND DESIGN TASTE'));
      assert.ok(promptTaste.includes('DESIGN_VARIANCE: 8/10'));
      assert.ok(promptTaste.includes('MOTION_INTENSITY: 6/10'));

      // Activate Ponytail as well
      sandbox.SkillsManager.activateSkill('ponytail');
      const promptCombined = sandbox.SkillsManager.getActiveSkillsPrompt();
      assert.ok(promptCombined.includes('ANTI-SLOP FRONTEND DESIGN TASTE'));
      assert.ok(promptCombined.includes('PONYTAIL - LAZY SENIOR DEVELOPER MODE'));
      assert.ok(promptCombined.includes('YAGNI'));
    });

    it('should inject active skills into buildSystemPrompt()', () => {
      sandbox.SkillsManager.deactivateAllSkills();
      const promptNormal = sandbox.buildSystemPrompt();
      assert.strictEqual(promptNormal.includes('ANTI-SLOP FRONTEND DESIGN TASTE'), false);

      sandbox.SkillsManager.activateSkill('design-taste-frontend');
      const promptActive = sandbox.buildSystemPrompt();
      assert.ok(promptActive.includes('ANTI-SLOP FRONTEND DESIGN TASTE'));
    });

    it('should inject oneShotSkill into buildSystemPrompt()', () => {
      sandbox.SkillsManager.deactivateAllSkills();
      sandbox.State.oneShotSkill = sandbox.SkillsManager.getSkillById('ponytail');
      
      const promptOneShot = sandbox.buildSystemPrompt();
      assert.ok(promptOneShot.includes('KỸ NĂNG ONE-SHOT'));
      assert.ok(promptOneShot.includes('PONYTAIL - LAZY SENIOR DEVELOPER MODE'));
    });

    it('should support Custom Skills CRUD and persistence', () => {
      // 1. Create custom skill
      const newSkill = sandbox.SkillsManager.addCustomSkill({
        name: 'Database Architect',
        command: 'db-arch',
        icon: '🗄️',
        category: 'coding',
        desc: 'Thiết kế cơ sở dữ liệu quan hệ chuẩn 3NF và indexing',
        prompt: 'Quy chuẩn: Chuẩn hóa 3NF, index B-Tree trên khóa ngoại'
      });

      assert.ok(newSkill.id.startsWith('custom_'));
      assert.strictEqual(newSkill.command, 'db-arch');

      // 2. Find it by command
      const found = sandbox.SkillsManager.getSkillByCommand('/db-arch');
      assert.ok(found);
      assert.strictEqual(found.name, 'Database Architect');

      // 3. Reject duplicate command
      assert.throws(() => {
        sandbox.SkillsManager.addCustomSkill({
          name: 'Another DB',
          command: 'db-arch',
          prompt: 'test'
        });
      }, /đã được sử dụng/);

      // 4. Update custom skill
      sandbox.SkillsManager.updateCustomSkill(newSkill.id, {
        name: 'PostgreSQL Specialist',
        command: 'postgres',
        prompt: 'Quy chuẩn: Tối ưu PostgreSQL với EXPLAIN ANALYZE'
      });

      const updated = sandbox.SkillsManager.getSkillById(newSkill.id);
      assert.strictEqual(updated.name, 'PostgreSQL Specialist');
      assert.strictEqual(updated.command, 'postgres');

      // 5. Activate custom skill and check prompt
      sandbox.SkillsManager.activateSkill(newSkill.id);
      const activePrompt = sandbox.SkillsManager.getActiveSkillsPrompt();
      assert.ok(activePrompt.includes('PostgreSQL Specialist'));
      assert.ok(activePrompt.includes('EXPLAIN ANALYZE'));

      // 6. Delete custom skill
      const deleted = sandbox.SkillsManager.deleteCustomSkill(newSkill.id);
      assert.strictEqual(deleted, true);
      assert.strictEqual(sandbox.SkillsManager.getSkillById(newSkill.id), null);
      assert.strictEqual(sandbox.SkillsManager.getActiveSkillsPrompt().includes('PostgreSQL Specialist'), false);
    });

    it('should filter skills by query and category correctly', () => {
      // Search query
      const searchTaste = sandbox.SkillsManager.filterSkills('taste');
      assert.ok(searchTaste.some(s => s.id === 'design-taste-frontend'));

      const searchPony = sandbox.SkillsManager.filterSkills('ponytail');
      assert.ok(searchPony.some(s => s.id === 'ponytail'));

      // Category filter
      const designSkills = sandbox.SkillsManager.filterSkills('', 'design');
      assert.ok(designSkills.length >= 4);
      assert.ok(designSkills.every(s => s.category === 'design'));

      const codingSkills = sandbox.SkillsManager.filterSkills('', 'coding');
      assert.ok(codingSkills.length >= 3);
      assert.ok(codingSkills.every(s => s.category === 'coding'));

      const workflowSkills = sandbox.SkillsManager.filterSkills('', 'workflow');
      assert.ok(workflowSkills.length >= 3);
      assert.ok(workflowSkills.every(s => s.category === 'workflow'));
    });
  });
});
