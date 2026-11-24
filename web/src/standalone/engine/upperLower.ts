import type { AnalysisResponse, CompatibilityMode, EssayItemUpperLower } from "../../types";
import { bankerRoundGroupSize, meanAndStdDev, sanitizeNum, studentTTwoTailedP } from "./math";

export type UpperLowerSplit = AnalysisResponse["upper_lower"];

export function splitUpperLower(
  sortedOrder: readonly number[],
  subjectCount: number,
  percent: number,
): UpperLowerSplit {
  const groupSize = Math.min(bankerRoundGroupSize(subjectCount, percent), subjectCount);
  const upper = sortedOrder.slice(0, groupSize);
  const lower = sortedOrder.slice(subjectCount - groupSize, subjectCount);
  return {
    group_size: groupSize,
    upper_indices: upper,
    lower_indices: lower,
  };
}

export function computeEssayUpperLower(
  itemNumbers: readonly number[],
  scoreMatrix: readonly (readonly number[])[],
  split: UpperLowerSplit,
  mode: CompatibilityMode,
): EssayItemUpperLower[] {
  const n = split.group_size;
  const m = itemNumbers.length;

  if (n === 0) {
    return itemNumbers.map((itemNo, j) => ({
      item_index: j,
      item_number: itemNo,
      upper_mean: null,
      lower_mean: null,
      mean_diff: null,
      upper_std: null,
      lower_std: null,
      upper_sum: 0.0,
      lower_sum: 0.0,
      upper_valid_count: 0,
      lower_valid_count: 0,
      se_pooled: null,
      t_value: null,
      p_value: null,
    }));
  }

  const items: EssayItemUpperLower[] = [];
  for (let j = 0; j < m; j++) {
    const uValid: number[] = [];
    const lValid: number[] = [];
    for (const idx of split.upper_indices) {
      const v = scoreMatrix[idx]![j]!;
      if (!Number.isNaN(v)) uValid.push(v);
    }
    for (const idx of split.lower_indices) {
      const v = scoreMatrix[idx]![j]!;
      if (!Number.isNaN(v)) lValid.push(v);
    }

    const nU = uValid.length;
    const nL = lValid.length;
    const [uMean, uStd] = meanAndStdDev(uValid);
    const [lMean, lStd] = meanAndStdDev(lValid);
    const uSum = uValid.reduce((a, b) => a + b, 0);
    const lSum = lValid.reduce((a, b) => a + b, 0);
    const meanDiff = uMean - lMean;

    const denomU = mode === "legacy_anates" ? n : nU;
    const denomL = mode === "legacy_anates" ? n : nL;
    const sePooled =
      denomU > 0 && denomL > 0
        ? Math.sqrt((uStd * uStd) / denomU + (lStd * lStd) / denomL)
        : Number.NaN;
    const tValue =
      Number.isFinite(sePooled) && sePooled > 0.0 ? meanDiff / sePooled : Number.NaN;

    let pValue: number | null = null;
    if (
      mode === "standard_corrected" &&
      nU > 1 &&
      nL > 1 &&
      Number.isFinite(tValue) &&
      sePooled > 0.0
    ) {
      const varU = (uStd * uStd) / nU;
      const varL = (lStd * lStd) / nL;
      const dfDenom = (varU * varU) / (nU - 1) + (varL * varL) / (nL - 1);
      const dfW = dfDenom > 0.0 ? ((varU + varL) ** 2) / dfDenom : nU + nL - 2;
      pValue = sanitizeNum(studentTTwoTailedP(Math.abs(tValue), dfW));
    }

    items.push({
      item_index: j,
      item_number: itemNumbers[j]!,
      upper_mean: sanitizeNum(uMean),
      lower_mean: sanitizeNum(lMean),
      mean_diff: sanitizeNum(meanDiff),
      upper_std: sanitizeNum(uStd),
      lower_std: sanitizeNum(lStd),
      upper_sum: uSum,
      lower_sum: lSum,
      upper_valid_count: nU,
      lower_valid_count: nL,
      se_pooled: sanitizeNum(sePooled),
      t_value: sanitizeNum(tValue),
      p_value: pValue,
    });
  }
  return items;
}
