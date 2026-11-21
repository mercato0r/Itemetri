import json
from pathlib import Path

from typer.testing import CliRunner

from itemetri.cli import app

runner = CliRunner()


def test_cli_inspect_and_analyze_single_and_batch(anates_dir: Path, tmp_path: Path) -> None:
    bio = anates_dir / "biologi.ana"
    kama = anates_dir / "ka ma2.ANA"

    res_inspect = runner.invoke(app, ["inspect", str(bio)])
    assert res_inspect.exit_code == 0
    assert "Schema: 4.0.1" in res_inspect.stdout
    assert "N=38 | M=30" in res_inspect.stdout

    res_json = runner.invoke(
        app,
        ["analyze", str(anates_dir / "latihan2.ANA"), "--format", "json"],
    )
    assert res_json.exit_code == 0
    parsed = json.loads(res_json.stdout)
    assert parsed["reliability"]["correlation_xy"] is None

    res_rel = runner.invoke(
        app,
        ["analyze", str(kama), "--mode", "legacy", "--format", "reliabel-txt"],
    )
    assert res_rel.exit_code == 0
    assert "Rata2= 18.83" in res_rel.stdout
    assert "Reliabilitas Tes= 0.63" in res_rel.stdout

    batch_out = tmp_path / "batch_xlsx"
    res_batch = runner.invoke(
        app,
        ["analyze", str(bio), str(kama), "--format", "xlsx", "--output", str(batch_out)],
    )
    assert res_batch.exit_code == 0
    assert (batch_out / "biologi.xlsx").exists()
    assert (batch_out / "ka ma2.xlsx").exists()


def test_cli_diff_and_convert(anates_dir: Path, tmp_path: Path) -> None:
    bio = anates_dir / "biologi.ana"
    lat1 = anates_dir / "lat1.ANA"

    res_diff = runner.invoke(app, ["diff", str(bio), str(lat1), "--json"])
    assert res_diff.exit_code == 0
    diffs = json.loads(res_diff.stdout)
    assert len(diffs) == 2
    assert [c["item_number"] for c in diffs[0]["significance_changes"]] == [1, 3, 14, 19, 21]
    assert [c["item_number"] for c in diffs[1]["significance_changes"]] == [2, 8, 12, 13]

    csv_out = tmp_path / "bio.csv"
    ana_out = tmp_path / "bio_roundtrip.ana"
    res_conv1 = runner.invoke(app, ["convert", str(bio), str(csv_out)])
    assert res_conv1.exit_code == 0
    assert csv_out.exists()

    res_conv2 = runner.invoke(
        app,
        ["convert", str(csv_out), str(ana_out), "--with-analysis", "--options-count", "5"],
    )
    assert res_conv2.exit_code == 0
    assert ana_out.exists()


def test_cli_error_returns_exit_code_1(tmp_path: Path) -> None:
    missing = tmp_path / "nope.ana"
    res = runner.invoke(app, ["inspect", str(missing)])
    assert res.exit_code == 1
    assert "Error:" in res.output

    bad_ana = tmp_path / "bad.ana"
    bad_ana.write_text("<ANATES><broken>", encoding="utf-8")
    res_bad = runner.invoke(app, ["analyze", str(bad_ana)])
    assert res_bad.exit_code == 1
    assert "Error:" in res_bad.output
