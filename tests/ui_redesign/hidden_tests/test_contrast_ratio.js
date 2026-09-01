const fs = require('fs');
const assert = require('assert');

function relLum(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255);
  const a = rgb.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function getContrast(hex1, hex2) {
  const l1 = relLum(hex1);
  const l2 = relLum(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('Contrast Ratio Tests (Hidden)', () => {
  it('should ensure text contrast ratio is at least 4.5:1 for accessibility', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    const darkBgMatch = css.match(/--bg-primary:\s*(#[0-9a-fA-F]{6})/);
    const darkTextMatch = css.match(/--text-primary:\s*(#[0-9a-fA-F]{6})/);
    const darkMutedMatch = css.match(/--text-muted:\s*(#[0-9a-fA-F]{6})/);
    
    assert.ok(darkBgMatch && darkTextMatch && darkMutedMatch, 'Missing dark mode color tokens');
    const darkPrimaryContrast = getContrast(darkTextMatch[1], darkBgMatch[1]);
    const darkMutedContrast = getContrast(darkMutedMatch[1], darkBgMatch[1]);
    
    assert.ok(darkPrimaryContrast >= 4.5, `Dark primary contrast ${darkPrimaryContrast.toFixed(2)} < 4.5`);
    assert.ok(darkMutedContrast >= 4.5, `Dark muted contrast ${darkMutedContrast.toFixed(2)} < 4.5`);

    const lightBgMatch = css.match(/body\.light-mode\s*\{[^}]*--bg-primary:\s*(#[0-9a-fA-F]{6})/);
    const lightTextMatch = css.match(/body\.light-mode\s*\{[^}]*--text-primary:\s*(#[0-9a-fA-F]{6})/);
    const lightMutedMatch = css.match(/body\.light-mode\s*\{[^}]*--text-muted:\s*(#[0-9a-fA-F]{6})/);
    
    if (lightBgMatch && lightTextMatch) {
      const lightPrimaryContrast = getContrast(lightTextMatch[1], lightBgMatch[1]);
      assert.ok(lightPrimaryContrast >= 4.5, `Light primary contrast ${lightPrimaryContrast.toFixed(2)} < 4.5`);
    }
    if (lightBgMatch && lightMutedMatch) {
      const lightMutedContrast = getContrast(lightMutedMatch[1], lightBgMatch[1]);
      assert.ok(lightMutedContrast >= 4.5, `Light muted contrast ${lightMutedContrast.toFixed(2)} < 4.5`);
    }
  });
});