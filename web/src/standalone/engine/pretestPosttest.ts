import type {
  AnalysisOptions,
  AnalysisResponse,
  EssaySubjectScore,
  ExamPayload,
  MultipleChoiceSubjectScore,
} from "../../types";
import { meanAndStdDev, sanitizeNum, studentTTwoTailedP } from "./math";
import { analyzeExam } from "./pipeline";

export type NGainCategory = "Tinggi" | "Sedang" | "Rendah" | "Tidak Terdefinisi";

export interface PretestPosttestRow {
  rank: number;
  name: string;
  pre_score: number;
  post_score: number;
  delta: number;
  n_gain: number | null;
  category: NGainCategory;
}

export interface PretestPosttestResult {
  matched_count: number;
  pre_count: number;
  post_count: number;
  ideal_max_score: number;
  mean_pre: number | null;
  mean_post: number | null;
  mean_delta: number | null;
  mean_n_gain: number | null;
  class_category: NGainCategory;
  t_value: number | null;
  df: number;
  p_value: number | null;
  significant: boolean;
  narrative: string;
  rows: PretestPosttestRow[];
}

function classifyNGain(g: number | null): NGainCategory {
  if (g === null || !Number.isFinite(g)) return "Tidak Terdefinisi";
  if (g >= 0.7) return "Tinggi";
  if (g >= 0.3) return "Sedang";
  return "Rendah";
}

function extractSubjectScores(analysis: AnalysisResponse): Array<{ name: string; score: number }> {
  const isMc = analysis.kind === "multiple_choice";
  const usesWeighted = Boolean(analysis.scoring.uses_weighted_score);
  return analysis.scoring.subjects.map((s) => {
    if (!isMc) {
      const es = s as EssaySubjectScore;
      return { name: es.name || `Peserta ${es.original_index + 1}`, score: es.total_score };
    }
    const mc = s as MultipleChoiceSubjectScore;
    return {
      name: mc.name || `Peserta ${mc.original_index + 1}`,
      score: usesWeighted ? mc.weighted_score : mc.raw_score,
    };
  });
}

export function computePretestPosttest(
  preExam: ExamPayload,
  postExam: ExamPayload,
  options: AnalysisOptions,
): PretestPosttestResult {
  const preAnalysis = analyzeExam(preExam, options);
  const postAnalysis = analyzeExam(postExam, options);
  const preList = extractSubjectScores(preAnalysis);
  const postList = extractSubjectScores(postAnalysis);

  const idealMax =
    postAnalysis.scoring.ideal_max_score ??
    preAnalysis.scoring.ideal_max_score ??
    Math.max(1, postAnalysis.item_count);

  const postByName = new Map<string, number[]>();
  postList.forEach((p, idx) => {
    const key = p.name.trim().toLowerCase();
    if (!key) return;
    const arr = postByName.get(key) ?? [];
    arr.push(idx);
    postByName.set(key, arr);
  });

  const usedPost = new Set<number>();
  const pairs: Array<{ name: string; pre: number; post: number }> = [];

  // Pass 1: match by normalized name
  preList.forEach((preItem) => {
    const key = preItem.name.trim().toLowerCase();
    const candidates = key ? postByName.get(key) : undefined;
    const matchIdx = candidates?.find((idx) => !usedPost.has(idx));
    if (matchIdx !== undefined) {
      usedPost.add(matchIdx);
      pairs.push({
        name: preItem.name,
        pre: preItem.score,
        post: postList[matchIdx]!.score,
      });
    }
  });

  // Fallback: if no names matched at all, pair sequentially by index
  if (pairs.length === 0) {
    const count = Math.min(preList.length, postList.length);
    for (let i = 0; i < count; i++) {
      pairs.push({
        name: preList[i]!.name || postList[i]!.name || `Peserta ${i + 1}`,
        pre: preList[i]!.score,
        post: postList[i]!.score,
      });
    }
  }

  const rows: PretestPosttestRow[] = pairs.map((pair, idx) => {
    const delta = pair.post - pair.pre;
    const denom = idealMax - pair.pre;
    const nGain = denom > 1e-9 ? sanitizeNum(delta / denom) : null;
    return {
      rank: idx + 1,
      name: pair.name,
      pre_score: pair.pre,
      post_score: pair.post,
      delta,
      n_gain: nGain,
      category: classifyNGain(nGain),
    };
  });

  const preVals = rows.map((r) => r.pre_score);
  const postVals = rows.map((r) => r.post_score);
  const deltas = rows.map((r) => r.delta);
  const gains = rows.map((r) => r.n_gain).filter((g): g is number => g !== null);

  const [meanPre] = meanAndStdDev(preVals);
  const [meanPost] = meanAndStdDev(postVals);
  const [meanDelta, stdDelta] = meanAndStdDev(deltas);
  const meanNGain =
    gains.length > 0 ? sanitizeNum(gains.reduce((a, b) => a + b, 0) / gains.length) : null;
  const classCat = classifyNGain(meanNGain);

  const n = rows.length;
  const df = Math.max(0, n - 1);
  let tValue: number | null = null;
  let pValue: number | null = null;
  if (n >= 2 && stdDelta > 1e-12) {
    const se = stdDelta / Math.sqrt(n);
    tValue = sanitizeNum(meanDelta / se);
    if (tValue !== null) {
      pValue = sanitizeNum(studentTTwoTailedP(Math.abs(tValue), df));
    }
  }

  const significant = pValue !== null && pValue < 0.05;
  const narrative =
    n === 0
      ? "Tidak ada peserta yang cocok antara data Pretest dan Posttest."
      : `Dari ${n} peserta berpasangan, rata-rata skor berubah dari ${meanPre.toFixed(2)} menjadi ${meanPost.toFixed(2)} (selisih ${meanDelta >= 0 ? "+" : ""}${meanDelta.toFixed(2)}). Rata-rata N-Gain = ${meanNGain !== null ? meanNGain.toFixed(2) : "NAN"} (kategori ${classCat})${
          pValue !== null
            ? `, uji-t berpasangan ${significant ? "signifikan" : "belum signifikan"} (t=${tValue?.toFixed(2)}, p=${pValue.toFixed(4)}).`
            : "."
        }`;

  return {
    matched_count: n,
    pre_count: preList.length,
    post_count: postList.length,
    ideal_max_score: idealMax,
    mean_pre: sanitizeNum(meanPre),
    mean_post: sanitizeNum(meanPost),
    mean_delta: sanitizeNum(meanDelta),
    mean_n_gain: meanNGain,
    class_category: classCat,
    t_value: tValue,
    df,
    p_value: pValue,
    significant,
    narrative,
    rows,
  };
}
