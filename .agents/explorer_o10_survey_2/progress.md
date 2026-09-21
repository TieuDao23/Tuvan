# Progress Log - Explorer Survey 2 (Milestone R2)

- Status: Deep Code Investigation Complete
- Last visited: 2026-09-20T14:49:00Z
- Current step: Synthesizing findings and writing survey_report.md and handoff.md.

## Completed Investigation Items:
1. memory_store deduplication & saveMemory persistence (app.js:4621-4656, app.js:5473-5491) - Identified root cause: pre-pushing fact to State.memory.facts before addMemoryFact triggers isDuplicate guard and skips saveMemory(true).
2. fs_patch byte length without Buffer/TextEncoder (app.js:4592-4595) - Identified root cause: variable named 'content' referenced in fallback instead of 'patched', causing ReferenceError.
3. replace_file_content deletion newline hygiene (suna_harness.js:828-834, 1816) - Identified root cause: pushing empty string into array joined by \n produces double newline \n\n.
4. fetch_page_summary network error mock removal (app.js:4447-4449) - Identified root cause: fallback hardcodes mock HTML on network error causing AI hallucinations.
5. run_sandboxed_command & sandbox_exec (app.js:4357, suna_harness.js:3250, 3701, 3742) - Identified root cause: parenthesized code wraps statements causing SyntaxError with const/let; prototype escape via Object.constructor; readOnly enforcement omits run_sandboxed_command.
6. Parameter Aliases normalization (app.js:4824-4828, suna_agent.js:1938-1939) - Identified root cause: validateParameters is called before AciSchemaValidator.normalizeArgs, causing missing required parameter errors for valid aliases.
7. vfs_change Event redirection path parsing (suna_agent.js:1636-1642) - Identified root cause: targetPath is read from normalized.TargetFile/path which is undefined for run_sandboxed_command, never parsing > redirection.
