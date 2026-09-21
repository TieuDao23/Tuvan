const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const APP_SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const STYLES_SOURCE = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

describe('DOC Reading & Mindmap UI Hygiene Suite', () => {
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
      getFileExtension: (fn) => (fn && typeof fn === 'string' ? fn.split('.').pop().toLowerCase() : '')
    };
    vm.createContext(sandbox);
  });

  describe('1. Enhanced extractTextFromBinaryDoc Unit Tests', () => {
    let extractTextFromBinaryDoc;

    beforeEach(() => {
      const start = APP_SOURCE.indexOf('function extractTextFromBinaryDoc(');
      const end = APP_SOURCE.indexOf('async function readBinaryDoc(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);
      extractTextFromBinaryDoc = sandbox.extractTextFromBinaryDoc;
    });

    it('1.1 should extract UTF-16LE text starting at an even byte offset', () => {
      const text = 'Cộng hòa Xã hội Chủ nghĩa Việt Nam - Độc lập Tự do Hạnh phúc';
      const textBuf = Buffer.from(text, 'utf16le');
      const padEven = Buffer.alloc(100); // 100 bytes (even offset)
      const fullBuf = Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0]), padEven, textBuf]);
      const arrayBuffer = fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength);

      const res = extractTextFromBinaryDoc(arrayBuffer);
      assert.ok(res.includes('Cộng hòa Xã hội Chủ nghĩa Việt Nam'), 'Must extract even-offset UTF-16LE text');
      assert.ok(res.includes('Độc lập Tự do Hạnh phúc'), 'Must preserve Vietnamese accented text');
    });

    it('1.2 should extract UTF-16LE text starting at an ODD byte offset', () => {
      const text = 'Thông báo Học viện 2026: Kế hoạch đào tạo và tuyển sinh';
      const textBuf = Buffer.from(text, 'utf16le');
      const padOdd = Buffer.alloc(101); // 101 bytes (ODD offset!)
      const fullBuf = Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0]), padOdd, textBuf]);
      const arrayBuffer = fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength);

      const res = extractTextFromBinaryDoc(arrayBuffer);
      assert.ok(res.includes('Thông báo Học viện 2026'), 'Must extract odd-offset UTF-16LE text');
      assert.ok(res.includes('Kế hoạch đào tạo'), 'Must handle Vietnamese tone marks on odd offset');
    });

    it('1.3 should extract Vietnamese text with special punctuation (en-dash, quotes, bullets, currency)', () => {
      const text = '“Thông báo số 15/TB-HV” – Học phí: 5.000.000₫ • Hạn nộp: 30/11/2026';
      const textBuf = Buffer.from(text, 'utf16le');
      const fullBuf = Buffer.concat([Buffer.alloc(200), textBuf, Buffer.alloc(50)]);
      const arrayBuffer = fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength);

      const res = extractTextFromBinaryDoc(arrayBuffer);
      assert.ok(res.includes('Thông báo số 15/TB-HV'), 'Must preserve quotation marks and text');
      assert.ok(res.includes('Học phí: 5.000.000₫'), 'Must preserve Vietnamese currency symbol');
      assert.ok(res.includes('Hạn nộp: 30/11/2026'), 'Must preserve bullet and dates');
    });

    it('1.4 should extract 8-bit text (UTF-8 bytes)', () => {
      const text = 'Thông báo khẩn cấp từ Ban Giám Hiệu Học Viện năm 2026';
      const textBuf = Buffer.from(text, 'utf8');
      const fullBuf = Buffer.concat([Buffer.alloc(50), textBuf, Buffer.alloc(50)]);
      const arrayBuffer = fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength);

      const res = extractTextFromBinaryDoc(arrayBuffer);
      assert.ok(res.includes('Thông báo khẩn cấp'), 'Must extract UTF-8 encoded text runs');
      assert.ok(res.includes('Ban Giám Hiệu Học Viện'), 'Must preserve 8-bit multi-byte characters');
    });

    it('1.5 should return empty string gracefully for tiny or empty buffer', () => {
      assert.strictEqual(extractTextFromBinaryDoc(new ArrayBuffer(0)), '');
      assert.strictEqual(extractTextFromBinaryDoc(new ArrayBuffer(2)), '');
      assert.strictEqual(extractTextFromBinaryDoc(null), '');
    });
  });

  describe('2. Enhanced readBinaryDoc Format Support', () => {
    let readBinaryDoc;

    beforeEach(() => {
      const start = APP_SOURCE.indexOf('function extractTextFromBinaryDoc(');
      const end = APP_SOURCE.indexOf('async function processFileForInput(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);
      readBinaryDoc = sandbox.readBinaryDoc;
    });

    it('2.1 should extract text from HTML-based .doc file (portal export)', async () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Thông báo Học viện</title></head>
        <body>
          <h1>HỌC VIỆN CÔNG NGHỆ 2026</h1>
          <p>Kính gửi: Toàn thể sinh viên và học viên</p>
          <table>
            <tr><th>Nội dung</th><th>Thời gian</th></tr>
            <tr><td>Khai giảng khóa mới</td><td>15/10/2026</td></tr>
          </table>
        </body>
        </html>
      `;
      const file = {
        name: 'Thông báo Học viện 2026.doc',
        size: Buffer.byteLength(htmlContent),
        arrayBuffer: async () => {
          const buf = Buffer.from(htmlContent, 'utf8');
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
      };

      const result = await readBinaryDoc(file);
      assert.ok(result.includes('HỌC VIỆN CÔNG NGHỆ 2026'), 'Must parse HTML heading');
      assert.ok(result.includes('Kính gửi: Toàn thể sinh viên và học viên'), 'Must parse HTML paragraph');
      assert.ok(result.includes('Khai giảng khóa mới\t15/10/2026'), 'Must parse HTML table cells');
      assert.doesNotMatch(result, /<[^>]+>/, 'Must strip all HTML tags');
    });

    it('2.2 should extract text from XML-based .doc file (WordprocessingML)', async () => {
      const xmlContent = `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
          <w:body>
            <w:p><w:r><w:t>Kế hoạch tốt nghiệp năm 2026</w:t></w:r></w:p>
          </w:body>
        </w:wordDocument>
      `;
      const file = {
        name: 'Ke_hoach_2026.doc',
        size: Buffer.byteLength(xmlContent),
        arrayBuffer: async () => {
          const buf = Buffer.from(xmlContent, 'utf8');
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
      };

      const result = await readBinaryDoc(file);
      assert.ok(result.includes('Kế hoạch tốt nghiệp năm 2026'), 'Must parse WordprocessingML text');
    });

    it('2.3 should extract text from binary OLE2 .doc file', async () => {
      const text = 'Quyết định ban hành quy chế đào tạo Học viện 2026';
      const textBuf = Buffer.from(text, 'utf16le');
      const prefix = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
      const fullBuf = Buffer.concat([prefix, Buffer.alloc(512), textBuf, Buffer.alloc(100)]);
      const file = {
        name: 'Quyet_dinh.doc',
        size: fullBuf.length,
        arrayBuffer: async () => fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.length)
      };

      const result = await readBinaryDoc(file);
      assert.ok(result.includes('Quyết định ban hành quy chế đào tạo Học viện 2026'), 'Must read binary .doc');
    });

    it('2.4 should extract text from HTML-based .xls file', async () => {
      const htmlTable = '<table><tr><td>Mã HV</td><td>Họ tên</td><td>Điểm</td></tr><tr><td>HV01</td><td>Nguyễn Văn A</td><td>9.5</td></tr></table>';
      const file = {
        name: 'Diem_thi_2026.xls',
        size: Buffer.byteLength(htmlTable),
        arrayBuffer: async () => {
          const buf = Buffer.from(htmlTable, 'utf8');
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
      };

      const result = await readBinaryDoc(file);
      assert.ok(result.includes('Mã HV\tHọ tên\tĐiểm'), 'Must extract table headers from HTML .xls');
      assert.ok(result.includes('HV01\tNguyễn Văn A\t9.5'), 'Must extract table data from HTML .xls');
    });
  });

  describe('3. UI & Message Action Hygiene', () => {
    it('3.1 should NOT render unstyled raw buttons under filesHtml in app.js', () => {
      const renderStart = APP_SOURCE.indexOf('function renderMessages(');
      const renderEnd = APP_SOURCE.indexOf('function scrollToBottom(', renderStart);
      const renderCode = APP_SOURCE.slice(renderStart, renderEnd);

      const filesHtmlSection = renderCode.slice(
        renderCode.indexOf("let filesHtml = '';"),
        renderCode.indexOf('let renderContent =')
      );

      assert.doesNotMatch(
        filesHtmlSection,
        /<button class="btn-analyze-doc"/,
        'filesHtml must NOT contain raw .btn-analyze-doc button'
      );
      assert.doesNotMatch(
        filesHtmlSection,
        /<button class="btn-analyze-doc doc-to-mindmap"/,
        'filesHtml must NOT force unwanted "Sơ đồ tư duy" button under file card'
      );
    });

    it('3.2 should integrate doc-to-mindmap into message-actions toolbar on user messages with files', () => {
      const renderStart = APP_SOURCE.indexOf('function renderMessages(');
      const renderEnd = APP_SOURCE.indexOf('function scrollToBottom(', renderStart);
      const renderCode = APP_SOURCE.slice(renderStart, renderEnd);

      assert.match(
        renderCode,
        /action-btn doc-to-mindmap/,
        'message-actions must include doc-to-mindmap action button'
      );
      assert.match(
        renderCode,
        /summarizeDocumentToMindmapFromMessage/,
        'message-actions must call summarizeDocumentToMindmapFromMessage'
      );
    });

    it('3.3 should define CSS styling for .btn-analyze-doc in styles.css for design hygiene', () => {
      assert.match(
        STYLES_SOURCE,
        /\.btn-analyze-doc\s*\{/,
        'styles.css must style .btn-analyze-doc to prevent raw unstyled button appearance'
      );
      assert.match(
        STYLES_SOURCE,
        /body\.light-mode \.btn-analyze-doc\s*\{/,
        'styles.css must style .btn-analyze-doc for light mode'
      );
    });
  });
});
