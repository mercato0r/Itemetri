import { useCallback, useMemo, useRef, useState } from "react";
import type { EffectiveVariableKind, WorksheetState, WorksheetSummaryKind } from "../model/worksheet";
import type {
  AnalysisOptions,
  AnalysisResponse,
  CompatibilityDiff,
  EssaySubjectScore,
  ExamPayload,
  ItemVerdictStatus,
  MultipleChoiceSubjectScore,
  SampleFileInfo,
  ScoringWeights,
} from "../types";
import type { ExportableCardSpec, ExportMetricItem } from "../utils/resultExport";
import { CardExportBar } from "./CardExportBar";
import { ChartsView, type ChartSvgKey } from "./ChartsView";
import { CheckIcon, UploadIcon, WarningIcon } from "./Icons";
import { SampleListGrid } from "./ImportMapperDialog";
import type { ResultModuleToggles } from "./JamoviRibbon";
import { MethodNotes } from "./MethodNotes";
import { OptionsDrawer, type UiDisplayFlags } from "./OptionsDrawer";

type SortKey = "no" | "tk" | "dp" | "r" | "alphaDel" | "category" | "significance" | "verdict";
type SortDir = "ascending" | "descending";

interface ResultsCanvasProps {
  worksheet: WorksheetState;
  exam: ExamPayload;
  hasActiveResponses: boolean;
  summaryKind: WorksheetSummaryKind;
  effectiveKinds: EffectiveVariableKind[];
  analysis: AnalysisResponse | null;
  diff: CompatibilityDiff | null;
  options: AnalysisOptions;
  displayFlags: UiDisplayFlags;
  modules: ResultModuleToggles;
  samples: SampleFileInfo[];
  selectedItemIndex: number;
  onSelectItem: (index: number) => void;
  onLoadSample: (filename: string) => void;
  onOpenImport: () => void;
  onChangeOptions: (next: AnalysisOptions) => void;
  onChangeWeights: (weights: ScoringWeights) => void;
  onChangeFlags: (next: UiDisplayFlags) => void;
  onStatusMessage?: (msg: string) => void;
}

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function fmt(val: number | null | undefined, digits = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "NAN";
  return val.toFixed(digits);
}

function compareNullableNum(a: number | null, b: number | null, factor: number): number {
  const aValid = a !== null && Number.isFinite(a);
  const bValid = b !== null && Number.isFinite(b);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  return factor * ((a as number) - (b as number));
}

function verdictBadgeClass(status: ItemVerdictStatus): string {
  if (status === "Terima") return "verdict-badge is-accept";
  if (status === "Revisi") return "verdict-badge is-revise";
  return "verdict-badge is-reject";
}

