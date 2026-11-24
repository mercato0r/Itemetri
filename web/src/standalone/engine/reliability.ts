import type {
  CompatibilityMode,
  EssaySubject,
  MultipleChoiceSubject,
  ReliabilityResult,
  ReliabilitySubjectRow,
} from "../../types";
import { pearson1d, ptp, sanitizeNum, variance } from "./math";

function spearmanBrown(rXy: number, castFloat32: boolean): number {
  if (Number.isNaN(rXy)) return Number.NaN;
  const r = castFloat32 ? Math.fround(rXy) : rXy;
  const denom = 1.0 + r;
  if (denom === 0.0) return Number.NaN;
  return (2.0 * r) / denom;
}

export function computeCronbachAlpha(itemMatrix: readonly (readonly number[])[]): number {
  const n = itemMatrix.length;
  const m = n > 0 ? itemMatrix[0]!.length : 0;
  if (n < 2 || m < 2) return Number.NaN;

  const totals = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += itemMatrix[i]![j]!;
    totals[i] = s;
  }
  if (ptp(totals) === 0.0) return Number.NaN;
  const totalVar = variance(totals, 1);
  if (!(totalVar > 0.0)) return Number.NaN;

  let itemVarSum = 0.0;
  for (let j = 0; j < m; j++) {
    const col = new Array<number>(n);
    for (let i = 0; i < n; i++) col[i] = itemMatrix[i]![j]!;
    itemVarSum += variance(col, 1);
  }
  return (m / (m - 1)) * (1.0 - itemVarSum / totalVar);
}

export function computeKr20(correctMask: readonly (readonly boolean[])[]): number {
  const n = correctMask.length;
  const m = n > 0 ? correctMask[0]!.length : 0;
  if (n < 2 || m < 2) return Number.NaN;

  const totals = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) if (correctMask[i]![j]) s += 1;
    totals[i] = s;
  }
  if (ptp(totals) === 0.0) return Number.NaN;
  const totalVar = variance(totals, 0);
  if (!(totalVar > 0.0)) return Number.NaN;

  let pqSum = 0.0;
  for (let j = 0; j < m; j++) {
    let hits = 0;
    for (let i = 0; i < n; i++) if (correctMask[i]![j]) hits++;
    const p = hits / n;
    pqSum += p * (1.0 - p);
  }
  return (m / (m - 1)) * (1.0 - pqSum / totalVar);
}

export function computeKr21(correctMask: readonly (readonly boolean[])[]): number {
  const n = correctMask.length;
  const m = n > 0 ? correctMask[0]!.length : 0;
  if (n < 2 || m < 2) return Number.NaN;

  const totals = new Array<number>(n);
  let grandSum = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) if (correctMask[i]![j]) s += 1;
    totals[i] = s;
    grandSum += s;
  }
  if (ptp(totals) === 0.0) return Number.NaN;
  const totalVar = variance(totals, 0);
  if (!(totalVar > 0.0)) return Number.NaN;
  const meanTotal = grandSum / n;
  return (m / (m - 1)) * (1.0 - (meanTotal * (m - meanTotal)) / (m * totalVar));
}

export function computeAlphaIfDeleted(itemMatrix: readonly (readonly number[])[]): number[] {
  const n = itemMatrix.length;
  const m = n > 0 ? itemMatrix[0]!.length : 0;
  const result = new Array<number>(m).fill(Number.NaN);
  if (n < 2 || m < 3) return result;

  const totals = new Array<number>(n);
  let maxAbsTotal = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += itemMatrix[i]![j]!;
    totals[i] = s;
    const absS = Math.abs(s);
    if (absS > maxAbsTotal) maxAbsTotal = absS;
  }
  const ptpFloor = 1e-12 * maxAbsTotal;

  const varyingCols = new Array<boolean>(m);
  const itemVars = new Array<number>(m).fill(0.0);
  let varyingCount = 0;
  let totalItemVar = 0.0;
  for (let j = 0; j < m; j++) {
    const col = new Array<number>(n);
    for (let i = 0; i < n; i++) col[i] = itemMatrix[i]![j]!;
    const isVarying = ptp(col) > 0.0;
    varyingCols[j] = isVarying;
    if (isVarying) {
      varyingCount++;
      const v = variance(col, 1);
      itemVars[j] = v;
      totalItemVar += v;
    }
  }

  for (let j = 0; j < m; j++) {
    const otherVarying = varyingCount - (varyingCols[j] ? 1 : 0) > 0;
    if (!otherVarying) continue;
    const restTotals = new Array<number>(n);
    for (let i = 0; i < n; i++) restTotals[i] = totals[i]! - itemMatrix[i]![j]!;
    const restPtp = ptp(restTotals);
    const restVar = variance(restTotals, 1);
    if (restPtp > ptpFloor && restVar > 0.0) {
      const remItemVars = totalItemVar - itemVars[j]!;
      result[j] = ((m - 1) / (m - 2)) * (1.0 - remItemVars / restVar);
    }
  }
  return result;
}

