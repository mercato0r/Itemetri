import math

import numpy as np
from numpy.typing import NDArray

from itemetri.domain.enums import CompatibilityMode
from itemetri.domain.models import (
    EssayExam,
    MultipleChoiceExam,
    ReliabilityResult,
    ReliabilitySubjectRow,
)
from itemetri.engine.stats import pearson_1d


def _spearman_brown(r_xy: float, *, cast_float32: bool) -> float:
    if math.isnan(r_xy):
        return math.nan
    r = float(np.float32(r_xy)) if cast_float32 else r_xy
    denom = 1.0 + r
    if denom == 0.0:
        return math.nan
    return (2.0 * r) / denom


def compute_cronbach_alpha(item_matrix: NDArray[np.float64]) -> float:
    """Compute Cronbach's alpha over an (N, M) numeric item score matrix."""
    n, m = item_matrix.shape
    if n < 2 or m < 2:
        return math.nan
    totals = item_matrix.sum(axis=1)
    if float(np.ptp(totals)) == 0.0:
        return math.nan
    total_var = float(np.var(totals, ddof=1))
    if total_var <= 0.0:
        return math.nan
    item_var_sum = float(np.sum(np.var(item_matrix, axis=0, ddof=1)))
    return (float(m) / float(m - 1)) * (1.0 - item_var_sum / total_var)


def compute_kr20(correct_mask: NDArray[np.bool_]) -> float:
    """Compute Kuder-Richardson 20 reliability for dichotomous items."""
    n, m = correct_mask.shape
    if n < 2 or m < 2:
        return math.nan
    x = correct_mask.astype(np.float64)
    totals = x.sum(axis=1)
    if float(np.ptp(totals)) == 0.0:
        return math.nan
    total_var = float(np.var(totals, ddof=0))
    if total_var <= 0.0:
        return math.nan
    p = x.mean(axis=0)
    pq_sum = float(np.sum(p * (1.0 - p)))
    return (float(m) / float(m - 1)) * (1.0 - pq_sum / total_var)


def compute_kr21(correct_mask: NDArray[np.bool_]) -> float:
    """Compute Kuder-Richardson 21 reliability using population variance so KR-21 <= KR-20."""
    n, m = correct_mask.shape
    if n < 2 or m < 2:
        return math.nan
    x = correct_mask.astype(np.float64)
    totals = x.sum(axis=1)
    if float(np.ptp(totals)) == 0.0:
        return math.nan
    total_var = float(np.var(totals, ddof=0))
    if total_var <= 0.0:
        return math.nan
    mean_total = float(np.mean(totals))
    return (float(m) / float(m - 1)) * (
        1.0 - (mean_total * (float(m) - mean_total)) / (float(m) * total_var)
    )


def compute_alpha_if_deleted(item_matrix: NDArray[np.float64]) -> NDArray[np.float64]:
    """Compute Cronbach's alpha with each item j removed in O(N*M) vectorized time."""
    n, m = item_matrix.shape
    result = np.full(m, np.nan, dtype=np.float64)
    if n < 2 or m < 3:
        return result

    totals = item_matrix.sum(axis=1)
    item_ptp = np.ptp(item_matrix, axis=0)
    varying_cols = item_ptp > 0.0
    other_varying = (int(np.sum(varying_cols)) - varying_cols.astype(np.intp)) > 0

    item_vars = np.where(varying_cols, np.var(item_matrix, axis=0, ddof=1), 0.0)
    rem_item_vars = float(np.sum(item_vars)) - item_vars
    rest_totals = totals[:, None] - item_matrix
    rest_ptp = np.ptp(rest_totals, axis=0)
    rest_vars = np.var(rest_totals, axis=0, ddof=1)
    ptp_floor = 1e-12 * float(np.max(np.abs(totals)))
    valid = other_varying & (rest_ptp > ptp_floor) & (rest_vars > 0.0)
    if np.any(valid):
        result[valid] = (float(m - 1) / float(m - 2)) * (
            1.0 - rem_item_vars[valid] / rest_vars[valid]
        )
    return result


