import csv
import io
import math
from pathlib import Path
from typing import Any

import openpyxl

from itemetri.domain.enums import ExamKind
from itemetri.domain.errors import DomainValidationError, IoError, ParseError
from itemetri.domain.models import (
    EssayAnalysis,
    EssayExam,
    EssaySubject,
    Exam,
    ExamAnalysis,
    MultipleChoiceAnalysis,
    MultipleChoiceExam,
    MultipleChoiceSubject,
)
from itemetri.domain.types import OptionCount
from itemetri.io.encoding import decode_bytes

_KEY_MARKERS = frozenset({"kunci", "key", "skor ideal", "skor_ideal", "ideal", "kunci jawaban"})


def _cell_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _detect_csv_delimiter(sample: str) -> str:
    first_line = sample.splitlines()[0] if sample else ""
    if first_line.count(";") > first_line.count(","):
        return ";"
    if first_line.count("\t") > first_line.count(",") and "\t" in first_line:
        return "\t"
    try:
        dialect = csv.Sniffer().sniff(sample[:4096], delimiters=",;\t")
        return dialect.delimiter
    except csv.Error:
        return ","


def _parse_item_numbers_from_header(headers: list[str]) -> tuple[int, ...]:
    parsed: list[int] = []
    for raw in headers:
        cleaned = raw.strip()
        if cleaned.isdigit() and int(cleaned) > 0:
            parsed.append(int(cleaned))
        else:
            return tuple(range(1, len(headers) + 1))
    return tuple(parsed)


def _try_parse_float(raw: str) -> float | None:
    try:
        val = float(raw)
    except ValueError:
        return None
    if not math.isfinite(val):
        return None
    return val


def _infer_kind(key_cells: list[str], source: str | None) -> ExamKind:
    all_single_alpha = all(
        len(cell) == 1 and cell.isascii() and cell.isalpha() for cell in key_cells
    )
    all_positive_float = all(
        (v := _try_parse_float(cell)) is not None and v > 0.0 for cell in key_cells
    )
    if all_positive_float and not all_single_alpha:
        return ExamKind.ESSAY
    if all_single_alpha:
        return ExamKind.MULTIPLE_CHOICE
    raise ParseError(
        "Unable to detect exam kind from key/ideal row; pass --kind mc or --kind essay.",
        source=source,
        line=2,
    )