export function interpretReliability(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "Tidak terdefinisi";
  if (value >= 0.8) return "Sangat Tinggi";
  if (value >= 0.6) return "Tinggi";
  if (value >= 0.4) return "Cukup";
  if (value >= 0.2) return "Rendah";
  return "Sangat Rendah";
}

export function computeMcReliability(
  subjects: readonly MultipleChoiceSubject[],
  correctMask: readonly (readonly boolean[])[],
  mode: CompatibilityMode,
): ReliabilityResult {
  const n = correctMask.length;
  const m = n > 0 ? correctMask[0]!.length : 0;
  const oddScores = new Array<number>(n).fill(0.0);
  const evenScores = new Array<number>(n).fill(0.0);
  const isLegacy = mode === "legacy_anates";

  if (isLegacy) {
    if (m > 1) {
      for (let i = 0; i < n; i++) {
        let odd = 0;
        let even = 0;
        for (let j = 1; j < m - 1; j += 2) if (correctMask[i]![j]) odd += 1;
        for (let j = 0; j < m - 1; j += 2) if (correctMask[i]![j]) even += 1;
        oddScores[i] = odd;
        evenScores[i] = even;
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      let odd = 0;
      let even = 0;
      for (let j = 0; j < m; j += 2) if (correctMask[i]![j]) odd += 1;
      for (let j = 1; j < m; j += 2) if (correctMask[i]![j]) even += 1;
      oddScores[i] = odd;
      evenScores[i] = even;
    }
  }

  const rXy = pearson1d(oddScores, evenScores);
  const rTt = spearmanBrown(rXy, isLegacy);
  const numericMatrix = correctMask.map((row) => row.map((b) => (b ? 1.0 : 0.0)));
  const alpha = computeCronbachAlpha(numericMatrix);
  const kr20 = computeKr20(correctMask);
  const kr21 = computeKr21(correctMask);

  const rows: ReliabilitySubjectRow[] = subjects.map((subj, idx) => ({
    original_index: subj.original_index,
    name: subj.name,
    odd_score: oddScores[idx]!,
    even_score: evenScores[idx]!,
    split_total: oddScores[idx]! + evenScores[idx]!,
  }));

  return {
    correlation_xy: sanitizeNum(rXy),
    reliability_coefficient: sanitizeNum(rTt),
    method: isLegacy
      ? "split_half_spearman_brown_legacy_0x4b57d9"
      : "split_half_spearman_brown",
    rows,
    cronbach_alpha: sanitizeNum(alpha),
    kr20: sanitizeNum(kr20),
    kr21: sanitizeNum(kr21),
  };
}

export function computeEssayReliability(
  subjects: readonly EssaySubject[],
  filledMatrix: readonly (readonly number[])[],
  mode: CompatibilityMode,
): ReliabilityResult {
  const n = filledMatrix.length;
  const m = n > 0 ? filledMatrix[0]!.length : 0;
  const oddScores = new Array<number>(n).fill(0.0);
  const evenScores = new Array<number>(n).fill(0.0);

  for (let i = 0; i < n; i++) {
    let odd = 0;
    let even = 0;
    for (let j = 0; j < m; j += 2) odd += filledMatrix[i]![j]!;
    for (let j = 1; j < m; j += 2) even += filledMatrix[i]![j]!;
    oddScores[i] = odd;
    evenScores[i] = even;
  }

  const isLegacy = mode === "legacy_anates";
  const rXy = pearson1d(oddScores, evenScores);
  const rTt = spearmanBrown(rXy, isLegacy);
  const alpha = computeCronbachAlpha(filledMatrix);

  const rows: ReliabilitySubjectRow[] = subjects.map((subj, idx) => ({
    original_index: subj.original_index,
    name: subj.name,
    odd_score: oddScores[idx]!,
    even_score: evenScores[idx]!,
    split_total: oddScores[idx]! + evenScores[idx]!,
  }));

  return {
    correlation_xy: sanitizeNum(rXy),
    reliability_coefficient: sanitizeNum(rTt),
    method: isLegacy ? "split_half_spearman_brown_float32" : "split_half_spearman_brown",
    rows,
    cronbach_alpha: sanitizeNum(alpha),
    kr20: null,
    kr21: null,
  };
}
