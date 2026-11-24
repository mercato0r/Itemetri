/** Minimal zero-dependency XLSX (ZIP + OpenXML) reader & writer using native deflate-raw. */

import { StandaloneParseError } from "./encoding";

const MAX_ZIP_ENTRIES = 256;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_XLSX_ROWS = 50_000;
const MAX_XLSX_COLS = 5_000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  void writer.write(copy);
  void writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new StandaloneParseError(
            "Berkas XLSX melebihi batas ukuran dekompresi yang diizinkan (50 MB).",
          );
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    if (err instanceof StandaloneParseError) throw err;
    throw new StandaloneParseError("Berkas XLSX korup atau gagal didekompresi.");
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  void writer.write(copy);
  void writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function isLegacyXlsSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

async function unzipEntries(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (isLegacyXlsSignature(zipBytes)) {
    throw new StandaloneParseError(
      "Format .xls (Excel 97-2003) belum didukung. Silakan simpan ulang sebagai .xlsx atau .csv.",
    );
  }
  if (zipBytes.length < 22) {
    throw new StandaloneParseError("Berkas XLSX tidak valid atau terpotong.");
  }

  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let eocdOffset = -1;
  const minOffset = Math.max(0, zipBytes.length - 65557);
  for (let i = zipBytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new StandaloneParseError("Invalid ZIP/XLSX archive: missing EOCD.");
  }

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  if (cdEntries > MAX_ZIP_ENTRIES) {
    throw new StandaloneParseError(
      `Arsip XLSX memiliki terlalu banyak entri (${cdEntries} > ${MAX_ZIP_ENTRIES}).`,
    );
  }

  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const files = new Map<string, Uint8Array>();
  let totalUncompressed = 0;

  for (let idx = 0; idx < cdEntries; idx++) {
    if (cdOffset + 46 > zipBytes.length) {
      throw new StandaloneParseError("Corrupt ZIP central directory (truncated header).");
    }
    if (view.getUint32(cdOffset, true) !== 0x02014b50) {
      throw new StandaloneParseError("Corrupt ZIP central directory.");
    }
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const uncompSize = view.getUint32(cdOffset + 24, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);

    if (cdOffset + 46 + nameLen + extraLen + commentLen > zipBytes.length) {
      throw new StandaloneParseError("Corrupt ZIP central directory entry bounds.");
    }
    const name = decoder.decode(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;
    if (uncompSize > MAX_UNCOMPRESSED_BYTES || totalUncompressed + uncompSize > MAX_UNCOMPRESSED_BYTES) {
      throw new StandaloneParseError(
        "Berkas XLSX melebihi batas ukuran dekompresi yang diizinkan (50 MB).",
      );
    }
    if (localOffset + 30 > zipBytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new StandaloneParseError("Corrupt ZIP local file header.");
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > zipBytes.length) {
      throw new StandaloneParseError("Corrupt ZIP entry data (truncated archive).");
    }
    const compressed = zipBytes.subarray(dataStart, dataStart + compSize);

    let inflated: Uint8Array;
    if (method === 0) {
      if (compressed.byteLength > MAX_UNCOMPRESSED_BYTES - totalUncompressed) {
        throw new StandaloneParseError(
          "Berkas XLSX melebihi batas ukuran dekompresi yang diizinkan (50 MB).",
        );
      }
      inflated = new Uint8Array(compressed);
    } else if (method === 8) {
      inflated = await inflateRaw(compressed, MAX_UNCOMPRESSED_BYTES - totalUncompressed);
    } else {
      throw new StandaloneParseError(`Unsupported ZIP compression method ${method}.`);
    }
    totalUncompressed += inflated.byteLength;
    files.set(name, inflated);
  }
  return files;
}

async function buildZip(entries: Array<{ name: string; data: Uint8Array }>): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const compressed = await deflateRaw(entry.data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cdHeader.set(nameBytes, 46);

    localParts.push(localHeader, compressed);
    cdParts.push(cdHeader);
    offset += localHeader.length + compressed.length;
  }

  const cdSize = cdParts.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const totalLen = offset + cdSize + 22;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of [...localParts, ...cdParts, eocd]) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function unescapeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colRefToIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "").toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

