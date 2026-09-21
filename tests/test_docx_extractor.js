const assert = require('assert');
const zlib = require('zlib');

// Enhanced ZIP parser supporting both Local File Headers and Central Directory
async function extractFileFromZip(arrayBuffer, targetPath) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const targetLower = targetPath.toLowerCase();

  // Helper to decompress
  async function decompress(compressedData, compression) {
    if (compression === 0) {
      return new TextDecoder('utf-8').decode(compressedData);
    }
    if (compression === 8) {
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compressedData);
        writer.close();
        const response = new Response(ds.readable);
        const decompressed = await response.arrayBuffer();
        return new TextDecoder('utf-8').decode(decompressed);
      } else if (typeof zlib !== 'undefined' && typeof zlib.inflateRawSync === 'function') {
        const buf = zlib.inflateRawSync(Buffer.from(compressedData));
        return buf.toString('utf8');
      }
    }
    return null;
  }

  // Strategy 1: Search Central Directory from End of Central Directory (EOCD)
  // EOCD signature is 0x06054b50, located in the last 65KB + 22 bytes
  const minEocdOffset = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const cdTotal = view.getUint16(eocdOffset + 10, true);
    let curCd = cdOffset;

    for (let i = 0; i < cdTotal && curCd + 46 <= bytes.length; i++) {
      if (view.getUint32(curCd, true) !== 0x02014b50) break;
      const compression = view.getUint16(curCd + 10, true);
      const compSize = view.getUint32(curCd + 20, true);
      const fnLen = view.getUint16(curCd + 28, true);
      const extraLen = view.getUint16(curCd + 30, true);
      const commentLen = view.getUint16(curCd + 32, true);
      const localHdrOffset = view.getUint32(curCd + 42, true);

      const fnBytes = bytes.subarray(curCd + 46, curCd + 46 + fnLen);
      const fn = new TextDecoder('utf-8').decode(fnBytes);

      if (fn.toLowerCase().endsWith(targetLower) || fn.toLowerCase() === targetLower) {
        // Read from local header to get exact data offset
        if (localHdrOffset + 30 <= bytes.length && view.getUint32(localHdrOffset, true) === 0x04034b50) {
          const locFnLen = view.getUint16(localHdrOffset + 26, true);
          const locExtraLen = view.getUint16(localHdrOffset + 28, true);
          const dataStart = localHdrOffset + 30 + locFnLen + locExtraLen;
          const compData = bytes.subarray(dataStart, dataStart + compSize);
          const result = await decompress(compData, compression);
          if (result !== null) return result;
        }
      }

      curCd += 46 + fnLen + extraLen + commentLen;
    }
  }

  // Strategy 2: Fallback scanning Local File Headers
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;

    const compression = view.getUint16(offset + 8, true);
    const flags = view.getUint16(offset + 6, true);
    let compressedSize = view.getUint32(offset + 18, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const fileNameStart = offset + 30;
    const fileNameBytes = bytes.subarray(fileNameStart, fileNameStart + fileNameLen);
    const fileName = new TextDecoder('utf-8').decode(fileNameBytes);
    const dataStart = fileNameStart + fileNameLen + extraLen;

    if (fileName.toLowerCase().endsWith(targetLower) || fileName.toLowerCase() === targetLower) {
      const compData = bytes.subarray(dataStart, dataStart + compressedSize);
      const result = await decompress(compData, compression);
      if (result !== null) return result;
    }

    offset = dataStart + compressedSize;
    if (flags & 0x08) {
      if (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x08074b50) offset += 16;
      else offset += 12;
    }
  }

  return null;
}

