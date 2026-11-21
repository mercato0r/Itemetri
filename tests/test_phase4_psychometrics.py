import csv
import math
from pathlib import Path

import numpy as np
import openpyxl
import pytest
from fastapi.testclient import TestClient
from hypothesis import given, settings
from hypothesis import strategies as st
from typer.testing import CliRunner

from itemetri.cli import app as cli_app
from itemetri.domain import (
    AnalysisOptions,
    CompatibilityMode,
    EssayExam,
    EssaySubject,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    OptionCount,
    ScoringWeights,
)
from itemetri.engine import (
    analyze_essay,
    analyze_multiple_choice,
    compute_alpha_if_deleted,
    compute_corrected_item_totals,
    compute_cronbach_alpha,
    compute_kr20,
    compute_kr21,
)
from itemetri.io import (
    read_ana,
    render_html_report,
    write_csv_analysis,
    write_xlsx_analysis,
)
from itemetri.web import create_app


def _manual_pearson(x: np.ndarray, y: np.ndarray) -> float:
    xc = x - float(np.mean(x))
    yc = y - float(np.mean(y))
    denom = float(np.dot(xc, xc)) * float(np.dot(yc, yc))
    if denom <= 0.0:
        return math.nan
    return float(np.clip(float(np.dot(xc, yc)) / math.sqrt(denom), -1.0, 1.0))


def test_kr21_formula_and_ordering_on_real_files(anates_dir: Path) -> None:
    for fname in ("biologi.ana", "ka ma2.ANA"):
        doc = read_ana(anates_dir / fname)
        assert isinstance(doc.exam, MultipleChoiceExam)
        res = analyze_multiple_choice(
            doc.exam,
            AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
        )
        kr20 = res.reliability.kr20
        kr21 = res.reliability.kr21
        assert kr20 is not None and kr21 is not None
        assert math.isfinite(kr20) and math.isfinite(kr21)
        assert kr21 <= kr20 + 1e-12

    equal_difficulty = np.array(
        [
            [True, True, True, True],
            [True, True, False, False],
            [False, False, True, True],
            [False, False, False, False],
        ],
        dtype=np.bool_,
    )
    kr21_eq = compute_kr21(equal_difficulty)
    assert math.isfinite(kr21_eq)
    assert kr21_eq == pytest.approx(
        compute_kr20(equal_difficulty),
        abs=1e-12,
    )

    assert math.isnan(compute_kr21(np.array([[True, False]], dtype=np.bool_)))
    assert math.isnan(compute_kr21(np.array([[True], [False]], dtype=np.bool_)))
    assert math.isnan(compute_kr21(np.array([[True, False], [True, False]], dtype=np.bool_)))


@settings(max_examples=80, deadline=None)
@given(
    n=st.integers(min_value=2, max_value=20),
    m=st.integers(min_value=2, max_value=15),
    data=st.data(),
)
def test_kr21_le_kr20_property(n: int, m: int, data: st.DataObject) -> None:
    mat = np.array(
        [
            data.draw(st.lists(st.booleans(), min_size=m, max_size=m))
            for _ in range(n)
        ],
        dtype=np.bool_,
    )
    kr20 = compute_kr20(mat)
    kr21 = compute_kr21(mat)
    if math.isnan(kr20):
        assert math.isnan(kr21)
    else:
        assert kr21 <= kr20 + 1e-12


def test_corrected_item_totals_unweighted_and_weighted_mc() -> None:
    exam = MultipleChoiceExam(
        answer_key="aaa",
        option_count=OptionCount(4),
        weights=ScoringWeights(correct=3.0, wrong=-1.0),
        subjects=(
            MultipleChoiceSubject("S1", "aaa", 0),
            MultipleChoiceSubject("S2", "aab", 1),
            MultipleChoiceSubject("S3", "aba", 2),
            MultipleChoiceSubject("S4", "bbb", 3),
            MultipleChoiceSubject("S5", "ab*", 4),
        ),
    )

    unweighted = analyze_multiple_choice(
        exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED, use_weighted_score=False),
    )
    x_mat = np.array(
        [
            [1.0, 1.0, 1.0],
            [1.0, 1.0, 0.0],
            [1.0, 0.0, 1.0],
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
        ],
        dtype=np.float64,
    )
    raw_tot = x_mat.sum(axis=1)
    for j, corr in enumerate(unweighted.correlations):
        expected_r = _manual_pearson(x_mat[:, j], raw_tot - x_mat[:, j])
        assert corr.corrected_correlation is not None
        assert corr.corrected_correlation == pytest.approx(expected_r, abs=1e-12)
        assert corr.corrected_p_value is not None

    weighted = analyze_multiple_choice(
        exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED, use_weighted_score=True),
    )
    contrib = np.array(
        [
            [3.0, 3.0, 3.0],
            [3.0, 3.0, -1.0],
            [3.0, -1.0, 3.0],
            [-1.0, -1.0, -1.0],
            [3.0, -1.0, 0.0],
        ],
        dtype=np.float64,
    )
    w_tot = contrib.sum(axis=1)
    for j, corr in enumerate(weighted.correlations):
        expected_r = _manual_pearson(x_mat[:, j], w_tot - contrib[:, j])
        assert corr.corrected_correlation is not None
        assert corr.corrected_correlation == pytest.approx(expected_r, abs=1e-12)

    single_item = MultipleChoiceExam(
        answer_key="a",
        option_count=OptionCount(4),
        subjects=(
            MultipleChoiceSubject("S1", "a", 0),
            MultipleChoiceSubject("S2", "b", 1),
        ),
    )
    res_single = analyze_multiple_choice(single_item)
    assert res_single.correlations[0].corrected_correlation is not None
    assert math.isnan(res_single.correlations[0].corrected_correlation)


