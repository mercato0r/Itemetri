import type {
  AnalysisOptions,
  CompatibilityMode,
  EssayDifficultyScope,
  ScoringWeights,
} from "../types";

export interface UiDisplayFlags {
  showDistractors: boolean;
  showInterpretation: boolean;
  showModeComparison: boolean;
  useCorrectedItemTotal: boolean;
}

interface OptionsDrawerProps {
  summaryKind: "multiple_choice" | "essay" | "mixed";
  weights: ScoringWeights;
  options: AnalysisOptions;
  displayFlags: UiDisplayFlags;
  onChangeOptions: (next: AnalysisOptions) => void;
  onChangeWeights: (weights: ScoringWeights) => void;
  onChangeFlags: (next: UiDisplayFlags) => void;
}

export function OptionsDrawer({
  summaryKind,
  weights,
  options,
  displayFlags,
  onChangeOptions,
  onChangeWeights,
  onChangeFlags,
}: OptionsDrawerProps) {
  const isLegacy = options.mode === "legacy_anates";

  const handleModeChange = (mode: CompatibilityMode) => {
    if (mode === "legacy_anates") {
      onChangeOptions({
        ...options,
        mode,
        use_weighted_score: false,
        essay_difficulty_scope:
          summaryKind === "multiple_choice" ? null : "upper_lower_2n",
      });
    } else {
      onChangeOptions({
        ...options,
        mode,
        essay_difficulty_scope:
          summaryKind === "multiple_choice" ? null : "all_subjects",
      });
    }
  };

  return (
    <section className="card options-panel no-print" aria-labelledby="options-heading">
      <div className="pane-header" style={{ marginBlockEnd: "var(--space-2)" }}>
        <h2 id="options-heading" className="card-title" style={{ margin: 0 }}>
          Opsi Perhitungan
        </h2>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-secondary)" }}>
          {isLegacy ? "Legacy ANATES" : "Standar Terkoreksi"}
        </span>
      </div>

      <div className="options-body" style={{ borderBlockStart: "1px solid var(--border-subtle)", paddingBlockStart: "var(--space-3)", marginBlockStart: 0 }}>
        <div className="field-inline">
          <label htmlFor="opt-mode">Mode Kompatibilitas</label>
          <select
            id="opt-mode"
            value={options.mode}
            onChange={(e) => handleModeChange(e.target.value as CompatibilityMode)}
          >
            <option value="standard_corrected">Standar Terkoreksi</option>
            <option value="legacy_anates">Legacy ANATES (Paritas Biner)</option>
          </select>
        </div>

        <div className="field-inline">
          <label htmlFor="opt-ul-pct">Kelompok Unggul/Asor (%)</label>
          <input
            id="opt-ul-pct"
            type="number"
            min={1}
            max={50}
            step={1}
            value={options.upper_lower_percent}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0 && v <= 50) {
                onChangeOptions({ ...options, upper_lower_percent: v });
              }
            }}
          />
          <div className="preset-btn-row" role="group" aria-label="Pintasan persentase kelompok">
            <button
              type="button"
              className="btn btn-compact toolbar-toggle"
              aria-pressed={options.upper_lower_percent === 27 ? "true" : "false"}
              onClick={() => onChangeOptions({ ...options, upper_lower_percent: 27 })}
            >
              27% (Kelompok Ekstrem)
            </button>
            <button
              type="button"
              className="btn btn-compact toolbar-toggle"
              aria-pressed={options.upper_lower_percent === 50 ? "true" : "false"}
              onClick={() => onChangeOptions({ ...options, upper_lower_percent: 50 })}
            >
              50% (Median Split)
            </button>
          </div>
        </div>

        {summaryKind !== "essay" && (
          <>
            <div className="field-inline">
              <label htmlFor="opt-w-correct">Bobot Jawaban Benar (PG)</label>
              <input
                id="opt-w-correct"
                type="number"
                step={0.5}
                value={weights.correct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) {
                    onChangeWeights({ ...weights, correct: val });
                  }
                }}
              />
            </div>

            <div className="field-inline">
              <label htmlFor="opt-w-wrong">Bobot Jawaban Salah (PG)</label>
              <input
                id="opt-w-wrong"
                type="number"
                step={0.5}
                value={weights.wrong}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) {
                    onChangeWeights({ ...weights, wrong: val });
                  }
                }}
              />
            </div>

            {summaryKind === "multiple_choice" && (
              <label className="option-check">
                <input
                  type="checkbox"
                  checked={options.use_weighted_score}
                  disabled={isLegacy}
                  onChange={(e) =>
                    onChangeOptions({ ...options, use_weighted_score: e.target.checked })
                  }
                />
                <span>
                  Gunakan Skor Dibobot {isLegacy ? "(nonaktif di mode Legacy)" : ""}
                </span>
              </label>
            )}
          </>
        )}

        {summaryKind !== "multiple_choice" && (
          <div className="field-inline">
            <label htmlFor="opt-essay-scope">Cakupan Tingkat Kesukaran Uraian</label>
            <select
              id="opt-essay-scope"
              value={
                options.essay_difficulty_scope ??
                (isLegacy ? "upper_lower_2n" : "all_subjects")
              }
              disabled={isLegacy}
              onChange={(e) =>
                onChangeOptions({
                  ...options,
                  essay_difficulty_scope: e.target.value as EssayDifficultyScope,
                })
              }
            >
              <option value="all_subjects">Seluruh Peserta (N)</option>
              <option value="upper_lower_2n">Kelompok Unggul + Asor (2n)</option>
            </select>
          </div>
        )}

        <label className="option-check">
          <input
            type="checkbox"
            checked={displayFlags.useCorrectedItemTotal}
            onChange={(e) =>
              onChangeFlags({
                ...displayFlags,
                useCorrectedItemTotal: e.target.checked,
              })
            }
          />
          <span>Gunakan korelasi terkoreksi (tanpa part-whole)</span>
        </label>

        <label className="option-check">
          <input
            type="checkbox"
            checked={displayFlags.showInterpretation}
            onChange={(e) =>
              onChangeFlags({ ...displayFlags, showInterpretation: e.target.checked })
            }
          />
          <span>Sertakan interpretasi reliabilitas</span>
        </label>
      </div>
    </section>
  );
}
