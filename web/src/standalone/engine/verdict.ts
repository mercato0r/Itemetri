import type {
  CorrelationItem,
  DifficultyItem,
  DiscriminationItem,
  DistractorItem,
  ItemCriterionCheck,
  ItemVerdict,
  ItemVerdictStatus,
} from "../../types";

export interface VerdictThresholds {
  dpAccept: number;
  dpRevise: number;
  tkOkMin: number;
  tkOkMax: number;
  tkExtremeMin: number;
  tkExtremeMax: number;
}

const DEFAULT_THRESHOLDS: VerdictThresholds = {
  dpAccept: 30.0,
  dpRevise: 20.0,
  tkOkMin: 20.0,
  tkOkMax: 85.0,
  tkExtremeMin: 15.0,
  tkExtremeMax: 90.0,
};

function detectMiskey(
  dpPct: number | null,
  distractor: DistractorItem | undefined,
): [boolean, string | null] {
  if (dpPct === null || !Number.isFinite(dpPct) || dpPct >= 0.0 || !distractor) {
    return [false, null];
  }
  const keyOpt = distractor.options.find((o) => o.option === distractor.key);
  const nonKey = distractor.options.filter((o) => o.option !== distractor.key);
  if (!keyOpt || nonKey.length === 0) return [false, null];

  let best = nonKey[0]!;
  for (let i = 1; i < nonKey.length; i++) {
    const cand = nonKey[i]!;
    const bu = best.upper_count ?? 0;
    const cu = cand.upper_count ?? 0;
    if (cu > bu || (cu === bu && cand.frequency > best.frequency)) {
      best = cand;
    }
  }
  const bestUpper = best.upper_count ?? 0;
  const keyUpper = keyOpt.upper_count ?? 0;
  if (bestUpper > keyUpper) {
    return [
      true,
      `diduga salah kunci (unggul memilih ${best.option}: ${bestUpper} vs kunci ${keyOpt.option}: ${keyUpper})`,
    ];
  }
  return [false, null];
}