@settings(max_examples=60, deadline=None)
@given(
    n=st.integers(min_value=2, max_value=15),
    m=st.integers(min_value=2, max_value=10),
    data=st.data(),
)
def test_corrected_item_totals_bounds_property(n: int, m: int, data: st.DataObject) -> None:
    mat = np.array(
        [
            data.draw(
                st.lists(
                    st.floats(min_value=0.0, max_value=20.0, allow_nan=False, allow_infinity=False),
                    min_size=m,
                    max_size=m,
                )
            )
            for _ in range(n)
        ],
        dtype=np.float64,
    )
    r_corr = compute_corrected_item_totals(mat, mat.sum(axis=1))
    for val in r_corr:
        if not math.isnan(val):
            assert -1.0 - 1e-12 <= float(val) <= 1.0 + 1e-12


def test_alpha_if_deleted_matches_leave_one_out(anates_dir: Path) -> None:
    doc = read_ana(anates_dir / "biologi.ana")
    assert isinstance(doc.exam, MultipleChoiceExam)
    res = analyze_multiple_choice(doc.exam)
    key = doc.exam.answer_key.upper()
    x_mat = np.array(
        [
            [1.0 if s.responses[j].upper() == key[j] else 0.0 for j in range(len(key))]
            for s in doc.exam.subjects
        ],
        dtype=np.float64,
    )
    for j, corr in enumerate(res.correlations):
        expected = compute_cronbach_alpha(np.delete(x_mat, j, axis=1))
        assert corr.alpha_if_deleted is not None
        assert corr.alpha_if_deleted == pytest.approx(expected, abs=1e-10)

    essay = EssayExam(
        ideal_scores=(10.0, 10.0, 10.0, 10.0),
        subjects=(
            EssaySubject("S1", (9.0, 8.0, 9.0, 2.0), 0),
            EssaySubject("S2", (7.0, 6.0, 7.0, 5.0), 1),
            EssaySubject("S3", (4.0, 3.0, 5.0, 8.0), 2),
            EssaySubject("S4", (2.0, 1.0, 2.0, 10.0), 3),
        ),
    )
    e_res = analyze_essay(essay)
    assert e_res.reliability.kr21 is None
    e_mat = np.array(
        [[0.0 if v is None else float(v) for v in s.scores] for s in essay.subjects],
        dtype=np.float64,
    )
    for j, corr in enumerate(e_res.correlations):
        expected = compute_cronbach_alpha(np.delete(e_mat, j, axis=1))
        assert corr.alpha_if_deleted is not None
        assert corr.alpha_if_deleted == pytest.approx(expected, abs=1e-10)

    small = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]], dtype=np.float64)
    assert np.all(np.isnan(compute_alpha_if_deleted(small)))


def test_phase4_metrics_surfaced_across_outputs(anates_dir: Path, tmp_path: Path) -> None:
    bio = anates_dir / "biologi.ana"
    doc = read_ana(bio)
    assert isinstance(doc.exam, MultipleChoiceExam)
    analysis = analyze_multiple_choice(doc.exam)

    html = render_html_report(analysis)
    assert "KR-21" in html
    assert "Alpha Cronbach" in html
    assert "r_corr" in html
    assert "\u03b1(-j)" in html
    assert "\u2014" not in html

    csv_path = tmp_path / "bio.csv"
    write_csv_analysis(csv_path, analysis)
    rows = list(csv.reader(csv_path.open(encoding="utf-8")))
    meta_keys = {r[0] for r in rows if r and r[0].startswith("#")}
    assert "# CronbachAlpha" in meta_keys
    assert "# KR20" in meta_keys
    assert "# KR21" in meta_keys
    header = next(r for r in rows if r and r[0] == "No.Urut")
    assert "KorelasiTerkoreksi" in header
    assert "AlphaJikaDihapus" in header

    xlsx_path = tmp_path / "bio.xlsx"
    write_xlsx_analysis(xlsx_path, analysis)
    wb = openpyxl.load_workbook(xlsx_path)
    assert wb["Ringkasan"]["B2"].value == "standard_corrected"
    summary_labels = {wb["Ringkasan"].cell(r, 1).value for r in range(1, 20)}
    assert "KR-21" in summary_labels
    assert "Alpha Cronbach" in summary_labels
    corr_headers = [wb["Korelasi Butir"].cell(1, c).value for c in range(1, 10)]
    assert corr_headers == [
        "No.Urut",
        "No.Butir",
        "r",
        "p",
        "Signifikansi",
        "r_corr",
        "p_corr",
        "Signifikansi_corr",
        "Alpha_jika_dihapus",
    ]
    wb.close()

    runner = CliRunner()
    cli_res = runner.invoke(cli_app, ["analyze", str(bio)])
    assert cli_res.exit_code == 0
    assert "KR-21=" in cli_res.stdout
    assert "r_corr" in cli_res.stdout
    assert "a(-j)" in cli_res.stdout

    client = TestClient(create_app(samples_dir=anates_dir))
    api_res = client.post("/api/samples/biologi.ana")
    assert api_res.status_code == 200
    body = api_res.json()
    assert body["analysis"]["reliability"]["kr21"] is not None
    assert body["analysis"]["interpretations"]["kr21"] is not None
    first_corr = body["analysis"]["correlations"][0]
    assert first_corr["corrected_correlation"] is not None
    assert first_corr["alpha_if_deleted"] is not None
