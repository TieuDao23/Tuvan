/**
 * ADVERSARIAL STRESS TEST & FUZZING SUITE FOR MILESTONE 2: AciSchemaValidator
 * 
 * Target: AciSchemaValidator & Pre-Execution VFS Protection
 * Verifier: challenger_m2_2 (Adversarial Verifier)
 * 
 * Test Categories:
 * 1. Prototype Pollution Attacks & Object Prototype Inviolability
 * 2. ReDoS Catastrophic Backtracking Patterns & Regex Safety Fuzzing
 * 3. Numerical Boundaries, Inverted Ranges, Floats, Negative & String Coercions
 * 4. Parameter Alias Conversions & Bidirectional Key Mirroring
 * 5. Pre-Execution Validation Prevents Virtual File System (VFS) Mutation
 * 6. High-Throughput Randomized Schema Fuzzing (2,000 Iterations)
 */

const assert = require('assert');
const {
  SunaHarness,
  AciSchemaValidator,
  VfsSandbox,
  AciInterface,
  HarnessController,
  isDangerousReDosRegex
} = require('../suna_harness');

describe('CHALLENGER M2: Adversarial Stress Test & Fuzzing (AciSchemaValidator)', function () {
  this.timeout(15000);

  let vfs;
  let aci;
  let controller;

  beforeEach(() => {
    vfs = new VfsSandbox();
    aci = new AciInterface(vfs);
    controller = new HarnessController({ vfs, maxTurns: 10 });
  });

  // =========================================================================
  // 1. PROTOTYPE POLLUTION ATTACKS & OBJECT INTEGRITY
  // =========================================================================
  describe('1. Prototype Pollution Attacks & Object Inviolability', () => {
    afterEach(() => {
      // Ensure prototype is never left corrupted
      delete Object.prototype.polluted;
      delete Object.prototype.isAdmin;
      delete Object.prototype.injectedKey;
      delete Object.prototype.evilPayload;
    });

    it('ADV-PROTO-01: Direct __proto__ JSON attack should not pollute Object.prototype', () => {
      const payload = JSON.parse('{"__proto__": {"polluted": "pwned"}, "path": "safe.js"}');
      const res = AciSchemaValidator.validate('view_file', payload);

      assert.strictEqual(res.valid, true);
      assert.strictEqual(Object.prototype.polluted, undefined, 'Object.prototype must not have polluted property');
      assert.strictEqual({}.polluted, undefined, 'Fresh object must not inherit polluted property');
      assert.strictEqual(res.normalizedArgs.polluted, undefined);
    });

    it('ADV-PROTO-02: constructor.prototype attack should not pollute Object.prototype', () => {
      const payload = {
        constructor: {
          prototype: {
            isAdmin: true
          }
        },
        path: 'auth.js'
      };
      const res = AciSchemaValidator.validate('view_file', payload);

      assert.strictEqual(res.valid, true);
      assert.strictEqual(Object.prototype.isAdmin, undefined, 'Object.prototype.isAdmin must remain undefined');
      assert.strictEqual({}.isAdmin, undefined);
    });

    it('ADV-PROTO-03: Object.defineProperty enumerable __proto__ attack', () => {
      const raw = { path: 'index.html' };
      Object.defineProperty(raw, '__proto__', {
        value: { evilPayload: 'danger' },
        enumerable: true,
        configurable: true
      });

      const sanitized = AciSchemaValidator.sanitizeArgs(raw);
      assert.strictEqual(Object.prototype.evilPayload, undefined);
      assert.strictEqual(sanitized.__proto__, Object.prototype);
    });

    it('ADV-PROTO-04: Object with null prototype (Object.create(null)) should validate safely', () => {
      const nullProtoObj = Object.create(null);
      nullProtoObj.path = 'readme.md';
      nullProtoObj.startLine = 1;

      const res = AciSchemaValidator.validate('view_file', nullProtoObj);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.normalizedArgs.path, 'readme.md');
      assert.strictEqual(res.normalizedArgs.startLine, 1);
    });

    it('ADV-PROTO-05: Deeply nested objects in array properties should not pollute prototypes', () => {
      const payload = {
        query: 'test',
        includes: ['src/**/*.js'],
        extraMeta: {
          __proto__: { injectedKey: 'bad' },
          nested: { constructor: { prototype: { injectedKey: 'bad' } } }
        }
      };

      const res = AciSchemaValidator.validate('grep_search', payload);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(Object.prototype.injectedKey, undefined);
    });

    it('ADV-PROTO-06: Overriding Object methods (toString, hasOwnProperty, valueOf) in args must not crash validator', () => {
      const nastyArgs = {
        path: 'test.js',
        toString: 'not-a-function',
        hasOwnProperty: 12345,
        valueOf: null
      };

      assert.doesNotThrow(() => {
        const res = AciSchemaValidator.validate('view_file', nastyArgs);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.normalizedArgs.path, 'test.js');
      });
    });
  });

  // =========================================================================
  // 2. REDOS CATASTROPHIC BACKTRACKING & REGEX SAFETY FUZZING
  // =========================================================================
  describe('2. ReDoS Catastrophic Backtracking & Regex Safety', () => {
    const dangerousPatterns = [
      '(a+)+$',
      '(a*)*$',
      '(a+)*$',
      '(a*)+$',
      '(x{1,})+$',
      '([0-9]+)+',
      '(a|a)+',
      '(a|b|a)+',
      '((a+))+',
      '( a+ ) +',
      '(?:a+)+',
      'a++',
      'a**',
      '(foo|bar|foo)+',
      '(test|sample|test)+',
      '([a-zA-Z]+)*'
    ];

    dangerousPatterns.forEach((pattern, idx) => {
      it(`ADV-REDOS-${String(idx + 1).padStart(2, '0')}: should detect and reject ReDoS pattern: "${pattern}"`, () => {
        const isDangerous = isDangerousReDosRegex(pattern);
        assert.strictEqual(isDangerous, true, `Pattern "${pattern}" must be recognized as dangerous`);

        const res = AciSchemaValidator.validate('grep_search', {
          query: pattern,
          isRegex: true
        });
        assert.strictEqual(res.valid, false, `Schema validation must reject dangerous regex "${pattern}"`);
        assert.ok(res.errors.some(e => e.keyword === 'redos'), `Error must be tagged with keyword redos`);
        assert.ok(res.diagnostic.includes('ReDoS vulnerability detected'));
      });
    });

    it('ADV-REDOS-SAFE-01: Valid complex regexes must not trigger false positive ReDoS flags', () => {
      const safePatterns = [
        '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$', // Email
        '^\\d{4}-\\d{2}-\\d{2}$',                            // ISO Date
        'function\\s+([a-zA-Z0-9_$]+)\\s*\\(',               // Function decl
        '(apple|banana|cherry)',                             // Unique alternation
        'const\\s+[a-zA-Z_]\\w*\\s*=',                       // Variable assignment
        '\\[([0-9]+)\\]'                                     // Array indexing
      ];

      for (const pattern of safePatterns) {
        const res = AciSchemaValidator.validate('grep_search', {
          query: pattern,
          isRegex: true
        });
        assert.strictEqual(res.valid, true, `Safe regex "${pattern}" should not be rejected, errors: ${JSON.stringify(res.errors)}`);
      }
    });

    it('ADV-REDOS-LITERAL-01: ReDoS patterns must be ALLOWED when isRegex is false (literal search)', () => {
      const res = AciSchemaValidator.validate('grep_search', {
        query: '(a+)+$',
        isRegex: false
      });
      assert.strictEqual(res.valid, true, 'Literal string search must allow regex-like characters');
      assert.strictEqual(res.normalizedArgs.query, '(a+)+$');
    });

    it('ADV-REGEX-SYNTAX-01: Invalid regex syntax must be rejected gracefully without unhandled exceptions', () => {
      const invalidSyntaxList = [
        '[unclosed-bracket',
        '(unclosed-parenthesis',
        '+dangling-plus',
        '*dangling-star',
        '{5,2}', // invalid quantifier range (min > max)
        '(?<=lookbehind-error(?<'
      ];

      for (const badSyntax of invalidSyntaxList) {
        const res = AciSchemaValidator.validate('grep_search', {
          query: badSyntax,
          isRegex: true
        });
        assert.strictEqual(res.valid, false, `Invalid regex "${badSyntax}" must be marked invalid`);
        assert.ok(res.errors.some(e => e.keyword === 'syntax'), `Must flag syntax error for "${badSyntax}"`);
        assert.ok(res.diagnostic.includes('Invalid regular expression syntax'));
      }
    });

    it('ADV-REDOS-EXEC-01: Catastrophic backtracking string executed on AciInterface must not hang', () => {
      vfs.writeFile('log.txt', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab'); // Classic ReDoS payload
      
      const start = Date.now();
      const res = aci.execute('grep_search', {
        query: '(a+)+$',
        isRegex: true,
        searchPath: 'log.txt'
      });
      const elapsed = Date.now() - start;

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.ok(elapsed < 100, `Execution must fail instantaneously (<100ms), took ${elapsed}ms`);
    });
  });

  // =========================================================================
  // 3. NUMERICAL BOUNDARIES, INVERTED RANGES, FLOATS, NEGATIVE & COERCIONS
  // =========================================================================
  describe('3. Numerical Boundaries, Inverted Ranges, Floats & Coercions', () => {
    it('ADV-NUM-01: Inverted line ranges (startLine > endLine) must be rejected across tools', () => {
      // view_file
      const resView = AciSchemaValidator.validate('view_file', {
        path: 'src/index.js',
        startLine: 100,
        endLine: 10
      });
      assert.strictEqual(resView.valid, false);
      assert.ok(resView.errors.some(e => e.keyword === 'range'));

      // replace_file_content
      const resRepl = AciSchemaValidator.validate('replace_file_content', {
        path: 'src/index.js',
        targetContent: 'old',
        replacementContent: 'new',
        startLine: 50,
        endLine: 49
      });
      assert.strictEqual(resRepl.valid, false);
      assert.ok(resRepl.errors.some(e => e.keyword === 'range'));
    });

    it('ADV-NUM-02: Single-line range (startLine === endLine) must be accepted as valid', () => {
      const res = AciSchemaValidator.validate('replace_file_content', {
        path: 'src/index.js',
        targetContent: 'line5Content',
        replacementContent: 'new5Content',
        startLine: 5,
        endLine: 5
      });
      assert.strictEqual(res.valid, true, `startLine === endLine is a valid single-line slice`);
      assert.strictEqual(res.normalizedArgs.startLine, 5);
      assert.strictEqual(res.normalizedArgs.endLine, 5);
    });

    it('ADV-NUM-03: Floats and non-integers for line numbers must be strictly rejected', () => {
      const testCases = [
        { startLine: 1.5, endLine: 10 },
        { startLine: 1, endLine: 8.999 },
        { startLine: Math.PI, endLine: 10 },
        { startLine: 1e-3, endLine: 5 }
      ];

      for (const tc of testCases) {
        const res = AciSchemaValidator.validate('view_file', {
          path: 'math.js',
          ...tc
        });
        assert.strictEqual(res.valid, false, `Float line numbers must be rejected: ${JSON.stringify(tc)}`);
        assert.ok(res.errors.some(e => e.keyword === 'type'));
      }
    });

    it('ADV-NUM-04: String floats (e.g. "3.14") must not be coerced to integers and must be rejected', () => {
      const res = AciSchemaValidator.validate('view_file', {
        path: 'calc.js',
        startLine: '3.14',
        endLine: '10'
      });
      assert.strictEqual(res.valid, false, 'String float "3.14" should NOT be coerced to integer 3');
      assert.ok(res.errors.some(e => e.keyword === 'type'));
    });

    it('ADV-NUM-05: Negative and zero line numbers must be rejected with minimum violation', () => {
      const badLines = [0, -1, -50, -99999];
      for (const bl of badLines) {
        const res = AciSchemaValidator.validate('view_file', {
          path: 'app.js',
          startLine: bl
        });
        assert.strictEqual(res.valid, false, `Line ${bl} must be rejected`);
        assert.ok(res.errors.some(e => e.keyword === 'minimum'));
      }
    });

    it('ADV-NUM-06: Special numeric values (NaN, Infinity, -Infinity) must be rejected', () => {
      const specials = [NaN, Infinity, -Infinity];
      for (const special of specials) {
        const res = AciSchemaValidator.validate('view_file', {
          path: 'app.js',
          startLine: special
        });
        assert.strictEqual(res.valid, false, `Numeric special ${special} must be rejected`);
        assert.ok(res.errors.some(e => e.keyword === 'type'));
      }
    });

    it('ADV-NUM-07: Valid numeric string integers must be safely coerced to integer numbers', () => {
      const res = AciSchemaValidator.validate('view_file', {
        path: 'app.js',
        startLine: ' 42 ',
        endLine: ' 100 '
      });
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.normalizedArgs.startLine, 42);
      assert.strictEqual(typeof res.normalizedArgs.startLine, 'number');
      assert.strictEqual(res.normalizedArgs.endLine, 100);
      assert.strictEqual(typeof res.normalizedArgs.endLine, 'number');
    });

    it('ADV-NUM-08: timeoutMs bounds on run_sandboxed_command (min: 1, max: 60000)', () => {
      // 0 -> below min
      assert.strictEqual(AciSchemaValidator.validate('run_sandboxed_command', { commandLine: 'ls', timeoutMs: 0 }).valid, false);
      // -1 -> below min
      assert.strictEqual(AciSchemaValidator.validate('run_sandboxed_command', { commandLine: 'ls', timeoutMs: -1 }).valid, false);
      // 60001 -> above max
      assert.strictEqual(AciSchemaValidator.validate('run_sandboxed_command', { commandLine: 'ls', timeoutMs: 60001 }).valid, false);
      // 1 -> valid
      assert.strictEqual(AciSchemaValidator.validate('run_sandboxed_command', { commandLine: 'ls', timeoutMs: 1 }).valid, true);
      // 60000 -> valid
      assert.strictEqual(AciSchemaValidator.validate('run_sandboxed_command', { commandLine: 'ls', timeoutMs: 60000 }).valid, true);
    });

    it('ADV-NUM-09: contentOffset bounds on view_file (min: 0)', () => {
      // 0 -> valid
      assert.strictEqual(AciSchemaValidator.validate('view_file', { path: 'a.txt', contentOffset: 0 }).valid, true);
      // -1 -> invalid
      assert.strictEqual(AciSchemaValidator.validate('view_file', { path: 'a.txt', contentOffset: -1 }).valid, false);
      // 1024 -> valid
      assert.strictEqual(AciSchemaValidator.validate('view_file', { path: 'a.txt', contentOffset: 1024 }).valid, true);
    });
  });

  // =========================================================================
  // 4. PARAMETER ALIAS CONVERSIONS & BIDIRECTIONAL KEY MIRRORING
  // =========================================================================
  describe('4. Parameter Alias Conversions & Bidirectional Mirroring', () => {
    it('ADV-ALIAS-01: view_file accepts all known path aliases and mirrors them', () => {
      const pathAliases = ['AbsolutePath', 'absolutePath', 'Path', 'targetFile', 'TargetFile', 'file', 'filePath'];
      for (const alias of pathAliases) {
        const raw = { [alias]: 'src/utils.js' };
        const res = AciSchemaValidator.validate('view_file', raw);
        assert.strictEqual(res.valid, true, `Alias "${alias}" should validate`);
        assert.strictEqual(res.normalizedArgs.path, 'src/utils.js', `Canonical "path" must be populated from "${alias}"`);
        assert.strictEqual(res.normalizedArgs.TargetFile, 'src/utils.js', `TargetFile must be mirrored`);
      }
    });

    it('ADV-ALIAS-02: replace_file_content handles SWE-agent Anthropic aliases', () => {
      const raw = {
        TargetFile: 'components/Button.jsx',
        TargetContent: '<button>Click</button>',
        ReplacementContent: '<button className="btn">Click</button>',
        StartLine: '12',
        EndLine: '15',
        AllowMultiple: false
      };

      const res = AciSchemaValidator.validate('replace_file_content', raw);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.normalizedArgs.path, 'components/Button.jsx');
      assert.strictEqual(res.normalizedArgs.targetContent, '<button>Click</button>');
      assert.strictEqual(res.normalizedArgs.replacementContent, '<button className="btn">Click</button>');
      assert.strictEqual(res.normalizedArgs.startLine, 12);
      assert.strictEqual(res.normalizedArgs.endLine, 15);
      assert.strictEqual(res.normalizedArgs.allowMultiple, false);
      // Check that original PascalCase keys are also preserved for backward compatibility
      assert.strictEqual(res.normalizedArgs.TargetFile, 'components/Button.jsx');
      assert.strictEqual(res.normalizedArgs.TargetContent, '<button>Click</button>');
      assert.strictEqual(res.normalizedArgs.ReplacementContent, '<button className="btn">Click</button>');
    });

    it('ADV-ALIAS-03: grep_search aliases (searchPath, isRegex, caseInsensitive, matchPerLine)', () => {
      const raw = {
        Query: 'export const',
        SearchPath: 'src',
        IsRegex: false,
        CaseInsensitive: true,
        MatchPerLine: true,
        Includes: ['*.js', '*.ts']
      };

      const res = AciSchemaValidator.validate('grep_search', raw);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.normalizedArgs.query, 'export const');
      assert.strictEqual(res.normalizedArgs.searchPath, 'src');
      assert.strictEqual(res.normalizedArgs.isRegex, false);
      assert.strictEqual(res.normalizedArgs.caseInsensitive, true);
      assert.strictEqual(res.normalizedArgs.matchPerLine, true);
      assert.deepStrictEqual(res.normalizedArgs.includes, ['*.js', '*.ts']);
    });

    it('ADV-ALIAS-04: find_by_name aliases (Pattern, SearchDirectory, Type, MaxDepth)', () => {
      const raw = {
        Pattern: '*.json',
        Directory: 'config',
        Type: 'file',
        MaxDepth: '3',
        Extensions: ['json']
      };

      const res = AciSchemaValidator.validate('find_by_name', raw);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.normalizedArgs.pattern, '*.json');
      assert.strictEqual(res.normalizedArgs.searchDirectory, 'config');
      assert.strictEqual(res.normalizedArgs.type, 'file');
      assert.strictEqual(res.normalizedArgs.maxDepth, 3);
    });

    it('ADV-ALIAS-05: run_sandboxed_command aliases (cmd, command, CommandLine, timeout_ms, cwd)', () => {
      const raw = {
        cmd: 'cat package.json',
        timeout_ms: '5000',
        working_dir: 'frontend'
      };

      const res = AciSchemaValidator.validate('run_sandboxed_command', raw);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.normalizedArgs.commandLine, 'cat package.json');
      assert.strictEqual(res.normalizedArgs.timeoutMs, 5000);
      assert.strictEqual(res.normalizedArgs.cwd, 'frontend');
    });

    it('ADV-ALIAS-06: Canonical key takes precedence when both canonical and alias are supplied', () => {
      const raw = {
        path: 'primary.js',
        TargetFile: 'secondary.js'
      };

      const norm = AciSchemaValidator.normalizeArgs('view_file', raw);
      assert.strictEqual(norm.path, 'primary.js', 'Canonical key "path" must take precedence');
    });
  });

  // =========================================================================
  // 5. PRE-EXECUTION VALIDATION PREVENTS VFS MUTATION
  // =========================================================================
  describe('5. Pre-Execution Validation Prevents VFS Mutation', () => {
    const INITIAL_CONTENT = '// GOLDEN ORIGINAL STATE v1.0.0\nfunction add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n';
    const TEST_FILE = 'src/math.js';

    beforeEach(() => {
      vfs.writeFile(TEST_FILE, INITIAL_CONTENT);
    });

    it('ADV-VFS-01: Invalid range (startLine > endLine) must NOT mutate VFS file', () => {
      const originalFile = vfs.files.get(TEST_FILE);
      const originalMtime = originalFile ? originalFile.mtime : null;
      const originalSha = originalFile ? originalFile.sha256 : null;

      const res = aci.execute('replace_file_content', {
        path: TEST_FILE,
        targetContent: 'return a + b;',
        replacementContent: 'return a - b; // MALICIOUS MUTATION',
        startLine: 10,
        endLine: 2 // Inverted!
      });

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');

      // Verify VFS state is 100% pristine
      const currentContent = vfs.readFile(TEST_FILE);
      assert.strictEqual(currentContent, INITIAL_CONTENT, 'VFS content must remain completely unchanged');
      if (originalFile) {
        assert.strictEqual(vfs.files.get(TEST_FILE).mtime, originalMtime, 'File mtime must not have changed');
        assert.strictEqual(vfs.files.get(TEST_FILE).sha256, originalSha, 'File SHA256 must not have changed');
      }
    });

    it('ADV-VFS-02: Missing targetContent must NOT mutate VFS file', () => {
      const res = aci.execute('replace_file_content', {
        path: TEST_FILE,
        replacementContent: 'mutated code'
      });

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.strictEqual(vfs.readFile(TEST_FILE), INITIAL_CONTENT);
    });

    it('ADV-VFS-03: Empty targetContent ("") must NOT mutate VFS file', () => {
      const res = aci.execute('replace_file_content', {
        path: TEST_FILE,
        targetContent: '',
        replacementContent: 'mutated code'
      });

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.strictEqual(vfs.readFile(TEST_FILE), INITIAL_CONTENT);
    });

    it('ADV-VFS-04: Negative startLine must NOT mutate VFS file', () => {
      const res = aci.execute('replace_file_content', {
        path: TEST_FILE,
        targetContent: 'return a + b;',
        replacementContent: 'return 0;',
        startLine: -5,
        endLine: 5
      });

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.strictEqual(vfs.readFile(TEST_FILE), INITIAL_CONTENT);
    });

    it('ADV-VFS-05: Non-integer float line bounds must NOT mutate VFS file', () => {
      const res = aci.execute('replace_file_content', {
        path: TEST_FILE,
        targetContent: 'return a + b;',
        replacementContent: 'return 0;',
        startLine: 2.5,
        endLine: 4
      });

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.strictEqual(vfs.readFile(TEST_FILE), INITIAL_CONTENT);
    });

    it('ADV-VFS-06: Invalid commandLine in run_sandboxed_command must NOT execute shell or create files', () => {
      const initialFileCount = vfs.files.size;

      const res = aci.execute('run_sandboxed_command', {
        commandLine: '', // Empty command is invalid
        timeoutMs: 3000
      });

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.strictEqual(vfs.files.size, initialFileCount, 'No files created by shell emulator');
    });

    it('ADV-VFS-07: Out-of-bounds timeoutMs in run_sandboxed_command must NOT execute destructive shell command', () => {
      const res = aci.execute('run_sandboxed_command', {
        commandLine: `rm ${TEST_FILE}`,
        timeoutMs: -100 // Invalid negative timeout
      });

      assert.strictEqual(res.status, 'ERROR');
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.strictEqual(vfs.exists(TEST_FILE), true, 'File must not have been removed');
      assert.strictEqual(vfs.readFile(TEST_FILE), INITIAL_CONTENT);
    });

    it('ADV-VFS-08: controller.executeAction prevents VFS mutation and emits SchemaValidationError diagnostic', async () => {
      const res = await controller.executeAction('replace_file_content', {
        path: TEST_FILE,
        targetContent: 'return a + b;',
        replacementContent: 'evil',
        startLine: 10,
        endLine: 1
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'SCHEMA_VALIDATION_ERROR');
      assert.ok(res.diagnostic.includes('[RANGE]'));
      assert.strictEqual(vfs.readFile(TEST_FILE), INITIAL_CONTENT);
    });
  });

  // =========================================================================
  // 6. HIGH-THROUGHPUT RANDOMIZED SCHEMA FUZZING (2,000 ITERATIONS)
  // =========================================================================
  describe('6. High-Throughput Randomized Schema Fuzzing (2,000 Iterations)', () => {
    const tools = [
      'view_file',
      'replace_file_content',
      'grep_search',
      'find_by_name',
      'list_dir',
      'run_sandboxed_command'
    ];

    const randomJunk = [
      null,
      undefined,
      true,
      false,
      0,
      -1,
      -9999,
      1.234,
      NaN,
      Infinity,
      -Infinity,
      '',
      '   ',
      '\t\n\r',
      '\\0\\x00',
      '🎉🚀🔥',
      'Tiếng Việt có dấu à ệ ỹ ợ',
      'a'.repeat(5000),
      [],
      [1, 2, 3],
      ['*.js', null, {}],
      {},
      { nested: true },
      { [Math.random().toString(36)]: 'junk' }
    ];

    it('ADV-FUZZ-01: 2,000 randomized malformed payloads must never throw unhandled exceptions', () => {
      let acceptedCount = 0;
      let rejectedCount = 0;
      const start = Date.now();

      for (let i = 0; i < 2000; i++) {
        const tool = tools[i % tools.length];
        const payload = {};

        // Generate 1-5 random fields
        const fieldCount = 1 + (i % 5);
        for (let f = 0; f < fieldCount; f++) {
          const keyNames = [
            'path', 'TargetFile', 'startLine', 'endLine', 'targetContent',
            'replacementContent', 'query', 'isRegex', 'searchPath', 'pattern',
            'directoryPath', 'commandLine', 'timeoutMs', 'randomKey_' + f
          ];
          const key = keyNames[(i * 7 + f) % keyNames.length];
          const val = randomJunk[(i + f * 3) % randomJunk.length];
          payload[key] = val;
        }

        let result;
        assert.doesNotThrow(() => {
          result = AciSchemaValidator.validate(tool, payload);
        }, `Fuzzer crashed on tool "${tool}" with payload: ${JSON.stringify(payload)}`);

        assert.ok(typeof result.valid === 'boolean');
        assert.ok(Array.isArray(result.errors));
        assert.ok(typeof result.diagnostic === 'string');

        if (result.valid) {
          acceptedCount++;
        } else {
          rejectedCount++;
          assert.ok(result.errors.length > 0);
          assert.ok(result.diagnostic.includes('[DIAGNOSTIC FEEDBACK'));
        }
      }

      const duration = Date.now() - start;
      // 2,000 validations should complete in < 250ms
      assert.ok(duration < 2500, `Fuzzing took too long: ${duration}ms`);
      assert.ok(rejectedCount > 1500, `Expected vast majority of junk payloads to be rejected (rejected: ${rejectedCount}, accepted: ${acceptedCount})`);
    });

    it('ADV-FUZZ-02: Non-object or non-string inputs to validate() must be handled cleanly', () => {
      const nonObjects = [null, undefined, 42, 'string', true, false, [1, 2, 3], () => {}];
      for (const input of nonObjects) {
        assert.doesNotThrow(() => {
          const res = AciSchemaValidator.validate('view_file', input);
          assert.strictEqual(res.valid, false);
          assert.ok(res.errors.some(e => e.keyword === 'type'));
        });
      }
    });

    it('ADV-FUZZ-03: Unknown tool names must be rejected cleanly', () => {
      const unknownTools = ['evil_tool', 'rm_rf', 'download_payload', '', null, undefined, 123];
      for (const badTool of unknownTools) {
        assert.doesNotThrow(() => {
          const res = AciSchemaValidator.validate(badTool, { path: 'test.js' });
          assert.strictEqual(res.valid, false);
          assert.ok(res.errors.length > 0);
        });
      }
    });
  });

  // =========================================================================
  // 7. EMPIRICAL VULNERABILITY REPRODUCIBILITY & ADVERSARIAL PROBES
  // =========================================================================
  describe('7. Empirical Vulnerability Reproducibility & Adversarial Probes', () => {
    it('ADV-BUG-01 (RESOLVED): Unhandled TypeError when Symbol is supplied to cross-field line range', () => {
      let uncaughtError = null;
      let res;
      try {
        res = AciSchemaValidator.validate('view_file', {
          path: 'app.js',
          startLine: Symbol('adversarial_symbol'),
          endLine: 10
        });
      } catch (e) {
        uncaughtError = e;
      }

      assert.strictEqual(uncaughtError, null, 'Validator must not throw uncaught exception on Symbol in range check');
      assert.strictEqual(res.valid, false, 'Validator must reject invalid non-integer Symbol type');
    });

    it('ADV-BUG-02 (RESOLVED): Unhandled TypeError when circular object is passed to integer field in formatDiagnostic', () => {
      const circularObj = {};
      circularObj.self = circularObj;

      let uncaughtError = null;
      let res;
      try {
        res = AciSchemaValidator.validate('view_file', {
          path: 'app.js',
          startLine: circularObj
        });
      } catch (e) {
        uncaughtError = e;
      }

      assert.strictEqual(uncaughtError, null, 'formatDiagnostic must not throw uncaught TypeError on circular structure');
      assert.strictEqual(res.valid, false);
      assert.ok(res.diagnostic.includes('[DIAGNOSTIC FEEDBACK'));
    });

    it('ADV-BUG-03 (RESOLVED): Double-nested quantifier ReDoS pattern ((foo)+)+ is detected', () => {
      const isDetected = isDangerousReDosRegex('((foo)+)+');
      assert.strictEqual(isDetected, true, '((foo)+)+ must be detected as ReDoS');
    });

    it('ADV-BUG-04 (RESOLVED): ReDoS false positive on standard delimited repetition patterns is resolved', () => {
      const isFalselyFlagged = isDangerousReDosRegex('https?://[\\w-]+(\\.[\\w-]+)+[/#?]?.*$');
      assert.strictEqual(isFalselyFlagged, false, 'standard URL regex must not be falsely flagged as ReDoS');
    });
  });
});
