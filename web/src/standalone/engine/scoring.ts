import type {
  AnalysisOptions,
  EssaySubjectScore,
  ExamPayload,
  MultipleChoiceSubjectScore,
  ValidationIssue,
} from "../../types";
import { meanAndStdDev, minMaxMedian, sanitizeNum } from "./math";

export interface McScoringState {
  responsesUpper: string[];
  keyUpper: string;
  correctMask: boolean[][];
  blankMask: boolean[][];
  analysisScores: number[];
  itemContributions: number[][];
  sortedOrder: number[];
  scoringResult: {
    subjects: MultipleChoiceSubjectScore[];
    sorted_order: number[];
    mean: number | null;
    std_dev: number | null;
    uses_weighted_score: boolean;
    min_score: number | null;
    max_score: number | null;
    median_score: number | null;
    ideal_max_score: number | null;
  };
}

export interface EssayScoringState {
  scoreMatrix: number[][];
  filledMatrix: number[][];
  idealScores: number[];
  itemNumbers: number[];
  totalScores: number[];
  sortedOrder: number[];
  scoringResult: {
    subjects: EssaySubjectScore[];
    sorted_order: number[];
    mean: number | null;
    std_dev: number | null;
    observed_max: number[];
    observed_min: number[];
    min_score: number | null;
    max_score: number | null;
    median_score: number | null;
    ideal_max_score: number | null;
  };
}

export function validateMultipleChoiceExam(
  exam: ExamPayload,
  responsesUpper: string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const optCount = exam.option_count ?? 4;
  const maxCode = "A".charCodeAt(0) + optCount - 1;
  const maxChar = String.fromCharCode(maxCode);
  const keyUpper = (exam.answer_key ?? "").toUpperCase();
  const subjects = exam.mc_subjects ?? [];

  for (let j = 0; j < keyUpper.length; j++) {
    const ch = keyUpper[j]!;
    const code = ch.charCodeAt(0);
    if (code < 65 || code > maxCode) {
      issues.push({
        code: "key_out_of_range",
        message: `Answer key item ${j + 1} has option '${ch}' outside A..${maxChar}.`,
        subject_index: null,
        item_index: j,
      });
    }
  }

  for (let i = 0; i < subjects.length; i++) {
    const subj = subjects[i]!;
    const row = responsesUpper[i]!;
    for (let j = 0; j < row.length; j++) {
      const ch = row[j]!;
      if (ch === "*" || ch === "#") continue;
      const code = ch.charCodeAt(0);
      if (code < 65 || code > maxCode) {
        issues.push({
          code: "response_out_of_range",
          message: `Subject '${subj.name}' item ${j + 1} has '${subj.responses[j]}' outside A..${maxChar} or blank (*, #).`,
          subject_index: subj.original_index,
          item_index: j,
        });
      }
    }
  }
  return issues;
}

export function validateEssayExam(
  exam: ExamPayload,
  scoreMatrix: number[][],
  idealScores: number[],
  itemNumbers: number[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const subjects = exam.essay_subjects ?? [];
  for (let i = 0; i < subjects.length; i++) {
    const subj = subjects[i]!;
    const row = scoreMatrix[i]!;
    for (let j = 0; j < idealScores.length; j++) {
      const val = row[j]!;
      const ideal = idealScores[j]!;
      if (!Number.isNaN(val) && val > ideal) {
        issues.push({
          code: "score_exceeds_ideal",
          message: `Subject '${subj.name}' item #${itemNumbers[j]} score ${val} exceeds ideal score ${ideal}.`,
          subject_index: subj.original_index,
          item_index: j,
        });
      }
    }
  }
  return issues;
}

export function scoreMultipleChoice(
  exam: ExamPayload,
  options: AnalysisOptions,
): McScoringState {
  const subjects = exam.mc_subjects ?? [];
  const keyUpper = (exam.answer_key ?? "").toUpperCase();
  const n = subjects.length;
  const m = keyUpper.length;
  const weights = exam.weights ?? { correct: 1.0, wrong: 0.0 };
  const usesWeighted =
    options.mode === "standard_corrected" && Boolean(options.use_weighted_score);

  const responsesUpper = subjects.map((s) => s.responses.toUpperCase());
  const correctMask: boolean[][] = [];
  const blankMask: boolean[][] = [];
  const analysisScores: number[] = [];
  const itemContributions: number[][] = [];
  const subjectScores: MultipleChoiceSubjectScore[] = [];

  for (let i = 0; i < n; i++) {
    const subj = subjects[i]!;
    const row = responsesUpper[i]!;
    const cRow = new Array<boolean>(m);
    const bRow = new Array<boolean>(m);
    const contribRow = new Array<number>(m);
    let pattern = "";
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;

    for (let j = 0; j < m; j++) {
      const ch = row[j] ?? "*";
      const isCorrect = ch === keyUpper[j];
      const isBlank = !isCorrect && (ch === "*" || ch === "#");
      cRow[j] = isCorrect;
      bRow[j] = isBlank;
      if (isCorrect) {
        correctCount++;
        pattern += "1";
        contribRow[j] = usesWeighted ? weights.correct : 1.0;
      } else if (isBlank) {
        blankCount++;
        pattern += "*";
        contribRow[j] = 0.0;
      } else {
        wrongCount++;
        pattern += "-";
        contribRow[j] = usesWeighted ? weights.wrong : 0.0;
      }
    }

    const rawScore = correctCount;
    const weightedScore = weights.correct * rawScore + weights.wrong * wrongCount;
    const activeScore = usesWeighted ? weightedScore : rawScore;

    correctMask.push(cRow);
    blankMask.push(bRow);
    itemContributions.push(contribRow);
    analysisScores.push(activeScore);
    subjectScores.push({
      original_index: subj.original_index,
      name: subj.name,
      score_pattern: pattern,
      correct_count: correctCount,
      wrong_count: wrongCount,
      blank_count: blankCount,
      raw_score: rawScore,
      weighted_score: weightedScore,
    });
  }

  const [mean, stdDev] = meanAndStdDev(analysisScores);
  const [minScore, maxScore, medianScore] = minMaxMedian(analysisScores);
  const idealMaxScore = usesWeighted ? weights.correct * m : m;

  const sortedOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const diff = analysisScores[b]! - analysisScores[a]!;
    if (diff !== 0) return diff;
    return subjects[a]!.original_index - subjects[b]!.original_index;
  });

  return {
    responsesUpper,
    keyUpper,
    correctMask,
    blankMask,
    analysisScores,
    itemContributions,
    sortedOrder,
    scoringResult: {
      subjects: subjectScores,
      sorted_order: sortedOrder,
      mean: sanitizeNum(mean),
      std_dev: sanitizeNum(stdDev),
      uses_weighted_score: usesWeighted,
      min_score: sanitizeNum(minScore),
      max_score: sanitizeNum(maxScore),
      median_score: sanitizeNum(medianScore),
      ideal_max_score: sanitizeNum(idealMaxScore),
    },
  };
}

