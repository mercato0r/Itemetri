import type {
  CompatibilityMode,
  DifficultyItem,
  EssayDifficultyScope,
  EssayItemUpperLower,
} from "../../types";
import { sanitizeNum } from "./math";

export function classifyDifficulty(
  tkPercent: number,
  mode: CompatibilityMode,
): string | null {
  if (mode === "legacy_anates") {
    if (0.0 <= tkPercent && tkPercent <= 15.0) return "Sangat Sukar";
    if (15.0 < tkPercent && tkPercent <= 30.0) return "Sukar";
    if (31.0 < tkPercent && tkPercent <= 70.0) return "Sedang";
    if (71.0 < tkPercent && tkPercent <= 85.0) return "Mudah";
    return "Sangat Mudah";
  }

  if (Number.isNaN(tkPercent)) return null;
  if (tkPercent <= 15.0) return "Sangat Sukar";
  if (tkPercent <= 30.0) return "Sukar";
  if (tkPercent <= 70.0) return "Sedang";
  if (tkPercent <= 85.0) return "Mudah";
  return "Sangat Mudah";
}

export function computeMcDifficulty(
  correctMask: readonly (readonly boolean[])[],
  mode: CompatibilityMode,
): DifficultyItem[] {
  const n = correctMask.length;
  const m = n > 0 ? correctMask[0]!.length : 0;
  const items: DifficultyItem[] = [];
  for (let j = 0; j < m; j++) {
    let correctCount = 0;
    for (let i = 0; i < n; i++) {
      if (correctMask[i]![j]) correctCount++;
    }
    const tk = (correctCount / n) * 100.0;
    items.push({
      item_index: j,
      item_number: j + 1,
      numerator: correctCount,
      denominator: n,
      index_percent: sanitizeNum(tk),
      category: classifyDifficulty(tk, mode),
    });
  }
  return items;
}

export function computeEssayDifficulty(
  idealScores: readonly number[],
  filledMatrix: readonly (readonly number[])[],
  essayUl: readonly EssayItemUpperLower[],
  groupSize: number,
  scope: EssayDifficultyScope,
  mode: CompatibilityMode,
): DifficultyItem[] {
  const n = filledMatrix.length;
  if (scope === "all_subjects") {
    return idealScores.map((ideal, j) => {
      let colSum = 0;
      for (let i = 0; i < n; i++) colSum += filledMatrix[i]![j]!;
      const denom = n * ideal;
      const tk = (colSum / denom) * 100.0;
      return {
        item_index: j,
        item_number: essayUl[j]?.item_number ?? j + 1,
        numerator: colSum,
        denominator: denom,
        index_percent: sanitizeNum(tk),
        category: classifyDifficulty(tk, mode),
      };
    });
  }

  return essayUl.map((itemUl, j) => {
    const ideal = idealScores[j]!;
    const num = itemUl.upper_sum + itemUl.lower_sum;
    const denom = 2.0 * groupSize * ideal;
    const tk = groupSize > 0 ? (num / denom) * 100.0 : Number.NaN;
    return {
      item_index: j,
      item_number: itemUl.item_number,
      numerator: num,
      denominator: denom,
      index_percent: sanitizeNum(tk),
      category: classifyDifficulty(tk, mode),
    };
  });
}
