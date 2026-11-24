import type {
  ExamKind,
  ExamPayload,
  TabularMappingParams,
  TabularPreviewResponse,
} from "../../types";
import { parseLocalizedNumber } from "../../utils/clipboard";
import { decodeBytes, StandaloneParseError } from "./encoding";
import { buildXlsxBytes, parseXlsxRows } from "./xlsxZip";

const KEY_MARKERS = new Set([
  "kunci",
  "key",
  "answer key",
  "skor ideal",
  "skor_ideal",
  "skor maks",
  "ideal",
  "bobot",
  "kunci jawaban",
]);

const NAME_HEADER_RE =
  /^(nama(\s+(lengkap|peserta|siswa|mahasiswa))?|peserta|siswa|mahasiswa|responden|subjek|full\s*name|student(\s*name)?|name)$/i;

function classifyIgnoredHeader(header: string): string | null {
  const h = header.trim();
  if (!h) return null;
  if (/^(timestamp|cap\s*waktu|waktu(\s*mulai|\s*selesai)?|tanggal|date|time)$/i.test(h)) {
    return "Waktu otomatis";
  }
  if (/^(email(\s*address)?|alamat\s*email|surel|telepon|no\.?\s*hp|wa)$/i.test(h)) {
    return "Kontak/Email";
  }
  if (/^(score|skor(\s*total|\s*akhir)?|total(\s*skor|\s*nilai)?|nilai(\s*akhir|\s*total)?|grade|poin)$/i.test(h)) {
    return "Skor total";
  }
  if (
    /^(no\.?|nomor(\s*urut|\s*absen|\s*induk)?|urut|absen|nis|nisn|nim|npm|nik|id(\s*peserta|\s*siswa)?|kelas|rombel|jurusan|prodi|sekolah|instansi|jenis\s*kelamin|jk|gender|token|password)$/i.test(
      h,
    )
  ) {
    return "Identitas/Kelas";
  }
  return null;
}

function looksLikeMetadataColumnSamples(rows: string[][], colIdx: number): boolean {
  const sample = rows.slice(0, 15).map((r) => (r[colIdx] ?? "").trim()).filter(Boolean);
  if (sample.length === 0) return false;
  let hits = 0;
  for (const val of sample) {
    if (
      val.includes("@") ||
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(val) ||
      /\d{1,2}:\d{2}:\d{2}/.test(val)
    ) {
      hits += 1;
    }
  }
  return hits >= Math.ceil(sample.length * 0.6);
}

function detectCsvDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (semis > commas) return ";";
  if (tabs > commas && tabs > 0) return "\t";
  return ",";
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

async function loadTabularRowsFromBytes(
  raw: Uint8Array,
  filename: string,
): Promise<string[][]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const { text } = decodeBytes(raw);
    const delim = detectCsvDelimiter(text);
    return parseCsvRows(text, delim);
  }
  if (lower.endsWith(".xlsx")) {
    return parseXlsxRows(raw);
  }
  throw new StandaloneParseError(
    `Unsupported tabular extension in '${filename}'; expected .csv or .xlsx.`,
  );
}

function isSingleAsciiAlpha(s: string): boolean {
  return s.length === 1 && /^[A-Za-z]$/.test(s);
}

function tryParseFiniteFloat(s: string): number | null {
  return parseLocalizedNumber(s);
}

function inferKind(keyCells: string[]): ExamKind {
  const allAlpha = keyCells.every((c) => isSingleAsciiAlpha(c));
  const allPosFloat = keyCells.every((c) => {
    const v = tryParseFiniteFloat(c);
    return v !== null && v > 0;
  });
  if (allPosFloat && !allAlpha) return "essay";
  if (allAlpha) return "multiple_choice";
  throw new StandaloneParseError(
    "Unable to detect exam kind from key/ideal row; specify mc or essay.",
    2,
  );
}

