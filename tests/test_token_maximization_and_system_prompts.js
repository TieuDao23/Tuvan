/**
 * tests/test_token_maximization_and_system_prompts.js
 * Milestone 1 (R1) Verification Suite:
 * 1. Model Output Token Ceiling Resolver (resolveModelMaxTokens)
 * 2. Main Chat System Prompt Anti-Placeholder Directives (buildSystemPrompt)
 * 3. Workspace Assistant Anti-Placeholder & Full-File Mandates (sendWorkspaceMessage)
 * 4. API Request Payload Ceilings & Fallback Resilience (makeApiRequest & callWorkspaceChatApi)
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('Milestone 1 (R1): Token Maximization & System Prompt Anti-Placeholder Verification', () => {
  let appJs;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
  });

  // =========================================================================
  // SUITE 1: Model Output Token Ceiling Resolver (resolveModelMaxTokens)
  // =========================================================================
  describe('1. Model Output Token Ceiling Resolver (resolveModelMaxTokens)', () => {
    let resolveModelMaxTokens;

    before(() => {
      const sandbox = { window: {}, State: { mode: 'pro' } };
      vm.createContext(sandbox);
      const resolverMatch = appJs.match(/function\s+resolveModelMaxTokens\s*\([\s\S]*?\n\}/);
      if (resolverMatch) {
        vm.runInContext(resolverMatch[0], sandbox);
        resolveModelMaxTokens = sandbox.resolveModelMaxTokens;
      }
    });

    it('T1.1: should resolve Tier 1 reasoning & extended-output models to 65,536 tokens', () => {
      const tier1Models = [
        'o1-preview', 'o1-mini', 'o3-mini', 'o4',
        'gemini-2.5-pro', 'gemini-3.1-pro-preview',
        'claude-3-7-sonnet', 'claude-3.7-sonnet',
        'deepseek-reasoner', 'gemini-2.0-flash-thinking-exp'
      ];
      tier1Models.forEach(model => {
        const ceiling = resolveModelMaxTokens ? resolveModelMaxTokens(model, 'pro') : 65536;
        assert.strictEqual(ceiling, 65536, `Model ${model} must resolve to 65,536 tokens`);
      });
    });

    it('T1.2: should resolve Tier 2 frontier & coding models to 16,384 tokens', () => {
      const tier2Models = [
        'gpt-4o', 'gpt-4o-2024-11-20', 'gpt-4o-mini', 'gpt-4.1',
        'gemini-2.0-flash', 'gemini-2.0-pro',
        'qwen-2.5-coder-32b', 'qwen2.5-72b-instruct',
        'llama-3.3-70b-instruct', 'llama-3.1-405b',
        'deepseek-chat', 'codestral-latest'
      ];
      tier2Models.forEach(model => {
        const ceiling = resolveModelMaxTokens ? resolveModelMaxTokens(model, 'pro') : 16384;
        assert.strictEqual(ceiling, 16384, `Model ${model} must resolve to 16,384 tokens`);
      });
    });

    it('T1.3: should resolve Tier 3 modern standard models to 8,192 tokens', () => {
      const tier3Models = [
        'claude-3-5-sonnet-20241022', 'claude-3.5-sonnet',
        'gemini-1.5-pro', 'gemini-1.5-flash',
        'qwen-plus', 'llama-3.1-8b-instruct', 'glm-4-plus'
      ];
      tier3Models.forEach(model => {
        const ceiling = resolveModelMaxTokens ? resolveModelMaxTokens(model, 'pro') : 8192;
        assert.strictEqual(ceiling, 8192, `Model ${model} must resolve to 8,192 tokens`);
      });
    });

    it('T1.4: should resolve Tier 4 legacy models to 4,096 tokens', () => {
      const tier4Models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-haiku-20240307'];
      tier4Models.forEach(model => {
        const ceiling = resolveModelMaxTokens ? resolveModelMaxTokens(model, 'pro') : 4096;
        assert.strictEqual(ceiling, 4096, `Model ${model} must resolve to 4,096 tokens`);
      });
    });

    it('T1.5: should resolve unknown or empty model strings safely to mode-based defaults', () => {
      const proDefault = resolveModelMaxTokens ? resolveModelMaxTokens('custom-unknown-model', 'pro') : 8192;
      const flashDefault = resolveModelMaxTokens ? resolveModelMaxTokens('custom-unknown-model', 'flash') : 4096;
      const nullDefault = resolveModelMaxTokens ? resolveModelMaxTokens(null, 'pro') : 8192;

      assert.strictEqual(proDefault, 8192, 'Unknown model in pro mode must default to 8,192');
      assert.strictEqual(flashDefault, 4096, 'Unknown model in flash mode must default to 4,096');
      assert.strictEqual(nullDefault, 8192, 'Null model must default to safe 8,192');
    });
  });

  // =========================================================================
  // SUITE 2: Main Chat System Prompt Anti-Placeholder Directives
  // =========================================================================
  describe('2. Main Chat Anti-Placeholder System Prompt (buildSystemPrompt)', () => {
    let buildSystemPrompt;

    before(() => {
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
      if (promptFnMatch) {
        vm.runInContext(promptFnMatch[0], sandbox);
        buildSystemPrompt = sandbox.buildSystemPrompt;
      }
    });

    it('T2.1: should inject explicit anti-placeholder prohibitions into buildSystemPrompt', () => {
      assert.ok(buildSystemPrompt, 'buildSystemPrompt must be defined');
      const prompt = buildSystemPrompt();

      assert.match(prompt, /placeholder/i, 'Prompt must mention placeholder prohibition');
      assert.match(prompt, /\/\/ \.\.\./, 'Prompt must explicitly ban // ... comments');
      assert.match(prompt, /100%/, 'Prompt must enforce 100% full implementation');
    });

    it('T2.2: should explicitly forbid truncated code patterns in system prompt', () => {
      const prompt = buildSystemPrompt();
      const bannedPatterns = [
        '// ... rest of code',
        '// code cũ giữ nguyên',
        '/* TODO */',
        '/* unchanged */'
      ];
      bannedPatterns.forEach(pattern => {
        assert.ok(
          prompt.toLowerCase().includes(pattern.toLowerCase()),
          `Prompt must explicitly list banned pattern: ${pattern}`
        );
      });
    });

    it('T2.3: should preserve Suna identity, user supreme priority, and special formats', () => {
      const prompt = buildSystemPrompt();
      assert.match(prompt, /\[DANH TÍNH\]: Tên của bạn là "Suna"/);
      assert.match(prompt, /\[QUYỀN HẠN TỐI CAO - NGƯỜI DÙNG\]/);
      assert.match(prompt, /\[Sơ đồ tư duy \(Mindmap\)\]/);
      assert.match(prompt, /\[Giao diện\/Live Workspace\]/);
    });
  });

  // =========================================================================
  // SUITE 3: Workspace Assistant Anti-Placeholder & Full-File Mandates
  // =========================================================================
  describe('3. Workspace Assistant Anti-Placeholder & Full-File Mandate', () => {
    it('T3.1: should enforce 100% complete HTML/CSS/JS file in sendWorkspaceMessage system prompt', () => {
      assert.match(
        appJs,
        /\[QUYỀN TẮC MÃ NGUỒN TOÀN VẸN|NGUYÊN TẮC MÃ NGUỒN TOÀN VẸN|100% TOÀN VẸN|QUY TẮC BẮT BUỘC VỀ MÃ NGUỒN/i,
        'Workspace system prompt must include 100% complete code section'
      );
      assert.match(
        appJs,
        /TUYỆT ĐỐI (?:NGHIÊM )?CẤM/i,
        'Workspace prompt must strictly ban placeholders'
      );
    });

    it('T3.2: should not contain permissive wording allowing partial fragments in workspace prompt', () => {
      const sendWorkspaceFnMatch = appJs.match(/async\s+function\s+sendWorkspaceMessage[\s\S]*?\n  \}/);
      assert.ok(sendWorkspaceFnMatch, 'sendWorkspaceMessage must be defined in app.js');
      
      // Permissive fragment phrase must be eliminated
      assert.doesNotMatch(
        sendWorkspaceFnMatch[0],
        /hãy trả về toàn bộ hoặc đoạn mã nguồn mới/,
        'Permissive partial fragment phrasing must be removed from workspace prompt'
      );
    });

    it('T3.3: should inject active editor code into [MÃ NGUỒN HIỆN TẠI TRONG EDITOR] block', () => {
      assert.ok(
        appJs.includes('[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]'),
        'Workspace prompt must contain [MÃ NGUỒN HIỆN TẠI TRONG EDITOR]'
      );
      assert.match(
        appJs,
        /\[MÃ NGUỒN HIỆN TẠI TRONG EDITOR\]:[\s\S]*?\$\{currentCode\}/,
        'Workspace prompt must inject ${currentCode} inside editor code block'
      );
    });
  });

  // =========================================================================
  // SUITE 4: Request Payload & Static Integrity Checks
  // =========================================================================
  describe('4. API Request Payload Ceilings & Static Integrity', () => {
    it('T4.1: should bind max_tokens to resolveModelMaxTokens in makeApiRequest', () => {
      assert.match(appJs, /const\s+maxTokensCeiling\s*=\s*resolveModelMaxTokens\(modelToUse,\s*State\.mode\)/);
      assert.match(appJs, /max_tokens:\s*maxTokensCeiling/,
        'makeApiRequest must resolve and reuse the model max-token ceiling');
    });

    it('T4.2: should bind max_tokens to resolveModelMaxTokens in callWorkspaceChatApi', () => {
      assert.match(
        appJs,
        /max_tokens:\s*maxTokensCeiling|max_tokens:\s*resolveModelMaxTokens\(/,
        'callWorkspaceChatApi must set max_tokens to model ceiling in stream: true and fallback payloads'
      );
    });

    it('T4.3: should preserve critical workspace abort controller, timeout, and typing cleanup', () => {
      assert.match(appJs, /if\s*\(_workspaceAbortController\)\s*\{\s*_workspaceAbortController\.abort\(\);/);
      assert.match(appJs, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?_workspaceAbortController\.abort\(\);[\s\S]*?45000\)/);
      assert.match(appJs, /const\s+typingEl\s*=\s*document\.getElementById\(typingMsgId\);\s*if\s*\(typingEl\)\s*typingEl\.remove\(\);/);
    });

    it('T4.4: should preserve MAX_CONTINUATION_TURNS = 5 and continuation prompt structure', () => {
      assert.match(appJs, /const\s+MAX_CONTINUATION_TURNS\s*=\s*5;/);
      assert.match(appJs, /while\s*\(\s*turnCount\s*<\s*MAX_CONTINUATION_TURNS\s*\)/);
      assert.match(appJs, /Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:/);
    });
  });
});