export function scoreEssay(exam: ExamPayload): EssayScoringState {
  const subjects = exam.essay_subjects ?? [];
  const idealScores = exam.ideal_scores ?? [];
  const m = idealScores.length;
  const itemNumbers =
    exam.item_numbers && exam.item_numbers.length === m
      ? exam.item_numbers
      : Array.from({ length: m }, (_, i) => i + 1);
  const n = subjects.length;

  const scoreMatrix: number[][] = [];
  const filledMatrix: number[][] = [];
  const totalScores: number[] = [];
  const subjectScores: EssaySubjectScore[] = [];

  for (let i = 0; i < n; i++) {
    const subj = subjects[i]!;
    const sRow = new Array<number>(m);
    const fRow = new Array<number>(m);
    let total = 0;
    let blankCount = 0;

    for (let j = 0; j < m; j++) {
      const val = subj.scores[j];
      if (val === null || val === undefined || Number.isNaN(val)) {
        sRow[j] = Number.NaN;
        fRow[j] = 0.0;
        blankCount++;
      } else {
        sRow[j] = val;
        fRow[j] = val;
        total += val;
      }
    }
    scoreMatrix.push(sRow);
    filledMatrix.push(fRow);
    totalScores.push(total);
    subjectScores.push({
      original_index: subj.original_index,
      name: subj.name,
      scores: subj.scores,
      blank_count: blankCount,
      total_score: total,
    });
  }

  const [mean, stdDev] = meanAndStdDev(totalScores);
  const [minScore, maxScore, medianScore] = minMaxMedian(totalScores);
  const idealMaxScore = idealScores.reduce((acc, v) => acc + v, 0);

  const observedMax = new Array<number>(m).fill(0);
  const observedMin = new Array<number>(m).fill(0);
  for (let j = 0; j < m; j++) {
    let hasValid = false;
    let colMax = -Infinity;
    let colMin = Infinity;
    for (let i = 0; i < n; i++) {
      const v = scoreMatrix[i]![j]!;
      if (!Number.isNaN(v)) {
        hasValid = true;
        if (v > colMax) colMax = v;
        if (v < colMin) colMin = v;
      }
    }
    if (hasValid) {
      observedMax[j] = colMax;
      observedMin[j] = colMin;
    }
  }

  const sortedOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const diff = totalScores[b]! - totalScores[a]!;
    if (diff !== 0) return diff;
    return subjects[a]!.original_index - subjects[b]!.original_index;
  });

  return {
    scoreMatrix,
    filledMatrix,
    idealScores,
    itemNumbers,
    totalScores,
    sortedOrder,
    scoringResult: {
      subjects: subjectScores,
      sorted_order: sortedOrder,
      mean: sanitizeNum(mean),
      std_dev: sanitizeNum(stdDev),
      observed_max: observedMax,
      observed_min: observedMin,
      min_score: sanitizeNum(minScore),
      max_score: sanitizeNum(maxScore),
      median_score: sanitizeNum(medianScore),
      ideal_max_score: sanitizeNum(idealMaxScore),
    },
  };
}
