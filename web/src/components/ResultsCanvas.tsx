import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateTemplateXlsx } from "../api/client";
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
import { saveBlobWithDialog } from "../utils/fileSave";
import type { ExportableCardSpec, ExportMetricItem } from "../utils/resultExport";
import { CardExportBar } from "./CardExportBar";
import { ChartsView, type ChartSvgKey } from "./ChartsView";
import { HelpToggletip } from "./HelpToggletip";
import { CheckIcon, DownloadIcon, FilePlusIcon, UploadIcon, WarningIcon } from "./Icons";
import { ItemQualityMatrix } from "./ItemQualityMatrix";
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
  missingKeyItemNumbers: number[];
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
  onOpenNewWorksheet: () => void;
  onOpenQuickKeySetup: () => void;
  onAllResultsSpecChange?: (spec: ExportableCardSpec | null) => void;
  onChangeOptions: (next: AnalysisOptions) => void;
  onChangeWeights: (weights: ScoringWeights) => void;
  onChangeFlags: (next: UiDisplayFlags) => void;
  onCloseOptions?: () => void;
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
  missingKeyItemNumbers,
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
  onOpenNewWorksheet,
  onOpenQuickKeySetup,
  onAllResultsSpecChange,
  onChangeOptions,
  onChangeWeights,
  onChangeFlags,
  onCloseOptions,
  onStatusMessage,
}: ResultsCanvasProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState<"all" | ItemVerdictStatus>("all");
  const [showTechnicalCols, setShowTechnicalCols] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("no");
  const [sortDir, setSortDir] = useState<SortDir>("ascending");
  const [distractorViewMode, setDistractorViewMode] = useState<"detail" | "matrix">("detail");
  const [reliabilityExpanded, setReliabilityExpanded] = useState(false);
  const [itemsExpanded, setItemsExpanded] = useState(true);
  const [distractorsExpanded, setDistractorsExpanded] = useState(true);
  const [chartsExpanded, setChartsExpanded] = useState(true);
  const [scoresExpanded, setScoresExpanded] = useState(false);
  const [templateStatus, setTemplateStatus] = useState<string>("");

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

  const fullVerdictCounts = useMemo(() => {
    let accept = 0;
    let revise = 0;
    let reject = 0;
    for (const row of itemRows) {
      if (row.verdictStatus === "Terima") accept += 1;
      else if (row.verdictStatus === "Revisi") revise += 1;
      else if (row.verdictStatus === "Tolak") reject += 1;
    }
    return { total: itemRows.length, accept, revise, reject };
  }, [itemRows]);

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
        getSvgElement: () => chartSvgRefs.current.detail,
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

    if (!isPureMc && distractorViewMode === "matrix" && analysis.essay_upper_lower?.length) {
      return {
        id: "rincian-unggul-asor-semua-butir",
        title: `Kelompok Unggul vs Asor Seluruh Butir (${analysis.essay_upper_lower.length} butir)`,
        subtitle: contextSubtitle,
        table: {
          headers: ["Butir", "Mean Unggul", "Mean Asor", "Selisih Mean", "t-hitung", "p"],
          alignments: ["right", "right", "right", "right", "right", "right"],
          rows: analysis.essay_upper_lower.map((ul) => [
            `#${ul.item_number}`,
            fmt(ul.upper_mean),
            fmt(ul.lower_mean),
            fmt(ul.mean_diff),
            fmt(ul.t_value),
            ul.p_value !== null ? fmt(ul.p_value, 4) : "-",
          ]),
        },
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

  const executiveSummarySpec = useMemo<ExportableCardSpec | null>(() => {
    const es = analysis?.executive_summary;
    if (!analysis || !es) return null;
    return {
      id: "ringkasan-eksekutif",
      title: `Ringkasan Eksekutif Kualitas Instrumen (${es.quality_tier})`,
      subtitle: contextSubtitle,
      metrics: [
        { label: "Kualitas Instrumen", value: es.quality_tier, note: es.headline },
        {
          label: "Butir Siap / Revisi / Ganti",
          value: `${es.accept_count} / ${es.revise_count} / ${es.reject_count}`,
          note: es.miskey_items.length > 0 ? `Salah kunci?: #${es.miskey_items.join(", #")}` : "Tidak ada indikasi salah kunci",
        },
        {
          label: "Sebaran Skor Peserta",
          value: analysis.score_distribution?.skew_label ?? "-",
          note:
            analysis.score_distribution?.pass_percent !== null &&
            analysis.score_distribution?.pass_percent !== undefined
              ? `Tuntas: ${analysis.score_distribution.pass_percent.toFixed(1)}%`
              : `Capaian rerata: ${meanPctText}`,
        },
      ],
      footnote: `${es.reliability_narrative} ${es.item_action_narrative} ${es.student_summary_narrative}`,
    };
  }, [analysis, contextSubtitle, meanPctText]);

  const indicatorSummarySpec = useMemo<ExportableCardSpec | null>(() => {
    const inds = analysis?.indicator_summary;
    if (!analysis || !inds || inds.length === 0) return null;
    return {
      id: "capaian-indikator",
      title: `Capaian & Kualitas per Indikator (${inds.length} indikator)`,
      subtitle: contextSubtitle,
      table: {
        headers: ["Indikator / TP", "Butir", "Rata-rata TK%", "Rata-rata DP%", "Terima/Revisi/Tolak", "Penguasaan"],
        alignments: ["left", "left", "right", "right", "right", "left"],
        rows: inds.map((ind) => [
          ind.indicator,
          ind.item_numbers.map((n) => `#${n}`).join(", "),
          fmt(ind.mean_tk_percent, 1),
          fmt(ind.mean_dp_percent, 1),
          `${ind.accept_count} / ${ind.revise_count} / ${ind.reject_count}`,
          ind.mastery_label,
        ]),
      },
    };
  }, [analysis, contextSubtitle]);

  const allResultsSpec = useMemo<ExportableCardSpec | null>(() => {
    if (!analysis) return null;
    const sections: ExportableCardSpec[] = [];
    if (executiveSummarySpec) sections.push(executiveSummarySpec);
    if (reliabilitySpec) sections.push(reliabilitySpec);
    if (itemsSpec) sections.push(itemsSpec);
    if (indicatorSummarySpec) sections.push(indicatorSummarySpec);
    if (distractorSpec) sections.push(distractorSpec);
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
    modules.comparison,
    executiveSummarySpec,
    reliabilitySpec,
    itemsSpec,
    indicatorSummarySpec,
    distractorSpec,
    comparisonSpec,
    scoresSpec,
    contextSubtitle,
  ]);

  useEffect(() => {
    const readySpec =
      hasActiveResponses && missingKeyItemNumbers.length === 0 ? allResultsSpec : null;
    onAllResultsSpecChange?.(readySpec);
  }, [hasActiveResponses, missingKeyItemNumbers.length, allResultsSpec, onAllResultsSpecChange]);

  const handleDownloadTemplate = async (tmplKind: "multiple_choice" | "essay") => {
    setTemplateStatus("Menyiapkan template Excel...");
    try {
      const { blob, filename } = await generateTemplateXlsx(tmplKind);
      const res = await saveBlobWithDialog(blob, filename);
      const msg = res.cancelled
        ? "Pengunduhan template dibatalkan."
        : res.path
          ? `Template disimpan ke ${res.path}.`
          : `Template ${filename} berhasil disiapkan.`;
      setTemplateStatus(msg);
      onStatusMessage?.(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal membuat template Excel.";
      setTemplateStatus(msg);
      onStatusMessage?.(msg);
    }
  };

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "ascending" ? "descending" : "ascending"));
    } else {
      setSortKey(nextKey);
      setSortDir("ascending");
    }
  };

  const renderSortTh = (
    key: SortKey,
    label: string,
    numeric = false,
    tip?: { term: string; explanation: string },
  ) => {
    const sorted = sortKey === key;
    return (
      <th
        scope="col"
        className={numeric ? "num" : undefined}
        aria-sort={sorted ? sortDir : undefined}
      >
        <div className={`th-with-tip${numeric ? " is-num" : ""}`}>
          <button
            type="button"
            className={`sort-btn${numeric ? " num" : ""}`}
            onClick={() => toggleSort(key)}
          >
            <span>{label}</span>
            <span className="sort-indicator" aria-hidden="true" />
          </button>
          {tip && <HelpToggletip term={tip.term} explanation={tip.explanation} />}
        </div>
      </th>
    );
  };

  const primaryRelVal = analysis
    ? analysis.reliability.cronbach_alpha ??
      (isPureMc ? analysis.reliability.kr20 : null) ??
      analysis.reliability.reliability_coefficient
    : null;
  const primaryRelLabel = analysis
    ? analysis.reliability.cronbach_alpha !== null
      ? "Alpha Cronbach"
      : isPureMc && analysis.reliability.kr20 !== null
        ? "KR-20"
        : "Belah Dua (r_tt)"
    : "-";
  const primaryRelInterp = analysis
    ? analysis.reliability.cronbach_alpha !== null
      ? analysis.interpretations.cronbach_alpha
      : isPureMc && analysis.reliability.kr20 !== null
        ? (analysis.interpretations.kr20 ?? analysis.interpretations.reliability_tt)
        : analysis.interpretations.reliability_tt
    : "";

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
          onClose={onCloseOptions}
        />
      )}

      {!hasActiveResponses ? (
        <div className="empty-paths-wrap">
          <section className="card empty-path-primary" aria-labelledby="blank-guide-title">
            <h2 id="blank-guide-title" className="card-title" style={{ marginBlockEnd: "var(--space-2)" }}>
              1. Impor Berkas Excel atau CSV (Paling Cepat)
            </h2>
            <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--ink-secondary)" }}>
              Unggah nilai ujian dari Excel, CSV, atau hasil Google Forms/LMS. Kolom metadata seperti{" "}
              <code>Timestamp</code>, <code>Email</code>, dan <code>Skor Total</code> akan diabaikan
              otomatis. Berkas ANATES (<code>.ana</code>) juga didukung.
            </p>
            <div className="empty-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenImport}>
                <UploadIcon />
                <span>Pilih Berkas Excel / CSV</span>
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleDownloadTemplate("multiple_choice")}
              >
                <DownloadIcon />
                <span>Template PG (.xlsx)</span>
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleDownloadTemplate("essay")}
              >
                <DownloadIcon />
                <span>Template Uraian (.xlsx)</span>
              </button>
            </div>
            <p
              role="status"
              style={{
                margin: "var(--space-2) 0 0 0",
                minBlockSize: "1.25rem",
                fontSize: "0.82rem",
                color: "var(--ink-secondary)",
              }}
            >
              {templateStatus}
            </p>
          </section>

          <div className="empty-paths-secondary">
            <section className="card" aria-labelledby="empty-manual-title">
              <h2 id="empty-manual-title" className="card-title" style={{ marginBlockEnd: "var(--space-2)" }}>
                2. Input Manual atau Tempel Excel
              </h2>
              <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--ink-secondary)", fontSize: "0.86rem" }}>
                Buat lembar baru untuk soal Pilihan Ganda atau Uraian, atau langsung tempel blok tabel
                dari Excel (<code>Ctrl+V</code>) lewat tombol <strong>Tempel dari Excel</strong> di
                bagian atas tabel sebelah kiri.
              </p>
              <div className="empty-actions">
                <button type="button" className="btn" onClick={onOpenNewWorksheet}>
                  <FilePlusIcon />
                  <span>Buat Lembar Baru (PG / Uraian)</span>
                </button>
              </div>
            </section>

            {samples.length > 0 && (
              <section className="card" aria-labelledby="empty-sample-title">
                <h2 id="empty-sample-title" className="card-title" style={{ marginBlockEnd: "var(--space-2)" }}>
                  3. Coba Data Contoh
                </h2>
                <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--ink-secondary)", fontSize: "0.86rem" }}>
                  Lihat simulasi hasil analisis butir soal tanpa menyiapkan berkas sendiri.
                </p>
                <SampleListGrid samples={samples} onPick={onLoadSample} />
              </section>
            )}
          </div>
        </div>
      ) : missingKeyItemNumbers.length > 0 ? (
        <section className="warn-box missing-key-gate" role="alert" aria-labelledby="missing-key-title">
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBlockEnd: "var(--space-2)" }}>
            <WarningIcon />
            <h2 id="missing-key-title" className="card-title" style={{ margin: 0 }}>
              Kunci Jawaban / Skor Ideal Belum Lengkap
            </h2>
          </div>
          <p style={{ margin: "0 0 var(--space-3) 0", lineHeight: 1.55 }}>
            Data jawaban peserta sudah masuk, tetapi <strong>{missingKeyItemNumbers.length} butir</strong>{" "}
            belum memiliki kunci jawaban atau skor ideal (Butir #{missingKeyItemNumbers.slice(0, 12).join(", #")}
            {missingKeyItemNumbers.length > 12 ? ", dan lainnya" : ""}). Untuk mencegah kesalahan
            penilaian otomatis, hasil analisis ditahan sampai seluruh kunci terisi.
          </p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={onOpenQuickKeySetup}>
              Isi Kunci Jawaban Sekarang
            </button>
          </div>
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
                {options.mode === "legacy_anates" ? "ANATES Klasik" : "Standar Terkoreksi"}
                {summaryKind === "mixed" && " (Model Terpadu Campuran PG+Uraian)"}
              </div>
              <span style={{ color: "var(--ink-secondary)" }}>
                | N={analysis.subject_count}, M={analysis.item_count}, Kelompok{" "}
                {options.upper_lower_percent}% (n={analysis.upper_lower.group_size})
                {options.passing_score !== null && options.passing_score !== undefined
                  ? ` | KKM: ${options.passing_score}`
                  : ""}
              </span>
            </div>
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

          {analysis.executive_summary && (
            <section className="card results-module" aria-labelledby="exec-summary-title">
              <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <h2 id="exec-summary-title" className="card-title" style={{ margin: 0 }}>
                    Ringkasan Eksekutif Evaluasi
                  </h2>
                  <span
                    className={`verdict-badge ${
                      analysis.executive_summary.quality_tier === "Baik"
                        ? "is-accept"
                        : analysis.executive_summary.quality_tier === "Cukup"
                          ? "is-revise"
                          : "is-reject"
                    }`}
                  >
                    {analysis.executive_summary.quality_tier}
                  </span>
                </div>
                {executiveSummarySpec && (
                  <CardExportBar spec={executiveSummarySpec} onStatusMessage={onStatusMessage} />
                )}
              </div>
              <p style={{ margin: "0 0 var(--space-3) 0", fontWeight: 600, fontSize: "0.92rem" }}>
                {analysis.executive_summary.headline}
              </p>

              <div className="metric-grid" style={{ marginBlockEnd: "var(--space-3)" }}>
                <div className="metric-tile">
                  <div className="metric-label">Reliabilitas Utama</div>
                  <div className="metric-value">{fmt(primaryRelVal)}</div>
                  <div className="metric-note">
                    {primaryRelLabel} ({primaryRelInterp || "-"})
                  </div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Rata-rata Kelas</div>
                  <div className="metric-value">
                    {fmt(analysis.scoring.mean)} / {fmt(analysis.scoring.ideal_max_score)}
                  </div>
                  <div className="metric-note">
                    Capaian {meanPctText}
                    {analysis.score_distribution?.pass_percent !== null &&
                    analysis.score_distribution?.pass_percent !== undefined
                      ? ` | Tuntas KKM ${analysis.score_distribution.pass_percent.toFixed(1)}%`
                      : ""}
                  </div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">Kelayakan Butir</div>
                  <div className="metric-value">
                    {fullVerdictCounts.accept} / {fullVerdictCounts.total} siap
                  </div>
                  <div className="metric-note">
                    {fullVerdictCounts.revise} revisi, {fullVerdictCounts.reject} tolak
                    {analysis.executive_summary.miskey_items.length > 0
                      ? ` | Salah kunci?: #${analysis.executive_summary.miskey_items.join(", #")}`
                      : ""}
                  </div>
                </div>
              </div>

              <div className="exec-summary-grid">
                <div className="exec-summary-item">
                  <div className="exec-summary-q">1. Apakah instrumen penilaian berkualitas?</div>
                  <p>{analysis.executive_summary.reliability_narrative}</p>
                </div>
                <div className="exec-summary-item">
                  <div className="exec-summary-q">2. Butir mana yang dipertahankan / diperbaiki?</div>
                  <p>{analysis.executive_summary.item_action_narrative}</p>
                </div>
                <div className="exec-summary-item">
                  <div className="exec-summary-q">3. Apa kesimpulan hasil evaluasi peserta?</div>
                  <p>{analysis.executive_summary.student_summary_narrative}</p>
                </div>
              </div>
            </section>
          )}

          {reliabilitySpec && (
            <section className="card results-module" aria-labelledby="rel-res-title">
              <div className="card-head-row">
                <button
                  type="button"
                  id="rel-res-title"
                  className="card-collapse-btn"
                  aria-expanded={reliabilityExpanded}
                  onClick={() => setReliabilityExpanded((prev) => !prev)}
                >
                  <span aria-hidden="true">{reliabilityExpanded ? "▾" : "▸"}</span>
                  <span>
                    Rincian Reliabilitas &amp; Statistik Deskriptif ({primaryRelLabel} ={" "}
                    {fmt(primaryRelVal)}, Min/Med/Maks:{" "}
                    {fmt(analysis.scoring.min_score)}/{fmt(analysis.scoring.median_score)}/
                    {fmt(analysis.scoring.max_score)})
                  </span>
                </button>
                <CardExportBar spec={reliabilitySpec} onStatusMessage={onStatusMessage} />
              </div>

              {reliabilityExpanded && (
                <div style={{ marginBlockStart: "var(--space-3)" }}>
                  <div className="metric-grid">
                    <div className="metric-tile">
                      <div className="metric-label label-with-tip">
                        <span>Alpha Cronbach (α)</span>
                        <HelpToggletip
                          term="Alpha Cronbach"
                          explanation="Mengukur kekonsistenan soal secara keseluruhan. Nilai minimal 0,70 menandakan instrumen sudah cukup andal untuk mengukur kemampuan peserta."
                        />
                      </div>
                      <div className="metric-value">{fmt(analysis.reliability.cronbach_alpha)}</div>
                      {displayFlags.showInterpretation && (
                        <div className="metric-note">{analysis.interpretations.cronbach_alpha}</div>
                      )}
                    </div>

                    {isPureMc && (
                      <>
                        <div className="metric-tile">
                          <div className="metric-label label-with-tip">
                            <span>KR-20</span>
                            <HelpToggletip
                              term="Reliabilitas KR-20"
                              explanation="Ukuran keandalan khusus soal Pilihan Ganda dengan skor benar-salah (1 atau 0). Semakin mendekati 1,00 berarti hasil tes semakin konsisten."
                            />
                          </div>
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
                      <div className="metric-note">Capaian rata-rata terhadap skor ideal</div>
                    </div>
                  </div>

                  {displayFlags.showInterpretation && (
                    <MethodNotes
                      topic="reliability"
                      mode={options.mode}
                      useCorrectedItemTotal={displayFlags.useCorrectedItemTotal}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          {itemsSpec && (
            <section className="card results-module" aria-labelledby="item-pub-title">
              <div className="card-head-row" style={{ marginBlockEnd: itemsExpanded ? "var(--space-2)" : 0 }}>
                <button
                  type="button"
                  id="item-pub-title"
                  className="card-collapse-btn"
                  aria-expanded={itemsExpanded}
                  onClick={() => setItemsExpanded((prev) => !prev)}
                >
                  <span aria-hidden="true">{itemsExpanded ? "▾" : "▸"}</span>
                  <span>
                    Analisis Butir Soal ({visibleItemRows.length}/{itemRows.length})
                  </span>
                </button>
                <CardExportBar spec={itemsSpec} onStatusMessage={onStatusMessage} />
              </div>

              {itemsExpanded && (
                <>
                  <ItemQualityMatrix
                    embedded
                    analysis={analysis}
                    selectedItemIndex={safeItemIdx}
                    onSelectItem={onSelectItem}
                    useCorrected={displayFlags.useCorrectedItemTotal}
                  />

                  <div className="verdict-pills-bar" role="group" aria-label="Saring berdasarkan keputusan butir">
                    <button
                      type="button"
                      className="btn btn-compact toolbar-toggle"
                      aria-pressed={verdictFilter === "all" ? "true" : "false"}
                      onClick={() => setVerdictFilter("all")}
                    >
                      Semua ({fullVerdictCounts.total})
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact toolbar-toggle"
                      aria-pressed={verdictFilter === "Terima" ? "true" : "false"}
                      onClick={() => setVerdictFilter("Terima")}
                    >
                      Diterima ({fullVerdictCounts.accept})
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact toolbar-toggle"
                      aria-pressed={verdictFilter === "Revisi" ? "true" : "false"}
                      onClick={() => setVerdictFilter("Revisi")}
                    >
                      Perlu Revisi ({fullVerdictCounts.revise})
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact toolbar-toggle"
                      aria-pressed={verdictFilter === "Tolak" ? "true" : "false"}
                      onClick={() => setVerdictFilter("Tolak")}
                    >
                      Ditolak ({fullVerdictCounts.reject})
                    </button>
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
                    <label className="option-check" style={{ marginInlineStart: "auto" }}>
                      <input
                        type="checkbox"
                        checked={showTechnicalCols}
                        onChange={(e) => setShowTechnicalCols(e.target.checked)}
                      />
                      <span>Kolom teknis lengkap</span>
                    </label>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="apa-table">
                      <thead>
                        <tr>
                          {renderSortTh("no", "No", true)}
                          {showTechnicalCols && <th scope="col">Tipe</th>}
                          <th scope="col">Kunci/Ideal</th>
                          {showTechnicalCols && !isPureMc && <th scope="col" className="num">t</th>}
                          {renderSortTh("tk", "TK(%)", true, {
                            term: "Tingkat Kesukaran (TK)",
                            explanation: "Persentase peserta yang menjawab benar (PG) atau rata-rata capaian skor ideal (Uraian). Soal ideal berada di kisaran 30% sampai 70%.",
                          })}
                          {showTechnicalCols && renderSortTh("category", "Kategori")}
                          {renderSortTh("dp", "DP(%)", true, {
                            term: "Daya Pembeda (DP)",
                            explanation: "Seberapa baik soal membedakan peserta kelompok atas dan kelompok bawah. Nilai minimal 30% menunjukkan soal mampu membedakan kemampuan peserta.",
                          })}
                          {renderSortTh("r", displayFlags.useCorrectedItemTotal ? "r_corr" : "r", true, {
                            term: "Korelasi Butir-Total (r)",
                            explanation: "Mengukur keselarasan butir dengan keseluruhan tes. Nilai positif dan signifikan menandakan butir mengukur kompetensi yang sama dengan soal lain.",
                          })}
                          {showTechnicalCols && !displayFlags.useCorrectedItemTotal && (
                            <th scope="col" className="num">r_corr</th>
                          )}
                          {showTechnicalCols &&
                            renderSortTh("alphaDel", "α(-j)", true, {
                              term: "Alpha jika Butir Dibuang",
                              explanation: "Perkiraan reliabilitas tes apabila butir ini dihapus. Jika nilainya jauh lebih tinggi dari Alpha keseluruhan, butir ini sebaiknya direvisi atau diganti.",
                            })}
                          {showTechnicalCols &&
                            renderSortTh(
                              "significance",
                              displayFlags.useCorrectedItemTotal ? "Sig. (r_corr)" : "Signifikansi",
                            )}
                          {showTechnicalCols && isPureMc && <th scope="col" className="num">Pengecoh</th>}
                          {renderSortTh("verdict", "Keputusan")}
                          {showTechnicalCols && <th scope="col">Catatan</th>}
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
                              {showTechnicalCols && <td>{row.typeLabel}</td>}
                              <td className="mono">
                                {row.reference}
                                {!showTechnicalCols && summaryKind === "mixed" && (
                                  <span className="cell-sub-note"> ({row.typeLabel})</span>
                                )}
                              </td>
                              {showTechnicalCols && !isPureMc && <td className="num">{fmt(row.tVal)}</td>}
                              <td className="num">
                                <span>{fmt(row.tk)}</span>
                                {!showTechnicalCols && row.category !== "-" && (
                                  <span className="cell-sub-note"> {row.category}</span>
                                )}
                              </td>
                              {showTechnicalCols && <td>{row.category}</td>}
                              <td className="num">{fmt(row.dp)}</td>
                              <td className="num">
                                <span>{fmt(displayFlags.useCorrectedItemTotal ? row.rCorr : row.r, 3)}</span>
                                {!showTechnicalCols && row.significance !== "-" && (
                                  <span className="cell-sub-note"> ({row.significance})</span>
                                )}
                              </td>
                              {showTechnicalCols && !displayFlags.useCorrectedItemTotal && (
                                <td className="num">{fmt(row.rCorr, 3)}</td>
                              )}
                              {showTechnicalCols && <td className="num">{fmt(row.alphaDel, 3)}</td>}
                              {showTechnicalCols && <td>{row.significance}</td>}
                              {showTechnicalCols && isPureMc && (
                                <td className="num">{row.distractorRatio ?? "-"}</td>
                              )}
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
                              {showTechnicalCols && (
                                <td className="verdict-reasons-cell">
                                  {row.verdictReasonsText || "-"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {(() => {
                    const selectedVerdict = analysis.verdicts?.[safeItemIdx];
                    const checks = displayFlags.useCorrectedItemTotal
                      ? (selectedVerdict?.corrected_checks ?? selectedVerdict?.checks)
                      : selectedVerdict?.checks;
                    const activeSt = displayFlags.useCorrectedItemTotal
                      ? (selectedVerdict?.corrected_status ?? selectedVerdict?.status)
                      : selectedVerdict?.status;
                    if (!selectedVerdict || !checks || checks.length === 0 || !activeSt) return null;
                    return (
                      <div className="verdict-detail-panel">
                        <div className="verdict-detail-head">
                          <span>
                            Diagnosis Keputusan <strong>Butir #{selectedVerdict.item_number}</strong>
                          </span>
                          <span className={`verdict-badge ${verdictBadgeClass(activeSt)}`}>
                            {activeSt}
                          </span>
                        </div>
                        <table className="apa-table" style={{ marginBlockStart: "var(--space-2)" }}>
                          <thead>
                            <tr>
                              <th>Kriteria</th>
                              <th>Nilai Aktual</th>
                              <th>Ambang Ideal</th>
                              <th>Status</th>
                              <th>Saran Tindak Lanjut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {checks.map((chk, cIdx) => (
                              <tr key={cIdx}>
                                <td>{chk.criterion}</td>
                                <td className="mono">{chk.actual_label}</td>
                                <td className="mono">{chk.threshold_label}</td>
                                <td>
                                  <span className={`verdict-badge ${chk.passed ? "is-accept" : "is-reject"}`}>
                                    {chk.passed ? "Memenuhi" : "Belum"}
                                  </span>
                                </td>
                                <td>{chk.action_hint}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {displayFlags.showInterpretation && (
                    <MethodNotes
                      topic="items"
                      mode={options.mode}
                      useCorrectedItemTotal={displayFlags.useCorrectedItemTotal}
                    />
                  )}
                </>
              )}
            </section>
          )}

          {analysis.indicator_summary && analysis.indicator_summary.length > 0 && (
            <section className="card results-module" aria-labelledby="ind-summary-title">
              <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
                <h2 id="ind-summary-title" className="card-title" style={{ margin: 0 }}>
                  Capaian &amp; Kualitas per Indikator ({analysis.indicator_summary.length})
                </h2>
                {indicatorSummarySpec && (
                  <CardExportBar spec={indicatorSummarySpec} onStatusMessage={onStatusMessage} />
                )}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="apa-table">
                  <thead>
                    <tr>
                      <th>Indikator / Tujuan Pembelajaran</th>
                      <th>Butir</th>
                      <th className="num">Rata-rata TK%</th>
                      <th className="num">Rata-rata DP%</th>
                      <th className="num">Terima / Revisi / Tolak</th>
                      <th>Penguasaan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.indicator_summary.map((ind) => (
                      <tr key={ind.indicator}>
                        <td>{ind.indicator}</td>
                        <td className="mono">{ind.item_numbers.map((n) => `#${n}`).join(", ")}</td>
                        <td className="num">{fmt(ind.mean_tk_percent, 1)}</td>
                        <td className="num">{fmt(ind.mean_dp_percent, 1)}</td>
                        <td className="num">
                          {ind.accept_count} / {ind.revise_count} / {ind.reject_count}
                        </td>
                        <td>{ind.mastery_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card results-module" aria-labelledby="dist-res-title">
            <div className="card-head-row" style={{ marginBlockEnd: distractorsExpanded ? "var(--space-3)" : 0 }}>
              <button
                type="button"
                id="dist-res-title"
                className="card-collapse-btn"
                aria-expanded={distractorsExpanded}
                onClick={() => setDistractorsExpanded((prev) => !prev)}
              >
                <span aria-hidden="true">{distractorsExpanded ? "▾" : "▸"}</span>
                <span>
                  {isPureMc
                    ? distractorViewMode === "matrix"
                      ? `Detail Butir & Matriks Pengecoh (${analysis.distractors?.length ?? 0} butir)`
                      : `Detail Butir & Pengecoh: Butir #${safeItemIdx + 1}`
                    : distractorViewMode === "matrix"
                      ? "Detail Kelompok Unggul-Asor Semua Butir"
                      : `Detail Butir #${analysis.essay_upper_lower?.[safeItemIdx]?.item_number ?? safeItemIdx + 1}`}
                </span>
              </button>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
                <div
                  className="view-mode-switch"
                  role="group"
                  aria-label={isPureMc ? "Tampilan pengecoh" : "Tampilan rincian butir"}
                >
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
                    {isPureMc ? "Matriks Semua" : "Semua Butir"}
                  </button>
                </div>
                {distractorViewMode === "detail" && (
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

            {distractorsExpanded && (
              <>
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

                    <svg
                      ref={(el) => handleSvgRef("detail", el)}
                      className="sr-only"
                      viewBox="0 0 520 190"
                      aria-hidden="true"
                    >
                      {analysis.distractors[safeItemIdx]!.options.map((opt, idx) => {
                        const dist = analysis.distractors![safeItemIdx]!;
                        const y = 16 + idx * 32;
                        const pct =
                          analysis.subject_count > 0
                            ? (opt.frequency / analysis.subject_count) * 100
                            : 0;
                        const barW = (pct / 100) * 320;
                        const isKey = opt.option === dist.key;
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
                            <rect x="86" y={y + 2} width="320" height="20" fill="var(--bg-subtle)" rx="3" />
                            <rect
                              x="86"
                              y={y + 2}
                              width={barW}
                              height="20"
                              fill={isKey ? "var(--accent)" : "var(--border-strong)"}
                              rx="3"
                            />
                            <text x="416" y={y + 16} fontSize="12" fill="var(--ink-primary)">
                              {opt.frequency} ({pct.toFixed(0)}%) [{opt.quality || "-"}]
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                ) : !isPureMc && distractorViewMode === "matrix" && analysis.essay_upper_lower ? (
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
                          <tr
                            key={ul.item_index}
                            className="selectable-row"
                            aria-current={ul.item_index === safeItemIdx ? "true" : undefined}
                            onClick={() => onSelectItem(ul.item_index)}
                          >
                            <td className="num">#{ul.item_number}</td>
                            <td className="num">{fmt(ul.upper_mean)}</td>
                            <td className="num">{fmt(ul.lower_mean)}</td>
                            <td className="num">{fmt(ul.mean_diff)}</td>
                            <td className="num">{fmt(ul.t_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
              </>
            )}
          </section>

          <section className="card results-module" aria-labelledby="charts-res-title">
            <div className="card-head-row" style={{ marginBlockEnd: chartsExpanded ? "var(--space-3)" : 0 }}>
              <button
                type="button"
                id="charts-res-title"
                className="card-collapse-btn"
                aria-expanded={chartsExpanded}
                onClick={() => setChartsExpanded((prev) => !prev)}
              >
                <span aria-hidden="true">{chartsExpanded ? "▾" : "▸"}</span>
                <span>Grafik Sebaran Skor &amp; Peta Butir</span>
              </button>
            </div>

            {chartsExpanded && (
              <ChartsView
                exam={exam}
                analysis={analysis}
                subtitle={contextSubtitle}
                selectedItemIndex={safeItemIdx}
                onSelectItem={onSelectItem}
                onStatusMessage={onStatusMessage}
                onSvgRef={handleSvgRef}
              />
            )}
          </section>

          {modules.comparison && diff && comparisonSpec && (
            <section className="card results-module" aria-labelledby="diff-res-title">
              <div className="card-head-row" style={{ marginBlockEnd: "var(--space-2)" }}>
                <h2 id="diff-res-title" className="card-title" style={{ margin: 0 }}>
                  Audit Mode: ANATES Klasik vs Standar Terkoreksi
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
