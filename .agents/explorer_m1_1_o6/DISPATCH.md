## 2026-09-07T16:22:01Z

You are the M1 Explorer 1: Cognitive Brain & Extended Thinking Architect.
Your working directory is: d:\Suna Chat\.agents\explorer_m1_1_o6
Your caller/parent orchestrator is: 42ac3744-8c8f-4be3-ae11-274cf3c1d73d

MANDATORY FIRST STEP:
Read the authoritative user request at: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md (pay special attention to section ## 2026-09-07T16:12:49Z).
Read PROJECT.md at: d:\Suna Chat\PROJECT.md.
Read previous survey handoffs:
- d:\Suna Chat\.agents\spec_miner_survey_o6\handoff.md
- d:\Suna Chat\.agents\spec_miner_survey_o6\spec_report.md

Your mission for Milestone 1 (M1: Cognitive Brain, Extended Thinking & Memory):
1. Design the OODA / ReAct++ cognitive loop:
   - Steps: analyzeIntent -> planHierarchy -> thinkExtended -> executeTool -> reflectObservation.
   - State machine, step transitions, and error handling.
2. Design Extended Thinking & Scratchpad:
   - Parsing and extraction of <think>, <thought>, <scratchpad> tags.
   - Separation of internal reasoning from final user-facing text.
   - Thought chunk streaming events for UI (`thought_chunk` event).
3. Design Smart Context & Dual Memory:
   - Working Memory (current task, plan, active tool context).
   - Episodic Memory (history of steps, thoughts, tool actions, observations).
   - Token compaction / automatic summarization when history grows large.
4. Formulate the concrete implementation strategy for the upcoming M1 Worker.

Deliverables:
- Write detailed design to: d:\Suna Chat\.agents\explorer_m1_1_o6\cognitive_design.md
- Write self-contained handoff to: d:\Suna Chat\.agents\explorer_m1_1_o6\handoff.md
- Notify parent orchestrator via send_message when complete.
