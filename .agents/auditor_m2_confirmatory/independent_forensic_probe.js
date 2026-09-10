const assert = require('assert');
const {
  VfsSandbox,
  AciInterface,
  AciSchemaValidator,
  HarnessController,
  VfsDiffEngine,
  isDangerousReDosRegex
} = require('../../suna_harness');

console.log('--- STARTING INDEPENDENT AUDITOR FORENSIC PROBES ---');

// Probe 1: Symbol in cross-field validation
console.log('[PROBE 1] Testing Symbol safety in crossFieldRules...');
{
  const sym = Symbol('forensic_adversarial_symbol');
  const toolsToTest = [
    { tool: 'view_file', args: { path: 'test.js', startLine: sym, endLine: 10 } },
    { tool: 'view_file', args: { path: 'test.js', startLine: 1, endLine: sym } },
    { tool: 'replace_file_content', args: { path: 'test.js', targetContent: 'a', replacementContent: 'b', startLine: sym, endLine: 10 } },
    { tool: 'replace_file_content', args: { path: 'test.js', targetContent: 'a', replacementContent: 'b', startLine: 1, endLine: sym } }
  ];

  for (const t of toolsToTest) {
    let uncaught = null;
    let res = null;
    try {
      res = AciSchemaValidator.validate(t.tool, t.args);
    } catch (err) {
      uncaught = err;
    }
    assert.strictEqual(uncaught, null, `Symbol threw unhandled exception on ${t.tool}: ${uncaught}`);
    assert.strictEqual(res.valid, false, `Symbol should cause validation failure on ${t.tool}`);
    assert.ok(res.errors.length > 0, `Errors must be populated for ${t.tool}`);
    assert.ok(res.diagnostic.length > 0, `Diagnostic string must be generated for ${t.tool}`);
  }
  console.log('  [+] PROBE 1 PASSED: Zero unhandled exceptions on Symbol inputs.');
}

// Probe 2: Circular objects in formatDiagnostic
console.log('[PROBE 2] Testing Circular Object handling in formatDiagnostic...');
{
  const circular = {};
  circular.self = circular;
  circular.child = { parent: circular };

  let uncaught = null;
  let res = null;
  try {
    res = AciSchemaValidator.validate('view_file', {
      path: 'test.js',
      startLine: circular
    });
  } catch (err) {
    uncaught = err;
  }
  assert.strictEqual(uncaught, null, `Circular object caused unhandled exception: ${uncaught}`);
  assert.strictEqual(res.valid, false, 'Circular object should invalidate schema');
  assert.ok(res.diagnostic.includes('[DIAGNOSTIC FEEDBACK'), 'Diagnostic feedback must be generated');
  assert.ok(res.diagnostic.includes('[object Object]'), 'Fallback serialization must succeed');
  console.log('  [+] PROBE 2 PASSED: Circular objects formatted safely without throwing.');
}

// Probe 3: ReDoS pattern detection accuracy
console.log('[PROBE 3] Testing ReDoS detection accuracy (False Positive & False Negative testing)...');
{
  const truePositives = [
    '((foo)+)+',
    '((a+))+$',
    '(a+)+',
    '(a*)*',
    '(x{1,})+',
    '([0-9]+)+',
    '(a|a)+',
    '(foo|foo)+'
  ];

  for (const pat of truePositives) {
    assert.strictEqual(isDangerousReDosRegex(pat), true, `Pattern "${pat}" MUST be detected as ReDoS`);
  }

  const trueNegatives = [
    'https?://[\\w-]+(\\.[\\w-]+)+[/#?]?.*$',
    '^[a-zA-Z0-9]+(\\.[a-zA-Z0-9]+)*$',
    '^/api/v1/users/\\d+$',
    '^[a-z]+$',
    'normal_search_term'
  ];

  for (const pat of trueNegatives) {
    assert.strictEqual(isDangerousReDosRegex(pat), false, `Pattern "${pat}" MUST NOT be flagged as ReDoS`);
  }
  console.log('  [+] PROBE 3 PASSED: ReDoS detector perfectly separates true ReDoS from safe delimited patterns.');
}