function indexToColRef(colIdx: number): string {
  let n = colIdx + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function parseXlsxRows(raw: Uint8Array): Promise<string[][]> {
  const files = await unzipEntries(raw);
  const decoder = new TextDecoder("utf-8");

  const sharedStrings: string[] = [];
  const ssBytes = files.get("xl/sharedStrings.xml");
  if (ssBytes) {
    const ssXml = decoder.decode(ssBytes);
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(ssXml)) !== null) {
      const inner = m[1]!;
      const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let text = "";
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(inner)) !== null) {
        text += unescapeXmlText(tm[1]!);
      }
      sharedStrings.push(text);
    }
  }

  let sheetBytes = files.get("xl/worksheets/sheet1.xml");
  if (!sheetBytes) {
    const firstSheet = [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k));
    if (firstSheet) sheetBytes = files.get(firstSheet);
  }
  if (!sheetBytes) {
    throw new StandaloneParseError("Workbook has no worksheet.");
  }

  const sheetXml = decoder.decode(sheetBytes);
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml)) !== null) {
    if (rows.length >= MAX_XLSX_ROWS) {
      throw new StandaloneParseError(
        `Berkas XLSX melebihi batas maksimum ${MAX_XLSX_ROWS} baris.`,
      );
    }
    const rowInner = rm[1]!;
    const rowCells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let fallbackCol = 0;

    while ((cm = cellRe.exec(rowInner)) !== null) {
      const attrs = cm[1] ?? "";
      const body = cm[2] ?? "";
      const refMatch = /\br=["']([A-Z]+\d+)["']/i.exec(attrs);
      const colIdx = refMatch ? colRefToIndex(refMatch[1]!) : fallbackCol;
      fallbackCol = colIdx + 1;
      if (colIdx < 0 || colIdx >= MAX_XLSX_COLS) {
        continue;
      }
      while (rowCells.length <= colIdx) rowCells.push("");

      const typeMatch = /\bt=["']([^"']+)["']/i.exec(attrs);
      const cellType = typeMatch?.[1] ?? "";

      if (cellType === "inlineStr") {
        const tMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body);
        rowCells[colIdx] = tMatch ? unescapeXmlText(tMatch[1]!).trim() : "";
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
        const rawVal = vMatch ? unescapeXmlText(vMatch[1]!).trim() : "";
        if (cellType === "s") {
          const idx = Number(rawVal);
          rowCells[colIdx] = Number.isInteger(idx) ? (sharedStrings[idx] ?? "").trim() : "";
        } else if (cellType === "b") {
          rowCells[colIdx] = rawVal === "1" ? "TRUE" : "FALSE";
        } else {
          rowCells[colIdx] = rawVal;
        }
      }
    }
    rows.push(rowCells);
  }
  return rows;
}

export async function buildXlsxBytes(
  sheetName: string,
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const safeSheet = escapeXmlText(sheetName.slice(0, 31) || "Data");

  const rowXmlParts = rows.map((row, rIdx) => {
    const rNum = rIdx + 1;
    const cells = row
      .map((val, cIdx) => {
        const ref = `${indexToColRef(cIdx)}${rNum}`;
        if (typeof val === "number" && Number.isFinite(val)) {
          return `<c r="${ref}"><v>${val}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXmlText(String(val))}</t></is></c>`;
      })
      .join("");
    return `<row r="${rNum}">${cells}</row>`;
  });

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rowXmlParts.join("")}</sheetData>` +
    "</worksheet>";

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets>` +
    "</workbook>";

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    "</Types>";

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const wbRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    "</Relationships>";

  return buildZip([
    { name: "[Content_Types].xml", data: enc.encode(contentTypesXml) },
    { name: "_rels/.rels", data: enc.encode(rootRelsXml) },
    { name: "xl/workbook.xml", data: enc.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRelsXml) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml) },
  ]);
}
