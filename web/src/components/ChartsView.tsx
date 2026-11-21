import { useMemo, useRef } from "react";
import type {
  AnalysisResponse,
  EssaySubjectScore,
  ExamPayload,
  MultipleChoiceSubjectScore,
} from "../types";
import type { ExportableCardSpec } from "../utils/resultExport";
import { CardExportBar } from "./CardExportBar";

export type ChartSvgKey = "histogram" | "scatter" | "detail";

interface ChartsViewProps {
  exam: ExamPayload;
  analysis: AnalysisResponse;
  subtitle?: string;
  selectedItemIndex: number;
  onSelectItem: (index: number) => void;
  onStatusMessage?: (msg: string) => void;
  onSvgRef?: (key: ChartSvgKey, el: SVGSVGElement | null) => void;
}

export function ChartsView({
  exam,
  analysis,
  subtitle,
  selectedItemIndex,
  onSelectItem,
  onStatusMessage,
  onSvgRef,
}: ChartsViewProps) {
  const histRef = useRef<SVGSVGElement | null>(null);
  const scatterRef = useRef<SVGSVGElement | null>(null);
  const detailRef = useRef<SVGSVGElement | null>(null);

  const isMc = exam.kind === "multiple_choice";
  const rawScores = analysis.scoring.subjects.map((s) =>
    isMc
      ? (s as MultipleChoiceSubjectScore).raw_score
      : (s as EssaySubjectScore).total_score,
  );
  const minScore = rawScores.length > 0 ? Math.min(...rawScores) : 0;
  const maxScore = rawScores.length > 0 ? Math.max(...rawScores) : 1;
  const binCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(rawScores.length))));
  const span = Math.max(1e-6, maxScore - minScore);
  const binWidth = span / binCount;
  const bins = Array.from({ length: binCount }, (_, idx) => {
    const low = minScore + idx * binWidth;
    const high = low + binWidth;
    const count = rawScores.filter((v) =>
      idx === binCount - 1 ? v >= low && v <= high + 1e-9 : v >= low && v < high,
    ).length;
    return { low, high, count };
  });
  const maxBinCount = Math.max(1, ...bins.map((b) => b.count));

  const safeIdx = Math.max(0, Math.min(analysis.item_count - 1, selectedItemIndex));
  const selectedDist = analysis.distractors?.[safeIdx];

  const histSpec = useMemo<ExportableCardSpec>(
    () => ({
      id: "grafik-distribusi-skor",
      title: `Histogram Sebaran Skor Total Peserta (N=${analysis.subject_count})`,
      subtitle,
      getSvgElement: () => histRef.current,
      footnote: `Rentang skor ${minScore.toFixed(1)} sampai ${maxScore.toFixed(1)}, rata-rata ${
        analysis.scoring.mean !== null ? analysis.scoring.mean.toFixed(2) : "NAN"
      }.`,
    }),
    [analysis.subject_count, analysis.scoring.mean, subtitle, minScore, maxScore],
  );

  const scatterSpec = useMemo<ExportableCardSpec>(
    () => ({
      id: "grafik-p-vs-d",
      title: "Diagram Pencar Tingkat Kesukaran (P%) vs Daya Pembeda (D%)",
      subtitle,
      getSvgElement: () => scatterRef.current,
      footnote: `Jumlah butir ${analysis.item_count}; butir aktif #${safeIdx + 1}.`,
    }),
    [analysis.item_count, safeIdx, subtitle],
  );

  const detailSpec = useMemo<ExportableCardSpec>(() => {
    if (isMc && selectedDist) {
      return {
        id: `grafik-opsi-butir-${selectedDist.item_number}`,
        title: `Distribusi Pilihan Jawaban Butir #${selectedDist.item_number}`,
        subtitle,
        getSvgElement: () => detailRef.current,
        footnote: `Kunci ${selectedDist.key}, kosong ${selectedDist.blank_count}, lainnya ${selectedDist.other_count}.`,
      };
    }
    return {
      id: "tabel-unggul-asor",
      title: "Perbandingan Kelompok Unggul vs Asor per Butir",
      subtitle,
      table: {
        headers: ["Butir", "Mean Unggul", "Mean Asor", "Selisih Mean", "t-hitung"],
        alignments: ["right", "right", "right", "right", "right"],
        rows: (analysis.essay_upper_lower ?? []).map((ul) => [
          `#${ul.item_number}`,
          ul.upper_mean?.toFixed(2) ?? "NAN",
          ul.lower_mean?.toFixed(2) ?? "NAN",
          ul.mean_diff?.toFixed(2) ?? "NAN",
          ul.t_value?.toFixed(2) ?? "NAN",
        ]),
      },
    };
  }, [isMc, selectedDist, analysis.essay_upper_lower, subtitle]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="charts-grid">
        <section className="card">
          <figure className="chart-figure">
            <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
              <figcaption style={{ margin: 0 }}>
                Bagaimana sebaran skor total peserta ujian ini? (N={analysis.subject_count})
              </figcaption>
              <CardExportBar spec={histSpec} onStatusMessage={onStatusMessage} />
            </div>
            <svg
              ref={(el) => {
                histRef.current = el;
                onSvgRef?.("histogram", el);
              }}
              className="chart-svg"
              viewBox="0 0 460 240"
              role="img"
              aria-label="Histogram distribusi skor total peserta"
            >
              <line x1="44" y1="196" x2="440" y2="196" stroke="var(--border-strong)" strokeWidth="1.5" />
              <line x1="44" y1="20" x2="44" y2="196" stroke="var(--border-strong)" strokeWidth="1.5" />
              {bins.map((bin, idx) => {
                const bw = (390 / binCount) - 6;
                const x = 48 + idx * (390 / binCount);
                const h = (bin.count / maxBinCount) * 160;
                const y = 196 - h;
                return (
                  <g key={idx}>
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(8, bw)}
                      height={h}
                      fill="var(--accent)"
                      rx="2"
                    >
                      <title>
                        Rentang {bin.low.toFixed(1)}..{bin.high.toFixed(1)}: {bin.count} peserta
                      </title>
                    </rect>
                    <text
                      x={x + Math.max(8, bw) / 2}
                      y={Math.max(14, y - 5)}
                      textAnchor="middle"
                      fontSize="11"
                      fill="var(--ink-primary)"
                    >
                      {bin.count}
                    </text>
                    <text
                      x={x + Math.max(8, bw) / 2}
                      y={214}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--ink-secondary)"
                    >
                      {bin.low.toFixed(0)}
                    </text>
                  </g>
                );
              })}
              <text x="242" y="234" textAnchor="middle" fontSize="11" fill="var(--ink-secondary)">
                Skor Total Peserta
              </text>
            </svg>
          </figure>
        </section>

        <section className="card">
          <figure className="chart-figure">
            <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
              <figcaption style={{ margin: 0 }}>
                Butir mana yang seimbang antara Tingkat Kesukaran (P%) dan Daya Pembeda (D%)?
              </figcaption>
              <CardExportBar spec={scatterSpec} onStatusMessage={onStatusMessage} />
            </div>
            <svg
              ref={(el) => {
                scatterRef.current = el;
                onSvgRef?.("scatter", el);
              }}
              className="chart-svg"
              viewBox="0 0 460 240"
              role="img"
              aria-label="Diagram pencar tingkat kesukaran P terhadap daya pembeda D"
            >
              <line x1="48" y1="110" x2="440" y2="110" stroke="var(--border-subtle)" strokeDasharray="4 4" />
              <line x1="165" y1="20" x2="165" y2="196" stroke="var(--border-subtle)" strokeDasharray="4 4" />
              <line x1="322" y1="20" x2="322" y2="196" stroke="var(--border-subtle)" strokeDasharray="4 4" />
              <line x1="48" y1="196" x2="440" y2="196" stroke="var(--border-strong)" strokeWidth="1.5" />
              <line x1="48" y1="20" x2="48" y2="196" stroke="var(--border-strong)" strokeWidth="1.5" />

              {analysis.difficulty.map((tk, idx) => {
                const dp = analysis.discrimination[idx];
                if (
                  tk.index_percent === null ||
                  dp?.index_percent === null ||
                  dp?.index_percent === undefined
                ) {
                  return null;
                }
                const cx = 48 + (Math.max(0, Math.min(100, tk.index_percent)) / 100) * 388;
                const clampedDp = Math.max(-100, Math.min(100, dp.index_percent));
                const cy = 110 - (clampedDp / 100) * 86;
                const isSel = idx === safeIdx;
                return (
                  <g
                    key={idx}
                    role="button"
                    tabIndex={0}
                    aria-label={`Pilih Butir ${tk.item_number}: TK ${tk.index_percent.toFixed(1)}%, DP ${dp.index_percent.toFixed(1)}%`}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelectItem(idx)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectItem(idx);
                      }
                    }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSel ? 6.5 : 4.5}
                      fill={isSel ? "var(--warn)" : "var(--accent)"}
                      stroke="var(--bg-panel)"
                      strokeWidth="1.5"
                    >
                      <title>
                        Butir #{tk.item_number}: TK={tk.index_percent.toFixed(1)}%, DP=
                        {dp.index_percent.toFixed(1)}%
                      </title>
                    </circle>
                    {isSel && (
                      <text
                        x={cx}
                        y={cy - 10}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill="var(--ink-primary)"
                      >
                        B{tk.item_number}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x="48" y="214" fontSize="10" fill="var(--ink-secondary)">0%</text>
              <text x="165" y="214" textAnchor="middle" fontSize="10" fill="var(--ink-secondary)">30%</text>
              <text x="322" y="214" textAnchor="middle" fontSize="10" fill="var(--ink-secondary)">70%</text>
              <text x="436" y="214" textAnchor="end" fontSize="10" fill="var(--ink-secondary)">100%</text>
              <text x="244" y="234" textAnchor="middle" fontSize="11" fill="var(--ink-secondary)">
                Tingkat Kesukaran P (%) | klik titik untuk memilih butir
              </text>
              <text x="14" y="26" fontSize="10" fill="var(--ink-secondary)">+100</text>
              <text x="26" y="114" fontSize="10" fill="var(--ink-secondary)">0</text>
              <text x="14" y="196" fontSize="10" fill="var(--ink-secondary)">-100</text>
            </svg>
          </figure>
        </section>
      </div>

      <section className="card">
        <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            {isMc
              ? `Bagaimana distribusi pilihan jawaban pada Butir #${safeIdx + 1}?`
              : "Bagaimana perbandingan rata-rata Kelompok Unggul vs Asor per butir?"}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
            <div className="field-inline">
              <label htmlFor="chart-item-select">Butir terpilih</label>
              <select
                id="chart-item-select"
                value={safeIdx}
                onChange={(e) => onSelectItem(Number(e.target.value))}
              >
                {analysis.difficulty.map((d) => (
                  <option key={d.item_index} value={d.item_index}>
                    Butir #{d.item_number}
                  </option>
                ))}
              </select>
            </div>
            <CardExportBar spec={detailSpec} onStatusMessage={onStatusMessage} />
          </div>
        </div>

        {isMc && selectedDist ? (
          <svg
            ref={(el) => {
              detailRef.current = el;
              onSvgRef?.("detail", el);
            }}
            className="chart-svg"
            style={{ maxInlineSize: "38rem" }}
            viewBox="0 0 520 190"
            role="img"
            aria-label={`Grafik batang distribusi opsi butir ${selectedDist.item_number}`}
          >
            {selectedDist.options.map((opt, idx) => {
              const y = 16 + idx * 32;
              const pct =
                analysis.subject_count > 0
                  ? (opt.frequency / analysis.subject_count) * 100
                  : 0;
              const barW = (pct / 100) * 320;
              const isKey = opt.option === selectedDist.key;
              return (
                <g key={opt.option}>
                  <text
                    x="14"
                    y={y + 16}
                    fontSize="12"
                    fontWeight={isKey ? "700" : "500"}
                    fill={isKey ? "var(--accent)" : "var(--ink-primary)"}
                  >
                    {opt.option} {isKey ? "(Kunci)" : ""}
                  </text>
                  <rect
                    x="86"
                    y={y + 2}
                    width="320"
                    height="20"
                    fill="var(--bg-subtle)"
                    rx="3"
                  />
                  <rect
                    x="86"
                    y={y + 2}
                    width={barW}
                    height="20"
                    fill={isKey ? "var(--accent)" : "var(--border-strong)"}
                    rx="3"
                  />
                  <text
                    x="416"
                    y={y + 16}
                    fontSize="12"
                    fill="var(--ink-primary)"
                  >
                    {opt.frequency} ({pct.toFixed(0)}%) [{opt.quality || "-"}]
                  </text>
                </g>
              );
            })}
          </svg>
        ) : analysis.essay_upper_lower ? (
          <div style={{ overflowX: "auto" }}>
            <table className="apa-table">
              <thead>
                <tr>
                  <th className="num">Butir</th>
                  <th className="num">Mean Unggul</th>
                  <th className="num">Mean Asor</th>
                  <th className="num">Selisih Mean</th>
                  <th className="num">t-hitung</th>
                </tr>
              </thead>
              <tbody>
                {analysis.essay_upper_lower.map((ul) => (
                  <tr key={ul.item_index}>
                    <td className="num">#{ul.item_number}</td>
                    <td className="num">{ul.upper_mean?.toFixed(2) ?? "NAN"}</td>
                    <td className="num">{ul.lower_mean?.toFixed(2) ?? "NAN"}</td>
                    <td className="num">{ul.mean_diff?.toFixed(2) ?? "NAN"}</td>
                    <td className="num">{ul.t_value?.toFixed(2) ?? "NAN"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
