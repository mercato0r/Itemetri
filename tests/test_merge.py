from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from anates.cli import app as cli_app
from anates.domain import (
    DomainValidationError,
    EssayExam,
    EssaySubject,
    MergeAxis,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    OptionCount,
)
from anates.engine import merge_exams
from anates.io import read_ana
from anates.web import create_app


def _mc_exam(
    *,
    key: str = "abcd",
    option_count: int = 4,
    subjects: tuple[tuple[str, str], ...],
    source_path: str | None = "p.ana",
) -> MultipleChoiceExam:
    return MultipleChoiceExam(
        answer_key=key,
        option_count=OptionCount(option_count),
        subjects=tuple(
            MultipleChoiceSubject(name=name, responses=resp, original_index=idx)
            for idx, (name, resp) in enumerate(subjects)
        ),
        source_path=source_path,
    )


def _essay_exam(
    *,
    ideal: tuple[float, ...],
    item_numbers: tuple[int, ...] = (),
    subjects: tuple[tuple[str, tuple[float | None, ...]], ...],
    source_path: str | None = "e.ana",
) -> EssayExam:
    return EssayExam(
        ideal_scores=ideal,
        item_numbers=item_numbers,
        subjects=tuple(
            EssaySubject(name=name, scores=scores, original_index=idx)
            for idx, (name, scores) in enumerate(subjects)
        ),
        source_path=source_path,
    )


def test_merge_mc_subjects_and_items() -> None:
    p = _mc_exam(subjects=(("Ali", "abcd"), ("Budi", "abcc")))
    s = _mc_exam(subjects=(("Citra", "abdd"), ("Ali", "abcd")))

    merged_sub = merge_exams(p, s, axis=MergeAxis.APPEND_SUBJECTS)
    assert merged_sub.added_subjects == 2
    assert merged_sub.added_items == 0
    assert isinstance(merged_sub.exam, MultipleChoiceExam)
    assert len(merged_sub.exam.subjects) == 4
    assert [sub.original_index for sub in merged_sub.exam.subjects] == [0, 1, 2, 3]
    assert merged_sub.exam.source_path == "p_merged.ana"
    assert [w.code for w in merged_sub.warnings] == ["merge_duplicate_subject_name"]

    p2 = _mc_exam(key="ab", subjects=(("Ali", "ab"), ("Budi", "ac")), option_count=4)
    s2 = _mc_exam(key="cd", subjects=(("Ali", "cd"), ("Budi", "dd")), option_count=5)
    merged_itm = merge_exams(p2, s2, axis=MergeAxis.APPEND_ITEMS)
    assert merged_itm.added_subjects == 0
    assert merged_itm.added_items == 2
    assert isinstance(merged_itm.exam, MultipleChoiceExam)
    assert merged_itm.exam.answer_key == "abcd"
    assert int(merged_itm.exam.option_count) == 5
    assert [sub.responses for sub in merged_itm.exam.subjects] == ["abcd", "acdd"]
    assert [w.code for w in merged_itm.warnings] == ["merge_option_count_mismatch"]


