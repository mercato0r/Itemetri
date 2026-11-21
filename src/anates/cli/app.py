import webbrowser
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import typer
import uvicorn

from anates.cli.formatting import (
    format_analysis_table,
    format_diff_table,
    format_inspect_summary,
    to_json_str,
)
from anates.domain.enums import (
    CompatibilityMode,
    EssayDifficultyScope,
    ExamKind,
    MergeAxis,
)
from anates.domain.errors import AnalysisError, AnatesError, IoError
from anates.domain.models import (
    AnaDocument,
    AnalysisOptions,
    CompatibilityDiff,
    EssayExam,
    Exam,
    ExamAnalysis,
    MultipleChoiceAnalysis,
    MultipleChoiceExam,
    ValidationIssue,
)
from anates.engine.comparison import compare_modes
from anates.engine.merge import merge_exams
from anates.engine.pipeline import analyze_exam
from anates.engine.scoring import validate_essay_exam, validate_multiple_choice_exam
from anates.io.reports import render_html_report, render_reliabel_txt
from anates.io.tabular import (
    read_csv_exam,
    read_xlsx_exam,
    write_csv_analysis,
    write_csv_exam,
    write_xlsx_analysis,
    write_xlsx_exam,
)
from anates.io.xml_ana import read_ana, write_ana
from anates.web import create_app


class ModeChoice(StrEnum):
    LEGACY = "legacy"
    CORRECTED = "corrected"


class FormatChoice(StrEnum):
    TABLE = "table"
    JSON = "json"
    HTML = "html"
    RELIABEL_TXT = "reliabel-txt"
    XLSX = "xlsx"
    CSV = "csv"


class KindChoice(StrEnum):
    AUTO = "auto"
    MC = "mc"
    ESSAY = "essay"


class EssayScopeChoice(StrEnum):
    ALL = "all"
    TWO_N = "2n"


class MergeAxisChoice(StrEnum):
    SUBJECTS = "subjects"
    ITEMS = "items"


app = typer.Typer(
    name="itemetri",
    help=(
        "Itemetri: analisis kualitas instrumen evaluasi pembelajaran, "
        "validitas, reliabilitas, tingkat kesukaran, dan daya pembeda."
    ),
    no_args_is_help=True,
)


def _to_mode(choice: ModeChoice) -> CompatibilityMode:
    if choice is ModeChoice.LEGACY:
        return CompatibilityMode.LEGACY_ANATES
    return CompatibilityMode.STANDARD_CORRECTED


def _to_kind(choice: KindChoice) -> ExamKind | None:
    if choice is KindChoice.MC:
        return ExamKind.MULTIPLE_CHOICE
    if choice is KindChoice.ESSAY:
        return ExamKind.ESSAY
    return None


def _to_essay_scope(choice: EssayScopeChoice | None) -> EssayDifficultyScope | None:
    if choice is EssayScopeChoice.ALL:
        return EssayDifficultyScope.ALL_SUBJECTS
    if choice is EssayScopeChoice.TWO_N:
        return EssayDifficultyScope.UPPER_LOWER_2N
    return None


def _to_merge_axis(choice: MergeAxisChoice) -> MergeAxis:
    if choice is MergeAxisChoice.ITEMS:
        return MergeAxis.APPEND_ITEMS
    return MergeAxis.APPEND_SUBJECTS


def _write_exam_output(
    output_path: Path,
    exam: Exam,
    analysis: ExamAnalysis | None,
) -> None:
    out_suffix = output_path.suffix.lower()
    if out_suffix == ".ana":
        write_ana(output_path, exam, analysis=analysis)
    elif out_suffix == ".csv":
        if analysis is not None:
            write_csv_analysis(output_path, analysis)
        else:
            write_csv_exam(output_path, exam)
    elif out_suffix == ".xlsx":
        if analysis is not None:
            write_xlsx_analysis(output_path, analysis)
        else:
            write_xlsx_exam(output_path, exam)
    else:
        raise IoError(
            f"Unsupported output extension {output_path.suffix!r}; "
            "expected .ana, .csv, or .xlsx."
        )


