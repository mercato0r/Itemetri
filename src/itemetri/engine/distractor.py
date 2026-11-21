import math

import numpy as np
from numpy.typing import NDArray

from itemetri.domain.enums import DistractorQuality
from itemetri.domain.models import (
    DistractorItem,
    DistractorOption,
    MultipleChoiceExam,
    UpperLowerSplit,
)


def classify_distractor_index(
    freq: int,
    ideal: float,
    is_key: bool,
) -> tuple[float, DistractorQuality]:
    """Classify distractor effectiveness index IP against AnatesV4.exe thresholds."""
    if is_key:
        return (math.nan, DistractorQuality.KEY)
    if ideal <= 0.0:
        return (math.nan, DistractorQuality.NONE)

    ip = (float(freq) / ideal) * 100.0
    if 75.0 < ip <= 125.0:
        return (ip, DistractorQuality.VERY_GOOD)
    if (50.0 < ip <= 75.0) or (125.0 < ip <= 150.0):
        return (ip, DistractorQuality.GOOD)
    if (25.0 < ip <= 50.0) or (150.0 < ip <= 175.0):
        return (ip, DistractorQuality.FAIR)
    if (0.0 <= ip <= 25.0) or (175.0 < ip <= 200.0):
        return (ip, DistractorQuality.POOR)
    if ip > 200.0:
        return (ip, DistractorQuality.VERY_POOR)
    return (ip, DistractorQuality.UNKNOWN)


def compute_distractors(
    exam: MultipleChoiceExam,
    responses_upper: NDArray[np.uint8] | NDArray[np.uint32],
    correct_mask: NDArray[np.bool_],
    blank_mask: NDArray[np.bool_],
    split: UpperLowerSplit | None = None,
    min_choice_proportion: float = 0.02,
) -> tuple[DistractorItem, ...]:
    """Compute option frequencies, distractor indices, and upper/lower functioning."""
    n, m = correct_mask.shape
    k = int(exam.option_count)
    option_letters = [chr(ord("A") + idx) for idx in range(k)]
    option_codes = np.array([ord(ch) for ch in option_letters], dtype=responses_upper.dtype)

    freq_matrix = (responses_upper[:, :, None] == option_codes[None, None, :]).sum(
        axis=0, dtype=np.intp
    )
    correct_counts = correct_mask.sum(axis=0, dtype=np.intp)
    blank_counts = blank_mask.sum(axis=0, dtype=np.intp)

    has_groups = split is not None and split.group_size > 0
    upper_freq_matrix: NDArray[np.intp] | None = None
    lower_freq_matrix: NDArray[np.intp] | None = None
    upper_blanks: NDArray[np.intp] | None = None
    lower_blanks: NDArray[np.intp] | None = None
    if has_groups:
        assert split is not None
        upper_idx = np.asarray(split.upper_indices, dtype=np.intp)
        lower_idx = np.asarray(split.lower_indices, dtype=np.intp)
        u_resp = responses_upper[upper_idx, :]
        l_resp = responses_upper[lower_idx, :]
        upper_freq_matrix = (u_resp[:, :, None] == option_codes[None, None, :]).sum(
            axis=0, dtype=np.intp
        )
        lower_freq_matrix = (l_resp[:, :, None] == option_codes[None, None, :]).sum(
            axis=0, dtype=np.intp
        )
        upper_blanks = blank_mask[upper_idx, :].sum(axis=0, dtype=np.intp)
        lower_blanks = blank_mask[lower_idx, :].sum(axis=0, dtype=np.intp)

    items: list[DistractorItem] = []
    key_upper = exam.answer_key.upper()
    for j in range(m):
        j_count = int(correct_counts[j])
        b_count = int(blank_counts[j])
        ideal = float(n - j_count) / float(k - 1)
        key_char = key_upper[j]

        opt_total_freq = int(freq_matrix[j].sum())
        other_count = max(0, n - opt_total_freq - b_count)

        opts: list[DistractorOption] = []
        for opt_idx, opt_char in enumerate(option_letters):
            is_key = opt_char == key_char
            freq = int(freq_matrix[j, opt_idx])
            ip, quality = classify_distractor_index(freq, ideal, is_key=is_key)
            u_count = int(upper_freq_matrix[j, opt_idx]) if upper_freq_matrix is not None else 0
            l_count = int(lower_freq_matrix[j, opt_idx]) if lower_freq_matrix is not None else 0
            if is_key or not has_groups or n == 0:
                is_functioning: bool | None = None
            else:
                is_functioning = (float(freq) / float(n) >= min_choice_proportion) and (
                    l_count >= u_count
                )
            opts.append(
                DistractorOption(
                    option=opt_char,
                    frequency=freq,
                    index_percent=ip,
                    quality=quality,
                    upper_count=u_count,
                    lower_count=l_count,
                    is_functioning=is_functioning,
                )
            )

        functioning_count = sum(1 for o in opts if o.is_functioning is True)
        distractor_count = sum(1 for ch in option_letters if ch != key_char)
        items.append(
            DistractorItem(
                item_index=j,
                item_number=j + 1,
                key=key_char,
                correct_count=j_count,
                blank_count=b_count,
                other_count=other_count,
                ideal_count=ideal,
                options=tuple(opts),
                upper_blank_count=int(upper_blanks[j]) if upper_blanks is not None else 0,
                lower_blank_count=int(lower_blanks[j]) if lower_blanks is not None else 0,
                functioning_count=functioning_count,
                distractor_count=distractor_count,
            )
        )
    return tuple(items)
