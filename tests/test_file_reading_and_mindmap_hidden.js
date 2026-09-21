const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const APP_SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

describe('File Reading & Mindmap Prevention Test Suite (Hidden)', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = {
      console,
      setTimeout,
      clearTimeout,
      TextDecoder,
      Uint8Array,
      DataView,
      ArrayBuffer,
      Buffer,
      zlib,
      require,
      DecompressionStream: globalThis.DecompressionStream,
      Response: globalThis.Response,
      State: {
        mode: 'pro',
        settings: { baseUrl: 'https://api.example.com', apiKey: 'key-123' },
        pendingFiles: [],
        pendingImages: [],
        models: ['gemini-2.5-pro', 'gpt-4o', 'o3-mini']
      },
      getActiveModel: () => 'gpt-4o',
      getProxyForModel: () => ({ url: 'https://api.example.com', key: 'key-123' }),
      fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })
    };
    vm.createContext(sandbox);
  });

  describe('H1. Edge Cases & Resilience in Zip Extraction', () => {
    it('H1.1 extractFileFromZip should return null gracefully for empty or tiny buffer', async () => {
      const start = APP_SOURCE.indexOf('async function extractFileFromZip(');
      const end = APP_SOURCE.indexOf('function parseDocxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const emptyBuf = new ArrayBuffer(0);
      const resEmpty = await sandbox.extractFileFromZip(emptyBuf, 'word/document.xml');
      assert.strictEqual(resEmpty, null, 'Empty buffer must return null');

      const tinyBuf = new ArrayBuffer(10);
      const resTiny = await sandbox.extractFileFromZip(tinyBuf, 'word/document.xml');
      assert.strictEqual(resTiny, null, 'Tiny buffer must return null');
    });

    it('H1.2 extractFileFromZip should return null for corrupted zip with bad signatures', async () => {
      const start = APP_SOURCE.indexOf('async function extractFileFromZip(');
      const end = APP_SOURCE.indexOf('function parseDocxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const fakeBuf = Buffer.from('This is not a zip file at all! Just random text data.');
      const arrayBuf = fakeBuf.buffer.slice(fakeBuf.byteOffset, fakeBuf.byteOffset + fakeBuf.byteLength);
      const resCorrupt = await sandbox.extractFileFromZip(arrayBuf, 'word/document.xml');
      assert.strictEqual(resCorrupt, null, 'Corrupted zip must return null without throwing');
    });

    it('H1.3 extractFileFromZip should return null when target file is missing from zip', async () => {
      const start = APP_SOURCE.indexOf('async function extractFileFromZip(');
      const end = APP_SOURCE.indexOf('function parseDocxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const xmlContent = '<test>Hello</test>';
      const filename = 'other/file.txt';
      const compressed = zlib.deflateRawSync(Buffer.from(xmlContent, 'utf8'));

      const locHdr = Buffer.alloc(30 + filename.length);
      locHdr.writeUInt32LE(0x04034b50, 0);
      locHdr.writeUInt16LE(20, 4);
      locHdr.writeUInt16LE(0, 6);
      locHdr.writeUInt16LE(8, 8);
      locHdr.writeUInt32LE(compressed.length, 18);
      locHdr.writeUInt32LE(Buffer.byteLength(xmlContent), 22);
      locHdr.writeUInt16LE(filename.length, 26);
      locHdr.write(filename, 30);

      const cdHdr = Buffer.alloc(46 + filename.length);
      cdHdr.writeUInt32LE(0x02014b50, 0);
      cdHdr.writeUInt16LE(20, 4);
      cdHdr.writeUInt16LE(20, 6);
      cdHdr.writeUInt16LE(8, 10);
      cdHdr.writeUInt32LE(compressed.length, 20);
      cdHdr.writeUInt32LE(Buffer.byteLength(xmlContent), 24);
      cdHdr.writeUInt16LE(filename.length, 28);
      cdHdr.writeUInt32LE(0, 42);
      cdHdr.write(filename, 46);

      const cdOffset = locHdr.length + compressed.length;
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(1, 8);
      eocd.writeUInt16LE(1, 10);
      eocd.writeUInt32LE(cdHdr.length, 12);
      eocd.writeUInt32LE(cdOffset, 16);

      const zip = Buffer.concat([locHdr, compressed, cdHdr, eocd]);
      const arrayBuffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);

      const resMissing = await sandbox.extractFileFromZip(arrayBuffer, 'word/document.xml');
      assert.strictEqual(resMissing, null, 'Non-existent target file must return null');
    });
  });

  describe('H2. Complex XML Entity Decoding & Empty Handling in Parsers', () => {
    it('H2.1 parseDocxXml should handle empty, whitespace, and complex entity combinations', () => {
      const start = APP_SOURCE.indexOf('function parseDocxXml(');
      const end = APP_SOURCE.indexOf('function parseXlsxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      assert.strictEqual(sandbox.parseDocxXml(''), '');
      assert.strictEqual(sandbox.parseDocxXml(null), '');

      const complexXml = '<w:p><w:t>&lt;script&gt;alert(&quot;test&quot; &amp; &apos;1&apos;);&lt;/script&gt;</w:t></w:p>';
      const parsed = sandbox.parseDocxXml(complexXml);
      assert.strictEqual(parsed, '<script>alert("test" & \'1\');</script>');
    });

    it('H2.2 parseXlsxXml should handle empty sheet, missing shared strings, and inline strings', () => {
      const start = APP_SOURCE.indexOf('function parseXlsxXml(');
      const end = APP_SOURCE.indexOf('function parsePptxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      assert.strictEqual(sandbox.parseXlsxXml(''), '');
      assert.strictEqual(sandbox.parseXlsxXml(null), '');

      // Inline strings without shared strings
      const sheetWithInline = `
        <worksheet>
          <sheetData>
            <row r="1">
              <c r="A1" t="inlineStr"><t>Trực tiếp</t></c>
              <c r="B1"><v>999</v></c>
            </row>
          </sheetData>
        </worksheet>
      `;
      const parsed = sandbox.parseXlsxXml(sheetWithInline, null);
      assert.ok(parsed.includes('Trực tiếp\t999'));
    });
  });

  describe('H3. PDF.js Worker Configuration & Safety Options', () => {
    it('H3.1 readPdfFile should configure workerSrc and safe loading options', () => {
      const start = APP_SOURCE.indexOf('async function readPdfFile(');
      const end = APP_SOURCE.indexOf('function getFileExtension(', start);
      const code = APP_SOURCE.slice(start, end);

      assert.ok(
        code.includes('pdfjsLib.GlobalWorkerOptions.workerSrc'),
        'readPdfFile must set workerSrc'
      );
      assert.ok(
        code.includes('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'),
        'readPdfFile must point workerSrc to cdnjs'
      );
      assert.ok(
        code.includes('isEvalSupported: false'),
        'readPdfFile must disable eval for security'
      );
      assert.ok(
        code.includes('useSystemFonts: true'),
        'readPdfFile must enable system fonts'
      );
    });
  });

  describe('H4. Multi-File Empty Prompt Chain & API URL Bridge', () => {
    it('H4.1 buildTextOnlyMessages should handle multiple files with empty user text', () => {
      const buildStart = APP_SOURCE.indexOf('function buildTextOnlyMessages(');
      const buildEnd = APP_SOURCE.indexOf('const SkillsManager =', buildStart);
      const buildCode = APP_SOURCE.slice(buildStart, buildEnd);
      vm.runInContext(buildCode, sandbox);

      const chat = {
        messages: [
          {
            role: 'user',
            content: '   ',
            fileContent: '\n\n📄 File: a.py\n```python\nprint(1)\n```\n\n📄 File: b.js\n```javascript\nconsole.log(2)\n```'
          }
        ]
      };

      const msgs = sandbox.buildTextOnlyMessages(chat, 'System Prompt');
      assert.strictEqual(msgs.length, 2);
      assert.ok(msgs[1].content.includes('Xin hãy đọc kỹ và phân tích nội dung tệp tin đính kèm này giúp mình nhé'));
      assert.ok(msgs[1].content.includes('📄 File: a.py'));
      assert.ok(msgs[1].content.includes('📄 File: b.js'));
    });

    it('H4.2 directApiCall should format URL with proxyBridgeUrl when available', async () => {
      const directStart = APP_SOURCE.indexOf('window.directApiCall = async function(');
      const directEnd = APP_SOURCE.indexOf('// ===== onUserSignedIn:', directStart);
      const directCode = APP_SOURCE.slice(directStart, directEnd);

      let requestedUrl = '';
      sandbox.window = { directApiCall: null };
      sandbox.getProxyForModel = () => ({
        url: 'https://openai.api.com/v1',
        key: 'secret-key',
        proxyBridgeUrl: 'https://bridge.example.com'
      });
      sandbox.fetch = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'test result' } }] })
        };
      };

      vm.runInContext(directCode, sandbox);
      await sandbox.window.directApiCall('hello');

      assert.ok(
        requestedUrl.startsWith('https://bridge.example.com/chat/completions?target='),
        'Must format through proxyBridgeUrl when present'
      );
      assert.ok(
        requestedUrl.includes(encodeURIComponent('https://openai.api.com/v1')),
        'Must URL encode target base URL'
      );
    });
  });

  describe('H5. Extended Document Parsers & Robustness Verification', () => {
    it('H5.1 extractFileFromZip with Windows backslash in zip entry path', async () => {
      const start = APP_SOURCE.indexOf('async function extractFileFromZip(');
      const end = APP_SOURCE.indexOf('function parseDocxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const xmlContent = '<w:document><w:body><w:p><w:t>Backslash Path Test</w:t></w:p></w:body></w:document>';
      const winFilename = 'word\\document.xml';
      const compressed = zlib.deflateRawSync(Buffer.from(xmlContent, 'utf8'));

      const locHdr = Buffer.alloc(30 + winFilename.length);
      locHdr.writeUInt32LE(0x04034b50, 0);
      locHdr.writeUInt16LE(20, 4);
      locHdr.writeUInt16LE(0, 6);
      locHdr.writeUInt16LE(8, 8);
      locHdr.writeUInt32LE(compressed.length, 18);
      locHdr.writeUInt32LE(Buffer.byteLength(xmlContent), 22);
      locHdr.writeUInt16LE(winFilename.length, 26);
      locHdr.write(winFilename, 30);

      const cdHdr = Buffer.alloc(46 + winFilename.length);
      cdHdr.writeUInt32LE(0x02014b50, 0);
      cdHdr.writeUInt16LE(20, 4);
      cdHdr.writeUInt16LE(20, 6);
      cdHdr.writeUInt16LE(8, 10);
      cdHdr.writeUInt32LE(compressed.length, 20);
      cdHdr.writeUInt32LE(Buffer.byteLength(xmlContent), 24);
      cdHdr.writeUInt16LE(winFilename.length, 28);
      cdHdr.writeUInt32LE(0, 42);
      cdHdr.write(winFilename, 46);

      const cdOffset = locHdr.length + compressed.length;
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(1, 8);
      eocd.writeUInt16LE(1, 10);
      eocd.writeUInt32LE(cdHdr.length, 12);
      eocd.writeUInt32LE(cdOffset, 16);

      const zip = Buffer.concat([locHdr, compressed, cdHdr, eocd]);
      const arrayBuffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);

      const extracted = await sandbox.extractFileFromZip(arrayBuffer, 'word/document.xml');
      assert.strictEqual(extracted, xmlContent, 'Must find and decompress entry with backslash separators');
    });

    it('H5.2 extractFileFromZip with empty 0-byte file without throwing', async () => {
      const start = APP_SOURCE.indexOf('async function extractFileFromZip(');
      const end = APP_SOURCE.indexOf('function parseDocxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const filename = 'empty.txt';
      const locHdr = Buffer.alloc(30 + filename.length);
      locHdr.writeUInt32LE(0x04034b50, 0);
      locHdr.writeUInt16LE(20, 4);
      locHdr.writeUInt16LE(0, 6);
      locHdr.writeUInt16LE(8, 8); // compression = 8 (deflate)
      locHdr.writeUInt32LE(0, 18); // compSize = 0
      locHdr.writeUInt32LE(0, 22); // uncompSize = 0
      locHdr.writeUInt16LE(filename.length, 26);
      locHdr.write(filename, 30);

      const cdHdr = Buffer.alloc(46 + filename.length);
      cdHdr.writeUInt32LE(0x02014b50, 0);
      cdHdr.writeUInt16LE(20, 4);
      cdHdr.writeUInt16LE(20, 6);
      cdHdr.writeUInt16LE(8, 10);
      cdHdr.writeUInt32LE(0, 20);
      cdHdr.writeUInt32LE(0, 24);
      cdHdr.writeUInt16LE(filename.length, 28);
      cdHdr.writeUInt32LE(0, 42);
      cdHdr.write(filename, 46);

      const cdOffset = locHdr.length;
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(1, 8);
      eocd.writeUInt16LE(1, 10);
      eocd.writeUInt32LE(cdHdr.length, 12);
      eocd.writeUInt32LE(cdOffset, 16);

      const zip = Buffer.concat([locHdr, cdHdr, eocd]);
      const arrayBuffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);

      const extracted = await sandbox.extractFileFromZip(arrayBuffer, 'empty.txt');
      assert.strictEqual(extracted, '', '0-byte file must return empty string without throwing');
    });

    it('H5.3 parseXlsxXml should handle t="str" formula strings and t="b" boolean cells', () => {
      const start = APP_SOURCE.indexOf('function parseXlsxXml(');
      const end = APP_SOURCE.indexOf('function parsePptxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const sheetXml = `
        <worksheet>
          <sheetData>
            <row r="1">
              <c r="A1" t="str"><v>Total Revenue</v></c>
              <c r="B1" t="b"><v>1</v></c>
              <c r="C1" t="b"><v>0</v></c>
              <c r="D1"><v>1234.56</v></c>
            </row>
          </sheetData>
        </worksheet>
      `;

      const result = sandbox.parseXlsxXml(sheetXml, '');
      assert.ok(result.includes('Total Revenue'), 't="str" formula string must be preserved');
      assert.ok(result.includes('TRUE'), 't="b" 1 must be TRUE');
      assert.ok(result.includes('FALSE'), 't="b" 0 must be FALSE');
      assert.ok(result.includes('1234.56'), 'numeric cell must be preserved');
    });

    it('H5.4 parseDocxXml should not double-unescape &amp;lt; and should decode numeric entities', () => {
      const start = APP_SOURCE.indexOf('function parseDocxXml(');
      const end = APP_SOURCE.indexOf('function parseXlsxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const xml = '<w:p><w:t>&amp;lt;div&amp;gt; &amp; &#8211; &#160; &#x20AC;</w:t></w:p>';
      const result = sandbox.parseDocxXml(xml);
      assert.ok(result.includes('&lt;div&gt;'), '&amp;lt; must decode to &lt; not <');
      assert.ok(result.includes('–'), '&#8211; must decode to en-dash');
      assert.ok(result.includes('€'), '&#x20AC; must decode to Euro sign');
    });

    it('H5.5 parsePptxXml should handle <a:br/> and <a:tab/>', () => {
      const start = APP_SOURCE.indexOf('function parsePptxXml(');
      const end = APP_SOURCE.indexOf('function parseOdfXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const slideXml = '<p:sp><p:txBody><a:p><a:r><a:t>Line 1</a:t></a:r><a:br/><a:r><a:t>Line 2</a:t></a:r><a:tab/><a:r><a:t>Tabbed</a:t></a:r></a:p></p:txBody></p:sp>';
      const result = sandbox.parsePptxXml(slideXml);
      assert.ok(result.includes('Line 1\nLine 2\tTabbed'), 'Must convert <a:br/> to newline and <a:tab/> to tab');
    });

    it('H5.6 parseOdfXml should extract text from OpenDocument XML', () => {
      const start = APP_SOURCE.indexOf('function parseOdfXml(');
      const end = APP_SOURCE.indexOf('function parseRtfText(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const odfXml = `
        <office:document-content>
          <office:body>
            <office:text>
              <text:h text:outline-level="1">Tiêu đề ODF</text:h>
              <text:p>Đoạn văn thứ nhất<text:line-break/>Dòng thứ hai<text:tab/>Cách một tab</text:p>
              <table:table>
                <table:table-row>
                  <table:table-cell><text:p>Ô 1</text:p></table:table-cell>
                  <table:table-cell><text:p>Ô 2</text:p></table:table-cell>
                </table:table-row>
              </table:table>
            </office:text>
          </office:body>
        </office:document-content>
      `;

      const result = sandbox.parseOdfXml(odfXml);
      assert.ok(result.includes('Tiêu đề ODF'), 'Must extract headings');
      assert.ok(result.includes('Đoạn văn thứ nhất\nDòng thứ hai\tCách một tab'), 'Must handle breaks and tabs');
      assert.ok(result.includes('Ô 1\tÔ 2'), 'Must handle table cells and rows');
    });

    it('H5.7 parseRtfText should extract text from RTF content', () => {
      const start = APP_SOURCE.indexOf('function parseRtfText(');
      const end = APP_SOURCE.indexOf('function extractTextFromBinaryDoc(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const rtf = '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Courier;}} \\f0\\fs24 Hello \\b World\\b0!\\par This is line 2.\\par}';
      const result = sandbox.parseRtfText(rtf);
      assert.ok(result.includes('Hello World!'), 'Must strip RTF formatting');
      assert.ok(result.includes('This is line 2.'), 'Must handle \\par as newline');
    });

    it('H5.8 extractTextFromBinaryDoc should extract UTF-16 and ASCII text runs', () => {
      const start = APP_SOURCE.indexOf('function extractTextFromBinaryDoc(');
      const end = APP_SOURCE.indexOf('async function readBinaryDoc(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      // Create a mock OLE2 buffer with UTF-16LE text
      const text = 'Nội dung tài liệu Word 97-2003 thử nghiệm';
      const buf = Buffer.from(text, 'utf16le');
      const prefix = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]); // OLE2 header
      const fullBuf = Buffer.concat([prefix, Buffer.alloc(100), buf, Buffer.alloc(100)]);
      const arrayBuffer = fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength);

      const result = sandbox.extractTextFromBinaryDoc(arrayBuffer);
      assert.ok(result.includes('Nội dung tài liệu Word 97-2003 thử nghiệm'), 'Must extract readable UTF-16LE text runs');
    });

    it('H5.9 file-input listener should route image files to pendingImages', () => {
      assert.match(
        APP_SOURCE,
        /file\.type\.startsWith\('image\/'\)\s*&&\s*ext !== 'svg'/,
        'file-input must intercept image files'
      );
      assert.match(
        APP_SOURCE,
        /addPendingImage\(compressed\)/,
        'file-input must call addPendingImage for attached images'
      );
    });
  });
});
