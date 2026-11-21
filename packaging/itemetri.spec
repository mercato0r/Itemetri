# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT_DIR = Path(SPECPATH).resolve().parent
ICON_PATH = ROOT_DIR / "assets" / "itemetri.ico"
ONEFILE = os.environ.get("ITEMETRI_ONEFILE", "1") == "1"

hidden_imports = [
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.lifespan.on",
    "multipart",
    "python_multipart",
    *collect_submodules("scipy.special"),
    *[
        m
        for m in collect_submodules("webview")
        if not any(
            plat in m
            for plat in (
                "webview.platforms.android",
                "webview.platforms.cocoa",
                "webview.platforms.gtk",
                "webview.platforms.qt",
            )
        )
    ],
    *collect_submodules("clr_loader"),
    *collect_submodules("pythonnet"),
]

datas = [
    (str(ROOT_DIR / "src" / "anates" / "web" / "static"), "anates/web/static"),
    (str(ROOT_DIR / "src" / "anates" / "io" / "templates"), "anates/io/templates"),
    *[
        item
        for item in collect_data_files("webview")
        if "pywebview-android.jar" not in item[0].lower()
    ],
    *collect_data_files("clr_loader"),
    *collect_data_files("pythonnet"),
]

a = Analysis(
    [str(ROOT_DIR / "src" / "anates" / "desktop.py")],
    pathex=[str(ROOT_DIR / "src")],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "pytest",
        "hypothesis",
        "mypy",
        "ruff",
        "pygments",
        "rich",
        "websockets",
        "watchfiles",
        "yaml",
        "IPython",
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "wx",
        "webview.platforms.android",
        "webview.platforms.cocoa",
        "webview.platforms.gtk",
        "webview.platforms.qt",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

if ONEFILE:
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        [],
        name="itemetri-desktop",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        runtime_tmpdir=None,
        console=False,
        icon=str(ICON_PATH) if ICON_PATH.is_file() else None,
    )
else:
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name="itemetri-desktop",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        console=False,
        icon=str(ICON_PATH) if ICON_PATH.is_file() else None,
    )

    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        strip=False,
        upx=False,
        name="itemetri-desktop",
    )
