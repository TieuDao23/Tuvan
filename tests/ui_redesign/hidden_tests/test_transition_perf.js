const fs = require('fs');
const assert = require('assert');
describe('Transition Performance Tests (Hidden)', () => {
  it('should only transition transform, opacity, and custom vars to avoid layout shifts', () => {
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.doesNotMatch(css, /transition-property:\s*.*(width|height|top|left)/i, 'Phát hiện chuyển động gây lag giao diện (sử dụng width/height/top/left)');
  });
});