def _rows_to_exam(
    rows: list[list[str]],
    *,
    source: str | None,
    kind: ExamKind | None,
    option_count: int | None,
) -> Exam:
    non_empty_rows: list[tuple[int, list[str]]] = [
        (row_idx, row)
        for row_idx, row in enumerate(rows, start=1)
        if any(cell != "" for cell in row)
    ]
    if len(non_empty_rows) < 3:
        raise ParseError(
            "Tabular exam requires at least 3 non-empty rows: header, key/ideal, and 1 subject.",
            source=source,
            line=1,
        )

    header_row = non_empty_rows[0][1]
    item_count = len(header_row) - 1
    if item_count < 1:
        raise ParseError(
            "Header row must have Nama column plus at least one item column.",
            source=source,
            line=non_empty_rows[0][0],
        )

    key_line, key_row = non_empty_rows[1]
    key_label = key_row[0].strip().lower() if key_row else ""
    if key_label not in _KEY_MARKERS:
        raise ParseError(
            f"Row {key_line} col 1 must be Kunci/Key/Skor Ideal, got {key_row[0]!r}.",
            source=source,
            line=key_line,
        )

    key_cells = [
        key_row[col] if col < len(key_row) else "" for col in range(1, item_count + 1)
    ]
    if any(cell == "" for cell in key_cells):
        raise ParseError(
            "Key/ideal row contains empty item cells.",
            source=source,
            line=key_line,
        )

    resolved_kind = kind if kind is not None else _infer_kind(key_cells, source)
    subject_rows = non_empty_rows[2:]

    if resolved_kind is ExamKind.MULTIPLE_CHOICE:
        for col_idx, cell in enumerate(key_cells, start=1):
            if len(cell) != 1 or not cell.isascii() or not cell.isalpha():
                raise ParseError(
                    f"MC key at col {col_idx + 1} must be a single letter, got {cell!r}.",
                    source=source,
                    line=key_line,
                )
        answer_key = "".join(key_cells)
        letters_seen = [c.upper() for c in answer_key]

        mc_subjects: list[MultipleChoiceSubject] = []
        for idx, (row_line, row) in enumerate(subject_rows):
            name = row[0] if row else ""
            chars: list[str] = []
            for col in range(1, item_count + 1):
                raw = row[col] if col < len(row) else ""
                if raw == "":
                    chars.append("*")
                elif len(raw) == 1:
                    chars.append(raw)
                    if raw.isascii() and raw.isalpha():
                        letters_seen.append(raw.upper())
                else:
                    raise ParseError(
                        f"Subject {name!r} col {col + 1} expected 1 character, got {raw!r}.",
                        source=source,
                        line=row_line,
                    )
            mc_subjects.append(
                MultipleChoiceSubject(name=name, responses="".join(chars), original_index=idx)
            )

        inferred_options = max([4] + [ord(ch) - ord("A") + 1 for ch in letters_seen])
        resolved_options = option_count if option_count is not None else inferred_options
        try:
            return MultipleChoiceExam(
                answer_key=answer_key,
                option_count=OptionCount(resolved_options),
                subjects=tuple(mc_subjects),
                source_path=source,
            )
        except DomainValidationError as exc:
            raise ParseError(str(exc), source=source, line=key_line) from exc

    ideal_scores: list[float] = []
    for col_idx, cell in enumerate(key_cells, start=1):
        val = _try_parse_float(cell)
        if val is None or val <= 0.0:
            raise ParseError(
                f"Essay ideal score at col {col_idx + 1} must be > 0, got {cell!r}.",
                source=source,
                line=key_line,
            )
        ideal_scores.append(val)

    essay_subjects: list[EssaySubject] = []
    for idx, (row_line, row) in enumerate(subject_rows):
        name = row[0] if row else ""
        scores: list[float | None] = []
        for col in range(1, item_count + 1):
            raw = row[col] if col < len(row) else ""
            if raw in ("", "*", "#"):
                scores.append(None)
            else:
                val = _try_parse_float(raw)
                if val is None or val < 0.0:
                    raise ParseError(
                        f"Subject {name!r} col {col + 1} invalid score {raw!r}.",
                        source=source,
                        line=row_line,
                    )
                scores.append(val)
        essay_subjects.append(
            EssaySubject(name=name, scores=tuple(scores), original_index=idx)
        )

    item_numbers = _parse_item_numbers_from_header(header_row[1 : item_count + 1])
    try:
        return EssayExam(
            ideal_scores=tuple(ideal_scores),
            subjects=tuple(essay_subjects),
            item_numbers=item_numbers,
            source_path=source,
        )
    except DomainValidationError as exc:
        raise ParseError(str(exc), source=source, line=key_line) from exc