function inferKindFromDataSamples(
  dataRows: string[][],
  itemCols: number[],
): [ExamKind, string] {
  let alphaHits = 0;
  let numericHits = 0;
  let maxNum = 0;
  for (const row of dataRows.slice(0, 25)) {
    for (const col of itemCols) {
      const cell = row[col] ?? "";
      if (cell === "" || cell === "*" || cell === "#") continue;
      if (isSingleAsciiAlpha(cell)) {
        alphaHits++;
      } else {
        const num = tryParseFiniteFloat(cell);
        if (num !== null && num >= 0) {
          numericHits++;
          if (num > maxNum) maxNum = num;
        }
      }
    }
  }
  if (alphaHits >= numericHits && alphaHits > 0) {
    return ["multiple_choice", "A"];
  }
  const defaultIdeal =
    maxNum >= 1 && Number.isInteger(maxNum) ? String(maxNum) : "10";
  return ["essay", maxNum >= 1 ? defaultIdeal : "10"];
}

function parseItemNumbersFromHeader(headers: string[]): number[] {
  const parsed: number[] = [];
  for (const raw of headers) {
    const cleaned = raw.trim();
    if (/^\d+$/.test(cleaned) && Number(cleaned) > 0) {
      parsed.push(Number(cleaned));
    } else {
      return Array.from({ length: headers.length }, (_, i) => i + 1);
    }
  }
  return parsed;
}

export async function previewTabularBytes(
  raw: Uint8Array,
  filename: string,
  maxPreviewRows = 15,
): Promise<TabularPreviewResponse> {
  const parsed = await loadTabularRowsFromBytes(raw, filename);
  const nonEmpty = parsed.filter((r) => r.some((c) => c !== ""));
  if (nonEmpty.length === 0) {
    throw new StandaloneParseError("Tabular file contains no non-empty rows.", 1);
  }
  const totalCols = Math.max(...nonEmpty.map((r) => r.length));
  const padded = nonEmpty.map((r) =>
    Array.from({ length: totalCols }, (_, c) => r[c] ?? ""),
  );

  const hasHeader = padded.length >= 2;
  const headers = hasHeader ? padded[0]! : [];

  let nameColIndex: number | null = null;
  if (hasHeader) {
    const matchedName = headers.findIndex((h) => NAME_HEADER_RE.test(h.trim()));
    if (matchedName >= 0) {
      nameColIndex = matchedName;
    }
  }

  const ignoredColReasons: Record<number, string> = {};
  const ignoredSet = new Set<number>();
  const sampleBody = padded.slice(hasHeader ? 1 : 0);

  for (let c = 0; c < totalCols; c++) {
    if (c === nameColIndex) continue;
    if (hasHeader) {
      const reason = classifyIgnoredHeader(headers[c] ?? "");
      if (reason) {
        ignoredSet.add(c);
        ignoredColReasons[c] = reason;
        continue;
      }
    }
    if (looksLikeMetadataColumnSamples(sampleBody, c)) {
      ignoredSet.add(c);
      ignoredColReasons[c] = "Waktu/Email otomatis";
    }
  }

  if (nameColIndex === null && totalCols > 1 && !ignoredSet.has(0)) {
    nameColIndex = 0;
  }

  let itemColIndices: number[] = [];
  for (let c = 0; c < totalCols; c++) {
    if (c !== nameColIndex && !ignoredSet.has(c)) {
      itemColIndices.push(c);
    }
  }
  if (itemColIndices.length === 0) {
    itemColIndices =
      totalCols > 1 && nameColIndex !== null
        ? Array.from({ length: totalCols }, (_, c) => c).filter((c) => c !== nameColIndex)
        : [0];
  }

  let keyRowIndex: number | null = null;
  const maxKeyScan = Math.min(3, padded.length - 1);
  for (let r = 0; r <= maxKeyScan; r++) {
    const c0 = (padded[r]?.[0] ?? "").trim().toLowerCase();
    const cName = nameColIndex !== null ? (padded[r]?.[nameColIndex] ?? "").trim().toLowerCase() : "";
    if (KEY_MARKERS.has(c0) || (cName !== "" && KEY_MARKERS.has(cName))) {
      keyRowIndex = r;
      break;
    }
  }

  const dataRows = padded.filter((_, idx) => !(hasHeader && idx === 0) && idx !== keyRowIndex);
  let inferredKind: ExamKind;
  let defaultVal: string;
  if (keyRowIndex !== null) {
    const keyCells = itemColIndices.map((c) => padded[keyRowIndex!]![c]!);
    try {
      inferredKind = inferKind(keyCells);
      defaultVal = inferredKind === "multiple_choice" ? "A" : "10";
    } catch {
      [inferredKind] = inferKindFromDataSamples(dataRows, itemColIndices);
      defaultVal = inferredKind === "multiple_choice" ? "A" : "10";
    }
  } else {
    [inferredKind] = inferKindFromDataSamples(dataRows, itemColIndices);
    defaultVal = "";
  }

  return {
    filename,
    total_rows: padded.length,
    total_cols: totalCols,
    preview_rows: padded.slice(0, maxPreviewRows),
    suggested_mapping: {
      has_header_row: hasHeader,
      key_row_index: keyRowIndex,
      name_col_index: nameColIndex,
      item_col_indices: itemColIndices,
      inferred_kind: inferredKind,
      default_key_or_ideal: defaultVal,
      ignored_col_indices: [...ignoredSet].sort((a, b) => a - b),
      ignored_col_reasons: ignoredColReasons,
      missing_key_warning: keyRowIndex === null,
    },
  };
}

