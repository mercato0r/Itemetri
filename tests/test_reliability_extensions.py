import math
from pathlib import Path

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from anates.domain import (
    AnalysisOptions,
    CompatibilityMode,
    EssayExam,
    EssaySubject,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    OptionCount,
)
from anates.engine import (
    analyze_essay,
    analyze_multiple_choice,
    compute_cronbach_alpha,
    compute_kr20,
    interpret_reliability,
)
from anates.io import read_ana


def test_mc_alpha_and_kr20_on_real_files(anates_dir: Path) -> None:
    for fname in ("biologi.ana", "ka ma2.ANA"):
        doc = read_ana(anates_dir / fname)
        assert isinstance(doc.exam, MultipleChoiceExam)
        res = analyze_multiple_choice(
            doc.exam,
            AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
        )
        alpha = res.reliability.cronbach_alpha
        kr20 = res.reliability.kr20
        assert alpha is not None and kr20 is not None
        assert math.isfinite(alpha) and math.isfinite(kr20)
        assert alpha == pytest.approx(kr20, abs=1e-12)

    lat2 = read_ana(anates_dir / "latihan2.ANA")
    assert isinstance(lat2.exam, MultipleChoiceExam)
    res_lat2 = analyze_multiple_choice(lat2.exam)
    assert res_lat2.reliability.cronbach_alpha is not None
    assert res_lat2.reliability.kr20 is not None
    assert math.isnan(res_lat2.reliability.cronbach_alpha)
    assert math.isnan(res_lat2.reliability.kr20)


def test_alpha_and_kr20_degenerate_shapes() -> None:
    assert math.isnan(compute_cronbach_alpha(np.array([[1.0, 0.0]], dtype=np.float64)))
    assert math.isnan(compute_cronbach_alpha(np.array([[1.0], [2.0]], dtype=np.float64)))
    assert math.isnan(compute_kr20(np.array([[True, False]], dtype=np.bool_)))
    assert math.isnan(compute_kr20(np.array([[True], [False]], dtype=np.bool_)))


def test_essay_alpha_and_no_kr20() -> None:
    exam = EssayExam(
        ideal_scores=(10.0, 10.0, 10.0),
        subjects=(
            EssaySubject("S1", (9.0, 8.0, 9.0), 0),
            EssaySubject("S2", (7.0, 6.0, 7.0), 1),
            EssaySubject("S3", (4.0, 3.0, 5.0), 2),
            EssaySubject("S4", (2.0, 1.0, 2.0), 3),
        ),
    )
    res = analyze_essay(exam)
    assert res.reliability.kr20 is None
    assert res.reliability.cronbach_alpha is not None
    assert res.reliability.cronbach_alpha > 0.8


def test_interpret_reliability_bands() -> None:
    assert interpret_reliability(None) == "Tidak terdefinisi"
    assert interpret_reliability(math.nan) == "Tidak terdefinisi"
    assert interpret_reliability(0.85) == "Sangat Tinggi"
    assert interpret_reliability(0.65) == "Tinggi"
    assert interpret_reliability(0.45) == "Cukup"
    assert interpret_reliability(0.25) == "Rendah"
    assert interpret_reliability(0.10) == "Sangat Rendah"


@settings(max_examples=80, deadline=None)
@given(
    n=st.integers(min_value=2, max_value=20),
    m=st.integers(min_value=2, max_value=15),
    data=st.data(),
)
def test_alpha_equals_kr20_property(n: int, m: int, data: st.DataObject) -> None:
    key = "a" * m
    subjects = tuple(
        MultipleChoiceSubject(
            name=f"S{i}",
            responses="".join(
                data.draw(st.lists(st.sampled_from(["a", "b"]), min_size=m, max_size=m))
            ),
            original_index=i,
        )
        for i in range(n)
    )
    exam = MultipleChoiceExam(answer_key=key, option_count=OptionCount(4), subjects=subjects)
    res = analyze_multiple_choice(exam)
    alpha = res.reliability.cronbach_alpha
    kr20 = res.reliability.kr20
    assert alpha is not None and kr20 is not None
    if not math.isnan(alpha):
        assert alpha == pytest.approx(kr20, abs=1e-12)
