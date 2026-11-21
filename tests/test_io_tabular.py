from pathlib import Path

import openpyxl
import pytest

from itemetri.domain import (
    AnalysisOptions,
    CompatibilityMode,
    EssayExam,
    EssaySubject,
    ExamKind,
    MultipleChoiceExam,
    ParseError,
)
from itemetri.engine import analyze_essay, analyze_multiple_choice
from itemetri.io import (
    read_ana,
    read_csv_exam,
    read_xlsx_exam,
    write_csv_analysis,
    write_csv_exam,
    write_xlsx_analysis,
    write_xlsx_exam,
)


def test_mc_csv_and_xlsx_round_trip(anates_dir: Path, tmp_path: Path) -> None:
    doc = read_ana(anates_dir / "biologi.ana")
    exam = doc.exam
    assert isinstance(exam, MultipleChoiceExam)

    csv_path = tmp_path / "bio.csv"
    xlsx_path = tmp_path / "bio.xlsx"
    write_csv_exam(csv_path, exam)
    write_xlsx_exam(xlsx_path, exam)

    from_csv = read_csv_exam(csv_path, option_count=5)
    from_xlsx = read_xlsx_exam(xlsx_path, option_count=5)
    assert isinstance(from_csv, MultipleChoiceExam)
    assert isinstance(from_xlsx, MultipleChoiceExam)
    assert from_csv.answer_key == exam.answer_key
    assert from_xlsx.answer_key == exam.answer_key
    assert [s.responses for s in from_csv.subjects] == [s.responses for s in exam.subjects]
    assert [s.responses for s in from_xlsx.subjects] == [s.responses for s in exam.subjects]


def test_essay_csv_and_xlsx_round_trip(tmp_path: Path) -> None:
    exam = EssayExam(
        ideal_scores=(10.0, 20.0),
        item_numbers=(3, 7),
        subjects=(
            EssaySubject("Ana", (8.5, None), 0),
            EssaySubject("Budi", (10.0, 15.0), 1),
        ),
    )
    csv_path = tmp_path / "essay.csv"
    xlsx_path = tmp_path / "essay.xlsx"
    write_csv_exam(csv_path, exam)
    write_xlsx_exam(xlsx_path, exam)

    from_csv = read_csv_exam(csv_path)
    from_xlsx = read_xlsx_exam(xlsx_path)
    assert isinstance(from_csv, EssayExam)
    assert isinstance(from_xlsx, EssayExam)
    assert from_csv.ideal_scores == (10.0, 20.0)
    assert from_csv.item_numbers == (3, 7)
    assert from_csv.subjects[0].scores == (8.5, None)
    assert from_xlsx.ideal_scores == (10.0, 20.0)
    assert from_xlsx.item_numbers == (3, 7)
    assert from_xlsx.subjects[0].scores == (8.5, None)


def test_semicolon_cp1252_csv_import(tmp_path: Path) -> None:
    csv_path = tmp_path / "semi.csv"
    content = "Nama;1;2;3\nKunci;a;b;c\nJosé;a;b;*\n"
    csv_path.write_bytes(content.encode("cp1252"))
    exam = read_csv_exam(csv_path)
    assert exam.kind is ExamKind.MULTIPLE_CHOICE
    assert exam.subjects[0].name == "José"
    assert isinstance(exam, MultipleChoiceExam)
    assert exam.subjects[0].responses == "ab*"


def test_analysis_exports_csv_and_xlsx(anates_dir: Path, tmp_path: Path) -> None:
    mc_doc = read_ana(anates_dir / "latihan2.ANA")
    assert isinstance(mc_doc.exam, MultipleChoiceExam)
    mc_analysis = analyze_multiple_choice(
        mc_doc.exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
    )

    mc_csv = tmp_path / "mc_out.csv"
    mc_xlsx = tmp_path / "mc_out.xlsx"
    write_csv_analysis(mc_csv, mc_analysis)
    write_xlsx_analysis(mc_xlsx, mc_analysis)
    assert "standard_corrected" in mc_csv.read_text(encoding="utf-8")

    wb = openpyxl.load_workbook(mc_xlsx)
    assert wb.sheetnames == [
        "Ringkasan",
        "Skor Subyek",
        "Reliabilitas",
        "Daya Pembeda",
        "Tingkat Kesukaran",
        "Korelasi Butir",
        "Pengecoh",
    ]
    assert wb["Ringkasan"]["B2"].value == "standard_corrected"
    assert wb["Reliabilitas"]["B10"] is not None
    wb.close()

    essay_exam = EssayExam(
        ideal_scores=(10.0, 10.0),
        subjects=(
            EssaySubject("S1", (9.0, 8.0), 0),
            EssaySubject("S2", (5.0, 5.0), 1),
            EssaySubject("S3", (4.0, 3.0), 2),
            EssaySubject("S4", (1.0, 2.0), 3),
        ),
    )
    essay_analysis = analyze_essay(essay_exam)
    essay_xlsx = tmp_path / "essay_out.xlsx"
    write_xlsx_analysis(essay_xlsx, essay_analysis)
    wb_e = openpyxl.load_workbook(essay_xlsx)
    assert "Unggul Asor" in wb_e.sheetnames
    assert "Rekap Butir" in wb_e.sheetnames
    wb_e.close()


def test_malformed_tabular_raises_parse_error(tmp_path: Path) -> None:
    bad_csv = tmp_path / "bad.csv"
    bad_csv.write_text("Nama,1,2\nNotKunci,a,b\nAli,a,b\n", encoding="utf-8")
    with pytest.raises(ParseError) as exc_info:
        read_csv_exam(bad_csv)
    assert exc_info.value.line == 2
