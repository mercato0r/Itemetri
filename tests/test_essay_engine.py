import math

import pytest
from scipy import stats

from anates.domain import (
    AnalysisOptions,
    CompatibilityMode,
    EssayDifficultyScope,
    EssayExam,
    EssaySubject,
    SignificanceLevel,
)
from anates.engine import analyze_essay


def _sample_essay_exam() -> EssayExam:
    # 10 subjects -> n = round(2.7) = 3; blanks in upper/lower test SE_gab and TK differences.
    return EssayExam(
        ideal_scores=(20.0, 20.0, 20.0),
        item_numbers=(1, 3, 5),
        subjects=(
            EssaySubject("U1", (19.0, 18.0, 18.0), 0),
            EssaySubject("U2", (18.0, None, 18.0), 1),
            EssaySubject("U3", (17.0, 16.0, 17.0), 2),
            EssaySubject("M1", (10.0, 10.0, 10.0), 3),
            EssaySubject("M2", (9.0, 10.0, 10.0), 4),
            EssaySubject("M3", (9.0, 9.0, 10.0), 5),
            EssaySubject("M4", (8.0, 10.0, 9.0), 6),
            EssaySubject("L1", (2.0, 6.0, 3.0), 7),
            EssaySubject("L2", (3.0, 4.0, None), 8),
            EssaySubject("L3", (1.0, 2.0, 2.0), 9),
        ),
    )


def test_essay_legacy_vs_corrected_behavior() -> None:
    exam = _sample_essay_exam()
    legacy = analyze_essay(exam, AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES))
    corrected = analyze_essay(exam, AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED))

    assert legacy.upper_lower.group_size == 3
    assert legacy.warnings == ()

    # Item 1 (index 1, item_number 3): U2 is blank in Upper (n_u_valid = 2, nominal n = 3).
    ul_leg = legacy.essay_upper_lower[1]
    ul_cor = corrected.essay_upper_lower[1]
    assert ul_leg.item_number == 3
    assert ul_leg.upper_valid_count == 2
    assert ul_leg.lower_valid_count == 3
    assert ul_leg.p_value is None

    expected_se_leg = math.sqrt((ul_leg.upper_std**2) / 3 + (ul_leg.lower_std**2) / 3)
    expected_se_cor = math.sqrt((ul_cor.upper_std**2) / 2 + (ul_cor.lower_std**2) / 3)
    assert ul_leg.se_pooled == pytest.approx(expected_se_leg, rel=1e-12)
    assert ul_cor.se_pooled == pytest.approx(expected_se_cor, rel=1e-12)
    assert ul_cor.p_value is not None

    v_u = (ul_cor.upper_std**2) / 2
    v_l = (ul_cor.lower_std**2) / 3
    df_w = ((v_u + v_l) ** 2) / ((v_u**2) / 1 + (v_l**2) / 2)
    assert ul_cor.p_value == pytest.approx(float(2 * stats.t.sf(abs(ul_cor.t_value), df_w)))

    # Difficulty: legacy uses 2n=6 (2*3*20=120), corrected defaults to all N=10 (10*20=200).
    tk_leg = legacy.difficulty[0]
    tk_cor = corrected.difficulty[0]
    assert tk_leg.denominator == pytest.approx(120.0)
    assert tk_cor.denominator == pytest.approx(200.0)

    corrected_2n = analyze_essay(
        exam,
        AnalysisOptions(
            mode=CompatibilityMode.STANDARD_CORRECTED,
            essay_difficulty_scope=EssayDifficultyScope.UPPER_LOWER_2N,
        ),
    )
    assert corrected_2n.difficulty[0].index_percent == pytest.approx(tk_leg.index_percent)
    assert legacy.reliability.method == "split_half_spearman_brown_float32"
    assert corrected.reliability.method == "split_half_spearman_brown"


def test_essay_all_blank_item_and_exceed_ideal_warning() -> None:
    exam = EssayExam(
        ideal_scores=(10.0, 10.0),
        subjects=(
            EssaySubject("S1", (12.0, None), 0),
            EssaySubject("S2", (5.0, None), 1),
            EssaySubject("S3", (4.0, None), 2),
            EssaySubject("S4", (3.0, None), 3),
        ),
    )
    res = analyze_essay(exam, AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED))
    assert res.scoring.observed_max == (12.0, 0.0)
    assert res.scoring.observed_min == (3.0, 0.0)
    assert any(w.code == "score_exceeds_ideal" for w in res.warnings)
    assert math.isnan(res.correlations[1].correlation)
    assert res.correlations[1].significance is SignificanceLevel.NAN


def test_essay_single_subject_n_zero_guard() -> None:
    exam = EssayExam(
        ideal_scores=(10.0,),
        subjects=(EssaySubject("Solo", (7.0,), 0),),
    )
    res = analyze_essay(exam, AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED))
    assert res.upper_lower.group_size == 0
    assert res.scoring.mean == 7.0
    assert res.scoring.std_dev == 7.0
    assert math.isnan(res.discrimination[0].index_percent)
    assert math.isnan(res.essay_upper_lower[0].t_value)
    assert any(w.code == "insufficient_upper_lower_group" for w in res.warnings)
