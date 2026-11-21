from pathlib import Path

import pytest

from itemetri.domain import (
    AnalysisOptions,
    CompatibilityMode,
    EssayExam,
    MultipleChoiceExam,
    ParseError,
    UnsupportedSchemaError,
)
from itemetri.engine import analyze_essay, analyze_multiple_choice
from itemetri.io import parse_ana_bytes, read_ana, serialize_ana, write_ana
from tests.conftest import ALL_SAMPLE_ANA_NAMES


@pytest.mark.parametrize("filename", ALL_SAMPLE_ANA_NAMES)
def test_read_all_real_ana_files(anates_dir: Path, filename: str) -> None:
    doc = read_ana(anates_dir / filename)
    assert isinstance(doc.exam, MultipleChoiceExam)
    assert doc.file_version == "4.0.1"


def test_xml_mc_round_trip_with_analysis(anates_dir: Path, tmp_path: Path) -> None:
    orig_doc = read_ana(anates_dir / "ka ma2.ANA")
    assert isinstance(orig_doc.exam, MultipleChoiceExam)
    analysis = analyze_multiple_choice(
        orig_doc.exam,
        AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES),
    )
    out_file = tmp_path / "roundtrip.ana"
    write_ana(out_file, orig_doc.exam, analysis=analysis)

    reloaded = read_ana(out_file)
    assert isinstance(reloaded.exam, MultipleChoiceExam)
    assert reloaded.exam.answer_key == orig_doc.exam.answer_key
    assert reloaded.exam.weights == orig_doc.exam.weights
    assert reloaded.exam.is_sorted_by_score is True
    assert reloaded.cached_scores is not None
    assert reloaded.cached_scores.mean == pytest.approx(18.825)
    assert len(reloaded.cached_scores.subjects) == 40
    assert reloaded.cached_scores.subjects[0].original_index == 10


def test_xml_essay_201_round_trip_and_trailing_commas() -> None:
    xml_bytes = (
        b'<?xml version="1.0"?>\n'
        b'<ANATES file_version="2.0.1">\n'
        b"  <Data_Mentah>\n"
        b"    <Kunci>10,20,15,</Kunci>\n"
        b"    <JumSubyek>2</JumSubyek>\n"
        b"    <JumButir>3</JumButir>\n"
        b"    <IsNeedRecalc>0</IsNeedRecalc>\n"
        b"    <NoButir><NOBTR>2</NOBTR><NOBTR>5</NOBTR><NOBTR>9</NOBTR></NoButir>\n"
        b"    <Jawaban><JumItem>2</JumItem>\n"
        b"      <Subyek><Nama>Ani</Nama><Jwb>8,*,12,</Jwb></Subyek>\n"
        b"      <Subyek><Nama>Budi</Nama><Jwb></Jwb></Subyek>\n"
        b"    </Jawaban>\n"
        b"  </Data_Mentah>\n"
        b"  <Data_Skor>\n"
        b"    <Rata2>10</Rata2><SD>14.14213562373095</SD>\n"
        b"    <IsUrutkanBerdSkor>0</IsUrutkanBerdSkor><JumButir>3</JumButir>\n"
        b"    <MaxSkor>8,0,12</MaxSkor><MinSkor>8,0,12</MinSkor>\n"
        b"    <Skor><JumItem>2</JumItem>\n"
        b"      <Subyek><Nama>Ani</Nama><SkorTotal>20</SkorTotal>"
        b"<UrutanAwal>0</UrutanAwal><JumBlank>1</JumBlank></Subyek>\n"
        b"      <Subyek><Nama>Budi</Nama><SkorTotal>0</SkorTotal>"
        b"<UrutanAwal>1</UrutanAwal><JumBlank>3</JumBlank></Subyek>\n"
        b"    </Skor>\n"
        b"  </Data_Skor>\n"
        b"</ANATES>"
    )
    doc = parse_ana_bytes(xml_bytes, source="synthetic_essay.ana")
    assert doc.file_version == "2.0.1"
    assert isinstance(doc.exam, EssayExam)
    assert doc.exam.ideal_scores == (10.0, 20.0, 15.0)
    assert doc.exam.item_numbers == (2, 5, 9)
    assert doc.exam.subjects[0].scores == (8.0, None, 12.0)
    assert doc.exam.subjects[1].scores == (None, None, None)
    assert doc.cached_scores is not None
    assert doc.cached_scores.max_scores == (8.0, 0.0, 12.0)

    analysis = analyze_essay(doc.exam, AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED))
    serialized = serialize_ana(doc.exam, analysis=analysis)
    reloaded = parse_ana_bytes(serialized)
    assert isinstance(reloaded.exam, EssayExam)
    assert reloaded.exam.item_numbers == (2, 5, 9)
    assert reloaded.cached_scores is not None
    assert reloaded.cached_scores.max_scores == (8.0, 0.0, 12.0)
    assert reloaded.cached_scores.min_scores == (8.0, 0.0, 12.0)


