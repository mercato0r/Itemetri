import type { AnalysisResponse, ItemVerdictStatus } from "../types";

interface ItemQualityMatrixProps {
  analysis: AnalysisResponse;
  selectedItemIndex: number;
  onSelectItem: (index: number) => void;
  useCorrected: boolean;
  embedded?: boolean;
}

function verdictClass(status: ItemVerdictStatus): string {
  if (status === "Terima") return "is-accept";
  if (status === "Revisi") return "is-revise";
  return "is-reject";
}

export function ItemQualityMatrix({
  analysis,
  selectedItemIndex,
  onSelectItem,
  useCorrected,
  embedded = false,
}: ItemQualityMatrixProps) {
  const verdicts = analysis.verdicts ?? [];
  if (verdicts.length === 0) return null;

  let accept = 0;
  let revise = 0;
  let reject = 0;
  let miskey = 0;

  for (const v of verdicts) {
    const st = useCorrected && v.corrected_status ? v.corrected_status : v.status;
    if (st === "Terima") accept++;
    else if (st === "Revisi") revise++;
    else reject++;
    if (v.suspected_miskey) miskey++;
  }

  const gridBody = (
    <>
      <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
        {embedded ? (
          <h3 id="item-matrix-title" className="item-matrix-subhead">
            Peta Kualitas Seluruh Butir ({verdicts.length} butir)
          </h3>
        ) : (
          <h2 id="item-matrix-title" className="card-title" style={{ margin: 0 }}>
            Matriks Kualitas Seluruh Butir ({verdicts.length} butir)
          </h2>
        )}
        <div className="matrix-legend">
          {!embedded && (
            <>
              <span className="verdict-badge is-accept">Terima: {accept}</span>
              <span className="verdict-badge is-revise">Revisi: {revise}</span>
              <span className="verdict-badge is-reject">Tolak: {reject}</span>
            </>
          )}
          {miskey > 0 && (
            <span className="verdict-badge is-reject">Salah Kunci?: {miskey}</span>
          )}
        </div>
      </div>

      <p
        style={{
          margin: "0 0 var(--space-2) 0",
          fontSize: "0.8rem",
          color: "var(--ink-secondary)",
        }}
      >
        Klik salah satu kotak butir untuk melihat diagnosis kriteria dan detail pengecoh di bawah.
      </p>

      <div className="item-quality-grid" role="list">
        {verdicts.map((v, idx) => {
          const st = useCorrected && v.corrected_status ? v.corrected_status : v.status;
          const tk = analysis.difficulty[idx]?.index_percent;
          const dp = analysis.discrimination[idx]?.index_percent;
          const isSelected = idx === selectedItemIndex;
          return (
            <button
              key={v.item_index}
              type="button"
              role="listitem"
              className={`item-quality-cell ${verdictClass(st)}${isSelected ? " is-selected" : ""}`}
              onClick={() => onSelectItem(v.item_index)}
              aria-pressed={isSelected ? "true" : "false"}
              title={`Butir #${v.item_number}: ${st} | TK=${tk !== null && tk !== undefined ? tk.toFixed(0) : "-"}%, DP=${dp !== null && dp !== undefined ? dp.toFixed(0) : "-"}%`}
            >
              <div className="item-quality-cell-top">
                <span className="item-quality-num">#{v.item_number}</span>
                {v.suspected_miskey && (
                  <span className="item-quality-flag" title="Diduga salah kunci">
                    !
                  </span>
                )}
              </div>
              <div className="item-quality-stats">
                TK {tk !== null && tk !== undefined ? `${tk.toFixed(0)}%` : "-"}
              </div>
              <div className="item-quality-stats">
                DP {dp !== null && dp !== undefined ? `${dp.toFixed(0)}%` : "-"}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="item-matrix-embedded" role="region" aria-labelledby="item-matrix-title">
        {gridBody}
      </div>
    );
  }

  return (
    <section className="card" aria-labelledby="item-matrix-title">
      {gridBody}
    </section>
  );
}