export async function readTabularDirectBytes(
  raw: Uint8Array,
  filename: string,
  kind: ExamKind | null,
  optionCount: number | null,
): Promise<ExamPayload> {
  const parsed = await loadTabularRowsFromBytes(raw, filename);
  const nonEmpty: Array<[number, string[]]> = [];
  parsed.forEach((row, idx) => {
    if (row.some((c) => c !== "")) nonEmpty.push([idx + 1, row]);
  });
  if (nonEmpty.length < 3) {
    throw new StandaloneParseError(
      "Tabular exam requires at least 3 non-empty rows: header, key/ideal, and 1 subject.",
      1,
    );
  }

  const headerRow = nonEmpty[0]![1];
  const itemCount = headerRow.length - 1;
  if (itemCount < 1) {
    throw new StandaloneParseError(
      "Header row must have Nama column plus at least one item column.",
      nonEmpty[0]![0],
    );
  }
  const [keyLine, keyRow] = nonEmpty[1]!;
  const keyLabel = (keyRow[0] ?? "").trim().toLowerCase();
  if (!KEY_MARKERS.has(keyLabel)) {
    throw new StandaloneParseError(
      `Row ${keyLine} col 1 must be Kunci/Key/Skor Ideal, got '${keyRow[0] ?? ""}'.`,
      keyLine,
    );
  }
  const keyCells = Array.from({ length: itemCount }, (_, i) => keyRow[i + 1] ?? "");
  if (keyCells.some((c) => c === "")) {
    throw new StandaloneParseError("Key/ideal row contains empty item cells.", keyLine);
  }

  const resolvedKind = kind ?? inferKind(keyCells);
  const subjectRows = nonEmpty.slice(2);

  if (resolvedKind === "multiple_choice") {
    for (let i = 0; i < keyCells.length; i++) {
      if (!isSingleAsciiAlpha(keyCells[i]!)) {
        throw new StandaloneParseError(
          `MC key at col ${i + 2} must be a single letter, got '${keyCells[i]}'.`,
          keyLine,
        );
      }
    }
    const answerKey = keyCells.join("");
    const lettersSeen = [...answerKey.toUpperCase()];
    const mcSubjects = subjectRows.map(([rowLine, row], idx) => {
      const name = row[0] ?? "";
      let responses = "";
      for (let col = 1; col <= itemCount; col++) {
        const cell = row[col] ?? "";
        if (cell === "") {
          responses += "*";
        } else if (cell.length === 1) {
          responses += cell;
          if (isSingleAsciiAlpha(cell)) lettersSeen.push(cell.toUpperCase());
        } else {
          throw new StandaloneParseError(
            `Subject '${name}' col ${col + 1} expected 1 character, got '${cell}'.`,
            rowLine,
          );
        }
      }
      return { name, responses, original_index: idx };
    });
    const maxOpt = Math.max(4, ...lettersSeen.map((c) => c.charCodeAt(0) - 64));
    return {
      kind: "multiple_choice",
      source_path: filename,
      is_sorted_by_score: false,
      is_need_recalc: true,
      answer_key: answerKey,
      option_count: optionCount ?? maxOpt,
      weights: { correct: 1.0, wrong: 0.0 },
      mc_subjects: mcSubjects,
    };
  }

  const idealScores = keyCells.map((cell, i) => {
    const val = tryParseFiniteFloat(cell);
    if (val === null || val <= 0) {
      throw new StandaloneParseError(
        `Essay ideal score at col ${i + 2} must be > 0, got '${cell}'.`,
        keyLine,
      );
    }
    return val;
  });

  const essaySubjects = subjectRows.map(([rowLine, row], idx) => {
    const name = row[0] ?? "";
    const scores: Array<number | null> = [];
    for (let col = 1; col <= itemCount; col++) {
      const cell = row[col] ?? "";
      if (cell === "" || cell === "*" || cell === "#") {
        scores.push(null);
      } else {
        const val = tryParseFiniteFloat(cell);
        if (val === null || val < 0) {
          throw new StandaloneParseError(
            `Subject '${name}' col ${col + 1} invalid score '${cell}'.`,
            rowLine,
          );
        }
        scores.push(val);
      }
    }
    return { name, scores, original_index: idx };
  });

  return {
    kind: "essay",
    source_path: filename,
    is_sorted_by_score: false,
    is_need_recalc: true,
    ideal_scores: idealScores,
    item_numbers: parseItemNumbersFromHeader(headerRow.slice(1, itemCount + 1)),
    essay_subjects: essaySubjects,
  };
}