def interpret_reliability(value: float | None) -> str:
    """Map a reliability coefficient to Indonesian qualitative bands."""
    if value is None or math.isnan(value):
        return "Tidak terdefinisi"
    if value >= 0.80:
        return "Sangat Tinggi"
    if value >= 0.60:
        return "Tinggi"
    if value >= 0.40:
        return "Cukup"
    if value >= 0.20:
        return "Rendah"
    return "Sangat Rendah"


def compute_mc_reliability(
    exam: MultipleChoiceExam,
    correct_mask: NDArray[np.bool_],
    mode: CompatibilityMode,
) -> ReliabilityResult:
    """Compute split-half Spearman-Brown, Cronbach's alpha, and KR-20 for MC."""
    n, m = correct_mask.shape
    if mode is CompatibilityMode.LEGACY_ANATES:
        # Replicate AnatesV4.exe 0x4b57d9: reads pChar[i-1], skips item M, swaps odd/even.
        if m > 1:
            odd_scores = correct_mask[:, 1 : m - 1 : 2].sum(axis=1, dtype=np.float64)
            even_scores = correct_mask[:, 0 : m - 1 : 2].sum(axis=1, dtype=np.float64)
        else:
            odd_scores = np.zeros(n, dtype=np.float64)
            even_scores = np.zeros(n, dtype=np.float64)
        method = "split_half_spearman_brown_legacy_0x4b57d9"
        cast_f32 = True
    else:
        odd_scores = correct_mask[:, 0::2].sum(axis=1, dtype=np.float64)
        even_scores = correct_mask[:, 1::2].sum(axis=1, dtype=np.float64)
        method = "split_half_spearman_brown"
        cast_f32 = False

    r_xy = pearson_1d(odd_scores, even_scores)
    r_tt = _spearman_brown(r_xy, cast_float32=cast_f32)
    alpha = compute_cronbach_alpha(correct_mask.astype(np.float64))
    kr20 = compute_kr20(correct_mask)
    kr21 = compute_kr21(correct_mask)
    rows = tuple(
        ReliabilitySubjectRow(
            original_index=subj.original_index,
            name=subj.name,
            odd_score=float(odd_scores[idx]),
            even_score=float(even_scores[idx]),
            split_total=float(odd_scores[idx] + even_scores[idx]),
        )
        for idx, subj in enumerate(exam.subjects)
    )
    return ReliabilityResult(
        correlation_xy=r_xy,
        reliability_coefficient=r_tt,
        method=method,
        rows=rows,
        cronbach_alpha=alpha,
        kr20=kr20,
        kr21=kr21,
    )


def compute_essay_reliability(
    exam: EssayExam,
    filled_matrix: NDArray[np.float64],
    mode: CompatibilityMode,
) -> ReliabilityResult:
    """Compute split-half odd/even Spearman-Brown and Cronbach's alpha for essay exams."""
    odd_scores = filled_matrix[:, 0::2].sum(axis=1)
    even_scores = filled_matrix[:, 1::2].sum(axis=1)
    r_xy = pearson_1d(odd_scores, even_scores)
    cast_f32 = mode is CompatibilityMode.LEGACY_ANATES
    r_tt = _spearman_brown(r_xy, cast_float32=cast_f32)
    alpha = compute_cronbach_alpha(filled_matrix)
    method = (
        "split_half_spearman_brown_float32"
        if cast_f32
        else "split_half_spearman_brown"
    )
    rows = tuple(
        ReliabilitySubjectRow(
            original_index=subj.original_index,
            name=subj.name,
            odd_score=float(odd_scores[idx]),
            even_score=float(even_scores[idx]),
            split_total=float(odd_scores[idx] + even_scores[idx]),
        )
        for idx, subj in enumerate(exam.subjects)
    )
    return ReliabilityResult(
        correlation_xy=r_xy,
        reliability_coefficient=r_tt,
        method=method,
        rows=rows,
        cronbach_alpha=alpha,
        kr20=None,
        kr21=None,
    )
