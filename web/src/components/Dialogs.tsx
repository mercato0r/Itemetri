import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { MergeAxis, SampleFileInfo } from "../types";

export interface ModalFrameProps {
  open: boolean;
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function ModalFrame({
  open,
  titleId,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: ModalFrameProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };
    dialog.addEventListener("close", handleClose);

    // Light-dismiss fallback when closedby="any" is unsupported.
    if ("closedBy" in HTMLDialogElement.prototype) {
      return () => dialog.removeEventListener("close", handleClose);
    }

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={wide ? "modal modal-wide" : "modal"}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="btn btn-compact"
          onClick={() => ref.current?.close()}
        >
          Tutup
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-foot">{footer}</div>}
    </dialog>
  );
}

export type WorksheetSaveFormat = "ana" | "xlsx-exam" | "csv-exam";

interface SaveWorksheetDialogProps {
  open: boolean;
  onClose: () => void;
  onSaveWorksheet: (format: WorksheetSaveFormat) => Promise<void>;
}

export function SaveWorksheetDialog({
  open,
  onClose,
  onSaveWorksheet,
}: SaveWorksheetDialogProps) {
  const [busyFormat, setBusyFormat] = useState<WorksheetSaveFormat | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const trigger = async (fmt: WorksheetSaveFormat) => {
    setBusyFormat(fmt);
    setErrorMsg(null);
    try {
      await onSaveWorksheet(fmt);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menyimpan data lembar kerja.");
    } finally {
      setBusyFormat(null);
    }
  };

  const options: Array<{ fmt: WorksheetSaveFormat; label: string; hint: string }> = [
    {
      fmt: "ana",
      label: "Berkas Proyek ANATES (.ana)",
      hint: "Format proyek asli berisi nama peserta, respons, dan kunci/skor ideal",
    },
    {
      fmt: "xlsx-exam",
      label: "Tabel Data Mentah (.xlsx)",
      hint: "Workbook Excel berisi matriks lembar kerja tanpa tabel hasil statistik",
    },
    {
      fmt: "csv-exam",
      label: "Tabel Data Mentah (.csv)",
      hint: "Berkas teks CSV berisi matriks data peserta dan kunci jawaban",
    },
  ];

  return (
    <ModalFrame open={open} titleId="save-ws-dlg-title" title="Simpan Data Mentah Lembar Kerja" onClose={onClose}>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-secondary)" }}>
        Menu ini hanya menyimpan data mentah peserta dan kunci/skor ideal dari tabel sebelah kiri.
        Untuk mengunduh laporan hasil perhitungan lengkap (PDF atau Excel), gunakan tombol{" "}
        <strong>Ekspor Laporan</strong> pada bilah atas.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {options.map((item) => (
          <button
            key={item.fmt}
            type="button"
            className="btn"
            style={{ justifyContent: "space-between", alignItems: "center", textAlign: "left", paddingBlock: "0.55rem" }}
            disabled={busyFormat !== null}
            onClick={() => void trigger(item.fmt)}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: "0.1rem", whiteSpace: "normal" }}>
              <strong style={{ fontSize: "0.875rem" }}>{item.label}</strong>
              <span style={{ fontSize: "0.75rem", color: "var(--ink-secondary)", fontWeight: 400 }}>
                {item.hint}
              </span>
            </span>
            <span>{busyFormat === item.fmt ? "Menyiapkan..." : "Unduh"}</span>
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="warn-box" role="alert" style={{ background: "var(--err-bg)", color: "var(--err)", borderColor: "var(--err)" }}>
          {errorMsg}
        </div>
      )}
    </ModalFrame>
  );
}

interface MergeDialogProps {
  open: boolean;
  samples: SampleFileInfo[];
  onClose: () => void;
  onMerge: (params: {
    axis: MergeAxis;
    requireMatchingKey: boolean;
    file?: File;
    sampleFilename?: string;
  }) => Promise<void>;
}

