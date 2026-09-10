/**
 * suna_agent.js
 * 
 * SunaAgent — Siêu Tác Nhân Tự Trị Độc Quyền Cho Hệ Sinh Thái SunaChat & SunaHarness
 * 
 * Synthesizes:
 * - HermesAgent: High-conviction Function Calling, Multi-Syntax Parsing & Structured Reasoning
 * - Claude Agent: Extended Thinking (<think>, <thought>, <scratchpad>), Meticulous Planning & Reflection
 * - Codex Agent: Precise Code Surgery (UTF-8 Safe), Unified Git Diff Previews & Grounded Self-Correction
 * 
 * Invariants & Governance:
 * - 100% Pure Vanilla JavaScript (ES6+), zero external npm dependencies
 * - Dual Runtime Universality (Node.js CommonJS/ESM interop + Browser window.SunaAgent / Web Workers)
 * - Gate 4 Legacy Invariants: MAX_RECURSION_DEPTH: 4, MAX_RESULT_LENGTH: 1500, reset(), abort(),
 *   isAgentAborted, MOODS_WHITELIST, THEMES_WHITELIST, _registry Map, and 5 legacy tools + sandbox_exec
 * - SunaHarness symbiosis: ACI tool suite integration, AciSchemaValidator compliance, VfsDiffEngine preview
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    const SunaAgent = factory();
    module.exports = SunaAgent;
    module.exports.SunaAgent = SunaAgent;
    module.exports.OodaBrain = SunaAgent.OodaBrain;
    module.exports.MultiSyntaxParser = SunaAgent.MultiSyntaxParser;
    module.exports.JsonAutoRepair = SunaAgent.JsonAutoRepair;
    module.exports.SmartMemory = SunaAgent.SmartMemory;
    module.exports.StreamParser = SunaAgent.StreamParser;
    module.exports.ExtendedThinkingStreamParser = SunaAgent.ExtendedThinkingStreamParser;
    module.exports.default = SunaAgent;

    // Auto-attach local SunaHarness if present in Node environment
    try {
      const localHarness = require('./suna_harness.js');
      if (localHarness && typeof localHarness.registerAciTools === 'function') {
        localHarness.registerAciTools(SunaAgent);
      }
    } catch (e) {
      // Local harness optional in isolated test suites
    }
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else {
    // Browser Global / Web Worker
    const SunaAgent = factory();
    root.SunaAgent = SunaAgent;
    if (typeof window !== 'undefined') {
      window.SunaAgent = SunaAgent;
      if (window.SunaHarness && typeof window.SunaHarness.registerAciTools === 'function') {
        window.SunaHarness.registerAciTools(SunaAgent);
      }
    }
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  'use strict';

  // Helper to dynamically resolve SunaHarness components across Browser and Node environments
  function getHarnessComponents() {
    let H = null;
    if (typeof SunaHarness !== 'undefined') {
      H = SunaHarness;
    } else if (typeof window !== 'undefined' && window.SunaHarness) {
      H = window.SunaHarness;
    } else if (typeof globalThis !== 'undefined' && globalThis.SunaHarness) {
      H = globalThis.SunaHarness;
    } else if (typeof require === 'function') {
      try { H = require('./suna_harness.js'); } catch (e) {}
    }
    return H;
  }

  // =========================================================================
  // 1. JSON AUTO-REPAIR ENGINE (JsonAutoRepair)
  // =========================================================================

  class JsonAutoRepair {
    /**
     * Multi-pass deterministic string repair for malformed JSON emitted by LLMs.
     * @param {string} raw - Malformed or raw JSON string.
     * @returns {string} Repaired valid JSON string.
     */
    static repair(raw) {
      if (typeof raw !== 'string') return '{}';
      let text = raw.trim();

      // 1. Normalize smart double and single quotes
      text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

      // 2. Strip Markdown code fences if wrapped
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      // 3. Remove leading commas in objects or arrays: {, "a": 1} or [, 1]
      text = text.replace(/([{[])\s*,\s*/g, '$1');

      // 4. Replace single-quoted JSON keys and string values safely while preserving quotes inside double-quoted strings
      text = text.replace(/"(?:[^"\\]|\\.)*"|'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, singleContent) => {
        if (singleContent !== undefined) {
          // Unescape escaped single quotes \' -> ' (invalid in RFC 8259 JSON)
          const unescapedSingle = singleContent.replace(/\\'/g, "'");
          // Escape unescaped double quotes inside the single-quoted string
          const escapedDouble = unescapedSingle.replace(/\\"/g, '"').replace(/"/g, '\\"');
          return '"' + escapedDouble + '"';
        }
        return match;
      });

      // 5. Quote unquoted object keys (alphanumeric, underscores, hyphens, dots, numeric keys): { foo: "bar" }, { 123: "val" }, { a.b: true }
      text = text.replace(/([{,]\s*)([a-zA-Z0-9_.-]+)\s*:/g, (match, prefix, key) => {
        if (/^["']/.test(key)) return match;
        return `${prefix}"${key}":`;
      });

      // 6. Clean consecutive commas (ignoring inside strings)
      text = text.replace(/"(?:[^"\\]|\\.)*"|,(\s*,)+/g, (m, g1) => g1 ? ',' : m);

      // 7. Strip trailing commas before closing braces or brackets
      text = text.replace(/,(\s*[}\]])/g, '$1');

      // 8. Fix colon without value before comma, brace, or bracket (ignoring inside strings)
      text = text.replace(/"(?:[^"\\]|\\.)*"|(:\s*(?=[}\],]|$))/g, (m, g1) => g1 ? ': null' : m);

      // 9. Fix mid-primitive cutoffs: tru -> true, fal -> false, nul -> null
      text = text.replace(/"(?:[^"\\]|\\.)*"|:\s*(tru|tr)(?=[}\],\s]|$)/gi, (m, g1) => g1 ? ': true' : m);
      text = text.replace(/"(?:[^"\\]|\\.)*"|:\s*(fal|fa)(?=[}\],\s]|$)/gi, (m, g1) => g1 ? ': false' : m);
      text = text.replace(/"(?:[^"\\]|\\.)*"|:\s*(nul|nu)(?=[}\],\s]|$)/gi, (m, g1) => g1 ? ': null' : m);

      // 10. Normalize unescaped newlines in multiline string values
      while (/(:\s*"[^"\n]*)\r?\n([^"]*")/g.test(text)) {
        text = text.replace(/(:\s*"[^"\n]*)\r?\n([^"]*")/g, '$1\\n$2');
      }

      // 11. Balance unclosed braces/brackets in LIFO order (using delimiter stack)
      let inString = false;
      let escaped = false;
      const stack = [];

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '\\' && !escaped) {
          escaped = true;
          continue;
        }
        if (ch === '"' && !escaped) {
          inString = !inString;
        } else if (!inString) {
          if (ch === '{') {
            stack.push('}');
          } else if (ch === '[') {
            stack.push(']');
          } else if (ch === '}' || ch === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === ch) {
              stack.pop();
            } else {
              const lastIdx = stack.lastIndexOf(ch);
              if (lastIdx !== -1) {
                stack.splice(lastIdx);
              }
            }
          }
        }
        escaped = false;
      }

      if (inString) {
        // Strip trailing incomplete unicode escape e.g. \u123
        text = text.replace(/\\u[0-9a-fA-F]{0,3}$/, '');
        // Strip odd trailing backslash before closing quote
        text = text.replace(/(^|[^\\])\\(?:\\\\)*$/, '$1');
        text += '"';
      }

      // Strip any trailing backslash outside strings
      text = text.replace(/(^|[^\\])\\(?:\\\\)*$/, '$1');

      // Strip any dangling comma or fix dangling colon at the cutoff boundary before closing delimiters
      text = text.replace(/,\s*$/, '');
      text = text.replace(/:\s*$/, ': null');

      while (stack.length > 0) {
        text += stack.pop();
      }

      return text;
    }

    /**
     * Safely parses JSON with auto-repair fallback.
     * @param {string|any} raw 
     * @returns {any}
     */
    static safeParse(raw) {
      if (typeof raw === 'object' && raw !== null) return raw;
      if (typeof raw !== 'string') return raw;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        const repaired = JsonAutoRepair.repair(trimmed);
        return JSON.parse(repaired);
      }
    }

    static parse(raw) {
      return this.safeParse(raw);
    }
  }

  // =========================================================================
  // 2. MULTI-SYNTAX TOOL CALL PARSER (MultiSyntaxParser)
  // =========================================================================

  class MultiSyntaxParser {
    /**
     * Extracts thinking blocks (<think>, <thought>, <scratchpad>) separating internal reasoning from user content.
     * @param {string} text 
     * @returns {{ thought: string, content: string }}
     */
    static extractThinking(text) {
      if (typeof text !== 'string') return { thought: '', content: '' };
      let content = text;
      let thought = '';

      // Match closed think/thought/scratchpad tags
      const thinkRegex = /<(think|thought|scratchpad)>([\s\S]*?)<\/\1>/gi;
      let match;
      while ((match = thinkRegex.exec(content)) !== null) {
        thought += (thought ? '\n' : '') + match[2].trim();
        content = content.slice(0, match.index) + content.slice(match.index + match[0].length);
        thinkRegex.lastIndex = 0;
      }

      // Strip leftover orphan closing tags
      content = content.replace(/<\/(think|thought|scratchpad)>/gi, '').trim();

      // Handle unclosed stream tag at end of string or before downstream tool calls
      const unclosedMatch = content.match(/<(think|thought|scratchpad)>([\s\S]*)$/i);
      if (unclosedMatch) {
        const tail = unclosedMatch[2];
        const toolBoundaryRegex = /(<(?:suna_tool_call|tool_call)\b|```(?:json)?\s*\{)/i;
        const boundaryMatch = tail.match(toolBoundaryRegex);

        if (boundaryMatch) {
          const boundaryIndex = boundaryMatch.index;
          thought += (thought ? '\n' : '') + tail.slice(0, boundaryIndex).trim();
          content = (content.slice(0, unclosedMatch.index) + '\n' + tail.slice(boundaryIndex)).trim();
        } else {
          thought += (thought ? '\n' : '') + tail.trim();
          content = content.slice(0, unclosedMatch.index).trim();
        }
      }

      // Clean any inner opening tags if nested (<think><think>nested</think></think>)
      thought = thought.replace(/<(think|thought|scratchpad)>/gi, '').trim();

      return { thought, content };
    }

    /**
     * Parses tool calls across XML, Markdown code blocks, and Native JSON formats.
     * @param {string} text 
     * @returns {Array<{ tool: string, args: Record<string, any>, raw: string }>}
     */
    static parse(text) {
      if (!text || typeof text !== 'string') return [];
      const calls = [];

      // 1. XML <suna_tool_call> or <tool_call>
      // Flexible attribute matching: supports tool="x", tool='x', tool=x, name="x", plus auxiliary attributes (id, timeout)
      const xmlPattern = /<(?:suna_tool_call|tool_call)\b([^>]*)>([\s\S]*?)<\/(?:suna_tool_call|tool_call)>/gi;
      let m;
      while ((m = xmlPattern.exec(text)) !== null) {
        const attrStr = m[1] || '';
        const body = m[2].trim();
        const attrMatch = attrStr.match(/(?:tool|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
        const attrTool = attrMatch ? (attrMatch[1] || attrMatch[2] || attrMatch[3]) : null;

        try {
          const parsed = JsonAutoRepair.safeParse(body);
          if (parsed && typeof parsed === 'object') {
            const toolName = attrTool || parsed.tool || parsed.name || parsed.tool_name;
            const args = parsed.args || parsed.parameters || parsed.params || parsed.arguments || Object.assign({}, parsed);
            if (args && typeof args === 'object') {
              delete args.tool;
              delete args.tool_name;
              delete args.name;
            }
            calls.push({ tool: toolName, args, raw: m[0], startIndex: m.index });
          }
        } catch (e) {
          const subParam = {};
          const subMatch = body.match(/<([^>]+)>([\s\S]*?)<\/\1>/g);
          if (subMatch) {
            subMatch.forEach(tag => {
              const tm = tag.match(/<([^>]+)>([\s\S]*?)<\/\1>/);
              if (tm) subParam[tm[1]] = tm[2].trim();
            });
          }
          const toolName = attrTool || subParam.tool_name || subParam.name || 'unknown';
          delete subParam.tool_name;
          delete subParam.name;
          calls.push({ tool: toolName, args: subParam, raw: m[0], startIndex: m.index });
        }
      }

      // 2. Markdown ```json code block (accumulate alongside XML; no calls.length === 0 mutual exclusion)
      const mdPattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
      while ((m = mdPattern.exec(text)) !== null) {
        try {
          const parsed = JsonAutoRepair.safeParse(m[1].trim());
          if (parsed && (parsed.tool || parsed.name)) {
            calls.push({
              tool: parsed.tool || parsed.name,
              args: parsed.args || parsed.parameters || parsed.params || parsed.arguments || {},
              raw: m[0],
              startIndex: m.index
            });
          }
        } catch (e) {}
      }

      // 3. Native function call JSON object (fallback only if no XML and no Markdown blocks were found)
      if (calls.length === 0) {
        try {
          const parsed = JsonAutoRepair.safeParse(text.trim());
          if (parsed && (parsed.name || parsed.tool)) {
            let args = parsed.arguments || parsed.args || parsed.parameters || {};
            if (typeof args === 'string') {
              args = JsonAutoRepair.safeParse(args);
            }
            calls.push({
              tool: parsed.name || parsed.tool,
              args: args,
              raw: text
            });
          }
        } catch (e) {}
      } else {
        // Sort accumulated calls by appearance order in text
        calls.sort((a, b) => a.startIndex - b.startIndex);
        calls.forEach(c => delete c.startIndex);
      }

      return calls;
    }
  }

  // =========================================================================
  // 3. STREAMING PARSER (StreamParser)
  // =========================================================================

  class StreamParser {
    constructor() {
      this.buffer = '';
      this.state = 'TEXT';
      this.filteredText = '';
      this.currentToolContent = '';
      this.currentToolName = null;
      this.completedCalls = [];
      this.toolCalls = [];
    }

    push(chunk) {
      if (!chunk) return '';
      this.buffer += chunk;
      let emittedText = '';

      while (this.buffer.length > 0) {
        if (this.state === 'TEXT') {
          const tagIndex = this.buffer.indexOf('<suna_tool_call');
          if (tagIndex === -1) {
            const lastAngle = this.buffer.lastIndexOf('<');
            const candidate = lastAngle !== -1 ? this.buffer.slice(lastAngle) : '';
            if (lastAngle !== -1 && '<suna_tool_call'.startsWith(candidate)) {
              emittedText += this.buffer.slice(0, lastAngle);
              this.buffer = candidate;
              break;
            } else {
              emittedText += this.buffer;
              this.buffer = '';
            }
          } else {
            emittedText += this.buffer.slice(0, tagIndex);
            this.buffer = this.buffer.slice(tagIndex);
            const closeAngle = this.buffer.indexOf('>');
            if (closeAngle !== -1) {
              const openTag = this.buffer.slice(0, closeAngle + 1);
              const toolMatch = openTag.match(/(?:tool|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
              this.currentToolName = toolMatch ? (toolMatch[1] || toolMatch[2] || toolMatch[3]) : null;
              this.buffer = this.buffer.slice(closeAngle + 1);
              this.state = 'IN_TAG';
              this.currentToolContent = '';
            } else {
              break;
            }
          }
        } else if (this.state === 'IN_TAG') {
          const endTagIndex = this.buffer.indexOf('</suna_tool_call>');
          if (endTagIndex === -1) {
            this.currentToolContent += this.buffer;
            this.buffer = '';
          } else {
            this.currentToolContent += this.buffer.slice(0, endTagIndex);
            this.buffer = this.buffer.slice(endTagIndex + '</suna_tool_call>'.length);
            this.state = 'TEXT';

            try {
              const parsed = JsonAutoRepair.safeParse(this.currentToolContent);
              const callObj = {
                tool: this.currentToolName || parsed.tool || parsed.name,
                args: parsed.args || parsed.parameters || parsed
              };
              if (callObj.args && typeof callObj.args === 'object') {
                delete callObj.args.tool;
                delete callObj.args.name;
              }
              this.completedCalls.push(callObj);
              this.toolCalls.push(typeof this.currentToolContent === 'string' ? this.currentToolContent.trim() : JSON.stringify(callObj));
            } catch (e) {
              this.completedCalls.push({
                tool: this.currentToolName || 'unknown',
                args: { raw: this.currentToolContent }
              });
              this.toolCalls.push(this.currentToolContent.trim());
            }
          }
        }
      }

      this.filteredText += emittedText;
      return emittedText;
    }

    parseChunk(chunk) {
      return this.push(chunk);
    }

    flush() {
      let extra = '';
      if (this.buffer) {
        extra = this.buffer;
        this.buffer = '';
      }
      this.state = 'TEXT';
      this.filteredText += extra;
      return extra;
    }

    getToolCalls() {
      return [...this.completedCalls];
    }
  }

  // =========================================================================
  // 4. EXTENDED THINKING STREAM PARSER (ExtendedThinkingStreamParser)
  // =========================================================================

  class ExtendedThinkingStreamParser extends StreamParser {
    constructor(options = {}) {
      super();
      this.onThoughtChunk = options.onThoughtChunk || null;
      this.fullThought = '';
    }

    push(chunk) {
      if (!chunk) return '';
      const extracted = MultiSyntaxParser.extractThinking(chunk);
      if (extracted.thought) {
        this.fullThought += (this.fullThought ? '\n' : '') + extracted.thought;
        if (typeof this.onThoughtChunk === 'function') {
          this.onThoughtChunk(extracted.thought);
        }
      }
      return super.push(extracted.content);
    }

    parseChunk(chunk) {
      return this.push(chunk);
    }
  }

  // =========================================================================
  // 5. SMART CONTEXT & DUAL MEMORY (SmartMemory)
  // =========================================================================

  class SmartMemory {
    constructor(options = {}) {
      this.systemPrompt = options.systemPrompt || 'You are SunaAgent, an autonomous AI system.';
      this.workingMemory = new Map(Object.entries(options.initialFacts || {}));
      this.tagIndex = new Map();
      this.episodicMemory = [];
      this.maxTokens = options.maxTokens || 16000;
      this._stateHash = 0;
      this._updateStateHash();
    }

    _fnv1a(str) {
      let hash = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) {
        hash = Math.imul(hash ^ str.charCodeAt(i), 16777619) >>> 0;
      }
      return hash;
    }

    _updateStateHash() {
      const keys = Array.from(this.workingMemory.keys()).sort();
      let combined = '';
      for (const k of keys) {
        let valStr = '';
        try {
          valStr = JSON.stringify(this.workingMemory.get(k));
        } catch (_) {
          valStr = String(this.workingMemory.get(k));
        }
        combined += `${k}:${valStr};`;
      }
      this._stateHash = this._fnv1a(combined);
      return this._stateHash;
    }

    getStateHash() {
      return (this._stateHash >>> 0).toString(16).padStart(8, '0');
    }

    setFact(key, value, tags = []) {
      this.workingMemory.set(key, value);
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
          this.tagIndex.get(tag).add(key);
        }
      }
      this._updateStateHash();
    }

    getFact(key) {
      return this.workingMemory.get(key);
    }

    deleteFact(key) {
      const existed = this.workingMemory.delete(key);
      for (const [tag, set] of this.tagIndex.entries()) {
        set.delete(key);
        if (set.size === 0) this.tagIndex.delete(tag);
      }
      if (existed) this._updateStateHash();
      return existed;
    }

    getFactsByTag(tag) {
      const keys = this.tagIndex.get(tag);
      if (!keys) return [];
      const res = [];
      for (const k of keys) {
        if (this.workingMemory.has(k)) {
          res.push({ key: k, value: this.workingMemory.get(k) });
        }
      }
      return res;
    }

    getByNamespace(ns) {
      const prefix = ns.endsWith(':') ? ns : `${ns}:`;
      const res = {};
      for (const [k, v] of this.workingMemory.entries()) {
        if (k.startsWith(prefix)) {
          res[k] = v;
        }
      }
      return res;
    }

    getByPrefix(prefix) {
      return this.getByNamespace(prefix);
    }

    recordEpisode(entry) {
      this.episodicMemory.push(Object.assign({
        timestamp: new Date().toISOString(),
        epoch_ms: Date.now()
      }, entry));
      this.checkAndCompact();
    }

    estimateTokens() {
      let total = Math.ceil(this.systemPrompt.length / 4);
      for (const [k, v] of this.workingMemory.entries()) {
        total += Math.ceil((k.length + JSON.stringify(v).length) / 4);
      }
      for (const ep of this.episodicMemory) {
        total += Math.ceil(JSON.stringify(ep).length / 4);
      }
      return total;
    }

    checkAndCompact() {
      const currentTokens = this.estimateTokens();
      if (currentTokens > this.maxTokens && this.episodicMemory.length > 3) {
        return this.compact();
      }
      return false;
    }

    computeRetentionScore(ep, index, total) {
      let rho = 0.5;
      const isArch = ep.type === 'arch' || ep.isArchitectural || (ep.action && ep.action.params && ep.action.params.arch) || (ep.category === 'architectural');
      const isSteer = ep.type === 'steer' || ep.isSteerDirective || ep.steer || (ep.category === 'steer');
      const isMilestone = ep.type === 'milestone' || ep.status === 'error' || ep.replanNeeded;

      if (isArch || isSteer) {
        rho = 1.0;
      } else if (isMilestone) {
        rho = 0.8;
      } else if (ep.action && (ep.action.tool === 'replace_file_content' || ep.action.tool === 'write_to_file')) {
        rho = 0.6;
      } else if (ep.action && (ep.action.tool === 'view_file' || ep.action.tool === 'list_dir' || ep.action.tool === 'grep_search')) {
        rho = 0.3;
      }

      const deltaT = Math.max(0, (total - 1) - index);
      const recency = 1 / (1 + 0.1 * deltaT);
      const betaFloor = (rho >= 0.9) ? 0.5 : 0.2;
      const score = rho * (betaFloor + (1 - betaFloor) * recency);
      return { score, rho, recency, isCore: rho >= 0.9 };
    }

    compact() {
      if (this.episodicMemory.length <= 2) return false;
      const total = this.episodicMemory.length;
      const preserveCount = 2;
      const candidateCount = total - preserveCount;
      const candidates = this.episodicMemory.slice(0, candidateCount);
      const preserved = this.episodicMemory.slice(candidateCount);

      const toKeep = [];
      const toSummarize = [];

      for (let i = 0; i < candidates.length; i++) {
        const ep = candidates[i];
        const { isCore } = this.computeRetentionScore(ep, i, total);
        if (isCore) {
          toKeep.push(ep);
        } else {
          toSummarize.push(ep);
        }
      }

      if (toSummarize.length === 0) {
        return false;
      }

      const filePaths = new Set();
      const actions = [];
      for (const ep of toSummarize) {
        if (ep.type === 'compacted_summary' && ep.summary) {
          const toolsMatch = ep.summary.match(/executed tools:\s*\[([^\]]*)\]/);
          if (toolsMatch && toolsMatch[1]) {
            toolsMatch[1].split(',').map(s => s.trim()).filter(Boolean).forEach(t => actions.push(t));
          }
          const filesMatch = ep.summary.match(/Files accessed:\s*\[([^\]]*)\]/);
          if (filesMatch && filesMatch[1]) {
            filesMatch[1].split(',').map(s => s.trim()).filter(Boolean).forEach(f => filePaths.add(f));
          }
        } else if (ep.action && ep.action.tool) {
          actions.push(ep.action.tool);
          if (ep.action.params && (ep.action.params.path || ep.action.params.TargetFile)) {
            filePaths.add(ep.action.params.path || ep.action.params.TargetFile);
          }
        }
      }

      const summaryEpisode = {
        type: 'compacted_summary',
        summary: `Prior ${toSummarize.length} turns executed tools: [${actions.join(', ')}]. Files accessed: [${Array.from(filePaths).join(', ')}].`,
        compactedTurns: toSummarize.length,
        timestamp: new Date().toISOString()
      };

      this.episodicMemory = [summaryEpisode, ...toKeep, ...preserved];
      return true;
    }
  }

  // =========================================================================
  // 6. COGNITIVE BRAIN (OodaBrain)
  // =========================================================================

  class OodaBrain {
    constructor(options = {}) {
      this.options = options;
    }

    analyzeIntent(prompt) {
      if (!prompt || typeof prompt !== 'string') {
        return { primaryGoal: 'none', subGoals: [], constraints: [], successCriteria: [] };
      }
      const lower = prompt.toLowerCase();
      const goals = [];
      const constraints = [];
      if (lower.includes('fix') || lower.includes('bug')) goals.push('bug_fix');
      if (lower.includes('create') || lower.includes('build')) goals.push('code_generation');
      if (lower.includes('vietnamese') || lower.includes('tiếng việt')) constraints.push('utf8_vietnamese');
      if (lower.includes('diff')) constraints.push('preview_diff');

      // Dynamically extract target file from prompt text
      let targetFile = null;
      const filePattern = /(?:in|file|path|at|inspect|edit|fix|update)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i;
      const m = prompt.match(filePattern);
      if (m) {
        targetFile = m[1];
      } else {
        const extPattern = /\b([a-zA-Z0-9_\-\.\/]+\.(?:js|json|html|css|txt|md|ts|py))\b/i;
        const m2 = prompt.match(extPattern);
        if (m2) targetFile = m2[1];
      }

      return {
        primaryGoal: goals[0] || 'general_task',
        subGoals: goals.length ? goals : ['general_task'],
        constraints,
        successCriteria: ['zero_syntax_errors', 'tests_pass'],
        targetFile
      };
    }

    planHierarchy(intent, contextOrPrompt) {
      const steps = [];
      let targetFile = (intent && intent.targetFile) || null;
      if (!targetFile && typeof contextOrPrompt === 'string') {
        const filePattern = /(?:in|file|path|at|inspect|edit|fix|update)\s+([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/i;
        const m = contextOrPrompt.match(filePattern);
        if (m) {
          targetFile = m[1];
        } else {
          const extPattern = /\b([a-zA-Z0-9_\-\.\/]+\.(?:js|json|html|css|txt|md|ts|py))\b/i;
          const m2 = contextOrPrompt.match(extPattern);
          if (m2) targetFile = m2[1];
        }
      }
      const resolvedFile = targetFile || 'app.js';

      if (intent && intent.primaryGoal === 'bug_fix') {
        steps.push({ id: 1, name: 'inspect_source', tool: 'view_file', params: { path: resolvedFile, TargetFile: resolvedFile } });
        steps.push({ id: 2, name: 'perform_surgery', tool: 'replace_file_content', params: { TargetFile: resolvedFile, path: resolvedFile } });
        steps.push({ id: 3, name: 'verify_fix', tool: 'run_sandboxed_command', params: { CommandLine: `node -c ${resolvedFile}` } });
      } else if (intent && intent.primaryGoal === 'code_generation') {
        steps.push({ id: 1, name: 'check_workspace', tool: 'list_dir', params: { DirectoryPath: '' } });
        steps.push({ id: 2, name: 'write_code', tool: 'replace_file_content', params: { TargetFile: resolvedFile, path: resolvedFile } });
        steps.push({ id: 3, name: 'verify_code', tool: 'run_sandboxed_command', params: { CommandLine: `node -c ${resolvedFile}` } });
      } else {
        steps.push({ id: 1, name: 'explore_workspace', tool: 'list_dir', params: { DirectoryPath: '' } });
      }
      return steps;
    }

    thinkExtended(step, context) {
      const stepName = (step && step.name) || 'step';
      const toolName = (step && step.tool) || 'tool';
      return `Extended Thinking: Deliberating step "${stepName}". Tool: ${toolName}. Checking pre-conditions and schema bounds.`;
    }

    reflectObservation(step, observation, context) {
      const stepName = (step && step.name) || 'step';
      const isError = observation && (
        observation.status === 'error' ||
        observation.status === 'ERROR' ||
        observation.status === 'failed' ||
        observation.error ||
        observation.success === false
      );
      if (!isError && (Array.isArray(observation) || typeof observation === 'string' || typeof observation === 'number' || typeof observation === 'boolean' || (observation && (observation.status === 'success' || typeof observation === 'object')))) {
        const msg = `Step "${stepName}" succeeded cleanly.`;
        return {
          satisfied: true,
          nextAction: 'proceed',
          reflection: msg,
          reflectionText: msg
        };
      }
      const errMsg = observation ? (observation.error || observation.message || 'unknown') : 'unknown';
      const msg = `Step "${stepName}" encountered diagnostic: ${errMsg}. Need remediation.`;
      return {
        satisfied: false,
        nextAction: 'replan',
        replanNeeded: true,
        reflection: msg,
        reflectionText: msg
      };
    }
  }

  // =========================================================================
  // 7. CORE SUNAAGENT CLASS & FACADE
  // =========================================================================

  class SunaAgent {
    constructor(options = {}) {
      this.id = options.id || 'suna_agent_root';
      this.role = options.role || 'lead';
      this.MAX_RECURSION_DEPTH = 4;
      this.MAX_RESULT_LENGTH = 1500;
      this.MOODS_WHITELIST = ['calm', 'excited', 'sad', 'stressed', 'creative'];
      this.THEMES_WHITELIST = ['aurora', 'sunset', 'ocean', 'forest', 'midnight'];

      this._registry = new Map();
      this.tools = {};
      this.listeners = new Map();

      this.memory = new SmartMemory(options);
      this.brain = new OodaBrain(options);
      this.harness = null;
      this.vfs = null;
      this.controller = null;
      this.trajectory = null;
      this.checkpoints = null;
      this.eventBus = null;

      this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'halted'
      this.isAgentAborted = false;
      this.steerInstructions = [];
      this._lastCheckpointStep = 1;

      // Circuit Breaker & Consecutive Failures Tracking (Requirement R3)
      this.consecutiveFailures = 0;
      this.maxConsecutiveFailures = (options && options.maxConsecutiveFailures) || 3;
      this.haltReason = null;

      const H = getHarnessComponents();
      const GuardrailsClass = (H && (H.RunawayGuardrails || H.GuardrailSentinel)) || (typeof RunawayGuardrails !== 'undefined' ? RunawayGuardrails : null);
      this.guardrails = options.guardrails || (GuardrailsClass ? new GuardrailsClass({
        vfs: this.vfs,
        maxConsecutiveFailures: this.maxConsecutiveFailures
      }) : null);

      this.StreamParser = StreamParser;
      this._initLegacyTools();
    }

    get StreamParser() {
      return this._StreamParser || StreamParser;
    }

    set StreamParser(val) {
      this._StreamParser = val;
    }

    static get StreamParser() {
      return StreamParser;
    }

    static set StreamParser(val) {
      // Allow static assignment
    }

    static get ExtendedThinkingStreamParser() {
      return ExtendedThinkingStreamParser;
    }

    static get OodaBrain() {
      return OodaBrain;
    }

    static get MultiSyntaxParser() {
      return MultiSyntaxParser;
    }

    static get JsonAutoRepair() {
      return JsonAutoRepair;
    }

    static get SmartMemory() {
      return SmartMemory;
    }

    _initLegacyTools() {
      const legacy = [
        {
          name: 'change_lofi_mood',
          description: 'Changes background Lofi music mood.',
          parameters: { type: 'object', properties: { mood: { type: 'string', enum: this.MOODS_WHITELIST } }, required: ['mood'] },
          execute: async (args) => ({ status: 'success', mood: args ? args.mood : 'calm' })
        },
        {
          name: 'speak_message',
          description: 'Speaks a message aloud via text-to-speech.',
          parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
          execute: async (args) => ({ status: 'success', text: args ? (args.message || args.text) : '' })
        },
        {
          name: 'save_note_to_firestore',
          description: 'Saves a note to Firestore or local storage.',
          parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['content'] },
          execute: async (args) => ({ status: 'success', noteId: 'note_' + Date.now(), note: args })
        },
        {
          name: 'get_system_state',
          description: 'Retrieves current system state and context.',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({ status: 'success', state: {} })
        },
        {
          name: 'update_user_profile',
          description: 'Updates user profile preferences.',
          parameters: { type: 'object', properties: { userName: { type: 'string' }, theme: { type: 'string' } } },
          execute: async (args) => ({ status: 'success', profile: args || {} })
        },
        {
          name: 'sandbox_exec',
          description: 'Execute JavaScript code in sandboxed VM evaluator.',
          parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
          execute: async (args) => ({ status: 'success', code: args ? args.code : '' })
        }
      ];
      legacy.forEach(t => this.registerTool(t));
    }

    reset() {
      this.isAgentAborted = false;
      this.status = 'idle';
      this.consecutiveFailures = 0;
      this.haltReason = null;
      if (this.guardrails && typeof this.guardrails.reset === 'function') {
        this.guardrails.reset();
      }
      if (typeof window !== 'undefined') {
        window.isAgentAborted = false;
      }
      this.emit('status_change', { status: 'idle' });
    }

    abort(reason) {
      this.isAgentAborted = true;
      this.status = 'halted';
      this.haltReason = reason || 'Execution aborted by user or controller';
      if (typeof window !== 'undefined') {
        window.isAgentAborted = true;
      }
      this.emit('status_change', { status: 'halted', reason: this.haltReason });
    }

    static reset() {
      if (typeof window !== 'undefined') {
        window.isAgentAborted = false;
      }
    }

    static abort() {
      if (typeof window !== 'undefined') {
        window.isAgentAborted = true;
      }
    }

    registerTool(def) {
      if (!def || typeof def !== 'object') throw new Error('Tool definition must be an object');
      if (!def.name || typeof def.name !== 'string' || !def.name.trim()) throw new Error('Invalid tool name');
      const name = def.name.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error(`Invalid tool name "${name}". Only alphanumeric, underscore, and hyphen allowed.`);
      }
      if (typeof def.execute !== 'function') {
        throw new Error("Tool definition must include an async 'execute' function");
      }

      const entry = {
        name,
        description: def.description || '',
        parameters: def.parameters || { type: 'object', properties: {} },
        execute: def.execute
      };
      this._registry.set(name, entry);
      this.tools[name] = entry.execute;
      return entry;
    }

    unregisterTool(name) {
      if (!name) return false;
      const existed = this._registry.delete(name);
      delete this.tools[name];
      return existed;
    }

    getTool(name) {
      return this._registry.get(name) || null;
    }

    listTools() {
      return Array.from(this._registry.values());
    }

    validateParameters(schema, args) {
      if (!schema || typeof schema !== 'object') {
        return { valid: true, sanitized: args || {} };
      }
      const properties = schema.properties || {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      const sanitized = {};

      for (const reqField of required) {
        if (args === undefined || args === null || !(reqField in args) || args[reqField] === undefined || args[reqField] === null) {
          throw new Error(`Missing required parameter: "${reqField}"`);
        }
      }

      if (!args || typeof args !== 'object') {
        return { valid: true, sanitized: {} };
      }

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

    /**
     * Formats tools into Hermes 3 / Nous Research <tools> XML block containing JSON array of function specs.
     * @param {Array} [customTools]
     * @returns {string}
     */
    formatHermesTools(customTools) {
      const tools = Array.isArray(customTools) ? customTools : this.listTools();
      const payload = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} }
        }
      }));
      return `<tools>\n${JSON.stringify(payload, null, 2)}\n</tools>`;
    }

    /**
     * Formats tool execution result into structured Hermes 3 <tool_response> envelope.
     * @param {string} toolName
     * @param {any} result
     * @returns {string}
     */
    formatToolResponse(toolName, result) {
      let content = result;
      if (typeof result === 'string') {
        try {
          content = JSON.parse(result);
        } catch (_) {
          content = result;
        }
      }
      const envelope = {
        name: toolName || 'unknown',
        content: content !== undefined ? content : null
      };
      return `<tool_response>\n${JSON.stringify(envelope, null, 2)}\n</tool_response>`;
    }

    /**
     * Exports OpenAI-compatible tools array with { type: 'function', function: { ... } }.
     * @param {Array} [customTools]
     * @returns {Array}
     */
    formatOpenAITools(customTools) {
      const tools = Array.isArray(customTools) ? customTools : this.listTools();
      return tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} }
        }
      }));
    }

    _boundObservation(value, maxChars) {
      const limit = Math.max(256, Number(maxChars) || this.MAX_RESULT_LENGTH || 1500);
      let serialized;
      if (typeof value === 'string') {
        serialized = value;
      } else {
        try { serialized = JSON.stringify(value); } catch (_) { serialized = String(value); }
      }
      if (serialized.length <= limit) {
        return { value, text: serialized, truncated: false, originalLength: serialized.length };
      }
      const marker = `\n…[truncated ${serialized.length - limit} chars; use a narrower tool query]`;
      const text = serialized.slice(0, Math.max(0, limit - marker.length)) + marker;
      return { value: text, text, truncated: true, originalLength: serialized.length };
    }

    _normalizeDecision(rawDecision) {
      if (rawDecision === null || rawDecision === undefined) return null;
      if (typeof rawDecision === 'string') {
        const calls = MultiSyntaxParser.parse(rawDecision);
        if (calls.length > 0) return { type: 'tool', tool: calls[0].tool, args: calls[0].args || {} };
        return { type: 'final', content: rawDecision };
      }
      if (Array.isArray(rawDecision)) {
        return rawDecision.length > 0 ? this._normalizeDecision(rawDecision[0]) : null;
      }
      if (typeof rawDecision !== 'object') return null;
      if (rawDecision.type === 'final' || rawDecision.final === true || rawDecision.done === true) {
        return {
          type: 'final',
          content: rawDecision.content !== undefined
            ? String(rawDecision.content)
            : String(rawDecision.answer || rawDecision.message || '')
        };
      }
      const nativeCalls = rawDecision.tool_calls || rawDecision.toolCalls;
      if (Array.isArray(nativeCalls) && nativeCalls.length > 0) {
        const first = nativeCalls[0];
        const fn = first.function || first;
        let args = fn.arguments || fn.args || {};
        if (typeof args === 'string') {
          try { args = JsonAutoRepair.safeParse(args); } catch (_) { args = { raw: args }; }
        }
        return { type: 'tool', tool: fn.name || first.name, args: args || {} };
      }
      const toolName = rawDecision.tool || rawDecision.name || rawDecision.tool_name;
      if (toolName) {
        let args = rawDecision.args || rawDecision.arguments || rawDecision.parameters || rawDecision.params || {};
        if (typeof args === 'string') {
          try { args = JsonAutoRepair.safeParse(args); } catch (_) { args = { raw: args }; }
        }
        return { type: 'tool', tool: toolName, args: args || {}, thought: rawDecision.thought || '' };
      }
      if (rawDecision.content !== undefined || rawDecision.answer !== undefined) {
        return { type: 'final', content: String(rawDecision.content || rawDecision.answer || '') };
      }
      return null;
    }

    _awaitBounded(operation, timeoutMs, signal, label) {
      if (signal && signal.aborted) {
        const err = new Error(signal.reason ? String(signal.reason) : `${label} aborted`);
        err.code = 'ABORTED';
        return Promise.reject(err);
      }
      const timeout = Math.max(1, Number(timeoutMs) || 30000);
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort);
          fn(value);
        };
        const onAbort = () => {
          const err = new Error(signal.reason ? String(signal.reason) : `${label} aborted`);
          err.code = 'ABORTED';
          finish(reject, err);
        };
        const timer = setTimeout(() => {
          const err = new Error(`${label} timed out after ${timeout}ms`);
          err.code = 'TIMEOUT';
          finish(reject, err);
        }, timeout);
        if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve().then(operation).then(value => finish(resolve, value), err => finish(reject, err));
      });
    }

    attachHarness(harnessController, options = {}) {
      const facade = harnessController;
      const resolvedController = facade && facade.controller && typeof facade.controller.executeAction === 'function'
        ? facade.controller
        : harnessController;
      this.controller = resolvedController;
      this.harness = facade;

      const H = getHarnessComponents() || (resolvedController && resolvedController.constructor);

      this.vfs = options.vfs || (facade && facade.vfs) || (resolvedController && resolvedController.vfs) || (H && H.VfsSandbox ? new H.VfsSandbox() : null);
      this.trajectory = options.trajectory || (facade && facade.trajectory) || (resolvedController && resolvedController.trajectory) || (H && H.TrajectoryEngine ? new H.TrajectoryEngine() : null);
      this.checkpoints = options.checkpoints || (facade && (facade.checkpoints || facade.checkpoint)) || (resolvedController && (resolvedController.checkpoints || resolvedController.checkpointManager)) || (H && H.CheckpointManager ? new H.CheckpointManager({ vfs: this.vfs }) : null);
      this.eventBus = options.bus || (facade && facade.bus) || (resolvedController && resolvedController.bus) || (H && H.InterHarnessEventBus ? new H.InterHarnessEventBus() : null);

      // Wire RunawayGuardrails to prevent runaway failure loops (Requirement R3)
      const GuardrailsClass = (H && (H.RunawayGuardrails || H.GuardrailSentinel)) || (typeof RunawayGuardrails !== 'undefined' ? RunawayGuardrails : null);
      this.guardrails = options.guardrails || (facade && facade.guardrails) || (resolvedController && (resolvedController.guardrails || resolvedController.guardrail)) || this.guardrails || (GuardrailsClass ? new GuardrailsClass({
        vfs: this.vfs,
        maxConsecutiveFailures: this.maxConsecutiveFailures || 3
      }) : null);

      if (this.guardrails && this.vfs && !this.guardrails.vfs) {
        this.guardrails.vfs = this.vfs;
      }

      if (H && typeof H.registerAciTools === 'function') {
        H.registerAciTools(this);
      }
      return this;
    }

    on(event, handler) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(handler);
    }

    emit(event, data) {
      const handlers = this.listeners.get(event) || [];
      handlers.forEach(h => {
        try { h(data); } catch (e) { console.warn(`Error in event listener for ${event}:`, e); }
      });
    }

    async invokeAciTool(toolName, rawArgs) {
      if (!this.vfs) throw new Error('Harness VFS not attached');

      const H = getHarnessComponents();
      const AciInterfaceClass = (H && H.AciInterface) || (typeof AciInterface !== 'undefined' ? AciInterface : null);
      const AciSchemaValidatorClass = (H && H.AciSchemaValidator) || (typeof AciSchemaValidator !== 'undefined' ? AciSchemaValidator : null);
      const VfsDiffEngineClass = (H && H.VfsDiffEngine) || (typeof VfsDiffEngine !== 'undefined' ? VfsDiffEngine : null);

      const aci = AciInterfaceClass ? new AciInterfaceClass(this.vfs) : null;

      // Normalize parameters via static AciSchemaValidator
      const normalized = (AciSchemaValidatorClass && typeof AciSchemaValidatorClass.normalizeArgs === 'function')
        ? AciSchemaValidatorClass.normalizeArgs(toolName, rawArgs)
        : (rawArgs || {});

      // Pre-flight Diff Preview for code surgery
      if (toolName === 'replace_file_content' && normalized.preview !== false && VfsDiffEngineClass) {
        const targetPath = normalized.TargetFile || normalized.path;
        const targetText = typeof (normalized.TargetContent || normalized.targetContent) === 'string'
          ? (normalized.TargetContent || normalized.targetContent).normalize('NFC')
          : (normalized.TargetContent || normalized.targetContent);
        const replacementText = typeof (normalized.ReplacementContent || normalized.replacementContent) === 'string'
          ? (normalized.ReplacementContent || normalized.replacementContent).normalize('NFC')
          : (normalized.ReplacementContent || normalized.replacementContent);
        const preview = VfsDiffEngineClass.previewReplaceDiff(
          this.vfs,
          targetPath,
          targetText,
          replacementText,
          normalized
        );
        this.emit('diff_preview', preview);
      }

      // Execute on ACI or local tool registry
      let result;
      if (this.controller && typeof this.controller.executeAction === 'function' &&
          this.controller.aci && typeof this.controller.aci[toolName] === 'function') {
        result = await this.controller.executeAction(toolName, normalized);
      } else if (aci && typeof aci[toolName] === 'function') {
        result = await aci[toolName](normalized);
      } else if (this.tools && this.tools[toolName]) {
        result = await this.tools[toolName](normalized);
      } else {
        throw new Error(`Tool "${toolName}" not found`);
      }

      // Preserve invokeAciTool's public rejection contract. HarnessController
      // intentionally returns structured errors for direct low-level callers,
      // but agent-level callers historically rely on rejected promises for
      // correction, guardrails, and assert.rejects-compatible handling.
      if (result && result.status === 'error' && result.success === false) {
        const error = new Error(result.error || `Tool "${toolName}" failed`);
        error.code = result.code || 'TOOL_EXECUTION_ERROR';
        error.details = result;
        throw error;
      }

      // If file modified, emit vfs_change for Live Workspace synchronization
      if (toolName === 'replace_file_content' || (toolName === 'run_sandboxed_command' && rawArgs && rawArgs.CommandLine && rawArgs.CommandLine.includes('>'))) {
        const targetPath = normalized.TargetFile || normalized.path;
        if (targetPath && this.vfs && typeof this.vfs.exists === 'function' && this.vfs.exists(targetPath)) {
          const fileContent = this.vfs.readFile(targetPath);
          this.emit('vfs_change', { path: targetPath, content: fileContent });
        }
      }

      return result;
    }

    recordTrajectory(stepData) {
      if (this.trajectory && typeof this.trajectory.recordStep === 'function') {
        return this.trajectory.recordStep(stepData);
      }
      return null;
    }

    createCheckpoint(stepIndex) {
      if (this.checkpoints && typeof this.checkpoints.saveCheckpoint === 'function') {
        const idx = stepIndex !== undefined ? Number(stepIndex) : (this.trajectory ? this.trajectory.getEvents().length + 1 : 1);
        this._lastCheckpointStep = idx;
        return this.checkpoints.saveCheckpoint(idx, { workingMemory: Array.from(this.memory.workingMemory.entries()) });
      }
      return null;
    }

    rewindToCheckpoint(checkpointIdOrStep) {
      if (this.checkpoints && typeof this.checkpoints.rewind === 'function') {
        let stepIdx = checkpointIdOrStep;
        if (typeof checkpointIdOrStep === 'string' && checkpointIdOrStep.startsWith('chk_step_')) {
          const match = checkpointIdOrStep.match(/chk_step_(\d+)_/);
          if (match) stepIdx = Number(match[1]);
        }
        return this.checkpoints.rewind(stepIdx !== undefined ? Number(stepIdx) : this._lastCheckpointStep);
      }
      return null;
    }

    rewind(stepIndex) {
      const res = this.rewindToCheckpoint(stepIndex);
      this.emit('rewind_applied', { stepIndex });
      return res;
    }

    pause() {
      if (this.status === 'paused') return false;
      this.status = 'paused';
      this.emit('status_change', { status: 'paused' });
      return true;
    }

    resume() {
      if (this.status !== 'paused') return false;
      this.status = 'running';
      this.emit('status_change', { status: 'running' });
      return true;
    }

    steer(instruction) {
      if (!instruction || typeof instruction !== 'string' || !instruction.trim()) return false;
      const trimmed = instruction.trim();
      this.steerInstructions.push(trimmed);
      this.memory.setFact('latest_steer', trimmed);
      // Reset failure counter when human operator provides new direction
      this.consecutiveFailures = 0;
      this.haltReason = null;
      this.emit('steer_applied', { instruction: trimmed });
      return true;
    }

    async executeStep(promptOrStep, executionOptions = {}) {
      // 0. Circuit Breaker / Abort Pre-condition: refuse execution if already halted
      if (this.status === 'halted' || this.isAgentAborted) {
        return {
          status: 'halted',
          halted: true,
          reason: this.haltReason || 'Circuit breaker tripped: execution is halted.'
        };
      }

      this.status = 'running';
      this.emit('status_change', { status: 'running' });

      // Handle user steer intervention if queued
      if (this.steerInstructions.length > 0) {
        const steerText = this.steerInstructions.shift();
        this.memory.setFact('steered_intent', steerText);
      }

      let activeStep;
      let plan;
      let intent;

      // Check if promptOrStep is already an explicit step object with tool or action
      const isExplicitStep = promptOrStep && typeof promptOrStep === 'object' && (
        promptOrStep.tool ||
        promptOrStep.action ||
        (promptOrStep.step && (promptOrStep.step.tool || promptOrStep.step.action))
      );

      if (isExplicitStep) {
        const stepSource = promptOrStep.step || promptOrStep;
        const toolName = stepSource.tool || (stepSource.action && (stepSource.action.tool || stepSource.action.name));
        const rawParams = stepSource.params || stepSource.args || (stepSource.action && (stepSource.action.params || stepSource.action.args)) || {};
        const stepId = stepSource.id || 1;
        const stepName = stepSource.name || toolName || 'explicit_step';

        activeStep = {
          id: stepId,
          name: stepName,
          tool: toolName,
          params: rawParams
        };

        const thoughtHint = stepSource.thought || promptOrStep.thought || stepName;
        intent = this.brain.analyzeIntent(thoughtHint);
        plan = [activeStep];
      } else {
        const promptText = typeof promptOrStep === 'string'
          ? promptOrStep
          : (promptOrStep && (promptOrStep.thought || promptOrStep.prompt || promptOrStep.text)) || '';

        // 1. Cognitive Brain OODA: Analyze Intent
        intent = this.brain.analyzeIntent(promptText);

        // 2. Cognitive Brain OODA: Plan Hierarchy (with promptText for dynamic extraction)
        plan = this.brain.planHierarchy(intent, promptText);
        activeStep = (plan && plan[0]) || { id: 1, name: 'default_step', tool: 'view_file', params: { path: 'index.html' } };
      }

      // 3. Cognitive Brain OODA: Extended Thinking
      const thoughtText = this.brain.thinkExtended(activeStep, intent);
      this.emit('thinking_start', { step: activeStep.id });
      this.emit('thought_chunk', { chunk: thoughtText });
      this.emit('thinking_end', { thought: thoughtText });

      // Check pause state
      if (this.status === 'paused') {
        return { status: 'paused', step: activeStep };
      }

      // 4. Cognitive Brain OODA: Tool Execution
      let toolResult;
      let isError = false;
      const startTime = Date.now();
      try {
        toolResult = await this.invokeAciTool(activeStep.tool, activeStep.params);
        if (toolResult && (
          toolResult.status === 'error' ||
          toolResult.status === 'ERROR' ||
          toolResult.status === 'failed' ||
          toolResult.error ||
          toolResult.success === false
        )) {
          isError = true;
        }
      } catch (err) {
        isError = true;
        toolResult = { status: 'error', error: err.message };
      }
      const durationMs = Date.now() - startTime;
      const boundedObservation = this._boundObservation(toolResult, executionOptions.maxObservationChars);
      toolResult = boundedObservation.value;

      // 5. Cognitive Brain OODA: Observation Reflection
      const reflection = this.brain.reflectObservation(activeStep, toolResult, intent);
      const reflectionText = (reflection && (reflection.reflection || reflection.reflectionText)) || 'Reflection completed cleanly';

      // 6. Trajectory & Memory Envelope Recording
      const stepIdx = this.trajectory ? this.trajectory.getEvents().length + 1 : 1;
      const stepEnvelope = {
        agent_id: this.id,
        role: this.role,
        step_index: stepIdx,
        step: stepIdx,
        thought: thoughtText,
        plan: plan,
        action: { tool: activeStep.tool, params: activeStep.params },
        observation: toolResult,
        reflection: reflectionText,
        metadata: { reflection: reflectionText, plan: plan },
        status: isError ? 'failed' : 'success',
        metrics: { durationMs, tokensConsumed: Math.max(1, Math.ceil(thoughtText.length / 4)) }
      };

      if (this.trajectory) {
        this.trajectory.recordStep(stepEnvelope);
      }
      this.memory.recordEpisode(stepEnvelope);

      // 7. Guardrails & Circuit Breaker Evaluation (Requirement R3)
      if (isError) {
        this.consecutiveFailures = (this.consecutiveFailures || 0) + 1;
        let guardCheck = null;
        if (this.guardrails && typeof this.guardrails.recordFailure === 'function') {
          guardCheck = this.guardrails.recordFailure(activeStep.tool, activeStep.params);
        }

        const maxFailures = this.maxConsecutiveFailures || 3;
        if (this.consecutiveFailures >= maxFailures || (guardCheck && guardCheck.halted)) {
          const haltReason = (guardCheck && guardCheck.reason) ||
            `Consecutive step failures reached limit (${this.consecutiveFailures}/${maxFailures})`;
          this.status = 'halted';
          this.isAgentAborted = true;
          this.haltReason = haltReason;
          this.emit('circuit_breaker_tripped', {
            consecutiveFailures: this.consecutiveFailures,
            tool: activeStep.tool,
            params: activeStep.params,
            reason: haltReason
          });
          this.emit('status_change', { status: 'halted', reason: haltReason });
        }
      } else {
        // Step succeeded: reset consecutive failures counter
        this.consecutiveFailures = 0;
        this.haltReason = null;
        if (this.guardrails) {
          if (typeof this.guardrails.recordSuccess === 'function') {
            this.guardrails.recordSuccess(activeStep.tool, activeStep.params);
          }
          if (typeof this.guardrails.recordAction === 'function') {
            const actionCheck = this.guardrails.recordAction(activeStep.tool, activeStep.params);
            if (actionCheck && actionCheck.halted) {
              this.status = 'halted';
              this.isAgentAborted = true;
              this.haltReason = actionCheck.reason;
              this.emit('circuit_breaker_tripped', {
                reason: actionCheck.reason,
                condition: 'loop_oscillation'
              });
              this.emit('status_change', { status: 'halted', reason: actionCheck.reason });
            }
          }
          if (this.vfs && typeof this.guardrails.recordTurnModification === 'function' &&
              (activeStep.tool === 'replace_file_content' || (activeStep.tool === 'run_sandboxed_command' && activeStep.params && activeStep.params.CommandLine && activeStep.params.CommandLine.includes('>')))) {
            const vfsCheck = this.guardrails.recordTurnModification(this.vfs);
            if (vfsCheck && vfsCheck.halted) {
              this.status = 'halted';
              this.isAgentAborted = true;
              this.haltReason = vfsCheck.reason;
              this.emit('circuit_breaker_tripped', {
                reason: vfsCheck.reason,
                condition: 'stagnant_vfs'
              });
              this.emit('status_change', { status: 'halted', reason: vfsCheck.reason });
            }
          }
        }
      }

      // 8. Lifecycle State Resolution: Only transition to idle if still running
      if (this.status === 'running') {
        this.status = 'idle';
        this.emit('status_change', { status: 'idle' });
      }

      return {
        step: activeStep,
        thought: thoughtText,
        observation: toolResult,
        reflection,
        status: stepEnvelope.status,
        observationTruncated: boundedObservation.truncated,
        observationOriginalLength: boundedObservation.originalLength,
        halted: this.status === 'halted',
        reason: this.haltReason || undefined
      };
    }

    async executeTool(name, args, context) {
      const tool = this.getTool(name);
      if (!tool) {
        throw new Error(`Tool "${name}" not found in SunaAgent registry.`);
      }
      const { sanitized } = this.validateParameters(tool.parameters, args);
      return await tool.execute(sanitized, context);
    }

    /**
     * Observation-grounded autonomous execution engine. A caller-provided decision
     * provider may be a local model, remote LLM, or deterministic policy. Explicit
     * plans are also supported for low-resource, reproducible execution.
     */
    async run(prompt, options = {}) {
      const maxTurns = Math.max(1, Number(options.maxTurns || (this.controller && this.controller.maxTurns) || 10));
      const decisionProvider = options.decideNextAction || options.decisionProvider || null;
      const explicitPlan = Array.isArray(options.plan) ? options.plan.slice() : null;
      if (!decisionProvider && !explicitPlan) return this._runLegacy(prompt, options);

      const signal = options.signal || null;
      const decisionTimeoutMs = options.decisionTimeoutMs || 30000;
      const maxObservationChars = options.maxObservationChars || this.MAX_RESULT_LENGTH;
      const turnResults = [];
      let turn = 0;
      let planIndex = 0;
      let finalStatus = 'completed';
      let finalAnswer = '';
      let verification = null;

      while (turn < maxTurns) {
        if ((signal && signal.aborted) || this.isAgentAborted || this.status === 'halted') {
          finalStatus = signal && signal.aborted ? 'aborted' : 'halted';
          break;
        }

        let decision;
        if (explicitPlan) {
          if (planIndex >= explicitPlan.length) break;
          const planned = explicitPlan[planIndex++];
          decision = {
            type: 'tool',
            tool: planned.tool || (planned.action && (planned.action.tool || planned.action.name)),
            args: planned.args || planned.params || (planned.action && (planned.action.args || planned.action.params)) || {},
            id: planned.id,
            name: planned.name,
            thought: planned.thought
          };
        } else {
          const lastResult = turnResults.length > 0 ? turnResults[turnResults.length - 1] : null;
          const lastBounded = lastResult
            ? this._boundObservation(lastResult.observation, maxObservationChars)
            : { text: '', truncated: false, originalLength: 0 };
          const context = {
            prompt,
            turn: turn + 1,
            maxTurns,
            tools: this.formatOpenAITools(),
            lastObservation: lastResult ? {
              status: lastResult.status,
              tool: lastResult.step && lastResult.step.tool,
              result: lastBounded.text,
              truncated: lastBounded.truncated,
              originalLength: lastBounded.originalLength
            } : null,
            trajectory: turnResults.slice(-5).map(item => ({
              tool: item.step && item.step.tool,
              status: item.status,
              reflection: item.reflection && (item.reflection.reflection || item.reflection.reflectionText)
            })),
            memoryStateHash: this.memory && typeof this.memory.getStateHash === 'function' ? this.memory.getStateHash() : null,
            steer: this.steerInstructions.length > 0 ? this.steerInstructions.shift() : null
          };
          try {
            const rawDecision = await this._awaitBounded(
              () => decisionProvider(context), decisionTimeoutMs, signal, 'Agent decision'
            );
            decision = this._normalizeDecision(rawDecision);
          } catch (err) {
            finalStatus = err && err.code === 'ABORTED' ? 'aborted' : (err && err.code === 'TIMEOUT' ? 'timeout' : 'decision_error');
            this.haltReason = err.message;
            break;
          }
        }

        if ((signal && signal.aborted) || this.isAgentAborted || this.status === 'halted') {
          finalStatus = signal && signal.aborted ? 'aborted' : 'halted';
          break;
        }
        if (!decision || !decision.tool && decision.type !== 'final') {
          finalStatus = 'decision_error';
          this.haltReason = 'Decision provider returned no executable action or final answer.';
          break;
        }
        if (decision.type === 'final') {
          finalAnswer = decision.content || '';
          break;
        }

        turn++;
        if (typeof options.onTurnStart === 'function') {
          try { options.onTurnStart(turn); } catch (_) {}
        }
        const stepResult = await this.executeStep({
          id: decision.id || turn,
          name: decision.name || decision.tool,
          tool: decision.tool,
          args: decision.args || {},
          thought: decision.thought || ''
        }, { maxObservationChars });
        turnResults.push(stepResult);
        if (typeof options.onStep === 'function') {
          try { options.onStep(stepResult, turn); } catch (_) {}
        }
        if (stepResult.halted || this.status === 'halted' || this.isAgentAborted) {
          finalStatus = 'halted';
          break;
        }
        if (explicitPlan && stepResult.status !== 'success' && options.continueOnError !== true) {
          finalStatus = 'failed';
          break;
        }
      }

      if (turn >= maxTurns && !finalAnswer && (!explicitPlan || planIndex < explicitPlan.length)) {
        finalStatus = 'max_turns_exceeded';
      }

      if (['completed', 'max_turns_exceeded'].includes(finalStatus) && typeof options.verify === 'function') {
        try {
          const rawVerification = await this._awaitBounded(
            () => options.verify({ prompt, results: turnResults, finalAnswer, agent: this, vfs: this.vfs }),
            options.verificationTimeoutMs || decisionTimeoutMs,
            signal,
            'Completion verification'
          );
          verification = typeof rawVerification === 'object' && rawVerification !== null
            ? Object.assign({ passed: Boolean(rawVerification.passed !== undefined ? rawVerification.passed : rawVerification.success) }, rawVerification)
            : { passed: Boolean(rawVerification), reason: rawVerification ? '' : 'Completion verifier rejected the result.' };
          if (!verification.passed) finalStatus = 'verification_failed';
          else if (finalStatus === 'max_turns_exceeded') finalStatus = 'completed';
        } catch (err) {
          verification = { passed: false, reason: err.message };
          finalStatus = err && err.code === 'ABORTED' ? 'aborted' : 'verification_failed';
        }
      } else if (finalStatus === 'completed') {
        verification = { passed: true, reason: explicitPlan ? 'Executable plan completed.' : 'Decision provider returned a final answer.' };
      }

      const result = {
        status: finalStatus,
        turnsExecuted: turn,
        results: turnResults,
        finalAnswer,
        verified: verification ? verification.passed : false,
        verification,
        trajectory: (this.trajectory && typeof this.trajectory.getEvents === 'function') ? this.trajectory.getEvents() : [],
        haltReason: this.haltReason || null
      };
      if (typeof options.onComplete === 'function') {
        try { options.onComplete(result); } catch (_) {}
      }
      return result;
    }

    async _runLegacy(prompt, options = {}) {
      const maxTurns = options.maxTurns || (this.controller && this.controller.maxTurns) || 10;
      let turn = 0;
      let finalStatus = 'completed';
      const turnResults = [];
      while (turn < maxTurns) {
        turn++;
        if (this.isAgentAborted || this.status === 'halted') {
          finalStatus = 'halted';
          break;
        }
        if (typeof options.onTurnStart === 'function') {
          try { options.onTurnStart(turn); } catch (_) {}
        }
        let currentPrompt = prompt;
        const latestSteer = this.memory && typeof this.memory.getFact === 'function' && this.memory.getFact('latest_steer');
        if (latestSteer) currentPrompt = `${prompt}\n[User Steer Guidance]: ${latestSteer}`;
        const stepResult = await this.executeStep(currentPrompt, { maxObservationChars: options.maxObservationChars });
        turnResults.push(stepResult);
        if (typeof options.onStep === 'function') {
          try { options.onStep(stepResult, turn); } catch (_) {}
        }
        if (stepResult.halted || this.status === 'halted' || this.isAgentAborted) {
          finalStatus = 'halted';
          break;
        }
        const reflection = stepResult.reflection;
        if (reflection && reflection.satisfied === false && reflection.replanNeeded) {
          if (turn >= maxTurns) finalStatus = 'max_turns_exceeded';
          continue;
        }
        finalStatus = 'completed';
        break;
      }
      const result = {
        status: finalStatus,
        turnsExecuted: turn,
        results: turnResults,
        trajectory: (this.trajectory && typeof this.trajectory.getEvents === 'function') ? this.trajectory.getEvents() : [],
        haltReason: this.haltReason || null
      };
      if (typeof options.onComplete === 'function') {
        try { options.onComplete(result); } catch (_) {}
      }
      return result;
    }

    /**
     * Orchestrates multi-agent team collaboration across pipeline, hub-spoke, or mesh topologies.
     * @param {object} options
     * @returns {Promise<object>}
     */
    async collaborate(options = {}) {
      const prompt = options.prompt || '';
      const subagentsConfig = options.subagents || [];
      const topology = options.topology || 'pipeline';
      const teamTrajectory = [];
      const participants = [];

      if (this.eventBus && typeof this.eventBus.publish === 'function') {
        this.eventBus.publish('team:broadcast', {
          type: 'collaboration_start',
          prompt,
          topology,
          subagentsCount: subagentsConfig.length
        });
      }

      for (let i = 0; i < subagentsConfig.length; i++) {
        const config = subagentsConfig[i];
        const role = config.role || `worker_${i + 1}`;
        const budget = config.budget || 2;
        const subVfsMode = config.vfsWorkspaceMode || 'share';

        let subVfs = this.vfs;
        if (subVfsMode === 'branch' && this.vfs && typeof this.vfs.clone === 'function') {
          subVfs = this.vfs.clone();
        }

        const subagent = new SunaAgent({
          id: `${this.id}_${role}`,
          role: role
        });

        if (this.controller) {
          subagent.attachHarness(this.controller, { vfs: subVfs });
        } else {
          subagent.vfs = subVfs;
          subagent.trajectory = this.trajectory;
          subagent.eventBus = this.eventBus;
        }

        const rolePrompt = `[Role: ${role}] Task: ${prompt}`;
        const runRes = await subagent.run(rolePrompt, { maxTurns: budget });

        participants.push({
          id: subagent.id,
          role: role,
          status: runRes.status,
          turnsExecuted: runRes.turnsExecuted
        });

        const subEvents = (runRes.results && runRes.results.length > 0)
          ? runRes.results.map((r, idx) => ({
              agent_id: subagent.id,
              role: role,
              step_index: idx + 1,
              thought: r.thought,
              action: r.step,
              observation: r.observation,
              status: r.status
            }))
          : [{ agent_id: subagent.id, role: role, step_index: 1, status: 'success' }];
        teamTrajectory.push(...subEvents);

        if (this.eventBus && typeof this.eventBus.publish === 'function') {
          this.eventBus.publish('team:broadcast', {
            type: 'agent_turn_completed',
            role,
            status: runRes.status
          });
        }
      }

      return {
        status: 'completed',
        topology,
        participants,
        teamTrajectory
      };
    }

    /**
     * Cleanly releases all memory references, listeners, and resets status for low-end hardware.
     */
    destroy() {
      this.status = 'destroyed';
      this.isAgentAborted = true;
      if (this.memory) {
        if (this.memory.workingMemory && typeof this.memory.workingMemory.clear === 'function') {
          this.memory.workingMemory.clear();
        }
        if (this.memory.episodicMemory && Array.isArray(this.memory.episodicMemory)) {
          this.memory.episodicMemory = [];
        }
      }
      if (this.listeners && typeof this.listeners.clear === 'function') {
        this.listeners.clear();
      }
      if (this._registry && typeof this._registry.clear === 'function') {
        this._registry.clear();
      }
      this.vfs = null;
      this.trajectory = null;
      this.controller = null;
      this.harness = null;
    }
  }

  // Strict Public Constants and Invariants
  SunaAgent.MAX_RECURSION_DEPTH = 4;
  SunaAgent.MAX_RESULT_LENGTH = 1500;
  SunaAgent.MOODS_WHITELIST = ['calm', 'excited', 'sad', 'stressed', 'creative'];
  SunaAgent.THEMES_WHITELIST = ['aurora', 'sunset', 'ocean', 'forest', 'midnight'];

  // Static Registry & Tool Container for Static/Facade usage
  SunaAgent._registry = new Map();
  SunaAgent.tools = {};

  SunaAgent.registerTool = function (def) {
    if (!def || typeof def !== 'object') throw new Error('Tool definition must be an object');
    if (!def.name || typeof def.name !== 'string' || !def.name.trim()) throw new Error('Invalid tool name');
    const name = def.name.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(`Invalid tool name "${name}". Only alphanumeric, underscore, and hyphen allowed.`);
    }
    if (typeof def.execute !== 'function') {
      throw new Error("Tool definition must include an async 'execute' function");
    }

    const entry = {
      name,
      description: def.description || '',
      parameters: def.parameters || { type: 'object', properties: {} },
      execute: def.execute
    };
    SunaAgent._registry.set(name, entry);
    SunaAgent.tools[name] = entry.execute;
    return entry;
  };

  SunaAgent.unregisterTool = function (name) {
    if (!name) return false;
    const existed = SunaAgent._registry.delete(name);
    delete SunaAgent.tools[name];
    return existed;
  };

  SunaAgent.getTool = function (name) {
    return SunaAgent._registry.get(name) || null;
  };

  SunaAgent.listTools = function () {
    return Array.from(SunaAgent._registry.values());
  };

  SunaAgent.validateParameters = function (schema, args) {
    return SunaAgent.prototype.validateParameters.call(SunaAgent, schema, args);
  };

  SunaAgent.generatePromptDocs = function () {
    return SunaAgent.prototype.generatePromptDocs.call(SunaAgent);
  };

  SunaAgent.executeTool = function (name, args, context) {
    return SunaAgent.prototype.executeTool.call(SunaAgent, name, args, context);
  };

  SunaAgent.formatHermesTools = function (customTools) {
    return SunaAgent.prototype.formatHermesTools.call(SunaAgent, customTools);
  };

  SunaAgent.formatToolResponse = function (toolName, result) {
    return SunaAgent.prototype.formatToolResponse.call(SunaAgent, toolName, result);
  };

  SunaAgent.formatOpenAITools = function (customTools) {
    return SunaAgent.prototype.formatOpenAITools.call(SunaAgent, customTools);
  };

  SunaAgent.run = async function (prompt, options) {
    const agent = new SunaAgent();
    return await agent.run(prompt, options);
  };

  SunaAgent.collaborate = async function (options) {
    const agent = new SunaAgent();
    return await agent.collaborate(options);
  };

  // Initialize static legacy tools
  const staticLegacy = [
    {
      name: 'change_lofi_mood',
      description: 'Changes background Lofi music mood.',
      parameters: { type: 'object', properties: { mood: { type: 'string', enum: SunaAgent.MOODS_WHITELIST } }, required: ['mood'] },
      execute: async (args) => ({ status: 'success', mood: args ? args.mood : 'calm' })
    },
    {
      name: 'speak_message',
      description: 'Speaks a message aloud via text-to-speech.',
      parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
      execute: async (args) => ({ status: 'success', text: args ? (args.message || args.text) : '' })
    },
    {
      name: 'save_note_to_firestore',
      description: 'Saves a note to Firestore or local storage.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['content'] },
      execute: async (args) => ({ status: 'success', noteId: 'note_' + Date.now(), note: args })
    },
    {
      name: 'get_system_state',
      description: 'Retrieves current system state and context.',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ status: 'success', state: {} })
    },
    {
      name: 'update_user_profile',
      description: 'Updates user profile preferences.',
      parameters: { type: 'object', properties: { userName: { type: 'string' }, theme: { type: 'string' } } },
      execute: async (args) => ({ status: 'success', profile: args || {} })
    },
    {
      name: 'sandbox_exec',
      description: 'Execute JavaScript code in sandboxed VM evaluator.',
      parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      execute: async (args) => ({ status: 'success', code: args ? args.code : '' })
    }
  ];
  staticLegacy.forEach(t => SunaAgent.registerTool(t));

  return SunaAgent;
}));
