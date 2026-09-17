const fs = require('fs');
const assert = require('assert');

describe('Message Image Structure & Media Sizing Tests (Visible)', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  it('should define #image-lightbox-modal element in index.html', () => {
    assert.match(
      indexHtml,
      /id="image-lightbox-modal"/,
      'index.html must contain #image-lightbox-modal'
    );
  });

  it('should define .msg-media-container and .msg-image-card in styles.css with max sizing constraints', () => {
    assert.match(
      stylesCss,
      /\.msg-media-container\s*\{/,
      'styles.css must define .msg-media-container'
    );
    assert.match(
      stylesCss,
      /\.msg-image-card\s*\{[^}]*?max-width:\s*(?:min\([^)]+\)|3\d{2}px|4[0-2]\dpx)/,
      '.msg-image-card must constrain max-width to <= 420px'
    );
    assert.match(
      stylesCss,
      /\.msg-image-card\s*\{[^}]*?max-height:\s*(?:2\d{2}px|3[0-6]\dpx)/,
      '.msg-image-card must constrain max-height to <= 360px'
    );
  });

  it('should constrain .message-bubble img max dimensions to prevent giant bubble expansion', () => {
    assert.match(
      stylesCss,
      /\.message-bubble\s+img\s*\{[^}]*?max-width:\s*(?:min\([^)]+\)|3\d{2}px|4[0-8]\dpx|500px)/,
      '.message-bubble img must constrain max-width to avoid blowing up message bubbles'
    );
  });

  it('should structure .message-content as a flex column with directional alignment', () => {
    assert.match(
      stylesCss,
      /\.message-content\s*\{[^}]*?display:\s*flex/,
      '.message-content must have display: flex'
    );
    assert.match(
      stylesCss,
      /\.message-content\s*\{[^}]*?flex-direction:\s*column/,
      '.message-content must have flex-direction: column'
    );
    assert.match(
      stylesCss,
      /\.message\.user\s+\.message-content\s*\{[^}]*?align-items:\s*flex-end/,
      '.message.user .message-content must align items to flex-end'
    );
  });

  it('should render images into .msg-media-container in app.js renderMessages', () => {
    assert.match(
      appJs,
      /msg-media-container/,
      'renderMessages in app.js must render images into .msg-media-container'
    );
    assert.match(
      appJs,
      /msg-image-card/,
      'renderMessages in app.js must wrap individual images in .msg-image-card'
    );
  });

  it('should export openImageLightbox and closeImageLightbox on window in app.js', () => {
    assert.match(
      appJs,
      /window\.openImageLightbox\s*=/,
      'app.js must define window.openImageLightbox'
    );
    assert.match(
      appJs,
      /window\.closeImageLightbox\s*=/,
      'app.js must define window.closeImageLightbox'
    );
  });

  it('should pin .lightbox-actions with position fixed to avoid off-screen clipping on tall images', () => {
    assert.match(
      stylesCss,
      /\.lightbox-actions\s*\{[^}]*?position:\s*fixed;/,
      '.lightbox-actions must use position: fixed to prevent being pushed off-screen'
    );
    assert.match(
      stylesCss,
      /\.lightbox-actions\s*\{[^}]*?top:\s*\d+px;/,
      '.lightbox-actions must pin top distance in px'
    );
    assert.match(
      stylesCss,
      /\.lightbox-actions\s*\{[^}]*?right:\s*\d+px;/,
      '.lightbox-actions must pin right distance in px'
    );
  });

  it('should sanitize and escape image URLs with escHtml in renderMessages to prevent XSS', () => {
    assert.match(
      appJs,
      /escHtml\(img\)/,
      'renderMessages must sanitize image URLs with escHtml'
    );
  });
});
