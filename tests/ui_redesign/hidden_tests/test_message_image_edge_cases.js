const fs = require('fs');
const assert = require('assert');

describe('Message Image Edge Cases & Lightbox Interactions Tests (Hidden)', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  it('should support multi-image grid layout when message has > 1 images', () => {
    assert.match(
      appJs,
      /m\.images\.length\s*>\s*1\s*\?\s*['"][^'"]*is-grid/,
      'app.js should conditionally add is-grid class when there are multiple images'
    );
    assert.match(
      stylesCss,
      /\.msg-media-container\.is-grid\s+\.msg-image-card/,
      'styles.css should provide grid-specific sizing for multi-image cards'
    );
  });

  it('should handle __large_image__ placeholder cleanly inside .msg-media-container', () => {
    assert.match(
      appJs,
      /img\s*===\s*['"]__large_image__['"][\s\S]*?large-image-placeholder/,
      'app.js must preserve large-image-placeholder rendering within media container'
    );
  });

  it('should hide empty message bubble when user message only contains an image with no text', () => {
    assert.match(
      stylesCss,
      /\.message-bubble:empty\s*\{[^}]*?display:\s*none/,
      'styles.css should hide empty message-bubble with display: none'
    );
    assert.match(
      appJs,
      /style=["']display:\s*none;?["']/,
      'app.js should hide message-bubble if text is empty'
    );
  });

  it('should support lightbox closing on backdrop click, close button, and Escape key', () => {
    assert.match(
      appJs,
      /closeImageLightbox\(\)/,
      'app.js must define closeImageLightbox handler'
    );
    assert.match(
      appJs,
      /e\.key\s*===\s*['"]Escape['"][\s\S]*?closeImageLightbox/,
      'app.js must bind Escape keydown listener to close lightbox'
    );
  });

  it('should include download button in #image-lightbox-modal', () => {
    assert.match(
      indexHtml,
      /id="lightbox-download-btn"[^>]*download=/,
      '#image-lightbox-modal must contain a download link button'
    );
  });

  it('should provide responsive mobile constraints for .msg-image-card in media query', () => {
    assert.match(
      stylesCss,
      /@media\s*\([^)]*max-width:\s*768px[^)]*\)[\s\S]*?\.msg-image-card/,
      'styles.css must include mobile responsive sizing for .msg-image-card'
    );
  });

  it('should invalidate HTML render cache when m.images array changes', () => {
    assert.match(
      appJs,
      /_lastImagesKey/,
      'app.js must track and invalidate cache when message images change'
    );
  });

  it('should equip #lightbox-download-btn with target="_blank" and rel="noopener noreferrer"', () => {
    assert.match(
      indexHtml,
      /id="lightbox-download-btn"[^>]*target="_blank"/,
      '#lightbox-download-btn must have target="_blank"'
    );
    assert.match(
      indexHtml,
      /id="lightbox-download-btn"[^>]*rel="noopener noreferrer"/,
      '#lightbox-download-btn must have rel="noopener noreferrer"'
    );
  });

  it('should configure pointer-events on lightbox dialog and img for backdrop dismiss', () => {
    assert.match(
      stylesCss,
      /\.lightbox-dialog\s*\{[^}]*?pointer-events:\s*none;/,
      '.lightbox-dialog must have pointer-events: none'
    );
    assert.match(
      stylesCss,
      /\.lightbox-img\s*\{[^}]*?pointer-events:\s*auto;/,
      '.lightbox-img must have pointer-events: auto'
    );
  });
});
