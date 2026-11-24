import type {
  AnalysisOptions,
  ExamKind,
  ExecutiveSummary,
  ItemVerdict,
  ReliabilityResult,
  ScoreDistributionSummary,
} from "../../types";
import { sanitizeNum } from "./math";

function quantileSorted(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  const vLo = sorted[lo]!;
  const vHi = sorted[hi]!;
  return vLo + (vHi - vLo) * frac;
}

export function computeScoreDistributionSummary(
  scores: readonly number[],
  mean: number | null,
  stdDev: number | null,
  idealMaxScore: number | null,
  passingScore: number | null | undefined,
): ScoreDistributionSummary {
  const valid = scores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = valid.length;
  const q1 = quantileSorted(valid, 0.25);
  const q3 = quantileSorted(valid, 0.75);
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;

  let skewness: number | null = null;
  if (n >= 3 && mean !== null && stdDev !== null && stdDev > 1e-12) {
    let m3 = 0;
    for (const v of valid) {
      const d = (v - mean) / stdDev;
      m3 += d * d * d;
    }
    skewness = sanitizeNum((n / ((n - 1) * (n - 2))) * m3);
  }

  let skewLabel: ScoreDistributionSummary["skew_label"] = "Tidak Terdefinisi";
  if (skewness !== null) {
    if (skewness > 0.5) skewLabel = "Condong Kanan (Positif)";
    else if (skewness < -0.5) skewLabel = "Condong Kiri (Negatif)";
    else skewLabel = "Simetris";
  }

  const meanPercent =
    mean !== null && idealMaxScore !== null && idealMaxScore > 0
      ? sanitizeNum((mean / idealMaxScore) * 100)
      : null;

  let effectFlag: ScoreDistributionSummary["effect_flag"] = "normal";
  if (meanPercent !== null) {
    if (meanPercent < 35) effectFlag = "floor";
    else if (meanPercent > 85) effectFlag = "ceiling";
  }

  const activePassing =
    passingScore !== null && passingScore !== undefined && Number.isFinite(passingScore)
      ? passingScore
      : null;
  let passCount: number | null = null;
  let passPercent: number | null = null;
  if (activePassing !== null && n > 0) {
    passCount = valid.filter((v) => v >= activePassing).length;
    passPercent = sanitizeNum((passCount / n) * 100);
  }

  const parts: string[] = [];
  if (meanPercent !== null) {
    if (effectFlag === "floor") {
      parts.push(
        `Capaian rata-rata kelas masih rendah (${meanPercent.toFixed(1)}% dari skor ideal), mengindikasikan soal relatif sukar atau materi belum dikuasai.`,
      );
    } else if (effectFlag === "ceiling") {
      parts.push(
        `Capaian rata-rata kelas sangat tinggi (${meanPercent.toFixed(1)}% dari skor ideal), mengindikasikan penguasaan sangat baik atau soal cenderung mudah.`,
      );
    } else {
      parts.push(
        `Capaian rata-rata peserta berada pada level moderat (${meanPercent.toFixed(1)}% dari skor ideal).`,
      );
    }
  }

  if (skewness !== null) {
    if (skewLabel === "Condong Kanan (Positif)") {
      parts.push("Sebaran condong kanan: sebagian besar peserta mengelompok pada skor bawah hingga menengah.");
    } else if (skewLabel === "Condong Kiri (Negatif)") {
      parts.push("Sebaran condong kiri: sebagian besar peserta memperoleh skor menengah hingga tinggi.");
    } else {
      parts.push("Sebaran skor relatif simetris di sekitar nilai tengah kelas.");
    }
  }

  if (activePassing !== null && passCount !== null && passPercent !== null) {
    parts.push(
      `Ketuntasan (batas ${activePassing}): ${passCount} dari ${n} peserta (${passPercent.toFixed(1)}%) mencapai batas lulus.`,
    );
  }

  return {
    skewness,
    skew_label: skewLabel,
    iqr: iqr !== null ? sanitizeNum(iqr) : null,
    q1: q1 !== null ? sanitizeNum(q1) : null,
    q3: q3 !== null ? sanitizeNum(q3) : null,
    mean_percent: meanPercent,
    effect_flag: effectFlag,
    passing_score: activePassing,
    pass_count: passCount,
    pass_percent: passPercent,
    narrative: parts.join(" ") || "Data skor belum cukup untuk menyimpulkan bentuk distribusi.",
  };
}

