# Orchestration Plan: DeepSeek Harness Integration for SunaChat

## Objectives
Transform SunaChat into an autonomous agent powered by DeepSeek Harness (dsh) architecture:
1. Modular Tool Registry Architecture (`registerTool`, `unregisterTool`, `listTools`, schema & validation).
2. Core Tool Harness Suite (`sandbox_exec`, `web_search_context`, `fetch_page_summary`, `fs_read`, `fs_write`, `fs_list`, `fs_patch`, `memory_query`, `memory_store`, `visualize_diagram`, `analyze_tabular`).
3. Autonomous Multi-Step ReAct Loop with recursion guards, trajectory logging, error recovery.
4. UI Trajectory View & Live Status Indicators (Zen Glassmorphic styling).
5. Comprehensive Test Suite covering all tools, loop, with 100% zero regressions across all 644 existing tests.

## Step-by-Step Execution Plan

### Step 0: Survey & Codebase Exploration (3 Specialists)
- Spec Miner / Explorer 1: Map existing `SunaAgent`, tools, prompt engineering, streaming/abort mechanisms in `app.js` and `redesign.js`.
- Spec Miner / Explorer 2: Map Live Workspace, 3-Pane resizers, file tree, memory state (`State.memory.facts`, localStorage/Firestore) in `app.js`.
- Spec Miner / Explorer 3: Map test suites, test runners, mocha/custom assertions, and all 644 existing tests to ensure full testability.

### Step 1: Synthesize Survey Findings & Formulate `PROJECT.md`
- Merge reports into `PROJECT.md` with full Architecture, Feature Inventory, Milestones, and Interface Contracts.

### Step 2: Milestone Execution Loop (Direct or Sub-Orchestrator per Milestone)
- M1: Modular Tool Registry & Core Tool Suite
- M2: Autonomous Multi-Step ReAct Loop & Trajectory Log
- M3: UI Trajectory View & Live Status Indicators
- M4: E2E Integration, Comprehensive Mocha Tests & Zero-Regression Check

### Step 3: Verification & Forensic Audit
- Independent Reviewers, Challengers, and Forensic Auditor verification.
- Final gate verification.