def test_windows_1252_xml_decoding() -> None:
    xml_str = (
        '<?xml version="1.0" encoding="windows-1252"?>'
        '<ANATES file_version="4.0.1"><Data_Mentah>'
        "<Kunci>ab</Kunci><JumSubyek>1</JumSubyek><JumButir>2</JumButir>"
        "<JumPilihan>4</JumPilihan><IsNeedRecalc>-1</IsNeedRecalc>"
        "<Jawaban><JumItem>1</JumItem>"
        "<Subyek><Nama>José Müller</Nama><Jwb>ab</Jwb></Subyek>"
        "</Jawaban></Data_Mentah></ANATES>"
    )
    raw = xml_str.encode("cp1252")
    doc = parse_ana_bytes(raw)
    assert doc.exam.subjects[0].name == "José Müller"


def test_malformed_xml_and_xxe_safety(tmp_path: Path) -> None:
    bad_syntax = b"<ANATES>\n  <Data_Mentah>\n    <Kunci>ab</Data_Mentah>\n</ANATES>"
    with pytest.raises(ParseError) as exc_info:
        parse_ana_bytes(bad_syntax, source="bad.ana")
    assert exc_info.value.line == 3

    missing_tag = (
        b'<ANATES file_version="4.0.1">\n'
        b"  <Data_Mentah>\n"
        b"    <JumButir>2</JumButir>\n"
        b"  </Data_Mentah>\n"
        b"</ANATES>"
    )
    with pytest.raises(ParseError) as missing_exc:
        parse_ana_bytes(missing_tag)
    assert missing_exc.value.tag == "Kunci"
    assert missing_exc.value.line == 2

    with pytest.raises(UnsupportedSchemaError):
        parse_ana_bytes(b"<OTHER/>")

    with pytest.raises(UnsupportedSchemaError):
        parse_ana_bytes(b'<ANATES file_version="9.9.9"><Data_Mentah/></ANATES>')

    secret = tmp_path / "secret.txt"
    secret.write_text("TOP_SECRET", encoding="utf-8")
    xxe_payload = (
        f'<?xml version="1.0"?>\n'
        f'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "{secret.as_uri()}">]>\n'
        f'<ANATES file_version="4.0.1"><Data_Mentah>'
        f"<Kunci>ab</Kunci><JumSubyek>1</JumSubyek><JumButir>2</JumButir>"
        f"<JumPilihan>4</JumPilihan><IsNeedRecalc>0</IsNeedRecalc>"
        f"<Jawaban><JumItem>1</JumItem>"
        f"<Subyek><Nama>&xxe;</Nama><Jwb>ab</Jwb></Subyek>"
        f"</Jawaban></Data_Mentah></ANATES>"
    ).encode()
    doc = parse_ana_bytes(xxe_payload)
    assert "TOP_SECRET" not in doc.exam.subjects[0].name
