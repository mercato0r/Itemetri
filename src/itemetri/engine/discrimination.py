import math

import numpy as np
from numpy.typing import NDArray

from itemetri.domain.models import (
    DiscriminationItem,
    EssayExam,
    EssayItemUpperLower,
    UpperLowerSplit,
)


def compute_mc_discrimination(
    correct_mask: NDArray[np.bool_],
    split: UpperLowerSplit,
) -> tuple[DiscriminationItem, ...]:
    """Compute multiple-choice discrimination index DP = (B_a - B_b) / n * 100."""
    m = correct_mask.shape[1]
    n = split.group_size
    if n == 0:
        return tuple(
            DiscriminationItem(
                item_index=j,
                item_number=j + 1,
                upper_total=0.0,
                lower_total=0.0,
                difference=0.0,
                index_percent=math.nan,
            )
            for j in range(m)
        )

    upper_idx = np.asarray(split.upper_indices, dtype=np.intp)
    lower_idx = np.asarray(split.lower_indices, dtype=np.intp)
    ba = correct_mask[upper_idx, :].sum(axis=0, dtype=np.float64)
    bb = correct_mask[lower_idx, :].sum(axis=0, dtype=np.float64)
    diff = ba - bb
    dp = (diff / float(n)) * 100.0
    return tuple(
        DiscriminationItem(
            item_index=j,
            item_number=j + 1,
            upper_total=float(ba[j]),
            lower_total=float(bb[j]),
            difference=float(diff[j]),
            index_percent=float(dp[j]),
        )
        for j in range(m)
    )


def compute_essay_discrimination(
    exam: EssayExam,
    essay_ul: tuple[EssayItemUpperLower, ...],
    group_size: int,
) -> tuple[DiscriminationItem, ...]:
    """Compute essay discrimination index DP = (Sum_U - Sum_L) / (n * S_max) * 100."""
    items: list[DiscriminationItem] = []
    for item_ul in essay_ul:
        j = item_ul.item_index
        ideal = exam.ideal_scores[j]
        diff = item_ul.upper_sum - item_ul.lower_sum
        dp = (diff / (float(group_size) * ideal)) * 100.0 if group_size > 0 else math.nan
        items.append(
            DiscriminationItem(
                item_index=j,
                item_number=item_ul.item_number,
                upper_total=item_ul.upper_sum,
                lower_total=item_ul.lower_sum,
                difference=diff,
                index_percent=dp,
            )
        )
    return tuple(items)
