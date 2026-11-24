import type { AnalysisOptions, AnalysisResponse, ExamPayload } from "../../types";
import { computeItemCorrelations } from "./correlation";
import { computeEssayDifficulty, computeMcDifficulty } from "./difficulty";
import { computeEssayDiscrimination, computeMcDiscrimination } from "./discrimination";
import { computeDistractors } from "./distractor";
import {
  computeEssayReliability,
  computeMcReliability,
  interpretReliability,
} from "./reliability";
import {
  scoreEssay,
  scoreMultipleChoice,
  validateEssayExam,
  validateMultipleChoiceExam,
} from "./scoring";
import { computeEssayUpperLower, splitUpperLower } from "./upperLower";
import { evaluateItemVerdicts } from "./verdict";
import { computeExecutiveSummary, computeScoreDistributionSummary } from "./summary";
import { computeIndicatorSummary } from "./indicators";

export function analyzeMultipleChoice(
  exam: ExamPayload,
  options: AnalysisOptions,
): AnalysisResponse {
  const scoringState = scoreMultipleChoice(exam, options);
  const warnings = validateMultipleChoiceExam(exam, scoringState.responsesUpper);
  const subjects = exam.mc_subjects ?? [];
  const subjectCount = subjects.length;
  const itemCount = (exam.answer_key ?? "").length;

  const split = splitUpperLower(
    scoringState.sortedOrder,
    subjectCount,
    options.upper_lower_percent,
  );
  if (split.group_size === 0) {
    warnings.push({
      code: "insufficient_upper_lower_group",
      message: `Subject count ${subjectCount} yields group_size=0 at ${options.upper_lower_percent}%.`,
      subject_index: null,
      item_index: null,
    });
  }

  const discrimination = computeMcDiscrimination(scoringState.correctMask, split);
  const difficulty = computeMcDifficulty(scoringState.correctMask, options.mode);
  const itemNumbers = Array.from({ length: itemCount }, (_, i) => i + 1);
  const itemMatrix = scoringState.correctMask.map((row) =>
    row.map((b) => (b ? 1.0 : 0.0)),
  );
  const correlations = computeItemCorrelations(
    itemMatrix,
    scoringState.analysisScores,
    subjectCount,
    itemCount,
    itemNumbers,
    options.mode,
    scoringState.itemContributions,
  );
  const distractors = computeDistractors(
    exam,
    scoringState.responsesUpper,
    scoringState.correctMask,
    scoringState.blankMask,
    split,
  );
  const reliability = computeMcReliability(
    subjects,
    scoringState.correctMask,
    options.mode,
  );
  const verdicts = evaluateItemVerdicts(
    discrimination,
    difficulty,
    correlations,
    distractors,
  );
  const interpretations = {
    reliability_tt: interpretReliability(reliability.reliability_coefficient),
    cronbach_alpha: interpretReliability(reliability.cronbach_alpha),
    kr20: interpretReliability(reliability.kr20),
    kr21: interpretReliability(reliability.kr21),
  };
  const scoreDistribution = computeScoreDistributionSummary(
    scoringState.analysisScores,
    scoringState.scoringResult.mean,
    scoringState.scoringResult.std_dev,
    scoringState.scoringResult.ideal_max_score ?? null,
    options.passing_score,
  );
  const executiveSummary = computeExecutiveSummary(
    "multiple_choice",
    options,
    reliability,
    interpretations,
    verdicts,
    scoreDistribution,
  );
  const indicatorSummary = computeIndicatorSummary(
    exam.item_indicators,
    difficulty,
    discrimination,
    verdicts,
    options.mode,
  );

  return {
    kind: "multiple_choice",
    subject_count: subjectCount,
    item_count: itemCount,
    options,
    scoring: scoringState.scoringResult,
    upper_lower: split,
    discrimination,
    difficulty,
    correlations,
    distractors,
    reliability,
    warnings,
    verdicts,
    interpretations,
    executive_summary: executiveSummary,
    score_distribution: scoreDistribution,
    indicator_summary: indicatorSummary,
  };
}

export function analyzeEssay(
  exam: ExamPayload,
  options: AnalysisOptions,
): AnalysisResponse {
  const scoringState = scoreEssay(exam);
  const warnings = validateEssayExam(
    exam,
    scoringState.scoreMatrix,
    scoringState.idealScores,
    scoringState.itemNumbers,
  );
  const subjects = exam.essay_subjects ?? [];
  const subjectCount = subjects.length;
  const itemCount = scoringState.idealScores.length;

  const split = splitUpperLower(
    scoringState.sortedOrder,
    subjectCount,
    options.upper_lower_percent,
  );
  if (split.group_size === 0) {
    warnings.push({
      code: "insufficient_upper_lower_group",
      message: `Subject count ${subjectCount} yields group_size=0 at ${options.upper_lower_percent}%.`,
      subject_index: null,
      item_index: null,
    });
  }

  const essayUl = computeEssayUpperLower(
    scoringState.itemNumbers,
    scoringState.scoreMatrix,
    split,
    options.mode,
  );
  const discrimination = computeEssayDiscrimination(
    scoringState.idealScores,
    essayUl,
    split.group_size,
  );
  const scope =
    options.essay_difficulty_scope ??
    (options.mode === "legacy_anates" ? "upper_lower_2n" : "all_subjects");
  const difficulty = computeEssayDifficulty(
    scoringState.idealScores,
    scoringState.filledMatrix,
    essayUl,
    split.group_size,
    scope,
    options.mode,
  );
  const correlations = computeItemCorrelations(
    scoringState.filledMatrix,
    scoringState.totalScores,
    subjectCount,
    itemCount,
    scoringState.itemNumbers,
    options.mode,
  );
  const reliability = computeEssayReliability(
    subjects,
    scoringState.filledMatrix,
    options.mode,
  );
  const verdicts = evaluateItemVerdicts(discrimination, difficulty, correlations);
  const interpretations = {
    reliability_tt: interpretReliability(reliability.reliability_coefficient),
    cronbach_alpha: interpretReliability(reliability.cronbach_alpha),
    kr20: null,
    kr21: null,
  };
  const scoreDistribution = computeScoreDistributionSummary(
    scoringState.totalScores,
    scoringState.scoringResult.mean,
    scoringState.scoringResult.std_dev,
    scoringState.scoringResult.ideal_max_score ?? null,
    options.passing_score,
  );
  const executiveSummary = computeExecutiveSummary(
    "essay",
    options,
    reliability,
    interpretations,
    verdicts,
    scoreDistribution,
  );
  const indicatorSummary = computeIndicatorSummary(
    exam.item_indicators,
    difficulty,
    discrimination,
    verdicts,
    options.mode,
  );

  return {
    kind: "essay",
    subject_count: subjectCount,
    item_count: itemCount,
    options,
    scoring: scoringState.scoringResult,
    upper_lower: split,
    essay_upper_lower: essayUl,
    discrimination,
    difficulty,
    correlations,
    reliability,
    warnings,
    verdicts,
    interpretations,
    executive_summary: executiveSummary,
    score_distribution: scoreDistribution,
    indicator_summary: indicatorSummary,
  };
}

export function analyzeExam(
  exam: ExamPayload,
  options: AnalysisOptions,
): AnalysisResponse {
  if (exam.kind === "multiple_choice") {
    return analyzeMultipleChoice(exam, options);
  }
  return analyzeEssay(exam, options);
}
