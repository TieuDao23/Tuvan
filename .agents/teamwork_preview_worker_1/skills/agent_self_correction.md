# Agent Self-Correction Skill (Local Copy)
Source: C:\Users\Admin\.gemini\config\skills\agent_self_correction\SKILL.md

Automates code verification, linting, and unit testing across multiple languages (JS/TS, Python, Rust, Go) to establish a grounded self-correction loop and achieve 10x accuracy.

Instructions:
1. Write Tests First if writing new features.
2. Execute Verification Script: node -c, npm test, python run_verification.py.
3. Handle Compilation/Test Errors: inspect logs, locate files/lines, resolve issues, re-run.
4. Document and Complete.
