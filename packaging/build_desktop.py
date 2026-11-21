from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tarfile
import zipfile
from collections.abc import Sequence
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


def _run(
    cmd: list[str],
    *,
    cwd: Path = ROOT_DIR,
    env: dict[str, str] | None = None,
) -> None:
    print(f"+ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, env=env, check=True)


def build_frontend() -> None:
    npm_cmd = shutil.which("npm.cmd") or shutil.which("npm")
    if npm_cmd is None:
        raise RuntimeError("npm executable not found on PATH.")
    web_dir = ROOT_DIR / "web"
    _run([npm_cmd, "run", "build"], cwd=web_dir)


def verify_wheel_and_sdist(dist_dir: Path) -> None:
    wheels = sorted(dist_dir.glob("itemetri-*.whl"))
    sdists = sorted(dist_dir.glob("itemetri-*.tar.gz"))
    if not wheels or not sdists:
        raise RuntimeError(f"Expected built wheel and sdist in {dist_dir}.")

    latest_wheel = wheels[-1]
    with zipfile.ZipFile(latest_wheel) as zf:
        names = zf.namelist()
        assert "itemetri/web/static/index.html" in names, "Missing SPA index.html in wheel."
        assert "itemetri/io/templates/report.html.j2" in names, "Missing report template in wheel."
        for forbidden_ext in (".exe", ".ana", ".ico"):
            leaks = [n for n in names if n.lower().endswith(forbidden_ext)]
            assert not leaks, f"Forbidden files leaked into wheel: {leaks}"

    latest_sdist = sdists[-1]
    with tarfile.open(latest_sdist, "r:gz") as tf:
        names = tf.getnames()
        for forbidden_ext in (".exe", ".ana"):
            leaks = [n for n in names if n.lower().endswith(forbidden_ext)]
            assert not leaks, f"Forbidden files leaked into sdist: {leaks}"
        assert not any("ANATESV4.ICO" in n.upper() for n in names), "Legacy icon leaked into sdist."
    print(f"Verified wheel={latest_wheel.name} and sdist={latest_sdist.name}")


def build_python_artifacts() -> None:
    dist_dir = ROOT_DIR / "dist"
    _run(["uv", "build", "--out-dir", str(dist_dir)])
    verify_wheel_and_sdist(dist_dir)


def build_pyinstaller_bundle(*, onefile: bool = True) -> None:
    spec_path = ROOT_DIR / "packaging" / "itemetri.spec"
    dist_dir = ROOT_DIR / "dist"
    work_dir = ROOT_DIR / "build" / "pyinstaller"
    env = dict(os.environ)
    env["ITEMETRI_ONEFILE"] = "1" if onefile else "0"
    _run(
        [
            "uv",
            "run",
            "pyinstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(dist_dir),
            "--workpath",
            str(work_dir),
            str(spec_path),
        ],
        env=env,
    )
    exe_name = "itemetri-desktop.exe" if sys.platform.startswith("win") else "itemetri-desktop"
    exe_path = dist_dir / exe_name if onefile else dist_dir / "itemetri-desktop" / exe_name
    if not exe_path.is_file():
        raise RuntimeError(f"Expected bundled executable at {exe_path}.")
    _run([str(exe_path), "--check"])


def build_nuitka_bundle(*, onefile: bool = False) -> None:
    dist_dir = ROOT_DIR / "dist" / "nuitka"
    dist_dir.mkdir(parents=True, exist_ok=True)
    entry_path = ROOT_DIR / "packaging" / "nuitka_entry.py"
    icon_path = ROOT_DIR / "assets" / "itemetri.ico"
    static_src = ROOT_DIR / "src" / "itemetri" / "web" / "static"
    templates_src = ROOT_DIR / "src" / "itemetri" / "io" / "templates"
    exe_name = "itemetri-desktop.exe" if sys.platform.startswith("win") else "itemetri-desktop"

    cmd = [
        "uv",
        "run",
        "python",
        "-m",
        "nuitka",
        "--standalone",
        "--assume-yes-for-downloads",
        f"--output-dir={dist_dir}",
        f"--output-filename={exe_name}",
        f"--include-data-dir={static_src}=itemetri/web/static",
        f"--include-data-dir={templates_src}=itemetri/io/templates",
        "--include-package=uvicorn",
        "--include-package=scipy.special",
        "--include-module=python_multipart",
        "--nofollow-import-to=pytest",
        "--nofollow-import-to=hypothesis",
        "--nofollow-import-to=mypy",
        "--nofollow-import-to=ruff",
        "--nofollow-import-to=tkinter",
        "--nofollow-import-to=pygments",
        "--nofollow-import-to=rich",
        "--nofollow-import-to=opentelemetry",
        "--nofollow-import-to=websockets",
        "--nofollow-import-to=watchfiles",
        "--nofollow-import-to=yaml",
        "--no-deployment-flag=excluded-module-usage",
    ]
    if onefile:
        cmd.append("--onefile")
    if sys.platform.startswith("win"):
        cmd.append("--windows-console-mode=attach")
        if icon_path.is_file():
            cmd.append(f"--windows-icon-from-ico={icon_path}")
    cmd.append(str(entry_path))

    _run(cmd)
    exe_path = dist_dir / exe_name if onefile else dist_dir / "nuitka_entry.dist" / exe_name
    if not exe_path.is_file():
        raise RuntimeError(f"Expected Nuitka executable at {exe_path}.")
    _run([str(exe_path), "--check"])


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build Itemetri wheel, sdist, and desktop bundle.")
    parser.add_argument("--skip-frontend", action="store_true", help="Skip Vite frontend build.")
    parser.add_argument("--skip-wheel", action="store_true", help="Skip uv build wheel/sdist.")
    parser.add_argument(
        "--bundle-exe",
        action="store_true",
        help="Build standalone desktop bundle and verify --check.",
    )
    parser.add_argument(
        "--bundler",
        choices=("pyinstaller", "nuitka"),
        default="pyinstaller",
        help="Desktop bundler to invoke with --bundle-exe (default: pyinstaller).",
    )
    parser.add_argument(
        "--onefile",
        action="store_true",
        help="Produce a single-file executable when using --bundler nuitka.",
    )
    parser.add_argument(
        "--onedir",
        action="store_true",
        help="Produce a directory bundle instead of a single-file executable (PyInstaller).",
    )
    args = parser.parse_args(argv)

    if not args.skip_frontend:
        build_frontend()
    if not args.skip_wheel:
        build_python_artifacts()
    if args.bundle_exe:
        if args.bundler == "nuitka":
            build_nuitka_bundle(onefile=bool(args.onefile))
        else:
            build_pyinstaller_bundle(onefile=not bool(args.onedir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