export function computeExecutiveSummary(
  kind: ExamKind,
  options: AnalysisOptions,
  reliability: ReliabilityResult,
  interpretations: {
    reliability_tt: string;
    cronbach_alpha: string;
    kr20: string | null;
    kr21: string | null;
  },
  verdicts: readonly ItemVerdict[],
  scoreDist: ScoreDistributionSummary,
): ExecutiveSummary {
  const useCorrected = options.mode === "standard_corrected";
  const primaryRel =
    reliability.cronbach_alpha ??
    (kind === "multiple_choice" ? reliability.kr20 : null) ??
    reliability.reliability_coefficient;
  const primaryLabel =
    reliability.cronbach_alpha !== null
      ? "Alpha Cronbach"
      : kind === "multiple_choice" && reliability.kr20 !== null
        ? "KR-20"
        : "Belah Dua (r_tt)";
  const primaryInterp =
    reliability.cronbach_alpha !== null
      ? interpretations.cronbach_alpha
      : kind === "multiple_choice" && reliability.kr20 !== null
        ? (interpretations.kr20 ?? interpretations.reliability_tt)
        : interpretations.reliability_tt;

  let acceptCount = 0;
  let reviseCount = 0;
  let rejectCount = 0;
  const miskeyItems: number[] = [];
  const reviseItems: number[] = [];
  const rejectItems: number[] = [];

  for (const v of verdicts) {
    const st = useCorrected && v.corrected_status ? v.corrected_status : v.status;
    if (st === "Terima") acceptCount++;
    else if (st === "Revisi") {
      reviseCount++;
      reviseItems.push(v.item_number);
    } else {
      rejectCount++;
      rejectItems.push(v.item_number);
    }
    if (v.suspected_miskey) {
      miskeyItems.push(v.item_number);
    }
  }

  const total = Math.max(1, verdicts.length);
  let qualityTier: ExecutiveSummary["quality_tier"] = "Cukup";
  if (
    primaryRel !== null &&
    primaryRel >= 0.7 &&
    rejectCount <= Math.floor(total * 0.2) &&
    miskeyItems.length === 0
  ) {
    qualityTier = "Baik";
  } else if (
    (primaryRel !== null && primaryRel < 0.5) ||
    acceptCount < Math.ceil(total * 0.4) ||
    miskeyItems.length > 0
  ) {
    qualityTier = "Perlu Perbaikan";
  }

  const headline =
    qualityTier === "Baik"
      ? `Instrumen berkualitas baik (${acceptCount}/${verdicts.length} butir layak pakai)`
      : qualityTier === "Cukup"
        ? `Instrumen cukup memadai, namun ${reviseCount + rejectCount} butir perlu ditinjau`
        : `Instrumen perlu perbaikan (${rejectCount} butir ditolak${
            miskeyItems.length > 0 ? `, ${miskeyItems.length} diduga salah kunci` : ""
          })`;

  const reliabilityNarrative =
    primaryRel !== null
      ? `Konsistensi internal (${primaryLabel} = ${primaryRel.toFixed(2)}, kategori ${primaryInterp}) menunjukkan skor peserta ${
          primaryRel >= 0.7 ? "cukup ajek dan dapat dipercaya" : "masih bervariasi dan perlu penguatan butir"
        }.`
      : "Koefisien reliabilitas belum dapat dihitung karena variansi skor nol atau jumlah butir terlalu sedikit.";

  const itemParts: string[] = [
    `${acceptCount} butir siap dipertahankan, ${reviseCount} butir perlu revisi${
      reviseItems.length > 0 ? ` (#${reviseItems.slice(0, 8).join(", #")}${reviseItems.length > 8 ? ", ..." : ""})` : ""
    }, dan ${rejectCount} butir sebaiknya diganti${
      rejectItems.length > 0 ? ` (#${rejectItems.slice(0, 8).join(", #")}${rejectItems.length > 8 ? ", ..." : ""})` : ""
    }.`,
  ];
  if (miskeyItems.length > 0) {
    itemParts.push(
      `Perhatian khusus: butir #${miskeyItems.join(", #")} terindikasi salah kunci jawaban.`,
    );
  }

  return {
    quality_tier: qualityTier,
    headline,
    reliability_narrative: reliabilityNarrative,
    item_action_narrative: itemParts.join(" "),
    student_summary_narrative: scoreDist.narrative,
    accept_count: acceptCount,
    revise_count: reviseCount,
    reject_count: rejectCount,
    miskey_items: miskeyItems,
    revise_items: reviseItems,
    reject_items: rejectItems,
  };
}
