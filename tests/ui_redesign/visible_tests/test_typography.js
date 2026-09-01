const fs = require('fs');
const assert = require('assert');
describe('Typography Tests (Visible)', () => {
  it('should import Google Fonts for Zen/Ink-wash theme', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(css.includes('@import url') || html.includes('fonts.googleapis.com'), 'Chưa cấu hình Google Fonts cho Thủy Mặc');
  });
  it('should apply serif typography to headers (h1, h2, h3) with letter-spacing', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /h1,\s*h2,\s*h3\s*\{[^}]*font-family:\s*['"]?(Cinzel Decorative|Playfair Display)['"]?/i, 'Chưa tinh chỉnh typography cho tiêu đề');
  });
});