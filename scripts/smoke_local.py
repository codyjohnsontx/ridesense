from __future__ import annotations

import contextlib
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import IO
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BACKEND_PYTHON = ROOT / "backend" / ".venv" / "bin" / "python"


@dataclass
class ManagedProcess:
    proc: subprocess.Popen[str]
    stdout_path: Path
    stderr_path: Path
    stdout_file: IO[str]
    stderr_file: IO[str]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_url(url: str, timeout: float = 45) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urlopen(url, timeout=2) as response:
                if 200 <= response.status < 400:
                    return
        except (TimeoutError, URLError) as exc:
            last_error = exc
        time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for {url}: {last_error}")


def start_process(cmd: list[str], env: dict[str, str], cwd: Path) -> ManagedProcess:
    stdout_handle: IO[str] = tempfile.NamedTemporaryFile(mode="w+", encoding="utf-8", delete=False)
    stderr_handle: IO[str] = tempfile.NamedTemporaryFile(mode="w+", encoding="utf-8", delete=False)
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            text=True,
            stdout=stdout_handle,
            stderr=stderr_handle,
            start_new_session=True,
        )
    except Exception:
        stdout_path = stdout_handle.name
        stderr_path = stderr_handle.name
        stdout_handle.close()
        stderr_handle.close()
        with contextlib.suppress(FileNotFoundError):
            os.unlink(stdout_path)
        with contextlib.suppress(FileNotFoundError):
            os.unlink(stderr_path)
        raise
    return ManagedProcess(
        proc=proc,
        stdout_path=Path(stdout_handle.name),
        stderr_path=Path(stderr_handle.name),
        stdout_file=stdout_handle,
        stderr_file=stderr_handle,
    )


def stop_process(managed: ManagedProcess) -> None:
    proc = managed.proc
    if proc.poll() is None:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(proc.pid, signal.SIGKILL)
            proc.wait(timeout=8)
    with contextlib.suppress(Exception):
        managed.stdout_file.close()
    with contextlib.suppress(Exception):
        managed.stderr_file.close()


def dump_recent_output(name: str, managed: ManagedProcess) -> None:
    for stream, path in (("stdout", managed.stdout_path), ("stderr", managed.stderr_path)):
        with contextlib.suppress(Exception):
            output = path.read_text(encoding="utf-8")
            if output:
                print(f"\n{name} {stream}:\n{output[-4000:]}", file=sys.stderr)


def cleanup_logs(*managed_processes: ManagedProcess) -> None:
    for managed in managed_processes:
        with contextlib.suppress(FileNotFoundError):
            managed.stdout_path.unlink()
        with contextlib.suppress(FileNotFoundError):
            managed.stderr_path.unlink()


def stop_and_cleanup(*managed_processes: ManagedProcess) -> None:
    for managed in reversed(managed_processes):
        stop_process(managed)
    cleanup_logs(*managed_processes)


def main() -> int:
    if not BACKEND_PYTHON.exists():
        print(f"Missing backend venv Python: {BACKEND_PYTHON}", file=sys.stderr)
        return 1
    if shutil.which("pnpm") is None:
        print("Missing pnpm in PATH.", file=sys.stderr)
        return 1

    backend_port = free_port()
    frontend_port = free_port()

    with tempfile.TemporaryDirectory(prefix="ridesense-smoke-") as tmp:
        db_path = Path(tmp) / "app.db"
        backend_url = f"http://127.0.0.1:{backend_port}"
        frontend_url = f"http://127.0.0.1:{frontend_port}"
        env = os.environ.copy()
        env.update(
            {
                "PYTHONPATH": str(ROOT / "backend"),
                "APP_ENV": "smoke",
                "APP_SECRET_KEY": "smoke-secret",
                "DATABASE_URL": f"sqlite:///{db_path}",
                "FRONTEND_ORIGIN": frontend_url,
                "DEV_AUTH_ENABLED": "true",
                "NEXT_PUBLIC_API_URL": backend_url,
                "NEXT_PUBLIC_SUPABASE_URL": "",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY": "",
                "OPENAI_API_KEY": "",
                "STRAVA_CLIENT_ID": "",
                "STRAVA_CLIENT_SECRET": "",
            }
        )

        subprocess.run(
            [str(BACKEND_PYTHON), str(ROOT / "backend" / "scripts_seed_demo.py")],
            cwd=ROOT,
            env=env,
            check=True,
        )

        print(f"Starting backend on {backend_url}", flush=True)
        started_processes: list[ManagedProcess] = []

        try:
            backend = start_process(
                [
                    str(BACKEND_PYTHON),
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(backend_port),
                ],
                env,
                ROOT / "backend",
            )
            started_processes.append(backend)
            print(f"Starting frontend on {frontend_url}", flush=True)
            frontend = start_process(
                ["pnpm", "dev", "--hostname", "127.0.0.1", "--port", str(frontend_port)],
                env,
                ROOT / "frontend",
            )
            started_processes.append(frontend)

            print("Waiting for servers...", flush=True)
            wait_for_url(f"{backend_url}/health")
            wait_for_url(frontend_url, timeout=60)

            print("Running browser smoke...", flush=True)
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                page.goto(frontend_url, wait_until="networkidle")

                expect(page.get_by_role("heading", name="State of training")).to_be_visible()
                expect(page.get_by_text("Form / fitness curve")).to_be_visible()
                expect(page.get_by_text("Window load")).to_be_visible()

                page.get_by_role("tab", name="4w").click()
                expect(page.get_by_text("Last 4w")).to_be_visible()

                nav = page.get_by_role("navigation")

                nav.get_by_role("button", name="Activities").click()
                expect(page.get_by_role("heading", name="Activities")).to_be_visible()
                expect(page.locator("tbody tr")).to_have_count(13)

                nav.get_by_role("button", name="Ask").click()
                page.get_by_role("textbox").fill("How is my load trending over this range?")
                page.get_by_role("button", name="Ask").last.click()
                expect(page.get_by_role("heading", name="Answer")).to_be_visible(timeout=10000)
                expect(page.get_by_text("metrics cited")).to_be_visible()

                nav.get_by_role("button", name="Profile").click()
                expect(page.get_by_role("heading", name="Profile")).to_be_visible()
                page.get_by_label("Goals").fill("Smoke test goal: build durable endurance.")
                page.get_by_role("button", name="Save context").click()
                expect(page.get_by_text("Athlete context saved.")).to_be_visible(timeout=10000)

                nav.get_by_role("button", name="Connections").click()
                expect(page.get_by_role("heading", name="Connections")).to_be_visible()
                expect(page.get_by_role("button", name="Strava not configured")).to_be_disabled()
                expect(page.get_by_role("button", name="TrainerRoad scaffolded")).to_be_visible()
                page.get_by_role("button", name="Sync all").click()
                expect(page.get_by_text("Imported 0 Strava and 0 TrainerRoad activities.").first).to_be_visible(
                    timeout=10000
                )
                expect(page.get_by_text("completed")).to_be_visible(timeout=10000)

                browser.close()

            print(f"Smoke passed: {frontend_url}")
            return 0
        except Exception:
            for name, managed in zip(("backend", "frontend"), started_processes):
                dump_recent_output(name, managed)
            raise
        finally:
            stop_and_cleanup(*started_processes)


if __name__ == "__main__":
    raise SystemExit(main())