export function MergeDialog({ open, samples, onClose, onMerge }: MergeDialogProps) {
  const [sourceMode, setSourceMode] = useState<"file" | "sample">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sampleFilename, setSampleFilename] = useState("");
  const [axis, setAxis] = useState<MergeAxis>("subjects");
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    const firstSample = samples[0];
    if (firstSample && !sampleFilename) {
      setSampleFilename(firstSample.filename);
    }
  }, [open, samples, sampleFilename]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sourceMode === "file" && !selectedFile) {
      setErrorMsg("Pilih berkas kedua (.ana, .csv, atau .xlsx) terlebih dahulu.");
      return;
    }
    if (sourceMode === "sample" && !sampleFilename) {
      setErrorMsg("Pilih arsip sampel lokal terlebih dahulu.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await onMerge({
        axis,
        requireMatchingKey: !allowMismatch,
        file: sourceMode === "file" ? (selectedFile ?? undefined) : undefined,
        sampleFilename: sourceMode === "sample" ? sampleFilename : undefined,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menggabungkan berkas.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame open={open} titleId="merge-dlg-title" title="Gabung Berkas Ujian" onClose={onClose}>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-secondary)" }}>
          Tambahkan peserta atau butir soal dari berkas kedua ke dokumen aktif saat ini.
        </p>

        {samples.length > 0 && (
          <div className="field-inline">
            <label htmlFor="merge-source-mode">Sumber berkas kedua</label>
            <select
              id="merge-source-mode"
              value={sourceMode}
              onChange={(e) => {
                setSourceMode(e.target.value as "file" | "sample");
                setErrorMsg(null);
              }}
            >
              <option value="file">Unggah berkas lokal</option>
              <option value="sample">Arsip sampel lokal</option>
            </select>
          </div>
        )}

        {sourceMode === "file" ? (
          <div className="field-inline">
            <label htmlFor="merge-file-input">Pilih berkas kedua (.ana, .csv, .xlsx)</label>
            <input
              id="merge-file-input"
              type="file"
              accept=".ana,.ANA,.csv,.xlsx"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] ?? null);
                setErrorMsg(null);
              }}
            />
          </div>
        ) : (
          <div className="field-inline">
            <label htmlFor="merge-sample-select">Pilih arsip sampel kedua</label>
            <select
              id="merge-sample-select"
              value={sampleFilename}
              onChange={(e) => {
                setSampleFilename(e.target.value);
                setErrorMsg(null);
              }}
            >
              {samples.map((s) => (
                <option key={s.filename} value={s.filename}>
                  {s.filename}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field-inline">
          <label htmlFor="merge-axis-select">Mode penggabungan</label>
          <select
            id="merge-axis-select"
            value={axis}
            onChange={(e) => setAxis(e.target.value as MergeAxis)}
          >
            <option value="subjects">Tambah Peserta (Gabung Baris)</option>
            <option value="items">Tambah Butir Soal (Gabung Kolom)</option>
          </select>
        </div>

        <label className="option-check">
          <input
            type="checkbox"
            checked={allowMismatch}
            disabled={axis === "items"}
            onChange={(e) => setAllowMismatch(e.target.checked)}
          />
          <span>
            Izinkan perbedaan kunci jawaban / skor ideal{" "}
            {axis === "items" ? "(khusus gabung peserta)" : ""}
          </span>
        </label>

        {errorMsg && (
          <div
            className="warn-box"
            role="alert"
            style={{ background: "var(--err-bg)", color: "var(--err)", borderColor: "var(--err)" }}
          >
            {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Menggabungkan..." : "Gabung Berkas"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export interface NewWorksheetParams {
  kind: "multiple_choice" | "essay";
  itemCount: number;
  subjectCount: number;
  optionCount: number;
  quickKeys: string;
  essayIdeal: string;
}

interface NewWorksheetDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (params: NewWorksheetParams) => void;
}

const DEFAULT_INITIAL_SUBJECT_ROWS = 15;

export function NewWorksheetDialog({ open, onClose, onCreate }: NewWorksheetDialogProps) {
  const [kind, setKind] = useState<"multiple_choice" | "essay">("multiple_choice");
  const [itemCount, setItemCount] = useState(10);
  const [optionCount, setOptionCount] = useState(4);
  const [quickKeys, setQuickKeys] = useState("");
  const [essayIdeal, setEssayIdeal] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
  }, [open]);

  const cleanedKeyCount = quickKeys.replace(/[^A-Za-z]/g, "").length;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > 200) {
      setErrorMsg("Jumlah butir soal harus antara 1 sampai 200.");
      return;
    }
    onCreate({
      kind,
      itemCount,
      subjectCount: DEFAULT_INITIAL_SUBJECT_ROWS,
      optionCount,
      quickKeys,
      essayIdeal,
    });
    onClose();
  };

  return (
    <ModalFrame open={open} titleId="new-ws-dlg-title" title="Buat Lembar Kerja Baru" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-secondary)" }}>
          Pilih jenis soal dan jumlah butir. Baris peserta tersedia otomatis dan akan bertambah saat
          Anda mengetik atau menempel (<code>Ctrl+V</code>) data nilai dari Excel.
        </p>

        <fieldset className="new-ws-fieldset">
          <legend>Jenis Soal Ujian</legend>
          <div className="new-ws-kind-row">
            <label className="option-check">
              <input
                type="radio"
                name="new-ws-kind"
                checked={kind === "multiple_choice"}
                onChange={() => setKind("multiple_choice")}
              />
              <span>Pilihan Ganda (PG)</span>
            </label>
            <label className="option-check">
              <input
                type="radio"
                name="new-ws-kind"
                checked={kind === "essay"}
                onChange={() => setKind("essay")}
              />
              <span>Uraian / Esai</span>
            </label>
          </div>
        </fieldset>

        <div className="var-drawer-grid">
          <div className="field-inline">
            <label htmlFor="new-ws-items">Jumlah butir soal</label>
            <input
              id="new-ws-items"
              type="number"
              min={1}
              max={200}
              value={itemCount}
              onChange={(e) => setItemCount(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          {kind === "multiple_choice" && (
            <div className="field-inline">
              <label htmlFor="new-ws-options">Jumlah pilihan jawaban</label>
              <select
                id="new-ws-options"
                value={optionCount}
                onChange={(e) => setOptionCount(Number(e.target.value))}
              >
                <option value={3}>3 Pilihan (A - C)</option>
                <option value={4}>4 Pilihan (A - D)</option>
                <option value={5}>5 Pilihan (A - E)</option>
              </select>
            </div>
          )}
        </div>

        {kind === "multiple_choice" ? (
          <div className="field-inline">
            <label htmlFor="new-ws-quick-key">
              Input cepat kunci jawaban (opsional, {Math.min(cleanedKeyCount, itemCount)}/{itemCount} butir terisi)
            </label>
            <input
              id="new-ws-quick-key"
              type="text"
              className="mono"
              placeholder="Contoh: ABCDABCDAB (boleh dikosongkan dulu)"
              value={quickKeys}
              onChange={(e) => setQuickKeys(e.target.value.toUpperCase())}
            />
          </div>
        ) : (
          <div className="field-inline">
            <label htmlFor="new-ws-essay-ideal">
              Skor ideal tiap butir (opsional, satu angka atau pisah koma)
            </label>
            <input
              id="new-ws-essay-ideal"
              type="text"
              placeholder="Contoh: 10 (untuk semua) atau 10, 15, 20"
              value={essayIdeal}
              onChange={(e) => setEssayIdeal(e.target.value)}
            />
          </div>
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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary">
            Buat Lembar Kerja
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
