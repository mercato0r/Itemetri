import type { DiscriminationItem, EssayItemUpperLower } from "../../types";
import { sanitizeNum } from "./math";
import type { UpperLowerSplit } from "./upperLower";

export function computeMcDiscrimination(
  correctMask: readonly (readonly boolean[])[],
  split: UpperLowerSplit,
): DiscriminationItem[] {
  const m = correctMask.length > 0 ? correctMask[0]!.length : 0;
  const n = split.group_size;
  if (n === 0) {
    return Array.from({ length: m }, (_, j) => ({
      item_index: j,
      item_number: j + 1,
      upper_total: 0.0,
      lower_total: 0.0,
      difference: 0.0,
      index_percent: null,
    }));
  }

  const items: DiscriminationItem[] = [];
  for (let j = 0; j < m; j++) {
    let ba = 0;
    let bb = 0;
    for (const idx of split.upper_indices) {
      if (correctMask[idx]![j]) ba++;
    }
    for (const idx of split.lower_indices) {
      if (correctMask[idx]![j]) bb++;
    }
    const diff = ba - bb;
    const dp = (diff / n) * 100.0;
    items.push({
      item_index: j,
      item_number: j + 1,
      upper_total: ba,
      lower_total: bb,
      difference: diff,
      index_percent: sanitizeNum(dp),
    });
  }
  return items;
}

export function computeEssayDiscrimination(
  idealScores: readonly number[],
  essayUl: readonly EssayItemUpperLower[],
  groupSize: number,
): DiscriminationItem[] {
  return essayUl.map((itemUl, j) => {
    const ideal = idealScores[j]!;
    const diff = itemUl.upper_sum - itemUl.lower_sum;
    const dp = groupSize > 0 ? (diff / (groupSize * ideal)) * 100.0 : Number.NaN;
    return {
      item_index: j,
      item_number: itemUl.item_number,
      upper_total: itemUl.upper_sum,
      lower_total: itemUl.lower_sum,
      difference: diff,
      index_percent: sanitizeNum(dp),
    };
  });
}
