import type { CompatibilityMode, CorrelationItem } from "../../types";
import { pearsonMatrixVector, ptp, sanitizeNum, studentTTwoTailedP } from "./math";
import { computeAlphaIfDeleted } from "./reliability";

export const LEGACY_CORRELATION_TABLE: readonly [number, number, number][] = [
  [10, 0.576, 0.708],
  [15, 0.482, 0.606],
  [20, 0.423, 0.549],
  [25, 0.381, 0.496],
  [30, 0.349, 0.449],
  [40, 0.304, 0.393],
  [50, 0.273, 0.354],
  [60, 0.25, 0.325],
  [70, 0.233, 0.302],
  [80, 0.217, 0.283],
  [90, 0.205, 0.267],
  [100, 0.195, 0.254],
  [125, 0.174, 0.228],
  [150, 0.159, 0.208],
];

export function lookupLegacySignificance(r: number, itemCount: number): string {
  if (Number.isNaN(r)) return "NAN";
  const row =
    LEGACY_CORRELATION_TABLE.find((entry) => entry[0] >= itemCount) ??
    LEGACY_CORRELATION_TABLE[LEGACY_CORRELATION_TABLE.length - 1]!;
  if (r >= row[2]) return "Sangat Signifikan";
  if (r >= row[1]) return "Signifikan";
  return "-";
}

export function evaluateCorrectedSignificance(
  r: number,
  df: number,
): [number, string] {
  if (Number.isNaN(r)) return [Number.NaN, "NAN"];
  if (df <= 0) return [Number.NaN, "-"];

  let pValue: number;
  if (Math.abs(r) >= 1.0) {
    pValue = 0.0;
  } else {
    const tStat = Math.abs(r) * Math.sqrt(df / (1.0 - r * r));
    pValue = studentTTwoTailedP(tStat, df);
  }

  if (r > 0.0 && pValue <= 0.01) return [pValue, "Sangat Signifikan"];
  if (r > 0.0 && pValue <= 0.05) return [pValue, "Signifikan"];
  return [pValue, "-"];
}

export function computeCorrectedItemTotals(
  itemScores: readonly (readonly number[])[],
  totalScores: readonly number[],
  itemContributions?: readonly (readonly number[])[],
): number[] {
  const n = itemScores.length;
  const m = n > 0 ? itemScores[0]!.length : 0;
  const result = new Array<number>(m).fill(Number.NaN);
  if (n < 2 || m < 2) return result;

  const contrib = itemContributions ?? itemScores;
  let sumsClose = true;
  let maxAbsTotal = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < m; j++) rowSum += contrib[i]![j]!;
    const t = totalScores[i]!;
    if (Math.abs(t) > maxAbsTotal) maxAbsTotal = Math.abs(t);
    if (Math.abs(t - rowSum) > 1e-15 + 1e-12 * Math.abs(rowSum)) {
      sumsClose = false;
    }
  }
  const ptpFloor = 1e-12 * maxAbsTotal;

  const contribVarying = new Array<boolean>(m).fill(false);
  let varyingCount = 0;
  if (sumsClose) {
    for (let j = 0; j < m; j++) {
      const col = new Array<number>(n);
      for (let i = 0; i < n; i++) col[i] = contrib[i]![j]!;
      if (ptp(col) > 0.0) {
        contribVarying[j] = true;
        varyingCount++;
      }
    }
  }

  for (let j = 0; j < m; j++) {
    const xCol = new Array<number>(n);
    const restCol = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      xCol[i] = itemScores[i]![j]!;
      restCol[i] = totalScores[i]! - contrib[i]![j]!;
    }
    if (ptp(xCol) === 0.0) continue;
    const restPtp = ptp(restCol);
    if (restPtp === 0.0) continue;
    if (sumsClose) {
      const otherVarying = varyingCount - (contribVarying[j] ? 1 : 0) > 0;
      if (!otherVarying || restPtp <= ptpFloor) continue;
    }

    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += xCol[i]!;
      sy += restCol[i]!;
    }
    const mx = sx / n;
    const my = sy / n;
    let num = 0;
    let dx2 = 0;
    let dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = xCol[i]! - mx;
      const dy = restCol[i]! - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const denom = dx2 * dy2;
    if (denom > 0.0) {
      result[j] = Math.max(-1.0, Math.min(1.0, num / Math.sqrt(denom)));
    }
  }
  return result;
}

function evaluateSignificance(
  r: number,
  itemCount: number,
  df: number,
  mode: CompatibilityMode,
): [number | null, string] {
  if (mode === "legacy_anates") {
    return [null, lookupLegacySignificance(r, itemCount)];
  }
  const [pRaw, sig] = evaluateCorrectedSignificance(r, df);
  return [sanitizeNum(pRaw), sig];
}

export function computeItemCorrelations(
  itemScores: readonly (readonly number[])[],
  totalScores: readonly number[],
  subjectCount: number,
  itemCount: number,
  itemNumbers: readonly number[],
  mode: CompatibilityMode,
  itemContributions?: readonly (readonly number[])[],
): CorrelationItem[] {
  const rValues = pearsonMatrixVector(itemScores, totalScores);
  const rCorrectedValues = computeCorrectedItemTotals(
    itemScores,
    totalScores,
    itemContributions,
  );
  const alphaDelValues = computeAlphaIfDeleted(itemScores);
  const df = subjectCount - 2;

  const items: CorrelationItem[] = [];
  for (let j = 0; j < itemCount; j++) {
    const r = rValues[j]!;
    const rCorr = rCorrectedValues[j]!;
    const [pVal, sig] = evaluateSignificance(r, itemCount, df, mode);
    const [pCorr, sigCorr] = evaluateSignificance(rCorr, itemCount, df, mode);
    items.push({
      item_index: j,
      item_number: itemNumbers[j]!,
      correlation: sanitizeNum(r),
      p_value: pVal,
      significance: sig,
      corrected_correlation: sanitizeNum(rCorr),
      corrected_p_value: pCorr,
      corrected_significance: sigCorr,
      alpha_if_deleted: sanitizeNum(alphaDelValues[j]!),
    });
  }
  return items;
}
