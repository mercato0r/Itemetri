import { useMemo, useState } from "react";
import { importExamFile, loadSample } from "../api/client";
import { computePretestPosttest, type PretestPosttestResult } from "../standalone/engine/pretestPosttest";
import type { AnalysisOptions, ExamPayload, SampleFileInfo } from "../types";
import type { ExportableCardSpec } from "../utils/resultExport";
import { CardExportBar } from "./CardExportBar";
import { ModalFrame } from "./Dialogs";

interface PretestPosttestModalProps {
  open: boolean;
  activeExam: ExamPayload | null;
  options: AnalysisOptions;
  samples: SampleFileInfo[];
  onClose: () => void;
  onStatusMessage?: (msg: string) => void;
}

export function PretestPosttestModal({
  open,
  activeExam,
  options,
  samples,
  onClose,
  onStatusMessage,
}: PretestPosttestModalProps) {
  const [activeRole, setActiveRole] = useState<"pretest" | "posttest">("pretest");
  const [otherExam, setOtherExam] = useState<ExamPayload | null>(null);
  const [otherLabel, setOtherLabel] = useState<string>("");
  const [selectedSample, setSelectedSample] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const result = useMemo<PretestPosttestResult | null>(() => {
    if (!activeExam || !otherExam) return null;
    const pre = activeRole === "pretest" ? activeExam : otherExam;
    const post = activeRole === "posttest" ? activeExam : otherExam;
    return computePretestPosttest(pre, post, options);
  }, [activeExam, otherExam, activeRole, options]);

  const exportSpec = useMemo<ExportableCardSpec | null>(() => {
    if (!result) return null;
    return {
      id: "analisis-pretest-posttest",
      title: "Analisis Perubahan Hasil Belajar (Pretest vs Posttest)",
      subtitle: `Peserta berpasangan: ${result.matched_count} | Skor Ideal: ${result.ideal_max_score.toFixed(1)}`,
      metrics: [
        {
          label: "Rata-rata Pretest / Posttest",
          value: `${result.mean_pre?.toFixed(2) ?? "NAN"} -> ${result.mean_post?.toFixed(2) ?? "NAN"}`,
          note: `Selisih: ${result.mean_delta !== null ? (result.mean_delta >= 0 ? "+" : "") + result.mean_delta.toFixed(2) : "NAN"}`,
        },
        {
          label: "Rata-rata N-Gain (Hake)",
          value: result.mean_n_gain !== null ? result.mean_n_gain.toFixed(2) : "NAN",
          note: `Kategori: ${result.class_category}`,
        },
        {
          label: "Uji-t Berpasangan",
          value: result.t_value !== null ? `t = ${result.t_value.toFixed(2)}` : "NAN",
          note:
            result.p_value !== null
              ? `p = ${result.p_value.toFixed(4)} (${result.significant ? "Signifikan" : "Tidak Sig."})`
              : `df = ${result.df}`,
        },
      ],
      table: {
        headers: ["No", "Nama Peserta", "Pretest", "Posttest", "Selisih", "N-Gain", "Kategori"],
        alignments: ["right", "left", "right", "right", "right", "right", "left"],
        rows: result.rows.map((r) => [
          String(r.rank),
          r.name,
          r.pre_score.toFixed(2),
          r.post_score.toFixed(2),
          `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}`,
          r.n_gain !== null ? r.n_gain.toFixed(2) : "NAN",
          r.category,
        ]),
      },
      footnote: result.narrative,
    };
  }, [result]);

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await importExamFile(file, "auto", null);
      setOtherExam(res.exam);
      setOtherLabel(res.metadata.filename);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal membaca berkas pembanding.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoadSample = async () => {
    if (!selectedSample) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await loadSample(selectedSample);
      setOtherExam(res.exam);
      setOtherLabel(res.metadata.filename);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memuat sampel pembanding.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalFrame
      open={open}
      wide
      titleId="pp-modal-title"
      title="Analisis Pretest dan Posttest (N-Gain & Uji-t Berpasangan)"
      onClose={onClose}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end" }}>
        <div className="field-inline">
          <label htmlFor="pp-active-role">Peran data aktif saat ini</label>
          <select
            id="pp-active-role"
            value={activeRole}
            onChange={(e) => setActiveRole(e.target.value as "pretest" | "posttest")}
          >
            <option value="pretest">Sebagai Pretest (Awal)</option>
            <option value="posttest">Sebagai Posttest (Akhir)</option>
          </select>
        </div>

        <div className="field-inline">
          <label htmlFor="pp-file-input">
            Muat berkas {activeRole === "pretest" ? "Posttest" : "Pretest"} (.ana / .xlsx / .csv)
          </label>
          <input
            id="pp-file-input"
            type="file"
            accept=".ana,.xlsx,.csv"
            disabled={busy}
            onChange={(e) => void handleFileChange(e.target.files?.[0])}
          />
        </div>

        {samples.length > 0 && (
          <div className="field-inline">
            <label htmlFor="pp-sample-select">Atau pilih sampel</label>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <select
                id="pp-sample-select"
                value={selectedSample}
                onChange={(e) => setSelectedSample(e.target.value)}
              >
                <option value="">-- Pilih sampel --</option>
                {samples.map((s) => (
                  <option key={s.filename} value={s.filename}>
                    {s.label ?? s.filename}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-compact"
                disabled={!selectedSample || busy}
                onClick={() => void handleLoadSample()}
              >
                Muat
              </button>
            </div>
          </div>
        )}
      </div>

      {otherLabel && (
        <div style={{ fontSize: "0.82rem", color: "var(--ink-secondary)", marginBlockEnd: "var(--space-2)" }}>
          Berkas pembanding ({activeRole === "pretest" ? "Posttest" : "Pretest"}): <strong>{otherLabel}</strong>
        </div>
      )}

      {errorMsg && (
        <div className="warn-box" role="alert" style={{ marginBlockEnd: "var(--space-3)" }}>
          {errorMsg}
        </div>
      )}

      {result && (
        <div>
          <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
            <p style={{ margin: 0, fontSize: "0.86rem", fontWeight: 600 }}>{result.narrative}</p>
            {exportSpec && <CardExportBar spec={exportSpec} onStatusMessage={onStatusMessage} />}
          </div>

          <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
            <table className="apa-table">
              <thead>
                <tr>
                  <th className="num">No</th>
                  <th>Nama Peserta</th>
                  <th className="num">Pretest</th>
                  <th className="num">Posttest</th>
                  <th className="num">Selisih</th>
                  <th className="num">N-Gain</th>
                  <th>Kategori</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.rank}>
                    <td className="num">{r.rank}</td>
                    <td>{r.name}</td>
                    <td className="num">{r.pre_score.toFixed(2)}</td>
                    <td className="num">{r.post_score.toFixed(2)}</td>
                    <td className="num">
                      {r.delta >= 0 ? "+" : ""}
                      {r.delta.toFixed(2)}
                    </td>
                    <td className="num">{r.n_gain !== null ? r.n_gain.toFixed(2) : "NAN"}</td>
                    <td>
                      <span
                        className={`verdict-badge ${
                          r.category === "Tinggi"
                            ? "is-accept"
                            : r.category === "Sedang"
                              ? "is-revise"
                              : "is-reject"
                        }`}
                      >
                        {r.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}
