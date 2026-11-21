import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { GRID_COL_WIDTH, useVirtualGrid } from "../hooks/useVirtualGrid";
import {
  clearWorksheetRange,
  type EffectiveVariableKind,
  pasteWorksheetBlock,
  setWorksheetCell,
  type WorksheetState,
} from "../model/worksheet";
import { parseEssayCell, parseTsvBlock } from "../utils/clipboard";
import { validateEssayCell, validateMcCell } from "../utils/validation";

export interface CellCoord {
  row: number;
  col: number;
}

interface JamoviSpreadsheetProps {
  worksheet: WorksheetState;
  effectiveKinds: EffectiveVariableKind[];
  activeCell: CellCoord;
  selectionAnchor: CellCoord;
  onSelectRange: (anchor: CellCoord, focus: CellCoord) => void;
  onOpenVariableDrawer: (colIndex: number) => void;
  onAddColumn: () => void;
  onUpdateWorksheet: (updater: (current: WorksheetState) => WorksheetState) => void;
  onStatusMessage: (msg: string) => void;
}

const PHANTOM_ROWS = 5;
const PHANTOM_COLS = 3;

export function JamoviSpreadsheet({
  worksheet,
  effectiveKinds,
  activeCell,
  selectionAnchor,
  onSelectRange,
  onOpenVariableDrawer,
  onAddColumn,
  onUpdateWorksheet,
  onStatusMessage,
}: JamoviSpreadsheetProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLInputElement | null>(null);
  const pendingFocusRef = useRef<CellCoord | null>(null);
  const draggingRef = useRef(false);

  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    draft: string;
  } | null>(null);

  const totalRows = worksheet.rows.length + PHANTOM_ROWS;
  const totalCols = worksheet.columns.length + PHANTOM_COLS;

  const { rowItems, colItems, topPad, bottomPad, leftPad, rightPad, scrollToCell } =
    useVirtualGrid({
      scrollRef,
      totalRows,
      totalCols,
    });

  useEffect(() => {
    const onPointerUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, []);

  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target || editing !== null) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-grid-cell="${target.row}:${target.col}"]`,
    );
    if (el) {
      el.focus({ preventScroll: true });
      pendingFocusRef.current = null;
    }
  });

  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.focus();
      editorRef.current.select();
    }
  }, [editing?.row, editing?.col]);

  const minRow = Math.min(selectionAnchor.row, activeCell.row);
  const maxRow = Math.max(selectionAnchor.row, activeCell.row);
  const minCol = Math.min(selectionAnchor.col, activeCell.col);
  const maxCol = Math.max(selectionAnchor.col, activeCell.col);

  const getCellDisplayValue = (row: number, col: number): string => {
    if (row === -1) {
      if (col === -1) return "Kunci / Ideal";
      return worksheet.columns[col]?.referenceValue ?? "";
    }
    const rowObj = worksheet.rows[row];
    if (!rowObj) return "";
    if (col === -1) return rowObj.name;
    return rowObj.cells[col] ?? "";
  };

  const getCellValidationWarning = (row: number, col: number): string | null => {
    if (row < 0 || col < 0 || row >= worksheet.rows.length || col >= worksheet.columns.length) {
      return null;
    }
    const raw = (worksheet.rows[row]?.cells[col] ?? "").trim();
    if (!raw) return null;
    const kind = effectiveKinds[col] ?? "multiple_choice";
    if (kind === "multiple_choice") {
      return validateMcCell(raw, worksheet.optionCount);
    }
    const ideal = Number(worksheet.columns[col]?.referenceValue ?? "10");
    const parsed = parseEssayCell(raw);
    if (!parsed.valid) return `Nilai ${raw} tidak valid untuk butir uraian.`;
    if (Number.isFinite(ideal) && ideal > 0) {
      return validateEssayCell(parsed.value, ideal);
    }
    return null;
  };

  const commitDraft = (row: number, col: number, draft: string) => {
    const trimmed = draft.trim();
    if (row === -1 && col >= 0 && trimmed === "") {
      setEditing(null);
      return;
    }
    onUpdateWorksheet((curr) => setWorksheetCell(curr, row, col, col === -1 ? draft : trimmed));
    setEditing(null);
  };

  const moveFocusTo = (nextRow: number, nextCol: number, extendSelection = false) => {
    const clampedRow = Math.max(-1, Math.min(totalRows - 1, nextRow));
    const clampedCol = Math.max(-1, Math.min(totalCols - 1, nextCol));
    const focusTarget = { row: clampedRow, col: clampedCol };
    const nextAnchor = extendSelection ? selectionAnchor : focusTarget;
    pendingFocusRef.current = focusTarget;
    onSelectRange(nextAnchor, focusTarget);
    if (clampedRow >= 0 || clampedCol >= 0) {
      scrollToCell(Math.max(0, clampedRow), Math.max(0, clampedCol));
    }
  };

  const beginEdit = (row: number, col: number, initialValue?: string) => {
    if (row === -1 && col === -1) return;
    const seed = initialValue !== undefined ? initialValue : getCellDisplayValue(row, col);
    setEditing({ row, col, draft: seed });
  };

  const handleCellKeyDown = (row: number, col: number, e: KeyboardEvent<HTMLTableCellElement>) => {
    if (editing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocusTo(row + 1, col, e.shiftKey);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocusTo(row - 1, col, e.shiftKey);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocusTo(row, col + 1, e.shiftKey);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocusTo(row, col - 1, e.shiftKey);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveFocusTo(row, col + (e.shiftKey ? -1 : 1), false);
      return;
    }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      beginEdit(row, col);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onUpdateWorksheet((curr) =>
        clearWorksheetRange(curr, Math.max(0, minRow), maxRow, minCol, maxCol),
      );
      onStatusMessage("Rentang sel terpilih dibersihkan.");
      return;
    }
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !(row === -1 && col === -1)
    ) {
      e.preventDefault();
      beginEdit(row, col, e.key);
    }
  };

  const handleEditorKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!editing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const { row, col, draft } = editing;
      commitDraft(row, col, draft);
      moveFocusTo(row + 1, col, false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const { row, col, draft } = editing;
      commitDraft(row, col, draft);
      moveFocusTo(row, col + (e.shiftKey ? -1 : 1), false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      pendingFocusRef.current = { row: editing.row, col: editing.col };
      setEditing(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const { row, col, draft } = editing;
      commitDraft(row, col, draft);
      moveFocusTo(row - 1, col, false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const { row, col, draft } = editing;
      commitDraft(row, col, draft);
      moveFocusTo(row + 1, col, false);
    }
  };

  const handleGridCopy = (e: ClipboardEvent<HTMLDivElement>) => {
    if (editing) return;
    e.preventDefault();
    const lines: string[] = [];
    for (let r = minRow; r <= maxRow; r += 1) {
      const rowCells: string[] = [];
      for (let c = minCol; c <= maxCol; c += 1) {
        rowCells.push(r === -1 && c === -1 ? "" : getCellDisplayValue(r, c));
      }
      lines.push(rowCells.join("\t"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
    onStatusMessage("Rentang sel disalin ke papan klip.");
  };

  const handleGridPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const raw = e.clipboardData.getData("text/plain");
    if (!raw) return;
    const isMultiCell = raw.includes("\t") || raw.includes("\n") || raw.includes("\r");
    if (editing && !isMultiCell) return;

    const matrix = parseTsvBlock(raw);
    if (matrix.length === 0) return;

    e.preventDefault();
    setEditing(null);
    const startRow = activeCell.row === -1 && activeCell.col === -1 ? 0 : activeCell.row;
    const startCol = activeCell.row === -1 && activeCell.col === -1 ? 0 : activeCell.col;
    let appliedCount = 0;
    onUpdateWorksheet((curr) => {
      const res = pasteWorksheetBlock(curr, startRow, startCol, matrix);
      appliedCount = res.applied;
      return res.next;
    });
    onStatusMessage(`Menempel ${appliedCount} sel; dimensi lembar kerja otomatis disesuaikan.`);
  };

  const handleCellPointerDown = (
    row: number,
    col: number,
    e: React.PointerEvent<HTMLTableCellElement>,
  ) => {
    if (editing !== null) {
      if (editing.row === row && editing.col === col) {
        return;
      }
      commitDraft(editing.row, editing.col, editing.draft);
    }
    e.preventDefault();
    draggingRef.current = true;
    moveFocusTo(row, col, e.shiftKey);
  };

  const spacerColCount =
    2 + colItems.length + (leftPad > 0 ? 1 : 0) + (rightPad > 0 ? 1 : 0);

  const renderCellContent = (row: number, col: number, isPhantom: boolean) => {
    const isEditingHere = editing?.row === row && editing?.col === col;
    if (isEditingHere && editing) {
      return (
        <input
          ref={editorRef}
          type="text"
          className={col === -1 ? "grid-active-input name-input" : "grid-active-input"}
          value={editing.draft}
          aria-label={
            row === -1
              ? `Kunci atau skor ideal butir ${worksheet.columns[col]?.itemNumber ?? col + 1}`
              : col === -1
                ? `Nama peserta baris ${row + 1}`
                : `Isian peserta baris ${row + 1} butir ${worksheet.columns[col]?.itemNumber ?? col + 1}`
          }
          onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
          onKeyDown={handleEditorKeyDown}
          onBlur={() => commitDraft(row, col, editing.draft)}
        />
      );
    }

    const displayVal = getCellDisplayValue(row, col);
    if (isPhantom && !displayVal) {
      return <span className="grid-phantom-hint"></span>;
    }
    return <span className="grid-cell-text">{displayVal}</span>;
  };

  const isCellSelected = (row: number, col: number) =>
    row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;

  return (
    <div
      ref={scrollRef}
      className="table-wrapper jamovi-grid-wrapper"
      tabIndex={0}
      role="region"
      aria-label="Lembar data spreadsheet peserta dan variabel"
      onCopy={handleGridCopy}
      onPaste={handleGridPaste}
    >
      <table className="data-table jamovi-grid-table" role="grid" aria-rowcount={totalRows + 2}>
        <thead>
          <tr role="row">
            <th scope="col" className="grid-corner-cell col-sticky-idx">
              #
            </th>
            <th scope="col" className="grid-name-head col-sticky-name">
              Peserta / Variabel
            </th>
            {leftPad > 0 && (
              <th
                aria-hidden="true"
                style={{ width: `${leftPad}px`, minWidth: `${leftPad}px`, padding: 0, border: 0 }}
              />
            )}
            {colItems.map((colItem) => {
              const colIdx = colItem.index;
              const isPhantomCol = colIdx >= worksheet.columns.length;
              const colMeta = worksheet.columns[colIdx];
              const resolvedKind = effectiveKinds[colIdx] ?? "multiple_choice";
              const isColFocused = activeCell.col === colIdx;
              return (
                <th
                  key={colItem.key}
                  scope="col"
                  className={`grid-var-head${isPhantomCol ? " is-phantom" : ""}${isColFocused ? " is-col-active" : ""}`}
                  style={{ width: `${GRID_COL_WIDTH}px`, minWidth: `${GRID_COL_WIDTH}px` }}
                  onDoubleClick={() => {
                    if (!isPhantomCol) onOpenVariableDrawer(colIdx);
                  }}
                >
                  {isPhantomCol ? (
                    <button
                      type="button"
                      className="grid-var-head-btn"
                      title="Klik untuk menambah butir baru"
                      onClick={() => {
                        onAddColumn();
                        moveFocusTo(-1, colIdx, false);
                      }}
                    >
                      +{colIdx + 1}
                    </button>
                  ) : (
                    <div className="grid-var-head-inner">
                      <button
                        type="button"
                        className="grid-var-head-btn"
                        aria-label={`Butir ${colMeta?.itemNumber ?? colIdx + 1}, klik untuk memilih kolom`}
                        onClick={() => moveFocusTo(-1, colIdx, false)}
                      >
                        B{colMeta?.itemNumber ?? colIdx + 1}
                      </button>
                      <button
                        type="button"
                        className="grid-var-type-badge"
                        title="Buka Setup Variabel untuk butir ini"
                        aria-label={`Atur variabel butir ${colMeta?.itemNumber ?? colIdx + 1}, saat ini ${
                          resolvedKind === "multiple_choice" ? "Pilihan Ganda" : "Uraian"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveFocusTo(-1, colIdx, false);
                          onOpenVariableDrawer(colIdx);
                        }}
                      >
                        {resolvedKind === "multiple_choice" ? "PG" : "Ur"}
                      </button>
                    </div>
                  )}
                </th>
              );
            })}
            {rightPad > 0 && (
              <th
                aria-hidden="true"
                style={{ width: `${rightPad}px`, minWidth: `${rightPad}px`, padding: 0, border: 0 }}
              />
            )}
          </tr>

          <tr role="row" className="frozen-key-row">
            <th scope="row" className="grid-corner-cell col-sticky-idx">
              Ref
            </th>
            <td
              role="gridcell"
              data-grid-cell="-1:-1"
              tabIndex={activeCell.row === -1 && activeCell.col === -1 ? 0 : -1}
              className={`grid-name-cell col-sticky-name${
                activeCell.row === -1 && activeCell.col === -1 ? " is-active" : ""
              }`}
              onPointerDown={(e) => handleCellPointerDown(-1, -1, e)}
              onKeyDown={(e) => handleCellKeyDown(-1, -1, e)}
            >
              Kunci / Skor Ideal
            </td>
            {leftPad > 0 && (
              <td
                aria-hidden="true"
                style={{ width: `${leftPad}px`, minWidth: `${leftPad}px`, padding: 0, border: 0 }}
              />
            )}
            {colItems.map((colItem) => {
              const colIdx = colItem.index;
              const isPhantomCol = colIdx >= worksheet.columns.length;
              const isActive = activeCell.row === -1 && activeCell.col === colIdx;
              const isSelected = isCellSelected(-1, colIdx);
              return (
                <td
                  key={colItem.key}
                  role="gridcell"
                  data-grid-cell={`-1:${colIdx}`}
                  tabIndex={isActive ? 0 : -1}
                  className={`grid-data-cell mono${isPhantomCol ? " is-phantom" : ""}${
                    isSelected ? " is-selected" : ""
                  }${isActive ? " is-active" : ""}`}
                  style={{ width: `${GRID_COL_WIDTH}px`, minWidth: `${GRID_COL_WIDTH}px` }}
                  onPointerDown={(e) => handleCellPointerDown(-1, colIdx, e)}
                  onPointerEnter={() => {
                    if (draggingRef.current) {
                      onSelectRange(selectionAnchor, { row: -1, col: colIdx });
                    }
                  }}
                  onDoubleClick={() => beginEdit(-1, colIdx)}
                  onKeyDown={(e) => handleCellKeyDown(-1, colIdx, e)}
                >
                  {renderCellContent(-1, colIdx, isPhantomCol)}
                </td>
              );
            })}
            {rightPad > 0 && (
              <td
                aria-hidden="true"
                style={{ width: `${rightPad}px`, minWidth: `${rightPad}px`, padding: 0, border: 0 }}
              />
            )}
          </tr>
        </thead>

        <tbody>
          {topPad > 0 && (
            <tr aria-hidden="true" style={{ height: `${topPad}px` }}>
              <td colSpan={spacerColCount} style={{ padding: 0, border: 0 }} />
            </tr>
          )}

          {rowItems.map((rowItem) => {
            const rowIdx = rowItem.index;
            const isPhantomRow = rowIdx >= worksheet.rows.length;
            const isRowSelected = activeCell.row === rowIdx;
            const isNameActive = activeCell.row === rowIdx && activeCell.col === -1;
            const isNameSelected = isCellSelected(rowIdx, -1);

            return (
              <tr
                key={rowItem.key}
                role="row"
                style={{ height: `${rowItem.size}px` }}
                className={`${isPhantomRow ? "is-phantom-row" : ""}${isRowSelected ? " is-row-active" : ""}`}
              >
                <th scope="row" className="grid-idx-cell col-sticky-idx num">
                  {rowIdx + 1}
                </th>

                <td
                  role="gridcell"
                  data-grid-cell={`${rowIdx}:-1`}
                  tabIndex={isNameActive ? 0 : -1}
                  className={`grid-name-cell col-sticky-name${isPhantomRow ? " is-phantom" : ""}${
                    isNameSelected ? " is-selected" : ""
                  }${isNameActive ? " is-active" : ""}`}
                  onPointerDown={(e) => handleCellPointerDown(rowIdx, -1, e)}
                  onPointerEnter={() => {
                    if (draggingRef.current) {
                      onSelectRange(selectionAnchor, { row: rowIdx, col: -1 });
                    }
                  }}
                  onDoubleClick={() => beginEdit(rowIdx, -1)}
                  onKeyDown={(e) => handleCellKeyDown(rowIdx, -1, e)}
                >
                  {renderCellContent(rowIdx, -1, isPhantomRow)}
                </td>

                {leftPad > 0 && (
                  <td
                    aria-hidden="true"
                    style={{ width: `${leftPad}px`, minWidth: `${leftPad}px`, padding: 0, border: 0 }}
                  />
                )}

                {colItems.map((colItem) => {
                  const colIdx = colItem.index;
                  const isPhantom = isPhantomRow || colIdx >= worksheet.columns.length;
                  const isActive = activeCell.row === rowIdx && activeCell.col === colIdx;
                  const isSelected = isCellSelected(rowIdx, colIdx);
                  const warning = getCellValidationWarning(rowIdx, colIdx);

                  return (
                    <td
                      key={colItem.key}
                      role="gridcell"
                      data-grid-cell={`${rowIdx}:${colIdx}`}
                      tabIndex={isActive ? 0 : -1}
                      aria-invalid={warning ? "true" : undefined}
                      title={warning ?? undefined}
                      className={`grid-data-cell mono${isPhantom ? " is-phantom" : ""}${
                        isSelected ? " is-selected" : ""
                      }${isActive ? " is-active" : ""}${warning ? " has-cell-warning" : ""}`}
                      style={{ width: `${GRID_COL_WIDTH}px`, minWidth: `${GRID_COL_WIDTH}px` }}
                      onPointerDown={(e) => handleCellPointerDown(rowIdx, colIdx, e)}
                      onPointerEnter={() => {
                        if (draggingRef.current) {
                          onSelectRange(selectionAnchor, { row: rowIdx, col: colIdx });
                        }
                      }}
                      onDoubleClick={() => beginEdit(rowIdx, colIdx)}
                      onKeyDown={(e) => handleCellKeyDown(rowIdx, colIdx, e)}
                    >
                      {renderCellContent(rowIdx, colIdx, isPhantom)}
                    </td>
                  );
                })}

                {rightPad > 0 && (
                  <td
                    aria-hidden="true"
                    style={{ width: `${rightPad}px`, minWidth: `${rightPad}px`, padding: 0, border: 0 }}
                  />
                )}
              </tr>
            );
          })}

          {bottomPad > 0 && (
            <tr aria-hidden="true" style={{ height: `${bottomPad}px` }}>
              <td colSpan={spacerColCount} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
