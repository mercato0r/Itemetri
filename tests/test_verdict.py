import math

import numpy as np

from anates.domain import (
    CorrelationItem,
    DifficultyCategory,
    DifficultyItem,
    DiscriminationItem,
    DistractorItem,
    DistractorOption,
    DistractorQuality,
    ItemVerdictStatus,
    SignificanceLevel,
)
from anates.engine import evaluate_item_verdicts


def _make_item(
    *,
    idx: int = 0,
    tk: float = 55.0,
    dp: float = 40.0,
    r: float = 0.55,
    p: float | None = 0.002,
    sig: SignificanceLevel = SignificanceLevel.HIGHLY_SIGNIFICANT,
    r_corr: float | None = 0.48,
    p_corr: float | None = 0.01,
    sig_corr: SignificanceLevel | None = SignificanceLevel.SIGNIFICANT,
    distractor: DistractorItem | None = None,
) -> tuple[DiscriminationItem, DifficultyItem, CorrelationItem, DistractorItem | None]:
    dp_item = DiscriminationItem(
        item_index=idx,
        item_number=idx + 1,
        upper_total=8.0,
        lower_total=4.0,
        difference=4.0,
        index_percent=dp,
    )
    tk_item = DifficultyItem(
        item_index=idx,
        item_number=idx + 1,
        numerator=12.0,
        denominator=20.0,
        index_percent=tk,
        category=DifficultyCategory.MEDIUM,
    )
    corr_item = CorrelationItem(
        item_index=idx,
        item_number=idx + 1,
        correlation=r,
        p_value=p,
        significance=sig,
        corrected_correlation=r_corr,
        corrected_p_value=p_corr,
        corrected_significance=sig_corr,
        alpha_if_deleted=0.72,
    )
    return (dp_item, tk_item, corr_item, distractor)


def test_verdict_accept_revise_and_reject_branches() -> None:
    accept_case = _make_item(idx=0, tk=55.0, dp=40.0, r=0.55, sig=SignificanceLevel.SIGNIFICANT)
    revise_dp = _make_item(
        idx=1,
        tk=55.0,
        dp=25.0,
        r=0.45,
        sig=SignificanceLevel.SIGNIFICANT,
        r_corr=0.20,
        sig_corr=SignificanceLevel.NOT_SIGNIFICANT,
    )
    reject_weak = _make_item(
        idx=2,
        tk=92.0,
        dp=10.0,
        r=0.12,
        sig=SignificanceLevel.NOT_SIGNIFICANT,
    )
    reject_nan = _make_item(
        idx=3,
        tk=100.0,
        dp=0.0,
        r=math.nan,
        p=None,
        sig=SignificanceLevel.NAN,
        r_corr=math.nan,
        p_corr=None,
        sig_corr=SignificanceLevel.NAN,
    )

    verdicts = evaluate_item_verdicts(
        discrimination=[accept_case[0], revise_dp[0], reject_weak[0], reject_nan[0]],
        difficulty=[accept_case[1], revise_dp[1], reject_weak[1], reject_nan[1]],
        correlations=[accept_case[2], revise_dp[2], reject_weak[2], reject_nan[2]],
    )

    assert verdicts[0].status is ItemVerdictStatus.ACCEPT
    assert verdicts[0].reasons == ()

    assert verdicts[1].status is ItemVerdictStatus.REVISE
    assert verdicts[1].corrected_status is ItemVerdictStatus.REJECT
    assert any("sedang" in msg for msg in verdicts[1].reasons)
    assert any("tidak signifikan" in msg for msg in verdicts[1].corrected_reasons)

    assert verdicts[2].status is ItemVerdictStatus.REJECT
    assert any("lemah" in msg for msg in verdicts[2].reasons)

    assert verdicts[3].status is ItemVerdictStatus.REJECT
    assert any("variansi butir nol" in msg for msg in verdicts[3].reasons)
    assert verdicts[3].corrected_status is ItemVerdictStatus.REJECT


def test_verdict_legacy_mode_without_p_value_uses_significance_enum() -> None:
    dp_item, tk_item, corr_item, _ = _make_item(
        tk=60.0,
        dp=35.0,
        r=0.52,
        p=None,
        sig=SignificanceLevel.HIGHLY_SIGNIFICANT,
        r_corr=0.42,
        p_corr=None,
        sig_corr=SignificanceLevel.SIGNIFICANT,
    )
    verdicts = evaluate_item_verdicts(
        discrimination=[dp_item],
        difficulty=[tk_item],
        correlations=[corr_item],
    )
    assert verdicts[0].status is ItemVerdictStatus.ACCEPT
    assert verdicts[0].corrected_status is ItemVerdictStatus.ACCEPT


def test_verdict_detects_suspected_miskey_from_upper_group() -> None:
    dist = DistractorItem(
        item_index=0,
        item_number=1,
        key="A",
        correct_count=5,
        blank_count=0,
        other_count=0,
        ideal_count=5.0,
        options=(
            DistractorOption(
                "A", 5, math.nan, DistractorQuality.KEY, upper_count=1, lower_count=4
            ),
            DistractorOption(
                "B", 12, 240.0, DistractorQuality.VERY_POOR, upper_count=6, lower_count=2
            ),
            DistractorOption(
                "C", 2, 40.0, DistractorQuality.FAIR, upper_count=0, lower_count=1
            ),
            DistractorOption(
                "D", 1, 20.0, DistractorQuality.POOR, upper_count=0, lower_count=0
            ),
        ),
        functioning_count=1,
        distractor_count=3,
    )
    dp_item, tk_item, corr_item, _ = _make_item(
        tk=25.0,
        dp=-42.8,
        r=-0.45,
        sig=SignificanceLevel.NOT_SIGNIFICANT,
        r_corr=-0.52,
        sig_corr=SignificanceLevel.NOT_SIGNIFICANT,
        distractor=dist,
    )

    verdicts = evaluate_item_verdicts(
        discrimination=[dp_item],
        difficulty=[tk_item],
        correlations=[corr_item],
        distractors=[dist],
    )

    assert len(verdicts) == 1
    assert verdicts[0].status is ItemVerdictStatus.REJECT
    assert verdicts[0].suspected_miskey is True
    assert any("diduga salah kunci" in r and "B: 6" in r for r in verdicts[0].reasons)
    assert np.isfinite(dp_item.index_percent)