function judgeSingleItem(
  tkPct: number | null,
  dpPct: number | null,
  rVal: number | null,
  sig: string | null,
  suspectedMiskey: boolean,
  miskeyHint: string | null,
  th: VerdictThresholds,
): [ItemVerdictStatus, string[], ItemCriterionCheck[]] {
  const reasons: string[] = [];
  const checks: ItemCriterionCheck[] = [];
  const rSig = sig === "Signifikan" || sig === "Sangat Signifikan";
  const rOk = rVal !== null && Number.isFinite(rVal) && rVal > 0.0 && rSig;
  const dpFinite = dpPct !== null && Number.isFinite(dpPct);
  const dpGood = dpFinite && dpPct >= th.dpAccept;
  const dpFair = dpFinite && dpPct >= th.dpRevise;
  const tkFinite = tkPct !== null && Number.isFinite(tkPct);
  const tkOk = tkFinite && th.tkOkMin <= tkPct && tkPct <= th.tkOkMax;
  const tkExtreme =
    !tkFinite || tkPct < th.tkExtremeMin || tkPct > th.tkExtremeMax;

  if (suspectedMiskey && miskeyHint) {
    reasons.push(miskeyHint);
    checks.push({
      criterion: "Kunci & Pengecoh",
      actual_label: "Indikasi salah kunci",
      threshold_label: "Kunci dipilih kelompok atas > pengecoh",
      passed: false,
      action_hint: `Periksa ulang kunci jawaban (${miskeyHint}).`,
    });
  }

  if (rVal === null || !Number.isFinite(rVal)) {
    reasons.push("korelasi tak terdefinisi (variansi butir nol)");
    checks.push({
      criterion: "Korelasi Butir-Total",
      actual_label: "NAN (variansi nol)",
      threshold_label: "> 0 & Signifikan",
      passed: false,
      action_hint: "Semua peserta menjawab sama; perbaiki atau ganti butir.",
    });
  } else if (rVal <= 0.0) {
    reasons.push("korelasi butir-total <= 0");
    checks.push({
      criterion: "Korelasi Butir-Total",
      actual_label: `${rVal.toFixed(3)} (${sig ?? "-"})`,
      threshold_label: "> 0 & Signifikan",
      passed: false,
      action_hint: "Butir berlawanan arah dengan skor total; cek kunci atau redaksi soal.",
    });
  } else if (!rSig) {
    reasons.push("korelasi tidak signifikan");
    checks.push({
      criterion: "Korelasi Butir-Total",
      actual_label: `${rVal.toFixed(3)} (${sig ?? "Tidak Signifikan"})`,
      threshold_label: "> 0 & Signifikan",
      passed: false,
      action_hint: "Daya ukur terhadap total tes lemah; pertimbangkan revisi atau ganti.",
    });
  } else {
    checks.push({
      criterion: "Korelasi Butir-Total",
      actual_label: `${rVal.toFixed(3)} (${sig})`,
      threshold_label: "> 0 & Signifikan",
      passed: true,
      action_hint: "Selaras dengan tujuan pengukuran tes.",
    });
  }

  if (!dpFinite) {
    reasons.push("daya pembeda tidak terdefinisi (kelompok n=0)");
    checks.push({
      criterion: "Daya Pembeda (DP%)",
      actual_label: "NAN",
      threshold_label: `>= ${th.dpAccept}% (Terima), >= ${th.dpRevise}% (Revisi)`,
      passed: false,
      action_hint: "Jumlah peserta terlalu sedikit untuk kelompok atas/bawah.",
    });
  } else if (dpPct < 0.0) {
    reasons.push("daya pembeda negatif");
    checks.push({
      criterion: "Daya Pembeda (DP%)",
      actual_label: `${dpPct.toFixed(1)}%`,
      threshold_label: `>= ${th.dpAccept}%`,
      passed: false,
      action_hint: "Kelompok bawah lebih banyak benar dari kelompok atas; periksa kunci/ambiguitas.",
    });
  } else if (!dpFair) {
    reasons.push(`daya pembeda lemah (<${th.dpRevise}%)`);
    checks.push({
      criterion: "Daya Pembeda (DP%)",
      actual_label: `${dpPct.toFixed(1)}%`,
      threshold_label: `>= ${th.dpAccept}%`,
      passed: false,
      action_hint: "Tidak membedakan siswa paham vs belum paham; perlu perbaikan atau penggantian.",
    });
  } else if (!dpGood) {
    reasons.push(`daya pembeda sedang (${th.dpRevise}-${th.dpAccept}%)`);
    checks.push({
      criterion: "Daya Pembeda (DP%)",
      actual_label: `${dpPct.toFixed(1)}%`,
      threshold_label: `>= ${th.dpAccept}%`,
      passed: false,
      action_hint: "Cukup membedakan namun masih bisa dipertajam pada stimulus atau pengecoh.",
    });
  } else {
    checks.push({
      criterion: "Daya Pembeda (DP%)",
      actual_label: `${dpPct.toFixed(1)}%`,
      threshold_label: `>= ${th.dpAccept}%`,
      passed: true,
      action_hint: "Mampu membedakan kelompok unggul dan asor dengan baik.",
    });
  }

  if (!tkFinite) {
    reasons.push("tingkat kesukaran tak terdefinisi");
    checks.push({
      criterion: "Tingkat Kesukaran (TK%)",
      actual_label: "NAN",
      threshold_label: `${th.tkOkMin}% s.d. ${th.tkOkMax}%`,
      passed: false,
      action_hint: "Periksa kelengkapan skor atau kunci jawaban butir.",
    });
  } else if (!tkOk) {
    const tooHard = tkPct < th.tkOkMin;
    reasons.push(tooHard ? "butir sangat sukar" : "butir sangat mudah");
    checks.push({
      criterion: "Tingkat Kesukaran (TK%)",
      actual_label: `${tkPct.toFixed(1)}%`,
      threshold_label: `${th.tkOkMin}% s.d. ${th.tkOkMax}%`,
      passed: false,
      action_hint: tooHard
        ? "Terlalu sedikit peserta menjawab benar; sederhanakan soal atau cek materi."
        : "Hampir semua peserta menjawab benar; tingkatkan tantangan atau variasi pengecoh.",
    });
  } else {
    checks.push({
      criterion: "Tingkat Kesukaran (TK%)",
      actual_label: `${tkPct.toFixed(1)}%`,
      threshold_label: `${th.tkOkMin}% s.d. ${th.tkOkMax}%`,
      passed: true,
      action_hint: "Proporsi kesukaran berada dalam rentang ideal.",
    });
  }

  let status: ItemVerdictStatus;
  if (
    !dpFinite ||
    dpPct < 0.0 ||
    rVal === null ||
    !Number.isFinite(rVal) ||
    rVal <= 0.0 ||
    suspectedMiskey
  ) {
    status = "Tolak";
  } else if (dpGood && rOk && tkOk) {
    status = "Terima";
  } else if (!dpFair || !rSig || tkExtreme) {
    status = "Tolak";
  } else {
    status = "Revisi";
  }

  return [status, reasons, checks];
}

export function evaluateItemVerdicts(
  discrimination: readonly DiscriminationItem[],
  difficulty: readonly DifficultyItem[],
  correlations: readonly CorrelationItem[],
  distractors?: readonly DistractorItem[],
  thresholds: VerdictThresholds = DEFAULT_THRESHOLDS,
): ItemVerdict[] {
  return difficulty.map((tk, j) => {
    const dp = discrimination[j]!;
    const corr = correlations[j]!;
    const distractor = distractors?.[j];
    const [suspectedMiskey, miskeyHint] = detectMiskey(dp.index_percent, distractor);

    const [status, reasons, checks] = judgeSingleItem(
      tk.index_percent,
      dp.index_percent,
      corr.correlation,
      corr.significance,
      suspectedMiskey,
      miskeyHint,
      thresholds,
    );

    let correctedStatus: ItemVerdictStatus | null = null;
    let correctedReasons: string[] = [];
    let correctedChecks: ItemCriterionCheck[] = [];
    if (corr.corrected_correlation !== null || corr.corrected_significance !== null) {
      [correctedStatus, correctedReasons, correctedChecks] = judgeSingleItem(
        tk.index_percent,
        dp.index_percent,
        corr.corrected_correlation,
        corr.corrected_significance,
        suspectedMiskey,
        miskeyHint,
        thresholds,
      );
    }

    return {
      item_index: tk.item_index,
      item_number: tk.item_number,
      status,
      reasons,
      suspected_miskey: suspectedMiskey,
      corrected_status: correctedStatus,
      corrected_reasons: correctedReasons,
      checks,
      corrected_checks: correctedChecks,
    };
  });
}
