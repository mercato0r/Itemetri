import json
import re
import tempfile
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import ValidationError

from itemetri import __version__
from itemetri.domain import (
    AnalysisError,
    AnalysisOptions,
    CompatibilityMode,
    EssayExam,
    EssaySubject,
    Exam,
    ExamKind,
    MergeAxis,
    MultipleChoiceAnalysis,
    MultipleChoiceExam,
    MultipleChoiceSubject,
)
from itemetri.engine import (
    analyze_exam,
    compare_modes,
    generate_diagnostic_mc_sample,
    generate_essay_demo_sample,
    merge_exams,
)
from itemetri.io import (
    parse_ana_bytes,
    preview_tabular_bytes,
    read_ana,
    read_csv_exam,
    read_tabular_mapped_bytes,
    read_xlsx_exam,
    render_html_report,
    render_reliabel_txt,
    serialize_ana,
    write_csv_analysis,
    write_csv_exam,
    write_xlsx_analysis,
    write_xlsx_exam,
)
from itemetri.web.schemas import (
    AnalysisOptionsPayload,
    AnalyzeRequest,
    CellPatchPayload,
    CompareRequest,
    ExamPayload,
    ExportRequest,
    SampleFileInfo,
    SessionPatchRequest,
    analysis_to_response,
    diff_to_response,
    exam_to_payload,
    options_payload_to_domain,
    payload_to_exam,
    sanitize_json,
)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
_SAFE_FILENAME_CHARS_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _get_samples_dir(request: Request) -> Path:
    samples_dir: Path = request.app.state.samples_dir
    return samples_dir


def _resolve_sample_path(samples_dir: Path, filename: str) -> Path:
    if (
        not filename
        or "/" in filename
        or "\\" in filename
        or "\x00" in filename
        or ".." in filename
    ):
        raise HTTPException(status_code=400, detail="Invalid sample filename.")
    base = samples_dir.resolve()
    candidate = (base / filename).resolve()
    if candidate.parent != base or candidate.suffix.lower() != ".ana":
        raise HTTPException(status_code=400, detail="Only .ana/.ANA sample files are allowed.")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail=f"Sample file not found: {filename}")
    return candidate


def _safe_download_stem(source_path: str | None) -> str:
    if not source_path:
        return "anates_exam"
    stem = Path(source_path).stem
    cleaned = _SAFE_FILENAME_CHARS_RE.sub("_", stem).strip("._-")
    return cleaned or "anates_exam"


def _parse_kind_filter(kind: str) -> ExamKind | None:
    if kind == "auto":
        return None
    if kind == "mc":
        return ExamKind.MULTIPLE_CHOICE
    if kind == "essay":
        return ExamKind.ESSAY
    raise HTTPException(status_code=400, detail=f"Invalid kind filter: {kind}")


async def _load_uploaded_exam(
    file: UploadFile,
    parsed_kind: ExamKind | None,
    option_count: int | None,
) -> tuple[Exam, str, str | None, str | None]:
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Uploaded file exceeds the 20 MB limit.",
        )

    orig_name = file.filename or "upload.ana"
    suffix = Path(orig_name).suffix.lower()
    if suffix == ".ana":
        doc = parse_ana_bytes(raw, source=orig_name)
        if parsed_kind is not None and doc.exam.kind is not parsed_kind:
            raise AnalysisError(
                f"{orig_name} is {doc.exam.kind.value}, expected {parsed_kind.value}."
            )
        return (doc.exam, orig_name, doc.file_version, doc.detected_encoding)

    if suffix in (".csv", ".xlsx"):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir) / f"upload{suffix}"
            tmp_path.write_bytes(raw)
            if suffix == ".csv":
                loaded = read_csv_exam(
                    tmp_path,
                    kind=parsed_kind,
                    option_count=option_count,
                )
            else:
                loaded = read_xlsx_exam(
                    tmp_path,
                    kind=parsed_kind,
                    option_count=option_count,
                )
            return (replace(loaded, source_path=orig_name), orig_name, None, None)

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported file extension {suffix!r}; expected .ana, .csv, or .xlsx.",
    )


