import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from itemetri.domain.enums import CompatibilityMode
from itemetri.domain.models import (
    AnalysisOptions,
    EssayExam,
    EssayScoringResult,
    EssaySubjectScore,
    MultipleChoiceExam,
    MultipleChoiceScoringResult,
    MultipleChoiceSubjectScore,
    ValidationIssue,
)
from itemetri.engine.stats import mean_and_std_dev

_ASTERISK = ord("*")
_HASH = ord("#")


def _score_summary(values: NDArray[np.float64]) -> tuple[float, float, float]:
    if values.size == 0:
        return (math.nan, math.nan, math.nan)
    return (float(np.min(values)), float(np.max(values)), float(np.median(values)))


@dataclass(slots=True)
class McMatrices:
    responses_upper: NDArray[np.uint8] | NDArray[np.uint32]
    key_upper: NDArray[np.uint8] | NDArray[np.uint32]
    correct_mask: NDArray[np.bool_]
    blank_mask: NDArray[np.bool_]
    analysis_scores: NDArray[np.float64]
    item_contributions: NDArray[np.float64]
    sorted_order: NDArray[np.intp]


@dataclass(slots=True)
class EssayMatrices:
    score_matrix: NDArray[np.float64]
    filled_matrix: NDArray[np.float64]
    ideal_scores: NDArray[np.float64]
    total_scores: NDArray[np.float64]
    sorted_order: NDArray[np.intp]


def _encode_upper_chars(
    rows: list[str],
    key: str,
) -> tuple[NDArray[np.uint8] | NDArray[np.uint32], NDArray[np.uint8] | NDArray[np.uint32]]:
    n = len(rows)
    m = len(key)
    key_upper = key.upper()
    rows_upper = [row.upper() for row in rows]
    if key_upper.isascii() and all(row.isascii() for row in rows_upper):
        resp_arr = np.frombuffer("".join(rows_upper).encode("ascii"), dtype=np.uint8).reshape(n, m)
        key_arr = np.frombuffer(key_upper.encode("ascii"), dtype=np.uint8)
        return resp_arr, key_arr

    resp_u = np.array([list(row) for row in rows_upper], dtype="<U1").view(np.uint32)
    key_u = np.array(list(key_upper), dtype="<U1").view(np.uint32)
    return resp_u, key_u


def validate_multiple_choice_exam(
    exam: MultipleChoiceExam,
    matrices: McMatrices | None = None,
) -> tuple[ValidationIssue, ...]:
    """Collect non-fatal warnings for response or key characters outside 1..JumPilihan."""
    issues: list[ValidationIssue] = []
    max_ord = ord("A") + int(exam.option_count) - 1
    max_char = chr(max_ord)
    for item_idx, ch in enumerate(exam.answer_key.upper()):
        if not ("A" <= ch <= max_char):
            issues.append(
                ValidationIssue(
                    code="key_out_of_range",
                    message=(
                        f"Answer key item {item_idx + 1} has option {ch!r} "
                        f"outside A..{max_char}."
                    ),
                    item_index=item_idx,
                )
            )

    if matrices is None:
        resp_arr, _ = _encode_upper_chars(
            [s.responses for s in exam.subjects],
            exam.answer_key,
        )
    else:
        resp_arr = matrices.responses_upper

    invalid_mask = (
        (resp_arr != _ASTERISK)
        & (resp_arr != _HASH)
        & ((resp_arr < ord("A")) | (resp_arr > max_ord))
    )
    if np.any(invalid_mask):
        coords = np.argwhere(invalid_mask)
        for row_idx, col_idx in coords:
            subj = exam.subjects[int(row_idx)]
            ch = subj.responses[int(col_idx)]
            issues.append(
                ValidationIssue(
                    code="response_out_of_range",
                    message=(
                        f"Subject {subj.name!r} item {int(col_idx) + 1} has {ch!r} "
                        f"outside A..{max_char} or blank (*, #)."
                    ),
                    subject_index=subj.original_index,
                    item_index=int(col_idx),
                )
            )
    return tuple(issues)


def validate_essay_exam(
    exam: EssayExam,
    matrices: EssayMatrices | None = None,
) -> tuple[ValidationIssue, ...]:
    """Collect non-fatal warnings when subject item scores exceed ideal_scores."""
    issues: list[ValidationIssue] = []
    if matrices is None:
        score_matrix = np.array(
            [
                [np.nan if val is None else float(val) for val in subj.scores]
                for subj in exam.subjects
            ],
            dtype=np.float64,
        )
        ideal_arr = np.asarray(exam.ideal_scores, dtype=np.float64)
    else:
        score_matrix = matrices.score_matrix
        ideal_arr = matrices.ideal_scores

    exceed_mask = score_matrix > ideal_arr[None, :]
    if np.any(exceed_mask):
        for row_idx, col_idx in np.argwhere(exceed_mask):
            subj = exam.subjects[int(row_idx)]
            val = float(score_matrix[int(row_idx), int(col_idx)])
            ideal = float(ideal_arr[int(col_idx)])
            item_no = exam.item_numbers[int(col_idx)]
            issues.append(
                ValidationIssue(
                    code="score_exceeds_ideal",
                    message=(
                        f"Subject {subj.name!r} item #{item_no} score {val:g} "
                        f"exceeds ideal score {ideal:g}."
                    ),
                    subject_index=subj.original_index,
                    item_index=int(col_idx),
                )
            )
    return tuple(issues)


