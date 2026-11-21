from pathlib import Path

from itemetri.domain import (
    AnalysisOptions,
    CompatibilityMode,
    EssayExam,
    EssaySubject,
    MultipleChoiceExam,
)
from itemetri.engine import analyze_essay, analyze_multiple_choice
from itemetri.io import read_ana, render_html_report, render_reliabel_txt


def test_reliabel_txt_byte_for_byte_match(
    anates_dir: Path,
    reliabel_txt_bytes: bytes,
) -> None:
    doc = read_ana(anates_dir / "ka ma2.ANA")
    assert isinstance(doc.exam, MultipleChoiceExam)
    analysis = analyze_multiple_choice(
        doc.exam,
        AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES),
    )
    rendered = render_reliabel_txt(
        analysis,
        source_label=r"D:\0 PRESENTATION\PBK\PBK MA\TAMPIL MI\ANALISIS\ANATESV4\KA MA2.ANA",
    )
    assert rendered.encode("cp1252") == reliabel_txt_bytes


def test_html_report_rendering_and_xss_escaping(anates_dir: Path) -> None:
    doc = read_ana(anates_dir / "biologi.ana")
    assert isinstance(doc.exam, MultipleChoiceExam)
    analysis = analyze_multiple_choice(
        doc.exam,
        AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
    )
    html = render_html_report(analysis)
    assert '<html lang="id">' in html
    assert "standard_corrected" in html
    assert "@media print" in html
    assert "—" not in html

    essay = EssayExam(
        ideal_scores=(10.0, 10.0),
        subjects=(
            EssaySubject("<script>alert(1)</script>", (9.0, 8.0), 0),
            EssaySubject("Siswa 2", (4.0, 5.0), 1),
            EssaySubject("Siswa 3", (3.0, 4.0), 2),
            EssaySubject("Siswa 4", (1.0, 2.0), 3),
        ),
    )
    essay_analysis = analyze_essay(
        essay,
        AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES),
    )
    essay_html = render_html_report(essay_analysis)
    assert "legacy_anates" in essay_html
    assert "<script>alert(1)</script>" not in essay_html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in essay_html
    assert "—" not in essay_html
