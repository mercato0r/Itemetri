import math
import re
from pathlib import Path

from lxml import etree

from anates.domain.enums import ExamKind
from anates.domain.errors import (
    DomainValidationError,
    IoError,
    ParseError,
    UnsupportedSchemaError,
)
from anates.domain.models import (
    AnaDocument,
    CachedScoreSummary,
    CachedSubjectScore,
    EssayAnalysis,
    EssayExam,
    EssaySubject,
    Exam,
    ExamAnalysis,
    MultipleChoiceAnalysis,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    ScoringWeights,
)
from anates.domain.types import OptionCount
from anates.io.encoding import decode_bytes

_XML_DECL_ENCODING_RE = re.compile(
    r"""^(<\?xml\b[^>]*?)\s+encoding\s*=\s*["'][^"']*["']([^>]*\?>)""",
    re.IGNORECASE,
)


def _secure_xml_parser() -> etree.XMLParser:
    # Disable DTD and external entity resolution to prevent XXE/SSRF on untrusted files.
    return etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        huge_tree=False,
    )


def _strip_xml_encoding_decl(text: str) -> str:
    return _XML_DECL_ENCODING_RE.sub(r"\1\2", text, count=1)


def _elem_line(elem: etree._Element | None) -> int | None:
    if elem is None:
        return None
    line: object = getattr(elem, "sourceline", None)
    return line if isinstance(line, int) else None


def _child_text(
    parent: etree._Element,
    tag: str,
    *,
    source: str | None,
    required: bool = True,
) -> str | None:
    elem = parent.find(tag)
    if elem is None:
        if required:
            raise ParseError(
                f"Missing required element <{tag}> inside <{parent.tag}>.",
                source=source,
                line=_elem_line(parent),
                tag=tag,
            )
        return None
    return elem.text or ""


def _parse_int(
    parent: etree._Element,
    tag: str,
    *,
    source: str | None,
    default: int | None = None,
) -> int:
    elem = parent.find(tag)
    if elem is None:
        if default is not None:
            return default
        raise ParseError(
            f"Missing required integer element <{tag}>.",
            source=source,
            line=_elem_line(parent),
            tag=tag,
        )
    raw = (elem.text or "").strip()
    try:
        return int(raw)
    except ValueError as exc:
        raise ParseError(
            f"Invalid integer value {raw!r} in <{tag}>.",
            source=source,
            line=_elem_line(elem) or _elem_line(parent),
            tag=tag,
        ) from exc


def _parse_float(
    parent: etree._Element,
    tag: str,
    *,
    source: str | None,
    default: float | None = None,
) -> float:
    elem = parent.find(tag)
    if elem is None:
        if default is not None:
            return default
        raise ParseError(
            f"Missing required float element <{tag}>.",
            source=source,
            line=_elem_line(parent),
            tag=tag,
        )
    raw = (elem.text or "").strip()
    try:
        val = float(raw)
    except ValueError as exc:
        raise ParseError(
            f"Invalid numeric value {raw!r} in <{tag}>.",
            source=source,
            line=_elem_line(elem) or _elem_line(parent),
            tag=tag,
        ) from exc
    if not math.isfinite(val):
        raise ParseError(
            f"Non-finite numeric value {raw!r} in <{tag}>.",
            source=source,
            line=_elem_line(elem) or _elem_line(parent),
            tag=tag,
        )
    return val


def _split_csv_tokens(text: str) -> list[str]:
    tokens = text.split(",")
    if len(tokens) > 1 and tokens[-1].strip() == "":
        tokens.pop()
    return tokens


def _parse_csv_floats(
    text: str,
    *,
    elem: etree._Element,
    source: str | None,
    allow_blank: bool = False,
) -> list[float | None]:
    tokens = _split_csv_tokens(text)
    values: list[float | None] = []
    for idx, token in enumerate(tokens):
        cleaned = token.strip()
        if allow_blank and cleaned in ("", "*", "#"):
            values.append(None)
            continue
        try:
            num = float(cleaned)
        except ValueError as exc:
            raise ParseError(
                f"Invalid float token {cleaned!r} at item index {idx + 1} in <{elem.tag}>.",
                source=source,
                line=_elem_line(elem),
                tag=str(elem.tag),
            ) from exc
        values.append(num)
    return values


