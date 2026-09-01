const fs = require('fs');
const assert = require('assert');
describe('Layout & Interaction Tests (Visible)', () => {
  it('should have transition properties on interactive elements', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /\.btn\s*\{[^}]*transition:/i, 'Thiếu hiệu ứng transition cho tương tác');
  });
});