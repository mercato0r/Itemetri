import type {
  EffectiveVariableKind,
  VariableKindMode,
  WorksheetState,
} from "../model/worksheet";

interface VariableSetupDrawerProps {
  open: boolean;
  worksheet: WorksheetState;
  colIndex: number;
  effectiveKinds: EffectiveVariableKind[];
  onSelectColumn: (colIndex: number) => void;
  onUpdateWorksheet: (updater: (current: WorksheetState) => WorksheetState) => void;
  onClose: () => void;
}

export function VariableSetupDrawer({
  open,
  worksheet,
  colIndex,
  effectiveKinds,
  onSelectColumn,
  onUpdateWorksheet,
  onClose,
}: VariableSetupDrawerProps) {
  if (!open) return null;

  const safeIdx = Math.max(0, Math.min(worksheet.columns.length - 1, colIndex));
  const col = worksheet.columns[safeIdx];
  if (!col) return null;
  const resolvedKind = effectiveKinds[safeIdx] ?? "multiple_choice";

  const updateColumn = (patch: Partial<typeof col>) => {
    onUpdateWorksheet((curr) => ({
      ...curr,
      columns: curr.columns.map((c, idx) =>
        idx === safeIdx ? { ...c, ...patch } : c,
      ),
    }));
  };

  const applyModeAll = (mode: VariableKindMode) => {
    onUpdateWorksheet((curr) => ({
      ...curr,
      columns: curr.columns.map((c) => {
        if (mode === "multiple_choice" && !/^[A-Za-z]$/.test(c.referenceValue.trim())) {
          return { ...c, mode, referenceValue: "A" };
        }
        if (mode === "essay" && !(Number(c.referenceValue) > 0)) {
          return { ...c, mode, referenceValue: "10" };
        }
        return { ...c, mode };
      }),
    }));
  };

  return (
    <section className="var-drawer no-print" aria-labelledby="var-drawer-title">
      <div className="pane-header" style={{ marginBlockEnd: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <h2 id="var-drawer-title" className="pane-heading">
            Setup Variabel: Butir #{col.itemNumber} ({safeIdx + 1}/{worksheet.columns.length})
          </h2>
          <span className="var-status-tag">
            Aktif: {resolvedKind === "multiple_choice" ? "Pilihan Ganda" : "Uraian"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={safeIdx <= 0 ? "true" : undefined}
            onClick={() => {
              if (safeIdx > 0) onSelectColumn(safeIdx - 1);
            }}
          >
            Sebelumnya
          </button>
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={safeIdx >= worksheet.columns.length - 1 ? "true" : undefined}
            onClick={() => {
              if (safeIdx < worksheet.columns.length - 1) onSelectColumn(safeIdx + 1);
            }}
          >
            Berikutnya
          </button>
          <button type="button" className="btn btn-compact" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>

      <div className="var-drawer-grid">
        <div className="field-inline">
          <label htmlFor="var-item-num">Nomor butir</label>
          <input
            id="var-item-num"
            type="number"
            min={1}
            value={col.itemNumber}
            onChange={(e) => {
              const num = Number(e.target.value);
              if (Number.isInteger(num) && num >= 1) {
                updateColumn({ itemNumber: num });
              }
            }}
          />
        </div>

        <div className="field-inline">
          <label htmlFor="var-kind-mode">Tipe butir</label>
          <select
            id="var-kind-mode"
            value={col.mode}
            onChange={(e) => {
              const nextMode = e.target.value as VariableKindMode;
              if (nextMode === "multiple_choice" && !/^[A-Za-z]$/.test(col.referenceValue.trim())) {
                updateColumn({ mode: nextMode, referenceValue: "A" });
              } else if (nextMode === "essay" && !(Number(col.referenceValue) > 0)) {
                updateColumn({ mode: nextMode, referenceValue: "10" });
              } else {
                updateColumn({ mode: nextMode });
              }
            }}
          >
            <option value="auto">Otomatis (deteksi dari Kunci/Ideal)</option>
            <option value="multiple_choice">Pilihan Ganda (Kunci huruf)</option>
            <option value="essay">Uraian (Skor ideal angka)</option>
          </select>
        </div>

        <div className="field-inline">
          <label htmlFor="var-ref-val">
            {resolvedKind === "multiple_choice" ? "Kunci jawaban (huruf)" : "Skor ideal (> 0)"}
          </label>
          <input
            id="var-ref-val"
            type="text"
            value={col.referenceValue}
            onChange={(e) => updateColumn({ referenceValue: e.target.value })}
          />
        </div>

        <div className="field-inline">
          <label htmlFor="var-opt-count">Jumlah opsi PG (K)</label>
          <input
            id="var-opt-count"
            type="number"
            min={2}
            max={26}
            value={worksheet.optionCount}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isInteger(val) && val >= 2 && val <= 26) {
                onUpdateWorksheet((curr) => ({ ...curr, optionCount: val }));
              }
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBlockStart: "var(--space-2)" }}>
        <button type="button" className="btn btn-compact" onClick={() => applyModeAll("auto")}>
          Semua Otomatis
        </button>
        <button
          type="button"
          className="btn btn-compact"
          onClick={() => applyModeAll("multiple_choice")}
        >
          Semua ke PG
        </button>
        <button type="button" className="btn btn-compact" onClick={() => applyModeAll("essay")}>
          Semua ke Uraian
        </button>
      </div>
    </section>
  );
}