def _parse_no_butir(
    parent: etree._Element,
    *,
    expected_len: int,
    source: str | None,
) -> tuple[int, ...]:
    container = parent.find("NoButir")
    if container is None:
        return ()
    numbers: list[int] = []
    for child in container.findall("NOBTR"):
        raw = (child.text or "").strip()
        try:
            numbers.append(int(raw))
        except ValueError as exc:
            raise ParseError(
                f"Invalid item number {raw!r} in <NOBTR>.",
                source=source,
                line=_elem_line(child),
                tag="NOBTR",
            ) from exc
    if numbers and len(numbers) != expected_len:
        raise ParseError(
            f"<NoButir> contains {len(numbers)} <NOBTR> entries, expected {expected_len}.",
            source=source,
            line=_elem_line(container),
            tag="NoButir",
        )
    return tuple(numbers)


def _detect_schema_kind(root: etree._Element, dm: etree._Element, source: str | None) -> ExamKind:
    file_version = root.attrib.get("file_version", "").strip()
    has_jum_pilihan = dm.find("JumPilihan") is not None
    has_no_butir = dm.find("NoButir") is not None
    kunci_text = (dm.findtext("Kunci") or "").strip()

    if file_version not in ("", "4.0.1", "2.0.1"):
        raise UnsupportedSchemaError(
            f"Unsupported ANATES file_version {file_version!r}.",
            source=source,
            line=_elem_line(root),
            tag=str(root.tag),
        )
    if file_version == "4.0.1":
        if has_jum_pilihan or "," not in kunci_text:
            return ExamKind.MULTIPLE_CHOICE
        raise UnsupportedSchemaError(
            "Schema version 4.0.1 expects <JumPilihan>.",
            source=source,
            line=_elem_line(dm),
            tag="Data_Mentah",
        )
    if file_version == "2.0.1":
        if has_jum_pilihan:
            raise UnsupportedSchemaError(
                "Schema version 2.0.1 (Essay) cannot contain <JumPilihan>.",
                source=source,
                line=_elem_line(dm),
                tag="JumPilihan",
            )
        return ExamKind.ESSAY
    if has_jum_pilihan:
        return ExamKind.MULTIPLE_CHOICE
    if has_no_butir or "," in kunci_text:
        return ExamKind.ESSAY
    raise UnsupportedSchemaError(
        "Unable to infer ANATES schema kind without file_version or <JumPilihan>.",
        source=source,
        line=_elem_line(root),
        tag=str(root.tag),
    )


def _parse_mc_cached_scores(
    ds: etree._Element | None,
    *,
    source: str | None,
) -> tuple[ScoringWeights, bool, CachedScoreSummary | None]:
    if ds is None:
        return (ScoringWeights(), False, None)

    weights = ScoringWeights(
        correct=_parse_float(ds, "BobotBetul", source=source, default=1.0),
        wrong=_parse_float(ds, "BobotSalah", source=source, default=0.0),
    )
    is_sorted = _parse_int(ds, "IsUrutkanBerdSkor", source=source, default=0) != 0

    skor_elem = ds.find("Skor")
    if skor_elem is None:
        return (weights, is_sorted, None)

    subject_elems = skor_elem.findall("Subyek")
    if not subject_elems:
        return (weights, is_sorted, None)

    mean = _parse_float(ds, "Rata2", source=source, default=0.0)
    sd = _parse_float(ds, "SD", source=source, default=0.0)
    jum_butir = _parse_int(ds, "JumButir", source=source, default=0)

    cached_subjects: list[CachedSubjectScore] = []
    for sub in subject_elems:
        cached_subjects.append(
            CachedSubjectScore(
                name=_child_text(sub, "Nama", source=source, required=False) or "",
                score_pattern=_child_text(sub, "SkorButir", source=source, required=False) or "",
                total_score=_parse_float(sub, "SkorAkhir", source=source),
                weighted_score=_parse_float(sub, "SkorDibobot", source=source, default=0.0),
                original_index=_parse_int(sub, "UrutanAwal", source=source),
                correct_count=_parse_int(sub, "JumBetul", source=source),
                wrong_count=_parse_int(sub, "JumSalah", source=source),
                blank_count=_parse_int(sub, "JumBlank", source=source),
            )
        )

    summary = CachedScoreSummary(
        mean=mean,
        std_dev=sd,
        is_sorted_by_score=is_sorted,
        item_count=jum_butir,
        weights=weights,
        subjects=tuple(cached_subjects),
    )
    return (weights, is_sorted, summary)


