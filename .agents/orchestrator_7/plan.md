# Execution Plan: SunaAgent Remediation & Verification Gate

## Objective
Remediate the integrity audit violation and 15 failing adversarial tests, eliminate prohibited self-certifying/facade tests in `tests/test_suna_agent.js`, achieve 100% test pass on `npm test` and `python run_verification.py`, obtain clean review, challenge, and forensic audit verdicts, and report completion.

## Step-by-step Plan
1. **Exploration & Strategy (Iteration 1)**
   - Dispatch 3 Explorers (`teamwork_preview_explorer`) in parallel with the full forensic audit report and challenge report:
     - Explorer 1: Deep dive on `MultiSyntaxParser` and `JsonAutoRepair` failure points and exact fixes.
     - Explorer 2: Deep dive on `SunaAgent` circuit breaker / runaway guardrail integration and `OodaBrain` step handling.
     - Explorer 3: Deep dive on `tests/test_suna_agent.js` facade/self-certifying tests and Unicode NFC normalization in `replace_file_content`.
   - Synthesize explorer findings into a unified, actionable remediation blueprint.

2. **Remediation Implementation (Worker)**
   - Dispatch 1 Worker (`teamwork_preview_worker`) with the synthesized plan and mandatory integrity warning.
   - Worker implements the required fixes in `suna_agent.js`, `suna_harness.js` (if needed for NFC), and `tests/test_suna_agent.js`.
   - Worker runs:
     - `node -c suna_agent.js` & `npm run check`
     - `npx mocha tests/test_challenger_suna_agent_adversarial.js`
     - `npx mocha tests/test_suna_agent.js`
     - `npm test` (full 1,400+ tests)
     - `python run_verification.py`
   - Worker submits handoff report with empirical verification evidence.

3. **Independent Dual Review**
   - Dispatch 2 independent Reviewers (`teamwork_preview_reviewer`) to verify correctness, code hygiene, non-regression, and spec conformance.

4. **Adversarial Challenge Verification**
   - Dispatch 2 Challengers (`teamwork_preview_challenger`) to re-verify adversarial fuzzing cases and stress test the circuit breaker and parsers.

5. **Forensic Integrity Audit**
   - Dispatch Forensic Auditor (`teamwork_preview_auditor`) to verify zero cheating, zero facade tests, authentic test executions, and compliance.

6. **Gate Evaluation & Final Verification**
   - Evaluate all verdicts in `GATE_STATUS.md`.
   - If all pass (100% tests green, Reviews APPROVE, Challengers confirm, Audit CLEAN) -> Proceed to victory reporting.
   - If any fail -> Trigger next iteration with updated feedback.
