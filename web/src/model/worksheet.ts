import type { ExamPayload, ScoringWeights } from "../types";
import { parseEssayCell, parseLocalizedNumber } from "../utils/clipboard";

export type VariableKindMode = "auto" | "multiple_choice" | "essay";
export type EffectiveVariableKind = "multiple_choice" | "essay";
export type WorksheetSummaryKind = "multiple_choice" | "essay" | "mixed";

export interface BlankWorksheetInit {
  mode?: VariableKindMode;
  defaultReference?: string;
  optionCount?: number;
  quickKeys?: string;
}

export interface WorksheetColumn {
  itemNumber: number;
  mode: VariableKindMode;
  referenceValue: string;
}

export interface WorksheetRow {
  name: string;
  cells: string[];
}

export interface WorksheetState {
  sourcePath: string | null;
  optionCount: number;
  weights: ScoringWeights;
  columns: WorksheetColumn[];
  rows: WorksheetRow[];
}

export interface CompiledWorksheet {
  exam: ExamPayload;
  hasActiveResponses: boolean;
  missingKeyItemNumbers: number[];
  summaryKind: WorksheetSummaryKind;
  mcCount: number;
  essayCount: number;
  effectiveKinds: EffectiveVariableKind[];
}

function isSingleAsciiLetter(raw: string): boolean {
  return /^[A-Za-z]$/.test(raw.trim());
}

function parsePositiveNumber(raw: string): number | null {
  const num = parseLocalizedNumber(raw);
  if (num === null || num <= 0) return null;
  return num;
}

export function resolveColumnKind(
  col: WorksheetColumn,
  rows: WorksheetRow[],
  colIndex: number,
): EffectiveVariableKind {
  if (col.mode !== "auto") return col.mode;
  const ref = col.referenceValue.trim();
  if (isSingleAsciiLetter(ref)) return "multiple_choice";
  if (parsePositiveNumber(ref) !== null) return "essay";

  for (const row of rows) {
    const cell = (row.cells[colIndex] ?? "").trim();
    if (!cell || cell === "*" || cell === "#") continue;
    if (!isSingleAsciiLetter(cell)) {
      const parsed = parseLocalizedNumber(cell);
      if (parsed !== null && parsed >= 0) return "essay";
    }
  }
  return "multiple_choice";
}

export function createBlankWorksheet(
  rowCount = 15,
  colCount = 10,
  init?: BlankWorksheetInit,
): WorksheetState {
  const mode: VariableKindMode = init?.mode ?? "auto";
  const cleanedMcKeys =
    init?.quickKeys && mode !== "essay"
      ? init.quickKeys.replace(/[^A-Za-z]/g, "").toUpperCase()
      : "";
  const defaultRef = init?.defaultReference !== undefined ? init.defaultReference.trim() : "";

  const columns: WorksheetColumn[] = Array.from({ length: colCount }, (_, idx) => ({
    itemNumber: idx + 1,
    mode,
    referenceValue: cleanedMcKeys ? (cleanedMcKeys[idx] ?? "") : defaultRef,
  }));
  const rows: WorksheetRow[] = Array.from({ length: rowCount }, () => ({
    name: "",
    cells: Array.from({ length: colCount }, () => ""),
  }));
  return {
    sourcePath: null,
    optionCount: init?.optionCount ?? 4,
    weights: { correct: 1, wrong: 0 },
    columns,
    rows,
  };
}

export function getActiveRowCount(rows: WorksheetRow[]): number {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row) continue;
    if (row.name.trim() !== "" || row.cells.some((c) => c.trim() !== "")) {
      return i + 1;
    }
  }
  return 0;
}

function normalizeMcKeyChar(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.length === 1 && /^[A-Za-z]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return "A";
}

function normalizeMcResponseChar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "*";
  const ch = trimmed.slice(0, 1);
  return /^[a-z]$/.test(ch) ? ch.toUpperCase() : ch;
}

