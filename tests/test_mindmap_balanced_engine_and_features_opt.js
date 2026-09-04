const fs = require('fs');
const assert = require('assert');

describe('Suna Chat Balanced Mindmap Engine & Feature Optimization', () => {
  let appJs, stylesCss, indexHtml;

  before(() => {
    appJs = fs.readFileSync('app.js', 'utf8');
    stylesCss = fs.readFileSync('styles.css', 'utf8');
    indexHtml = fs.readFileSync('index.html', 'utf8');
  });

  describe('1. Balanced Subtree Layout Engine in buildMindmapSrcdoc', () => {
    it('should implement computeSubtreeHeights in buildMindmapSrcdoc for balanced layout', () => {
      assert.match(appJs, /function\s+computeSubtreeHeights\s*\(/, 'buildMindmapSrcdoc must compute subtree heights recursively');
    });

    it('should balance left and right branches symmetrically around y = 0 without shared global yCounter', () => {
      assert.match(appJs, /positionSubtree\s*\(/, 'buildMindmapSrcdoc must use positionSubtree for positioning branches');
      assert.doesNotMatch(appJs, /let\s+yCounter\s*=\s*0;[\s\S]*?leftBranches[\s\S]*?rightBranches[\s\S]*?node\.y\s*=\s*yCounter\s*\*\s*80/, 'buildMindmapSrcdoc must not use sequential yCounter across left and right branches');
    });

    it('should auto-fit and tooltip long node labels in renderNodes', () => {
      assert.match(appJs, /node\.name\.length\s*>\s*\d+/, 'renderNodes should detect long labels for auto-fit or truncation');
    });
  });

  describe('2. Interactive Node-to-Chat Bridge', () => {
    it('should support postMessage EXPLAIN_NODE in iframe node click or actions', () => {
      assert.match(appJs, /type:\s*['"]EXPLAIN_NODE['"]/, 'Node interaction must send EXPLAIN_NODE postMessage');
    });

    it('should handle EXPLAIN_NODE message in app.js and trigger explanation', () => {
      assert.match(appJs, /event\.data\.type\s*===\s*['"]EXPLAIN_NODE['"]/, 'app.js must handle EXPLAIN_NODE message from iframe');
    });
  });

  describe('3. SVG Diagram Zoom Viewer & Console Optimization', () => {
    it('should provide SVG zoom / fullscreen viewer modal trigger in renderSvgDiagram', () => {
      assert.match(appJs, /openSvgModal|btn-svg-zoom|view_in_ar|fullscreen/, 'renderSvgDiagram must provide zoom/fullscreen trigger');
    });

    it('should support log filtering or copying in workspace console', () => {
      assert.match(appJs, /copyWorkspaceConsoleLogs|filterWorkspaceConsoleLogs/, 'app.js should provide console copy or filter helper');
    });

    it('should define styles for svg modal or zoom viewer in styles.css', () => {
      assert.match(stylesCss, /\.svg-zoom-modal|\.svg-fullscreen-viewer|\.svg-diagram-wrapper/, 'styles.css must style SVG viewer');
    });
  });
});
