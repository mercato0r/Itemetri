import math
from pathlib import Path

import pytest

from itemetri.domain import (
    AnalysisOptions,
    CompatibilityMode,
    DifficultyCategory,
    ItemCount,
    MultipleChoiceExam,
    SignificanceLevel,
)
from itemetri.engine import (
    LEGACY_CORRELATION_TABLE,
    analyze_multiple_choice,
    classify_difficulty,
    lookup_legacy_significance,
)
from itemetri.io import read_ana


def _load_mc(path: Path) -> MultipleChoiceExam:
    doc = read_ana(path)
    assert isinstance(doc.exam, MultipleChoiceExam)
    return doc.exam


def test_golden_biologi_legacy_and_corrected(anates_dir: Path) -> None:
    doc = read_ana(anates_dir / "biologi.ana")
    assert isinstance(doc.exam, MultipleChoiceExam)
    assert doc.cached_scores is not None

    legacy = analyze_multiple_choice(
        doc.exam,
        AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES),
    )
    corrected = analyze_multiple_choice(
        doc.exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
    )

    assert abs(legacy.scoring.mean - doc.cached_scores.mean) <= 4.5e-15
    assert abs(legacy.scoring.std_dev - doc.cached_scores.std_dev) <= 9.0e-16
    assert legacy.upper_lower.group_size == 10

    for computed, cached in zip(legacy.scoring.subjects, doc.cached_scores.subjects, strict=True):
        assert computed.original_index == cached.original_index
        assert computed.score_pattern == cached.score_pattern
        assert computed.raw_score == cached.total_score
        assert computed.weighted_score == cached.weighted_score
        assert computed.correct_count == cached.correct_count
        assert computed.wrong_count == cached.wrong_count
        assert computed.blank_count == cached.blank_count

    assert legacy.reliability.correlation_xy == pytest.approx(0.613116, abs=1e-6)
    assert legacy.reliability.reliability_coefficient == pytest.approx(0.760163, abs=1e-6)
    assert corrected.reliability.correlation_xy == pytest.approx(0.650264, abs=1e-6)
    assert corrected.reliability.reliability_coefficient == pytest.approx(0.788073, abs=1e-6)

    for j, dist in enumerate(legacy.distractors):
        assert dist.correct_count == int(legacy.difficulty[j].numerator)


def test_golden_ka_ma2_legacy_sort_and_weights(anates_dir: Path) -> None:
    doc = read_ana(anates_dir / "ka ma2.ANA")
    assert isinstance(doc.exam, MultipleChoiceExam)
    assert doc.cached_scores is not None

    legacy = analyze_multiple_choice(
        doc.exam,
        AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES),
    )
    corrected = analyze_multiple_choice(
        doc.exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
    )

    assert abs(legacy.scoring.mean - doc.cached_scores.mean) == 0.0
    assert abs(legacy.scoring.std_dev - doc.cached_scores.std_dev) <= 9.0e-16
    assert legacy.upper_lower.group_size == 11

    sorted_rows = [legacy.scoring.subjects[idx] for idx in legacy.scoring.sorted_order]
    assert len(sorted_rows) == len(doc.cached_scores.subjects) == 40
    for computed, cached in zip(sorted_rows, doc.cached_scores.subjects, strict=True):
        assert computed.original_index == cached.original_index
        assert computed.name == cached.name
        assert computed.score_pattern == cached.score_pattern
        assert computed.raw_score == cached.total_score
        assert computed.weighted_score == cached.weighted_score
        assert computed.weighted_score == 3.0 * computed.raw_score
        assert computed.correct_count == cached.correct_count
        assert computed.wrong_count == cached.wrong_count
        assert computed.blank_count == cached.blank_count

    assert legacy.reliability.correlation_xy == pytest.approx(0.461127, abs=1e-6)
    assert legacy.reliability.reliability_coefficient == pytest.approx(0.631193, abs=1e-6)
    assert corrected.reliability.correlation_xy == pytest.approx(0.480213, abs=1e-6)
    assert corrected.reliability.reliability_coefficient == pytest.approx(0.648843, abs=1e-6)

    weighted_cor = analyze_multiple_choice(
        doc.exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED, use_weighted_score=True),
    )
    assert weighted_cor.scoring.uses_weighted_score is True
    assert weighted_cor.scoring.mean == pytest.approx(3.0 * 18.825, rel=1e-12)


