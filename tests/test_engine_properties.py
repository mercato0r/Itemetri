import math

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st

from itemetri.domain import (
    AnalysisOptions,
    CompatibilityMode,
    DifficultyCategory,
    EssayExam,
    EssaySubject,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    OptionCount,
)
from itemetri.engine import (
    analyze_essay,
    analyze_multiple_choice,
    classify_difficulty,
    mean_and_std_dev,
)


@st.composite
def _mc_exams(draw: st.DrawFn) -> MultipleChoiceExam:
    k = draw(st.integers(min_value=2, max_value=5))
    m = draw(st.integers(min_value=1, max_value=20))
    n = draw(st.integers(min_value=1, max_value=30))
    letters = [chr(ord("a") + i) for i in range(k)]
    answer_key = "".join(draw(st.lists(st.sampled_from(letters), min_size=m, max_size=m)))
    choices = [*letters, "*", "#"]
    subjects = tuple(
        MultipleChoiceSubject(
            name=f"S{idx + 1}",
            responses="".join(draw(st.lists(st.sampled_from(choices), min_size=m, max_size=m))),
            original_index=idx,
        )
        for idx in range(n)
    )
    return MultipleChoiceExam(
        answer_key=answer_key,
        option_count=OptionCount(k),
        subjects=subjects,
    )


@st.composite
def _essay_exams(draw: st.DrawFn) -> EssayExam:
    m = draw(st.integers(min_value=1, max_value=12))
    n = draw(st.integers(min_value=1, max_value=25))
    ideals = tuple(
        draw(
            st.lists(
                st.floats(min_value=1.0, max_value=50.0, allow_nan=False, allow_infinity=False),
                min_size=m,
                max_size=m,
            )
        )
    )
    subjects: list[EssaySubject] = []
    for idx in range(n):
        row_scores: list[float | None] = []
        for ideal in ideals:
            if draw(st.booleans()):
                row_scores.append(
                    draw(
                        st.floats(
                            min_value=0.0,
                            max_value=ideal,
                            allow_nan=False,
                            allow_infinity=False,
                        )
                    )
                )
            else:
                row_scores.append(None)
        subjects.append(
            EssaySubject(name=f"E{idx + 1}", scores=tuple(row_scores), original_index=idx)
        )
    return EssayExam(ideal_scores=ideals, subjects=tuple(subjects))


@settings(max_examples=100, deadline=None)
@given(exam=_mc_exams())
def test_mc_standard_corrected_invariants(exam: MultipleChoiceExam) -> None:
    res = analyze_multiple_choice(
        exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
    )

    if int(exam.subject_count) == 1:
        assert res.scoring.mean == res.scoring.subjects[0].raw_score
        assert res.scoring.std_dev == res.scoring.mean

    for item in res.difficulty:
        assert 0.0 <= item.index_percent <= 100.0
        assert isinstance(item.category, DifficultyCategory)

    for corr in res.correlations:
        if not math.isnan(corr.correlation):
            assert -1.0 <= corr.correlation <= 1.0


@settings(max_examples=100, deadline=None)
@given(exam=_essay_exams())
def test_essay_standard_corrected_invariants(exam: EssayExam) -> None:
    res = analyze_essay(
        exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
    )

    if int(exam.subject_count) == 1:
        assert res.scoring.mean == res.scoring.subjects[0].total_score
        assert res.scoring.std_dev == res.scoring.mean

    for item in res.difficulty:
        assert 0.0 <= item.index_percent <= 100.0 + 1e-12
        assert isinstance(item.category, DifficultyCategory)

    for corr in res.correlations:
        if not math.isnan(corr.correlation):
            assert -1.0 <= corr.correlation <= 1.0


@given(
    x=st.floats(min_value=-1e4, max_value=1e4, allow_nan=False, allow_infinity=False),
)
def test_single_subject_mean_equals_sd(x: float) -> None:
    mean, sd = mean_and_std_dev(np.array([x], dtype=np.float64))
    assert mean == x
    assert sd == x


@given(
    tk=st.one_of(
        st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
        st.floats(min_value=30.0001, max_value=31.0, allow_nan=False, allow_infinity=False),
        st.floats(min_value=70.0001, max_value=71.0, allow_nan=False, allow_infinity=False),
    )
)
def test_corrected_difficulty_contiguous_no_gaps(tk: float) -> None:
    cat = classify_difficulty(tk, CompatibilityMode.STANDARD_CORRECTED)
    assert cat is not None
    if 30.0 < tk <= 70.0:
        assert cat is DifficultyCategory.MEDIUM
    elif 70.0 < tk <= 85.0:
        assert cat is DifficultyCategory.EASY


def test_zero_variance_returns_nan_without_exception() -> None:
    exam = MultipleChoiceExam(
        answer_key="aaaa",
        option_count=OptionCount(4),
        subjects=(
            MultipleChoiceSubject("S1", "aaaa", 0),
            MultipleChoiceSubject("S2", "aaaa", 1),
            MultipleChoiceSubject("S3", "aaaa", 2),
            MultipleChoiceSubject("S4", "aaaa", 3),
        ),
    )
    res = analyze_multiple_choice(exam, AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED))
    assert all(math.isnan(c.correlation) for c in res.correlations)
    assert math.isnan(res.reliability.correlation_xy)
    assert math.isnan(res.reliability.reliability_coefficient)
