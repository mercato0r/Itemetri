import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  generateTemplateXlsx,
  importMappedTabular,
  previewTabularImport,
} from "../api/client";
import type {
  AnalysisResponse,
  ExamPayload,
  ImportMetadata,
  SampleFileInfo,
  TabularPreviewResponse,
} from "../types";
import { saveBlobWithDialog } from "../utils/fileSave";
import { ModalFrame } from "./Dialogs";
import { DownloadIcon } from "./Icons";

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
  hasActiveResponses?: boolean;
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
  hasActiveResponses = false,
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
  const [defaultKeyOrIdeal, setDefaultKeyOrIdeal] = useState("");
  const [showManualMapping, setShowManualMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) return;
    setSelectedFile(null);
    setPreview(null);
    setShowManualMapping(false);
    setErrorMsg(null);
    setTemplateMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [open]);

  const handleDownloadTemplate = async (tmplKind: "multiple_choice" | "essay") => {
    setErrorMsg(null);
    setTemplateMsg(null);
    try {
      const { blob, filename } = await generateTemplateXlsx(tmplKind);
      const res = await saveBlobWithDialog(blob, filename);
      if (!res.cancelled) {
        setTemplateMsg(
          res.path ? `Template disimpan ke ${res.path}.` : `Template ${filename} berhasil diunduh.`,
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal membuat template Excel.");
    }
  };

  const handleFilePick = async (file: File | null) => {
    setSelectedFile(file);
    setPreview(null);
    setShowManualMapping(false);
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
      setShowManualMapping(p.suggested_mapping.item_col_indices.length === 0);
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

  const ignoredCols = preview?.suggested_mapping.ignored_col_indices ?? [];
  const ignoredReasons = preview?.suggested_mapping.ignored_col_reasons ?? {};
  const inferredKindLabel =
    kind === "mc"
      ? "Pilihan Ganda"
      : kind === "essay"
        ? "Uraian / Esai"
        : preview?.suggested_mapping.inferred_kind === "multiple_choice"
          ? "Pilihan Ganda"
          : "Uraian / Esai";
  const estimatedSubjects = preview
    ? Math.max(0, preview.total_rows - (hasHeaderRow ? 1 : 0) - (keyRowIndex !== null ? 1 : 0))
    : 0;
  const detectedNameColLabel =
    nameColIndex === null
      ? "Penomoran otomatis"
      : (preview?.preview_rows[0]?.[nameColIndex] || `Kolom ${nameColIndex + 1}`);
  const missingKeyInFile = keyRowIndex === null && defaultKeyOrIdeal.trim() === "";

  return (
    <ModalFrame
      open={open}
      wide={preview !== null && showManualMapping}
      titleId="import-map-title"
      title="Impor Data Ujian (.XLSX / .CSV / .ANA)"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        <div className="template-bar template-bar-compact">
          <span style={{ fontSize: "0.8125rem", color: "var(--ink-secondary)" }}>
            Butuh contoh format? Unduh template siap isi:
          </span>
          <div className="template-bar-actions">
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => void handleDownloadTemplate("multiple_choice")}
            >
              <DownloadIcon />
              <span>Template PG (.xlsx)</span>
            </button>
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => void handleDownloadTemplate("essay")}
            >
              <DownloadIcon />
              <span>Template Uraian (.xlsx)</span>
            </button>
          </div>
        </div>

        {templateMsg && (
          <div style={{ fontSize: "0.82rem", color: "var(--ok)", fontWeight: 600 }} role="status">
            {templateMsg}
          </div>
        )}

        <div className="field-inline">
          <label htmlFor="import-map-file">
            Pilih berkas Excel (.xlsx), CSV (.csv), atau proyek ANATES (.ana)
          </label>
          <input
            ref={fileInputRef}
            id="import-map-file"
            type="file"
            accept=".xlsx,.csv,.ana,.ANA"
            onChange={(e) => void handleFilePick(e.target.files?.[0] ?? null)}
          />
        </div>

        {preview && (
          <>
            <div className="import-detected-bar" role="status">
              <div className="import-detected-copy">
                <strong>
                  Terdeteksi {estimatedSubjects} peserta, {itemCols.length} butir ({inferredKindLabel})
                </strong>
                <span>
                  Nama: {detectedNameColLabel} |{" "}
                  {keyRowIndex !== null
                    ? `Baris kunci: Baris ${keyRowIndex + 1}`
                    : defaultKeyOrIdeal.trim() !== ""
                      ? `Acuan seragam: ${defaultKeyOrIdeal.trim()}`
                      : "Kunci diisi setelah impor"}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-compact toolbar-toggle"
                aria-expanded={showManualMapping}
                onClick={() => setShowManualMapping((prev) => !prev)}
              >
                {showManualMapping ? "Sembunyikan Pemetaan" : "Sesuaikan Kolom & Baris"}
              </button>
            </div>

            {ignoredCols.length > 0 && (
              <div className="auto-ignored-note" role="status">
                <strong>Kolom metadata diabaikan otomatis ({ignoredCols.length}):</strong>{" "}
                {ignoredCols
                  .map((cIdx) => {
                    const colName = preview.preview_rows[0]?.[cIdx] || `Kolom ${cIdx + 1}`;
                    const reason = ignoredReasons[cIdx];
                    return reason ? `${colName} (${reason})` : colName;
                  })
                  .join(", ")}
                .
              </div>
            )}

            {missingKeyInFile && (
              <div className="warn-box" role="status">
                Berkas ini belum memiliki baris <strong>Kunci Jawaban / Skor Ideal</strong>. Anda
                tetap dapat mengimpor data peserta sekarang, lalu mengisi kunci lewat bilah{" "}
                <strong>Input Cepat Kunci</strong> sebelum hasil analisis dihitung.
              </div>
            )}

            {showManualMapping && (
              <>
                <div className="var-drawer-grid">
                  <label className="option-check">
                    <input
                      type="checkbox"
                      checked={hasHeaderRow}
                      onChange={(e) => setHasHeaderRow(e.target.checked)}
                    />
                    <span>Baris 1 adalah judul kolom</span>
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
                      <option value="none">Tidak ada di berkas (isi setelah impor)</option>
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
                    <label htmlFor="map-kind">Jenis soal</label>
                    <select
                      id="map-kind"
                      value={kind}
                      onChange={(e) => {
                        const next = e.target.value as "auto" | "mc" | "essay";
                        setKind(next);
                      }}
                    >
                      <option value="auto">
                        Deteksi otomatis (
                        {preview.suggested_mapping.inferred_kind === "multiple_choice"
                          ? "Pilihan Ganda"
                          : "Uraian"}
                        )
                      </option>
                      <option value="mc">Pilihan Ganda</option>
                      <option value="essay">Uraian / Esai</option>
                    </select>
                  </div>
                </div>

                <details className="method-notes" style={{ marginBlockStart: 0 }}>
                  <summary>Pengaturan Impor Lanjutan (Opsional)</summary>
                  <div className="var-drawer-grid" style={{ marginBlockStart: "var(--space-2)" }}>
                    <div className="field-inline">
                      <label htmlFor="map-default-ref">Acuan seragam (jika tanpa baris kunci)</label>
                      <input
                        id="map-default-ref"
                        type="text"
                        placeholder="Kosongkan untuk isi manual nanti"
                        value={defaultKeyOrIdeal}
                        onChange={(e) => setDefaultKeyOrIdeal(e.target.value)}
                      />
                    </div>

                    <div className="field-inline">
                      <label htmlFor="map-opt-count">Jumlah pilihan PG (opsional)</label>
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
                </details>

                <div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                      marginBlockEnd: "0.35rem",
                    }}
                  >
                    <span style={{ fontSize: "0.78rem", color: "var(--ink-secondary)" }}>
                      Pilih kolom butir soal ({itemCols.length} dipilih):
                    </span>
                    <div style={{ display: "flex", gap: "var(--space-1)" }}>
                      <button
                        type="button"
                        className="btn btn-compact"
                        onClick={() =>
                          setItemCols(
                            Array.from({ length: preview.total_cols }, (_, c) => c).filter(
                              (c) => c !== nameColIndex,
                            ),
                          )
                        }
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        className="btn btn-compact"
                        onClick={() => {
                          setNameColIndex(preview.suggested_mapping.name_col_index);
                          setItemCols(preview.suggested_mapping.item_col_indices);
                        }}
                      >
                        Reset Otomatis
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {Array.from({ length: preview.total_cols }, (_, cIdx) => {
                      const isName = nameColIndex === cIdx;
                      const checked = !isName && itemCols.includes(cIdx);
                      const headerLabel = preview.preview_rows[0]?.[cIdx] || `Kolom ${cIdx + 1}`;
                      const ignoredReason = ignoredReasons[cIdx];
                      return (
                        <label
                          key={cIdx}
                          className="option-check"
                          style={{
                            padding: "0.2rem 0.5rem",
                            background: "var(--bg-subtle)",
                            borderRadius: "var(--radius-cell)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isName}
                            onChange={() => toggleItemCol(cIdx)}
                          />
                          <span>
                            {headerLabel}
                            {ignoredReason ? ` (${ignoredReason})` : ""}
                          </span>
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
                            {rIdx === keyRowIndex
                              ? "Kunci"
                              : rIdx === 0 && hasHeaderRow
                                ? "Hdr"
                                : rIdx + 1}
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

        {!preview && hasActiveResponses && samples.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-3)" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBlockEnd: "var(--space-2)" }}>
              Atau Muat Arsip Sampel &amp; Simulasi Lokal
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
            {busy ? "Memuat..." : missingKeyInFile ? "Impor Data Peserta" : "Impor & Analisis"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
