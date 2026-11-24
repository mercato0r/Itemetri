import type { CompatibilityDiff, ExamPayload } from "../../types";
import { sanitizeNum } from "./math";
import { analyzeExam } from "./pipeline";

function safeDelta(corrected: number | null, legacy: number | null): number | null {
  if (corrected === null || legacy === null) return null;
  const d = corrected - legacy;
  return sanitizeNum(d);
}

export function compareModes(
  exam: ExamPayload,
  upperLowerPercent = 27.0,
): CompatibilityDiff {
  const legacy = analyzeExam(exam, {
    mode: "legacy_anates",
    upper_lower_percent: upperLowerPercent,
    use_weighted_score: false,
    essay_difficulty_scope: null,
  });
  const corrected = analyzeExam(exam, {
    mode: "standard_corrected",
    upper_lower_percent: upperLowerPercent,
    use_weighted_score: false,
    essay_difficulty_scope: null,
  });

  const diffChanges: CompatibilityDiff["difficulty_category_changes"] = [];
  const sigChanges: CompatibilityDiff["significance_changes"] = [];
  const itemDeltas: CompatibilityDiff["item_deltas"] = [];

  for (let j = 0; j < legacy.difficulty.length; j++) {
    const legTk = legacy.difficulty[j]!;
    const corTk = corrected.difficulty[j]!;
    if (legTk.category !== corTk.category) {
      diffChanges.push({
        item_index: legTk.item_index,
        item_number: legTk.item_number,
        legacy_category: legTk.category,
        corrected_category: corTk.category,
        legacy_index_percent: legTk.index_percent,
        corrected_index_percent: corTk.index_percent,
      });
    }
    const tkDelta = safeDelta(corTk.index_percent, legTk.index_percent);
    if (tkDelta !== null && tkDelta !== 0.0) {
      itemDeltas.push({
        item_index: legTk.item_index,
        item_number: legTk.item_number,
        metric: "difficulty_percent",
        legacy_value: legTk.index_percent,
        corrected_value: corTk.index_percent,
        delta: tkDelta,
      });
    }
  }

  for (let j = 0; j < legacy.correlations.length; j++) {
    const legR = legacy.correlations[j]!;
    const corR = corrected.correlations[j]!;
    if (legR.significance !== corR.significance) {
      sigChanges.push({
        item_index: legR.item_index,
        item_number: legR.item_number,
        correlation: corR.correlation,
        legacy_significance: legR.significance,
        corrected_significance: corR.significance,
        corrected_p_value: corR.p_value,
      });
    }
  }

  if (legacy.essay_upper_lower && corrected.essay_upper_lower) {
    for (let j = 0; j < legacy.essay_upper_lower.length; j++) {
      const legUl = legacy.essay_upper_lower[j]!;
      const corUl = corrected.essay_upper_lower[j]!;
      const seDelta = safeDelta(corUl.se_pooled, legUl.se_pooled);
      if (seDelta !== null && seDelta !== 0.0) {
        itemDeltas.push({
          item_index: legUl.item_index,
          item_number: legUl.item_number,
          metric: "se_pooled",
          legacy_value: legUl.se_pooled,
          corrected_value: corUl.se_pooled,
          delta: seDelta,
        });
      }
      const tDelta = safeDelta(corUl.t_value, legUl.t_value);
      if (tDelta !== null && tDelta !== 0.0) {
        itemDeltas.push({
          item_index: legUl.item_index,
          item_number: legUl.item_number,
          metric: "t_value",
          legacy_value: legUl.t_value,
          corrected_value: corUl.t_value,
          delta: tDelta,
        });
      }
    }
  }

  return {
    source_path: exam.source_path,
    exam_kind: exam.kind,
    subject_count: legacy.subject_count,
    item_count: legacy.item_count,
    legacy_correlation_xy: legacy.reliability.correlation_xy,
    corrected_correlation_xy: corrected.reliability.correlation_xy,
    correlation_xy_delta: safeDelta(
      corrected.reliability.correlation_xy,
      legacy.reliability.correlation_xy,
    ),
    legacy_reliability: legacy.reliability.reliability_coefficient,
    corrected_reliability: corrected.reliability.reliability_coefficient,
    reliability_delta: safeDelta(
      corrected.reliability.reliability_coefficient,
      legacy.reliability.reliability_coefficient,
    ),
    difficulty_category_changes: diffChanges,
    significance_changes: sigChanges,
    item_deltas: itemDeltas,
  };
}
