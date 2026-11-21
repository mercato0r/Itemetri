import math
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, PackageLoader, select_autoescape

from anates.domain.enums import ExamKind
from anates.domain.models import (
    EssayAnalysis,
    ExamAnalysis,
    MultipleChoiceAnalysis,
)


def _format_half_up_2(value: float) -> str:
    if math.isnan(value):
        return "NAN"
    return f"{Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"


def _format_fixed(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "-"
    if math.isnan(value):
        return "NAN"
    return f"{value:.{decimals}f}"


def _truncate_name(name: str, width: int = 16) -> str:
    if len(name) <= width:
        return name
    return f"{name[: width - 3]}..."


def render_reliabel_txt(
    analysis: MultipleChoiceAnalysis,
    *,
    source_label: str | None = None,
    sort_by_score: bool | None = None,
    line_ending: str = "\r\n",
) -> str:
    """Render AnatesV4 TFReliabilitasTes plain-text export matching reliabel.txt layout."""
    label = (
        source_label
        if source_label is not None
        else (analysis.exam.source_path or "")
    )
    use_sorted = (
        analysis.exam.is_sorted_by_score
        if sort_by_score is None
        else sort_by_score
    )

    lines = [
        "RELIABILITAS TES",
        "================",
        "",
        f"Rata2= {_format_half_up_2(analysis.scoring.mean)}",
        f"Simpang Baku= {_format_half_up_2(analysis.scoring.std_dev)}",
        f"KorelasiXY= {_format_half_up_2(analysis.reliability.correlation_xy)}",
        f"Reliabilitas Tes= {_format_half_up_2(analysis.reliability.reliability_coefficient)}",
        f"Nama berkas: {label}",
        "",
        " No.Urut  Kode/Nama Subyek  Skor Ganjil   Skor Genap   Skor Total ",
    ]

    indices = (
        analysis.scoring.sorted_order
        if use_sorted
        else range(len(analysis.reliability.rows))
    )
    for rank, row_idx in enumerate(indices, start=1):
        row = analysis.reliability.rows[row_idx]
        disp = _truncate_name(row.name, 16)
        odd_i = round(row.odd_score)
        even_i = round(row.even_score)
        tot_i = round(row.split_total)
        lines.append(f"{rank:>8}{disp:>18}{odd_i:>13}{even_i:>13}{tot_i:>13} ")

    return line_ending.join([*lines, "", "", "", ""])


def _create_template_env() -> Environment:
    meipass = getattr(sys, "_MEIPASS", None)
    if isinstance(meipass, str):
        frozen_dir = Path(meipass) / "anates" / "io" / "templates"
        if frozen_dir.is_dir():
            return Environment(
                loader=FileSystemLoader(str(frozen_dir)),
                autoescape=select_autoescape(["html", "j2"]),
                trim_blocks=True,
                lstrip_blocks=True,
            )
    return Environment(
        loader=PackageLoader("anates.io", "templates"),
        autoescape=select_autoescape(["html", "j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render_html_report(
    analysis: ExamAnalysis,
    *,
    title: str | None = None,
) -> str:
    """Render an APA-style printable HTML report with CompatibilityMode banner."""
    env = _create_template_env()
    env.filters["fmt"] = _format_fixed
    template = env.get_template("report.html.j2")

    is_mc = analysis.exam.kind is ExamKind.MULTIPLE_CHOICE
    resolved_title = title or (
        "Laporan Analisis Butir Soal Pilihan Ganda"
        if is_mc
        else "Laporan Analisis Butir Soal Uraian"
    )
    return template.render(
        title=resolved_title,
        analysis=analysis,
        is_mc=is_mc,
        is_essay=isinstance(analysis, EssayAnalysis),
    )
