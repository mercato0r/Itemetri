import numpy as np

from itemetri.domain.models import (
    AnalysisOptions,
    EssayAnalysis,
    EssayExam,
    EssayRecapItem,
    Exam,
    ExamAnalysis,
    MultipleChoiceAnalysis,
    MultipleChoiceExam,
    ValidationIssue,
)
from itemetri.engine.correlation import compute_item_correlations
from itemetri.engine.difficulty import compute_essay_difficulty, compute_mc_difficulty
from itemetri.engine.discrimination import (
    compute_essay_discrimination,
    compute_mc_discrimination,
)
from itemetri.engine.distractor import compute_distractors
from itemetri.engine.reliability import compute_essay_reliability, compute_mc_reliability
from itemetri.engine.scoring import (
    score_essay,
    score_multiple_choice,
    validate_essay_exam,
    validate_multiple_choice_exam,
)
from itemetri.engine.upper_lower import compute_essay_upper_lower, split_upper_lower
from itemetri.engine.verdict import evaluate_item_verdicts


def analyze_multiple_choice(
    exam: MultipleChoiceExam,
    options: AnalysisOptions | None = None,
) -> MultipleChoiceAnalysis:
    opts = options or AnalysisOptions()
    scoring, matrices = score_multiple_choice(exam, opts)
    warnings = list(validate_multiple_choice_exam(exam, matrices))

    split = split_upper_lower(
        matrices.sorted_order,
        exam.subject_count,
        opts.upper_lower_percent,
    )
    if split.group_size == 0:
        warnings.append(
            ValidationIssue(
                code="insufficient_upper_lower_group",
                message=(
                    f"Subject count {int(exam.subject_count)} yields group_size=0 "
                    f"at {opts.upper_lower_percent:g}%."
                ),
            )
        )

    discrimination = compute_mc_discrimination(matrices.correct_mask, split)
    difficulty = compute_mc_difficulty(matrices.correct_mask, opts.mode)
    item_numbers = tuple(range(1, len(exam.answer_key) + 1))
    correlations = compute_item_correlations(
        matrices.correct_mask.astype(np.float64),
        matrices.analysis_scores,
        exam.subject_count,
        exam.item_count,
        item_numbers,
        opts.mode,
        item_contributions=matrices.item_contributions,
    )
    distractors = compute_distractors(
        exam,
        matrices.responses_upper,
        matrices.correct_mask,
        matrices.blank_mask,
        split=split,
    )
    reliability = compute_mc_reliability(exam, matrices.correct_mask, opts.mode)
    verdicts = evaluate_item_verdicts(
        discrimination=discrimination,
        difficulty=difficulty,
        correlations=correlations,
        distractors=distractors,
    )

    return MultipleChoiceAnalysis(
        exam=exam,
        options=opts,
        scoring=scoring,
        upper_lower=split,
        discrimination=discrimination,
        difficulty=difficulty,
        correlations=correlations,
        distractors=distractors,
        reliability=reliability,
        warnings=tuple(warnings),
        verdicts=verdicts,
    )


def analyze_essay(
    exam: EssayExam,
    options: AnalysisOptions | None = None,
) -> EssayAnalysis:
    opts = options or AnalysisOptions()
    scoring, matrices = score_essay(exam)
    warnings = list(validate_essay_exam(exam, matrices))

    split = split_upper_lower(
        matrices.sorted_order,
        exam.subject_count,
        opts.upper_lower_percent,
    )
    if split.group_size == 0:
        warnings.append(
            ValidationIssue(
                code="insufficient_upper_lower_group",
                message=(
                    f"Subject count {int(exam.subject_count)} yields group_size=0 "
                    f"at {opts.upper_lower_percent:g}%."
                ),
            )
        )

    essay_ul = compute_essay_upper_lower(exam, matrices.score_matrix, split, opts.mode)
    discrimination = compute_essay_discrimination(exam, essay_ul, split.group_size)
    difficulty = compute_essay_difficulty(
        exam,
        matrices.filled_matrix,
        essay_ul,
        split.group_size,
        opts.resolved_essay_difficulty_scope(),
        opts.mode,
    )
    correlations = compute_item_correlations(
        matrices.filled_matrix,
        matrices.total_scores,
        exam.subject_count,
        exam.item_count,
        exam.item_numbers,
        opts.mode,
    )
    reliability = compute_essay_reliability(exam, matrices.filled_matrix, opts.mode)

    recap = tuple(
        EssayRecapItem(
            item_index=j,
            item_number=exam.item_numbers[j],
            t_value=essay_ul[j].t_value,
            discrimination_percent=discrimination[j].index_percent,
            difficulty_category=difficulty[j].category,
            correlation=correlations[j].correlation,
            significance=correlations[j].significance,
        )
        for j in range(len(exam.ideal_scores))
    )

    verdicts = evaluate_item_verdicts(
        discrimination=discrimination,
        difficulty=difficulty,
        correlations=correlations,
    )

    return EssayAnalysis(
        exam=exam,
        options=opts,
        scoring=scoring,
        upper_lower=split,
        essay_upper_lower=essay_ul,
        discrimination=discrimination,
        difficulty=difficulty,
        correlations=correlations,
        reliability=reliability,
        recap=recap,
        warnings=tuple(warnings),
        verdicts=verdicts,
    )


def analyze_exam(
    exam: Exam,
    options: AnalysisOptions | None = None,
) -> ExamAnalysis:
    if isinstance(exam, MultipleChoiceExam):
        return analyze_multiple_choice(exam, options)
    return analyze_essay(exam, options)
