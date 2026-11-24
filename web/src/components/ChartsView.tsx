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

function formatScoreTick(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) {
    return String(rounded);
  }
  return Number(value.toFixed(2)).toString();
}

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

  const isMc = exam.kind === "multiple_choice";
  const usesWeighted = analysis.scoring.uses_weighted_score;
  const activeScores = analysis.scoring.subjects.map((s) => {
    if (!isMc) return (s as EssaySubjectScore).total_score;
    const mc = s as MultipleChoiceSubjectScore;
    return usesWeighted ? mc.weighted_score : mc.raw_score;
  });
  const minScore = activeScores.length > 0 ? Math.min(...activeScores) : 0;
  const maxScore = activeScores.length > 0 ? Math.max(...activeScores) : 1;
  const binCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(activeScores.length))));
  const span = Math.max(1e-6, maxScore - minScore);
  const binWidth = span / binCount;
  const bins = Array.from({ length: binCount }, (_, idx) => {
    const low = minScore + idx * binWidth;
    const high = low + binWidth;
    const scoresInBin = activeScores.filter((v) =>
      idx === binCount - 1 ? v >= low && v <= high + 1e-9 : v >= low && v < high,
    );
    const count = scoresInBin.length;
    const actualLow = count > 0 ? Math.min(...scoresInBin) : low;
    const actualHigh = count > 0 ? Math.max(...scoresInBin) : high;
    const lowLabel = formatScoreTick(actualLow);
    const highLabel = formatScoreTick(actualHigh);
    const rangeLabel = lowLabel === highLabel ? lowLabel : `${lowLabel}-${highLabel}`;
    return { low, high, count, rangeLabel };
  });
  const maxBinCount = Math.max(1, ...bins.map((b) => b.count));

  const safeIdx = Math.max(0, Math.min(analysis.item_count - 1, selectedItemIndex));

  const histSpec = useMemo<ExportableCardSpec>(
    () => ({
      id: "grafik-distribusi-skor",
      title: `Histogram Sebaran Skor Total Peserta (N=${analysis.subject_count})`,
      subtitle,
      getSvgElement: () => histRef.current,
      footnote: `Rentang skor ${formatScoreTick(minScore)} sampai ${formatScoreTick(maxScore)}${
        isMc ? (usesWeighted ? " (skor dibobot)" : " (skor mentah)") : ""
      }, rata-rata ${analysis.scoring.mean !== null ? analysis.scoring.mean.toFixed(2) : "NAN"}.`,
    }),
    [analysis.subject_count, analysis.scoring.mean, subtitle, minScore, maxScore, isMc, usesWeighted],
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

  return (
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
                        Skor {bin.rangeLabel}: {bin.count} peserta
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
                      {bin.rangeLabel}
                    </text>
                  </g>
                );
              })}
              <text x="242" y="234" textAnchor="middle" fontSize="11" fill="var(--ink-secondary)">
                Skor Total Peserta
              </text>
            </svg>
            {analysis.score_distribution && (
              <div className="dist-insight-box">
                <div className="dist-insight-meta">
                  <span>
                    Bentuk: <strong>{analysis.score_distribution.skew_label}</strong>
                    {analysis.score_distribution.skewness !== null
                      ? ` (skew=${analysis.score_distribution.skewness.toFixed(2)})`
                      : ""}
                  </span>
                  {analysis.score_distribution.iqr !== null && (
                    <span>
                      IQR: <strong>{analysis.score_distribution.iqr.toFixed(2)}</strong>
                    </span>
                  )}
                  {analysis.score_distribution.pass_percent !== null && (
                    <span>
                      Tuntas: <strong>{analysis.score_distribution.pass_percent.toFixed(1)}%</strong>
                    </span>
                  )}
                </div>
                <p style={{ margin: "0.3rem 0 0 0" }}>{analysis.score_distribution.narrative}</p>
              </div>
            )}
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
  );
}
