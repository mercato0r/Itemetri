import io
import json
from pathlib import Path

import openpyxl
from fastapi.testclient import TestClient

from anates.domain import EssayExam, ExamKind, MultipleChoiceExam
from anates.io import preview_tabular_bytes, read_tabular_mapped_bytes
from anates.web import create_app


def _make_xlsx_bytes(rows: list[list[object]]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    wb.close()
    return buf.getvalue()


def test_flexible_preview_and_mapped_import_without_key_row() -> None:
    raw_csv = (
        b"NIS,Nama Siswa,Kelas,Butir 1,Butir 2,Butir 3\n"
        b"1001,Ali,X-A,a,b,c\n"
        b"1002,Budi,X-A,a,c,*\n"
        b"1003,Citra,X-B,b,b,d\n"
    )

    preview = preview_tabular_bytes(raw_csv, "raw_forms.csv")
    assert preview["total_rows"] == 4
    assert preview["total_cols"] == 6
    assert preview["suggested_mapping"]["has_header_row"] is True
    assert preview["suggested_mapping"]["key_row_index"] is None
    assert preview["suggested_mapping"]["inferred_kind"] == "multiple_choice"

    exam_mc = read_tabular_mapped_bytes(
        raw_csv,
        "raw_forms.csv",
        has_header_row=True,
        key_row_index=None,
        name_col_index=1,
        item_col_indices=[3, 4, 5],
        default_key_or_ideal="A",
    )
    assert isinstance(exam_mc, MultipleChoiceExam)
    assert exam_mc.answer_key == "AAA"
    assert [s.name for s in exam_mc.subjects] == ["Ali", "Budi", "Citra"]
    assert [s.responses for s in exam_mc.subjects] == ["abc", "ac*", "bbd"]

    xlsx_bytes = _make_xlsx_bytes(
        [
            ["ID", "Peserta", "1", "2"],
            ["S01", "Dina", 8, 12],
            ["S02", "Eko", 5, 15],
            ["S03", "Fajar", 9, 10],
        ]
    )
    xlsx_preview = preview_tabular_bytes(xlsx_bytes, "scores.xlsx")
    assert xlsx_preview["suggested_mapping"]["key_row_index"] is None
    assert xlsx_preview["suggested_mapping"]["inferred_kind"] == "essay"

    exam_essay = read_tabular_mapped_bytes(
        xlsx_bytes,
        "scores.xlsx",
        has_header_row=True,
        key_row_index=None,
        name_col_index=1,
        item_col_indices=[2, 3],
        kind=ExamKind.ESSAY,
    )
    assert isinstance(exam_essay, EssayExam)
    assert exam_essay.ideal_scores == (9.0, 15.0)
    assert exam_essay.item_numbers == (1, 2)
    assert exam_essay.subjects[0].name == "Dina"


def test_web_api_flexible_import_startup_and_session_patch(anates_dir: Path) -> None:
    raw_client = TestClient(create_app(samples_dir=anates_dir))
    assert raw_client.get("/api/startup").json() == {"has_startup": False}

    missing_patch = raw_client.post("/api/session/patch", json={"cell_patches": []})
    assert missing_patch.status_code == 400

    csv_bytes = (
        b"NIS,Nama,Kelas,No1,No2,No3\n"
        b"01,Ani,10A,a,b,c\n"
        b"02,Budi,10A,a,c,b\n"
        b"03,Cici,10B,b,b,d\n"
    )

    prev_res = raw_client.post(
        "/api/import/preview",
        files={"file": ("quiz.csv", csv_bytes, "text/csv")},
    )
    assert prev_res.status_code == 200
    assert prev_res.json()["suggested_mapping"]["key_row_index"] is None

    map_res = raw_client.post(
        "/api/import/mapped",
        files={"file": ("quiz.csv", csv_bytes, "text/csv")},
        data={
            "has_header_row": "true",
            "key_row_index": "",
            "name_col_index": "1",
            "item_cols_json": json.dumps([3, 4, 5]),
            "kind": "auto",
            "default_key_or_ideal": "B",
        },
    )
    assert map_res.status_code == 200
    mapped_body = map_res.json()
    assert mapped_body["exam"]["answer_key"] == "BBB"
    assert [s["name"] for s in mapped_body["exam"]["mc_subjects"]] == ["Ani", "Budi", "Cici"]

    patch_res = raw_client.post(
        "/api/session/patch",
        json={
            "cell_patches": [
                {"row": -1, "col": 0, "value": "a"},
                {"row": 0, "col": 1, "value": "c"},
            ]
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["analysis"]["subject_count"] == 3

    startup_client = TestClient(
        create_app(samples_dir=anates_dir, startup_exam_path=anates_dir / "biologi.ana")
    )
    start_res = startup_client.get("/api/startup")
    assert start_res.status_code == 200
    start_body = start_res.json()
    assert start_body["has_startup"] is True
    assert start_body["analysis"]["subject_count"] == 38
