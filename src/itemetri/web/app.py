import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from itemetri import __version__
from itemetri.domain import (
    AnalysisError,
    AnatesError,
    DomainValidationError,
    IoError,
    ParseError,
)
from itemetri.web.api import build_api_router


def _has_ana_files(directory: Path) -> bool:
    return directory.is_dir() and any(
        p.is_file() and p.suffix.lower() == ".ana" for p in directory.iterdir()
    )


def _default_samples_dir() -> Path:
    if getattr(sys, "frozen", False) or "__compiled__" in globals():
        exe_dir = Path(sys.executable).resolve().parent
        if _has_ana_files(exe_dir):
            return exe_dir
    repo_root = Path(__file__).resolve().parents[3]
    if _has_ana_files(repo_root):
        return repo_root
    return Path.cwd()


def _default_static_dir() -> Path:
    meipass = getattr(sys, "_MEIPASS", None)
    if isinstance(meipass, str):
        frozen_static = Path(meipass) / "itemetri" / "web" / "static"
        if frozen_static.is_dir():
            return frozen_static
    return Path(__file__).resolve().parent / "static"


def create_app(
    *,
    samples_dir: Path | None = None,
    static_dir: Path | None = None,
    startup_exam_path: Path | None = None,
) -> FastAPI:
    app = FastAPI(title="Itemetri Workbench API", version=__version__)
    app.state.samples_dir = (
        samples_dir.resolve() if samples_dir is not None else _default_samples_dir()
    )
    app.state.startup_exam_path = (
        startup_exam_path.resolve() if startup_exam_path is not None else None
    )
    app.state.session_exam = None
    resolved_static = (
        static_dir.resolve()
        if static_dir is not None
        else _default_static_dir()
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(AnatesError)
    async def handle_anates_error(_request: Request, exc: AnatesError) -> JSONResponse:
        if isinstance(exc, ParseError):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": str(exc),
                    "code": "parse_error",
                    "source": exc.source,
                    "line": exc.line,
                    "tag": exc.tag,
                },
            )
        if isinstance(exc, DomainValidationError):
            return JSONResponse(
                status_code=422,
                content={"detail": str(exc), "code": "validation_error"},
            )
        if isinstance(exc, AnalysisError):
            return JSONResponse(
                status_code=400,
                content={"detail": str(exc), "code": "analysis_error"},
            )
        if isinstance(exc, IoError):
            return JSONResponse(
                status_code=400,
                content={"detail": str(exc), "code": "io_error"},
            )
        return JSONResponse(
            status_code=400,
            content={"detail": str(exc), "code": "anates_error"},
        )

    app.include_router(build_api_router())

    index_html = resolved_static / "index.html"
    if index_html.is_file():
        assets_dir = resolved_static / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/", include_in_schema=False)
        async def serve_index() -> FileResponse:
            return FileResponse(index_html)

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str) -> FileResponse:
            if full_path == "api" or full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="API endpoint not found.")
            candidate = (resolved_static / full_path).resolve()
            if (
                resolved_static in candidate.parents
                and candidate.is_file()
            ):
                return FileResponse(candidate)
            return FileResponse(index_html)

    return app
