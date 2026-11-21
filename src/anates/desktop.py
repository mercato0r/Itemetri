from __future__ import annotations

import argparse
import importlib
import json
import multiprocessing
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import uvicorn

from anates.web import create_app

_LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _probe_url(url: str, *, timeout: float = 1.0) -> tuple[int, str]:
    with _LOCAL_OPENER.open(url, timeout=timeout) as response:
        status = int(response.status)
        body = bytes(response.read()).decode("utf-8", errors="replace")
        return (status, body)


def _bind_loopback_socket(host: str, port: int) -> tuple[socket.socket, int]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if port != 0:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.listen(128)
        sock.setblocking(False)
        actual_port = int(sock.getsockname()[1])
        return (sock, actual_port)
    except Exception:
        sock.close()
        raise


def _wait_for_health(
    base_url: str,
    server_thread: threading.Thread,
    *,
    timeout_sec: float = 15.0,
) -> dict[str, object]:
    deadline = time.monotonic() + timeout_sec
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if not server_thread.is_alive():
            raise RuntimeError("Server exited unexpectedly before passing health check.")
        try:
            status, body = _probe_url(f"{base_url}/api/health", timeout=1.0)
            if status == 200:
                payload = json.loads(body)
                if isinstance(payload, dict) and payload.get("status") == "ok":
                    return payload
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
            last_error = exc
        time.sleep(0.05)
    raise TimeoutError(f"Timed out waiting for {base_url}/api/health: {last_error}")


def _open_when_ready(base_url: str, *, stop_event: threading.Event) -> None:
    deadline = time.monotonic() + 10.0
    while not stop_event.is_set() and time.monotonic() < deadline:
        try:
            status, _ = _probe_url(f"{base_url}/api/health", timeout=0.5)
            if status == 200:
                webbrowser.open(base_url)
                return
        except (OSError, urllib.error.URLError):
            pass
        stop_event.wait(0.1)


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="itemetri-desktop",
        description="Itemetri: analisis kualitas instrumen evaluasi pembelajaran.",
    )
    parser.add_argument(
        "file",
        nargs="?",
        type=Path,
        default=None,
        help="Optional .ana, .csv, or .xlsx file to open at startup.",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host interface to bind (default: 127.0.0.1).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="TCP port to bind (default: 0 for an ephemeral free port).",
    )
    parser.add_argument(
        "--samples-dir",
        type=Path,
        default=None,
        help="Optional directory containing .ana/.ANA sample files.",
    )
    parser.add_argument(
        "--browser",
        action="store_true",
        help="Launch in system web browser instead of native webview wrapper.",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Start the local server without opening a window or browser.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Boot ephemeral server, verify /api/health and /, shut down cleanly, and exit.",
    )
    return parser.parse_args(argv)


def _try_run_webview(
    base_url: str,
    server: uvicorn.Server,
    server_thread: threading.Thread,
) -> bool:
    try:
        webview_mod: Any = importlib.import_module("webview")
    except ImportError:
        return False

    _wait_for_health(base_url, server_thread)
    webview_mod.create_window(
        "Itemetri - Analisis Kualitas Instrumen Evaluasi Pembelajaran",
        base_url,
        width=1360,
        height=860,
        min_size=(920, 600),
    )
    webview_mod.start()
    server.should_exit = True
    return True


def main(argv: Sequence[str] | None = None) -> int:
    """Run Itemetri desktop workbench launcher, webview wrapper, or self-check."""
    multiprocessing.freeze_support()
    args = _parse_args(argv)

    startup_path: Path | None = args.file
    web_app = create_app(samples_dir=args.samples_dir, startup_exam_path=startup_path)
    sock, actual_port = _bind_loopback_socket(str(args.host), int(args.port))
    client_host = "127.0.0.1" if args.host in ("0.0.0.0", "") else str(args.host)
    base_url = f"http://{client_host}:{actual_port}"

    config = uvicorn.Config(
        web_app,
        host=str(args.host),
        port=actual_port,
        log_level="warning",
        log_config=None,
    )
    server = uvicorn.Server(config)

    if args.check:
        thread = threading.Thread(
            target=server.run,
            kwargs={"sockets": [sock]},
            daemon=True,
        )
        thread.start()
        try:
            health = _wait_for_health(base_url, thread)
            index_status, index_html = _probe_url(f"{base_url}/", timeout=2.0)
            if index_status != 200 or "Itemetri" not in index_html:
                raise RuntimeError(
                    f"SPA index check failed at {base_url}/ (status={index_status})."
                )
            version = health.get("version", "unknown")
            print(f"OK {base_url} status=ok version={version}")
            return 0
        finally:
            server.should_exit = True
            thread.join(timeout=5.0)
            sock.close()

    if not args.no_open and not args.browser:
        server_thread = threading.Thread(
            target=server.run,
            kwargs={"sockets": [sock]},
            daemon=True,
        )
        server_thread.start()
        try:
            used_webview = _try_run_webview(base_url, server, server_thread)
        except Exception as exc:
            print(
                f"Warning: native pywebview failed ({exc}); falling back to system browser.",
                file=sys.stderr,
            )
            used_webview = False
        if used_webview:
            server.should_exit = True
            server_thread.join(timeout=5.0)
            sock.close()
            return 0
        # If pywebview is absent, open browser and wait for the running server thread.
        print(f"Itemetri running at {base_url} (Ctrl+C to stop)")
        webbrowser.open(base_url)
        try:
            while server_thread.is_alive():
                server_thread.join(timeout=0.5)
        except KeyboardInterrupt:
            server.should_exit = True
            server_thread.join(timeout=5.0)
        finally:
            sock.close()
        return 0

    stop_event = threading.Event()
    if not args.no_open:
        watcher = threading.Thread(
            target=_open_when_ready,
            args=(base_url,),
            kwargs={"stop_event": stop_event},
            daemon=True,
        )
        watcher.start()

    print(f"Itemetri running at {base_url} (Ctrl+C to stop)")
    try:
        server.run(sockets=[sock])
    finally:
        stop_event.set()
        sock.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