export async function readTabularMappedBytes(
  raw: Uint8Array,
  filename: string,
  params: TabularMappingParams,
): Promise<ExamPayload> {
  const parsed = await loadTabularRowsFromBytes(raw, filename);
  const nonEmpty = parsed.filter((r) => r.some((c) => c !== ""));
  if (nonEmpty.length === 0) {
    throw new StandaloneParseError("Tabular file contains no non-empty rows.", 1);
  }
  const totalCols = Math.max(...nonEmpty.map((r) => r.length));
  const padded = nonEmpty.map((r) =>
    Array.from({ length: totalCols }, (_, c) => r[c] ?? ""),
  );

  const cols = params.itemColIndices;
  if (!cols || cols.length === 0) {
    throw new StandaloneParseError("At least one item column must be selected.");
  }

  const skip = new Set<number>();
  let headerLabels: string[] = [];
  if (params.hasHeaderRow) {
    skip.add(0);
    headerLabels = cols.map((c) => padded[0]![c]!);
  }
  if (params.keyRowIndex !== null) {
    skip.add(params.keyRowIndex);
  }

  const dataEntries = padded
    .map((row, idx) => ({ idx, row }))
    .filter((entry) => !skip.has(entry.idx));
  if (dataEntries.length === 0) {
    throw new StandaloneParseError("No participant data rows remain after header/key mapping.");
  }

  let resolvedKind: ExamKind;
  if (params.kind !== "auto") {
    resolvedKind = params.kind === "mc" ? "multiple_choice" : "essay";
  } else if (params.keyRowIndex !== null) {
    const keyCells = cols.map((c) => padded[params.keyRowIndex!]![c]!);
    try {
      resolvedKind = inferKind(keyCells);
    } catch {
      [resolvedKind] = inferKindFromDataSamples(
        dataEntries.map((d) => d.row),
        cols,
      );
    }
  } else {
    [resolvedKind] = inferKindFromDataSamples(
      dataEntries.map((d) => d.row),
      cols,
    );
  }

  if (resolvedKind === "multiple_choice") {
    const rawDef = params.defaultKeyOrIdeal.trim().toUpperCase();
    const hasMissingKeys = params.keyRowIndex === null && !isSingleAsciiAlpha(rawDef);
    const fallbackKey = isSingleAsciiAlpha(rawDef) ? rawDef : "A";
    let missingFromKeyRow = false;
    const keyChars = cols.map((col) => {
      if (params.keyRowIndex === null) return fallbackKey;
      const cell = padded[params.keyRowIndex]![col]!.trim().toUpperCase();
      if (cell === "") {
        if (!isSingleAsciiAlpha(rawDef)) missingFromKeyRow = true;
        return fallbackKey;
      }
      if (!isSingleAsciiAlpha(cell)) {
        throw new StandaloneParseError(
          `Kunci PG pada kolom ${col + 1} harus berupa 1 huruf (A-Z), ditemukan '${cell}'.`,
          params.keyRowIndex + 1,
        );
      }
      return cell;
    });
    const answerKey = keyChars.join("");
    const lettersSeen = [...answerKey.toUpperCase()];
    const mcSubjects = dataEntries.map(({ idx: rowIdx, row }, subjIdx) => {
      const name =
        params.nameColIndex !== null
          ? row[params.nameColIndex] ?? ""
          : `Peserta ${subjIdx + 1}`;
      let responses = "";
      for (const col of cols) {
        const cell = (row[col] ?? "").trim();
        if (cell === "") {
          responses += "*";
        } else if (cell.length === 1) {
          const upper = isSingleAsciiAlpha(cell) ? cell.toUpperCase() : cell;
          responses += upper;
          if (isSingleAsciiAlpha(upper)) lettersSeen.push(upper);
        } else {
          throw new StandaloneParseError(
            `Peserta '${name}' kolom ${col + 1}: diharapkan 1 huruf opsi (A-E), ditemukan '${cell}'.`,
            rowIdx + 1,
          );
        }
      }
      return { name, responses, original_index: subjIdx };
    });
    const maxOpt = Math.max(4, ...lettersSeen.map((c) => c.charCodeAt(0) - 64));
    return {
      kind: "multiple_choice",
      source_path: filename,
      is_sorted_by_score: false,
      is_need_recalc: true,
      answer_key: answerKey,
      option_count: params.optionCount ?? maxOpt,
      weights: { correct: 1.0, wrong: 0.0 },
      mc_subjects: mcSubjects,
      has_missing_keys: hasMissingKeys || missingFromKeyRow ? true : undefined,
    };
  }

  const parsedDefIdeal = tryParseFiniteFloat(params.defaultKeyOrIdeal);
  const hasMissingEssayIdeal =
    params.keyRowIndex === null && !(parsedDefIdeal !== null && parsedDefIdeal > 0);
  const fallbackIdeal = parsedDefIdeal !== null && parsedDefIdeal > 0 ? parsedDefIdeal : 10.0;
  const colObsMax = new Array<number>(cols.length).fill(0);

  const essaySubjects = dataEntries.map(({ idx: rowIdx, row }, subjIdx) => {
    const name =
      params.nameColIndex !== null
        ? row[params.nameColIndex] ?? ""
        : `Peserta ${subjIdx + 1}`;
    const scores: Array<number | null> = cols.map((col, j) => {
      const cell = (row[col] ?? "").trim();
      if (cell === "" || cell === "*" || cell === "#") return null;
      const val = tryParseFiniteFloat(cell);
      if (val === null || val < 0) {
        throw new StandaloneParseError(
          `Peserta '${name}' kolom ${col + 1}: nilai '${cell}' tidak valid untuk skor uraian.`,
          rowIdx + 1,
        );
      }
      if (val > colObsMax[j]!) colObsMax[j] = val;
      return val;
    });
    return { name, scores, original_index: subjIdx };
  });

  let missingEssayKeyCell = false;
  const idealScores = cols.map((col, j) => {
    if (params.keyRowIndex !== null) {
      const rawCell = padded[params.keyRowIndex]![col]!.trim();
      if (rawCell === "") {
        if (!(parsedDefIdeal !== null && parsedDefIdeal > 0)) missingEssayKeyCell = true;
        return colObsMax[j]! > 0 ? colObsMax[j]! : fallbackIdeal;
      }
      const val = tryParseFiniteFloat(rawCell);
      if (val === null || val <= 0) {
        throw new StandaloneParseError(
          `Skor ideal uraian pada kolom ${col + 1} harus > 0, ditemukan '${rawCell}'.`,
          params.keyRowIndex + 1,
        );
      }
      return val;
    }
    if (parsedDefIdeal !== null && parsedDefIdeal > 0) return parsedDefIdeal;
    return colObsMax[j]! > 0 ? colObsMax[j]! : 10.0;
  });

  return {
    kind: "essay",
    source_path: filename,
    is_sorted_by_score: false,
    is_need_recalc: true,
    ideal_scores: idealScores,
    item_numbers:
      headerLabels.length > 0
        ? parseItemNumbersFromHeader(headerLabels)
        : Array.from({ length: cols.length }, (_, i) => i + 1),
    essay_subjects: essaySubjects,
    has_missing_keys: hasMissingEssayIdeal || missingEssayKeyCell ? true : undefined,
  };
}

