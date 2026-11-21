import json
import math
from dataclasses import asdict, is_dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from itemetri.domain.models import (
    AnaDocument,
    CompatibilityDiff,
    EssayAnalysis,
    EssayExam,
    Exam,
    ExamAnalysis,
    MultipleChoiceAnalysis,
    MultipleChoiceExam,
    ValidationIssue,
)


def _fmt(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "-"
    if math.isnan(value):
        return "NAN"
    return f"{value:.{decimals}f}"


def _json_sanitize(obj: Any) -> Any:
    if isinstance(obj, Enum):
        return obj.value
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: _json_sanitize(v) for k, v in asdict(obj).items()}
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {str(k): _json_sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_sanitize(item) for item in obj]
    return obj


def to_json_str(payload: Any) -> str:
    """Serialize domain/analysis models to RFC 8259 compliant JSON (NaN/Inf -> null)."""
    return json.dumps(_json_sanitize(payload), indent=2, allow_nan=False, ensure_ascii=False)


def format_analysis_table(analysis: ExamAnalysis) -> str:
    """Format an ExamAnalysis as aligned plain text tables for terminal output."""
    exam = analysis.exam
    lines: list[str] = []
    source = exam.source_path or "<memory>"
    lines.append(f"Source: {source}")
    lines.append(
        f"Kind: {exam.kind.value} | Mode: {analysis.options.mode.value} | "
        f"N={int(exam.subject_count)} | M={int(exam.item_count)} | "
        f"Group(n)={analysis.upper_lower.group_size}"
    )
    lines.append(
        f"Mean={_fmt(analysis.scoring.mean, 4)} | "
        f"SD={_fmt(analysis.scoring.std_dev, 4)} | "
        f"KorelasiXY={_fmt(analysis.reliability.correlation_xy, 6)} | "
        f"Reliabilitas={_fmt(analysis.reliability.reliability_coefficient, 6)}"
    )
    rel_ext = f"AlphaCronbach={_fmt(analysis.reliability.cronbach_alpha, 4)}"
    if isinstance(analysis, MultipleChoiceAnalysis):
        rel_ext += (
            f" | KR-20={_fmt(analysis.reliability.kr20, 4)}"
            f" | KR-21={_fmt(analysis.reliability.kr21, 4)}"
        )
    lines.append(rel_ext)

    if analysis.warnings:
        lines.append("Warnings:")
        for warn in analysis.warnings:
            lines.append(f"  - [{warn.code}] {warn.message}")

    lines.append("")
    if isinstance(analysis, MultipleChoiceAnalysis):
        lines.append(
            f"{'No':>4} {'Key':>3} {'DP(%)':>8} {'TK(%)':>8} {'Kategori':<14} "
            f"{'r':>8} {'r_corr':>8} {'a(-j)':>7} {'p':>9} {'Signifikansi':<18}"
        )
        for dp, tk, corr in zip(
            analysis.discrimination,
            analysis.difficulty,
            analysis.correlations,
            strict=True,
        ):
            key_ch = analysis.exam.answer_key[dp.item_index].upper()
            cat = tk.category.value if tk.category is not None else "-"
            p_str = _fmt(corr.p_value, 4)
            lines.append(
                f"{dp.item_number:>4} {key_ch:>3} {_fmt(dp.index_percent):>8} "
                f"{_fmt(tk.index_percent):>8} {cat:<14} "
                f"{_fmt(corr.correlation, 3):>8} {_fmt(corr.corrected_correlation, 3):>8} "
                f"{_fmt(corr.alpha_if_deleted, 3):>7} {p_str:>9} {corr.significance.value:<18}"
            )
    elif isinstance(analysis, EssayAnalysis):
        lines.append(
            f"{'No':>4} {'Butir':>5} {'Ideal':>7} {'t':>8} {'DP(%)':>8} {'TK(%)':>8} "
            f"{'Kategori':<14} {'r':>8} {'r_corr':>8} {'a(-j)':>7} {'p':>9} {'Signifikansi':<18}"
        )
        for ul, dp, tk, corr in zip(
            analysis.essay_upper_lower,
            analysis.discrimination,
            analysis.difficulty,
            analysis.correlations,
            strict=True,
        ):
            cat = tk.category.value if tk.category is not None else "-"
            lines.append(
                f"{dp.item_index + 1:>4} {dp.item_number:>5} "
                f"{_fmt(analysis.exam.ideal_scores[dp.item_index]):>7} "
                f"{_fmt(ul.t_value):>8} {_fmt(dp.index_percent):>8} "
                f"{_fmt(tk.index_percent):>8} {cat:<14} "
                f"{_fmt(corr.correlation, 3):>8} {_fmt(corr.corrected_correlation, 3):>8} "
                f"{_fmt(corr.alpha_if_deleted, 3):>7} {_fmt(corr.p_value, 4):>9} "
                f"{corr.significance.value:<18}"
            )
    return "\n".join(lines)