def _load_tabular_rows_from_bytes(
    raw: bytes,
    filename: str,
    *,
    delimiter: str | None = None,
    sheet_name: str | None = None,
) -> list[list[str]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        text, _ = decode_bytes(raw, source=filename)
        delim = delimiter if delimiter is not None else _detect_csv_delimiter(text)
        reader = csv.reader(io.StringIO(text), delimiter=delim)
        return [[cell.strip() for cell in row] for row in reader]

    if suffix == ".xlsx":
        try:
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        except Exception as exc:
            raise ParseError(f"Unable to open XLSX workbook: {exc}", source=filename) from exc
        try:
            if sheet_name is not None and sheet_name not in wb.sheetnames:
                raise ParseError(f"Sheet {sheet_name!r} not found in workbook.", source=filename)
            ws = wb[sheet_name] if sheet_name is not None else wb.active
            if ws is None:
                raise ParseError("Workbook has no active worksheet.", source=filename)
            return [[_cell_str(cell) for cell in row] for row in ws.iter_rows(values_only=True)]
        finally:
            wb.close()

    raise ParseError(
        f"Unsupported tabular extension {suffix!r}; expected .csv or .xlsx.",
        source=filename,
    )


def _infer_kind_from_data_samples(
    data_rows: list[list[str]],
    item_cols: list[int],
) -> tuple[ExamKind, str]:
    alpha_hits = 0
    numeric_hits = 0
    max_num = 0.0
    for row in data_rows[:25]:
        for col in item_cols:
            cell = row[col] if col < len(row) else ""
            if cell in ("", "*", "#"):
                continue
            if len(cell) == 1 and cell.isascii() and cell.isalpha():
                alpha_hits += 1
            else:
                num = _try_parse_float(cell)
                if num is not None and num >= 0.0:
                    numeric_hits += 1
                    if num > max_num:
                        max_num = num
    if alpha_hits >= numeric_hits and alpha_hits > 0:
        return (ExamKind.MULTIPLE_CHOICE, "A")
    default_ideal = str(int(max_num)) if max_num >= 1.0 and max_num.is_integer() else "10"
    return (ExamKind.ESSAY, default_ideal if max_num >= 1.0 else "10")


def preview_tabular_bytes(
    raw: bytes,
    filename: str,
    *,
    max_preview_rows: int = 15,
) -> dict[str, Any]:
    """Parse raw CSV/XLSX bytes and suggest flexible row/column mappings."""
    parsed = _load_tabular_rows_from_bytes(raw, filename)
    non_empty = [row for row in parsed if any(cell != "" for cell in row)]
    if not non_empty:
        raise ParseError("Tabular file contains no non-empty rows.", source=filename, line=1)

    total_cols = max(len(row) for row in non_empty)
    if total_cols < 1:
        raise ParseError("Tabular file contains no columns.", source=filename, line=1)

    padded = [[row[c] if c < len(row) else "" for c in range(total_cols)] for row in non_empty]
    has_header = len(padded) >= 2
    name_col_index: int | None = 0 if total_cols > 1 else None
    item_col_indices = list(range(1, total_cols)) if total_cols > 1 else [0]

    key_row_index: int | None = None
    if len(padded) >= 3 and padded[1][0].strip().lower() in _KEY_MARKERS:
        key_row_index = 1

    data_start = 2 if key_row_index == 1 else (1 if has_header else 0)
    data_rows = padded[data_start:]
    if key_row_index is not None:
        key_cells = [padded[key_row_index][c] for c in item_col_indices]
        try:
            inferred_kind = _infer_kind(key_cells, filename)
            default_val = "A" if inferred_kind is ExamKind.MULTIPLE_CHOICE else "10"
        except ParseError:
            inferred_kind, default_val = _infer_kind_from_data_samples(data_rows, item_col_indices)
    else:
        inferred_kind, default_val = _infer_kind_from_data_samples(data_rows, item_col_indices)

    return {
        "filename": filename,
        "total_rows": len(padded),
        "total_cols": total_cols,
        "preview_rows": padded[:max_preview_rows],
        "suggested_mapping": {
            "has_header_row": has_header,
            "key_row_index": key_row_index,
            "name_col_index": name_col_index,
            "item_col_indices": item_col_indices,
            "inferred_kind": inferred_kind.value,
            "default_key_or_ideal": default_val,
        },
    }


def read_tabular_mapped_bytes(
    raw: bytes,
    filename: str,
    *,
    has_header_row: bool = True,
    key_row_index: int | None = None,
    name_col_index: int | None = 0,
    item_col_indices: list[int] | None = None,
    kind: ExamKind | None = None,
    option_count: int | None = None,
    default_key_or_ideal: str | None = None,
) -> Exam:
    """Import CSV/XLSX bytes with caller-mapped header, key/ideal row, name, and item columns."""
    parsed = _load_tabular_rows_from_bytes(raw, filename)
    non_empty = [row for row in parsed if any(cell != "" for cell in row)]
    if not non_empty:
        raise ParseError("Tabular file contains no non-empty rows.", source=filename, line=1)

    total_cols = max(len(row) for row in non_empty)
    padded = [[row[c] if c < len(row) else "" for c in range(total_cols)] for row in non_empty]

    if name_col_index is not None and not (0 <= name_col_index < total_cols):
        raise ParseError(
            f"name_col_index {name_col_index} out of range 0..{total_cols - 1}.",
            source=filename,
        )

    cols = (
        list(item_col_indices)
        if item_col_indices is not None
        else [c for c in range(total_cols) if c != name_col_index]
    )
    if not cols:
        raise ParseError("At least one item column must be selected.", source=filename)
    for col in cols:
        if not (0 <= col < total_cols):
            raise ParseError(
                f"Item column index {col} out of range 0..{total_cols - 1}.",
                source=filename,
            )

    skip_rows: set[int] = set()
    header_labels: list[str] = []
    if has_header_row:
        skip_rows.add(0)
        header_labels = [padded[0][c] for c in cols]

    if key_row_index is not None:
        if not (0 <= key_row_index < len(padded)):
            raise ParseError(
                f"key_row_index {key_row_index} out of range 0..{len(padded) - 1}.",
                source=filename,
            )
        skip_rows.add(key_row_index)

    data_entries = [(idx, row) for idx, row in enumerate(padded) if idx not in skip_rows]
    if not data_entries:
        raise ParseError(
            "No participant data rows remain after header/key mapping.",
            source=filename,
        )

    if kind is not None:
        resolved_kind = kind
    elif key_row_index is not None:
        key_cells = [padded[key_row_index][c] for c in cols]
        try:
            resolved_kind = _infer_kind(key_cells, filename)
        except ParseError:
            resolved_kind, _ = _infer_kind_from_data_samples(
                [r for _, r in data_entries],
                cols,
            )
    else:
        resolved_kind, _ = _infer_kind_from_data_samples(
            [r for _, r in data_entries],
            cols,
        )

    if resolved_kind is ExamKind.MULTIPLE_CHOICE:
        raw_default_key = (default_key_or_ideal or "A").strip().upper()
        fallback_key = (
            raw_default_key[0]
            if len(raw_default_key) == 1 and raw_default_key.isascii() and raw_default_key.isalpha()
            else "A"
        )
        key_chars: list[str] = []
        if key_row_index is not None:
            key_line = key_row_index + 1
            for col in cols:
                cell = padded[key_row_index][col].strip()
                if cell == "":
                    key_chars.append(fallback_key)
                elif len(cell) == 1 and cell.isascii() and cell.isalpha():
                    key_chars.append(cell)
                else:
                    raise ParseError(
                        f"MC key at col {col + 1} must be a single letter, got {cell!r}.",
                        source=filename,
                        line=key_line,
                    )
        else:
            key_chars = [fallback_key] * len(cols)

        answer_key = "".join(key_chars)
        letters_seen = [c.upper() for c in answer_key]
        mc_subjects: list[MultipleChoiceSubject] = []
        for idx, (row_idx, row) in enumerate(data_entries):
            subj_name = row[name_col_index] if name_col_index is not None else f"Peserta {idx + 1}"
            chars: list[str] = []
            for col in cols:
                cell = row[col].strip()
                if cell == "":
                    chars.append("*")
                elif len(cell) == 1:
                    chars.append(cell)
                    if cell.isascii() and cell.isalpha():
                        letters_seen.append(cell.upper())
                else:
                    raise ParseError(
                        f"Subject {subj_name!r} col {col + 1} expected 1 character, got {cell!r}.",
                        source=filename,
                        line=row_idx + 1,
                    )
            mc_subjects.append(
                MultipleChoiceSubject(
                    name=subj_name,
                    responses="".join(chars),
                    original_index=idx,
                )
            )
        inferred_options = max([4] + [ord(ch) - ord("A") + 1 for ch in letters_seen])
        resolved_options = option_count if option_count is not None else inferred_options
        try:
            return MultipleChoiceExam(
                answer_key=answer_key,
                option_count=OptionCount(resolved_options),
                subjects=tuple(mc_subjects),
                source_path=filename,
            )
        except DomainValidationError as exc:
            raise ParseError(str(exc), source=filename) from exc

    parsed_default_ideal = _try_parse_float((default_key_or_ideal or "").strip())
    fallback_ideal = (
        parsed_default_ideal
        if parsed_default_ideal is not None and parsed_default_ideal > 0.0
        else 10.0
    )

    essay_subjects: list[EssaySubject] = []
    col_observed_max: list[float] = [0.0] * len(cols)
    for idx, (row_idx, row) in enumerate(data_entries):
        subj_name = row[name_col_index] if name_col_index is not None else f"Peserta {idx + 1}"
        scores: list[float | None] = []
        for j, col in enumerate(cols):
            cell = row[col].strip()
            if cell in ("", "*", "#"):
                scores.append(None)
            else:
                val = _try_parse_float(cell)
                if val is None or val < 0.0:
                    raise ParseError(
                        f"Subject {subj_name!r} col {col + 1} invalid score {cell!r}.",
                        source=filename,
                        line=row_idx + 1,
                    )
                scores.append(val)
                if val > col_observed_max[j]:
                    col_observed_max[j] = val
        essay_subjects.append(
            EssaySubject(name=subj_name, scores=tuple(scores), original_index=idx)
        )

    ideal_scores: list[float] = []
    for j, col in enumerate(cols):
        if key_row_index is not None:
            raw_cell = padded[key_row_index][col].strip()
            val = _try_parse_float(raw_cell) if raw_cell else None
            if raw_cell == "":
                fallback_col = (
                    col_observed_max[j] if col_observed_max[j] > 0.0 else fallback_ideal
                )
                ideal_scores.append(fallback_col)
            elif val is not None and val > 0.0:
                ideal_scores.append(val)
            else:
                raise ParseError(
                    f"Essay ideal score at col {col + 1} must be > 0, got {raw_cell!r}.",
                    source=filename,
                    line=key_row_index + 1,
                )
        else:
            ideal_scores.append(
                parsed_default_ideal
                if parsed_default_ideal is not None and parsed_default_ideal > 0.0
                else (col_observed_max[j] if col_observed_max[j] > 0.0 else 10.0)
            )

    item_numbers = (
        _parse_item_numbers_from_header(header_labels)
        if header_labels
        else tuple(range(1, len(cols) + 1))
    )
    try:
        return EssayExam(
            ideal_scores=tuple(ideal_scores),
            subjects=tuple(essay_subjects),
            item_numbers=item_numbers,
            source_path=filename,
        )
    except DomainValidationError as exc:
        raise ParseError(str(exc), source=filename) from exc


def read_csv_exam(
    path: Path,
    *,
    kind: ExamKind | None = None,
    option_count: int | None = None,
    delimiter: str | None = None,
) -> Exam:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise IoError(f"Failed to read {path}: {exc}") from exc

    text, _ = decode_bytes(raw, source=str(path))
    delim = delimiter if delimiter is not None else _detect_csv_delimiter(text)
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    rows = [[cell.strip() for cell in row] for row in reader]
    return _rows_to_exam(rows, source=str(path), kind=kind, option_count=option_count)


def read_xlsx_exam(
    path: Path,
    *,
    kind: ExamKind | None = None,
    option_count: int | None = None,
    sheet_name: str | None = None,
) -> Exam:
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:
        raise ParseError(f"Unable to open XLSX workbook: {exc}", source=str(path)) from exc

    try:
        if sheet_name is not None and sheet_name not in wb.sheetnames:
            raise ParseError(f"Sheet {sheet_name!r} not found in workbook.", source=str(path))
        ws = wb[sheet_name] if sheet_name is not None else wb.active
        if ws is None:
            raise ParseError("Workbook has no active worksheet.", source=str(path))
        rows = [[_cell_str(cell) for cell in row] for row in ws.iter_rows(values_only=True)]
    finally:
        wb.close()

    return _rows_to_exam(rows, source=str(path), kind=kind, option_count=option_count)


def _exam_to_rows(exam: Exam) -> list[list[Any]]:
    if isinstance(exam, MultipleChoiceExam):
        header: list[Any] = ["Nama", *[str(i) for i in range(1, int(exam.item_count) + 1)]]
        key_row: list[Any] = ["Kunci", *list(exam.answer_key)]
        mc_body: list[list[Any]] = [[subj.name, *list(subj.responses)] for subj in exam.subjects]
        return [header, key_row, *mc_body]

    header = ["Nama", *[str(n) for n in exam.item_numbers]]
    key_row = ["Skor Ideal", *list(exam.ideal_scores)]
    essay_body: list[list[Any]] = [
        [subj.name, *["*" if v is None else v for v in subj.scores]]
        for subj in exam.subjects
    ]
    return [header, key_row, *essay_body]


def write_csv_exam(path: Path, exam: Exam) -> None:
    """Export raw exam data to CSV in round-trip tabular layout."""
    rows = _exam_to_rows(exam)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerows(rows)
    except OSError as exc:
        raise IoError(f"Failed to write {path}: {exc}") from exc


def write_xlsx_exam(path: Path, exam: Exam) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "Data Mentah"
    for row in _exam_to_rows(exam):
        ws.append(row)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        wb.save(path)
    except OSError as exc:
        raise IoError(f"Failed to write {path}: {exc}") from exc
    finally:
        wb.close()


def _excel_val(value: float | None) -> Any:
    if value is None:
        return None
    if math.isnan(value):
        return "NAN"
    if math.isinf(value):
        return "INF" if value > 0 else "-INF"
    return value


def write_csv_analysis(path: Path, analysis: ExamAnalysis) -> None:
    """Export item-level psychometric results and active CompatibilityMode metadata to CSV."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["# CompatibilityMode", analysis.options.mode.value])
            writer.writerow(["# ExamKind", analysis.exam.kind.value])
            writer.writerow(["# Mean", _excel_val(analysis.scoring.mean)])
            writer.writerow(["# SD", _excel_val(analysis.scoring.std_dev)])
            writer.writerow(["# KorelasiXY", _excel_val(analysis.reliability.correlation_xy)])
            writer.writerow(
                ["# Reliabilitas", _excel_val(analysis.reliability.reliability_coefficient)]
            )
            writer.writerow(
                ["# CronbachAlpha", _excel_val(analysis.reliability.cronbach_alpha)]
            )
            if isinstance(analysis, MultipleChoiceAnalysis):
                writer.writerow(["# KR20", _excel_val(analysis.reliability.kr20)])
                writer.writerow(["# KR21", _excel_val(analysis.reliability.kr21)])

            if isinstance(analysis, MultipleChoiceAnalysis):
                writer.writerow(
                    [
                        "No.Urut",
                        "No.Butir",
                        "Kunci",
                        "DayaPembeda(%)",
                        "TingkatKesukaran(%)",
                        "KategoriKesukaran",
                        "Korelasi",
                        "PValue",
                        "Signifikansi",
                        "KorelasiTerkoreksi",
                        "PValueTerkoreksi",
                        "SignifikansiTerkoreksi",
                        "AlphaJikaDihapus",
                    ]
                )
                for dp, tk, corr in zip(
                    analysis.discrimination,
                    analysis.difficulty,
                    analysis.correlations,
                    strict=True,
                ):
                    corr_sig = (
                        corr.corrected_significance.value
                        if corr.corrected_significance is not None
                        else ""
                    )
                    writer.writerow(
                        [
                            dp.item_index + 1,
                            dp.item_number,
                            analysis.exam.answer_key[dp.item_index].upper(),
                            _excel_val(dp.index_percent),
                            _excel_val(tk.index_percent),
                            tk.category.value if tk.category is not None else "",
                            _excel_val(corr.correlation),
                            _excel_val(corr.p_value),
                            corr.significance.value,
                            _excel_val(corr.corrected_correlation),
                            _excel_val(corr.corrected_p_value),
                            corr_sig,
                            _excel_val(corr.alpha_if_deleted),
                        ]
                    )
            else:
                writer.writerow(
                    [
                        "No.Urut",
                        "No.ButirAsli",
                        "SkorIdeal",
                        "t",
                        "DayaPembeda(%)",
                        "TingkatKesukaran(%)",
                        "KategoriKesukaran",
                        "Korelasi",
                        "PValue",
                        "Signifikansi",
                        "KorelasiTerkoreksi",
                        "PValueTerkoreksi",
                        "SignifikansiTerkoreksi",
                        "AlphaJikaDihapus",
                    ]
                )
                for ul, dp, tk, corr in zip(
                    analysis.essay_upper_lower,
                    analysis.discrimination,
                    analysis.difficulty,
                    analysis.correlations,
                    strict=True,
                ):
                    corr_sig = (
                        corr.corrected_significance.value
                        if corr.corrected_significance is not None
                        else ""
                    )
                    writer.writerow(
                        [
                            dp.item_index + 1,
                            dp.item_number,
                            analysis.exam.ideal_scores[dp.item_index],
                            _excel_val(ul.t_value),
                            _excel_val(dp.index_percent),
                            _excel_val(tk.index_percent),
                            tk.category.value if tk.category is not None else "",
                            _excel_val(corr.correlation),
                            _excel_val(corr.p_value),
                            corr.significance.value,
                            _excel_val(corr.corrected_correlation),
                            _excel_val(corr.corrected_p_value),
                            corr_sig,
                            _excel_val(corr.alpha_if_deleted),
                        ]
                    )
    except OSError as exc:
        raise IoError(f"Failed to write {path}: {exc}") from exc


def write_xlsx_analysis(path: Path, analysis: ExamAnalysis) -> None:
    """Export complete psychometric tables to a multi-sheet XLSX workbook."""
    wb = openpyxl.Workbook()
    ws_summary = wb.active
    assert ws_summary is not None
    ws_summary.title = "Ringkasan"

    summary_rows: list[list[Any]] = [
        ["Atribut", "Nilai"],
        ["CompatibilityMode", analysis.options.mode.value],
        ["ExamKind", analysis.exam.kind.value],
        ["Sumber", analysis.exam.source_path or "-"],
        ["Jumlah Subyek", int(analysis.exam.subject_count)],
        ["Jumlah Butir", int(analysis.exam.item_count)],
        ["Kelompok Unggul/Asor (n)", analysis.upper_lower.group_size],
        ["Rata2", _excel_val(analysis.scoring.mean)],
        ["Simpang Baku", _excel_val(analysis.scoring.std_dev)],
        ["Korelasi XY", _excel_val(analysis.reliability.correlation_xy)],
        ["Reliabilitas Tes", _excel_val(analysis.reliability.reliability_coefficient)],
        ["Alpha Cronbach", _excel_val(analysis.reliability.cronbach_alpha)],
        ["Metode Reliabilitas", analysis.reliability.method],
    ]
    if isinstance(analysis, MultipleChoiceAnalysis):
        summary_rows.extend(
            [
                ["KR-20", _excel_val(analysis.reliability.kr20)],
                ["KR-21", _excel_val(analysis.reliability.kr21)],
            ]
        )
    if isinstance(analysis, EssayAnalysis):
        summary_rows.append(
            ["Cakupan TK Uraian", analysis.options.resolved_essay_difficulty_scope().value]
        )
    if analysis.warnings:
        summary_rows.append(["", ""])
        summary_rows.append(["Peringatan Kode", "Pesan"])
        for warn in analysis.warnings:
            summary_rows.append([warn.code, warn.message])
    for row in summary_rows:
        ws_summary.append(row)

    ws_scores = wb.create_sheet("Skor Subyek")
    if isinstance(analysis, MultipleChoiceAnalysis):
        ws_scores.append(
            [
                "No.Urut",
                "UrutanAwal",
                "Nama",
                "Betul",
                "Salah",
                "Kosong",
                "SkorAkhir",
                "SkorDibobot",
                "SkorButir",
            ]
        )
        for rank, subj_score in enumerate(analysis.scoring.subjects, start=1):
            ws_scores.append(
                [
                    rank,
                    subj_score.original_index,
                    subj_score.name,
                    subj_score.correct_count,
                    subj_score.wrong_count,
                    subj_score.blank_count,
                    subj_score.raw_score,
                    subj_score.weighted_score,
                    subj_score.score_pattern,
                ]
            )
    else:
        ws_scores.append(["No.Urut", "UrutanAwal", "Nama", "Blank", "SkorTotal"])
        for rank, essay_subj in enumerate(analysis.scoring.subjects, start=1):
            ws_scores.append(
                [
                    rank,
                    essay_subj.original_index,
                    essay_subj.name,
                    essay_subj.blank_count,
                    essay_subj.total_score,
                ]
            )

    ws_rel = wb.create_sheet("Reliabilitas")
    ws_rel.append(["No.Urut", "UrutanAwal", "Nama", "Skor Ganjil", "Skor Genap", "Skor Total"])
    for rank, rel_row in enumerate(analysis.reliability.rows, start=1):
        ws_rel.append(
            [
                rank,
                rel_row.original_index,
                rel_row.name,
                rel_row.odd_score,
                rel_row.even_score,
                rel_row.split_total,
            ]
        )

    ws_dp = wb.create_sheet("Daya Pembeda")
    ws_dp.append(["No.Urut", "No.Butir", "Unggul", "Asor", "Beda", "DP(%)"])
    for dp in analysis.discrimination:
        ws_dp.append(
            [
                dp.item_index + 1,
                dp.item_number,
                dp.upper_total,
                dp.lower_total,
                dp.difference,
                _excel_val(dp.index_percent),
            ]
        )

    ws_tk = wb.create_sheet("Tingkat Kesukaran")
    ws_tk.append(["No.Urut", "No.Butir", "Pembilang", "Penyebut", "TK(%)", "Kategori"])
    for tk in analysis.difficulty:
        ws_tk.append(
            [
                tk.item_index + 1,
                tk.item_number,
                tk.numerator,
                tk.denominator,
                _excel_val(tk.index_percent),
                tk.category.value if tk.category is not None else "",
            ]
        )

    ws_corr = wb.create_sheet("Korelasi Butir")
    ws_corr.append(
        [
            "No.Urut",
            "No.Butir",
            "r",
            "p",
            "Signifikansi",
            "r_corr",
            "p_corr",
            "Signifikansi_corr",
            "Alpha_jika_dihapus",
        ]
    )
    for corr in analysis.correlations:
        corr_sig = (
            corr.corrected_significance.value
            if corr.corrected_significance is not None
            else ""
        )
        ws_corr.append(
            [
                corr.item_index + 1,
                corr.item_number,
                _excel_val(corr.correlation),
                _excel_val(corr.p_value),
                corr.significance.value,
                _excel_val(corr.corrected_correlation),
                _excel_val(corr.corrected_p_value),
                corr_sig,
                _excel_val(corr.alpha_if_deleted),
            ]
        )

    if isinstance(analysis, MultipleChoiceAnalysis):
        ws_dist = wb.create_sheet("Pengecoh")
        ws_dist.append(["No.Butir", "Kunci", "Opsi", "Frekuensi", "IP(%)", "Kualitas"])
        for dist in analysis.distractors:
            for opt in dist.options:
                ws_dist.append(
                    [
                        dist.item_number,
                        dist.key,
                        opt.option,
                        opt.frequency,
                        _excel_val(opt.index_percent),
                        opt.quality.value,
                    ]
                )
    else:
        ws_ul = wb.create_sheet("Unggul Asor")
        ws_ul.append(
            [
                "No.Butir",
                "Mean_U",
                "Mean_L",
                "Beda_Mean",
                "SD_U",
                "SD_L",
                "SE_gab",
                "t",
                "p",
            ]
        )
        for ul in analysis.essay_upper_lower:
            ws_ul.append(
                [
                    ul.item_number,
                    _excel_val(ul.upper_mean),
                    _excel_val(ul.lower_mean),
                    _excel_val(ul.mean_diff),
                    _excel_val(ul.upper_std),
                    _excel_val(ul.lower_std),
                    _excel_val(ul.se_pooled),
                    _excel_val(ul.t_value),
                    _excel_val(ul.p_value),
                ]
            )

        ws_recap = wb.create_sheet("Rekap Butir")
        ws_recap.append(["No.Urut", "No.ButirAsli", "t", "DP(%)", "Kesukaran", "r", "Signifikansi"])
        for item in analysis.recap:
            ws_recap.append(
                [
                    item.item_index + 1,
                    item.item_number,
                    _excel_val(item.t_value),
                    _excel_val(item.discrimination_percent),
                    item.difficulty_category.value if item.difficulty_category is not None else "",
                    _excel_val(item.correlation),
                    item.significance.value,
                ]
            )

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        wb.save(path)
    except OSError as exc:
        raise IoError(f"Failed to write {path}: {exc}") from exc
    finally:
        wb.close()
