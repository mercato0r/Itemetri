import math
from collections.abc import Sequence
from dataclasses import dataclass

from itemetri.domain.enums import ItemVerdictStatus, SignificanceLevel
from itemetri.domain.models import (
    CorrelationItem,
    DifficultyItem,
    DiscriminationItem,
    DistractorItem,
    ItemVerdict,
)


@dataclass(frozen=True, slots=True)
class VerdictThresholds:
    """Psychometric cutoff thresholds on percentage (0..100) scales."""

    dp_accept: float = 30.0
    dp_revise: float = 20.0
    tk_ok_min: float = 20.0
    tk_ok_max: float = 85.0
    tk_extreme_min: float = 15.0
    tk_extreme_max: float = 90.0


def _detect_miskey(
    dp_pct: float,
    distractor: DistractorItem | None,
) -> tuple[bool, str | None]:
    if not (math.isfinite(dp_pct) and dp_pct < 0.0) or distractor is None:
        return (False, None)
    key_opt = next((o for o in distractor.options if o.option == distractor.key), None)
    non_key = [o for o in distractor.options if o.option != distractor.key]
    if key_opt is None or not non_key:
        return (False, None)
    best = max(non_key, key=lambda o: (o.upper_count, o.frequency))
    if best.upper_count > key_opt.upper_count:
        hint = (
            f"diduga salah kunci (unggul memilih {best.option}: {best.upper_count} "
            f"vs kunci {key_opt.option}: {key_opt.upper_count})"
        )
        return (True, hint)
    return (False, None)


def _judge_single_item(
    *,
    tk_pct: float,
    dp_pct: float,
    r_val: float | None,
    sig: SignificanceLevel | None,
    suspected_miskey: bool,
    miskey_hint: str | None,
    thresholds: VerdictThresholds,
) -> tuple[ItemVerdictStatus, tuple[str, ...]]:
    reasons: list[str] = []
    # Read SignificanceLevel rather than p-values so LEGACY_ANATES (p_value=None) works cleanly.
    r_sig = sig in (SignificanceLevel.SIGNIFICANT, SignificanceLevel.HIGHLY_SIGNIFICANT)
    r_ok = r_val is not None and math.isfinite(r_val) and r_val > 0.0 and r_sig
    dp_finite = math.isfinite(dp_pct)
    dp_good = dp_finite and dp_pct >= thresholds.dp_accept
    dp_fair = dp_finite and dp_pct >= thresholds.dp_revise
    tk_finite = math.isfinite(tk_pct)
    tk_ok = tk_finite and (thresholds.tk_ok_min <= tk_pct <= thresholds.tk_ok_max)
    tk_extreme = (not tk_finite) or (
        tk_pct < thresholds.tk_extreme_min or tk_pct > thresholds.tk_extreme_max
    )

    if suspected_miskey and miskey_hint:
        reasons.append(miskey_hint)
    if r_val is None or not math.isfinite(r_val):
        reasons.append("korelasi tak terdefinisi (variansi butir nol)")
    elif r_val <= 0.0:
        reasons.append("korelasi butir-total <= 0")
    elif not r_sig:
        reasons.append("korelasi tidak signifikan")

    if not dp_finite:
        reasons.append("daya pembeda tidak terdefinisi (kelompok n=0)")
    elif dp_pct < 0.0:
        reasons.append("daya pembeda negatif")
    elif not dp_fair:
        reasons.append(f"daya pembeda lemah (<{thresholds.dp_revise:g}%)")
    elif not dp_good:
        reasons.append(f"daya pembeda sedang ({thresholds.dp_revise:g}-{thresholds.dp_accept:g}%)")

    if not tk_finite:
        reasons.append("tingkat kesukaran tak terdefinisi")
    elif not tk_ok:
        msg = "butir sangat sukar" if tk_pct < thresholds.tk_ok_min else "butir sangat mudah"
        reasons.append(msg)

    if (
        not dp_finite
        or dp_pct < 0.0
        or r_val is None
        or not math.isfinite(r_val)
        or r_val <= 0.0
        or suspected_miskey
    ):
        status = ItemVerdictStatus.REJECT
    elif dp_good and r_ok and tk_ok:
        status = ItemVerdictStatus.ACCEPT
    elif (not dp_fair) or (not r_sig) or tk_extreme:
        status = ItemVerdictStatus.REJECT
    else:
        status = ItemVerdictStatus.REVISE
    return (status, tuple(reasons))


def evaluate_item_verdicts(
    *,
    discrimination: Sequence[DiscriminationItem],
    difficulty: Sequence[DifficultyItem],
    correlations: Sequence[CorrelationItem],
    distractors: Sequence[DistractorItem] | None = None,
    thresholds: VerdictThresholds | None = None,
) -> tuple[ItemVerdict, ...]:
    """Evaluate raw and corrected-correlation acceptance verdicts for each item."""
    th = thresholds or VerdictThresholds()
    verdicts: list[ItemVerdict] = []

    for j, (dp, tk, corr) in enumerate(zip(discrimination, difficulty, correlations, strict=True)):
        distractor = distractors[j] if distractors is not None and j < len(distractors) else None
        suspected_miskey, miskey_hint = _detect_miskey(dp.index_percent, distractor)

        status, reasons = _judge_single_item(
            tk_pct=tk.index_percent,
            dp_pct=dp.index_percent,
            r_val=corr.correlation,
            sig=corr.significance,
            suspected_miskey=suspected_miskey,
            miskey_hint=miskey_hint,
            thresholds=th,
        )

        corrected_status: ItemVerdictStatus | None = None
        corrected_reasons: tuple[str, ...] = ()
        if corr.corrected_correlation is not None or corr.corrected_significance is not None:
            corrected_status, corrected_reasons = _judge_single_item(
                tk_pct=tk.index_percent,
                dp_pct=dp.index_percent,
                r_val=corr.corrected_correlation,
                sig=corr.corrected_significance,
                suspected_miskey=suspected_miskey,
                miskey_hint=miskey_hint,
                thresholds=th,
            )

        verdicts.append(
            ItemVerdict(
                item_index=tk.item_index,
                item_number=tk.item_number,
                status=status,
                reasons=reasons,
                suspected_miskey=suspected_miskey,
                corrected_status=corrected_status,
                corrected_reasons=corrected_reasons,
            )
        )

    return tuple(verdicts)
