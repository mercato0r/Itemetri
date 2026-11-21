import math

import numpy as np
from numpy.typing import NDArray

from anates.domain.enums import (
    CompatibilityMode,
    DifficultyCategory,
    EssayDifficultyScope,
)
from anates.domain.models import DifficultyItem, EssayExam, EssayItemUpperLower


def classify_difficulty(
    tk_percent: float,
    mode: CompatibilityMode,
) -> DifficultyCategory | None:
    """Map difficulty percentage to category, keeping Delphi (30,31] and (70,71] gaps in legacy."""
    if mode is CompatibilityMode.LEGACY_ANATES:
        if 0.0 <= tk_percent <= 15.0:
            return DifficultyCategory.VERY_HARD
        if 15.0 < tk_percent <= 30.0:
            return DifficultyCategory.HARD
        if 31.0 < tk_percent <= 70.0:
            return DifficultyCategory.MEDIUM
        if 71.0 < tk_percent <= 85.0:
            return DifficultyCategory.EASY
        return DifficultyCategory.VERY_EASY

    if math.isnan(tk_percent):
        return None
    if tk_percent <= 15.0:
        return DifficultyCategory.VERY_HARD
    if tk_percent <= 30.0:
        return DifficultyCategory.HARD
    if tk_percent <= 70.0:
        return DifficultyCategory.MEDIUM
    if tk_percent <= 85.0:
        return DifficultyCategory.EASY
    return DifficultyCategory.VERY_EASY


def compute_mc_difficulty(
    correct_mask: NDArray[np.bool_],
    mode: CompatibilityMode,
) -> tuple[DifficultyItem, ...]:
    """Compute multiple-choice difficulty index TK = (J_j / N) * 100."""
    n, m = correct_mask.shape
    correct_counts = correct_mask.sum(axis=0, dtype=np.float64)
    tk_values = (correct_counts / float(n)) * 100.0
    return tuple(
        DifficultyItem(
            item_index=j,
            item_number=j + 1,
            numerator=float(correct_counts[j]),
            denominator=float(n),
            index_percent=float(tk_values[j]),
            category=classify_difficulty(float(tk_values[j]), mode),
        )
        for j in range(m)
    )


def compute_essay_difficulty(
    exam: EssayExam,
    filled_matrix: NDArray[np.float64],
    essay_ul: tuple[EssayItemUpperLower, ...],
    group_size: int,
    scope: EssayDifficultyScope,
    mode: CompatibilityMode,
) -> tuple[DifficultyItem, ...]:
    """Compute essay difficulty index over either 2n (legacy) or all N subjects."""
    n = filled_matrix.shape[0]
    if scope is EssayDifficultyScope.ALL_SUBJECTS:
        col_sums = filled_matrix.sum(axis=0)
        return tuple(
            DifficultyItem(
                item_index=j,
                item_number=exam.item_numbers[j],
                numerator=float(col_sums[j]),
                denominator=float(n) * exam.ideal_scores[j],
                index_percent=(float(col_sums[j]) / (float(n) * exam.ideal_scores[j])) * 100.0,
                category=classify_difficulty(
                    (float(col_sums[j]) / (float(n) * exam.ideal_scores[j])) * 100.0,
                    mode,
                ),
            )
            for j in range(len(exam.ideal_scores))
        )

    items: list[DifficultyItem] = []
    for item_ul in essay_ul:
        j = item_ul.item_index
        ideal = exam.ideal_scores[j]
        num = item_ul.upper_sum + item_ul.lower_sum
        denom = 2.0 * float(group_size) * ideal
        tk = (num / denom) * 100.0 if group_size > 0 else math.nan
        items.append(
            DifficultyItem(
                item_index=j,
                item_number=item_ul.item_number,
                numerator=num,
                denominator=denom,
                index_percent=tk,
                category=classify_difficulty(tk, mode),
            )
        )
    return tuple(items)