export function worksheetToExamPayload(ws: WorksheetState): CompiledWorksheet {
  const activeCount = getActiveRowCount(ws.rows);
  const hasActiveResponses = activeCount > 0;
  const effectiveKinds = ws.columns.map((col, j) =>
    resolveColumnKind(col, ws.rows, j),
  );
  const missingKeyItemNumbers: number[] = [];
  ws.columns.forEach((col, j) => {
    const itemNum = col.itemNumber > 0 ? col.itemNumber : j + 1;
    const isValidRef =
      effectiveKinds[j] === "multiple_choice"
        ? isSingleAsciiLetter(col.referenceValue)
        : parsePositiveNumber(col.referenceValue) !== null;
    if (!isValidRef) {
      missingKeyItemNumbers.push(itemNum);
    }
  });
  const mcCount = effectiveKinds.filter((k) => k === "multiple_choice").length;
  const essayCount = effectiveKinds.length - mcCount;
  const summaryKind: WorksheetSummaryKind =
    mcCount > 0 && essayCount > 0
      ? "mixed"
      : essayCount > 0
        ? "essay"
        : "multiple_choice";

  const sourceRows = hasActiveResponses
    ? ws.rows.slice(0, activeCount)
    : ws.rows.slice(0, Math.min(2, Math.max(1, ws.rows.length)));

  if (summaryKind === "multiple_choice") {
    const answerKey = ws.columns.map((c) => normalizeMcKeyChar(c.referenceValue)).join("");
    const mcSubjects = sourceRows.map((row, idx) => ({
      name: row.name,
      responses: ws.columns
        .map((_, j) => normalizeMcResponseChar(row.cells[j] ?? ""))
        .join(""),
      original_index: idx,
    }));
    return {
      exam: {
        kind: "multiple_choice",
        source_path: ws.sourcePath,
        is_sorted_by_score: false,
        is_need_recalc: true,
        answer_key: answerKey,
        option_count: Math.max(2, Math.min(26, ws.optionCount)),
        weights: ws.weights,
        mc_subjects: mcSubjects,
      },
      hasActiveResponses,
      missingKeyItemNumbers,
      summaryKind,
      mcCount,
      essayCount,
      effectiveKinds,
    };
  }

  const mcIdeal = ws.weights.correct > 0 ? ws.weights.correct : 1;
  const wrongCredit = Math.max(0, ws.weights.wrong);
  const idealScores = ws.columns.map((col, j) => {
    if (effectiveKinds[j] === "essay") {
      return parsePositiveNumber(col.referenceValue) ?? 10;
    }
    return mcIdeal;
  });
  const itemNumbers = ws.columns.map((col, j) =>
    col.itemNumber > 0 ? col.itemNumber : j + 1,
  );
  const essaySubjects = sourceRows.map((row, idx) => ({
    name: row.name,
    scores: ws.columns.map((col, j) => {
      const raw = (row.cells[j] ?? "").trim();
      if (effectiveKinds[j] === "essay") {
        const parsed = parseEssayCell(raw);
        return parsed.valid ? parsed.value : null;
      }
      if (raw === "" || raw === "*" || raw === "#") return null;
      const key = normalizeMcKeyChar(col.referenceValue).toUpperCase();
      return raw.slice(0, 1).toUpperCase() === key ? mcIdeal : wrongCredit;
    }),
    original_index: idx,
  }));

  return {
    exam: {
      kind: "essay",
      source_path: ws.sourcePath,
      is_sorted_by_score: false,
      is_need_recalc: true,
      ideal_scores: idealScores,
      item_numbers: itemNumbers,
      essay_subjects: essaySubjects,
    },
    hasActiveResponses,
    missingKeyItemNumbers,
    summaryKind,
    mcCount,
    essayCount,
    effectiveKinds,
  };
}

