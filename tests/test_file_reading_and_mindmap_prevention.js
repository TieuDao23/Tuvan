const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const APP_SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

describe('File Reading & Mindmap Prevention Test Suite (Visible)', () => {
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

  describe('1. DOCX, XLSX, and PPTX XML Parsers', () => {
    it('1.1 parseDocxXml should extract text, handle paragraphs, tables, and XML entities', () => {
      const start = APP_SOURCE.indexOf('function parseDocxXml(');
      const end = APP_SOURCE.indexOf('function parseXlsxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const xml = `
        <w:document>
          <w:body>
            <w:p><w:t>Tiêu đề tài liệu &amp; Báo cáo</w:t></w:p>
            <w:p><w:t>Nội dung đoạn văn có tab:</w:t><w:tab/><w:t>Giá trị &lt; 100 &gt; 50</w:t></w:p>
            <w:tbl>
              <w:tr>
                <w:tc><w:p><w:t>Cột 1</w:t></w:p></w:tc>
                <w:tc><w:p><w:t>Cột 2</w:t></w:p></w:tc>
              </w:tr>
              <w:tr>
                <w:tc><w:p><w:t>Dữ liệu A</w:t></w:p></w:tc>
                <w:tc><w:p><w:t>Dữ liệu B &quot;trích dẫn&quot;</w:t></w:p></w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>
      `;

      const result = sandbox.parseDocxXml(xml);
      assert.ok(result.includes('Tiêu đề tài liệu & Báo cáo'), 'Must unescape &amp;');
      assert.ok(result.includes('Giá trị < 100 > 50'), 'Must unescape &lt; and &gt;');
      assert.ok(result.includes('Dữ liệu B "trích dẫn"'), 'Must unescape &quot;');
      assert.ok(result.includes('Cột 1') && result.includes('Cột 2'), 'Must handle table row cells');
    });

    it('1.2 parseXlsxXml should resolve shared strings and format rows with tabs', () => {
      const start = APP_SOURCE.indexOf('function parseXlsxXml(');
      const end = APP_SOURCE.indexOf('function parsePptxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const sharedStrings = '<sst><si><t>Mã hàng</t></si><si><t>Tên sản phẩm</t></si><si><t>SP001</t></si><si><t>Laptop Suna Pro</t></si></sst>';
      const sheetXml = `
        <worksheet>
          <sheetData>
            <row r="1">
              <c r="A1" t="s"><v>0</v></c>
              <c r="B1" t="s"><v>1</v></c>
              <c r="C1"><v>Đơn giá</v></c>
            </row>
            <row r="2">
              <c r="A2" t="s"><v>2</v></c>
              <c r="B2" t="s"><v>3</v></c>
              <c r="C2"><v>15000000</v></c>
            </row>
          </sheetData>
        </worksheet>
      `;

      const result = sandbox.parseXlsxXml(sheetXml, sharedStrings);
      assert.ok(result.includes('Mã hàng\tTên sản phẩm\tĐơn giá'), 'Row 1 must have shared strings resolved');
      assert.ok(result.includes('SP001\tLaptop Suna Pro\t15000000'), 'Row 2 must have shared strings and numbers');
    });

    it('1.3 parsePptxXml should extract text from slide XML', () => {
      const start = APP_SOURCE.indexOf('function parsePptxXml(');
      const end = APP_SOURCE.indexOf('async function readBinaryDoc(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const slideXml = `
        <p:sld>
          <p:cSld>
            <p:spTree>
              <p:sp><p:txBody><a:p><a:r><a:t>Slide 1: Giới thiệu hệ thống</a:t></a:r></a:p></p:txBody></p:sp>
              <p:sp><p:txBody><a:p><a:r><a:t>Mục tiêu &amp; Lộ trình</a:t></a:r></a:p></p:txBody></p:sp>
            </p:spTree>
          </p:cSld>
        </p:sld>
      `;

      const result = sandbox.parsePptxXml(slideXml);
      assert.ok(result.includes('Slide 1: Giới thiệu hệ thống'));
      assert.ok(result.includes('Mục tiêu & Lộ trình'));
    });
  });

  describe('2. Zip Extractor', () => {
    it('2.1 extractFileFromZip should extract file from valid ZIP via Central Directory', async () => {
      const start = APP_SOURCE.indexOf('async function extractFileFromZip(');
      const end = APP_SOURCE.indexOf('function parseDocxXml(', start);
      const code = APP_SOURCE.slice(start, end);
      vm.runInContext(code, sandbox);

      const xmlContent = '<w:document><w:body><w:p><w:t>Hello DOCX</w:t></w:p></w:body></w:document>';
      const filename = 'word/document.xml';
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
      cdHdr.writeUInt32LE(0, 42); // local header offset: 0
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

      const extracted = await sandbox.extractFileFromZip(arrayBuffer, 'word/document.xml');
      assert.strictEqual(extracted, xmlContent);
    });
  });

  describe('3. TEXT_EXTENSIONS and SVG handling in processFileForInput', () => {
    it('3.1 TEXT_EXTENSIONS should contain comprehensive programming and document extensions including svg', () => {
      assert.match(APP_SOURCE, /const TEXT_EXTENSIONS = new Set\(\[/);
      const extMatch = APP_SOURCE.match(/const TEXT_EXTENSIONS = new Set\(\[([\s\S]*?)\]\);/);
      assert.ok(extMatch, 'TEXT_EXTENSIONS Set must exist');
      const exts = extMatch[1];
      const requiredExtensions = ['svg', 'h', 'hpp', 'ps1', 'lua', 'jsonl', 'vue', 'svelte', 'dart', 'tex', 'tsv', 'ipynb'];
      for (const ext of requiredExtensions) {
        assert.ok(exts.includes(`'${ext}'`), `TEXT_EXTENSIONS must contain '${ext}'`);
      }
    });

    it('3.2 processFileForInput should not treat SVG as an unreadable image', () => {
      // In processFileForInput: isTextFile(file) || ext === 'svg' || file.type === 'image/svg+xml'
      assert.match(
        APP_SOURCE,
        /isTextFile\(file\)\s*\|\|\s*ext === 'svg'\s*\|\|\s*file\.type === 'image\/svg\+xml'/,
        'processFileForInput must recognize SVG as text'
      );
      assert.match(
        APP_SOURCE,
        /file\.type\.startsWith\('image\/'\)\s*&&\s*ext !== 'svg'/,
        'processFileForInput must exclude .svg from being blocked by image/ check'
      );
    });
  });

  describe('4. Mindmap & Diagram Prevention System Prompt Rules', () => {
    it('4.1 Rule 1 must strictly forbid unrequested mindmaps', () => {
      assert.match(
        APP_SOURCE,
        /TUYỆT ĐỐI KHÔNG tự động tạo sơ đồ tư duy \(mindmap\) trong bất kỳ tin nhắn thông thường nào nếu người dùng KHÔNG YÊU CẦU RÕ RÀNG/,
        'System prompt Rule 1 must strictly forbid auto mindmap'
      );
    });

    it('4.2 Rule 4 must forbid mindmaps on file upload and mandate Markdown text', () => {
      assert.match(
        APP_SOURCE,
        /TUYỆT ĐỐI KHÔNG tự động tạo sơ đồ tư duy \(mindmap\) hay sơ đồ \(mermaid\/diagram\) khi nhận file tài liệu nếu người dùng KHÔNG YÊU CẦU RÕ RÀNG/,
        'System prompt Rule 4 must forbid auto diagrams on file upload'
      );
      assert.match(
        APP_SOURCE,
        /KHI NHẬN ĐƯỢC FILE: Hãy đọc kỹ toàn bộ nội dung file đính kèm, trình bày phân tích, tóm tắt hoặc giải đáp bằng văn bản Markdown mạch lạc/,
        'System prompt Rule 4 must mandate Markdown text analysis'
      );
    });

    it('4.3 Prompt invariants must be preserved for compatibility', () => {
      assert.match(APP_SOURCE, /\[Sơ đồ tư duy \(Mindmap\)\]/);
      assert.match(APP_SOURCE, /\[Tài liệu\]: Nếu người dùng đính kèm tài liệu/);
    });
  });

  describe('5. Mermaid Streaming Skeleton Hygiene in formatMessage', () => {
    it('5.1 Mermaid skeleton should say "Suna đang kết xuất sơ đồ..." not "phác thảo sơ đồ tư duy"', () => {
      const formatStart = APP_SOURCE.indexOf('function formatMessage(');
      const formatEnd = APP_SOURCE.indexOf('function renderMessages(', formatStart);
      const formatCode = APP_SOURCE.slice(formatStart, formatEnd);

      const mermaidStart = formatCode.indexOf("else if (cleanLang === 'mermaid')");
      const mermaidEnd = formatCode.indexOf("else if (cleanLang === 'kanban')", mermaidStart);
      const mermaidBranch = formatCode.slice(mermaidStart, mermaidEnd);

      assert.ok(
        !mermaidBranch.includes('phác thảo sơ đồ tư duy'),
        'Mermaid code block should not display "phác thảo sơ đồ tư duy"'
      );
      assert.ok(
        mermaidBranch.includes('Suna đang kết xuất sơ đồ...'),
        'Mermaid code block must display "Suna đang kết xuất sơ đồ..."'
      );
    });
  });

  describe('6. Empty User Text with Attached Files Handling', () => {
    it('6.1 buildTextOnlyMessages should prepend default prompt when user sends file without text', () => {
      const buildStart = APP_SOURCE.indexOf('function buildTextOnlyMessages(');
      const buildEnd = APP_SOURCE.indexOf('const SkillsManager =', buildStart);
      const buildCode = APP_SOURCE.slice(buildStart, buildEnd);
      vm.runInContext(buildCode, sandbox);

      const chatWithoutText = {
        messages: [
          {
            role: 'user',
            content: '',
            fileContent: '\n\n📄 File: bao_cao.docx (15.2KB)\n```docx\nNội dung báo cáo tài chính quý 1\n```'
          }
        ]
      };

      const msgs = sandbox.buildTextOnlyMessages(chatWithoutText, 'System Prompt');
      assert.strictEqual(msgs.length, 2);
      assert.ok(
        msgs[1].content.includes('Xin hãy đọc kỹ và phân tích nội dung tệp tin đính kèm này giúp mình nhé'),
        'Must prepend default analysis prompt'
      );
      assert.ok(
        msgs[1].content.includes('không vẽ sơ đồ'),
        'Default prompt must instruct not to draw diagrams'
      );
      assert.ok(
        msgs[1].content.includes('📄 File: bao_cao.docx'),
        'Must retain fileContent'
      );
    });

    it('6.2 buildTextOnlyMessages should preserve user text if provided with file', () => {
      const buildStart = APP_SOURCE.indexOf('function buildTextOnlyMessages(');
      const buildEnd = APP_SOURCE.indexOf('const SkillsManager =', buildStart);
      const buildCode = APP_SOURCE.slice(buildStart, buildEnd);
      vm.runInContext(buildCode, sandbox);

      const chatWithText = {
        messages: [
          {
            role: 'user',
            content: 'Tìm lỗi chính tả trong file này',
            fileContent: '\n\n📄 File: essay.docx (10KB)\n```docx\nNội dung bài viết\n```'
          }
        ]
      };

      const msgs = sandbox.buildTextOnlyMessages(chatWithText, 'System Prompt');
      assert.strictEqual(msgs.length, 2);
      assert.ok(msgs[1].content.startsWith('Tìm lỗi chính tả trong file này'));
      assert.ok(msgs[1].content.includes('📄 File: essay.docx'));
    });
  });

  describe('7. window.directApiCall Upgrades', () => {
    it('7.1 directApiCall should use max_tokens 4096 and handle reasoning models', async () => {
      const directStart = APP_SOURCE.indexOf('window.directApiCall = async function(');
      const directEnd = APP_SOURCE.indexOf('// ===== onUserSignedIn:', directStart);
      const directCode = APP_SOURCE.slice(directStart, directEnd);

      let capturedBody = null;
      sandbox.window = {
        directApiCall: null
      };
      sandbox.isReasoningModel = (m) => m.includes('o3') || m.includes('gemini-2.5');
      sandbox.fetch = async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: '# Sơ Đồ\n## Nhánh 1' } }] })
        };
      };

      vm.runInContext(directCode, sandbox);

      // Test standard model
      sandbox.getActiveModel = () => 'gpt-4o';
      await sandbox.window.directApiCall('Test prompt');
      assert.strictEqual(capturedBody.max_tokens, 4096, 'Standard model must use 4096 tokens');
      assert.strictEqual(capturedBody.temperature, 0.7, 'Standard model should have temperature');

      // Test reasoning model
      sandbox.getActiveModel = () => 'o3-mini';
      await sandbox.window.directApiCall('Test prompt 2');
      assert.strictEqual(capturedBody.max_tokens, 4096, 'Reasoning model must use 4096 tokens');
      assert.strictEqual(capturedBody.reasoning_effort, 'low', 'Reasoning model must set reasoning_effort: low');
      assert.strictEqual(capturedBody.temperature, undefined, 'Reasoning model should not specify temperature');
    });
  });
});
