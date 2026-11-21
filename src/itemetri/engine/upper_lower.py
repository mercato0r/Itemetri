import math

import numpy as np
from numpy.typing import NDArray
from scipy import stats

from anates.domain.enums import CompatibilityMode
from anates.domain.models import EssayExam, EssayItemUpperLower, UpperLowerSplit
from anates.domain.types import SubjectCount
from anates.engine.stats import banker_round_group_size, mean_and_std_dev


def split_upper_lower(
    sorted_order: NDArray[np.intp],
    subject_count: SubjectCount,
    percent: float,
) -> UpperLowerSplit:
    """Slice top n and bottom n subject row positions without negative-zero indexing."""
    total_n = int(subject_count)
    group_size = min(banker_round_group_size(subject_count, percent), total_n)
    upper = sorted_order[:group_size]
    lower = sorted_order[total_n - group_size : total_n]
    return UpperLowerSplit(
        group_size=group_size,
        upper_indices=tuple(int(i) for i in upper),
        lower_indices=tuple(int(i) for i in lower),
    )


def compute_essay_upper_lower(
    exam: EssayExam,
    score_matrix: NDArray[np.float64],
    split: UpperLowerSplit,
    mode: CompatibilityMode,
) -> tuple[EssayItemUpperLower, ...]:
    """Compute per-item upper/lower means, SDs, pooled SE, and Welch t statistics."""
    n = split.group_size
    m = len(exam.ideal_scores)
    if n == 0:
        return tuple(
            EssayItemUpperLower(
                item_index=j,
                item_number=exam.item_numbers[j],
                upper_mean=math.nan,
                lower_mean=math.nan,
                mean_diff=math.nan,
                upper_std=math.nan,
                lower_std=math.nan,
                upper_sum=0.0,
                lower_sum=0.0,
                upper_valid_count=0,
                lower_valid_count=0,
                se_pooled=math.nan,
                t_value=math.nan,
                p_value=None,
            )
            for j in range(m)
        )

    upper_idx = np.asarray(split.upper_indices, dtype=np.intp)
    lower_idx = np.asarray(split.lower_indices, dtype=np.intp)
    upper_block = score_matrix[upper_idx, :]
    lower_block = score_matrix[lower_idx, :]

    items: list[EssayItemUpperLower] = []
    for j in range(m):
        u_col = upper_block[:, j]
        l_col = lower_block[:, j]
        u_valid = u_col[~np.isnan(u_col)]
        l_valid = l_col[~np.isnan(l_col)]
        n_u = u_valid.shape[0]
        n_l = l_valid.shape[0]

        u_mean, u_std = mean_and_std_dev(u_valid)
        l_mean, l_std = mean_and_std_dev(l_valid)
        u_sum = float(np.sum(u_valid))
        l_sum = float(np.sum(l_valid))
        mean_diff = u_mean - l_mean

        if mode is CompatibilityMode.LEGACY_ANATES:
            # Anates Uraian excludes blanks from Mean/SD yet divides SE_gab by nominal n.
            denom_u = n
            denom_l = n
        else:
            denom_u = n_u
            denom_l = n_l

        if denom_u > 0 and denom_l > 0:
            se_pooled = math.sqrt((u_std * u_std) / denom_u + (l_std * l_std) / denom_l)
        else:
            se_pooled = math.nan

        t_value = (
            mean_diff / se_pooled
            if math.isfinite(se_pooled) and se_pooled > 0.0
            else math.nan
        )

        p_value: float | None = None
        if (
            mode is CompatibilityMode.STANDARD_CORRECTED
            and n_u > 1
            and n_l > 1
            and math.isfinite(t_value)
            and se_pooled > 0.0
        ):
            var_u = (u_std * u_std) / n_u
            var_l = (l_std * l_std) / n_l
            df_denom = (var_u * var_u) / (n_u - 1) + (var_l * var_l) / (n_l - 1)
            df_w = ((var_u + var_l) ** 2) / df_denom if df_denom > 0.0 else float(n_u + n_l - 2)
            p_value = float(2.0 * stats.t.sf(abs(t_value), df_w))

        items.append(
            EssayItemUpperLower(
                item_index=j,
                item_number=exam.item_numbers[j],
                upper_mean=u_mean,
                lower_mean=l_mean,
                mean_diff=mean_diff,
                upper_std=u_std,
                lower_std=l_std,
                upper_sum=u_sum,
                lower_sum=l_sum,
                upper_valid_count=n_u,
                lower_valid_count=n_l,
                se_pooled=se_pooled,
                t_value=t_value,
                p_value=p_value,
            )
        )
    return tuple(items)