export function examPayloadToWorksheet(exam: ExamPayload): WorksheetState {
  if (exam.kind === "multiple_choice") {
    const key = exam.answer_key ?? "A";
    const cols: WorksheetColumn[] = key.split("").map((ch, idx) => {
      const missing = Boolean(exam.has_missing_keys) || !isSingleAsciiAlphaChar(ch);
      return {
        itemNumber: idx + 1,
        mode: exam.has_missing_keys ? "multiple_choice" : isSingleAsciiLetter(ch) ? "auto" : "multiple_choice",
        referenceValue: missing ? "" : ch.toUpperCase(),
      };
    });
    const rows: WorksheetRow[] = (exam.mc_subjects ?? []).map((subj) => ({
      name: subj.name,
      cells: cols.map((_, j) => {
        const ch = subj.responses[j] ?? "*";
        return ch === "*" ? "" : ch;
      }),
    }));
    return {
      sourcePath: exam.source_path,
      optionCount: exam.option_count ?? 4,
      weights: exam.weights ?? { correct: 1, wrong: 0 },
      columns: cols,
      rows: rows.length > 0 ? rows : createBlankWorksheet(5, cols.length).rows,
    };
  }

  const ideals = exam.ideal_scores ?? [10];
  const itemNums = exam.item_numbers ?? ideals.map((_, idx) => idx + 1);
  const cols: WorksheetColumn[] = ideals.map((ideal, idx) => ({
    itemNumber: itemNums[idx] ?? idx + 1,
    mode: exam.has_missing_keys ? "essay" : "auto",
    referenceValue: exam.has_missing_keys ? "" : String(ideal),
  }));
  const rows: WorksheetRow[] = (exam.essay_subjects ?? []).map((subj) => ({
    name: subj.name,
    cells: cols.map((_, j) => {
      const val = subj.scores[j];
      return val === null || val === undefined ? "" : String(val);
    }),
  }));
  return {
    sourcePath: exam.source_path,
    optionCount: 4,
    weights: { correct: 1, wrong: 0 },
    columns: cols,
    rows: rows.length > 0 ? rows : createBlankWorksheet(5, cols.length).rows,
  };
}

function isSingleAsciiAlphaChar(ch: string): boolean {
  return /^[A-Za-z]$/.test(ch.trim());
}

export function ensureWorksheetSize(
  ws: WorksheetState,
  minRows: number,
  minCols: number,
): WorksheetState {
  const defaultMode: VariableKindMode =
    ws.columns.length > 0 && ws.columns.every((c) => c.mode === ws.columns[0]?.mode)
      ? ws.columns[0]!.mode
      : "auto";
  const nextCols =
    minCols > ws.columns.length
      ? [
          ...ws.columns,
          ...Array.from({ length: minCols - ws.columns.length }, (_, offset) => {
            const lastNum =
              ws.columns[ws.columns.length - 1]?.itemNumber ?? ws.columns.length;
            return {
              itemNumber: lastNum + offset + 1,
              mode: defaultMode,
              referenceValue: "",
            };
          }),
        ]
      : ws.columns;

  const colTarget = nextCols.length;
  const rowsWithCols = ws.rows.map((row) =>
    row.cells.length < colTarget
      ? {
          ...row,
          cells: [
            ...row.cells,
            ...Array.from({ length: colTarget - row.cells.length }, () => ""),
          ],
        }
      : row,
  );

  const nextRows =
    minRows > rowsWithCols.length
      ? [
          ...rowsWithCols,
          ...Array.from({ length: minRows - rowsWithCols.length }, () => ({
            name: "",
            cells: Array.from({ length: colTarget }, () => ""),
          })),
        ]
      : rowsWithCols;

  return {
    ...ws,
    columns: nextCols,
    rows: nextRows,
  };
}

