import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  EffectiveVariableKind,
  VariableKindMode,
  WorksheetState,
} from "../model/worksheet";
import { parseLocalizedNumberList } from "../utils/clipboard";

interface VariableSetupDrawerProps {
  open: boolean;
  worksheet: WorksheetState;
  colIndex: number;
  effectiveKinds: EffectiveVariableKind[];
  missingKeyItemNumbers: number[];
  itemIndicators: string[];
  initialTab?: "keys" | "indicators";
  focusQuickKeySignal?: number;
  onSelectColumn: (colIndex: number) => void;
  onUpdateWorksheet: (updater: (current: WorksheetState) => WorksheetState) => void;
  onSaveIndicators: (indicators: string[]) => void;
  onStatusMessage?: (msg: string) => void;
  onClose: () => void;
}

export function VariableSetupDrawer({
  open,
  worksheet,
  colIndex,
  effectiveKinds,
  missingKeyItemNumbers,
  itemIndicators,
  initialTab = "keys",
  focusQuickKeySignal,
  onSelectColumn,
  onUpdateWorksheet,
  onSaveIndicators,
  onStatusMessage,
  onClose,
}: VariableSetupDrawerProps) {
  const [activeTab, setActiveTab] = useState<"keys" | "indicators">(initialTab);
  const [quickMcText, setQuickMcText] = useState("");
  const [quickEssayText, setQuickEssayText] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [indValues, setIndValues] = useState<string[]>([]);
  const [indBulkText, setIndBulkText] = useState("");
  const quickInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !focusQuickKeySignal) return;
    setActiveTab("keys");
    window.setTimeout(() => {
      quickInputRef.current?.focus();
      quickInputRef.current?.select();
    }, 0);
  }, [open, focusQuickKeySignal]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    setQuickError(null);
    setIndValues(worksheet.columns.map((_, idx) => itemIndicators[idx] ?? ""));
    setIndBulkText("");
  }, [open, worksheet.columns, itemIndicators]);

  if (!open) return null;

  const filledIndCount = itemIndicators.filter((v) => v.trim().length > 0).length;

  const applyBulkIndicators = () => {
    const lines = indBulkText.split(/\r?\n/);
    if (lines.length === 0) return;
    setIndValues(worksheet.columns.map((_, idx) => (lines[idx] ?? "").trim()));
  };

  const safeIdx = Math.max(0, Math.min(worksheet.columns.length - 1, colIndex));
  const col = worksheet.columns[safeIdx];
  if (!col) return null;
  const resolvedKind = effectiveKinds[safeIdx] ?? "multiple_choice";
  const mcTotal = effectiveKinds.filter((k) => k === "multiple_choice").length;
  const essayTotal = effectiveKinds.length - mcTotal;
  const preferEssayQuick = essayTotal > mcTotal;

  const cleanedQuickMc = quickMcText.replace(/[^A-Za-z]/g, "").toUpperCase();
  const totalCols = worksheet.columns.length;
  const filledCount = totalCols - missingKeyItemNumbers.length;

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
      columns: curr.columns.map((c) => ({ ...c, mode })),
    }));
  };

  const handleApplyQuickMc = (e: FormEvent) => {
    e.preventDefault();
    if (!cleanedQuickMc) {
      setQuickError("Ketik atau tempel minimal 1 huruf kunci jawaban (contoh: ABCD).");
      return;
    }
    setQuickError(null);
    const maxOpt = Math.max(
      worksheet.optionCount,
      ...cleanedQuickMc.split("").map((ch) => ch.charCodeAt(0) - 64),
    );
    onUpdateWorksheet((curr) => ({
      ...curr,
      optionCount: Math.min(26, maxOpt),
      columns: curr.columns.map((c, idx) => {
        const ch = cleanedQuickMc[idx];
        return ch ? { ...c, mode: "multiple_choice", referenceValue: ch } : c;
      }),
    }));
    const applied = Math.min(cleanedQuickMc.length, totalCols);
    onStatusMessage?.(`Kunci PG diterapkan untuk ${applied} dari ${totalCols} butir.`);
  };

  const handleApplyQuickEssay = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLocalizedNumberList(quickEssayText);
    if (!parsed.valid) {
      setQuickError(
        `Nilai '${parsed.invalidToken ?? ""}' tidak valid. Skor ideal harus angka lebih dari 0.`,
      );
      return;
    }
    if (parsed.values.length === 0) {
      setQuickError("Masukkan skor ideal positif (contoh: 10 untuk semua, atau 10 15 20).");
      return;
    }
    const nonPositive = parsed.values.find((n) => n <= 0);
    if (nonPositive !== undefined) {
      setQuickError(`Skor ideal (${nonPositive}) harus lebih dari 0.`);
      return;
    }
    const nums = parsed.values;
    setQuickError(null);
    onUpdateWorksheet((curr) => ({
      ...curr,
      columns: curr.columns.map((c, idx) => {
        const val = nums.length === 1 ? nums[0]! : nums[idx];
        return val !== undefined
          ? { ...c, mode: "essay", referenceValue: String(val) }
          : c;
      }),
    }));
    onStatusMessage?.(
      nums.length === 1
        ? `Skor ideal ${nums[0]} diterapkan untuk semua butir.`
        : `Skor ideal diterapkan untuk ${Math.min(nums.length, totalCols)} butir.`,
    );
  };

  return (
    <section className="var-drawer no-print" aria-labelledby="var-drawer-title">
      <div className="pane-header" style={{ marginBlockEnd: "var(--space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <h2 id="var-drawer-title" className="pane-heading">
            Atur Soal &amp; Kunci
          </h2>
          <span
            className={`verdict-badge ${missingKeyItemNumbers.length === 0 ? "is-accept" : "is-revise"}`}
          >
            {missingKeyItemNumbers.length === 0
              ? `Kunci lengkap (${filledCount}/${totalCols})`
              : `Belum diisi: ${missingKeyItemNumbers.length} butir`}
          </span>
        </div>

        <button type="button" className="btn btn-compact" onClick={onClose}>
          Tutup
        </button>
      </div>

      <div className="drawer-tabs" role="tablist" aria-label="Bagian pengaturan soal">
        <button
          type="button"
          role="tab"
          id="tab-btn-keys"
          aria-selected={activeTab === "keys"}
          aria-controls="tab-panel-keys"
          className="btn btn-compact drawer-tab-btn"
          onClick={() => setActiveTab("keys")}
        >
          Kunci &amp; Skor Ideal
        </button>
        <button
          type="button"
          role="tab"
          id="tab-btn-indicators"
          aria-selected={activeTab === "indicators"}
          aria-controls="tab-panel-indicators"
          className="btn btn-compact drawer-tab-btn"
          onClick={() => setActiveTab("indicators")}
        >
          Indikator / TP Butir{filledIndCount > 0 ? ` (${filledIndCount})` : ""}
        </button>
      </div>

      {activeTab === "keys" ? (
        <div id="tab-panel-keys" role="tabpanel" aria-labelledby="tab-btn-keys">
          <div className="quick-key-box">
            {!preferEssayQuick ? (
              <form onSubmit={handleApplyQuickMc} className="quick-key-form">
                <div className="field-inline" style={{ flex: "1 1 16rem" }}>
                  <label htmlFor="quick-key-mc">
                    Input Cepat Kunci PG ({Math.min(cleanedQuickMc.length, totalCols)}/{totalCols} butir)
                  </label>
                  <input
                    ref={quickInputRef}
                    id="quick-key-mc"
                    type="text"
                    className="mono"
                    placeholder="Ketik atau tempel kunci beruntun, contoh: ABCDABCD"
                    value={quickMcText}
                    onChange={(e) => {
                      setQuickMcText(e.target.value.toUpperCase());
                      setQuickError(null);
                    }}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-compact">
                  Terapkan Kunci PG
                </button>
              </form>
            ) : (
              <form onSubmit={handleApplyQuickEssay} className="quick-key-form">
                <div className="field-inline" style={{ flex: "1 1 16rem" }}>
                  <label htmlFor="quick-key-essay">
                    Input Cepat Skor Ideal Uraian (satu angka untuk semua, atau pisah spasi)
                  </label>
                  <input
                    ref={quickInputRef}
                    id="quick-key-essay"
                    type="text"
                    className="mono"
                    placeholder="Contoh: 10 (semua sama) atau 10 15 20 25"
                    value={quickEssayText}
                    onChange={(e) => {
                      setQuickEssayText(e.target.value);
                      setQuickError(null);
                    }}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-compact">
                  Terapkan Skor Ideal
                </button>
              </form>
            )}

            {quickError && (
              <div className="quick-key-error" role="alert">
                {quickError}
              </div>
            )}
          </div>

          <div className="pane-header" style={{ marginBlock: "var(--space-2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "0.85rem" }}>
                Butir Terpilih: #{col.itemNumber} ({safeIdx + 1}/{totalCols})
              </strong>
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
                aria-disabled={safeIdx >= totalCols - 1 ? "true" : undefined}
                onClick={() => {
                  if (safeIdx < totalCols - 1) onSelectColumn(safeIdx + 1);
                }}
              >
                Berikutnya
              </button>
            </div>
          </div>

          <div className="var-drawer-grid">
            <div className="field-inline">
              <label htmlFor="var-ref-val">
                {resolvedKind === "multiple_choice" ? "Kunci jawaban (huruf)" : "Skor ideal (> 0)"}
              </label>
              <input
                id="var-ref-val"
                type="text"
                placeholder={resolvedKind === "multiple_choice" ? "A..E" : "Misal 10"}
                value={col.referenceValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  updateColumn({
                    referenceValue:
                      resolvedKind === "multiple_choice" ? raw.toUpperCase() : raw,
                  });
                }}
              />
            </div>

            <div className="field-inline">
              <label htmlFor="var-opt-count">Jumlah pilihan PG</label>
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

          <details className="method-notes" style={{ marginBlockStart: "var(--space-2)" }}>
            <summary>Mode Campuran PG+Uraian &amp; Nomor Butir Kustom</summary>
            <div className="var-drawer-grid" style={{ marginBlockStart: "var(--space-2)" }}>
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
                    updateColumn({ mode: nextMode });
                  }}
                >
                  <option value="auto">Otomatis (deteksi dari Kunci/Ideal)</option>
                  <option value="multiple_choice">Pilihan Ganda (Kunci huruf)</option>
                  <option value="essay">Uraian (Skor ideal angka)</option>
                </select>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-2)",
                marginBlockStart: "var(--space-2)",
              }}
            >
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
          </details>
        </div>
      ) : (
        <div
          id="tab-panel-indicators"
          role="tabpanel"
          aria-labelledby="tab-btn-indicators"
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
        >
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ink-secondary)" }}>
            Isi label indikator atau tujuan pembelajaran (TP) untuk setiap nomor butir agar ringkasan
            capaian per indikator tampil otomatis di laporan.
          </p>

          <div>
            <label
              htmlFor="ind-bulk-paste"
              style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBlockEnd: "0.25rem" }}
            >
              Tempel massal (satu baris per butir, opsional)
            </label>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
              <textarea
                id="ind-bulk-paste"
                rows={2}
                style={{
                  flex: 1,
                  fontSize: "0.82rem",
                  padding: "0.35rem 0.5rem",
                  background: "var(--bg-panel)",
                  color: "var(--ink-primary)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-cell)",
                }}
                placeholder={"Baris 1: Indikator Butir #1\nBaris 2: Indikator Butir #2"}
                value={indBulkText}
                onChange={(e) => setIndBulkText(e.target.value)}
              />
              <button type="button" className="btn btn-compact" onClick={applyBulkIndicators}>
                Terapkan Baris
              </button>
            </div>
          </div>

          <div className="table-wrapper" style={{ maxBlockSize: "13rem" }}>
            <table className="apa-table">
              <thead>
                <tr>
                  <th className="num">Butir</th>
                  <th>Indikator / Tujuan Pembelajaran</th>
                </tr>
              </thead>
              <tbody>
                {worksheet.columns.map((c, idx) => (
                  <tr key={`${c.itemNumber}-${idx}`}>
                    <td className="num">#{c.itemNumber}</td>
                    <td>
                      <input
                        type="text"
                        style={{
                          width: "100%",
                          padding: "0.25rem 0.45rem",
                          fontSize: "0.82rem",
                          background: "var(--bg-panel)",
                          color: "var(--ink-primary)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: "var(--radius-cell)",
                        }}
                        placeholder={`Contoh: TP ${Math.floor(idx / 3) + 1} - Pemahaman Konsep`}
                        value={indValues[idx] ?? ""}
                        onChange={(e) => {
                          const next = [...indValues];
                          next[idx] = e.target.value;
                          setIndValues(next);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => setIndValues(worksheet.columns.map(() => ""))}
            >
              Kosongkan Semua
            </button>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => {
                onSaveIndicators(indValues.map((v) => v.trim()));
                onStatusMessage?.("Pemetaan indikator butir berhasil diperbarui.");
              }}
            >
              Simpan Indikator
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