@pytest.mark.parametrize(
    ("filename", "exp_mean", "exp_sd", "exp_grp", "leg_rxy", "leg_rtt", "cor_rxy", "cor_rtt"),
    [
        ("lat1.ANA", 7.53333333333333, 1.92503172089106, 8, 0.237473, 0.383804, 0.290838, 0.450618),
        ("latih3.ANA", 0.675, 4.26907484122731, 11, 1.0, 1.0, 1.0, 1.0),
        ("latihan2.ANA", 0.0, 0.0, 6, None, None, None, None),
        ("mts.ANA", 0.025, 0.15811388300842, 11, None, None, None, None),
    ],
)
def test_golden_remaining_ana_files(
    anates_dir: Path,
    filename: str,
    exp_mean: float,
    exp_sd: float,
    exp_grp: int,
    leg_rxy: float | None,
    leg_rtt: float | None,
    cor_rxy: float | None,
    cor_rtt: float | None,
) -> None:
    exam = _load_mc(anates_dir / filename)
    legacy = analyze_multiple_choice(exam, AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES))
    corrected = analyze_multiple_choice(
        exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
    )

    assert legacy.scoring.mean == pytest.approx(exp_mean, abs=1e-12)
    assert legacy.scoring.std_dev == pytest.approx(exp_sd, abs=1e-12)
    assert legacy.upper_lower.group_size == exp_grp

    if leg_rxy is None:
        assert math.isnan(legacy.reliability.correlation_xy)
        assert math.isnan(legacy.reliability.reliability_coefficient)
        assert math.isnan(corrected.reliability.correlation_xy)
        assert math.isnan(corrected.reliability.reliability_coefficient)
    else:
        assert leg_rtt is not None and cor_rxy is not None and cor_rtt is not None
        assert legacy.reliability.correlation_xy == pytest.approx(leg_rxy, abs=1e-6)
        assert legacy.reliability.reliability_coefficient == pytest.approx(leg_rtt, abs=1e-6)
        assert corrected.reliability.correlation_xy == pytest.approx(cor_rxy, abs=1e-6)
        assert corrected.reliability.reliability_coefficient == pytest.approx(cor_rtt, abs=1e-6)


def test_legacy_correlation_table_all_14_rows() -> None:
    assert len(LEGACY_CORRELATION_TABLE) == 14
    for df_cutoff, r05, r01 in LEGACY_CORRELATION_TABLE:
        m = ItemCount(df_cutoff)
        assert lookup_legacy_significance(r05 - 0.001, m) is SignificanceLevel.NOT_SIGNIFICANT
        assert lookup_legacy_significance(r05, m) is SignificanceLevel.SIGNIFICANT
        assert lookup_legacy_significance(r01, m) is SignificanceLevel.HIGHLY_SIGNIFICANT

    assert lookup_legacy_significance(0.160, ItemCount(200)) is SignificanceLevel.SIGNIFICANT
    assert lookup_legacy_significance(math.nan, ItemCount(30)) is SignificanceLevel.NAN


def test_legacy_vs_corrected_difficulty_gap_classification() -> None:
    leg = CompatibilityMode.LEGACY_ANATES
    cor = CompatibilityMode.STANDARD_CORRECTED
    assert classify_difficulty(30.5, leg) is DifficultyCategory.VERY_EASY
    assert classify_difficulty(31.0, leg) is DifficultyCategory.VERY_EASY
    assert classify_difficulty(70.5, leg) is DifficultyCategory.VERY_EASY
    assert classify_difficulty(71.0, leg) is DifficultyCategory.VERY_EASY

    assert classify_difficulty(30.5, cor) is DifficultyCategory.MEDIUM
    assert classify_difficulty(31.0, cor) is DifficultyCategory.MEDIUM
    assert classify_difficulty(70.5, cor) is DifficultyCategory.EASY
    assert classify_difficulty(71.0, cor) is DifficultyCategory.EASY
