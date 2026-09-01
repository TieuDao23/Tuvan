const fs = require('fs');
const assert = require('assert');
describe('Color Palette Tests (Visible)', () => {
  it('should use ink charcoal for primary background', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /--bg-primary:\s*(?:#0d0b14|#0[0-9a-f]{5})/i, 'Màu nền chính chưa đạt chuẩn Thủy Mặc');
  });
  it('should implement glassmorphic properties for panels', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /backdrop-filter:\s*blur/i, 'Lớp kính mờ Glassmorphism chưa được cấu hình');
  });
  it('should apply Zen accent colors', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /--accent-color:\s*.*(e8a87c|c0392b)/i, 'Màu nhấn chưa chuyển sang hệ màu Zen');
  });
});