def _parse_optional_int_form(raw: str | None, field_name: str) -> int | None:
    if raw is None:
        return None
    cleaned = raw.strip().lower()
    if cleaned in ("", "none", "null"):
        return None
    try:
        return int(cleaned)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid integer for {field_name}: {raw!r}.",
        ) from exc


def _apply_cell_patches(exam: Exam, patches: list[CellPatchPayload]) -> Exam:
    if not patches:
        return exam
    if isinstance(exam, MultipleChoiceExam):
        key_chars = list(exam.answer_key)
        mc_subjects = list(exam.subjects)
        for patch in patches:
            r, c, val = patch.row, patch.col, patch.value
            if r == -1 and 0 <= c < len(key_chars):
                text = str(val or "").strip()
                if len(text) == 1:
                    key_chars[c] = text
            elif 0 <= r < len(mc_subjects):
                subj = mc_subjects[r]
                if c == -1:
                    mc_subjects[r] = MultipleChoiceSubject(
                        name=str(val or ""),
                        responses=subj.responses,
                        original_index=subj.original_index,
                    )
                elif 0 <= c < len(key_chars):
                    text = str(val or "").strip()
                    ch = text[0] if text else "*"
                    chars = list(subj.responses)
                    chars[c] = ch
                    mc_subjects[r] = MultipleChoiceSubject(
                        name=subj.name,
                        responses="".join(chars),
                        original_index=subj.original_index,
                    )
        return MultipleChoiceExam(
            answer_key="".join(key_chars),
            option_count=exam.option_count,
            subjects=tuple(mc_subjects),
            weights=exam.weights,
            is_sorted_by_score=False,
            is_need_recalc=True,
            source_path=exam.source_path,
        )

    assert isinstance(exam, EssayExam)
    ideals = list(exam.ideal_scores)
    essay_subjects = list(exam.subjects)
    for patch in patches:
        r, c, val = patch.row, patch.col, patch.value
        if r == -1 and 0 <= c < len(ideals):
            if val is not None:
                num = float(val)
                if num > 0.0:
                    ideals[c] = num
        elif 0 <= r < len(essay_subjects):
            esubj = essay_subjects[r]
            if c == -1:
                essay_subjects[r] = EssaySubject(
                    name=str(val or ""),
                    scores=esubj.scores,
                    original_index=esubj.original_index,
                )
            elif 0 <= c < len(ideals):
                scores = list(esubj.scores)
                scores[c] = None if val in (None, "", "*", "#") else float(val)
                essay_subjects[r] = EssaySubject(
                    name=esubj.name,
                    scores=tuple(scores),
                    original_index=esubj.original_index,
                )
    return EssayExam(
        ideal_scores=tuple(ideals),
        subjects=tuple(essay_subjects),
        item_numbers=exam.item_numbers,
        is_sorted_by_score=False,
        is_need_recalc=True,
        source_path=exam.source_path,
    )


