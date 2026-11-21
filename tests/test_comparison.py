from pathlib import Path

import pytest

from anates.domain import EssayExam, EssaySubject, MultipleChoiceExam
from anates.engine import compare_modes
from anates.io import read_ana


def test_compare_modes_biologi_and_lat1(anates_dir: Path) -> None:
    bio_doc = read_ana(anates_dir / "biologi.ana")
    assert isinstance(bio_doc.exam, MultipleChoiceExam)
    bio_diff = compare_modes(bio_doc.exam)

    changed_items = [c.item_number for c in bio_diff.significance_changes]
    # Exact t(df=36): #9 (r=0.394122) has p~0.0143 > 0.01 so 5 items shift vs coarse df=40.
    assert changed_items == [1, 3, 14, 19, 21]
    assert bio_diff.legacy_reliability == pytest.approx(0.760163, abs=1e-6)
    assert bio_diff.corrected_reliability == pytest.approx(0.788073, abs=1e-6)

    lat1_doc = read_ana(anates_dir / "lat1.ANA")
    assert isinstance(lat1_doc.exam, MultipleChoiceExam)
    lat1_diff = compare_modes(lat1_doc.exam)
    assert [c.item_number for c in lat1_diff.significance_changes] == [2, 8, 12, 13]


def test_compare_modes_ka_ma2(anates_dir: Path) -> None:
    doc = read_ana(anates_dir / "ka ma2.ANA")
    diff = compare_modes(doc.exam)
    assert diff.legacy_correlation_xy == pytest.approx(0.461127, abs=1e-6)
    assert diff.corrected_correlation_xy == pytest.approx(0.480213, abs=1e-6)
    assert diff.legacy_reliability == pytest.approx(0.631193, abs=1e-6)
    assert diff.corrected_reliability == pytest.approx(0.648843, abs=1e-6)
    assert diff.reliability_delta == pytest.approx(0.648843 - 0.631193, abs=1e-5)


def test_compare_modes_essay_captures_tk_and_se_deltas() -> None:
    exam = EssayExam(
        ideal_scores=(10.0,),
        subjects=(
            EssaySubject("S1", (9.0,), 0),
            EssaySubject("S2", (None,), 1),
            EssaySubject("S3", (8.0,), 2),
            EssaySubject("S4", (5.0,), 3),
            EssaySubject("S5", (5.0,), 4),
            EssaySubject("S6", (4.0,), 5),
            EssaySubject("S7", (2.0,), 6),
            EssaySubject("S8", (1.0,), 7),
        ),
    )
    diff = compare_modes(exam)
    metrics = {d.metric for d in diff.item_deltas}
    assert "difficulty_percent" in metrics
    assert "se_pooled" in metrics
    assert "t_value" in metrics
