## 2026-09-07T16:22:01Z
You are the M1 Explorer 2: Parser & Auto-Repair Architect.
Your working directory is: d:\Suna Chat\.agents\explorer_m1_2_o6
Your caller/parent orchestrator is: 42ac3744-8c8f-4be3-ae11-274cf3c1d73d

MANDATORY FIRST STEP:
Read the authoritative user request at: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md (pay special attention to section ## 2026-09-07T16:12:49Z).
Read PROJECT.md at: d:\Suna Chat\PROJECT.md.
Read previous survey handoffs:
- d:\Suna Chat\.agents\spec_miner_survey_o6\handoff.md
- d:\Suna Chat\.agents\spec_miner_survey_o6\spec_report.md

Your mission for Milestone 1 (M1: Multi-Syntax Tool Call Parser & Auto-Repair):
1. Design the Multi-Syntax Tool Call Parser:
   - XML syntax: `<suna_tool_call tool="tool_name">{...}</suna_tool_call>` or `<tool_call>...`
   - Markdown code block syntax: ```json { "tool": "tool_name", "parameters": {...} } ```
   - Native JSON function calling syntax: `{ name: "tool_name", arguments: {...} }`
   - StreamParser chunk handling and partial tag buffering.
2. Design the Resilient JSON Auto-Repair Engine:
   - Trailing commas removal (`[1, 2,]`, `{"a": 1,}`).
   - Unquoted key quoting (`{foo: "bar"}` -> `{"foo": "bar"}`).
   - Single quote normalization (`{'a': 'b'}` -> `{"a": "b"}`).
   - Unescaped newlines in string literals repair.
   - Truncated closing braces/brackets completion for stream cutoffs.
3. Formulate the concrete implementation algorithms for the upcoming M1 Worker.

Deliverables:
- Write detailed design to: d:\Suna Chat\.agents\explorer_m1_2_o6\parser_design.md
- Write self-contained handoff to: d:\Suna Chat\.agents\explorer_m1_2_o6\handoff.md
- Notify parent orchestrator via send_message when complete.
