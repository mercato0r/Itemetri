import { useState } from "react";
import type { FormEvent } from "react";
import { importMappedTabular, previewTabularImport } from "../api/client";
import type {
  AnalysisResponse,
  ExamPayload,
  ImportMetadata,
  SampleFileInfo,
  TabularPreviewResponse,
} from "../types";
import { ModalFrame } from "./Dialogs";

export function SampleListGrid({
  samples,
  onPick,
}: {
  samples: SampleFileInfo[];
  onPick: (filename: string) => void;
}) {
  return (
    <div className="sample-list">
      {samples.map((s) => (
        <button
          key={s.filename}
          type="button"
          className="btn btn-compact"
          style={{ justifyContent: "space-between", gap: "var(--space-2)" }}
          onClick={() => onPick(s.filename)}
        >
          <span>{s.label ?? s.filename}</span>
          {s.is_builtin ? (
            <span className="sample-badge">Simulasi</span>
          ) : (
            <span className="num" style={{ color: "var(--ink-secondary)", fontSize: "0.75rem" }}>
              {(s.size_bytes / 1024).toFixed(1)} KB
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

interface ImportMapperDialogProps {
  open: boolean;
  samples: SampleFileInfo[];
  onClose: () => void;
  onDirectAnaImport: (file: File) => Promise<void>;
  onLoadSample: (filename: string) => void;
  onMappedLoaded: (res: {
    exam: ExamPayload;
    analysis: AnalysisResponse;
    metadata: ImportMetadata;
  }) => void;
}

export function ImportMapperDialog({
  open,
  samples,
  onClose,
  onDirectAnaImport,
  onLoadSample,
  onMappedLoaded,
}: ImportMapperDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TabularPreviewResponse | null>(null);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [keyRowIndex, setKeyRowIndex] = useState<number | null>(null);
  const [nameColIndex, setNameColIndex] = useState<number | null>(0);
  const [itemCols, setItemCols] = useState<number[]>([]);
  const [kind, setKind] = useState<"auto" | "mc" | "essay">("auto");
  const [optionCountStr, setOptionCountStr] = useState("");
  const [defaultKeyOrIdeal, setDefaultKeyOrIdeal] = useState("A");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFilePick = async (file: File | null) => {
    setSelectedFile(file);
    setPreview(null);
    setErrorMsg(null);
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".ana")) {
      return;
    }

    setBusy(true);
    try {
      const p = await previewTabularImport(file);
      setPreview(p);
      setHasHeaderRow(p.suggested_mapping.has_header_row);
      setKeyRowIndex(p.suggested_mapping.key_row_index);
      setNameColIndex(p.suggested_mapping.name_col_index);
      setItemCols(p.suggested_mapping.item_col_indices);
      setKind("auto");
      setDefaultKeyOrIdeal(p.suggested_mapping.default_key_or_ideal);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal membaca pratinjau berkas.");
    } finally {
      setBusy(false);
    }
  };

  const toggleItemCol = (colIdx: number) => {
    setItemCols((prev) =>
      prev.includes(colIdx)
        ? prev.filter((c) => c !== colIdx)
        : [...prev, colIdx].sort((a, b) => a - b),
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg("Pilih berkas .ana, .csv, atau .xlsx terlebih dahulu.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      if (selectedFile.name.toLowerCase().endsWith(".ana")) {
        await onDirectAnaImport(selectedFile);
        onClose();
        return;
      }

      if (itemCols.length === 0) {
        setErrorMsg("Pilih minimal satu kolom butir soal.");
        setBusy(false);
        return;
      }

      const res = await importMappedTabular(selectedFile, {
        hasHeaderRow,
        keyRowIndex,
        nameColIndex,
        itemColIndices: itemCols,
        kind,
        optionCount: optionCountStr.trim() ? Number(optionCountStr) : null,
        defaultKeyOrIdeal,
      });
      onMappedLoaded(res);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal mengimpor berkas.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame
      open={open}
      wide={preview !== null}
      titleId="import-map-title"
      title="Impor Berkas (.ANA / .CSV / .XLSX)"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        <div className="field-inline">
          <label htmlFor="import-map-file">Pilih berkas ujian (.ana, .ANA, .csv, .xlsx)</label>
          <input
            id="import-map-file"
            type="file"
            accept=".ana,.ANA,.csv,.xlsx"
            onChange={(e) => void handleFilePick(e.target.files?.[0] ?? null)}
          />
        </div>

        {preview && (
          <>
            <div style={{ fontSize: "0.82rem", color: "var(--ink-secondary)" }}>
              Terdeteksi <strong>{preview.total_rows}</strong> baris dan{" "}
              <strong>{preview.total_cols}</strong> kolom. Sesuaikan peran baris dan kolom di bawah:
            </div>

            <div className="var-drawer-grid">
              <label className="option-check">
                <input
                  type="checkbox"
                  checked={hasHeaderRow}
                  onChange={(e) => setHasHeaderRow(e.target.checked)}
                />
                <span>Baris 1 adalah header kolom</span>
              </label>

              <div className="field-inline">
                <label htmlFor="map-key-row">Baris Kunci / Skor Ideal</label>
                <select
                  id="map-key-row"
                  value={keyRowIndex === null ? "none" : String(keyRowIndex)}
                  onChange={(e) =>
                    setKeyRowIndex(e.target.value === "none" ? null : Number(e.target.value))
                  }
                >
                  <option value="none">Tidak ada (isi default / sunting nanti di grid)</option>
                  {preview.preview_rows.slice(0, 5).map((_, rIdx) => (
                    <option key={rIdx} value={String(rIdx)}>
                      Baris {rIdx + 1} ({preview.preview_rows[rIdx]?.slice(0, 3).join(", ")})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-inline">
                <label htmlFor="map-name-col">Kolom Nama Peserta</label>
                <select
                  id="map-name-col"
                  value={nameColIndex === null ? "none" : String(nameColIndex)}
                  onChange={(e) => {
                    const nextVal = e.target.value === "none" ? null : Number(e.target.value);
                    setNameColIndex(nextVal);
                    if (nextVal !== null) {
                      setItemCols((prev) => prev.filter((c) => c !== nextVal));
                    }
                  }}
                >
                  <option value="none">Tanpa kolom nama (beri nomor otomatis)</option>
                  {Array.from({ length: preview.total_cols }, (_, cIdx) => (
                    <option key={cIdx} value={String(cIdx)}>
                      Kolom {cIdx + 1} ({preview.preview_rows[0]?.[cIdx] || `C${cIdx + 1}`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-inline">
                <label htmlFor="map-kind">Jenis butir</label>
                <select
                  id="map-kind"
                  value={kind}
                  onChange={(e) => {
                    const next = e.target.value as "auto" | "mc" | "essay";
                    setKind(next);
                    if (next === "mc" && Number(defaultKeyOrIdeal) > 0) {
                      setDefaultKeyOrIdeal("A");
                    } else if (next === "essay" && /^[A-Za-z]$/.test(defaultKeyOrIdeal.trim())) {
                      setDefaultKeyOrIdeal("10");
                    }
                  }}
                >
                  <option value="auto">
                    Deteksi otomatis ({preview.suggested_mapping.inferred_kind === "multiple_choice" ? "PG" : "Uraian"})
                  </option>
                  <option value="mc">Pilihan Ganda</option>
                  <option value="essay">Uraian / Esai</option>
                </select>
              </div>

              <div className="field-inline">
                <label htmlFor="map-default-ref">Acuan bawaan (jika tanpa baris kunci)</label>
                <input
                  id="map-default-ref"
                  type="text"
                  value={defaultKeyOrIdeal}
                  onChange={(e) => setDefaultKeyOrIdeal(e.target.value)}
                />
              </div>

              <div className="field-inline">
                <label htmlFor="map-opt-count">Jumlah opsi PG (opsional)</label>
                <input
                  id="map-opt-count"
                  type="number"
                  min={2}
                  max={26}
                  placeholder="Otomatis"
                  value={optionCountStr}
                  onChange={(e) => setOptionCountStr(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.78rem", color: "var(--ink-secondary)", marginBlockEnd: "0.3rem" }}>
                Pilih kolom butir soal (hapus centang untuk kolom metadata seperti NIS atau Kelas):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {Array.from({ length: preview.total_cols }, (_, cIdx) => {
                  const isName = nameColIndex === cIdx;
                  const checked = !isName && itemCols.includes(cIdx);
                  const headerLabel = preview.preview_rows[0]?.[cIdx] || `Kolom ${cIdx + 1}`;
                  return (
                    <label key={cIdx} className="option-check" style={{ padding: "0.2rem 0.5rem", background: "var(--bg-subtle)", borderRadius: "var(--radius-cell)" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isName}
                        onChange={() => toggleItemCol(cIdx)}
                      />
                      <span>{headerLabel}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="table-wrapper" style={{ maxBlockSize: "12rem" }}>
              <table className="apa-table">
                <tbody>
                  {preview.preview_rows.slice(0, 6).map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        background:
                          rIdx === keyRowIndex
                            ? "var(--bg-frozen)"
                            : rIdx === 0 && hasHeaderRow
                              ? "var(--bg-subtle)"
                              : undefined,
                      }}
                    >
                      <td className="num" style={{ color: "var(--ink-secondary)" }}>
                        {rIdx === keyRowIndex ? "Kunci" : rIdx === 0 && hasHeaderRow ? "Hdr" : rIdx + 1}
                      </td>
                      {row.slice(0, 12).map((cell, cIdx) => (
                        <td key={cIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {errorMsg && (
          <div
            className="warn-box"
            role="alert"
            style={{ background: "var(--err-bg)", color: "var(--err)", borderColor: "var(--err)" }}
          >
            {errorMsg}
          </div>
        )}

        {!preview && samples.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-3)" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBlockEnd: "var(--space-2)" }}>
              Atau Buka Arsip Sampel & Simulasi Lokal
            </div>
            <SampleListGrid
              samples={samples}
              onPick={(filename) => {
                onClose();
                onLoadSample(filename);
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !selectedFile}>
            {busy ? "Memuat..." : "Impor & Analisis"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