export function ResultsCanvas({
  worksheet,
  exam,
  hasActiveResponses,
  summaryKind,
  effectiveKinds,
  analysis,
  diff,
  options,
  displayFlags,
  modules,
  samples,
  selectedItemIndex,
  onSelectItem,
  onLoadSample,
  onOpenImport,
  onChangeOptions,
  onChangeWeights,
  onChangeFlags,
  onStatusMessage,
}: ResultsCanvasProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState<"all" | ItemVerdictStatus>("all");
  const [sortKey, setSortKey] = useState<SortKey>("no");
  const [sortDir, setSortDir] = useState<SortDir>("ascending");
  const [distractorViewMode, setDistractorViewMode] = useState<"detail" | "matrix">("detail");
  const [scoresExpanded, setScoresExpanded] = useState(false);

  const chartSvgRefs = useRef<Record<ChartSvgKey, SVGSVGElement | null>>({
    histogram: null,
    scatter: null,
    detail: null,
  });

  const handleSvgRef = useCallback((key: ChartSvgKey, el: SVGSVGElement | null) => {
    chartSvgRefs.current[key] = el;
  }, []);

  const safeItemIdx = analysis
    ? Math.max(0, Math.min(analysis.item_count - 1, selectedItemIndex))
    : 0;
  const isPureMc = summaryKind === "multiple_choice" && exam.kind === "multiple_choice";

  const contextSubtitle = useMemo(() => {
    if (!analysis) return undefined;
    const modeName =
      options.mode === "legacy_anates" ? "Legacy ANATES" : "Standar Terkoreksi";
    const kindName =
      summaryKind === "mixed"
        ? "Campuran PG+Uraian"
        : isPureMc
          ? "Pilihan Ganda"
          : "Uraian";
    const source = worksheet.sourcePath ?? "Lembar Kerja Bebas";
    return `${source} | ${kindName} | Mode ${modeName} | N=${analysis.subject_count}, M=${analysis.item_count}`;
  }, [analysis, options.mode, summaryKind, isPureMc, worksheet.sourcePath]);

  const itemRows = useMemo(() => {
    if (!analysis) return [];
    return analysis.difficulty.map((tk, idx) => {
      const dp = analysis.discrimination[idx];
      const corr = analysis.correlations[idx];
      const colMeta = worksheet.columns[idx];
      const kind = effectiveKinds[idx] ?? "multiple_choice";
      const activeR = displayFlags.useCorrectedItemTotal
        ? (corr?.corrected_correlation ?? corr?.correlation ?? null)
        : (corr?.correlation ?? null);
      const activeSig = displayFlags.useCorrectedItemTotal
        ? (corr?.corrected_significance ?? corr?.significance ?? "-")
        : (corr?.significance ?? "-");

      const verdictObj = analysis.verdicts?.[idx];
      const verdictStatus: ItemVerdictStatus | null = verdictObj
        ? displayFlags.useCorrectedItemTotal
          ? (verdictObj.corrected_status ?? verdictObj.status)
          : verdictObj.status
        : null;
      const verdictReasons = verdictObj
        ? displayFlags.useCorrectedItemTotal && verdictObj.corrected_status
          ? (verdictObj.corrected_reasons ?? [])
          : verdictObj.reasons
        : [];
      const distItem = isPureMc ? analysis.distractors?.[idx] : undefined;
      const distractorRatio =
        distItem && distItem.distractor_count && distItem.distractor_count > 0
          ? `${distItem.functioning_count ?? 0}/${distItem.distractor_count}`
          : null;

      return {
        itemIndex: tk.item_index,
        itemNumber: tk.item_number,
        typeLabel: kind === "multiple_choice" ? "PG" : "Uraian",
        reference: colMeta?.referenceValue ?? "-",
        dp: dp?.index_percent ?? null,
        tk: tk.index_percent,
        category: tk.category ?? "-",
        r: corr?.correlation ?? null,
        rCorr: corr?.corrected_correlation ?? null,
        activeR,
        alphaDel: corr?.alpha_if_deleted ?? null,
        significance: activeSig,
        tVal: analysis.essay_upper_lower?.[idx]?.t_value ?? null,
        distractorRatio,
        verdictStatus,
        suspectedMiskey: Boolean(verdictObj?.suspected_miskey),
        verdictReasonsText: verdictReasons.join("; "),
      };
    });
  }, [analysis, worksheet.columns, effectiveKinds, displayFlags.useCorrectedItemTotal, isPureMc]);

  const categories = useMemo(
    () => Array.from(new Set(itemRows.map((r) => r.category).filter((c) => c !== "-"))),
    [itemRows],
  );

  const visibleItemRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = itemRows.filter((row) => {
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (verdictFilter !== "all" && row.verdictStatus !== verdictFilter) return false;
      if (!q) return true;
      return (
        String(row.itemNumber).includes(q) ||
        row.typeLabel.toLowerCase().includes(q) ||
        row.reference.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        row.significance.toLowerCase().includes(q) ||
        (row.verdictStatus?.toLowerCase().includes(q) ?? false) ||
        row.verdictReasonsText.toLowerCase().includes(q) ||
        (row.suspectedMiskey && "salah kunci".includes(q))
      );
    });
    const factor = sortDir === "ascending" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "no":
          return factor * (a.itemNumber - b.itemNumber);
        case "tk":
          return compareNullableNum(a.tk, b.tk, factor);
        case "dp":
          return compareNullableNum(a.dp, b.dp, factor);
        case "r":
          return compareNullableNum(a.activeR, b.activeR, factor);
        case "alphaDel":
          return compareNullableNum(a.alphaDel, b.alphaDel, factor);
        case "category":
          return factor * COLLATOR.compare(a.category, b.category);
        case "significance":
          return factor * COLLATOR.compare(a.significance, b.significance);
        case "verdict":
          return factor * COLLATOR.compare(a.verdictStatus ?? "", b.verdictStatus ?? "");
      }
    });
  }, [itemRows, searchQuery, categoryFilter, verdictFilter, sortKey, sortDir]);

  const verdictSummary = useMemo(() => {
    let accept = 0;
    let revise = 0;
    let reject = 0;
    for (const row of visibleItemRows) {
      if (row.verdictStatus === "Terima") accept += 1;
      else if (row.verdictStatus === "Revisi") revise += 1;
      else if (row.verdictStatus === "Tolak") reject += 1;
    }
    return { accept, revise, reject };
  }, [visibleItemRows]);

  const meanPctText = useMemo(() => {
    if (!analysis) return "NAN";
    const ideal = analysis.scoring.ideal_max_score;
    const meanVal = analysis.scoring.mean;
    if (
      ideal === null ||
      ideal === undefined ||
      !Number.isFinite(ideal) ||
      ideal <= 0 ||
      meanVal === null ||
      !Number.isFinite(meanVal)
    ) {
      return "NAN";
    }
    return `${((meanVal / ideal) * 100).toFixed(1)}%`;
  }, [analysis]);

  const reliabilitySpec = useMemo<ExportableCardSpec | null>(() => {
    if (!analysis) return null;
    const metrics: ExportMetricItem[] = [
      {
        label: "Alpha Cronbach (α)",
        value: fmt(analysis.reliability.cronbach_alpha),
        note: displayFlags.showInterpretation ? analysis.interpretations.cronbach_alpha : undefined,
      },
    ];
    if (isPureMc) {
      metrics.push(
        {
          label: "KR-20",
          value: fmt(analysis.reliability.kr20),
          note: displayFlags.showInterpretation
            ? (analysis.interpretations.kr20 ?? undefined)
            : undefined,
        },
        {
          label: "KR-21",
          value: fmt(analysis.reliability.kr21),
          note: displayFlags.showInterpretation
            ? (analysis.interpretations.kr21 ?? undefined)
            : undefined,
        },
      );
    }
    metrics.push(
      {
        label: "Belah Dua (r_tt)",
        value: fmt(analysis.reliability.reliability_coefficient),
        note: displayFlags.showInterpretation
          ? `r_xy=${fmt(analysis.reliability.correlation_xy)} (${analysis.interpretations.reliability_tt})`
          : undefined,
      },
      {
        label: "Rata-rata / Simpangan Baku",
        value: `${fmt(analysis.scoring.mean)} / ${fmt(analysis.scoring.std_dev)}`,
        note: `Skor ${analysis.scoring.uses_weighted_score ? "Dibobot" : "Mentah"}`,
      },
      {
        label: "Skor Min / Median / Maks",
        value: `${fmt(analysis.scoring.min_score)} / ${fmt(analysis.scoring.median_score)} / ${fmt(analysis.scoring.max_score)}`,
        note: "Sebaran skor peserta",
      },
      {
        label: "Skor Ideal / Rata-rata %",
        value: `${fmt(analysis.scoring.ideal_max_score)} / ${meanPctText}`,
        note: "Capaian rerata terhadap skor ideal",
      },
    );
    return {
      id: "ringkasan-reliabilitas",
      title: "Ringkasan Reliabilitas & Statistik Tes",
      subtitle: contextSubtitle,
      metrics,
      footnote: `Kelompok unggul/asor: masing-masing n=${analysis.upper_lower.group_size} (${options.upper_lower_percent}%).`,
    };
  }, [
    analysis,
    isPureMc,
    displayFlags.showInterpretation,
    contextSubtitle,
    options.upper_lower_percent,
    meanPctText,
  ]);

  const itemsSpec = useMemo<ExportableCardSpec | null>(() => {
    if (!analysis) return null;
    const headers: string[] = ["No", "Tipe", "Acuan"];
    const alignments: Array<"left" | "right"> = ["right", "left", "left"];
    if (!isPureMc) {
      headers.push("t");
      alignments.push("right");
    }
    headers.push("DP(%)", "TK(%)", "Kategori", displayFlags.useCorrectedItemTotal ? "r_corr" : "r");
    alignments.push("right", "right", "left", "right");
    if (!displayFlags.useCorrectedItemTotal) {
      headers.push("r_corr");
      alignments.push("right");
    }
    headers.push(
      "α(-j)",
      displayFlags.useCorrectedItemTotal ? "Sig. (r_corr)" : "Signifikansi",
    );
    alignments.push("right", "left");
    if (isPureMc) {
      headers.push("Pengecoh");
      alignments.push("right");
    }
    headers.push("Keputusan", "Catatan");
    alignments.push("left", "left");

    const rows = visibleItemRows.map((row) => {
      const cells: string[] = [String(row.itemNumber), row.typeLabel, row.reference];
      if (!isPureMc) cells.push(fmt(row.tVal));
      cells.push(
        fmt(row.dp),
        fmt(row.tk),
        row.category,
        fmt(displayFlags.useCorrectedItemTotal ? row.rCorr : row.r, 3),
      );
      if (!displayFlags.useCorrectedItemTotal) {
        cells.push(fmt(row.rCorr, 3));
      }
      cells.push(fmt(row.alphaDel, 3), row.significance);
      if (isPureMc) cells.push(row.distractorRatio ?? "-");
      const verdictLabel = row.verdictStatus
        ? row.suspectedMiskey
          ? `${row.verdictStatus} (Salah Kunci?)`
          : row.verdictStatus
        : "-";
      cells.push(verdictLabel, row.verdictReasonsText || "-");
      return cells;
    });

    const recap = `Rekap keputusan: Terima ${verdictSummary.accept}, Revisi ${verdictSummary.revise}, Tolak ${verdictSummary.reject}.`;
    return {
      id: "analisis-butir-soal",
      title: `Analisis Butir Soal (${visibleItemRows.length}/${itemRows.length})`,
      subtitle: contextSubtitle,
      table: { headers, alignments, rows },
      footnote: `DP = Daya Pembeda, TK = Tingkat Kesukaran, α(-j) = Alpha jika butir dihapus. ${recap}`,
    };
  }, [
    analysis,
    isPureMc,
    displayFlags.useCorrectedItemTotal,
    visibleItemRows,
    itemRows.length,
    contextSubtitle,
    verdictSummary,
  ]);

  const distractorSpec = useMemo<ExportableCardSpec | null>(() => {
    if (!analysis) return null;
    if (isPureMc && distractorViewMode === "matrix" && analysis.distractors?.length) {
      const firstOpts = analysis.distractors[0]!.options.map((o) => o.option);
      const headers = ["Butir", "Kunci", ...firstOpts, "Kosong", "Berfungsi"];
      const alignments: Array<"left" | "right"> = [
        "right",
        "left",
        ...firstOpts.map(() => "right" as const),
        "right",
        "right",
      ];
      const rows = analysis.distractors.map((dist) => [
        String(dist.item_number),
        dist.key,
        ...dist.options.map((opt) => `${opt.frequency} (${opt.quality || "-"})`),
        String(dist.blank_count),
        `${dist.functioning_count ?? 0}/${dist.distractor_count ?? Math.max(0, dist.options.length - 1)}`,
      ]);
      return {
        id: "matriks-pengecoh-semua-butir",
        title: `Matriks Pengecoh Seluruh Butir (${analysis.distractors.length} butir)`,
        subtitle: contextSubtitle,
        table: { headers, alignments, rows },
        footnote: `Kelompok unggul/asor: masing-masing n=${analysis.upper_lower.group_size}.`,
      };
    }

    if (isPureMc && analysis.distractors?.[safeItemIdx]) {
      const dist = analysis.distractors[safeItemIdx]!;
      return {
        id: `distribusi-pilihan-butir-${safeItemIdx + 1}`,
        title: `Distribusi Pilihan Butir #${safeItemIdx + 1}`,
        subtitle: contextSubtitle,
        table: {
          headers: [
            "Opsi",
            "Status",
            "Frekuensi",
            "Proporsi (%)",
            "Atas",
            "Bawah",
            "Fungsi",
            "Kualitas IP%",
          ],
          alignments: ["left", "left", "right", "right", "right", "right", "left", "left"],
          rows: dist.options.map((opt) => {
            const pct =
              analysis.subject_count > 0 ? (opt.frequency / analysis.subject_count) * 100 : 0;
            const funcText =
              opt.option === dist.key
                ? "Kunci"
                : opt.is_functioning === true
                  ? "Berfungsi"
                  : opt.is_functioning === false
                    ? "Lemah"
                    : "-";
            return [
              opt.option,
              opt.option === dist.key ? "Kunci" : "Pengecoh",
              String(opt.frequency),
              `${pct.toFixed(1)}%`,
              String(opt.upper_count ?? 0),
              String(opt.lower_count ?? 0),
              funcText,
              opt.quality || "-",
            ];
          }),
        },
        footnote: `Kosong: ${dist.blank_count} (Atas ${dist.upper_blank_count ?? 0} / Bawah ${dist.lower_blank_count ?? 0}) | Lainnya: ${dist.other_count} | Ideal pengecoh: ${fmt(dist.ideal_count)}.`,
      };
    }

    const ul = analysis.essay_upper_lower?.[safeItemIdx];
    if (ul) {
      return {
        id: `unggul-asor-butir-${ul.item_number}`,
        title: `Rincian Kelompok Unggul-Asor Butir #${ul.item_number}`,
        subtitle: contextSubtitle,
        metrics: [
          {
            label: "Mean Unggul / Asor",
            value: `${fmt(ul.upper_mean)} / ${fmt(ul.lower_mean)}`,
          },
          {
            label: "SD Unggul / Asor",
            value: `${fmt(ul.upper_std)} / ${fmt(ul.lower_std)}`,
          },
          {
            label: "SE_gab / t-hitung",
            value: `${fmt(ul.se_pooled)} / ${fmt(ul.t_value)}`,
            note: ul.p_value !== null ? `p=${fmt(ul.p_value, 4)}` : "p=-",
          },
        ],
      };
    }
    return null;
  }, [analysis, isPureMc, distractorViewMode, safeItemIdx, contextSubtitle]);

  const comparisonSpec = useMemo<ExportableCardSpec | null>(() => {
    if (!diff) return null;
    return {
      id: "audit-mode-legacy-vs-standar",
      title: "Audit Mode: Legacy ANATES vs Standar Terkoreksi",
      subtitle: contextSubtitle,
      metrics: [
        { label: "r_tt Legacy ANATES", value: fmt(diff.legacy_reliability, 4) },
        { label: "r_tt Standar Terkoreksi", value: fmt(diff.corrected_reliability, 4) },
        { label: "Selisih Reliabilitas", value: fmt(diff.reliability_delta, 4) },
      ],
      table:
        diff.significance_changes.length > 0
          ? {
              headers: [
                "Butir",
                "r",
                "p (Terkoreksi)",
                "Signifikansi Legacy",
                "Signifikansi Terkoreksi",
              ],
              alignments: ["right", "right", "right", "left", "left"],
              rows: diff.significance_changes.map((chg) => [
                String(chg.item_number),
                fmt(chg.correlation, 3),
                fmt(chg.corrected_p_value, 4),
                chg.legacy_significance,
                chg.corrected_significance,
              ]),
            }
          : undefined,
      footnote:
        diff.significance_changes.length === 0
          ? "Tidak ada pergeseran status signifikansi korelasi antar kedua mode."
          : undefined,
    };
  }, [diff, contextSubtitle]);

  const scoresSpec = useMemo<ExportableCardSpec | null>(() => {
    if (!analysis) return null;
    const headers = isPureMc
      ? ["Urut", "Nama", "Betul", "Salah", "Kosong", "Skor Akhir", "Dibobot"]
      : ["Urut", "Nama", "Kosong", "Skor Total"];
    const alignments: Array<"left" | "right"> = isPureMc
      ? ["right", "left", "right", "right", "right", "right", "right"]
      : ["right", "left", "right", "right"];

    const rows = analysis.scoring.sorted_order
      .map((subjIdx, rank) => {
        const s = analysis.scoring.subjects[subjIdx];
        if (!s) return null;
        if (isPureMc) {
          const mc = s as MultipleChoiceSubjectScore;
          return [
            String(rank + 1),
            mc.name || `Peserta ${mc.original_index + 1}`,
            String(mc.correct_count),
            String(mc.wrong_count),
            String(mc.blank_count),
            fmt(mc.raw_score),
            fmt(mc.weighted_score),
          ];
        }
        const es = s as EssaySubjectScore;
        return [
          String(rank + 1),
          es.name || `Peserta ${es.original_index + 1}`,
          String(es.blank_count),
          fmt(es.total_score),
        ];
      })
      .filter((r): r is string[] => r !== null);

    return {
      id: "skor-peserta",
      title: `Skor Peserta Terurut Menurun (${analysis.subject_count} peserta)`,
      subtitle: contextSubtitle,
      table: { headers, alignments, rows },
    };
  }, [analysis, isPureMc, contextSubtitle]);

  const allResultsSpec = useMemo<ExportableCardSpec | null>(() => {
    if (!analysis) return null;
    const sections: ExportableCardSpec[] = [];
    if (modules.reliability && reliabilitySpec) sections.push(reliabilitySpec);
    if (modules.items && itemsSpec) sections.push(itemsSpec);
    if (modules.distractors && distractorSpec) sections.push(distractorSpec);
    if (modules.charts) {
      sections.push(
        {
          id: "grafik-distribusi-skor",
          title: `Histogram Sebaran Skor Total Peserta (N=${analysis.subject_count})`,
          getSvgElement: () => chartSvgRefs.current.histogram,
        },
        {
          id: "grafik-p-vs-d",
          title: "Diagram Pencar Tingkat Kesukaran (P%) vs Daya Pembeda (D%)",
          getSvgElement: () => chartSvgRefs.current.scatter,
        },
      );
      if (isPureMc && analysis.distractors?.[safeItemIdx]) {
        sections.push({
          id: `grafik-opsi-butir-${safeItemIdx + 1}`,
          title: `Grafik Distribusi Pilihan Butir #${safeItemIdx + 1}`,
          getSvgElement: () => chartSvgRefs.current.detail,
        });
      }
    }
    if (modules.comparison && comparisonSpec) sections.push(comparisonSpec);
    if (scoresSpec) sections.push(scoresSpec);

    return {
      id: "laporan-analisis-lengkap",
      title: "Laporan Hasil Analisis Butir Soal",
      subtitle: contextSubtitle,
      sections,
    };
  }, [
    analysis,
    modules,
    reliabilitySpec,
    itemsSpec,
    distractorSpec,
    comparisonSpec,
    scoresSpec,
    contextSubtitle,
    isPureMc,
    safeItemIdx,
  ]);

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "ascending" ? "descending" : "ascending"));
    } else {
      setSortKey(nextKey);
      setSortDir("ascending");
    }
  };

  const renderSortTh = (key: SortKey, label: string, numeric = false) => {
    const sorted = sortKey === key;
    return (
      <th
        scope="col"
        className={numeric ? "num" : undefined}
        aria-sort={sorted ? sortDir : undefined}
      >
        <button
          type="button"
          className={`sort-btn${numeric ? " num" : ""}`}
          onClick={() => toggleSort(key)}
        >
          <span>{label}</span>
          <span className="sort-indicator" aria-hidden="true" />
        </button>
      </th>
    );
  };

  const anyModuleVisible =
    modules.reliability ||
    modules.items ||
    modules.distractors ||
    modules.charts ||
    modules.comparison ||
    modules.options;

  const itemTableColCount =
    11 +
    (isPureMc ? 1 : 0) +
    (!isPureMc ? 1 : 0) +
    (!displayFlags.useCorrectedItemTotal ? 1 : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {modules.options && (
        <OptionsDrawer
          summaryKind={summaryKind}
          weights={worksheet.weights}
          options={options}
          displayFlags={displayFlags}
          onChangeOptions={onChangeOptions}
          onChangeWeights={onChangeWeights}
          onChangeFlags={onChangeFlags}
        />
      )}

      {!hasActiveResponses ? (
        <section className="card" aria-labelledby="blank-guide-title">
          <h2 id="blank-guide-title" className="card-title">
            Dokumen Hasil Siap Menghitung
          </h2>
          <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--ink-secondary)" }}>
            Lembar kerja di sebelah kiri saat ini masih kosong. Ketik atau tempel blok data
            langsung dari Excel (<code>Ctrl+V</code>), atur baris <strong>Kunci / Skor Ideal</strong>{" "}
            dengan huruf (<code>A..E</code> untuk PG) atau angka (misalnya <code>10</code> untuk Uraian),
            atau muat berkas di bawah ini.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBlockEnd: samples.length > 0 ? "var(--space-3)" : 0 }}>
            <button type="button" className="btn btn-primary" onClick={onOpenImport}>
              <UploadIcon />
              <span>Impor .ANA / .CSV / .XLSX</span>
            </button>
          </div>

          {samples.length > 0 && (
            <div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBlockEnd: "var(--space-2)" }}>
                Buka Arsip Sampel & Simulasi Lokal
              </div>
              <SampleListGrid samples={samples} onPick={onLoadSample} />
            </div>
          )}
        </section>
      ) : !analysis ? (
        <div className="card" role="status">
          Menghitung hasil analisis psikometri...
        </div>
      ) : (
        <>
          <div className="mode-callout">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
              <div>
                <strong>Mode:</strong>{" "}
                {options.mode === "legacy_anates" ? "Legacy ANATES" : "Standar Terkoreksi"}
                {summaryKind === "mixed" && " (Model Terpadu Campuran PG+Uraian)"}
              </div>
              <span style={{ color: "var(--ink-secondary)" }}>
                N={analysis.subject_count}, M={analysis.item_count}, Kelompok n=
                {analysis.upper_lower.group_size}
              </span>
            </div>
            {allResultsSpec && (
              <CardExportBar
                spec={allResultsSpec}
                copyLabel="Salin Semua"
                downloadLabel="Unduh Laporan"
                onStatusMessage={onStatusMessage}
              />
            )}
          </div>

          {analysis.warnings.length > 0 && (
            <div className="warn-box" role="alert">
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}>
                <WarningIcon />
                <span>Peringatan Validasi Data ({analysis.warnings.length})</span>
              </div>
              <ul style={{ margin: "0.4rem 0 0 1.2rem", padding: 0 }}>
                {analysis.warnings.slice(0, 6).map((w, idx) => (
                  <li key={idx}>{w.message}</li>
                ))}
                {analysis.warnings.length > 6 && (
                  <li>... dan {analysis.warnings.length - 6} peringatan lainnya.</li>
                )}
              </ul>
            </div>
          )}

          {!anyModuleVisible && (
            <div className="card" style={{ color: "var(--ink-secondary)" }}>
              Aktifkan satu atau lebih modul hasil dari bilah Ribbon di atas (Reliabilitas,
              Analisis Butir, Pengecoh, Grafik, atau Audit Legacy).
            </div>
          )}

          {modules.reliability && reliabilitySpec && (
            <section className="card results-module" aria-labelledby="rel-res-title">
              <div className="card-head-row" style={{ marginBlockEnd: "var(--space-3)" }}>
                <h2 id="rel-res-title" className="card-title" style={{ margin: 0 }}>
                  Ringkasan Reliabilitas & Statistik Tes
                </h2>
                <CardExportBar spec={reliabilitySpec} onStatusMessage={onStatusMessage} />
              </div>
              <div className="metric-grid">
                <div className="metric-tile">
                  <div className="metric-label">Alpha Cronbach (α)</div>
                  <div className="metric-value">{fmt(analysis.reliability.cronbach_alpha)}</div>
                  {displayFlags.showInterpretation && (
                    <div className="metric-note">{analysis.interpretations.cronbach_alpha}</div>
                  )}
                </div>

                {isPureMc && (
                  <>
                    <div className="metric-tile">
                      <div className="metric-label">KR-20</div>
                      <div className="metric-value">{fmt(analysis.reliability.kr20)}</div>
                      {displayFlags.showInterpretation && analysis.interpretations.kr20 && (
                        <div className="metric-note">{analysis.interpretations.kr20}</div>
                      )}
                    </div>

                    <div className="metric-tile">
                      <div className="metric-label">KR-21</div>
                      <div className="metric-value">{fmt(analysis.reliability.kr21)}</div>
                      {displayFlags.showInterpretation && analysis.interpretations.kr21 && (
                        <div className="metric-note">{analysis.interpretations.kr21}</div>
                      )}
                    </div>
                  </>
                )}

                <div className="metric-tile">
                  <div className="metric-label">Belah Dua (r_tt)</div>
                  <div className="metric-value">
                    {fmt(analysis.reliability.reliability_coefficient)}
                  </div>
                  {displayFlags.showInterpretation && (
                    <div className="metric-note">
                      r_xy={fmt(analysis.reliability.correlation_xy)} (
                      {analysis.interpretations.reliability_tt})
                    </div>
                  )}
                </div>

                <div className="metric-tile">
                  <div className="metric-label">Rata-rata / Simpangan Baku</div>
                  <div className="metric-value">
                    {fmt(analysis.scoring.mean)} / {fmt(analysis.scoring.std_dev)}
                  </div>
                  <div className="metric-note">
                    Skor {analysis.scoring.uses_weighted_score ? "Dibobot" : "Mentah"}
                  </div>
                </div>

                <div className="metric-tile">
                  <div className="metric-label">Skor Min / Median / Maks</div>
                  <div className="metric-value">
                    {fmt(analysis.scoring.min_score)} / {fmt(analysis.scoring.median_score)} /{" "}
                    {fmt(analysis.scoring.max_score)}
                  </div>
                  <div className="metric-note">Sebaran skor peserta</div>
                </div>

                <div className="metric-tile">
                  <div className="metric-label">Skor Ideal / Rata-rata %</div>
                  <div className="metric-value">
                    {fmt(analysis.scoring.ideal_max_score)} / {meanPctText}
                  </div>
                  <div className="metric-note">Capaian rerata terhadap skor ideal</div>
                </div>
              </div>

              {displayFlags.showInterpretation && (
                <MethodNotes
                  topic="reliability"
                  mode={options.mode}
                  useCorrectedItemTotal={displayFlags.useCorrectedItemTotal}
                />
              )}
            </section>
          )}

          {modules.items && itemsSpec && (
            <section className="card results-module" aria-labelledby="item-pub-title">
              <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
                <h2 id="item-pub-title" className="card-title" style={{ margin: 0 }}>
                  Analisis Butir Soal ({visibleItemRows.length}/{itemRows.length})
                </h2>
                <CardExportBar spec={itemsSpec} onStatusMessage={onStatusMessage} />
              </div>

              <div className="filter-bar" style={{ marginBlockEnd: "var(--space-3)" }}>
                <div className="field-inline">
                  <label htmlFor="res-item-search">Cari butir</label>
                  <input
                    id="res-item-search"
                    type="search"
                    placeholder="No, kunci, kategori, keputusan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="field-inline">
                  <label htmlFor="res-cat-filter">Kategori TK</label>
                  <select
                    id="res-cat-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">Semua</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-inline">
                  <label htmlFor="res-verdict-filter">Keputusan</label>
                  <select
                    id="res-verdict-filter"
                    value={verdictFilter}
                    onChange={(e) =>
                      setVerdictFilter(e.target.value as "all" | ItemVerdictStatus)
                    }
                  >
                    <option value="all">Semua</option>
                    <option value="Terima">Terima</option>
                    <option value="Revisi">Revisi</option>
                    <option value="Tolak">Tolak</option>
                  </select>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="apa-table">
                  <thead>
                    <tr>
                      {renderSortTh("no", "No", true)}
                      <th scope="col">Tipe</th>
                      <th scope="col">Acuan</th>
                      {!isPureMc && <th scope="col" className="num">t</th>}
                      {renderSortTh("dp", "DP(%)", true)}
                      {renderSortTh("tk", "TK(%)", true)}
                      {renderSortTh("category", "Kategori")}
                      {renderSortTh("r", displayFlags.useCorrectedItemTotal ? "r_corr" : "r", true)}
                      {!displayFlags.useCorrectedItemTotal && (
                        <th scope="col" className="num">r_corr</th>
                      )}
                      {renderSortTh("alphaDel", "α(-j)", true)}
                      {renderSortTh(
                        "significance",
                        displayFlags.useCorrectedItemTotal ? "Sig. (r_corr)" : "Signifikansi",
                      )}
                      {isPureMc && <th scope="col" className="num">Pengecoh</th>}
                      {renderSortTh("verdict", "Keputusan")}
                      <th scope="col">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItemRows.map((row) => {
                      const selected = row.itemIndex === safeItemIdx;
                      return (
                        <tr
                          key={row.itemIndex}
                          className="selectable-row"
                          aria-current={selected ? "true" : undefined}
                          onClick={() => onSelectItem(row.itemIndex)}
                        >
                          <td className="num">
                            <button
                              type="button"
                              className="btn btn-compact"
                              style={{
                                minBlockSize: "1.5rem",
                                padding: "0.05rem 0.4rem",
                                borderColor: selected ? "var(--accent)" : "transparent",
                                background: selected ? "var(--accent)" : "transparent",
                                color: selected ? "var(--accent-ink)" : "inherit",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectItem(row.itemIndex);
                              }}
                            >
                              {row.itemNumber}
                            </button>
                          </td>
                          <td>{row.typeLabel}</td>
                          <td className="mono">{row.reference}</td>
                          {!isPureMc && <td className="num">{fmt(row.tVal)}</td>}
                          <td className="num">{fmt(row.dp)}</td>
                          <td className="num">{fmt(row.tk)}</td>
                          <td>{row.category}</td>
                          <td className="num">
                            {fmt(displayFlags.useCorrectedItemTotal ? row.rCorr : row.r, 3)}
                          </td>
                          {!displayFlags.useCorrectedItemTotal && (
                            <td className="num">{fmt(row.rCorr, 3)}</td>
                          )}
                          <td className="num">{fmt(row.alphaDel, 3)}</td>
                          <td>{row.significance}</td>
                          {isPureMc && <td className="num">{row.distractorRatio ?? "-"}</td>}
                          <td>
                            <div className="verdict-cell">
                              {row.verdictStatus ? (
                                <span className={verdictBadgeClass(row.verdictStatus)}>
                                  {row.verdictStatus}
                                </span>
                              ) : (
                                "-"
                              )}
                              {row.suspectedMiskey && (
                                <span className="miskey-tag">Salah Kunci?</span>
                              )}
                            </div>
                          </td>
                          <td className="verdict-reasons-cell">
                            {row.verdictReasonsText || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={itemTableColCount} className="table-recap-foot">
                        <strong>Rekap Keputusan:</strong>{" "}
                        <span className="verdict-badge is-accept">Terima {verdictSummary.accept}</span>{" "}
                        <span className="verdict-badge is-revise">Revisi {verdictSummary.revise}</span>{" "}
                        <span className="verdict-badge is-reject">Tolak {verdictSummary.reject}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {displayFlags.showInterpretation && (
                <MethodNotes
                  topic="items"
                  mode={options.mode}
                  useCorrectedItemTotal={displayFlags.useCorrectedItemTotal}
                />
              )}
            </section>
          )}

          {modules.distractors && (
            <section className="card results-module" aria-labelledby="dist-res-title">
              <div className="card-head-row" style={{ marginBlockEnd: "var(--space-3)" }}>
                <h2 id="dist-res-title" className="card-title" style={{ margin: 0 }}>
                  {isPureMc
                    ? distractorViewMode === "matrix"
                      ? `Matriks Pengecoh Seluruh Butir (${analysis.distractors?.length ?? 0} butir)`
                      : `Distribusi Pilihan Butir #${safeItemIdx + 1}`
                    : `Rincian Kelompok Unggul-Asor Butir #${analysis.essay_upper_lower?.[safeItemIdx]?.item_number ?? safeItemIdx + 1}`}
                </h2>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
                  {isPureMc && (
                    <div className="view-mode-switch" role="group" aria-label="Tampilan pengecoh">
                      <button
                        type="button"
                        className="btn btn-compact toolbar-toggle"
                        aria-pressed={distractorViewMode === "detail" ? "true" : "false"}
                        onClick={() => setDistractorViewMode("detail")}
                      >
                        Detail Butir
                      </button>
                      <button
                        type="button"
                        className="btn btn-compact toolbar-toggle"
                        aria-pressed={distractorViewMode === "matrix" ? "true" : "false"}
                        onClick={() => setDistractorViewMode("matrix")}
                      >
                        Matriks Semua
                      </button>
                    </div>
                  )}
                  {(!isPureMc || distractorViewMode === "detail") && (
                    <div className="field-inline">
                      <label htmlFor="res-item-picker">Butir terpilih</label>
                      <select
                        id="res-item-picker"
                        value={safeItemIdx}
                        onChange={(e) => onSelectItem(Number(e.target.value))}
                      >
                        {analysis.difficulty.map((d) => (
                          <option key={d.item_index} value={d.item_index}>
                            Butir #{d.item_number}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {distractorSpec && (
                    <CardExportBar spec={distractorSpec} onStatusMessage={onStatusMessage} />
                  )}
                </div>
              </div>

              {isPureMc && distractorViewMode === "matrix" && analysis.distractors?.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="apa-table distractor-matrix-table">
                    <thead>
                      <tr>
                        <th className="num">Butir</th>
                        <th>Kunci</th>
                        {analysis.distractors[0]!.options.map((opt) => (
                          <th key={opt.option} className="num">
                            {opt.option}
                          </th>
                        ))}
                        <th className="num">Kosong</th>
                        <th className="num">Berfungsi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.distractors.map((dist) => {
                        const isSelected = dist.item_index === safeItemIdx;
                        return (
                          <tr
                            key={dist.item_index}
                            className="selectable-row"
                            aria-current={isSelected ? "true" : undefined}
                            onClick={() => onSelectItem(dist.item_index)}
                          >
                            <td className="num">#{dist.item_number}</td>
                            <td className="mono">{dist.key}</td>
                            {dist.options.map((opt) => {
                              const isKey = opt.option === dist.key;
                              const cellClass = isKey
                                ? "num matrix-cell-key"
                                : opt.is_functioning === true
                                  ? "num matrix-cell-ok"
                                  : opt.is_functioning === false
                                    ? "num matrix-cell-weak"
                                    : "num";
                              return (
                                <td
                                  key={opt.option}
                                  className={cellClass}
                                  title={`${opt.option}: ${opt.frequency} | Atas ${opt.upper_count ?? 0} / Bawah ${opt.lower_count ?? 0}`}
                                >
                                  {opt.frequency} ({opt.quality || "-"})
                                </td>
                              );
                            })}
                            <td className="num">{dist.blank_count}</td>
                            <td className="num">
                              {dist.functioning_count ?? 0}/
                              {dist.distractor_count ?? Math.max(0, dist.options.length - 1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : isPureMc && analysis.distractors?.[safeItemIdx] ? (
                <div>
                  {analysis.distractors[safeItemIdx]!.options.map((opt) => {
                    const dist = analysis.distractors![safeItemIdx]!;
                    const isKey = opt.option === dist.key;
                    const pct =
                      analysis.subject_count > 0
                        ? (opt.frequency / analysis.subject_count) * 100
                        : 0;
                    return (
                      <div key={opt.option} className="dist-row">
                        <span className={isKey ? "dist-key-label" : undefined}>
                          {opt.option} {isKey && <CheckIcon />}
                        </span>
                        <div className="dist-bar-track" aria-hidden="true">
                          <div
                            className={`dist-bar-fill${isKey ? " is-key" : ""}`}
                            style={{ inlineSize: `${Math.min(100, pct).toFixed(1)}%` }}
                          />
                        </div>
                        <div className="dist-stats-cell num">
                          <span>
                            {opt.frequency} ({pct.toFixed(0)}%) [{opt.quality || "-"}]
                          </span>
                          {!isKey && opt.is_functioning !== null && opt.is_functioning !== undefined && (
                            <>
                              <span className="dist-group-meta">
                                Atas {opt.upper_count ?? 0} / Bawah {opt.lower_count ?? 0}
                              </span>
                              <span
                                className={
                                  opt.is_functioning
                                    ? "dist-func-badge is-ok"
                                    : "dist-func-badge is-weak"
                                }
                              >
                                {opt.is_functioning ? "Berfungsi" : "Lemah"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: "0.78rem", color: "var(--ink-secondary)", marginTop: "0.5rem" }}>
                    Kosong: {analysis.distractors[safeItemIdx]!.blank_count} (Atas{" "}
                    {analysis.distractors[safeItemIdx]!.upper_blank_count ?? 0} / Bawah{" "}
                    {analysis.distractors[safeItemIdx]!.lower_blank_count ?? 0}) | Lainnya:{" "}
                    {analysis.distractors[safeItemIdx]!.other_count} | Ideal pengecoh:{" "}
                    {fmt(analysis.distractors[safeItemIdx]!.ideal_count)}
                  </div>
                </div>
              ) : analysis.essay_upper_lower?.[safeItemIdx] ? (
                <div className="metric-grid">
                  <div className="metric-tile">
                    <div className="metric-label">Mean Unggul / Asor</div>
                    <div className="metric-value">
                      {fmt(analysis.essay_upper_lower[safeItemIdx]!.upper_mean)} /{" "}
                      {fmt(analysis.essay_upper_lower[safeItemIdx]!.lower_mean)}
                    </div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">SD Unggul / Asor</div>
                    <div className="metric-value">
                      {fmt(analysis.essay_upper_lower[safeItemIdx]!.upper_std)} /{" "}
                      {fmt(analysis.essay_upper_lower[safeItemIdx]!.lower_std)}
                    </div>
                  </div>
                  <div className="metric-tile">
                    <div className="metric-label">SE_gab / t-hitung</div>
                    <div className="metric-value">
                      {fmt(analysis.essay_upper_lower[safeItemIdx]!.se_pooled)} /{" "}
                      {fmt(analysis.essay_upper_lower[safeItemIdx]!.t_value)}
                    </div>
                    <div className="metric-note">
                      p=
                      {analysis.essay_upper_lower[safeItemIdx]!.p_value !== null
                        ? fmt(analysis.essay_upper_lower[safeItemIdx]!.p_value, 4)
                        : "-"}
                    </div>
                  </div>
                </div>
              ) : null}

              {isPureMc && displayFlags.showInterpretation && (
                <MethodNotes
                  topic="distractors"
                  mode={options.mode}
                  useCorrectedItemTotal={displayFlags.useCorrectedItemTotal}
                />
              )}
            </section>
          )}

          {modules.charts && (
            <div className="results-module">
              <ChartsView
                exam={exam}
                analysis={analysis}
                subtitle={contextSubtitle}
                selectedItemIndex={safeItemIdx}
                onSelectItem={onSelectItem}
                onStatusMessage={onStatusMessage}
                onSvgRef={handleSvgRef}
              />
            </div>
          )}

          {modules.comparison && diff && comparisonSpec && (
            <section className="card results-module" aria-labelledby="diff-res-title">
              <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
                <h2 id="diff-res-title" className="card-title" style={{ margin: 0 }}>
                  Audit Mode: Legacy ANATES vs Standar Terkoreksi
                </h2>
                <CardExportBar spec={comparisonSpec} onStatusMessage={onStatusMessage} />
              </div>
              <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem" }}>
                Reliabilitas r_tt: Legacy <strong>{fmt(diff.legacy_reliability, 4)}</strong> vs
                Terkoreksi <strong>{fmt(diff.corrected_reliability, 4)}</strong> (selisih{" "}
                {fmt(diff.reliability_delta, 4)}).
              </p>
              {diff.significance_changes.length > 0 ? (
                <table className="apa-table">
                  <thead>
                    <tr>
                      <th className="num">Butir</th>
                      <th className="num">r</th>
                      <th className="num">p (Terkoreksi)</th>
                      <th>Signifikansi Legacy</th>
                      <th>Signifikansi Terkoreksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.significance_changes.map((chg) => (
                      <tr key={chg.item_number}>
                        <td className="num">{chg.item_number}</td>
                        <td className="num">{fmt(chg.correlation, 3)}</td>
                        <td className="num">{fmt(chg.corrected_p_value, 4)}</td>
                        <td>{chg.legacy_significance}</td>
                        <td>{chg.corrected_significance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-secondary)" }}>
                  Tidak ada pergeseran status signifikansi korelasi antar kedua mode.
                </p>
              )}
            </section>
          )}

          {scoresSpec && (
            <section className="card results-module" aria-labelledby="scores-res-title">
              <div className="card-head-row">
                <button
                  type="button"
                  id="scores-res-title"
                  className="card-collapse-btn"
                  aria-expanded={scoresExpanded}
                  onClick={() => setScoresExpanded((prev) => !prev)}
                >
                  <span aria-hidden="true">{scoresExpanded ? "▾" : "▸"}</span>
                  <span>Skor Peserta Terurut Menurun ({analysis.subject_count} peserta)</span>
                </button>
                <CardExportBar spec={scoresSpec} onStatusMessage={onStatusMessage} />
              </div>

              {scoresExpanded && (
                <div style={{ overflowX: "auto", marginBlockStart: "var(--space-3)" }}>
                  <table className="apa-table">
                    <thead>
                      <tr>
                        <th className="num">Urut</th>
                        <th>Nama</th>
                        {isPureMc ? (
                          <>
                            <th className="num">Betul</th>
                            <th className="num">Salah</th>
                            <th className="num">Kosong</th>
                            <th className="num">Skor Akhir</th>
                            <th className="num">Dibobot</th>
                          </>
                        ) : (
                          <>
                            <th className="num">Kosong</th>
                            <th className="num">Skor Total</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.scoring.sorted_order.map((subjIdx, rank) => {
                        const s = analysis.scoring.subjects[subjIdx];
                        if (!s) return null;
                        if (isPureMc) {
                          const mc = s as MultipleChoiceSubjectScore;
                          return (
                            <tr key={mc.original_index}>
                              <td className="num">{rank + 1}</td>
                              <td>{mc.name || `Peserta ${mc.original_index + 1}`}</td>
                              <td className="num">{mc.correct_count}</td>
                              <td className="num">{mc.wrong_count}</td>
                              <td className="num">{mc.blank_count}</td>
                              <td className="num">{fmt(mc.raw_score)}</td>
                              <td className="num">{fmt(mc.weighted_score)}</td>
                            </tr>
                          );
                        }
                        const es = s as EssaySubjectScore;
                        return (
                          <tr key={es.original_index}>
                            <td className="num">{rank + 1}</td>
                            <td>{es.name || `Peserta ${es.original_index + 1}`}</td>
                            <td className="num">{es.blank_count}</td>
                            <td className="num">{fmt(es.total_score)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
