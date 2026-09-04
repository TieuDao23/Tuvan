import re

with open(r'd:\Suna Chat\app.js', 'r', encoding='utf-8') as f:
    app_text = f.read()

with open(r'd:\Suna Chat\styles.css', 'r', encoding='utf-8') as f:
    css_text = f.read()

test_patterns = [
    r'TR-\d+', r'SB-\d+', r'RL-\d+', r'ZR-\d+', r'CT-\d+', r'test_dsh',
    r'isTest\b', r'TEST_MODE\b', r'__TEST__\b', r'mocha\b'
]

findings = []
for p in test_patterns:
    matches = list(re.finditer(p, app_text, re.IGNORECASE))
    if matches:
        for m in matches:
            line_no = app_text[:m.start()].count('\n') + 1
            line = app_text.splitlines()[line_no - 1].strip()
            findings.append(f'app.js line {line_no}: match {m.group(0)} -> {line}')

print(f'Test pattern findings in app.js: {len(findings)}')
for f in findings:
    print('  ', f)

open_braces = css_text.count('{')
close_braces = css_text.count('}')
print(f'styles.css braces: open={open_braces}, close={close_braces}, balanced={open_braces == close_braces}')

toast_matches = re.findall(r'\.toast-container\s*\{[^}]*z-index:\s*(\d+)', css_text)
print(f'.toast-container z-index matches: {toast_matches}')