def _parse_essay_cached_scores(
    ds: etree._Element | None,
    *,
    source: str | None,
) -> tuple[bool, tuple[int, ...], CachedScoreSummary | None]:
    if ds is None:
        return (False, (), None)

    is_sorted = _parse_int(ds, "IsUrutkanBerdSkor", source=source, default=0) != 0
    jum_butir = _parse_int(ds, "JumButir", source=source, default=0)
    item_numbers = (
        _parse_no_butir(ds, expected_len=jum_butir, source=source)
        if jum_butir > 0
        else ()
    )

    max_elem = ds.find("MaxSkor")
    min_elem = ds.find("MinSkor")
    max_scores: tuple[float, ...] = ()
    min_scores: tuple[float, ...] = ()
    if max_elem is not None and (max_elem.text or "").strip():
        parsed_max = _parse_csv_floats(max_elem.text or "", elem=max_elem, source=source)
        max_scores = tuple(float(v) for v in parsed_max if v is not None)
    if min_elem is not None and (min_elem.text or "").strip():
        parsed_min = _parse_csv_floats(min_elem.text or "", elem=min_elem, source=source)
        min_scores = tuple(float(v) for v in parsed_min if v is not None)

    skor_elem = ds.find("Skor")
    if skor_elem is None:
        return (is_sorted, item_numbers, None)

    subject_elems = skor_elem.findall("Subyek")
    if not subject_elems:
        return (is_sorted, item_numbers, None)

    mean = _parse_float(ds, "Rata2", source=source, default=0.0)
    sd = _parse_float(ds, "SD", source=source, default=0.0)

    cached_subjects: list[CachedSubjectScore] = []
    for sub in subject_elems:
        total_tag = "SkorTotal" if sub.find("SkorTotal") is not None else "SkorAkhir"
        cached_subjects.append(
            CachedSubjectScore(
                name=_child_text(sub, "Nama", source=source, required=False) or "",
                score_pattern=_child_text(sub, "SkorButir", source=source, required=False) or "",
                total_score=_parse_float(sub, total_tag, source=source),
                weighted_score=None,
                original_index=_parse_int(sub, "UrutanAwal", source=source),
                correct_count=None,
                wrong_count=None,
                blank_count=_parse_int(sub, "JumBlank", source=source, default=0),
            )
        )

    summary = CachedScoreSummary(
        mean=mean,
        std_dev=sd,
        is_sorted_by_score=is_sorted,
        item_count=jum_butir,
        weights=None,
        subjects=tuple(cached_subjects),
        max_scores=max_scores,
        min_scores=min_scores,
    )
    return (is_sorted, item_numbers, summary)


