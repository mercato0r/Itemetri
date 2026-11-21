import math

import numpy as np
from numpy.typing import NDArray
from scipy import stats

from anates.domain.enums import CompatibilityMode, SignificanceLevel
from anates.domain.models import CorrelationItem
from anates.domain.types import (
    DegreesOfFreedom,
    ItemCount,
    SubjectCount,
    correlation_degrees_of_freedom,
)
from anates.engine.reliability import compute_alpha_if_deleted
from anates.engine.stats import pearson_matrix_vector

# Critical Pearson r cutoffs from AnatesV4.exe 0x4b314c and Anates Uraian.exe 0x4dfefc.
LEGACY_CORRELATION_TABLE: tuple[tuple[int, float, float], ...] = (
    (10, 0.576, 0.708),
    (15, 0.482, 0.606),
    (20, 0.423, 0.549),
    (25, 0.381, 0.496),
    (30, 0.349, 0.449),
    (40, 0.304, 0.393),
    (50, 0.273, 0.354),
    (60, 0.250, 0.325),
    (70, 0.233, 0.302),
    (80, 0.217, 0.283),
    (90, 0.205, 0.267),
    (100, 0.195, 0.254),
    (125, 0.174, 0.228),
    (150, 0.159, 0.208),
)


def lookup_legacy_significance(
    r: float,
    item_count: ItemCount,
) -> SignificanceLevel:
    """Match ANATES legacy table lookup using JumButir instead of N - 2."""
    if math.isnan(r):
        return SignificanceLevel.NAN
    ref = int(item_count)
    row = next(
        (entry for entry in LEGACY_CORRELATION_TABLE if entry[0] >= ref),
        LEGACY_CORRELATION_TABLE[-1],
    )
    if r >= row[2]:
        return SignificanceLevel.HIGHLY_SIGNIFICANT
    if r >= row[1]:
        return SignificanceLevel.SIGNIFICANT
    return SignificanceLevel.NOT_SIGNIFICANT


def evaluate_corrected_significance(
    r: float,
    df: DegreesOfFreedom,
) -> tuple[float, SignificanceLevel]:
    """Compute exact two-tailed p-value via Student t(df=N-2) for positive item correlation."""
    if math.isnan(r):
        return (math.nan, SignificanceLevel.NAN)
    df_int = int(df)
    if df_int <= 0:
        return (math.nan, SignificanceLevel.NOT_SIGNIFICANT)

    if abs(r) >= 1.0:
        p_value = 0.0
    else:
        t_stat = abs(r) * math.sqrt(float(df_int) / (1.0 - r * r))
        p_value = float(2.0 * stats.t.sf(t_stat, df_int))

    if r > 0.0 and p_value <= 0.01:
        return (p_value, SignificanceLevel.HIGHLY_SIGNIFICANT)
    if r > 0.0 and p_value <= 0.05:
        return (p_value, SignificanceLevel.SIGNIFICANT)
    return (p_value, SignificanceLevel.NOT_SIGNIFICANT)


def compute_corrected_item_totals(
    item_scores: NDArray[np.float64],
    total_scores: NDArray[np.float64],
    item_contributions: NDArray[np.float64] | None = None,
) -> NDArray[np.float64]:
    """Compute item-rest Pearson correlations without part-whole contamination."""
    n, m = item_scores.shape
    result = np.full(m, np.nan, dtype=np.float64)
    if n < 2 or m < 2:
        return result

    contrib = item_scores if item_contributions is None else item_contributions
    rest = total_scores[:, None] - contrib

    xc = item_scores - item_scores.mean(axis=0)
    yc = rest - rest.mean(axis=0)

    const_x = np.ptp(item_scores, axis=0) == 0.0
    rest_ptp = np.ptp(rest, axis=0)
    const_rest = rest_ptp == 0.0
    if np.allclose(total_scores, contrib.sum(axis=1), rtol=1e-12, atol=1e-15):
        contrib_varying = np.ptp(contrib, axis=0) > 0.0
        other_varying = (int(np.sum(contrib_varying)) - contrib_varying.astype(np.intp)) > 0
        ptp_floor = 1e-12 * float(np.max(np.abs(total_scores)))
        const_rest = const_rest | (~other_varying) | (rest_ptp <= ptp_floor)

    denom = np.sum(xc * xc, axis=0) * np.sum(yc * yc, axis=0)
    valid = (~const_x) & (~const_rest) & (denom > 0.0)
    if not np.any(valid):
        return result

    num = np.sum(xc[:, valid] * yc[:, valid], axis=0)
    result[valid] = np.clip(num / np.sqrt(denom[valid]), -1.0, 1.0)
    return result


def _evaluate_significance(
    r: float,
    item_count: ItemCount,
    df: DegreesOfFreedom,
    mode: CompatibilityMode,
) -> tuple[float | None, SignificanceLevel]:
    if mode is CompatibilityMode.LEGACY_ANATES:
        return (None, lookup_legacy_significance(r, item_count))
    p_raw, sig = evaluate_corrected_significance(r, df)
    return (p_raw, sig)


def compute_item_correlations(
    item_scores: NDArray[np.float64],
    total_scores: NDArray[np.float64],
    subject_count: SubjectCount,
    item_count: ItemCount,
    item_numbers: tuple[int, ...],
    mode: CompatibilityMode,
    *,
    item_contributions: NDArray[np.float64] | None = None,
    alpha_item_matrix: NDArray[np.float64] | None = None,
) -> tuple[CorrelationItem, ...]:
    """Compute part-whole and corrected item-total correlations plus alpha-if-deleted."""
    r_values = pearson_matrix_vector(item_scores, total_scores)
    r_corrected_values = compute_corrected_item_totals(
        item_scores,
        total_scores,
        item_contributions=item_contributions,
    )
    alpha_del_values = compute_alpha_if_deleted(
        item_scores if alpha_item_matrix is None else alpha_item_matrix
    )
    df = correlation_degrees_of_freedom(subject_count)
    items: list[CorrelationItem] = []

    for j in range(int(item_count)):
        r = float(r_values[j])
        r_corr = float(r_corrected_values[j])
        p_val, sig = _evaluate_significance(r, item_count, df, mode)
        p_corr, sig_corr = _evaluate_significance(r_corr, item_count, df, mode)
        items.append(
            CorrelationItem(
                item_index=j,
                item_number=item_numbers[j],
                correlation=r,
                p_value=p_val,
                significance=sig,
                corrected_correlation=r_corr,
                corrected_p_value=p_corr,
                corrected_significance=sig_corr,
                alpha_if_deleted=float(alpha_del_values[j]),
            )
        )
    return tuple(items)