def test_merge_essay_subjects_and_items_and_validation() -> None:
    p = _essay_exam(ideal=(10.0, 20.0), subjects=(("A", (8.0, 15.0)), ("B", (6.0, 12.0))))
    s = _essay_exam(ideal=(10.0, 20.0), subjects=(("C", (9.0, 18.0)),))

    res_sub = merge_exams(p, s, axis=MergeAxis.APPEND_SUBJECTS)
    assert res_sub.added_subjects == 1
    assert isinstance(res_sub.exam, EssayExam)
    assert len(res_sub.exam.subjects) == 3

    s_items = _essay_exam(
        ideal=(15.0, 10.0),
        item_numbers=(1, 2),
        subjects=(("A", (12.0, 8.0)), ("X", (9.0, 5.0))),
    )
    res_itm = merge_exams(p, s_items, axis=MergeAxis.APPEND_ITEMS)
    assert res_itm.added_items == 2
    assert isinstance(res_itm.exam, EssayExam)
    assert res_itm.exam.ideal_scores == (10.0, 20.0, 15.0, 10.0)
    assert res_itm.exam.item_numbers == (1, 2, 3, 4)
    warn_codes = {w.code for w in res_itm.warnings}
    assert "merge_item_numbers_renumbered" in warn_codes
    assert "merge_subject_name_mismatch" in warn_codes

    with pytest.raises(DomainValidationError):
        merge_exams(
            _mc_exam(key="aa", subjects=(("A", "aa"),)),
            _essay_exam(ideal=(10.0, 10.0), subjects=(("A", (5.0, 5.0)),)),
        )

    p_diff = _mc_exam(key="ab", subjects=(("A", "ab"),))
    s_diff = _mc_exam(key="ac", subjects=(("B", "ac"),))
    with pytest.raises(DomainValidationError):
        merge_exams(p_diff, s_diff, require_matching_key=True)

    relaxed = merge_exams(p_diff, s_diff, require_matching_key=False)
    assert [w.code for w in relaxed.warnings] == ["merge_key_mismatch"]


def test_cli_merge_command(anates_dir: Path, tmp_path: Path) -> None:
    bio = anates_dir / "biologi.ana"
    kama = anates_dir / "ka ma2.ANA"
    out_ana = tmp_path / "merged_bio.ana"

    runner = CliRunner()
    res_ok = runner.invoke(
        cli_app,
        ["merge", str(bio), str(bio), str(out_ana), "--with-analysis"],
    )
    assert res_ok.exit_code == 0
    assert "N=76, M=30, +subjects=38" in res_ok.stdout
    loaded = read_ana(out_ana)
    assert int(loaded.exam.subject_count) == 76

    res_fail = runner.invoke(
        cli_app,
        ["merge", str(bio), str(kama), str(tmp_path / "bad.ana")],
    )
    assert res_fail.exit_code == 1
    assert "Error:" in res_fail.output


def test_web_api_merge_endpoint(anates_dir: Path, tmp_path: Path) -> None:
    client = TestClient(create_app(samples_dir=anates_dir))
    bio = client.post("/api/samples/biologi.ana").json()
    exam_json = client.post("/api/samples/biologi.ana").json()["exam"]
    assert bio["analysis"]["subject_count"] == 38

    import json

    res_sample = client.post(
        "/api/merge",
        data={
            "exam_json": json.dumps(exam_json),
            "axis": "subjects",
            "require_matching_key": "true",
            "sample_filename": "biologi.ana",
        },
    )
    assert res_sample.status_code == 200
    body = res_sample.json()
    assert body["analysis"]["subject_count"] == 76
    assert body["merge_summary"]["added_subjects"] == 38
    assert body["merge_summary"]["axis"] == "subjects"

    ana_bytes = (anates_dir / "biologi.ana").read_bytes()
    res_upload = client.post(
        "/api/merge",
        data={
            "exam_json": json.dumps(exam_json),
            "axis": "items",
            "require_matching_key": "true",
        },
        files={"file": ("biologi2.ana", ana_bytes, "application/xml")},
    )
    assert res_upload.status_code == 200
    assert res_upload.json()["analysis"]["item_count"] == 60
    assert res_upload.json()["merge_summary"]["added_items"] == 30

    lat1_bytes = (anates_dir / "lat1.ANA").read_bytes()
    res_mismatch = client.post(
        "/api/merge",
        data={
            "exam_json": json.dumps(exam_json),
            "axis": "subjects",
            "require_matching_key": "true",
        },
        files={"file": ("lat1.ANA", lat1_bytes, "application/xml")},
    )
    assert res_mismatch.status_code == 422

    res_missing_src = client.post(
        "/api/merge",
        data={"exam_json": json.dumps(exam_json), "axis": "subjects"},
    )
    assert res_missing_src.status_code == 400