def _load_input(
    path: Path,
    *,
    kind: ExamKind | None,
    option_count: int | None,
) -> tuple[Exam, AnaDocument | None]:
    if not path.exists():
        raise IoError(f"Input file not found: {path}")
    suffix = path.suffix.lower()
    if suffix == ".ana":
        doc = read_ana(path)
        if kind is not None and doc.exam.kind is not kind:
            raise AnalysisError(
                f"{path} is {doc.exam.kind.value}, expected {kind.value}."
            )
        return (doc.exam, doc)
    if suffix == ".csv":
        return (read_csv_exam(path, kind=kind, option_count=option_count), None)
    if suffix == ".xlsx":
        return (read_xlsx_exam(path, kind=kind, option_count=option_count), None)
    raise IoError(f"Unsupported input extension {path.suffix!r}; expected .ana, .csv, or .xlsx.")


def _default_output_name(source: Path, fmt: FormatChoice) -> str:
    ext_map = {
        FormatChoice.HTML: ".html",
        FormatChoice.RELIABEL_TXT: ".reliabel.txt",
        FormatChoice.XLSX: ".xlsx",
        FormatChoice.CSV: ".csv",
    }
    return f"{source.stem}{ext_map[fmt]}"


def _write_text_or_stdout(content: str, output: Path | None) -> None:
    if output is None:
        typer.echo(content)
        return
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8")
    except OSError as exc:
        raise IoError(f"Failed to write {output}: {exc}") from exc


def _emit_single_file_output(
    analysis: ExamAnalysis,
    fmt: FormatChoice,
    target: Path,
) -> None:
    if fmt is FormatChoice.HTML:
        _write_text_or_stdout(render_html_report(analysis), target)
    elif fmt is FormatChoice.RELIABEL_TXT:
        if not isinstance(analysis, MultipleChoiceAnalysis):
            raise AnalysisError("reliabel-txt format applies only to multiple-choice exams.")
        txt = render_reliabel_txt(analysis)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(txt.encode("cp1252", errors="replace"))
        except OSError as exc:
            raise IoError(f"Failed to write {target}: {exc}") from exc
    elif fmt is FormatChoice.CSV:
        write_csv_analysis(target, analysis)
    elif fmt is FormatChoice.XLSX:
        write_xlsx_analysis(target, analysis)


@app.command()
def analyze(
    files: Annotated[list[Path], typer.Argument(help="One or more .ana, .csv, or .xlsx files.")],
    mode: Annotated[
        ModeChoice,
        typer.Option("--mode", help="Evaluation mode."),
    ] = ModeChoice.CORRECTED,
    upper_lower_pct: Annotated[
        float,
        typer.Option("--upper-lower-pct", help="Upper/lower group percentage (0, 50]."),
    ] = 27.0,
    weighted: Annotated[
        bool,
        typer.Option("--weighted/--no-weighted", help="Use weighted score in corrected MC mode."),
    ] = False,
    essay_tk_scope: Annotated[
        EssayScopeChoice | None,
        typer.Option("--essay-tk-scope", help="Essay difficulty denominator scope."),
    ] = None,
    fmt: Annotated[
        FormatChoice,
        typer.Option("--format", help="Output format."),
    ] = FormatChoice.TABLE,
    output: Annotated[
        Path | None,
        typer.Option("--output", "-o", help="Output file path (or directory for batch exports)."),
    ] = None,
    kind: Annotated[
        KindChoice,
        typer.Option("--kind", help="Override tabular kind."),
    ] = KindChoice.AUTO,
    options_count: Annotated[
        int | None,
        typer.Option("--options-count", help="Override MC option count."),
    ] = None,
) -> None:
    """Analyze one or more ANATES exam files."""
    try:
        options = AnalysisOptions(
            mode=_to_mode(mode),
            upper_lower_percent=upper_lower_pct,
            use_weighted_score=weighted,
            essay_difficulty_scope=_to_essay_scope(essay_tk_scope),
        )
        resolved_kind = _to_kind(kind)
        analyses: list[tuple[Path, ExamAnalysis]] = []
        for path in files:
            exam, _ = _load_input(path, kind=resolved_kind, option_count=options_count)
            analyses.append((path, analyze_exam(exam, options)))

        if fmt is FormatChoice.TABLE:
            rendered = "\n\n".join(format_analysis_table(a) for _, a in analyses)
            _write_text_or_stdout(rendered, output)
            return

        if fmt is FormatChoice.JSON:
            payload: object = analyses[0][1] if len(analyses) == 1 else [a for _, a in analyses]
            _write_text_or_stdout(to_json_str(payload), output)
            return

        if len(analyses) == 1 and (output is None or not output.is_dir()):
            src_path, single_analysis = analyses[0]
            if output is not None:
                _emit_single_file_output(single_analysis, fmt, output)
                return
            if fmt is FormatChoice.HTML:
                typer.echo(render_html_report(single_analysis))
                return
            if fmt is FormatChoice.RELIABEL_TXT:
                if not isinstance(single_analysis, MultipleChoiceAnalysis):
                    raise AnalysisError(
                        "reliabel-txt format applies only to multiple-choice exams."
                    )
                typer.echo(render_reliabel_txt(single_analysis, line_ending="\n"), nl=False)
                return
            raise IoError(f"--output is required for --format {fmt.value}.")

        if output is None:
            if fmt is FormatChoice.HTML:
                typer.echo("\n".join(render_html_report(a) for _, a in analyses))
                return
            if fmt is FormatChoice.RELIABEL_TXT:
                chunks: list[str] = []
                for _, a in analyses:
                    if not isinstance(a, MultipleChoiceAnalysis):
                        raise AnalysisError(
                            "reliabel-txt format applies only to multiple-choice exams."
                        )
                    chunks.append(render_reliabel_txt(a, line_ending="\n"))
                typer.echo("\n".join(chunks), nl=False)
                return
            raise IoError(f"Batch --format {fmt.value} requires --output directory.")

        if output.exists() and not output.is_dir():
            raise IoError(f"Batch export expects --output to be a directory, got file {output}.")
        output.mkdir(parents=True, exist_ok=True)
        for src_path, item_analysis in analyses:
            target = output / _default_output_name(src_path, fmt)
            _emit_single_file_output(item_analysis, fmt, target)
    except AnatesError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc


