import base64
import sys
from pathlib import Path

import pytest

from itemetri.desktop import main as desktop_main
from itemetri.engine import analyze_exam
from itemetri.io.reports import render_html_report
from itemetri.io.xml_ana import read_ana
from itemetri.web.app import _default_static_dir, create_app
from itemetri.desktop import _DesktopBridge


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
    templates_dir = fake_meipass / "itemetri" / "io" / "templates"
    static_dir = fake_meipass / "itemetri" / "web" / "static"
    templates_dir.mkdir(parents=True)
    static_dir.mkdir(parents=True)

    real_tpl = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "itemetri"
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


class _FakeWebviewWindow:
    def __init__(self, result: object) -> None:
        self._result = result
        self.calls: list[dict[str, object]] = []

    def create_file_dialog(
        self,
        dialog_type: int,
        *,
        directory: str = "",
        save_filename: str = "",
        file_types: tuple[str, ...] = (),
    ) -> object:
        self.calls.append(
            {
                "dialog_type": dialog_type,
                "directory": directory,
                "save_filename": save_filename,
                "file_types": file_types,
            }
        )
        return self._result


def test_desktop_bridge_save_file_writes_selected_path(tmp_path: Path) -> None:
    target = tmp_path / "laporan.txt"
    bridge = _DesktopBridge()
    win = _FakeWebviewWindow((str(target),))
    bridge.attach_window(win)

    payload = base64.b64encode(b"Hasil Itemetri").decode("ascii")
    res = bridge.save_file("laporan.txt", payload, ["Teks (*.txt)"])

    assert res == {"saved": True, "cancelled": False, "path": str(target)}
    assert target.read_bytes() == b"Hasil Itemetri"
    assert len(win.calls) == 1
    assert win.calls[0]["save_filename"] == "laporan.txt"


def test_desktop_bridge_save_file_handles_cancel() -> None:
    bridge = _DesktopBridge()
    bridge.attach_window(_FakeWebviewWindow(None))

    res = bridge.save_file("laporan.pdf", "")
    assert res == {"saved": False, "cancelled": True}


def test_desktop_bridge_save_file_requires_window() -> None:
    bridge = _DesktopBridge()
    res = bridge.save_file("laporan.pdf", "")
    assert res["saved"] is False
    assert "error" in res