function parseDocxXml(xml) {
  if (!xml) return '';
  return xml
    .replace(/<w:br[^>]*\/>/gi, '\n')
    .replace(/<w:tab[^>]*\/>/gi, '\t')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/w:tr>/gi, '\n')
    .replace(/<\/w:tc>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseXlsxXml(sheetXml, sharedStringsXml) {
  if (!sheetXml) return '';
  // Parse shared strings table if available
  const sharedStrings = [];
  if (sharedStringsXml) {
    const siMatches = sharedStringsXml.match(/<si\b[\s\S]*?<\/si>/gi) || [];
    siMatches.forEach(si => {
      const textMatches = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/gi) || [];
      const val = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join('');
      sharedStrings.push(val);
    });
  }

  // Parse rows and cells
  const rows = [];
  const rowMatches = sheetXml.match(/<row\b[\s\S]*?<\/row>/gi) || [];
  rowMatches.forEach(r => {
    const row = [];
    const cellMatches = r.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/gi) || [];
    cellMatches.forEach(c => {
      const isString = /t="s"/i.test(c);
      const isInline = /t="inlineStr"/i.test(c);
      let val = '';
      if (isString) {
        const vMatch = c.match(/<v>(\d+)<\/v>/i);
        if (vMatch) {
          const idx = parseInt(vMatch[1], 10);
          val = sharedStrings[idx] || '';
        }
      } else if (isInline) {
        const tMatch = c.match(/<t[^>]*>([\s\S]*?)<\/t>/i);
        if (tMatch) val = tMatch[1];
      } else {
        const vMatch = c.match(/<v>([\s\S]*?)<\/v>/i);
        if (vMatch) val = vMatch[1];
      }
      row.push(val.trim());
    });
    if (row.some(cell => cell.length > 0)) {
      rows.push(row);
    }
  });

  if (rows.length === 0) return '';
  return rows.map(r => r.join('\t')).join('\n');
}

describe('DOCX & XLSX Zip Extractor Test', () => {
  it('should extract text from a mock docx zip via Central Directory', async () => {
    const xmlContent = '<w:document><w:body><w:p><w:t>Suna AI Document Reader</w:t></w:p><w:p><w:t>Đọc file Word thành công 100%</w:t></w:p></w:body></w:document>';
    const filename = 'word/document.xml';
    const compressed = zlib.deflateRawSync(Buffer.from(xmlContent, 'utf8'));

    const locHdr = Buffer.alloc(30 + filename.length);
    locHdr.writeUInt32LE(0x04034b50, 0);
    locHdr.writeUInt16LE(20, 4);
    locHdr.writeUInt16LE(0, 6);
    locHdr.writeUInt16LE(8, 8);
    locHdr.writeUInt16LE(0, 10);
    locHdr.writeUInt16LE(0, 12);
    locHdr.writeUInt32LE(0, 14);
    locHdr.writeUInt32LE(compressed.length, 18);
    locHdr.writeUInt32LE(Buffer.byteLength(xmlContent), 22);
    locHdr.writeUInt16LE(filename.length, 26);
    locHdr.writeUInt16LE(0, 28);
    locHdr.write(filename, 30);

    const cdHdr = Buffer.alloc(46 + filename.length);
    cdHdr.writeUInt32LE(0x02014b50, 0);
    cdHdr.writeUInt16LE(20, 4);
    cdHdr.writeUInt16LE(20, 6);
    cdHdr.writeUInt16LE(0, 8);
    cdHdr.writeUInt16LE(8, 10);
    cdHdr.writeUInt16LE(0, 12);
    cdHdr.writeUInt16LE(0, 14);
    cdHdr.writeUInt32LE(0, 16);
    cdHdr.writeUInt32LE(compressed.length, 20);
    cdHdr.writeUInt32LE(Buffer.byteLength(xmlContent), 24);
    cdHdr.writeUInt16LE(filename.length, 28);
    cdHdr.writeUInt16LE(0, 30);
    cdHdr.writeUInt16LE(0, 32);
    cdHdr.writeUInt16LE(0, 34);
    cdHdr.writeUInt16LE(0, 36);
    cdHdr.writeUInt32LE(0, 38);
    cdHdr.writeUInt32LE(0, 42); // local header offset: 0
    cdHdr.write(filename, 46);

    const cdOffset = locHdr.length + compressed.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdHdr.length, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);

    const zip = Buffer.concat([locHdr, compressed, cdHdr, eocd]);
    const arrayBuffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);

    const extractedXml = await extractFileFromZip(arrayBuffer, 'word/document.xml');
    assert.ok(extractedXml, 'Extracted XML must not be null');
    assert.ok(extractedXml.includes('Suna AI Document Reader'));

    const cleanText = parseDocxXml(extractedXml);
    assert.strictEqual(cleanText, 'Suna AI Document Reader\nĐọc file Word thành công 100%');
  });

  it('should parse XLSX sheet and shared strings into tabular text', () => {
    const sharedStrings = '<sst><si><t>Họ và Tên</t></si><si><t>Điểm số</t></si><si><t>Nguyễn Văn A</t></si></sst>';
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>10</v></c></row></sheetData></worksheet>';

    const parsed = parseXlsxXml(sheet, sharedStrings);
    assert.ok(parsed.includes('Họ và Tên\tĐiểm số'));
    assert.ok(parsed.includes('Nguyễn Văn A\t10'));
  });
});
