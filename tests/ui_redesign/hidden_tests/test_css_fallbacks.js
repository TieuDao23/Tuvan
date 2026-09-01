const fs = require('fs');
const assert = require('assert');
describe('CSS Fallback Tests (Hidden)', () => {
  it('should define safe generic fallbacks for all font-family values', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /font-family:.*(sans-serif|serif)/i, 'Thiếu font fallback an toàn');
  });
});