def format_diff_table(diff: CompatibilityDiff) -> str:
    """Format a CompatibilityDiff comparing LEGACY_ANATES and STANDARD_CORRECTED."""
    lines: list[str] = [
        f"Source: {diff.source_path or '<memory>'} ({diff.exam_kind.value}, "
        f"N={int(diff.subject_count)}, M={int(diff.item_count)})",
        f"KorelasiXY:   legacy={_fmt(diff.legacy_correlation_xy, 6)} | "
        f"corrected={_fmt(diff.corrected_correlation_xy, 6)} | "
        f"delta={_fmt(diff.correlation_xy_delta, 6)}",
        f"Reliabilitas: legacy={_fmt(diff.legacy_reliability, 6)} | "
        f"corrected={_fmt(diff.corrected_reliability, 6)} | "
        f"delta={_fmt(diff.reliability_delta, 6)}",
    ]

    if diff.difficulty_category_changes:
        lines.append("")
        lines.append("Difficulty Category Changes:")
        lines.append(
            f"{'Butir':>5} {'TK_Leg(%)':>10} {'Kat_Leg':<14} {'TK_Cor(%)':>10} {'Kat_Cor':<14}"
        )
        for chg in diff.difficulty_category_changes:
            leg_cat = chg.legacy_category.value if chg.legacy_category is not None else "-"
            cor_cat = chg.corrected_category.value if chg.corrected_category is not None else "-"
            lines.append(
                f"{chg.item_number:>5} {_fmt(chg.legacy_index_percent):>10} {leg_cat:<14} "
                f"{_fmt(chg.corrected_index_percent):>10} {cor_cat:<14}"
            )

    if diff.significance_changes:
        lines.append("")
        lines.append("Correlation Significance Changes:")
        lines.append(f"{'Butir':>5} {'r':>8} {'p(cor)':>9} {'Sig_Leg':<18} {'Sig_Cor':<18}")
        for sig in diff.significance_changes:
            lines.append(
                f"{sig.item_number:>5} {_fmt(sig.correlation, 3):>8} "
                f"{_fmt(sig.corrected_p_value, 4):>9} "
                f"{sig.legacy_significance.value:<18} {sig.corrected_significance.value:<18}"
            )

    if diff.item_deltas:
        lines.append("")
        lines.append("Item Metric Deltas:")
        lines.append(f"{'Butir':>5} {'Metric':<18} {'Legacy':>10} {'Corrected':>10} {'Delta':>10}")
        for delta in diff.item_deltas:
            lines.append(
                f"{delta.item_number:>5} {delta.metric:<18} "
                f"{_fmt(delta.legacy_value, 4):>10} {_fmt(delta.corrected_value, 4):>10} "
                f"{_fmt(delta.delta, 4):>10}"
            )

    if (
        not diff.difficulty_category_changes
        and not diff.significance_changes
        and not diff.item_deltas
    ):
        lines.append("No item-level category or significance changes.")

    return "\n".join(lines)


def format_inspect_summary(
    *,
    source: Path,
    exam: Exam,
    doc: AnaDocument | None,
    warnings: tuple[ValidationIssue, ...],
) -> str:
    """Format file metadata, schema attributes, cached stats, and validation warnings."""
    lines: list[str] = [f"File: {source}"]
    if doc is not None:
        lines.append(
            f"Format: XML (.ana) | Schema: {doc.file_version} | Encoding: {doc.detected_encoding}"
        )
    else:
        lines.append(f"Format: {source.suffix.lower().lstrip('.') or 'tabular'}")

    lines.append(
        f"Kind: {exam.kind.value} | N={int(exam.subject_count)} | M={int(exam.item_count)}"
    )
    if isinstance(exam, MultipleChoiceExam):
        lines.append(
            f"Options(K): {int(exam.option_count)} | "
            f"Weights: ({exam.weights.correct:g}, {exam.weights.wrong:g}) | "
            f"SortedByScore: {exam.is_sorted_by_score} | IsNeedRecalc: {exam.is_need_recalc}"
        )
    elif isinstance(exam, EssayExam):
        lines.append(
            f"IdealRange: [{min(exam.ideal_scores):g}, {max(exam.ideal_scores):g}] | "
            f"SortedByScore: {exam.is_sorted_by_score} | IsNeedRecalc: {exam.is_need_recalc}"
        )

    if doc is not None and doc.cached_scores is not None:
        cached = doc.cached_scores
        lines.append(
            f"Cached <Data_Skor>: subjects={len(cached.subjects)} | "
            f"Rata2={cached.mean} | SD={cached.std_dev}"
        )
    else:
        lines.append("Cached <Data_Skor>: none")

    if warnings:
        lines.append(f"Warnings ({len(warnings)}):")
        for warn in warnings:
            lines.append(f"  - [{warn.code}] {warn.message}")
    else:
        lines.append("Warnings: none")

    return "\n".join(lines)