def build_api_router() -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @router.get("/startup")
    def startup_exam(request: Request) -> dict[str, Any]:
        startup_path: Path | None = getattr(request.app.state, "startup_exam_path", None)
        if startup_path is None or not startup_path.is_file():
            return {"has_startup": False}

        suffix = startup_path.suffix.lower()
        file_version: str | None = None
        detected_encoding: str | None = None
        if suffix == ".ana":
            doc = read_ana(startup_path)
            exam: Exam = replace(doc.exam, source_path=startup_path.name)
            file_version = doc.file_version
            detected_encoding = doc.detected_encoding
        elif suffix == ".csv":
            loaded = read_csv_exam(startup_path)
            exam = replace(loaded, source_path=startup_path.name)
        elif suffix == ".xlsx":
            loaded = read_xlsx_exam(startup_path)
            exam = replace(loaded, source_path=startup_path.name)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported startup extension {suffix!r}.",
            )

        request.app.state.session_exam = exam
        analysis = analyze_exam(
            exam,
            AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
        )
        return {
            "has_startup": True,
            "exam": exam_to_payload(exam),
            "analysis": analysis_to_response(analysis),
            "metadata": {
                "filename": startup_path.name,
                "file_version": file_version,
                "detected_encoding": detected_encoding,
            },
        }

    _BUILTIN_SIMULATION_SAMPLES: dict[str, tuple[str, str, Callable[[], Exam]]] = {
        "simulasi-pg-diagnostik": (
            "Simulasi PG Diagnostik (25x10, salah kunci #9)",
            "multiple_choice",
            generate_diagnostic_mc_sample,
        ),
        "simulasi-uraian": (
            "Simulasi Uraian (20x5, skor 10-20)",
            "essay",
            generate_essay_demo_sample,
        ),
    }

    @router.get("/samples", response_model=list[SampleFileInfo])
    def list_samples(request: Request) -> list[SampleFileInfo]:
        samples_dir = _get_samples_dir(request)
        entries: list[SampleFileInfo] = []
        if samples_dir.is_dir():
            entries.extend(
                SampleFileInfo(filename=p.name, size_bytes=p.stat().st_size)
                for p in sorted(samples_dir.iterdir(), key=lambda x: x.name.lower())
                if p.is_file() and p.suffix.lower() == ".ana"
            )
        for key, (label, kind_hint, _) in _BUILTIN_SIMULATION_SAMPLES.items():
            entries.append(
                SampleFileInfo(
                    filename=key,
                    size_bytes=0,
                    label=label,
                    kind_hint=kind_hint,
                    is_builtin=True,
                )
            )
        return entries

    @router.post("/samples/{filename}")
    def load_sample(filename: str, request: Request) -> dict[str, Any]:
        builtin = _BUILTIN_SIMULATION_SAMPLES.get(filename)
        if builtin is not None:
            _, _, generator = builtin
            exam = generator()
            request.app.state.session_exam = exam
            analysis = analyze_exam(
                exam,
                AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
            )
            return {
                "exam": exam_to_payload(exam),
                "analysis": analysis_to_response(analysis),
                "metadata": {
                    "filename": filename,
                    "file_version": None,
                    "detected_encoding": None,
                },
            }

        sample_path = _resolve_sample_path(_get_samples_dir(request), filename)
        doc = read_ana(sample_path)
        exam = replace(doc.exam, source_path=sample_path.name)
        request.app.state.session_exam = exam
        analysis = analyze_exam(
            exam,
            AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
        )
        return {
            "exam": exam_to_payload(exam),
            "analysis": analysis_to_response(analysis),
            "metadata": {
                "filename": sample_path.name,
                "file_version": doc.file_version,
                "detected_encoding": doc.detected_encoding,
            },
        }

    @router.post("/import")
    async def import_exam(
        request: Request,
        file: Annotated[UploadFile, File(...)],
        kind: Annotated[str, Form()] = "auto",
        option_count: Annotated[int | None, Form()] = None,
    ) -> dict[str, Any]:
        parsed_kind = _parse_kind_filter(kind)
        exam, orig_name, file_version, detected_encoding = await _load_uploaded_exam(
            file,
            parsed_kind,
            option_count,
        )
        request.app.state.session_exam = exam
        analysis = analyze_exam(
            exam,
            AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
        )
        return {
            "exam": exam_to_payload(exam),
            "analysis": analysis_to_response(analysis),
            "metadata": {
                "filename": orig_name,
                "file_version": file_version,
                "detected_encoding": detected_encoding,
            },
        }

    @router.post("/import/preview")
    async def preview_tabular_import(
        file: Annotated[UploadFile, File(...)],
    ) -> dict[str, Any]:
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Uploaded file exceeds the 20 MB limit.",
            )
        orig_name = file.filename or "upload.csv"
        return preview_tabular_bytes(raw, orig_name)

    @router.post("/import/mapped")
    async def import_mapped_tabular(
        request: Request,
        file: Annotated[UploadFile, File(...)],
        has_header_row: Annotated[bool, Form()] = True,
        key_row_index: Annotated[str | None, Form()] = None,
        name_col_index: Annotated[str | None, Form()] = "0",
        item_cols_json: Annotated[str | None, Form()] = None,
        kind: Annotated[str, Form()] = "auto",
        option_count: Annotated[str | None, Form()] = None,
        default_key_or_ideal: Annotated[str | None, Form()] = None,
    ) -> dict[str, Any]:
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Uploaded file exceeds the 20 MB limit.",
            )
        orig_name = file.filename or "upload.csv"
        parsed_kind = _parse_kind_filter(kind)
        parsed_key_row = _parse_optional_int_form(key_row_index, "key_row_index")
        parsed_name_col = _parse_optional_int_form(name_col_index, "name_col_index")
        parsed_opt_count = _parse_optional_int_form(option_count, "option_count")

        parsed_item_cols: list[int] | None = None
        if item_cols_json and item_cols_json.strip():
            try:
                loaded_cols = json.loads(item_cols_json)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid item_cols_json.") from exc
            if not isinstance(loaded_cols, list) or not all(
                isinstance(x, int) for x in loaded_cols
            ):
                raise HTTPException(
                    status_code=400,
                    detail="item_cols_json must be a JSON array of integer indices.",
                )
            parsed_item_cols = loaded_cols

        exam = read_tabular_mapped_bytes(
            raw,
            orig_name,
            has_header_row=has_header_row,
            key_row_index=parsed_key_row,
            name_col_index=parsed_name_col,
            item_col_indices=parsed_item_cols,
            kind=parsed_kind,
            option_count=parsed_opt_count,
            default_key_or_ideal=default_key_or_ideal,
        )
        request.app.state.session_exam = exam
        analysis = analyze_exam(
            exam,
            AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED),
        )
        return {
            "exam": exam_to_payload(exam),
            "analysis": analysis_to_response(analysis),
            "metadata": {
                "filename": orig_name,
                "file_version": None,
                "detected_encoding": None,
            },
        }

    @router.post("/merge")
    async def merge_endpoint(
        request: Request,
        exam_json: Annotated[str, Form()],
        axis: Annotated[str, Form()] = "subjects",
        require_matching_key: Annotated[bool, Form()] = True,
        options_json: Annotated[str | None, Form()] = None,
        kind: Annotated[str, Form()] = "auto",
        option_count: Annotated[int | None, Form()] = None,
        sample_filename: Annotated[str | None, Form()] = None,
        file: Annotated[UploadFile | None, File()] = None,
    ) -> dict[str, Any]:
        if axis == MergeAxis.APPEND_SUBJECTS.value:
            merge_axis = MergeAxis.APPEND_SUBJECTS
        elif axis == MergeAxis.APPEND_ITEMS.value:
            merge_axis = MergeAxis.APPEND_ITEMS
        else:
            raise HTTPException(status_code=400, detail=f"Invalid merge axis: {axis}")

        try:
            primary_payload = ExamPayload.model_validate_json(exam_json)
            options_payload = (
                AnalysisOptionsPayload.model_validate_json(options_json)
                if options_json and options_json.strip()
                else AnalysisOptionsPayload()
            )
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc

        primary_exam = payload_to_exam(primary_payload)
        options = options_payload_to_domain(options_payload)
        parsed_kind = _parse_kind_filter(kind)

        sample_clean = sample_filename.strip() if sample_filename else ""
        has_sample = bool(sample_clean)
        has_file = file is not None
        if has_sample == has_file:
            raise HTTPException(
                status_code=400,
                detail="Provide exactly one of uploaded 'file' or 'sample_filename'.",
            )

        if has_sample:
            sample_path = _resolve_sample_path(_get_samples_dir(request), sample_clean)
            doc = read_ana(sample_path)
            if parsed_kind is not None and doc.exam.kind is not parsed_kind:
                raise AnalysisError(
                    f"{sample_path.name} is {doc.exam.kind.value}, expected {parsed_kind.value}."
                )
            secondary_exam: Exam = replace(doc.exam, source_path=sample_path.name)
        else:
            assert file is not None
            secondary_exam, _, _, _ = await _load_uploaded_exam(
                file,
                parsed_kind,
                option_count,
            )

        merged = merge_exams(
            primary_exam,
            secondary_exam,
            axis=merge_axis,
            require_matching_key=require_matching_key,
        )
        request.app.state.session_exam = merged.exam
        analysis = analyze_exam(merged.exam, options)
        return {
            "exam": exam_to_payload(merged.exam),
            "analysis": analysis_to_response(analysis),
            "merge_summary": {
                "axis": merge_axis.value,
                "added_subjects": merged.added_subjects,
                "added_items": merged.added_items,
                "warnings": sanitize_json(merged.warnings),
            },
        }

    @router.post("/analyze")
    def analyze_endpoint(request: Request, body: AnalyzeRequest) -> dict[str, Any]:
        exam = payload_to_exam(body.exam)
        request.app.state.session_exam = exam
        options = options_payload_to_domain(body.options)
        analysis = analyze_exam(exam, options)
        return {"analysis": analysis_to_response(analysis)}

    @router.post("/session/patch")
    def patch_session_endpoint(
        request: Request,
        body: SessionPatchRequest,
    ) -> dict[str, Any]:
        base_exam: Exam | None
        if body.exam is not None:
            base_exam = payload_to_exam(body.exam)
        else:
            base_exam = getattr(request.app.state, "session_exam", None)
        if base_exam is None:
            raise HTTPException(
                status_code=400,
                detail="No active session exam; supply exam payload or load a file first.",
            )
        updated = _apply_cell_patches(base_exam, body.cell_patches)
        request.app.state.session_exam = updated
        options = options_payload_to_domain(body.options)
        analysis = analyze_exam(updated, options)
        return {"analysis": analysis_to_response(analysis)}

    @router.post("/compare")
    def compare_endpoint(body: CompareRequest) -> dict[str, Any]:
        exam = payload_to_exam(body.exam)
        diff = compare_modes(exam, upper_lower_percent=body.upper_lower_percent)
        return {"diff": diff_to_response(diff)}

    @router.post("/export")
    def export_endpoint(body: ExportRequest) -> Response:
        exam = payload_to_exam(body.exam)
        options = options_payload_to_domain(body.options)
        stem = _safe_download_stem(exam.source_path)
        fmt = body.format

        if fmt == "ana":
            analysis = analyze_exam(exam, options)
            content = serialize_ana(exam, analysis=analysis)
            return Response(
                content=content,
                media_type="application/xml",
                headers={"Content-Disposition": f'attachment; filename="{stem}.ana"'},
            )

        if fmt == "html":
            analysis = analyze_exam(exam, options)
            html = render_html_report(analysis)
            return Response(
                content=html.encode("utf-8"),
                media_type="text/html; charset=utf-8",
                headers={"Content-Disposition": f'attachment; filename="{stem}_laporan.html"'},
            )

        if fmt == "reliabel-txt":
            analysis = analyze_exam(exam, options)
            if not isinstance(analysis, MultipleChoiceAnalysis):
                raise AnalysisError("Format reliabel.txt hanya tersedia untuk ujian Pilihan Ganda.")
            txt = render_reliabel_txt(analysis)
            return Response(
                content=txt.encode("cp1252", errors="replace"),
                media_type="text/plain; charset=windows-1252",
                headers={"Content-Disposition": f'attachment; filename="{stem}_reliabel.txt"'},
            )

        with tempfile.TemporaryDirectory() as tmp_dir:
            if fmt == "csv-exam":
                out_path = Path(tmp_dir) / f"{stem}_data.csv"
                write_csv_exam(out_path, exam)
                media_type = "text/csv; charset=utf-8"
            elif fmt == "csv-analysis":
                analysis = analyze_exam(exam, options)
                out_path = Path(tmp_dir) / f"{stem}_analisis.csv"
                write_csv_analysis(out_path, analysis)
                media_type = "text/csv; charset=utf-8"
            elif fmt == "xlsx-exam":
                out_path = Path(tmp_dir) / f"{stem}_data.xlsx"
                write_xlsx_exam(out_path, exam)
                media_type = (
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
            else:
                analysis = analyze_exam(exam, options)
                out_path = Path(tmp_dir) / f"{stem}_analisis.xlsx"
                write_xlsx_analysis(out_path, analysis)
                media_type = (
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
            data = out_path.read_bytes()
            return Response(
                content=data,
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{out_path.name}"'},
            )

    return router