def _parse_multiple_choice_xml(
    root: etree._Element,
    dm: etree._Element,
    ds: etree._Element | None,
    *,
    source: str | None,
) -> tuple[MultipleChoiceExam, CachedScoreSummary | None]:
    kunci = (_child_text(dm, "Kunci", source=source) or "").strip()
    jum_butir = _parse_int(dm, "JumButir", source=source)
    jum_pilihan = _parse_int(dm, "JumPilihan", source=source)
    jum_subyek = _parse_int(dm, "JumSubyek", source=source, default=-1)
    is_need_recalc = _parse_int(dm, "IsNeedRecalc", source=source, default=1) != 0

    if len(kunci) != jum_butir:
        kunci_elem = dm.find("Kunci")
        raise ParseError(
            f"<Kunci> length ({len(kunci)}) does not match <JumButir> ({jum_butir}).",
            source=source,
            line=_elem_line(kunci_elem) or _elem_line(dm),
            tag="Kunci",
        )

    jawaban_elem = dm.find("Jawaban")
    if jawaban_elem is None:
        raise ParseError(
            "Missing required element <Jawaban>.",
            source=source,
            line=_elem_line(dm),
            tag="Jawaban",
        )
    subyek_elems = jawaban_elem.findall("Subyek")
    if jum_subyek >= 0 and len(subyek_elems) != jum_subyek:
        raise ParseError(
            f"<Jawaban> has {len(subyek_elems)} <Subyek> entries, "
            f"expected <JumSubyek>={jum_subyek}.",
            source=source,
            line=_elem_line(jawaban_elem),
            tag="Jawaban",
        )

    subjects: list[MultipleChoiceSubject] = []
    for idx, sub in enumerate(subyek_elems):
        nama = _child_text(sub, "Nama", source=source, required=False) or ""
        jwb_elem = sub.find("Jwb")
        jwb = (jwb_elem.text or "") if jwb_elem is not None else ""
        # AnatesV4.exe fills nil/empty <Jwb> strings with '*' * JumButir.
        if jwb == "":
            jwb = "*" * jum_butir
        elif len(jwb) != jum_butir:
            raise ParseError(
                f"Subject #{idx + 1} ({nama!r}) <Jwb> length {len(jwb)} != <JumButir>={jum_butir}.",
                source=source,
                line=_elem_line(jwb_elem) or _elem_line(sub),
                tag="Jwb",
            )
        subjects.append(
            MultipleChoiceSubject(name=nama, responses=jwb, original_index=idx)
        )

    weights, is_sorted, cached = _parse_mc_cached_scores(ds, source=source)
    try:
        exam = MultipleChoiceExam(
            answer_key=kunci,
            option_count=OptionCount(jum_pilihan),
            subjects=tuple(subjects),
            weights=weights,
            is_sorted_by_score=is_sorted,
            is_need_recalc=is_need_recalc,
            source_path=source,
        )
    except DomainValidationError as exc:
        raise ParseError(str(exc), source=source, line=_elem_line(dm), tag="Data_Mentah") from exc

    return (exam, cached)


