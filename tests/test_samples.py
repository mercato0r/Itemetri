import math

from itemetri.domain import ItemVerdictStatus
from itemetri.engine import (
    analyze_essay,
    analyze_multiple_choice,
    generate_diagnostic_mc_sample,
    generate_essay_demo_sample,
)


def test_diagnostic_mc_sample_is_deterministic_and_exhibits_key_cases() -> None:
    first = generate_diagnostic_mc_sample()
    second = generate_diagnostic_mc_sample()
    assert first == second
    assert first.subject_count == 25
    assert first.item_count == 10
    assert int(first.option_count) == 4

    analysis = analyze_multiple_choice(first)
    assert math.isfinite(analysis.scoring.min_score)
    assert math.isfinite(analysis.scoring.max_score)
    assert math.isfinite(analysis.scoring.median_score)
    assert analysis.scoring.ideal_max_score == 10.0

    # Item 9 (index 8) is miskeyed so DP < 0, REJECT, and suspected_miskey must trigger.
    item9_dp = analysis.discrimination[8]
    item9_verdict = analysis.verdicts[8]
    assert item9_dp.index_percent < 0.0
    assert item9_verdict.status is ItemVerdictStatus.REJECT
    assert item9_verdict.suspected_miskey is True

    # Item 10 (index 9) hits ceiling difficulty (>90%) and is rejected as overly easy.
    item10_tk = analysis.difficulty[9]
    item10_verdict = analysis.verdicts[9]
    assert item10_tk.index_percent > 90.0
    assert item10_verdict.status is ItemVerdictStatus.REJECT


def test_essay_demo_sample_is_deterministic_and_analyzable() -> None:
    first = generate_essay_demo_sample()
    second = generate_essay_demo_sample()
    assert first == second
    assert first.subject_count == 20
    assert first.item_count == 5
    assert first.ideal_scores == (10.0, 10.0, 15.0, 15.0, 20.0)

    analysis = analyze_essay(first)
    assert analysis.scoring.ideal_max_score == 70.0
    assert math.isfinite(analysis.scoring.min_score)
    assert math.isfinite(analysis.scoring.max_score)
    assert math.isfinite(analysis.scoring.median_score)
    assert analysis.reliability.cronbach_alpha is not None
    assert math.isfinite(analysis.reliability.cronbach_alpha)
    assert all(math.isfinite(item.t_value) for item in analysis.essay_upper_lower)
    assert len(analysis.verdicts) == 5
