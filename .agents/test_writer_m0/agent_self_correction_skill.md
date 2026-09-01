---
name: agent-self-correction
description: Automates code verification, linting, and unit testing across multiple languages (JS/TS, Python, Rust, Go) to establish a grounded self-correction loop and achieve 10x accuracy.
---

# Agent Self-Correction Skill

This skill provides an automated verification loop for the agent to ensure code correctness before finalizing tasks.

## Instructions
1. Write Tests First
2. Execute Verification Script: `python run_verification.py`
3. Handle Compilation/Test Errors with grounded log analysis
4. Document and Complete (100% GREEN, 0 syntax errors)