export function setWorksheetCell(
  ws: WorksheetState,
  rowIdx: number,
  colIdx: number,
  value: string,
): WorksheetState {
  const expanded = ensureWorksheetSize(
    ws,
    rowIdx >= 0 ? rowIdx + 1 : ws.rows.length,
    colIdx >= 0 ? colIdx + 1 : ws.columns.length,
  );

  if (rowIdx === -1 && colIdx >= 0) {
    const trimmed = value.trim();
    const normalized = isSingleAsciiLetter(trimmed) ? trimmed.toUpperCase() : trimmed;
    return {
      ...expanded,
      columns: expanded.columns.map((c, j) =>
        j === colIdx ? { ...c, referenceValue: normalized } : c,
      ),
    };
  }

  if (rowIdx >= 0 && colIdx === -1) {
    return {
      ...expanded,
      rows: expanded.rows.map((r, i) => (i === rowIdx ? { ...r, name: value } : r)),
    };
  }

  if (rowIdx >= 0 && colIdx >= 0) {
    const colMeta = expanded.columns[colIdx];
    const kind = colMeta ? resolveColumnKind(colMeta, expanded.rows, colIdx) : "multiple_choice";
    const trimmed = value.trim();
    const normalized =
      kind === "multiple_choice" && isSingleAsciiLetter(trimmed)
        ? trimmed.toUpperCase()
        : trimmed;
    return {
      ...expanded,
      rows: expanded.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const nextCells = [...r.cells];
        nextCells[colIdx] = normalized;
        return { ...r, cells: nextCells };
      }),
    };
  }

  return expanded;
}

export function pasteWorksheetBlock(
  ws: WorksheetState,
  startRow: number,
  startCol: number,
  matrix: string[][],
): { next: WorksheetState; applied: number } {
  if (matrix.length === 0) return { next: ws, applied: 0 };
  const maxWidth = Math.max(...matrix.map((r) => r.length), 0);
  const reqRows = Math.max(ws.rows.length, startRow + matrix.length);
  const reqCols = Math.max(ws.columns.length, startCol + maxWidth);
  const expanded = ensureWorksheetSize(ws, reqRows, reqCols);

  const columns = expanded.columns.map((c) => ({ ...c }));
  const rows = expanded.rows.map((r) => ({ ...r, cells: [...r.cells] }));
  let applied = 0;

  matrix.forEach((rowVals, rOffset) => {
    const targetRow = startRow + rOffset;
    if (targetRow < -1) return;
    rowVals.forEach((cellVal, cOffset) => {
      const targetCol = startCol + cOffset;
      if (targetCol < -1) return;
      if (targetRow === -1) {
        if (targetCol >= 0 && targetCol < columns.length) {
          const trimmed = cellVal.trim();
          columns[targetCol]!.referenceValue = isSingleAsciiLetter(trimmed)
            ? trimmed.toUpperCase()
            : trimmed;
          applied += 1;
        }
        return;
      }
      const row = rows[targetRow];
      if (!row) return;
      if (targetCol === -1) {
        row.name = cellVal;
        applied += 1;
      } else if (targetCol >= 0) {
        const trimmed = cellVal.trim();
        const colMeta = columns[targetCol];
        const kind = colMeta ? resolveColumnKind(colMeta, rows, targetCol) : "multiple_choice";
        row.cells[targetCol] =
          kind === "multiple_choice" && isSingleAsciiLetter(trimmed)
            ? trimmed.toUpperCase()
            : trimmed;
        applied += 1;
      }
    });
  });

  return { next: { ...expanded, columns, rows }, applied };
}

const PASTE_NAME_HEADER_RE =
  /^(nama(\s+(lengkap|peserta|siswa|mahasiswa))?|peserta|siswa|mahasiswa|subjek|responden|name|no\.?)$/i;
const PASTE_ITEM_HEADER_RE = /^(?:[qbs]\s*\d+|soal\s*\d+|butir\s*\d+|item\s*\d+|\d+)$/i;
const PASTE_KEY_MARKER_RE =
  /^(kunci(\s+jawaban)?|key|answer\s*key|skor\s*ideal|skor_ideal|skor\s*maks|ideal|bobot)$/i;