@app.command()
def diff(
    files: Annotated[list[Path], typer.Argument(help="One or more exam files to compare.")],
    upper_lower_pct: Annotated[
        float,
        typer.Option("--upper-lower-pct", help="Upper/lower group percentage (0, 50]."),
    ] = 27.0,
    as_json: Annotated[bool, typer.Option("--json", help="Emit JSON output.")] = False,
    kind: Annotated[
        KindChoice,
        typer.Option("--kind", help="Override tabular kind."),
    ] = KindChoice.AUTO,
    options_count: Annotated[
        int | None,
        typer.Option("--options-count", help="Override MC option count."),
    ] = None,
) -> None:
    """Compare LEGACY_ANATES vs STANDARD_CORRECTED results on one or more files."""
    try:
        resolved_kind = _to_kind(kind)
        diffs: list[CompatibilityDiff] = []
        for path in files:
            exam, _ = _load_input(path, kind=resolved_kind, option_count=options_count)
            diffs.append(compare_modes(exam, upper_lower_percent=upper_lower_pct))

        if as_json:
            payload: object = diffs[0] if len(diffs) == 1 else diffs
            typer.echo(to_json_str(payload))
            return

        typer.echo("\n\n".join(format_diff_table(item) for item in diffs))
    except AnatesError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc


@app.command()
def convert(
    input_path: Annotated[Path, typer.Argument(help="Source .ana, .csv, or .xlsx file.")],
    output_path: Annotated[Path, typer.Argument(help="Target .ana, .csv, or .xlsx file.")],
    with_analysis: Annotated[
        bool,
        typer.Option(
            "--with-analysis/--no-with-analysis",
            help="Include computed analysis results.",
        ),
    ] = False,
    mode: Annotated[
        ModeChoice,
        typer.Option("--mode", help="Mode when --with-analysis is set."),
    ] = ModeChoice.CORRECTED,
    kind: Annotated[
        KindChoice,
        typer.Option("--kind", help="Override tabular kind."),
    ] = KindChoice.AUTO,
    options_count: Annotated[
        int | None,
        typer.Option("--options-count", help="Override MC option count."),
    ] = None,
) -> None:
    """Convert an exam file between .ana, .csv, and .xlsx formats."""
    try:
        exam, _ = _load_input(input_path, kind=_to_kind(kind), option_count=options_count)
        analysis: ExamAnalysis | None = None
        if with_analysis:
            analysis = analyze_exam(exam, AnalysisOptions(mode=_to_mode(mode)))
        _write_exam_output(output_path, exam, analysis)
        typer.echo(f"Converted {input_path} -> {output_path}")
    except AnatesError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc


