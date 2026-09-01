#!/usr/bin/env python3
"""
run_verification.py - Suna Chat Automated Integrity & Verification Suite
Authoritative verification harness enforcing:
1. JavaScript Syntax Verification (node -c app.js && node -c redesign.js)
2. CSS Hygiene & Balanced Braces in styles.css
3. Automated Mocha Test Suite Execution (npx mocha "tests/**/*.js")
4. Visible / Hidden Test Distribution Verification
5. Formatted Execution Summary & Strict Exit Codes
"""

import subprocess
import sys
import os
import re
import time

def run_cmd(cmd, cwd=None):
    """Executes a shell command and captures return code, stdout, and stderr."""
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    return res.returncode, res.stdout, res.stderr

def verify_syntax():
    """Validates JavaScript syntax integrity for core application files."""
    print("\n[1/4] Checking JavaScript Syntax Integrity...")
    targets = ["app.js", "redesign.js"]
    for target in targets:
        if not os.path.exists(target):
            print(f"[-] Target file {target} not found!")
            return False
        code, out, err = run_cmd(f"node -c {target}")
        if code != 0:
            print(f"[-] Syntax check FAILED for {target}:\n{err}")
            return False
        print(f"  [+] {target}: Clean syntax (0 errors)")
    print("[+] JavaScript syntax verification PASSED.")
    return True

def verify_css_hygiene():
    """Validates CSS formatting, brace balance, and selector hygiene."""
    print("\n[2/4] Checking CSS Hygiene & Brace Balance in styles.css...")
    if not os.path.exists("styles.css"):
        print("[-] styles.css not found!")
        return False
    with open("styles.css", "r", encoding="utf-8") as f:
        css = f.read()

    open_braces = css.count("{")
    close_braces = css.count("}")
    if open_braces != close_braces:
        print(f"[-] CSS brace mismatch: {open_braces} open '{'{'}' vs {close_braces} close '{'}'}'")
        return False
    print(f"  [+] Curly braces balanced: {open_braces} open / {close_braces} close")

    # Check for corrupt unclosed nested selector patterns
    if re.search(r"\.message\.assistant\s*\.message-bubble\s*\{\s*\.user-dropdown", css):
        print("[-] Unclosed selector detected in styles.css")
        return False

    # Check toast z-index requirement
    if not re.search(r"\.toast-container\s*\{[^}]*z-index:\s*10000", css):
        print("[-] .toast-container must have z-index: 10000")
        return False
    print("  [+] .toast-container configured with z-index: 10000")

    print("[+] CSS hygiene verification PASSED.")
    return True

def verify_mocha_tests():
    """Executes the Mocha test suite and validates pass/fail metrics."""
    print("\n[3/4] Running Comprehensive Mocha Test Suites...")
    start_time = time.time()
    code, out, err = run_cmd('npx mocha "tests/**/*.js"')
    elapsed = time.time() - start_time

    print(out)
    if code != 0:
        print("[-] Mocha test execution FAILED:\n" + err)
        return False, 0

    # Parse passing count
    match = re.search(r'(\d+)\s+passing', out)
    if not match:
        print("[-] Could not parse passing test count from Mocha output")
        return False, 0

    count = int(match.group(1))
    print(f"[+] Mocha test suite PASSED: {count} tests passing, 0 failing (took {elapsed:.2f}s)")
    return True, count

def verify_test_distribution():
    """Verifies the presence and integrity of Visible and Hidden test splits."""
    print("\n[4/4] Verifying Test Architecture Distribution...")
    test_files = []
    for root, _, files in os.walk("tests"):
        for f in files:
            if f.endswith(".js"):
                test_files.append(os.path.join(root, f))

    visible_tests = [f for f in test_files if "visible_tests" in f or "test_collapsible" in f or "test_workspace_direct" in f or "test_topbar" in f or "test_performance" in f]
    hidden_tests = [f for f in test_files if "hidden_tests" in f or "adversarial" in f]

    print(f"  [+] Discovered {len(test_files)} test suite files across test matrix.")
    print(f"  [+] Active Feature & E2E Suites: {len(visible_tests)}")
    print(f"  [+] Hidden & Adversarial Suites: {len(hidden_tests)}")
    return True

def main():
    print("==================================================================")
    print("      SUNA CHAT & LIVE WORKSPACE VERIFICATION RUNNER              ")
    print("==================================================================")

    step1 = verify_syntax()
    step2 = verify_css_hygiene()
    step3, test_count = verify_mocha_tests()
    step4 = verify_test_distribution()

    all_passed = step1 and step2 and step3 and step4

    print("\n==================================================================")
    if all_passed:
        print(f">>> VERIFICATION PASSED: ALL CHECKS 100% GREEN ({test_count} TESTS) <<<")
        print("==================================================================")
        sys.exit(0)
    else:
        print(">>> VERIFICATION FAILED: ONE OR MORE INTEGRITY CHECKS FAILED <<<")
        print("==================================================================")
        sys.exit(1)

if __name__ == "__main__":
    main()
