---
name: agent-self-correction
description: Automates code verification, linting, and unit testing across multiple languages (JS/TS, Python, Rust, Go) to establish a grounded self-correction loop and achieve 10x accuracy.
---

# Agent Self-Correction Skill

This skill provides an automated verification loop for the agent to ensure code correctness before finalizing tasks.

## Triggering the Skill
Trigger this skill whenever you:
- Modify source files or configuration in a workspace.
- Implement new features or refactor existing code.
- Want to verify if the project compiles and passes tests.

## Instructions

1. **Write Tests First**:
   If writing new features, ensure unit tests exist or write them first.

2. **Execute Verification Script**:
   Run the verification helper script to automatically detect project types, compile, typecheck, lint, and run tests.
   
   ```powershell
   python C:\Users\Admin\.gemini\config\skills\agent_self_correction\scripts\run_verification.py
   ```

3. **Handle Compilation/Test Errors**:
   - If the script outputs errors (exit code is non-zero):
     - Carefully review the compiler/test error logs.
     - Locate the files and line numbers causing the errors.
     - Edit the files to resolve the issues.
     - Re-run the verification script.
   - Do NOT attempt to fix the error in the same way more than 3 times. If a solution fails repeatedly, seek clarification or report the exact log to the user.

4. **Document and Complete**:
   - Once the verification script reports `VERIFICATION PASSED` (exit code 0), your changes are safe.
   - Document any resolved issues or setup modifications in the project's `LESSONS.md` file so future agents benefit from it.