@app.command()
def merge(
    primary: Annotated[Path, typer.Argument(help="Primary exam file (.ana, .csv, or .xlsx).")],
    secondary: Annotated[Path, typer.Argument(help="Secondary exam file to append from.")],
    output: Annotated[Path, typer.Argument(help="Output merged file (.ana, .csv, or .xlsx).")],
    axis: Annotated[
        MergeAxisChoice,
        typer.Option("--axis", help="Merge along subjects (rows) or items (columns)."),
    ] = MergeAxisChoice.SUBJECTS,
    allow_key_mismatch: Annotated[
        bool,
        typer.Option(
            "--allow-key-mismatch",
            help="Allow differing answer keys / ideal scores when appending subjects.",
        ),
    ] = False,
    with_analysis: Annotated[
        bool,
        typer.Option(
            "--with-analysis/--no-with-analysis",
            help="Include computed analysis results in output.",
        ),
    ] = False,
    mode: Annotated[
        ModeChoice,
        typer.Option("--mode", help="Mode when --with-analysis is set."),
    ] = ModeChoice.CORRECTED,
    kind: Annotated[
        KindChoice,
        typer.Option("--kind", help="Override tabular kind."),
    ] = KindChoice.AUTO,
    options_count: Annotated[
        int | None,
        typer.Option("--options-count", help="Override MC option count."),
    ] = None,
) -> None:
    """Merge two compatible exam files (TFGabungDuaFile) into one archive or spreadsheet."""
    try:
        resolved_kind = _to_kind(kind)
        primary_exam, _ = _load_input(primary, kind=resolved_kind, option_count=options_count)
        secondary_exam, _ = _load_input(
            secondary, kind=resolved_kind, option_count=options_count
        )
        result = merge_exams(
            primary_exam,
            secondary_exam,
            axis=_to_merge_axis(axis),
            require_matching_key=not allow_key_mismatch,
            source_path=output.name,
        )
        analysis: ExamAnalysis | None = None
        if with_analysis:
            analysis = analyze_exam(result.exam, AnalysisOptions(mode=_to_mode(mode)))
        _write_exam_output(output, result.exam, analysis)
        typer.echo(
            f"Merged {primary} + {secondary} -> {output} "
            f"(N={int(result.exam.subject_count)}, M={int(result.exam.item_count)}, "
            f"+subjects={result.added_subjects}, +items={result.added_items})"
        )
        for warn in result.warnings:
            typer.echo(f"Warning [{warn.code}]: {warn.message}")
    except AnatesError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc


@app.command()
def inspect(
    file: Annotated[Path, typer.Argument(help="Exam file (.ana, .csv, or .xlsx) to inspect.")],
    kind: Annotated[
        KindChoice,
        typer.Option("--kind", help="Override tabular kind."),
    ] = KindChoice.AUTO,
    options_count: Annotated[
        int | None,
        typer.Option("--options-count", help="Override MC option count."),
    ] = None,
) -> None:
    """Inspect exam metadata, detected encoding, cached XML scores, and data warnings."""
    try:
        exam, doc = _load_input(file, kind=_to_kind(kind), option_count=options_count)
        warnings: tuple[ValidationIssue, ...]
        if isinstance(exam, MultipleChoiceExam):
            warnings = validate_multiple_choice_exam(exam)
        else:
            assert isinstance(exam, EssayExam)
            warnings = validate_essay_exam(exam)
        typer.echo(format_inspect_summary(source=file, exam=exam, doc=doc, warnings=warnings))
    except AnatesError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc


@app.command()
def serve(
    host: Annotated[str, typer.Option("--host", help="Host interface to bind.")] = "127.0.0.1",
    port: Annotated[int, typer.Option("--port", help="TCP port to listen on.")] = 8765,
    samples_dir: Annotated[
        Path | None,
        typer.Option("--samples-dir", help="Directory containing .ana/.ANA sample files."),
    ] = None,
    open_browser: Annotated[
        bool,
        typer.Option("--open/--no-open", help="Open the local workbench URL in a browser."),
    ] = False,
) -> None:
    """Launch the local ANATES web workbench server."""
    try:
        web_app = create_app(samples_dir=samples_dir)
        if open_browser:
            webbrowser.open(f"http://{host}:{port}")
        uvicorn.run(web_app, host=host, port=port)
    except AnatesError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc
