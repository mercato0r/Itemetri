import math

from itemetri.domain.enums import CompatibilityMode
from itemetri.domain.models import (
    AnalysisOptions,
    CompatibilityDiff,
    DifficultyCategoryChange,
    EssayAnalysis,
    Exam,
    ItemNumericDelta,
    SignificanceChange,
)
from itemetri.engine.pipeline import analyze_exam


def _safe_delta(corrected: float, legacy: float) -> float:
    if math.isnan(corrected) or math.isnan(legacy):
        return math.nan
    return corrected - legacy


def compare_modes(
    exam: Exam,
    *,
    upper_lower_percent: float = 27.0,
) -> CompatibilityDiff:
    """Run LEGACY_ANATES and STANDARD_CORRECTED on the same exam and collect differences."""
    legacy = analyze_exam(
        exam,
        AnalysisOptions(
            mode=CompatibilityMode.LEGACY_ANATES,
            upper_lower_percent=upper_lower_percent,
        ),
    )
    corrected = analyze_exam(
        exam,
        AnalysisOptions(
            mode=CompatibilityMode.STANDARD_CORRECTED,
            upper_lower_percent=upper_lower_percent,
        ),
    )

    diff_changes: list[DifficultyCategoryChange] = []
    sig_changes: list[SignificanceChange] = []
    item_deltas: list[ItemNumericDelta] = []

    for leg_tk, cor_tk in zip(legacy.difficulty, corrected.difficulty, strict=True):
        if leg_tk.category != cor_tk.category:
            diff_changes.append(
                DifficultyCategoryChange(
                    item_index=leg_tk.item_index,
                    item_number=leg_tk.item_number,
                    legacy_category=leg_tk.category,
                    corrected_category=cor_tk.category,
                    legacy_index_percent=leg_tk.index_percent,
                    corrected_index_percent=cor_tk.index_percent,
                )
            )
        tk_delta = _safe_delta(cor_tk.index_percent, leg_tk.index_percent)
        if not math.isnan(tk_delta) and tk_delta != 0.0:
            item_deltas.append(
                ItemNumericDelta(
                    item_index=leg_tk.item_index,
                    item_number=leg_tk.item_number,
                    metric="difficulty_percent",
                    legacy_value=leg_tk.index_percent,
                    corrected_value=cor_tk.index_percent,
                    delta=tk_delta,
                )
            )

    for leg_r, cor_r in zip(legacy.correlations, corrected.correlations, strict=True):
        if leg_r.significance != cor_r.significance:
            sig_changes.append(
                SignificanceChange(
                    item_index=leg_r.item_index,
                    item_number=leg_r.item_number,
                    correlation=cor_r.correlation,
                    legacy_significance=leg_r.significance,
                    corrected_significance=cor_r.significance,
                    corrected_p_value=cor_r.p_value,
                )
            )

    if isinstance(legacy, EssayAnalysis) and isinstance(corrected, EssayAnalysis):
        for leg_ul, cor_ul in zip(
            legacy.essay_upper_lower,
            corrected.essay_upper_lower,
            strict=True,
        ):
            se_delta = _safe_delta(cor_ul.se_pooled, leg_ul.se_pooled)
            if not math.isnan(se_delta) and se_delta != 0.0:
                item_deltas.append(
                    ItemNumericDelta(
                        item_index=leg_ul.item_index,
                        item_number=leg_ul.item_number,
                        metric="se_pooled",
                        legacy_value=leg_ul.se_pooled,
                        corrected_value=cor_ul.se_pooled,
                        delta=se_delta,
                    )
                )
            t_delta = _safe_delta(cor_ul.t_value, leg_ul.t_value)
            if not math.isnan(t_delta) and t_delta != 0.0:
                item_deltas.append(
                    ItemNumericDelta(
                        item_index=leg_ul.item_index,
                        item_number=leg_ul.item_number,
                        metric="t_value",
                        legacy_value=leg_ul.t_value,
                        corrected_value=cor_ul.t_value,
                        delta=t_delta,
                    )
                )

    return CompatibilityDiff(
        source_path=exam.source_path,
        exam_kind=exam.kind,
        subject_count=exam.subject_count,
        item_count=exam.item_count,
        legacy_correlation_xy=legacy.reliability.correlation_xy,
        corrected_correlation_xy=corrected.reliability.correlation_xy,
        correlation_xy_delta=_safe_delta(
            corrected.reliability.correlation_xy,
            legacy.reliability.correlation_xy,
        ),
        legacy_reliability=legacy.reliability.reliability_coefficient,
        corrected_reliability=corrected.reliability.reliability_coefficient,
        reliability_delta=_safe_delta(
            corrected.reliability.reliability_coefficient,
            legacy.reliability.reliability_coefficient,
        ),
        difficulty_category_changes=tuple(diff_changes),
        significance_changes=tuple(sig_changes),
        item_deltas=tuple(item_deltas),
    )
