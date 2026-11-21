import type { ExamPayload, ScoringWeights } from "../types";
import { parseEssayCell } from "../utils/clipboard";

export type VariableKindMode = "auto" | "multiple_choice" | "essay";
export type EffectiveVariableKind = "multiple_choice" | "essay";
export type WorksheetSummaryKind = "multiple_choice" | "essay" | "mixed";

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
  summaryKind: WorksheetSummaryKind;
  mcCount: number;
  essayCount: number;
  effectiveKinds: EffectiveVariableKind[];
}

function isSingleAsciiLetter(raw: string): boolean {
  return /^[A-Za-z]$/.test(raw.trim());
}

function parsePositiveNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
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
      const parsed = Number(cell);
      if (Number.isFinite(parsed) && parsed >= 0) return "essay";
    }
  }
  return "multiple_choice";
}

export function createBlankWorksheet(rowCount = 15, colCount = 10): WorksheetState {
  const columns: WorksheetColumn[] = Array.from({ length: colCount }, (_, idx) => ({
    itemNumber: idx + 1,
    mode: "auto",
    referenceValue: "A",
  }));
  const rows: WorksheetRow[] = Array.from({ length: rowCount }, () => ({
    name: "",
    cells: Array.from({ length: colCount }, () => ""),
  }));
  return {
    sourcePath: null,
    optionCount: 4,
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
    return trimmed;
  }
  return "A";
}

function normalizeMcResponseChar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "*";
  return trimmed.slice(0, 1);
}

export function worksheetToExamPayload(ws: WorksheetState): CompiledWorksheet {
  const activeCount = getActiveRowCount(ws.rows);
  const hasActiveResponses = activeCount > 0;
  const effectiveKinds = ws.columns.map((col, j) =>
    resolveColumnKind(col, ws.rows, j),
  );
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
    summaryKind,
    mcCount,
    essayCount,
    effectiveKinds,
  };
}

export function examPayloadToWorksheet(exam: ExamPayload): WorksheetState {
  if (exam.kind === "multiple_choice") {
    const key = exam.answer_key ?? "A";
    const cols: WorksheetColumn[] = key.split("").map((ch, idx) => ({
      itemNumber: idx + 1,
      mode: isSingleAsciiLetter(ch) ? "auto" : "multiple_choice",
      referenceValue: ch.toUpperCase(),
    }));
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
    mode: "auto",
    referenceValue: String(ideal),
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

export function ensureWorksheetSize(
  ws: WorksheetState,
  minRows: number,
  minCols: number,
): WorksheetState {
  const nextCols =
    minCols > ws.columns.length
      ? [
          ...ws.columns,
          ...Array.from({ length: minCols - ws.columns.length }, (_, offset) => {
            const lastNum =
              ws.columns[ws.columns.length - 1]?.itemNumber ?? ws.columns.length;
            return {
              itemNumber: lastNum + offset + 1,
              mode: "auto" as const,
              referenceValue: "A",
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
    return {
      ...expanded,
      columns: expanded.columns.map((c, j) =>
        j === colIdx ? { ...c, referenceValue: value.trim() } : c,
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
    return {
      ...expanded,
      rows: expanded.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const nextCells = [...r.cells];
        nextCells[colIdx] = value;
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
          if (trimmed) {
            columns[targetCol]!.referenceValue = trimmed;
            applied += 1;
          }
        }
        return;
      }
      const row = rows[targetRow];
      if (!row) return;
      if (targetCol === -1) {
        row.name = cellVal;
        applied += 1;
      } else if (targetCol >= 0) {
        row.cells[targetCol] = cellVal.trim();
        applied += 1;
      }
    });
  });

  return { next: { ...expanded, columns, rows }, applied };
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