function examToRows(exam: ExamPayload): Array<Array<string | number>> {
  if (exam.kind === "multiple_choice") {
    const key = exam.answer_key ?? "";
    const header: Array<string | number> = [
      "Nama",
      ...Array.from({ length: key.length }, (_, i) => String(i + 1)),
    ];
    const keyRow: Array<string | number> = ["Kunci", ...key.split("")];
    const body: Array<Array<string | number>> = (exam.mc_subjects ?? []).map((s) => [
      s.name,
      ...s.responses.split(""),
    ]);
    return [header, keyRow, ...body];
  }
  const ideals = exam.ideal_scores ?? [];
  const nums =
    exam.item_numbers && exam.item_numbers.length === ideals.length
      ? exam.item_numbers
      : Array.from({ length: ideals.length }, (_, i) => i + 1);
  const header: Array<string | number> = ["Nama", ...nums.map((n) => String(n))];
  const keyRow: Array<string | number> = ["Skor Ideal", ...ideals];
  const body: Array<Array<string | number>> = (exam.essay_subjects ?? []).map((s) => [
    s.name,
    ...s.scores.map((v) => (v === null ? "*" : v)),
  ]);
  return [header, keyRow, ...body];
}

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

function sanitizeFormulaCell(cell: string | number): string | number {
  if (typeof cell === "number") return cell;
  if (FORMULA_PREFIX_RE.test(cell)) return `'${cell}`;
  return cell;
}