def _parse_essay_xml(
    root: etree._Element,
    dm: etree._Element,
    ds: etree._Element | None,
    *,
    source: str | None,
) -> tuple[EssayExam, CachedScoreSummary | None]:
    kunci_elem = dm.find("Kunci")
    if kunci_elem is None:
        raise ParseError(
            "Missing required element <Kunci>.",
            source=source,
            line=_elem_line(dm),
            tag="Kunci",
        )
    jum_butir = _parse_int(dm, "JumButir", source=source)
    jum_subyek = _parse_int(dm, "JumSubyek", source=source, default=-1)
    is_need_recalc = _parse_int(dm, "IsNeedRecalc", source=source, default=1) != 0

    ideal_raw = _parse_csv_floats(
        (kunci_elem.text or "").strip(),
        elem=kunci_elem,
        source=source,
        allow_blank=False,
    )
    ideal_scores = tuple(float(v) for v in ideal_raw if v is not None)
    if len(ideal_scores) != jum_butir:
        raise ParseError(
            f"<Kunci> ideal score count ({len(ideal_scores)}) does not match "
            f"<JumButir> ({jum_butir}).",
            source=source,
            line=_elem_line(kunci_elem),
            tag="Kunci",
        )

    item_numbers = _parse_no_butir(dm, expected_len=jum_butir, source=source)

    jawaban_elem = dm.find("Jawaban")
    if jawaban_elem is None:
        raise ParseError(
            "Missing required element <Jawaban>.",
            source=source,
            line=_elem_line(dm),
            tag="Jawaban",
        )
    subyek_elems = jawaban_elem.findall("Subyek")
    if jum_subyek >= 0 and len(subyek_elems) != jum_subyek:
        raise ParseError(
            f"<Jawaban> has {len(subyek_elems)} <Subyek> entries, "
            f"expected <JumSubyek>={jum_subyek}.",
            source=source,
            line=_elem_line(jawaban_elem),
            tag="Jawaban",
        )

    subjects: list[EssaySubject] = []
    for idx, sub in enumerate(subyek_elems):
        nama = _child_text(sub, "Nama", source=source, required=False) or ""
        jwb_elem = sub.find("Jwb")
        raw_jwb = ((jwb_elem.text or "") if jwb_elem is not None else "").strip()
        if raw_jwb == "":
            scores: tuple[float | None, ...] = tuple([None] * jum_butir)
        else:
            parsed = _parse_csv_floats(
                raw_jwb,
                elem=jwb_elem if jwb_elem is not None else sub,
                source=source,
                allow_blank=True,
            )
            if len(parsed) != jum_butir:
                raise ParseError(
                    f"Subject #{idx + 1} ({nama!r}) score count {len(parsed)} != "
                    f"<JumButir>={jum_butir}.",
                    source=source,
                    line=_elem_line(jwb_elem) or _elem_line(sub),
                    tag="Jwb",
                )
            scores = tuple(parsed)
        subjects.append(EssaySubject(name=nama, scores=scores, original_index=idx))

    is_sorted, ds_item_numbers, cached = _parse_essay_cached_scores(ds, source=source)
    resolved_item_numbers = item_numbers or ds_item_numbers

    try:
        exam = EssayExam(
            ideal_scores=ideal_scores,
            subjects=tuple(subjects),
            item_numbers=resolved_item_numbers,
            is_sorted_by_score=is_sorted,
            is_need_recalc=is_need_recalc,
            source_path=source,
        )
    except DomainValidationError as exc:
        raise ParseError(str(exc), source=source, line=_elem_line(dm), tag="Data_Mentah") from exc

    return (exam, cached)


def parse_ana_bytes(raw: bytes, *, source: str | None = None) -> AnaDocument:
    decoded_text, detected_encoding = decode_bytes(raw, source=source)
    normalized_text = _strip_xml_encoding_decl(decoded_text)
    parser = _secure_xml_parser()

    try:
        root = etree.fromstring(normalized_text.encode("utf-8"), parser=parser)
    except etree.XMLSyntaxError as exc:
        raw_line: object = getattr(exc, "lineno", None)
        line = raw_line if isinstance(raw_line, int) else None
        raise ParseError(
            f"Malformed XML syntax: {exc.msg}",
            source=source,
            line=line,
        ) from exc

    if root.tag != "ANATES":
        raise UnsupportedSchemaError(
            f"Expected root tag <ANATES>, found <{root.tag}>.",
            source=source,
            line=_elem_line(root),
            tag=str(root.tag),
        )

    dm = root.find("Data_Mentah")
    if dm is None:
        raise ParseError(
            "Missing required section <Data_Mentah>.",
            source=source,
            line=_elem_line(root),
            tag="Data_Mentah",
        )
    ds = root.find("Data_Skor")

    schema_kind = _detect_schema_kind(root, dm, source)
    file_version = root.attrib.get("file_version", "").strip()
    if not file_version:
        file_version = "4.0.1" if schema_kind is ExamKind.MULTIPLE_CHOICE else "2.0.1"

    exam: Exam
    if schema_kind is ExamKind.MULTIPLE_CHOICE:
        exam, cached = _parse_multiple_choice_xml(root, dm, ds, source=source)
    else:
        exam, cached = _parse_essay_xml(root, dm, ds, source=source)

    return AnaDocument(
        exam=exam,
        file_version=file_version,
        detected_encoding=detected_encoding,
        cached_scores=cached,
    )