// Probe 4: Turn and Token consumption contract in HarnessController
console.log('[PROBE 4] Testing pre-flight schema validation & turn budget invariance in HarnessController...');
(async () => {
  const vfs = new VfsSandbox();
  vfs.writeFile('main.js', 'console.log("hello");\n');
  const controller = new HarnessController({
    vfs,
    maxTurns: 10,
    maxTokens: 50000
  });

  assert.strictEqual(controller.turnsCompleted, 0);
  assert.strictEqual(controller.tokensConsumed, 0);

  // Invalid call: missing required fields or empty targetContent
  const invalidRes = await controller.executeAction('replace_file_content', {
    path: 'main.js',
    targetContent: ''
  });

  assert.strictEqual(invalidRes.success, false);
  assert.strictEqual(invalidRes.code, 'SCHEMA_VALIDATION_ERROR');
  assert.ok(invalidRes.diagnostic.includes('[MINLENGTH]'));
  assert.strictEqual(controller.turnsCompleted, 0, 'turnsCompleted MUST remain 0 after failed validation');
  assert.strictEqual(controller.tokensConsumed, 0, 'tokensConsumed MUST remain 0 after failed validation');

  // Valid call
  const validRes = await controller.executeAction('replace_file_content', {
    path: 'main.js',
    targetContent: 'console.log("hello");',
    replacementContent: 'console.log("world");'
  });
  console.log('validRes:', validRes);

  assert.strictEqual(validRes.success, true);
  assert.strictEqual(controller.turnsCompleted, 1, 'turnsCompleted MUST increment by 1 after successful action');
  assert.ok(controller.tokensConsumed > 0, 'tokensConsumed MUST be debited after successful action');

  console.log('  [+] PROBE 4 PASSED: Zero turn/token penalty on schema validation failure.');

  // Probe 5: VfsDiffEngine.previewReplaceDiff bounds and duplicate match verification
  console.log('[PROBE 5] Testing VfsDiffEngine.previewReplaceDiff bounds and duplicate checks...');
  {
    vfs.writeFile('data.txt', 'line 1\nkey = val\nline 3\nkey = val\nline 5\n');

    // Test out of bounds: endLine > totalLines
    const oobRes = VfsDiffEngine.previewReplaceDiff(vfs, 'data.txt', 'key = val', 'key = new', {
      startLine: 1,
      endLine: 20
    });
    assert.strictEqual(oobRes.wouldSucceed, false);
    assert.ok(oobRes.reason.includes('invalid for file with 6 lines') || oobRes.reason.includes('invalid for file with 5 lines'));

    // Test inverted range: startLine > endLine
    const invertedRes = VfsDiffEngine.previewReplaceDiff(vfs, 'data.txt', 'key = val', 'key = new', {
      startLine: 4,
      endLine: 2
    });
    assert.strictEqual(invertedRes.wouldSucceed, false);
    assert.ok(invertedRes.reason.includes('invalid'));

    // Test duplicate match without allowMultiple
    const dupRes = VfsDiffEngine.previewReplaceDiff(vfs, 'data.txt', 'key = val', 'key = new', {
      allowMultiple: false
    });
    assert.strictEqual(dupRes.wouldSucceed, false);
    assert.ok(dupRes.reason.includes('Ambiguous duplicate match'));

    // Test duplicate match with allowMultiple
    const multiRes = VfsDiffEngine.previewReplaceDiff(vfs, 'data.txt', 'key = val', 'key = new', {
      allowMultiple: true
    });
    assert.strictEqual(multiRes.wouldSucceed, true);
    assert.ok(multiRes.patch.includes('-key = val'));
    assert.ok(multiRes.patch.includes('+key = new'));

    console.log('  [+] PROBE 5 PASSED: previewReplaceDiff bounds, diagnostics, and duplicate guards verified.');
  }

  console.log('--- ALL INDEPENDENT AUDITOR FORENSIC PROBES COMPLETED CLEANLY ---');
})();