def score_multiple_choice(
    exam: MultipleChoiceExam,
    options: AnalysisOptions,
) -> tuple[MultipleChoiceScoringResult, McMatrices]:
    """Score multiple-choice subjects and sort descending by active score then UrutanAwal."""
    n = len(exam.subjects)
    m = len(exam.answer_key)
    resp_arr, key_arr = _encode_upper_chars(
        [s.responses for s in exam.subjects],
        exam.answer_key,
    )

    correct_mask = resp_arr == key_arr[None, :]
    blank_mask = (~correct_mask) & ((resp_arr == _ASTERISK) | (resp_arr == _HASH))
    wrong_mask = (~correct_mask) & (~blank_mask)

    pattern_bytes_arr = np.full((n, m), ord("-"), dtype=np.uint8)
    pattern_bytes_arr[correct_mask] = ord("1")
    pattern_bytes_arr[blank_mask] = _ASTERISK
    raw_pattern = pattern_bytes_arr.tobytes()

    correct_counts = correct_mask.sum(axis=1)
    wrong_counts = wrong_mask.sum(axis=1)
    blank_counts = blank_mask.sum(axis=1)

    raw_scores = correct_counts.astype(np.float64)
    weighted_scores = (
        exam.weights.correct * raw_scores
        + exam.weights.wrong * wrong_counts.astype(np.float64)
    )

    uses_weighted = (
        options.mode is CompatibilityMode.STANDARD_CORRECTED and options.use_weighted_score
    )
    analysis_scores = weighted_scores if uses_weighted else raw_scores
    if uses_weighted:
        item_contributions = np.zeros((n, m), dtype=np.float64)
        item_contributions[correct_mask] = exam.weights.correct
        item_contributions[wrong_mask] = exam.weights.wrong
    else:
        item_contributions = correct_mask.astype(np.float64)
    mean, std_dev = mean_and_std_dev(analysis_scores)
    min_score, max_score, median_score = _score_summary(analysis_scores)
    ideal_max_score = float(exam.weights.correct * m) if uses_weighted else float(m)

    orig_indices = np.array([s.original_index for s in exam.subjects], dtype=np.intp)
    sorted_order = np.lexsort((orig_indices, -analysis_scores))

    subject_scores = tuple(
        MultipleChoiceSubjectScore(
            original_index=subj.original_index,
            name=subj.name,
            score_pattern=raw_pattern[idx * m : (idx + 1) * m].decode("ascii"),
            correct_count=int(correct_counts[idx]),
            wrong_count=int(wrong_counts[idx]),
            blank_count=int(blank_counts[idx]),
            raw_score=float(raw_scores[idx]),
            weighted_score=float(weighted_scores[idx]),
        )
        for idx, subj in enumerate(exam.subjects)
    )

    matrices = McMatrices(
        responses_upper=resp_arr,
        key_upper=key_arr,
        correct_mask=correct_mask,
        blank_mask=blank_mask,
        analysis_scores=analysis_scores,
        item_contributions=item_contributions,
        sorted_order=sorted_order,
    )
    result = MultipleChoiceScoringResult(
        subjects=subject_scores,
        sorted_order=tuple(int(i) for i in sorted_order),
        mean=mean,
        std_dev=std_dev,
        uses_weighted_score=uses_weighted,
        min_score=min_score,
        max_score=max_score,
        median_score=median_score,
        ideal_max_score=ideal_max_score,
    )
    return result, matrices


def score_essay(exam: EssayExam) -> tuple[EssayScoringResult, EssayMatrices]:
    """Score essay subjects, treating None blanks as 0 in totals while preserving NaN."""
    m = len(exam.ideal_scores)
    score_matrix = np.array(
        [
            [np.nan if val is None else float(val) for val in subj.scores]
            for subj in exam.subjects
        ],
        dtype=np.float64,
    )
    blank_mask = np.isnan(score_matrix)
    filled_matrix = np.where(blank_mask, 0.0, score_matrix)
    ideal_arr = np.asarray(exam.ideal_scores, dtype=np.float64)

    total_scores = filled_matrix.sum(axis=1)
    blank_counts = blank_mask.sum(axis=1)
    mean, std_dev = mean_and_std_dev(total_scores)
    min_score, max_score, median_score = _score_summary(total_scores)
    ideal_max_score = float(np.sum(ideal_arr))

    observed_max = np.zeros(m, dtype=np.float64)
    observed_min = np.zeros(m, dtype=np.float64)
    has_valid = ~np.all(blank_mask, axis=0)
    if np.any(has_valid):
        observed_max[has_valid] = np.max(
            np.where(blank_mask[:, has_valid], -np.inf, score_matrix[:, has_valid]),
            axis=0,
        )
        observed_min[has_valid] = np.min(
            np.where(blank_mask[:, has_valid], np.inf, score_matrix[:, has_valid]),
            axis=0,
        )

    orig_indices = np.array([s.original_index for s in exam.subjects], dtype=np.intp)
    sorted_order = np.lexsort((orig_indices, -total_scores))

    subject_scores = tuple(
        EssaySubjectScore(
            original_index=subj.original_index,
            name=subj.name,
            scores=subj.scores,
            blank_count=int(blank_counts[idx]),
            total_score=float(total_scores[idx]),
        )
        for idx, subj in enumerate(exam.subjects)
    )

    matrices = EssayMatrices(
        score_matrix=score_matrix,
        filled_matrix=filled_matrix,
        ideal_scores=ideal_arr,
        total_scores=total_scores,
        sorted_order=sorted_order,
    )
    result = EssayScoringResult(
        subjects=subject_scores,
        sorted_order=tuple(int(i) for i in sorted_order),
        mean=mean,
        std_dev=std_dev,
        observed_max=tuple(float(v) for v in observed_max),
        observed_min=tuple(float(v) for v in observed_min),
        min_score=min_score,
        max_score=max_score,
        median_score=median_score,
        ideal_max_score=ideal_max_score,
    )
    return result, matrices