function csvEscape(cell: string | number): string {
  const safe = sanitizeFormulaCell(cell);
  const s = String(safe);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsvExamBytes(exam: ExamPayload): Uint8Array {
  const rows = examToRows(exam);
  const csvText = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  return new TextEncoder().encode(csvText);
}

export async function exportXlsxExamBytes(exam: ExamPayload): Promise<Uint8Array> {
  const rows = examToRows(exam).map((r) => r.map(sanitizeFormulaCell));
  return buildXlsxBytes("Data Mentah", rows);
}

export async function exportTemplateXlsxBytes(
  kind: "multiple_choice" | "essay",
): Promise<Uint8Array> {
  if (kind === "multiple_choice") {
    const rows: Array<Array<string | number>> = [
      ["Nama Peserta", "1", "2", "3", "4", "5"],
      ["Kunci", "A", "B", "C", "D", "A"],
      ["Contoh: Andi Pratama", "A", "B", "C", "D", "A"],
      ["Contoh: Siti Aminah", "A", "C", "C", "B", "A"],
    ];
    return buildXlsxBytes("Template PG", rows);
  }
  const rows: Array<Array<string | number>> = [
    ["Nama Peserta", "1", "2", "3", "4", "5"],
    ["Skor Ideal", 10, 10, 15, 15, 20],
    ["Contoh: Andi Pratama", 9, 8, 12, 14, 18],
    ["Contoh: Siti Aminah", 7, 10, 10, 12, 15],
  ];
  return buildXlsxBytes("Template Uraian", rows);
}