def read_ana(path: Path) -> AnaDocument:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise IoError(f"Failed to read {path}: {exc}") from exc
    return parse_ana_bytes(raw, source=str(path))


def _sub(parent: etree._Element, tag: str, text: str) -> etree._Element:
    elem = etree.SubElement(parent, tag)
    elem.text = text
    return elem


def _format_num(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return repr(value)


def serialize_ana(exam: Exam, *, analysis: ExamAnalysis | None = None) -> bytes:
    if isinstance(exam, MultipleChoiceExam):
        if analysis is not None and not isinstance(analysis, MultipleChoiceAnalysis):
            raise IoError("Analysis kind does not match MultipleChoiceExam.")
        return _serialize_mc_xml(exam, analysis)

    if analysis is not None and not isinstance(analysis, EssayAnalysis):
        raise IoError("Analysis kind does not match EssayExam.")
    return _serialize_essay_xml(exam, analysis)


def _serialize_mc_xml(
    exam: MultipleChoiceExam,
    analysis: MultipleChoiceAnalysis | None,
) -> bytes:
    root = etree.Element("ANATES", file_version="4.0.1")
    dm = etree.SubElement(root, "Data_Mentah")
    _sub(dm, "Kunci", exam.answer_key)
    _sub(dm, "JumSubyek", str(int(exam.subject_count)))
    _sub(dm, "JumButir", str(int(exam.item_count)))
    _sub(dm, "JumPilihan", str(int(exam.option_count)))
    is_need_recalc = False if analysis is not None else exam.is_need_recalc
    _sub(dm, "IsNeedRecalc", "-1" if is_need_recalc else "0")

    jawaban = etree.SubElement(dm, "Jawaban")
    _sub(jawaban, "JumItem", str(int(exam.subject_count)))
    for subj in exam.subjects:
        sub_el = etree.SubElement(jawaban, "Subyek")
        _sub(sub_el, "Nama", subj.name)
        _sub(sub_el, "Jwb", subj.responses)

    ds = etree.SubElement(root, "Data_Skor")
    if analysis is not None:
        _sub(ds, "Rata2", _format_num(analysis.scoring.mean))
        _sub(ds, "SD", _format_num(analysis.scoring.std_dev))
        _sub(ds, "IsUrutkanBerdSkor", "-1" if exam.is_sorted_by_score else "0")
        _sub(ds, "JumButir", str(int(exam.item_count)))
        _sub(ds, "BobotBetul", _format_num(exam.weights.correct))
        _sub(ds, "BobotSalah", _format_num(exam.weights.wrong))
        skor = etree.SubElement(ds, "Skor")
        _sub(skor, "JumItem", str(int(exam.subject_count)))
        order = (
            analysis.scoring.sorted_order
            if exam.is_sorted_by_score
            else range(len(analysis.scoring.subjects))
        )
        for pos in order:
            row = analysis.scoring.subjects[pos]
            sub_el = etree.SubElement(skor, "Subyek")
            _sub(sub_el, "Nama", row.name)
            _sub(sub_el, "SkorButir", row.score_pattern)
            _sub(sub_el, "SkorAkhir", _format_num(row.raw_score))
            _sub(sub_el, "SkorDibobot", _format_num(row.weighted_score))
            _sub(sub_el, "UrutanAwal", str(row.original_index))
            _sub(sub_el, "JumBetul", str(row.correct_count))
            _sub(sub_el, "JumSalah", str(row.wrong_count))
            _sub(sub_el, "JumBlank", str(row.blank_count))
    else:
        _sub(ds, "Rata2", "0")
        _sub(ds, "SD", "0")
        _sub(ds, "IsUrutkanBerdSkor", "-1" if exam.is_sorted_by_score else "0")
        _sub(ds, "JumButir", "0")
        _sub(ds, "BobotBetul", _format_num(exam.weights.correct))
        _sub(ds, "BobotSalah", _format_num(exam.weights.wrong))
        skor = etree.SubElement(ds, "Skor")
        _sub(skor, "JumItem", "0")

    return etree.tostring(root, xml_declaration=True, encoding="utf-8")


def _serialize_essay_xml(
    exam: EssayExam,
    analysis: EssayAnalysis | None,
) -> bytes:
    root = etree.Element("ANATES", file_version="2.0.1")
    dm = etree.SubElement(root, "Data_Mentah")
    _sub(dm, "Kunci", ",".join(_format_num(v) for v in exam.ideal_scores))
    _sub(dm, "JumSubyek", str(int(exam.subject_count)))
    _sub(dm, "JumButir", str(int(exam.item_count)))
    is_need_recalc = False if analysis is not None else exam.is_need_recalc
    _sub(dm, "IsNeedRecalc", "-1" if is_need_recalc else "0")

    no_butir = etree.SubElement(dm, "NoButir")
    for item_no in exam.item_numbers:
        _sub(no_butir, "NOBTR", str(item_no))

    jawaban = etree.SubElement(dm, "Jawaban")
    _sub(jawaban, "JumItem", str(int(exam.subject_count)))
    for subj in exam.subjects:
        sub_el = etree.SubElement(jawaban, "Subyek")
        _sub(sub_el, "Nama", subj.name)
        csv_scores = ",".join("*" if v is None else _format_num(v) for v in subj.scores)
        _sub(sub_el, "Jwb", csv_scores)

    ds = etree.SubElement(root, "Data_Skor")
    if analysis is not None:
        _sub(ds, "Rata2", _format_num(analysis.scoring.mean))
        _sub(ds, "SD", _format_num(analysis.scoring.std_dev))
        _sub(ds, "IsUrutkanBerdSkor", "-1" if exam.is_sorted_by_score else "0")
        _sub(ds, "JumButir", str(int(exam.item_count)))
        _sub(ds, "MaxSkor", ",".join(_format_num(v) for v in analysis.scoring.observed_max))
        _sub(ds, "MinSkor", ",".join(_format_num(v) for v in analysis.scoring.observed_min))
        ds_no_butir = etree.SubElement(ds, "NoButir")
        for item_no in exam.item_numbers:
            _sub(ds_no_butir, "NOBTR", str(item_no))
        skor = etree.SubElement(ds, "Skor")
        _sub(skor, "JumItem", str(int(exam.subject_count)))
        order = (
            analysis.scoring.sorted_order
            if exam.is_sorted_by_score
            else range(len(analysis.scoring.subjects))
        )
        for pos in order:
            row = analysis.scoring.subjects[pos]
            sub_el = etree.SubElement(skor, "Subyek")
            _sub(sub_el, "Nama", row.name)
            _sub(
                sub_el,
                "SkorButir",
                ",".join("*" if v is None else _format_num(v) for v in row.scores),
            )
            _sub(sub_el, "SkorTotal", _format_num(row.total_score))
            _sub(sub_el, "UrutanAwal", str(row.original_index))
            _sub(sub_el, "JumBlank", str(row.blank_count))
    else:
        _sub(ds, "Rata2", "0")
        _sub(ds, "SD", "0")
        _sub(ds, "IsUrutkanBerdSkor", "-1" if exam.is_sorted_by_score else "0")
        _sub(ds, "JumButir", "0")
        skor = etree.SubElement(ds, "Skor")
        _sub(skor, "JumItem", "0")

    return etree.tostring(root, xml_declaration=True, encoding="utf-8")


def write_ana(
    path: Path,
    exam: Exam,
    *,
    analysis: ExamAnalysis | None = None,
) -> None:
    payload = serialize_ana(exam, analysis=analysis)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    except OSError as exc:
        raise IoError(f"Failed to write {path}: {exc}") from exc
