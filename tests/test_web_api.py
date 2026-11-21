from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from anates.web import create_app


@pytest.fixture
def client(anates_dir: Path) -> TestClient:
    app = create_app(samples_dir=anates_dir)
    return TestClient(app)


def test_health_and_static_index(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"

    root_res = client.get("/")
    assert root_res.status_code == 200
    assert "Itemetri" in root_res.text


def test_samples_listing_load_and_traversal_guard(client: TestClient) -> None:
    list_res = client.get("/api/samples")
    assert list_res.status_code == 200
    names = [entry["filename"] for entry in list_res.json()]
    assert "biologi.ana" in names
    assert "ka ma2.ANA" in names

    bio_res = client.post("/api/samples/biologi.ana")
    assert bio_res.status_code == 200
    payload = bio_res.json()
    assert payload["exam"]["kind"] == "multiple_choice"
    assert payload["analysis"]["scoring"]["mean"] == pytest.approx(6.473684210526316)
    assert payload["analysis"]["reliability"]["cronbach_alpha"] is not None
    assert payload["analysis"]["reliability"]["kr20"] is not None

    bad_res = client.post("/api/samples/..%2Fpyproject.toml")
    assert bad_res.status_code in (400, 404, 405)

    non_ana_res = client.post("/api/samples/pyproject.toml")
    assert non_ana_res.status_code == 400

    dot_res = client.post("/api/samples/..secret.ana")
    assert dot_res.status_code == 400

    missing_res = client.post("/api/samples/missing_file.ana")
    assert missing_res.status_code == 404


def test_builtin_simulation_samples_api_endpoints(client: TestClient) -> None:
    list_res = client.get("/api/samples")
    assert list_res.status_code == 200
    builtins = {entry["filename"]: entry for entry in list_res.json() if entry.get("is_builtin")}
    assert "simulasi-pg-diagnostik" in builtins
    assert "simulasi-uraian" in builtins

    mc_res = client.post("/api/samples/simulasi-pg-diagnostik")
    assert mc_res.status_code == 200
    mc_body = mc_res.json()
    assert mc_body["exam"]["kind"] == "multiple_choice"
    assert mc_body["analysis"]["subject_count"] == 25
    assert mc_body["analysis"]["item_count"] == 10
    assert mc_body["analysis"]["verdicts"][8]["suspected_miskey"] is True
    assert mc_body["analysis"]["verdicts"][8]["status"] == "Tolak"

    essay_res = client.post("/api/samples/simulasi-uraian")
    assert essay_res.status_code == 200
    essay_body = essay_res.json()
    assert essay_body["exam"]["kind"] == "essay"
    assert essay_body["exam"]["ideal_scores"] == [10.0, 10.0, 15.0, 15.0, 20.0]
    assert essay_body["analysis"]["scoring"]["ideal_max_score"] == pytest.approx(70.0)
    assert len(essay_body["analysis"]["verdicts"]) == 5


def test_import_ana_csv_xlsx_and_malformed_xml(
    client: TestClient,
    anates_dir: Path,
    tmp_path: Path,
) -> None:
    ana_bytes = (anates_dir / "lat1.ANA").read_bytes()
    res_ana = client.post(
        "/api/import",
        files={"file": ("lat1.ANA", ana_bytes, "application/xml")},
        data={"kind": "auto"},
    )
    assert res_ana.status_code == 200
    assert res_ana.json()["analysis"]["subject_count"] == 30

    csv_file = tmp_path / "essay.csv"
    csv_file.write_text(
        "Nama,1,2\nSkor Ideal,10,10\nAdi,9,8\nBudi,5,4\nCici,3,2\nDeni,1,2\n",
        encoding="utf-8",
    )
    res_csv = client.post(
        "/api/import",
        files={"file": ("essay.csv", csv_file.read_bytes(), "text/csv")},
        data={"kind": "auto"},
    )
    assert res_csv.status_code == 200
    assert res_csv.json()["exam"]["kind"] == "essay"

    malformed = b"<ANATES>\n  <Data_Mentah>\n    <Kunci>ab</Data_Mentah>\n</ANATES>"
    res_bad = client.post(
        "/api/import",
        files={"file": ("bad.ana", malformed, "application/xml")},
        data={"kind": "auto"},
    )
    assert res_bad.status_code == 422
    err = res_bad.json()
    assert err["code"] == "parse_error"
    assert err["line"] == 3


def test_analyze_compare_and_export_endpoints(client: TestClient) -> None:
    loaded = client.post("/api/samples/ka ma2.ANA").json()
    exam_payload = loaded["exam"]

    legacy_res = client.post(
        "/api/analyze",
        json={
            "exam": exam_payload,
            "options": {
                "mode": "legacy_anates",
                "upper_lower_percent": 27.0,
                "use_weighted_score": False,
                "essay_difficulty_scope": None,
            },
        },
    )
    assert legacy_res.status_code == 200
    assert legacy_res.json()["analysis"]["reliability"]["reliability_coefficient"] == pytest.approx(
        0.631193,
        abs=1e-6,
    )

    invalid_res = client.post(
        "/api/analyze",
        json={
            "exam": exam_payload,
            "options": {
                "mode": "legacy_anates",
                "upper_lower_percent": 27.0,
                "use_weighted_score": True,
                "essay_difficulty_scope": None,
            },
        },
    )
    assert invalid_res.status_code == 422
    assert invalid_res.json()["code"] == "validation_error"

    bio_exam = client.post("/api/samples/biologi.ana").json()["exam"]
    cmp_res = client.post(
        "/api/compare",
        json={"exam": bio_exam, "upper_lower_percent": 27.0},
    )
    assert cmp_res.status_code == 200
    changed = [c["item_number"] for c in cmp_res.json()["diff"]["significance_changes"]]
    assert changed == [1, 3, 14, 19, 21]

    for fmt in ("ana", "xlsx-analysis", "csv-analysis", "html", "reliabel-txt"):
        exp_res = client.post(
            "/api/export",
            json={
                "exam": exam_payload,
                "options": {
                    "mode": "legacy_anates",
                    "upper_lower_percent": 27.0,
                    "use_weighted_score": False,
                    "essay_difficulty_scope": None,
                },
                "format": fmt,
            },
        )
        assert exp_res.status_code == 200
        assert len(exp_res.content) > 0
        if fmt == "reliabel-txt":
            text = exp_res.content.decode("cp1252")
            assert "RELIABILITAS TES" in text
            assert "Rata2= 18.83" in text
