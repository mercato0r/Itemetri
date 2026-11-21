import sys
from pathlib import Path

import pytest

from anates.desktop import main as desktop_main
from anates.engine import analyze_exam
from anates.io.reports import render_html_report
from anates.io.xml_ana import read_ana
from anates.web.app import _default_static_dir, create_app


def test_desktop_check_self_test(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = desktop_main(["--check"])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "status=ok" in captured.out


def test_frozen_meipass_resource_resolution(
    monkeypatch: pytest.MonkeyPatch,
    anates_dir: Path,
    tmp_path: Path,
) -> None:
    fake_meipass = tmp_path / "meipass"
    templates_dir = fake_meipass / "anates" / "io" / "templates"
    static_dir = fake_meipass / "anates" / "web" / "static"
    templates_dir.mkdir(parents=True)
    static_dir.mkdir(parents=True)

    real_tpl = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "anates"
        / "io"
        / "templates"
        / "report.html.j2"
    )
    (templates_dir / "report.html.j2").write_text(
        real_tpl.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (static_dir / "index.html").write_text("<html><title>Frozen</title></html>", encoding="utf-8")

    monkeypatch.setattr(sys, "_MEIPASS", str(fake_meipass), raising=False)
    monkeypatch.setattr(sys, "frozen", True, raising=False)

    assert _default_static_dir() == static_dir
    app = create_app(samples_dir=anates_dir)
    assert app is not None

    doc = read_ana(anates_dir / "biologi.ana")
    analysis = analyze_exam(doc.exam)
    html = render_html_report(analysis)
    assert "Analisis Butir Soal" in html
