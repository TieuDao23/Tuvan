# Project: Suna Chat 6-Level Reasoning Effort & Deep Cognitive Orchestration Engine

## Architecture
- **Top Bar UI Component**: Dropdown widget (`#reasoning-effort-container`) containing pill display (`#reasoning-effort-display`) and popup menu (`#reasoning-effort-dropdown`) embedded in `.top-bar-center` next to `#current-model-display`.
- **Design & Responsive Layout**: 6 distinct color badges and emoji icons (`low` 🟢, `medium` 🔵, `high` 🟣, `xhigh` ⚡, `max` 💎, `ultra` 🔥). Compact icon badge collapse on mobile ($\le 768$px) to prevent header overflow.
- **State & Persistence**: `State.settings.reasoningEffort` defaulting to `'xhigh'`. Dual storage across localStorage (`suna_settings` + suffix) and Firestore Cloud Sync, plus cross-tab synchronization.
- **Cognitive Orchestration Engine**: Dual-layer gateway mapping (`reasoning_effort` and `thinking_config`) combined with 3-tier meta-cognitive system prompt injection (`xhigh` Assumption Challenge; `max` Tree-of-Thought $\ge 2$ comparative paths; `ultra` 4-Phase Deep Invariant & Counter-example Cognitive Architecture).
- **Token Scaling & Continuation**: Token ceiling scaled to 65,536 for `max` and `ultra`, and continuation loop expansion.
- **Verification Harness**: 4-stage pipeline in `run_verification.py` and Mocha test suite with zero regression across 1,634+ existing tests.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Top Bar Dropdown Widget HTML | Add `#reasoning-effort-container`, display pill and 6-option dropdown in `index.html` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Top Bar Styling & Responsive Rules | Color tokens, badges, z-index: 250, mobile <= 768px collapse in `styles.css` | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Widget Event Handlers & Accessibility | Open/close, mutual dismissal, click-outside, Enter/Space/Escape WAI-ARIA in `app.js` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | State Initialization & Default Setting | Initialize `reasoningEffort: 'xhigh'` in `getDefaultSettings`, `clearInMemoryState`, `loadState` | M2 | ORIGINAL_REQUEST §R1 |
| 5 | Storage & Cloud Synchronization | LocalStorage serialization, Firestore sync, cross-tab BroadcastChannel sync | M2 | ORIGINAL_REQUEST §R1 |
| 6 | API Gateway Payload Mapping | Map low/medium/high directly, xhigh/max/ultra to high + thinking_config in `makeApiRequest` | M3 | ORIGINAL_REQUEST §R2 |
| 7 | Meta-Cognitive Prompting (xhigh/max/ultra) | Inject Assumption Challenge, Tree-of-Thought, and 4-Phase Architecture in `buildSystemPrompt` | M3 | ORIGINAL_REQUEST §R2 |
| 8 | Token Scaling & Continuation Chaining | Scale token ceiling to 65,536 and expand continuation turns for max/ultra | M3 | ORIGINAL_REQUEST §R2 |
| 9 | Preserved Static Regex Invariants | Retain verbatim signatures and assignments to protect existing test suite | M3 | Survey Tests Audit |
| 10 | Feature Test Suite (Visible) | Author `tests/test_reasoning_effort_dropdown_and_cognitive_engine.js` (~40 tests) | M4 | ORIGINAL_REQUEST §R3 |
| 11 | Adversarial Test Suite (Hidden) | Author `tests/test_challenger_reasoning_effort_adversarial.js` (~20 tests) | M4 | ORIGINAL_REQUEST §R3 |
| 12 | Zero-Regression Full Suite Pass | Pass 100% of 1,634+ tests (`npm test`) and `python run_verification.py` 4 stages | M4 | ORIGINAL_REQUEST §R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Top Bar UI & Responsive Layout | `index.html`, `styles.css`, `app.js` (UI init & event handling) | none | PLANNED |
| 2 | M2: State Persistence & Sync | `app.js` (state defaults, load, save, sync, update UI hook) | M1 | PLANNED |
| 3 | M3: Cognitive Orchestration Engine | `app.js` (API mapping, meta-prompting, token scaling, continuation) | M2 | PLANNED |
| 4 | M4: E2E Test Suite & Full Verification | `tests/`, `run_verification.py`, `npm test` | M3 | PLANNED |

## Interface Contracts
### UI Widget ↔ State Layer
- `window.updateReasoningEffortDisplay(level)`: Reads `level || State.settings.reasoningEffort || 'xhigh'` and updates the pill text, emoji, icon, and active checkmark in the dropdown.
- `window.setReasoningEffort(level)`: Validates `level` in `['low', 'medium', 'high', 'xhigh', 'max', 'ultra']`, updates `State.settings.reasoningEffort = level`, calls `updateReasoningEffortDisplay(level)`, and invokes `saveState(true, 'settings')`.

### Cognitive Engine ↔ API Pipeline
- `getCognitiveOrchestrationPrompt(effortLevel)`: Returns meta-prompt strings for `medium`, `high`, `xhigh`, `max`, `ultra` or empty string for `low`.
  - `max`: Elite Multi-Branch Decision Architecture (explicit branch hypothesis generation, trade-off matrix evaluation of competing paradigms, relentless boundary & edge-case stress testing, verifiable error elimination, omnidirectional reasoning).
  - `ultra`: Supreme 4-Phase Deep Cognitive Architecture (Phase 1: Hyper-Atomic Problem Decomposition & Formal Dependency DAG mapping, Phase 2: Axiomatic Invariant Proofs & Contract Formalization, Phase 3: Ruthless Adversarial Red-Teaming & Byzantine Counter-Example Falsification, Phase 4: Zero-Compromise Synthesis & Production-Grade Flawless Implementation).
- `reqBody.reasoning_effort`:
  - Retain verbatim line `reqBody.reasoning_effort = State.mode === 'flash' ? 'low' : 'high';`
  - Immediately refine:
    - If `isReasoning`:
      - If `['low', 'medium', 'high'].includes(effort)`: `reqBody.reasoning_effort = effort;`
      - If `['xhigh', 'max', 'ultra'].includes(effort)`: `reqBody.reasoning_effort = 'high'; reqBody.thinking_config = { include_thoughts: true };`
      - If continuation turn (`isContinuation`): `reqBody.reasoning_effort = 'low';`

### Token Scaling Contract
- `resolveModelMaxTokens(modelName, mode, effort)`:
  - If `effort === 'max' || effort === 'ultra'`: returns `65536`.

## Code Layout
- `index.html`: Line ~314–320 inside `.top-bar-center`.
- `styles.css`: CSS variables, `.reasoning-effort-container`, `.reasoning-effort-display`, `.reasoning-effort-dropdown`, color tokens, `@media (max-width: 768px)`.
- `app.js`: State defaults, UI renderers, click/keyboard event listeners, `buildSystemPrompt`, `makeApiRequest`, `resolveModelMaxTokens`.
- `tests/test_reasoning_effort_dropdown_and_cognitive_engine.js`: Visible feature test suite.
- `tests/test_challenger_reasoning_effort_adversarial.js`: Hidden adversarial test suite.
