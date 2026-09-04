const fs = require('fs');
const assert = require('assert');

describe('Suna Chat Spacious Layout & Breathable UI Redesign', () => {
  let stylesCss;

  before(() => {
    stylesCss = fs.readFileSync('styles.css', 'utf8');
  });

  it('should define an expanded max-width (>= 1140px) in base .messages-container styles', () => {
    assert.match(
      stylesCss,
      /\.messages-container\s*\{[^}]*?max-width:\s*(?:min\(11\d{2}px|11[4-9]\dpx|12\d{2}px)/,
      'base .messages-container must have an expanded max-width (>= 1140px)'
    );
  });

  it('should define an expanded max-width in base .input-container and .input-tools-bar', () => {
    assert.match(
      stylesCss,
      /\.input-container\s*\{[^}]*?max-width:\s*(?:min\(11\d{2}px|11[4-9]\dpx|12\d{2}px)/,
      'base .input-container must have an expanded max-width'
    );
    assert.match(
      stylesCss,
      /\.input-tools-bar\s*\{[^}]*?max-width:\s*(?:min\(11\d{2}px|11[4-9]\dpx|12\d{2}px)/,
      'base .input-tools-bar must have an expanded max-width'
    );
  });

  it('should provide generous message spacing (gap >= 20px) in base .messages-container', () => {
    assert.match(
      stylesCss,
      /\.messages-container\s*\{[^}]*?gap:\s*(?:2[0-9]|3[0-9])px/,
      '.messages-container must have gap >= 20px for breathing room'
    );
  });

  it('should expand mindmap canvas height (>= 520px) in .mindmap-container-wrapper', () => {
    assert.match(
      stylesCss,
      /\.mindmap-container-wrapper\s*\{[^}]*?height:\s*(?:5[2-9]\d|6\d{2})px/,
      '.mindmap-container-wrapper must have expanded height >= 520px'
    );
  });

  it('should eliminate double-padding bottleneck in .chat-area', () => {
    assert.match(
      stylesCss,
      /\.chat-area\s*\{[^}]*?padding:\s*0\s*!important/,
      '.chat-area must have padding: 0 !important to avoid layout compression'
    );
  });

  it('should support wide desktop viewports (>= 1440px) expanding up to 1240px', () => {
    assert.match(
      stylesCss,
      /@media\s*\(\s*min-width:\s*1440px\s*\)\s*\{[\s\S]*?max-width:\s*min\(1240px,\s*94vw\)/,
      '@media (min-width: 1440px) must scale layout up to 1240px'
    );
  });
});