export function smartPasteWorksheet(
  ws: WorksheetState,
  startRow: number,
  startCol: number,
  matrix: string[][],
): { next: WorksheetState; applied: number; smartMapped: boolean } {
  if (matrix.length >= 2 && (matrix[0]?.length ?? 0) >= 2 && startRow <= 0 && startCol <= 0) {
    const firstRow = matrix[0] ?? [];
    const firstCell = (firstRow[0] ?? "").trim();
    const otherHeaderHits = firstRow
      .slice(1)
      .filter((c) => PASTE_ITEM_HEADER_RE.test(c.trim())).length;
    const hasHeader =
      PASTE_NAME_HEADER_RE.test(firstCell) ||
      (otherHeaderHits >= Math.max(1, Math.floor((firstRow.length - 1) * 0.6)));

    let cursor = hasHeader ? 1 : 0;
    let keyValues: string[] | null = null;
    const candidateKeyRow = matrix[cursor];
    if (candidateKeyRow && PASTE_KEY_MARKER_RE.test((candidateKeyRow[0] ?? "").trim())) {
      keyValues = candidateKeyRow.slice(1);
      cursor += 1;
    }

    const dataSlice = matrix.slice(cursor);
    const hasNameColumn =
      startCol === -1 ||
      hasHeader ||
      keyValues !== null ||
      (startRow === 0 &&
        startCol === 0 &&
        dataSlice.length > 0 &&
        dataSlice.filter((r) => {
          const c0 = (r[0] ?? "").trim();
          return c0.length > 1 && parseLocalizedNumber(c0) === null;
        }).length >= Math.ceil(dataSlice.length * 0.5));

    if (hasHeader || keyValues !== null || (startRow === 0 && startCol === 0 && hasNameColumn)) {
      let nextWs = ws;
      let totalApplied = 0;

      if (keyValues && keyValues.length > 0) {
        const keyRes = pasteWorksheetBlock(nextWs, -1, 0, [keyValues]);
        nextWs = keyRes.next;
        totalApplied += keyRes.applied;
      }

      if (dataSlice.length > 0) {
        const dataRes = pasteWorksheetBlock(
          nextWs,
          Math.max(0, startRow),
          hasNameColumn ? -1 : startCol,
          dataSlice,
        );
        nextWs = dataRes.next;
        totalApplied += dataRes.applied;
      }

      return { next: nextWs, applied: totalApplied, smartMapped: true };
    }
  }

  const fallback = pasteWorksheetBlock(ws, startRow, startCol, matrix);
  return { ...fallback, smartMapped: false };
}

export function clearWorksheetRange(
  ws: WorksheetState,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
): WorksheetState {
  return {
    ...ws,
    rows: ws.rows.map((row, rIdx) => {
      if (rIdx < minRow || rIdx > maxRow) return row;
      const nextName = minCol <= -1 && maxCol >= -1 ? "" : row.name;
      const nextCells = row.cells.map((cell, cIdx) =>
        cIdx >= minCol && cIdx <= maxCol ? "" : cell,
      );
      return { name: nextName, cells: nextCells };
    }),
  };
}

export function addWorksheetRow(ws: WorksheetState): WorksheetState {
  return ensureWorksheetSize(ws, ws.rows.length + 1, ws.columns.length);
}

export function addWorksheetColumn(ws: WorksheetState): WorksheetState {
  return ensureWorksheetSize(ws, ws.rows.length, ws.columns.length + 1);
}

export function removeWorksheetRow(ws: WorksheetState, rowIndex: number): WorksheetState {
  if (ws.rows.length <= 1 || rowIndex < 0 || rowIndex >= ws.rows.length) return ws;
  return {
    ...ws,
    rows: ws.rows.filter((_, idx) => idx !== rowIndex),
  };
}

export function removeWorksheetColumn(ws: WorksheetState, colIndex: number): WorksheetState {
  if (ws.columns.length <= 1 || colIndex < 0 || colIndex >= ws.columns.length) return ws;
  return {
    ...ws,
    columns: ws.columns.filter((_, idx) => idx !== colIndex),
    rows: ws.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, idx) => idx !== colIndex),
    })),
  };
}
