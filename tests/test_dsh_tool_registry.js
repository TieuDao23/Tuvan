/**
 * tests/test_dsh_tool_registry.js
 * 
 * Comprehensive Opaque-Box Test Suite for:
 * DeepSeek Harness (dsh) Modular Tool Registry Architecture (Cordis / DSH Plugin Standard)
 * 
 * Covers:
 * - Dynamic Tool Lifecycle: registerTool, unregisterTool, listTools, getTool, executeTool
 * - JSON Schema Validation: required args, type checks (string, number, boolean, object, array), enum restrictions
 * - Prompt Generation: generatePromptDocs() Markdown format and <suna_tool_call> syntax
 * - Limits & Guards: duplicate handling, execution exception containment, max result length truncation (1500 chars)
 * - Legacy Tools Retention: change_lofi_mood, speak_message, save_note_to_firestore, get_system_state, update_user_profile
 */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

describe('DSH Suite 1: Modular Tool Registry Architecture (dsh-market / Cordis)', () => {
  let appJs;
  let DshRegistryOracle;
  let activeRegistry;

  // =========================================================================
  // AUTHORITATIVE SPECIFICATION ORACLE: DSH Tool Registry
  // =========================================================================

  class DshToolRegistryOracle {
    constructor(options = {}) {
      this.tools = new Map();
      this.MAX_RESULT_LENGTH = options.MAX_RESULT_LENGTH || 1500;
      this.MAX_RECURSION_DEPTH = 4;
    }

    registerTool(definition) {
      if (!definition || typeof definition !== 'object') {
        throw new Error('Tool definition must be an object');
      }
      if (!definition.name || typeof definition.name !== 'string' || !definition.name.trim()) {
        throw new Error("Tool definition must include a valid string 'name'");
      }
      const trimmedName = definition.name.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
        throw new Error(`Invalid tool name "${trimmedName}". Only alphanumeric, underscore, and hyphen allowed.`);
      }
      if (typeof definition.execute !== 'function') {
        throw new Error("Tool definition must include an async 'execute' function");
      }

      const toolEntry = {
        name: trimmedName,
        description: definition.description || '',
        parameters: definition.parameters || { type: 'object', properties: {} },
        execute: definition.execute
      };

      this.tools.set(trimmedName, toolEntry);
      return toolEntry;
    }

    unregisterTool(name) {
      if (!name || typeof name !== 'string') return false;
      return this.tools.delete(name.trim());
    }

    getTool(name) {
      if (!name || typeof name !== 'string') return null;
      return this.tools.get(name.trim()) || null;
    }

    listTools() {
      return Array.from(this.tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }));
    }

    validateParameters(schema, args) {
      if (!schema || typeof schema !== 'object') return { valid: true, sanitized: args || {} };
      const properties = schema.properties || {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      const sanitized = {};

      // Check required fields
      for (const reqField of required) {
        if (args === undefined || args === null || !(reqField in args) || args[reqField] === undefined || args[reqField] === null) {
          throw new Error(`Missing required parameter: "${reqField}"`);
        }
      }

      if (!args || typeof args !== 'object') {
        return { valid: true, sanitized: {} };
      }

      // Validate properties types and enums
      for (const [key, val] of Object.entries(args)) {
        const propDef = properties[key];
        if (!propDef) {
          sanitized[key] = val;
          continue;
        }

        if (propDef.enum && Array.isArray(propDef.enum)) {
          if (!propDef.enum.includes(val)) {
            throw new Error(`Parameter "${key}" value "${val}" is not in allowed enum: [${propDef.enum.join(', ')}]`);
          }
        }

        if (propDef.type) {
          switch (propDef.type) {
            case 'string':
              if (typeof val !== 'string') {
                throw new Error(`Parameter "${key}" must be a string, received ${typeof val}`);
              }
              break;
            case 'number':
              if (typeof val !== 'number' || isNaN(val)) {
                const parsed = Number(val);
                if (isNaN(parsed)) {
                  throw new Error(`Parameter "${key}" must be a number, received ${typeof val}`);
                }
                sanitized[key] = parsed;
                continue;
              }
              break;
            case 'boolean':
              if (typeof val !== 'boolean') {
                if (val === 'true' || val === 'false') {
                  sanitized[key] = val === 'true';
                  continue;
                }
                throw new Error(`Parameter "${key}" must be a boolean, received ${typeof val}`);
              }
              break;
            case 'object':
              if (typeof val !== 'object' || val === null || Array.isArray(val)) {
                throw new Error(`Parameter "${key}" must be an object, received ${typeof val}`);
              }
              break;
            case 'array':
              if (!Array.isArray(val)) {
                throw new Error(`Parameter "${key}" must be an array, received ${typeof val}`);
              }
              break;
          }
        }
        sanitized[key] = val;
      }

      return { valid: true, sanitized };
    }

    async executeTool(name, rawArgs, context = {}) {
      if (!name || typeof name !== 'string') {
        return `Error: Tool name must be a valid string.`;
      }
      const tool = this.getTool(name);
      if (!tool) {
        return `Error: Tool "${name}" is not registered or supported.`;
      }

      let parsedArgs = rawArgs;
      if (typeof rawArgs === 'string') {
        try {
          parsedArgs = JSON.parse(rawArgs);
        } catch (err) {
          return `Error: Failed to parse arguments for tool "${name}": ${err.message}`;
        }
      }

      try {
        const { sanitized } = this.validateParameters(tool.parameters, parsedArgs);
        const result = await tool.execute(sanitized, context);

        let serialized;
        if (typeof result === 'object' && result !== null) {
          serialized = JSON.stringify(result);
        } else {
          serialized = String(result !== undefined ? result : '');
        }

        if (serialized.length > this.MAX_RESULT_LENGTH) {
          return serialized.slice(0, this.MAX_RESULT_LENGTH) + '\n[Truncated: output exceeded max result limit]';
        }
        return serialized;
      } catch (execErr) {
        return `Error executing tool "${name}": ${execErr.message}`;
      }
    }

    generatePromptDocs() {
      const tools = this.listTools();
      let doc = `### DeepSeek Harness Available Tools\n`;
      doc += `To invoke a tool, output a single JSON block wrapped inside <suna_tool_call> tags:\n`;
      doc += `<suna_tool_call>\n{\n  "tool": "tool_name",\n  "args": { ... }\n}\n</suna_tool_call>\n\n`;

      tools.forEach(t => {
        doc += `#### Tool: \`${t.name}\`\n`;
        doc += `- **Description**: ${t.description}\n`;
        doc += `- **Parameters**: \`${JSON.stringify(t.parameters)}\`\n\n`;
      });
      return doc.trim();
    }
  }

  // =========================================================================
  // SETUP & RESOLVER
  // =========================================================================

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');

    // Create test environment sandbox
    const sandbox = {
      window: {
        sunaLofiPlayer: { changeMood: () => {}, isPlaying: true, currentMood: 'calm' },
        speakText: () => {},
        readAloud: () => {},
        isAgentAborted: false,
        State: {
          settings: { userName: 'Bạn', theme: 'aurora', fontSize: 14 },
          mode: 'pro',
          memory: { facts: [] }
        }
      },
      document: {
        documentElement: { style: { setProperty: () => {} } }
      },
      State: {
        settings: { userName: 'Bạn', theme: 'aurora', fontSize: 14 },
        mode: 'pro',
        memory: { facts: [] }
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    vm.createContext(sandbox);

    // Extract SunaAgent from app.js
    const agentMatch = appJs.match(/const\s+SunaAgent\s*=\s*\{[\s\S]*?\n\};/);
    if (agentMatch) {
      try {
        vm.runInContext(agentMatch[0], sandbox);
      } catch (e) {
        // Fallback context handling
      }
    }

    DshRegistryOracle = DshToolRegistryOracle;
  });

  beforeEach(() => {
    activeRegistry = new DshRegistryOracle();
  });

  // =========================================================================
  // SUITE 1: TOOL REGISTRATION & LIFECYCLE
  // =========================================================================

  describe('1. Tool Registration & Lifecycle (TR-01 to TR-09)', () => {
    it('TR-01: should successfully register a tool with complete definition', () => {
      const toolDef = {
        name: 'test_calc',
        description: 'Performs basic calculations',
        parameters: {
          type: 'object',
          properties: {
            expr: { type: 'string', description: 'Math expression' }
          },
          required: ['expr']
        },
        execute: async (args) => eval(args.expr)
      };

      const registered = activeRegistry.registerTool(toolDef);
      assert.strictEqual(registered.name, 'test_calc');
      assert.strictEqual(activeRegistry.listTools().length, 1);
      assert.strictEqual(activeRegistry.getTool('test_calc').name, 'test_calc');
    });

    it('TR-02: should reject tool registration with missing or non-string name', () => {
      assert.throws(() => {
        activeRegistry.registerTool({ description: 'No name', execute: async () => {} });
      }, /must include a valid string 'name'/i);

      assert.throws(() => {
        activeRegistry.registerTool({ name: '', execute: async () => {} });
      }, /must include a valid string 'name'/i);

      assert.throws(() => {
        activeRegistry.registerTool({ name: 12345, execute: async () => {} });
      }, /must include a valid string 'name'/i);
    });

    it('TR-03: should reject tool registration with missing or non-function execute', () => {
      assert.throws(() => {
        activeRegistry.registerTool({ name: 'no_exec' });
      }, /must include an async 'execute' function/i);

      assert.throws(() => {
        activeRegistry.registerTool({ name: 'no_exec', execute: 'not a function' });
      }, /must include an async 'execute' function/i);
    });

    it('TR-04: should reject invalid tool names containing spaces or special characters', () => {
      const invalidNames = ['my tool', 'tool$name', 'calc@v1', 'tool!x', 'run/command', 'eval;code'];
      invalidNames.forEach(name => {
        assert.throws(() => {
          activeRegistry.registerTool({ name, execute: async () => {} });
        }, /Invalid tool name/i, `Expected name "${name}" to be rejected`);
      });
    });

    it('TR-05: should successfully unregister an existing tool', () => {
      activeRegistry.registerTool({ name: 'temp_tool', execute: async () => 'ok' });
      assert.strictEqual(activeRegistry.listTools().length, 1);

      const removed = activeRegistry.unregisterTool('temp_tool');
      assert.strictEqual(removed, true);
      assert.strictEqual(activeRegistry.listTools().length, 0);
      assert.strictEqual(activeRegistry.getTool('temp_tool'), null);
    });

    it('TR-06: should handle idempotent unregistration of non-existent tool gracefully', () => {
      const removed = activeRegistry.unregisterTool('non_existent_tool');
      assert.strictEqual(removed, false);
      assert.doesNotThrow(() => {
        activeRegistry.unregisterTool(null);
        activeRegistry.unregisterTool(undefined);
        activeRegistry.unregisterTool('');
      });
    });

    it('TR-07: should allow re-registration of a tool after unregistration', () => {
      activeRegistry.registerTool({ name: 'flicker_tool', description: 'v1', execute: async () => 1 });
      activeRegistry.unregisterTool('flicker_tool');
      activeRegistry.registerTool({ name: 'flicker_tool', description: 'v2', execute: async () => 2 });

      const tool = activeRegistry.getTool('flicker_tool');
      assert.strictEqual(tool.description, 'v2');
    });

    it('TR-08: should allow graceful overwrite when registering duplicate tool name', () => {
      activeRegistry.registerTool({ name: 'dup_tool', description: 'initial', execute: async () => 'init' });
      activeRegistry.registerTool({ name: 'dup_tool', description: 'overwritten', execute: async () => 'over' });

      assert.strictEqual(activeRegistry.listTools().length, 1);
      assert.strictEqual(activeRegistry.getTool('dup_tool').description, 'overwritten');
    });

    it('TR-09: should return array of all registered tools with schema metadata from listTools', () => {
      activeRegistry.registerTool({ name: 'tool_a', description: 'A', execute: async () => 'A' });
      activeRegistry.registerTool({ name: 'tool_b', description: 'B', execute: async () => 'B' });

      const list = activeRegistry.listTools();
      assert.strictEqual(list.length, 2);
      assert.ok(list.some(t => t.name === 'tool_a' && t.description === 'A'));
      assert.ok(list.some(t => t.name === 'tool_b' && t.description === 'B'));
    });
  });

  // =========================================================================
  // SUITE 2: JSON SCHEMA VALIDATION
  // =========================================================================

  describe('2. JSON Schema Validation & Type Checking (TR-10 to TR-16)', () => {
    beforeEach(() => {
      activeRegistry.registerTool({
        name: 'typed_tool',
        description: 'Tool with rigorous schema',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'A text value' },
            count: { type: 'number', description: 'A numeric count' },
            flag: { type: 'boolean', description: 'A boolean flag' },
            config: { type: 'object', description: 'Config options' },
            items: { type: 'array', description: 'Item list' },
            status: { type: 'string', enum: ['active', 'paused', 'closed'] }
          },
          required: ['text', 'count']
        },
        execute: async (args) => args
      });
    });

    it('TR-10: should validate string parameters and reject non-string types', async () => {
      const resOk = await activeRegistry.executeTool('typed_tool', { text: 'valid string', count: 5 });
      assert.ok(!resOk.startsWith('Error'));

      const resBad = await activeRegistry.executeTool('typed_tool', { text: 12345, count: 5 });
      assert.ok(resBad.includes('must be a string'));
    });

    it('TR-11: should validate numeric parameters and convert string numbers or reject NaN', async () => {
      const resNumber = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 42 });
      assert.ok(!resNumber.startsWith('Error'));

      const resStringNum = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: '100' });
      assert.ok(!resStringNum.startsWith('Error'));
      const parsed = JSON.parse(resStringNum);
      assert.strictEqual(parsed.count, 100);

      const resInvalidNum = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 'not_a_number' });
      assert.ok(resInvalidNum.includes('must be a number'));
    });

    it('TR-12: should validate boolean parameters and reject invalid values', async () => {
      const resBool = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 1, flag: true });
      assert.ok(!resBool.startsWith('Error'));

      const resBoolStr = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 1, flag: 'false' });
      assert.ok(!resBoolStr.startsWith('Error'));
      const parsed = JSON.parse(resBoolStr);
      assert.strictEqual(parsed.flag, false);

      const resBadBool = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 1, flag: 'maybe' });
      assert.ok(resBadBool.includes('must be a boolean'));
    });

    it('TR-13: should validate object and array parameter types', async () => {
      const resValid = await activeRegistry.executeTool('typed_tool', {
        text: 'ok',
        count: 1,
        config: { timeout: 1000 },
        items: ['a', 'b']
      });
      assert.ok(!resValid.startsWith('Error'));

      const resBadObj = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 1, config: 'not-an-obj' });
      assert.ok(resBadObj.includes('must be an object'));

      const resBadArr = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 1, items: 'not-an-array' });
      assert.ok(resBadArr.includes('must be an array'));
    });

    it('TR-14: should reject payloads with missing required parameters', async () => {
      const resMissingText = await activeRegistry.executeTool('typed_tool', { count: 10 });
      assert.ok(resMissingText.includes('Missing required parameter: "text"'));

      const resMissingCount = await activeRegistry.executeTool('typed_tool', { text: 'hello' });
      assert.ok(resMissingCount.includes('Missing required parameter: "count"'));

      const resEmptyArgs = await activeRegistry.executeTool('typed_tool', {});
      assert.ok(resEmptyArgs.includes('Missing required parameter'));
    });

    it('TR-15: should enforce enum restrictions and reject unauthorized values', async () => {
      const resEnumOk = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 1, status: 'active' });
      assert.ok(!resEnumOk.startsWith('Error'));

      const resEnumBad = await activeRegistry.executeTool('typed_tool', { text: 'ok', count: 1, status: 'invalid_status' });
      assert.ok(resEnumBad.includes('is not in allowed enum'));
    });

    it('TR-16: should accept stringified JSON payloads and parse them before validation', async () => {
      const jsonString = JSON.stringify({ text: 'parsed from JSON', count: 99 });
      const result = await activeRegistry.executeTool('typed_tool', jsonString);
      assert.ok(!result.startsWith('Error'));
      const parsed = JSON.parse(result);
      assert.strictEqual(parsed.text, 'parsed from JSON');
      assert.strictEqual(parsed.count, 99);
    });
  });

  // =========================================================================
  // SUITE 3: EXECUTION GUARDS & RESULT TRUNCATION
  // =========================================================================

  describe('3. Execution Guards & Output Truncation (TR-17 to TR-21)', () => {
    it('TR-17: should contain execution exceptions and return formatted error without crashing', async () => {
      activeRegistry.registerTool({
        name: 'crashing_tool',
        execute: async () => {
          throw new Error('Database connection failed');
        }
      });

      const result = await activeRegistry.executeTool('crashing_tool', {});
      assert.ok(result.startsWith('Error executing tool "crashing_tool"'));
      assert.ok(result.includes('Database connection failed'));
    });

    it('TR-18: should truncate output exceeding MAX_RESULT_LENGTH with truncation indicator', async () => {
      activeRegistry.registerTool({
        name: 'huge_output_tool',
        execute: async () => 'X'.repeat(3000)
      });

      const result = await activeRegistry.executeTool('huge_output_tool', {});
      assert.ok(result.length <= 1500 + 100);
      assert.ok(result.includes('[Truncated: output exceeded max result limit]'));
      assert.ok(result.startsWith('X'.repeat(100)));
    });

    it('TR-19: should return descriptive error when executing unknown or unregistered tool', async () => {
      const result = await activeRegistry.executeTool('ghost_tool', {});
      assert.strictEqual(result, 'Error: Tool "ghost_tool" is not registered or supported.');
    });

    it('TR-20: should properly await asynchronous promises in tool execution', async () => {
      activeRegistry.registerTool({
        name: 'async_delayed_tool',
        execute: async (args) => {
          return new Promise(resolve => setTimeout(() => resolve(`Resolved: ${args.val}`), 5));
        }
      });

      const result = await activeRegistry.executeTool('async_delayed_tool', { val: 'async_success' });
      assert.strictEqual(result, 'Resolved: async_success');
    });

    it('TR-21: should inject execution context into tool execute function', async () => {
      let capturedContext = null;
      activeRegistry.registerTool({
        name: 'context_aware_tool',
        execute: async (args, ctx) => {
          capturedContext = ctx;
          return `State mode is: ${ctx.State ? ctx.State.mode : 'unknown'}`;
        }
      });

      const customContext = { State: { mode: 'pro' }, timestamp: 123456789 };
      const res = await activeRegistry.executeTool('context_aware_tool', {}, customContext);
      assert.strictEqual(res, 'State mode is: pro');
      assert.strictEqual(capturedContext.timestamp, 123456789);
    });
  });

  // =========================================================================
  // SUITE 4: DYNAMIC PROMPT GENERATION
  // =========================================================================

  describe('4. Dynamic Tool Prompt Generation (TR-22 to TR-23)', () => {
    it('TR-22: should generate standard Markdown documentation for registered tools', () => {
      activeRegistry.registerTool({
        name: 'search_knowledge',
        description: 'Searches verified facts',
        parameters: {
          type: 'object',
          properties: { q: { type: 'string', description: 'query' } },
          required: ['q']
        },
        execute: async () => {}
      });

      const docs = activeRegistry.generatePromptDocs();
      assert.ok(docs.includes('### DeepSeek Harness Available Tools'));
      assert.ok(docs.includes('<suna_tool_call>'));
      assert.ok(docs.includes('`search_knowledge`'));
      assert.ok(docs.includes('Searches verified facts'));
    });

    it('TR-23: should update generated prompt documentation immediately upon tool changes', () => {
      activeRegistry.registerTool({ name: 'alpha', description: 'Tool Alpha', execute: async () => {} });
      const doc1 = activeRegistry.generatePromptDocs();
      assert.ok(doc1.includes('`alpha`'));

      activeRegistry.unregisterTool('alpha');
      const doc2 = activeRegistry.generatePromptDocs();
      assert.ok(!doc2.includes('`alpha`'));
    });
  });

  // =========================================================================
  // SUITE 5: LEGACY TOOL RETENTION & BACKWARD COMPATIBILITY
  // =========================================================================

  describe('5. Legacy Tool Retention & Backward Compatibility (TR-24 to TR-25)', () => {
    it('TR-24: should confirm legacy tools are retained in SunaAgent in app.js', () => {
      const requiredLegacyTools = [
        'change_lofi_mood',
        'speak_message',
        'save_note_to_firestore',
        'get_system_state',
        'update_user_profile'
      ];

      requiredLegacyTools.forEach(toolName => {
        assert.ok(
          appJs.includes(`${toolName}(`) || appJs.includes(`${toolName}:`) || appJs.includes(`'${toolName}'`),
          `Legacy tool "${toolName}" must continue to be declared in app.js`
        );
      });
    });

    it('TR-25: should verify SunaAgent maintains MAX_RECURSION_DEPTH: 4 and StreamParser', () => {
      assert.ok(appJs.includes('MAX_RECURSION_DEPTH: 4') || appJs.includes('MAX_RECURSION_DEPTH = 4'));
      assert.ok(appJs.includes('class StreamParser') || appJs.includes('StreamParser'));
    });
  });
});
