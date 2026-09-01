# Orchestration Plan: Top Bar Design & Layout Fixes

## Problem Statement
Top Bar layout overflows and cuts off controls/icons, Lofi Player wraps to second row with default blue volume slider, CSS syntax has unclosed selector at line 3986 in styles.css with duplicated webkit properties, and dropdown menus/modals need proper z-index and overflow handling across all resolutions.

## Strategy: SWE Light Refinement Loop
1. **Implementer**: teamwork_preview_implementer
   - Apply fixes for R1 (Top Bar flex-wrap, 48px height, Lofi Player 32-34px, Zen peach accent-color #e8a87c, <=1150px responsive tuck into mobile-dropdown-container).
   - Apply fixes for R2 (line 3986 unclosed selector, clean up duplicated -webkit-backdrop-filter and duplicate blocks).
   - Apply fixes for R3 (z-index of dropdown menus, dark/light theme consistency).
   - Run verification test suite and self-correction script (R4).
2. **Reviewer Round 1**: teamwork_preview_reviewer
   - Adversarial verification, edge cases (screen widths 360px - 2560px, DOM state in mobile dropdown, CSS parser validation).
3. **Reviewer Round 2**: teamwork_preview_reviewer
   - Stress testing, visual audit, clean code & performance check.
4. **Reviewer Round 3**: teamwork_preview_reviewer
   - Final polish, regression checks across all 97+ tests and run_verification.py.
5. **Victory Auditor**: teamwork_preview_victory_auditor
   - Independent 3-phase verification before declaring task complete.
